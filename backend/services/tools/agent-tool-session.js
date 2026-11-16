/**
 * Everything one call's agent can call beyond its built-ins: the account's own
 * webhook tools (models/Tool.js), its connected apps' tools (MCP servers,
 * services/mcp/tool-session.js) and the built-in WhatsApp tools it has turned
 * on (services/whatsapp/agent-tools.js).
 *
 * One surface for every engine, so no bridge needs to know a tool's kind:
 * declarations per engine (openAiTools / geminiDeclarations / deepgramFunctions),
 * has(), and a call() that never throws and always returns text for the model.
 *
 * The account's own tools are listed first, so the overall cap of 40 drops the
 * integration tools the owner listed last, not their own. The WhatsApp built-ins
 * come before both, and a tool named like a built-in is dropped: the built-in wins.
 *
 * Records of what ran are pushed to CallLog.toolCalls at the end (persist()).
 */

const Tool = require('../../models/Tool');
const CallLog = require('../../models/CallLog');
const { ensureWebhookSecret } = require('../webhook-secret');
const { toGeminiParameters, toOpenAiParameters } = require('./schema-adapt');
const { runWebhookTool, MAX_RESULT_CHARS } = require('./webhook-runner');

const MAX_OWN_TOOLS_PER_AGENT = 20;
/** Own tools plus integration tools declared to the model, in all. */
const MAX_TOOLS_PER_AGENT = 40;
/** Tool calls one call may make, across every kind. */
const MAX_TOOL_CALLS_PER_CALL = 20;
const MAX_ARG_STRING = 200;

/** A module that lands in a later release; absent means the feature is off. */
function optional(path) {
    try { return require(path); } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND' && String(err.message).includes(path.split('/').pop())) return null;
        throw err;
    }
}

/** Short string values only, so a record cannot become a copy of the caller's data. */
function truncateArgs(args) {
    const walk = (v, depth) => {
        if (typeof v === 'string') return v.length > MAX_ARG_STRING ? `${v.slice(0, MAX_ARG_STRING)}…` : v;
        if (depth > 3) return '…';
        if (Array.isArray(v)) return v.slice(0, 20).map((x) => walk(x, depth + 1));
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [k, walk(x, depth + 1)]));
        return v;
    };
    try { return walk(args, 0); } catch { return null; }
}

const argObject = (args) => (args && typeof args === 'object' && !Array.isArray(args) ? args : {});

class AgentToolSession {
    /**
     * @param {Array<object>} own the account's Tool docs (`.lean()`), in the agent's order
     * @param {object | null} mcp a McpToolSession, when the agent has connected apps
     * @param {{agentId: string | null, userId: string, callId?: string | null}} ctx
     * @param {object | null} [whatsapp] a WhatsAppToolkit, when the agent has WhatsApp tools here
     */
    constructor(own, mcp, ctx, whatsapp = null) {
        this.records = [];
        this.mcp = mcp;
        this.ctx = ctx;
        this.whatsapp = whatsapp;
        this.secret = null;
        this.closed = false;
        this.persisted = false;
        const builtIn = new Set(whatsapp ? whatsapp.names() : []);
        this.own = new Map(own.filter((t) => !builtIn.has(t.name)).map((t) => [t.name, t]));
    }

    /**
     * The session for this agent, or null when it has nothing to offer, in which
     * case nothing about the call changes at all.
     *
     * @param {object | null | undefined} agent
     * @param {unknown} userId
     * @param {{whatsapp?: object | null}} [opts] a WhatsApp tool context
     *   (`{channel: 'call' | 'chat', phone, callSid?, leadId?, conversationId?, contactId?, accountId?}`)
     */
    static async forAgent(agent, userId, opts = {}) {
        if (!agent || !userId) return null;
        const ids = (agent.toolIds || []).map(String).slice(0, MAX_OWN_TOOLS_PER_AGENT);
        const waCtx = opts.whatsapp || null;

        const mcpMod = optional('../mcp/tool-session');
        const waMod = waCtx ? optional('../whatsapp/agent-tools') : null;
        const wantsWhatsApp = waMod && (waCtx.channel === 'chat' || waMod.wantsWhatsAppTools(agent));

        const [docs, mcp, whatsapp] = await Promise.all([
            ids.length ? Tool.find({ _id: { $in: ids }, createdBy: userId }).lean() : Promise.resolve([]),
            mcpMod && agent.mcpServerIds && agent.mcpServerIds.length
                ? mcpMod.McpToolSession.forAgent(agent, userId).catch((err) => {
                    console.error('[tools] MCP tools unavailable:', err.message);
                    return null;
                })
                : Promise.resolve(null),
            wantsWhatsApp
                ? waMod.buildWhatsAppToolkit(agent, String(userId), waCtx).catch((err) => {
                    console.error('[tools] WhatsApp tools unavailable:', err.message);
                    return null;
                })
                : Promise.resolve(null),
        ]);
        // The agent's order, so its first tools are the ones that survive a cap.
        docs.sort((a, b) => ids.indexOf(String(a._id)) - ids.indexOf(String(b._id)));
        if (docs.length === 0 && !mcp && !whatsapp) return null;
        return new AgentToolSession(docs, mcp, { agentId: agent._id ? String(agent._id) : null, userId: String(userId) }, whatsapp);
    }

    /** The call these tool calls belong to, for the webhook headers. */
    setCallId(callId) {
        this.ctx.callId = callId;
    }

    /** The account's tools, in order, within the cap. */
    ownTools() {
        return [...this.own.values()].filter((t) => t.type === 'webhook' || !t.type);
    }

    /** The WhatsApp tools, as tool docs. */
    whatsappTools() {
        return (this.whatsapp ? this.whatsapp.docs() : []).map((d) => ({ _id: null, name: d.name, type: 'whatsapp', description: d.description, parameters: d.parameters }));
    }

    /** Every own tool to declare: the built-ins first, then the account's. */
    declared() {
        return [...this.whatsappTools(), ...this.ownTools()];
    }

    /** The integration tools that still fit under the overall cap, minus any name an own tool took. */
    mcpTools() {
        if (!this.mcp) return [];
        const room = Math.max(0, MAX_TOOLS_PER_AGENT - this.declared().length);
        return this.mcp.tools.filter((t) => !this.own.has(t.name)).slice(0, room);
    }

    /** Every tool's model-facing name, kind and app, for logs and counts. */
    get tools() {
        return [
            ...this.whatsappTools().map((t) => ({ name: t.name, type: 'whatsapp' })),
            ...this.ownTools().map((t) => ({ name: t.name, type: 'webhook' })),
            ...this.mcpTools().map((t) => ({ name: t.name, type: 'integration' })),
        ];
    }

    appNames() {
        return this.mcp ? this.mcp.appNames() : [];
    }

    has(name) {
        if (this.whatsapp && this.whatsapp.has(name)) return true;
        if (this.own.has(name)) return true;
        return this.mcpTools().some((t) => t.name === name);
    }

    descriptionOf(t) {
        return String(t.description || '').slice(0, 1000);
    }

    geminiDeclarations() {
        const own = this.declared().map((t) => {
            const parameters = toGeminiParameters(t.parameters || null);
            return { name: t.name, description: this.descriptionOf(t), ...(parameters ? { parameters } : {}) };
        });
        const names = new Set(this.mcpTools().map((t) => t.name));
        return [...own, ...(this.mcp ? this.mcp.geminiDeclarations() : []).filter((d) => names.has(String(d.name)))];
    }

    openAiTools() {
        const own = this.declared().map((t) => ({
            type: 'function',
            function: { name: t.name, description: this.descriptionOf(t), parameters: toOpenAiParameters(t.parameters || null) },
        }));
        const names = new Set(this.mcpTools().map((t) => t.name));
        return [...own, ...(this.mcp ? this.mcp.openAiTools() : []).filter((d) => names.has(String(d.function && d.function.name)))];
    }

    deepgramFunctions() {
        const own = this.declared().map((t) => ({ name: t.name, description: this.descriptionOf(t), parameters: toOpenAiParameters(t.parameters || null) }));
        const names = new Set(this.mcpTools().map((t) => t.name));
        return [...own, ...(this.mcp ? this.mcp.deepgramFunctions() : []).filter((d) => names.has(String(d.name)))];
    }

    warm() {
        if (this.mcp) this.mcp.warm();
        if (this.ownTools().length) void this.signingSecret();
    }

    /** The account's webhook signing secret, read (or made) once per call. */
    signingSecret() {
        if (!this.secret) {
            this.secret = ensureWebhookSecret(this.ctx.userId).catch(() => null);
        }
        return this.secret;
    }

    callCount() {
        return this.records.length + (this.mcp ? this.mcp.records.length : 0);
    }

    /**
     * Run a tool and return what the model should hear about it. Never throws.
     * @param {string} name
     * @param {unknown} args
     * @param {{signal?: AbortSignal}} [opts]
     * @returns {Promise<string>}
     */
    async call(name, args, opts = {}) {
        if (this.whatsapp && this.whatsapp.has(name)) return this.runWhatsApp(name, args);
        const own = this.own.get(name);
        if (!own) {
            if (this.mcp && this.mcpTools().some((t) => t.name === name)) {
                if (this.callCount() >= MAX_TOOL_CALLS_PER_CALL) return 'No more actions can be taken on this call. Tell the caller someone will follow up, and carry on.';
                return this.mcp.call(name, args, opts);
            }
            return `There is no tool called ${name}. Carry on without it.`;
        }
        if (this.closed) return 'The call is ending; the tool was not run.';
        if (this.callCount() >= MAX_TOOL_CALLS_PER_CALL) {
            return 'No more actions can be taken on this call. Tell the caller someone will follow up, and carry on.';
        }

        const argObj = argObject(args);
        const started = Date.now();
        const record = {
            type: 'webhook', toolId: own._id, tool: own.name, arguments: truncateArgs(argObj),
            ok: false, error: null, durationMs: 0, at: new Date(started),
        };
        this.records.push(record);

        try {
            const r = await runWebhookTool(own, argObj, {
                callId: this.ctx.callId || null, agentId: this.ctx.agentId, secret: await this.signingSecret(),
                ...(opts.signal ? { signal: opts.signal } : {}),
            });
            record.ok = r.ok;
            record.error = r.error;
            return r.output.length > MAX_RESULT_CHARS ? `${r.output.slice(0, MAX_RESULT_CHARS)}… (truncated)` : r.output;
        } finally {
            record.durationMs = Date.now() - started;
        }
    }

    /** A built-in WhatsApp tool. Never throws. */
    async runWhatsApp(name, args) {
        if (this.closed) return 'The call is ending; nothing was sent.';
        if (this.callCount() >= MAX_TOOL_CALLS_PER_CALL) return 'No more actions can be taken now. Carry on without it.';
        const argObj = argObject(args);
        const started = Date.now();
        const record = {
            type: 'whatsapp', toolId: null, tool: name, arguments: truncateArgs(argObj),
            ok: false, error: null, durationMs: 0, at: new Date(started),
        };
        this.records.push(record);
        try {
            const r = await this.whatsapp.run(name, argObj);
            record.ok = r.ok;
            record.error = r.error;
            return r.output;
        } catch (err) {
            record.error = String(err.message || err).slice(0, 300);
            return 'That could not be sent right now. Carry on without it.';
        } finally {
            record.durationMs = Date.now() - started;
        }
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        if (this.mcp) await this.mcp.close();
    }

    /** Append this call's tool records to its CallLog: the account's own, then the integrations'. */
    async persist(callSid) {
        if (!callSid) return;
        if (!this.persisted && this.records.length > 0) {
            this.persisted = true;
            await CallLog.updateOne(
                { callSid },
                { $push: { toolCalls: { $each: this.records.map((r) => ({ ...r })) } } },
            ).catch((err) => console.error('[tools] could not save tool calls:', err.message));
        }
        if (this.mcp) await this.mcp.persist(callSid);
    }

    async finish(callSid) {
        await this.close();
        await this.persist(callSid);
    }
}

module.exports = { AgentToolSession, MAX_OWN_TOOLS_PER_AGENT, MAX_TOOLS_PER_AGENT, MAX_TOOL_CALLS_PER_CALL, truncateArgs };
