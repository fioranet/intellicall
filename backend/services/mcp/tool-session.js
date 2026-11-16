/**
 * One call's access to the MCP servers its agent is attached to.
 *
 * Built at call setup from each server's stored tool snapshot, so declaring the
 * tools to the model costs no network round trip and never delays the greeting.
 * The connections themselves are opened in the background as the call starts
 * (warm()) and reused for every tool call after that.
 *
 * Only tools on the server's allowlist are ever declared, and call() refuses
 * any name it did not declare, so a model cannot reach a tool the owner left
 * switched off by guessing its name.
 */
const { createHash } = require('crypto');
const { connectMcp, isUnauthorized } = require('./client');
const { toGeminiParameters, toOpenAiParameters } = require('../tools/schema-adapt');

const McpServer = require('../../models/McpServer');
const CallLog = require('../../models/CallLog');

const MAX_TOOLS_PER_AGENT = 40;
const MAX_TOOL_CALLS_PER_CALL = 20;
const CONNECT_TIMEOUT_MS = 8_000;
/** Per tool call. Overridable because some servers are slower than a caller will wait. */
const callTimeoutMs = () => Number(process.env.MCP_TOOL_TIMEOUT_MS) || 10_000;
/** Characters of tool output handed back to the model. */
const MAX_RESULT_CHARS = 4_000;
const MAX_ARG_STRING = 200;
const MAX_NAME = 64;

const slug = (s, max) => {
    const out = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max);
    return out || 'app';
};

function modelFacingName(server, tool, taken) {
    let base = `${slug(server, 20)}__${tool.replace(/[^a-zA-Z0-9_]+/g, '_')}`;
    // Gemini wants a letter or underscore first.
    if (!/^[a-zA-Z_]/.test(base)) base = `app_${base}`;
    let name = base.length > MAX_NAME
        ? `${base.slice(0, MAX_NAME - 7)}_${createHash('sha1').update(base).digest('hex').slice(0, 6)}`
        : base;
    for (let i = 2; taken.has(name); i++) name = `${name.slice(0, MAX_NAME - 3)}_${i}`;
    taken.add(name);
    return name;
}

/** Short string values only, so a record cannot become a copy of the caller's data. */
function truncateArgs(args) {
    const walk = (v, depth) => {
        if (typeof v === 'string') return v.length > MAX_ARG_STRING ? `${v.slice(0, MAX_ARG_STRING)}…` : v;
        if (depth > 3) return '…';
        if (Array.isArray(v)) return v.slice(0, 20).map((x) => walk(x, depth + 1));
        if (v && typeof v === 'object') {
            return Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [k, walk(x, depth + 1)]));
        }
        return v;
    };
    try { return walk(args, 0); } catch { return null; }
}

/** The text a model can use, from the content blocks a tool returned. */
function resultText(result) {
    const parts = [];
    for (const block of result.content || []) {
        if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
        else if (block.type === 'resource' && block.resource && typeof block.resource.text === 'string') parts.push(block.resource.text);
        else if (block.type === 'image' || block.type === 'audio') parts.push(`[${block.type} omitted]`);
    }
    let text = parts.join('\n').trim();
    if (!text && result.structuredContent !== undefined) text = JSON.stringify(result.structuredContent);
    if (!text) text = result.isError ? 'The tool reported an error.' : 'Done. The tool returned no details.';
    return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (truncated)` : text;
}

class McpToolSession {
    constructor(servers, tools) {
        this.records = [];
        this.servers = servers;
        this.tools = tools;
        this.byName = new Map();
        this.clients = new Map();
        this.closed = false;
        this.persisted = false;
        for (const t of tools) this.byName.set(t.name, t);
    }

    /**
     * The session for this agent, or null when it has no usable tools, in which
     * case nothing about the call changes at all.
     */
    static async forAgent(agent, userId) {
        const ids = ((agent && agent.mcpServerIds) || []).map(String);
        if (ids.length === 0 || !userId) return null;

        const docs = await McpServer.find({ _id: { $in: ids }, createdBy: userId, status: 'ready' }).lean();
        // The agent's order, so the tool cap drops the server the owner listed last.
        docs.sort((a, b) => ids.indexOf(String(a._id)) - ids.indexOf(String(b._id)));

        const taken = new Set();
        const tools = [];
        const servers = new Map();
        for (const doc of docs) {
            const enabled = new Set(doc.enabledTools || []);
            for (const t of doc.tools || []) {
                if (!enabled.has(t.name) || tools.length >= MAX_TOOLS_PER_AGENT) continue;
                const hint = t.annotations ? t.annotations.readOnlyHint : undefined;
                const readOnly = hint === true;
                const base = (t.description || t.title || t.name).slice(0, 900);
                // What the server declared decides what the agent is told. A tool it
                // marks as writing always needs the caller's yes; one it does not
                // mark at all (many servers mark nothing) might, so the agent is
                // asked to judge rather than to confirm every lookup.
                const caution = readOnly ? ''
                    : hint === false ? ` This changes data in ${doc.name}; confirm with the caller before using it.`
                        : ` If this would change anything in ${doc.name}, confirm with the caller first.`;
                tools.push({
                    name: modelFacingName(doc.name, t.name, taken),
                    serverId: String(doc._id),
                    serverName: doc.name,
                    toolName: t.name,
                    description: `[${doc.name}] ${base}${caution}`,
                    inputSchema: t.inputSchema || null,
                    readOnly,
                });
                servers.set(String(doc._id), doc);
            }
        }
        return tools.length > 0 ? new McpToolSession(servers, tools) : null;
    }

    /** The app names, for the system prompt. */
    appNames() {
        return [...new Set(this.tools.map((t) => t.serverName))];
    }

    has(name) {
        return this.byName.has(name);
    }

    geminiDeclarations() {
        return this.tools.map((t) => {
            const parameters = toGeminiParameters(t.inputSchema);
            return { name: t.name, description: t.description, ...(parameters ? { parameters } : {}) };
        });
    }

    openAiTools() {
        return this.tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: toOpenAiParameters(t.inputSchema) },
        }));
    }

    deepgramFunctions() {
        return this.tools.map((t) => ({ name: t.name, description: t.description, parameters: toOpenAiParameters(t.inputSchema) }));
    }

    /** Open every connection now, so the first tool call does not pay for the handshake. */
    warm() {
        for (const id of this.servers.keys()) this.client(id).catch(() => undefined);
    }

    client(serverId) {
        let p = this.clients.get(serverId);
        if (!p) {
            const doc = this.servers.get(serverId);
            p = connectMcp(doc, { timeoutMs: CONNECT_TIMEOUT_MS }).then((c) => c.client);
            // A failed connect is not cached: the next tool call tries again.
            p.catch(() => this.clients.delete(serverId));
            this.clients.set(serverId, p);
        }
        return p;
    }

    /**
     * Run a tool and return what the model should hear about it. Never throws.
     * @param {string} name
     * @param {unknown} args
     * @param {{signal?: AbortSignal}} [opts]
     */
    async call(name, args, opts = {}) {
        const tool = this.byName.get(name);
        if (!tool) return `There is no tool called ${name}. Carry on without it.`;
        if (this.closed) return 'The call is ending; the tool was not run.';
        if (this.records.length >= MAX_TOOL_CALLS_PER_CALL) {
            return 'No more app actions can be taken on this call. Tell the caller someone will follow up, and carry on.';
        }

        const argObj = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
        const started = Date.now();
        const record = {
            type: 'integration',
            mcpServerId: tool.serverId,
            serverName: tool.serverName,
            tool: tool.toolName,
            arguments: truncateArgs(argObj),
            ok: false,
            error: null,
            durationMs: 0,
            at: new Date(started),
        };
        this.records.push(record);

        try {
            const client = await this.client(tool.serverId);
            const result = await client.callTool(
                { name: tool.toolName, arguments: argObj },
                undefined,
                { timeout: callTimeoutMs(), ...(opts.signal ? { signal: opts.signal } : {}) },
            );
            const text = resultText(result);
            record.ok = !result.isError;
            if (result.isError) {
                record.error = text.slice(0, 300);
                return `${tool.serverName} could not do that: ${text.slice(0, 500)} Tell the caller briefly and carry on.`;
            }
            return text;
        } catch (err) {
            const timedOut = (err && err.code === -32001) || /timed? ?out/i.test((err && err.message) || '');
            record.error = isUnauthorized(err)
                ? 'not authorised (sign-in expired or refused)'
                : timedOut ? 'timed out' : String((err && err.message) || err).slice(0, 300);
            console.warn(`[mcp] ${tool.serverName}/${tool.toolName} failed: ${record.error}`);
            return timedOut
                ? `${tool.serverName} did not respond in time. Tell the caller you could not check right now, and carry on.`
                : `${tool.serverName} could not be reached. Tell the caller you could not do that right now, and carry on.`;
        } finally {
            record.durationMs = Date.now() - started;
        }
    }

    /** Close every connection. Safe to call twice. */
    async close() {
        if (this.closed) return;
        this.closed = true;
        const pending = [...this.clients.values()];
        this.clients.clear();
        await Promise.all(pending.map((p) => p.then((c) => c.close()).catch(() => undefined)));
    }

    /** Append this call's tool records to its CallLog. */
    async persist(callSid) {
        if (this.persisted || this.records.length === 0 || !callSid) return;
        this.persisted = true;
        await CallLog.updateOne(
            { callSid },
            { $push: { toolCalls: { $each: this.records.map((r) => ({ ...r })) } } },
        ).catch((err) => console.error('[mcp] could not save tool calls:', err.message));
    }

    async finish(callSid) {
        await this.close();
        await this.persist(callSid);
    }
}

module.exports = { McpToolSession, MAX_TOOLS_PER_AGENT, MAX_TOOL_CALLS_PER_CALL, resultText };
