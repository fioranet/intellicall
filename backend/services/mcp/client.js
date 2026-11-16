/**
 * Connecting to a user's MCP server, and reading what tools it offers.
 */
const { requestHeaders } = require('./credentials');
const { StoredOAuthProvider } = require('./oauth-provider');
const { safeFetch, UnsafeUrlError } = require('../../utils/safe-fetch');
/** The product name shown to OAuth providers and MCP servers. Sync: used inside getters. */
const appName = () => process.env.APP_NAME || 'IntelliCall AI';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { UnauthorizedError } = require('@modelcontextprotocol/sdk/client/auth.js');
const McpServer = require('../../models/McpServer');

/** Tools beyond this are dropped from the snapshot. No voice agent needs a hundred. */
const MAX_TOOLS_PER_SERVER = 100;
const DISCOVERY_TIMEOUT_MS = 15_000;

function isUnauthorized(err) {
    return err instanceof UnauthorizedError;
}

/**
 * Open a connection, trying Streamable HTTP and then the older SSE transport
 * when the server's transport is `auto`.
 *
 * Auth failures and refused URLs are rethrown at once rather than retried on
 * the other transport: neither is going to change by asking differently.
 *
 * @param {object} doc the McpServer document
 * @param {{timeoutMs: number, authProvider?: StoredOAuthProvider}} opts
 * @returns {Promise<{client: any, transport: 'streamable_http' | 'sse'}>}
 */
async function connectMcp(doc, opts) {
    const headers = requestHeaders(doc);
    const authProvider = doc.authType === 'oauth'
        ? (opts.authProvider || new StoredOAuthProvider(doc))
        : undefined;

    const kinds = doc.transport !== 'auto'
        ? [doc.transport]
        : doc.detectedTransport === 'sse' ? ['sse', 'streamable_http'] : ['streamable_http', 'sse'];

    let lastErr;
    for (const kind of kinds) {
        const client = new Client({ name: appName().toLowerCase().replace(/\s+/g, '-'), version: '1.0.0' }, { capabilities: {} });
        const transportOpts = {
            fetch: safeFetch,
            requestInit: { headers },
            ...(authProvider ? { authProvider } : {}),
        };
        const url = new URL(doc.url);
        const transport = kind === 'sse'
            ? new SSEClientTransport(url, transportOpts)
            : new StreamableHTTPClientTransport(url, transportOpts);
        try {
            await client.connect(transport, { timeout: opts.timeoutMs });
            if (doc.transport === 'auto' && doc.detectedTransport !== kind) {
                doc.detectedTransport = kind;
                // A preview (previewTools) runs on a document that was never saved.
                if (doc._id) McpServer.updateOne({ _id: doc._id }, { $set: { detectedTransport: kind } }).catch(() => undefined);
            }
            return { client, transport: kind };
        } catch (err) {
            await client.close().catch(() => undefined);
            lastErr = err;
            if (isUnauthorized(err) || err instanceof UnsafeUrlError) throw err;
        }
    }
    throw lastErr;
}

/** Connect, read `tools/list` (every page, up to the cap), and disconnect. */
async function discoverTools(doc) {
    const { client } = await connectMcp(doc, { timeoutMs: DISCOVERY_TIMEOUT_MS });
    try {
        const tools = [];
        let cursor;
        do {
            const page = await client.listTools(cursor ? { cursor } : {}, { timeout: DISCOVERY_TIMEOUT_MS });
            for (const t of page.tools || []) {
                if (tools.length >= MAX_TOOLS_PER_SERVER) break;
                tools.push({
                    name: t.name,
                    title: t.title ?? (t.annotations && t.annotations.title) ?? null,
                    description: (t.description || '').slice(0, 2000),
                    inputSchema: t.inputSchema || null,
                    annotations: t.annotations || null,
                });
            }
            cursor = page.nextCursor;
        } while (cursor && tools.length < MAX_TOOLS_PER_SERVER);

        const info = client.getServerVersion();
        return { tools, serverInfo: { name: (info && info.name) || null, version: (info && info.version) || null } };
    } finally {
        await client.close().catch(() => undefined);
    }
}

/**
 * Turn a connection failure into something the owner can act on.
 * @returns {{status: 'needs_auth' | 'error', message: string}}
 */
function describeFailure(doc, err) {
    const needsSignIn = `This server needs you to sign in. Connect it to authorise ${appName()}.`;
    const refused = 'The server refused the request (401). Check the headers, or switch this server to OAuth if it uses sign-in.';
    if (isUnauthorized(err)) {
        return doc.authType === 'oauth' ? { status: 'needs_auth', message: needsSignIn } : { status: 'error', message: refused };
    }
    if (err instanceof UnsafeUrlError) return { status: 'error', message: `URL not allowed: ${err.message}` };
    if (/\b401\b/.test(String((err && err.message) || ''))) {
        return doc.authType === 'oauth' ? { status: 'needs_auth', message: needsSignIn } : { status: 'error', message: refused };
    }

    const cause = err && err.cause && err.cause.code;
    if (cause === 'ENOTFOUND') return { status: 'error', message: 'The server name does not resolve. Check the URL.' };
    if (cause === 'ECONNREFUSED') return { status: 'error', message: 'The server refused the connection.' };
    if (cause === 'CERT_HAS_EXPIRED' || (typeof cause === 'string' && cause.startsWith('ERR_TLS')) || cause === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        return { status: 'error', message: 'The server\'s TLS certificate is not valid.' };
    }
    // McpError -32001 is the SDK's request timeout.
    if ((err && err.code === -32001) || /timed? ?out/i.test((err && err.message) || '')) {
        return { status: 'error', message: 'The server did not answer in time.' };
    }
    const msg = String((err && err.message) || err || 'Unknown error').slice(0, 300);
    return { status: 'error', message: `Could not connect: ${msg}` };
}

/**
 * Read a server's tools without saving anything. An OAuth server nobody has
 * signed in to cannot be read at all, and an unreachable one is a status, not
 * a thrown error.
 */
async function previewTools(doc) {
    if (doc.authType === 'oauth' && !(doc.oauth && doc.oauth.tokensEncrypted)) {
        return { status: 'needs_auth', tools: [], serverInfo: null, lastError: 'This server lists its tools only after you sign in.' };
    }
    try {
        const { tools, serverInfo } = await discoverTools(doc);
        return { status: 'ready', tools, serverInfo, lastError: null };
    } catch (err) {
        const { status, message } = describeFailure(doc, err);
        return { status, tools: [], serverInfo: null, lastError: message };
    }
}

/**
 * Re-read a server's tools and store the result on its document.
 * Never throws for a server that cannot be reached. Returns the updated document.
 */
async function refreshServer(doc) {
    try {
        const { tools, serverInfo } = await discoverTools(doc);
        const names = new Set(tools.map((t) => t.name));

        let enabled = doc.enabledTools || [];
        if (!doc.enabledToolsInitialised) {
            // First discovery chooses for the owner, and chooses only what cannot
            // change anything: tools the server itself marks read-only.
            enabled = tools.filter((t) => t.annotations && t.annotations.readOnlyHint === true).map((t) => t.name);
        }
        // Tools the server no longer offers fall out of the allowlist.
        enabled = enabled.filter((n) => names.has(n));

        const set = {
            tools,
            serverInfo,
            toolsRefreshedAt: new Date(),
            enabledTools: enabled,
            enabledToolsInitialised: true,
            status: 'ready',
            lastError: null,
        };
        return await McpServer.findOneAndUpdate({ _id: doc._id }, { $set: set }, { returnDocument: 'after' }).lean();
    } catch (err) {
        const { status, message } = describeFailure(doc, err);
        return await McpServer.findOneAndUpdate(
            { _id: doc._id },
            { $set: { status, lastError: message } },
            { returnDocument: 'after' },
        ).lean();
    }
}

module.exports = { connectMcp, discoverTools, describeFailure, previewTools, refreshServer, isUnauthorized, MAX_TOOLS_PER_SERVER };
