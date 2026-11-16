/**
 * /api/mcp-servers — other apps' tools (remote MCP servers), for agents to use
 * while on a call. Creating one reads its tools, an update merges write-only
 * header values it cannot see, and deleting one detaches it from every agent.
 *
 *   POST /discover          read a server's tools without saving it (connect page preview)
 *   POST /:id/refresh       read the tools again
 *   POST /:id/oauth/start   begin signing in; the browser comes back to /api/mcp-oauth/callback
 */
const express = require('express');
const joi = require('joi');
const { Types } = require('mongoose');
const { auth, requireActivePlan } = require('../middleware/auth');
const checkLimit = require('../middleware/limit-checker');
const McpServer = require('../models/McpServer');
const Agent = require('../models/Agent');
const { assertSafeMcpUrl, UnsafeUrlError } = require('../utils/safe-fetch');
const { seal } = require('../utils/credentials');
const { refreshServer, previewTools } = require('../services/mcp/client');
const { oauthRedirectUri } = require('../services/mcp/oauth-provider');
const { OAuthFlowError, startOAuth } = require('../services/mcp/oauth-flow');

const router = express.Router();

/** Headers the transport sets itself, or that would let a caller tamper with the exchange. */
const RESERVED_HEADERS = new Set([
    'host', 'content-length', 'content-type', 'accept', 'connection', 'transfer-encoding',
    'te', 'upgrade', 'keep-alive', 'proxy-authorization', 'mcp-session-id', 'mcp-protocol-version',
    'last-event-id', 'cookie',
]);

const headerJoi = joi.object({
    name: joi.string().pattern(/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/).required()
        .custom((v, helpers) => (RESERVED_HEADERS.has(v.toLowerCase()) ? helpers.message(`Header "${v}" is set by the protocol and cannot be overridden.`) : v)),
    value: joi.string().min(1).max(4096),
});

const authJoi = joi.object({
    type: joi.string().valid('none', 'headers', 'oauth').default('none'),
    headers: joi.array().items(headerJoi).max(20),
    oauth: joi.object({
        clientId: joi.string().min(1).max(256).allow('', null),
        clientSecret: joi.string().min(1).max(512).allow('', null),
        scope: joi.string().max(1000).allow('', null),
    }),
}).custom((a, helpers) => {
    if (a.type === 'headers' && !(a.headers && a.headers.length)) return helpers.message('Header auth needs at least one header.');
    const seen = new Set();
    for (const h of a.headers || []) {
        const k = h.name.toLowerCase();
        if (seen.has(k)) return helpers.message(`Duplicate header "${h.name}".`);
        seen.add(k);
    }
    if (a.oauth && a.oauth.clientSecret && !a.oauth.clientId) return helpers.message('A client secret needs its client ID.');
    return a;
});

const base = {
    name: joi.string().trim().min(1).max(100),
    url: joi.string().uri({ scheme: ['http', 'https'] }).max(2048),
    transport: joi.string().valid('auto', 'streamable_http', 'sse'),
    auth: authJoi,
    enabledTools: joi.array().items(joi.string().min(1).max(128)).max(100),
};
const createJoi = joi.object({ ...base, name: base.name.required(), url: base.url.required(), transport: base.transport.default('auto') });
const updateJoi = joi.object(base);
const discoverJoi = joi.object({ url: base.url.required(), transport: base.transport.default('auto'), auth: authJoi });

const owned = (req) => ({ createdBy: new Types.ObjectId(String(req.user._id)) });

function fail(res, err) {
    if (err?.isJoi) return res.status(400).json({ status: 'error', message: err.details?.[0]?.message || err.message });
    if (err instanceof OAuthFlowError) return res.status(400).json({ status: 'error', code: err.code, message: err.message });
    const status = err?.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('[mcp-servers]', err);
    return res.status(status).json({ status: 'error', message: status === 500 ? 'Something went wrong.' : err.message });
}

async function assertSafe(url) {
    try {
        await assertSafeMcpUrl(url);
    } catch (err) {
        if (err instanceof UnsafeUrlError) throw Object.assign(new Error(`This URL cannot be used: ${err.message}`), { status: 400 });
        throw err;
    }
}

/** A server as the console sees it: header values, tokens and client secrets never leave the server. */
function toJson(doc) {
    const enabled = new Set(doc.enabledTools || []);
    return {
        _id: String(doc._id),
        name: doc.name,
        url: doc.url,
        transport: doc.transport || 'auto',
        auth: {
            type: doc.authType || 'none',
            headerNames: doc.authType === 'headers' ? (doc.headers || []).map((h) => h.name) : [],
            oauth: doc.authType === 'oauth' ? {
                clientId: doc.oauth?.clientId || null,
                scope: doc.oauth?.scope || null,
                connected: Boolean(doc.oauth?.tokensEncrypted),
                connectedAt: doc.oauth?.connectedAt || null,
            } : null,
        },
        status: doc.status || 'pending',
        lastError: doc.lastError || null,
        serverInfo: doc.serverInfo?.name || doc.serverInfo?.version ? { name: doc.serverInfo.name || null, version: doc.serverInfo.version || null } : null,
        tools: (doc.tools || []).map((t) => ({
            name: t.name,
            title: t.title || null,
            description: t.description || '',
            inputSchema: t.inputSchema || null,
            readOnly: t.annotations?.readOnlyHint === true,
            destructive: t.annotations?.destructiveHint === true,
            enabled: enabled.has(t.name),
        })),
        toolsRefreshedAt: doc.toolsRefreshedAt || null,
        createdAt: doc.createdAt,
    };
}

/**
 * The auth block as stored. Header values the caller omitted keep what is
 * already stored under the same name, so the console can resend a header list
 * it was never able to read.
 */
function authDoc(a, existing) {
    const previous = new Map(((existing && existing.headers) || []).map((h) => [h.name.toLowerCase(), h.valueEncrypted]));
    const headers = a.type === 'headers'
        ? (a.headers || []).map((h) => {
            const valueEncrypted = h.value ? seal(h.value) : previous.get(h.name.toLowerCase());
            if (!valueEncrypted) throw Object.assign(new Error(`Header "${h.name}" needs a value.`), { status: 400 });
            return { name: h.name, valueEncrypted };
        })
        : [];
    const set = { authType: a.type, headers };
    const clientId = a.type === 'oauth' ? (a.oauth && a.oauth.clientId) || null : null;
    set['oauth.clientId'] = clientId;
    set['oauth.scope'] = a.type === 'oauth' ? (a.oauth && a.oauth.scope) || null : null;
    set['oauth.clientSecretEncrypted'] = a.oauth && a.oauth.clientSecret
        ? seal(a.oauth.clientSecret)
        // The same client keeps its stored secret; a different one must not inherit it.
        : clientId && existing && clientId === (existing.oauth && existing.oauth.clientId) ? (existing.oauth.clientSecretEncrypted || null) : null;
    return set;
}

/** Whether a change means the stored sign-in no longer applies. */
function connectionChanged(set, existing) {
    if (set.url !== undefined && set.url !== existing.url) return true;
    if (set.authType !== undefined && set.authType !== existing.authType) return true;
    if (set['oauth.clientId'] !== undefined && set['oauth.clientId'] !== ((existing.oauth && existing.oauth.clientId) || null)) return true;
    if (set['oauth.scope'] !== undefined && set['oauth.scope'] !== ((existing.oauth && existing.oauth.scope) || null)) return true;
    return false;
}

function assertKnownTools(names, doc) {
    // Before the first discovery there is nothing to check against.
    const known = new Set(((doc && doc.tools) || []).map((t) => t.name));
    if (known.size === 0) return;
    const unknown = names.find((n) => !known.has(n));
    if (unknown) throw Object.assign(new Error(`This server has no tool named "${unknown}". Refresh its tools if it was added recently.`), { status: 400 });
}

/** Read the tools now, unless the server signs in with OAuth and nobody has. */
async function discoverIfPossible(doc) {
    if (doc.authType === 'oauth' && !(doc.oauth && doc.oauth.tokensEncrypted)) {
        return McpServer.findOneAndUpdate({ _id: doc._id }, { $set: { status: 'needs_auth', lastError: null } }, { returnDocument: 'after' }).lean();
    }
    return refreshServer(doc);
}

router.get('/', auth, async (req, res) => {
    try {
        const docs = await McpServer.find(owned(req)).sort({ createdAt: -1 }).lean();
        res.json({ status: 'success', data: { servers: docs.map(toJson) } });
    } catch (err) { fail(res, err); }
});

/** Read an MCP server's tools without saving a server (the connect page preview). */
router.post('/discover', auth, async (req, res) => {
    try {
        const body = await discoverJoi.validateAsync(req.body || {});
        await assertSafe(body.url);
        const a = body.auth || { type: 'none' };
        const headers = a.type === 'headers'
            ? (a.headers || []).map((h) => {
                if (!h.value) throw Object.assign(new Error(`Header "${h.name}" needs a value.`), { status: 400 });
                return { name: h.name, valueEncrypted: seal(h.value) };
            })
            : [];
        // Never saved: no _id, so nothing downstream can write it back.
        const doc = {
            _id: null, name: 'preview', url: body.url, transport: body.transport, authType: a.type, headers,
            ...(a.type === 'oauth' ? { oauth: { clientId: (a.oauth && a.oauth.clientId) || null, scope: (a.oauth && a.oauth.scope) || null } } : {}),
            status: 'pending', createdBy: req.user._id,
        };
        const result = await previewTools(doc);
        res.json({
            status: 'success',
            data: {
                status: result.status,
                lastError: result.lastError,
                serverInfo: result.serverInfo && (result.serverInfo.name || result.serverInfo.version) ? result.serverInfo : null,
                tools: result.tools.map((t) => ({
                    name: t.name, title: t.title || null, description: t.description || '', inputSchema: t.inputSchema || null,
                    readOnly: t.annotations?.readOnlyHint === true, destructive: t.annotations?.destructiveHint === true,
                })),
            },
        });
    } catch (err) { fail(res, err); }
});

router.post('/', auth, requireActivePlan, checkLimit('mcpServers'), async (req, res) => {
    try {
        const body = await createJoi.validateAsync(req.body || {});
        await assertSafe(body.url);
        const set = authDoc(body.auth || { type: 'none' });
        const created = await McpServer.create({
            name: body.name,
            url: body.url,
            transport: body.transport,
            authType: set.authType,
            headers: set.headers,
            oauth: { clientId: set['oauth.clientId'], clientSecretEncrypted: set['oauth.clientSecretEncrypted'], scope: set['oauth.scope'] },
            ...(body.enabledTools ? { enabledTools: body.enabledTools, enabledToolsInitialised: true } : {}),
            createdBy: req.user._id,
        });
        const doc = await discoverIfPossible(created.toObject());
        res.status(201).json({ status: 'success', data: { server: toJson(doc) } });
    } catch (err) { fail(res, err); }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const doc = await McpServer.findOne({ _id: req.params.id, ...owned(req) }).lean();
        if (!doc) return res.status(404).json({ status: 'error', message: 'Server not found' });
        res.json({ status: 'success', data: { server: toJson(doc) } });
    } catch (err) { fail(res, err); }
});

router.patch('/:id', auth, async (req, res) => {
    try {
        const body = await updateJoi.validateAsync(req.body || {});
        const existing = await McpServer.findOne({ _id: req.params.id, ...owned(req) }).lean();
        if (!existing) return res.status(404).json({ status: 'error', message: 'Server not found' });

        const set = {};
        if (body.name !== undefined) set.name = body.name;
        if (body.transport !== undefined && body.transport !== existing.transport) { set.transport = body.transport; set.detectedTransport = null; }
        if (body.url !== undefined && body.url !== existing.url) { await assertSafe(body.url); set.url = body.url; set.detectedTransport = null; }
        if (body.auth !== undefined) Object.assign(set, authDoc(body.auth, existing));
        if (body.enabledTools !== undefined) {
            assertKnownTools(body.enabledTools, existing);
            set.enabledTools = [...new Set(body.enabledTools)];
            set.enabledToolsInitialised = true;
        }

        const reconnect = connectionChanged(set, existing);
        if (reconnect) {
            // A sign-in belongs to the server and account it was made for.
            set['oauth.tokensEncrypted'] = null;
            set['oauth.registrationEncrypted'] = null;
            set['oauth.connectedAt'] = null;
        }
        const headersChanged = set.headers !== undefined;

        let doc = await McpServer.findOneAndUpdate({ _id: existing._id, ...owned(req) }, { $set: set }, { returnDocument: 'after' }).lean();
        if (!doc) return res.status(404).json({ status: 'error', message: 'Server not found' });
        if (reconnect || headersChanged || set.transport !== undefined) doc = await discoverIfPossible(doc);
        res.json({ status: 'success', data: { server: toJson(doc) } });
    } catch (err) { fail(res, err); }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const doc = await McpServer.findOneAndDelete({ _id: req.params.id, ...owned(req) });
        if (!doc) return res.status(404).json({ status: 'error', message: 'Server not found' });
        await Agent.updateMany({ ...owned(req), mcpServerIds: doc._id }, { $pull: { mcpServerIds: doc._id } });
        res.json({ status: 'success', message: 'Server removed' });
    } catch (err) { fail(res, err); }
});

/** Read the server's tools again. 200 even when unreachable: status and lastError are the result. */
router.post('/:id/refresh', auth, async (req, res) => {
    try {
        const existing = await McpServer.findOne({ _id: req.params.id, ...owned(req) }).lean();
        if (!existing) return res.status(404).json({ status: 'error', message: 'Server not found' });
        res.json({ status: 'success', data: { server: toJson(await refreshServer(existing)) } });
    } catch (err) { fail(res, err); }
});

/** Begin signing in. Returns the URL to open; the browser comes back to /api/mcp-oauth/callback. */
router.post('/:id/oauth/start', auth, async (req, res) => {
    try {
        const existing = await McpServer.findOne({ _id: req.params.id, ...owned(req) }).lean();
        if (!existing) return res.status(404).json({ status: 'error', message: 'Server not found' });
        const { authorizationUrl, expiresAt } = await startOAuth(existing);
        res.json({ status: 'success', data: { authorizationUrl, redirectUri: oauthRedirectUri(), expiresAt } });
    } catch (err) { fail(res, err); }
});

/** The redirect URI to register with a provider, for the connect page. */
router.get('/oauth/redirect-uri', auth, (req, res) => {
    res.json({ status: 'success', data: { redirectUri: oauthRedirectUri() } });
});

module.exports = router;
module.exports.toJson = toJson;
