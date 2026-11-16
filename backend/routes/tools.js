/**
 * /api/tools — the account's own webhook tools, for agents to use while on a call.
 *
 * Header values are write-only: an update keeps the ones it cannot see, deleting a
 * tool detaches it from every agent, and a tool can be test-run with sample
 * arguments to see what the agent would hear.
 */
const express = require('express');
const joi = require('joi');
const { Types } = require('mongoose');
const { auth, requireActivePlan } = require('../middleware/auth');
const checkLimit = require('../middleware/limit-checker');
const Tool = require('../models/Tool');
const Agent = require('../models/Agent');
const { assertSafeMcpUrl, UnsafeUrlError } = require('../utils/safe-fetch');
const { seal } = require('../utils/credentials');
const { runWebhookTool } = require('../services/tools/webhook-runner');
const { ensureWebhookSecret } = require('../services/webhook-secret');

const router = express.Router();

/** What models accept as a function name, on every engine. */
const TOOL_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
const PARAM_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
const MAX_PROPERTIES = 30;
const MAX_DEPTH = 3;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Headers the runner sets itself, or that would let a tool tamper with the exchange. */
const RESERVED_HEADERS = new Set([
    'host', 'content-length', 'content-type', 'connection', 'transfer-encoding', 'te', 'upgrade',
    'keep-alive', 'proxy-authorization', 'cookie', 'x-intellicall-signature', 'x-intellicall-timestamp',
    'x-intellicall-call-id', 'x-intellicall-agent-id', 'x-intellicall-tool',
]);

const headerJoi = joi.object({
    name: joi.string().pattern(/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/).required()
        .custom((v, helpers) => (RESERVED_HEADERS.has(v.toLowerCase()) ? helpers.message(`Header "${v}" is set by IntelliCall and cannot be overridden.`) : v)),
    value: joi.string().min(1).max(4096),
});

const webhookJoi = joi.object({
    url: joi.string().uri({ scheme: ['http', 'https'] }).max(2048),
    method: joi.string().valid(...METHODS),
    headers: joi.array().items(headerJoi).max(20),
    timeoutMs: joi.number().integer().min(1000).max(30000),
});

const createJoi = joi.object({
    name: joi.string().pattern(TOOL_NAME_PATTERN).required()
        .messages({ 'string.pattern.base': 'Tool names use letters, digits and underscores, start with a letter, and are at most 64 characters.' }),
    description: joi.string().trim().min(1).max(1000).required(),
    type: joi.string().valid('webhook').default('webhook'),
    parameters: joi.object().unknown(true),
    webhook: webhookJoi.keys({ url: webhookJoi.extract('url').required() }).required(),
});

const updateJoi = joi.object({
    name: joi.string().pattern(TOOL_NAME_PATTERN)
        .messages({ 'string.pattern.base': 'Tool names use letters, digits and underscores, start with a letter, and are at most 64 characters.' }),
    description: joi.string().trim().min(1).max(1000),
    parameters: joi.object().unknown(true),
    webhook: webhookJoi,
});

const testJoi = joi.object({ arguments: joi.object().unknown(true).default({}) });

/**
 * A JSON Schema walk: types the engines understand, a bounded size and depth.
 * Returns an error message, or null when the schema is fine.
 */
function checkParameters(schema) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 'Parameters must be a JSON Schema object.';
    if (schema.type !== 'object') return 'Parameters must be a JSON Schema object with "type": "object".';
    const props = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties) ? schema.properties : {};
    let count = 0;
    const walk = (node, depth, path) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return `${path}: each parameter must be an object with a "type".`;
        if (!PARAM_TYPES.includes(node.type)) return `${path}: type must be one of ${PARAM_TYPES.join(', ')}.`;
        if (depth > MAX_DEPTH) return `${path}: parameters nest at most ${MAX_DEPTH} levels.`;
        if (node.enum !== undefined && (!Array.isArray(node.enum) || node.enum.length > 50)) return `${path}: enum must be a list of at most 50 values.`;
        if (node.description !== undefined && (typeof node.description !== 'string' || node.description.length > 500)) return `${path}: description must be text of at most 500 characters.`;
        if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
            for (const [k, v] of Object.entries(node.properties)) {
                count += 1;
                if (!TOOL_NAME_PATTERN.test(k)) return `${path}.${k}: parameter names use letters, digits and underscores, starting with a letter.`;
                const err = walk(v, depth + 1, `${path}.${k}`);
                if (err) return err;
            }
            if (node.required !== undefined) {
                if (!Array.isArray(node.required)) return `${path}: "required" must be a list of parameter names.`;
                for (const r of node.required) if (!(r in node.properties)) return `${path}: "${r}" is required but not defined.`;
            }
        }
        if (node.type === 'array' && node.items) {
            const err = walk(node.items, depth + 1, `${path}[]`);
            if (err) return err;
        }
        return null;
    };
    const err = walk({ ...schema, properties: props }, 0, 'parameters');
    if (err) return err;
    if (count > MAX_PROPERTIES) return `At most ${MAX_PROPERTIES} parameters in all.`;
    return null;
}

/** A tool, without its header values: only their names ever leave the server. */
function toJson(doc) {
    return {
        _id: String(doc._id),
        name: doc.name,
        description: doc.description || '',
        type: doc.type || 'webhook',
        parameters: doc.parameters || { type: 'object', properties: {} },
        webhook: {
            url: doc.webhook?.url || '',
            method: doc.webhook?.method || 'POST',
            headerNames: (doc.webhook?.headers || []).map((h) => h.name),
            timeoutMs: doc.webhook?.timeoutMs ?? 10000,
        },
        lastTest: doc.lastTest && doc.lastTest.at ? { ok: doc.lastTest.ok, status: doc.lastTest.status, at: doc.lastTest.at } : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

/** Header values the caller omitted keep what is stored under the same name. */
function headersDoc(headers, existing = []) {
    const previous = new Map(existing.map((h) => [h.name.toLowerCase(), h.valueEncrypted]));
    const seen = new Set();
    return headers.map((h) => {
        const key = h.name.toLowerCase();
        if (seen.has(key)) throw Object.assign(new Error(`Duplicate header "${h.name}".`), { status: 400 });
        seen.add(key);
        const valueEncrypted = h.value ? seal(h.value) : previous.get(key);
        if (!valueEncrypted) throw Object.assign(new Error(`Header "${h.name}" needs a value.`), { status: 400 });
        return { name: h.name, valueEncrypted };
    });
}

async function assertSafe(url) {
    try {
        await assertSafeMcpUrl(url);
    } catch (err) {
        if (err instanceof UnsafeUrlError) throw Object.assign(new Error(`This URL cannot be used: ${err.message}`), { status: 400 });
        throw err;
    }
}

const owned = (req) => ({ createdBy: new Types.ObjectId(String(req.user._id)) });

function fail(res, err) {
    if (err?.code === 11000) return res.status(409).json({ status: 'error', code: 'tool_name_taken', message: 'You already have a tool with this name. Tool names are what the agent calls, so each must be different.' });
    if (err?.isJoi) return res.status(400).json({ status: 'error', message: err.details?.[0]?.message || err.message });
    const status = err?.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('[tools]', err);
    return res.status(status).json({ status: 'error', message: status === 500 ? 'Something went wrong.' : err.message });
}

router.get('/', auth, async (req, res) => {
    try {
        const tools = await Tool.find(owned(req)).sort({ createdAt: -1 }).lean();
        res.json({ status: 'success', data: { tools: tools.map(toJson) } });
    } catch (err) { fail(res, err); }
});

router.post('/', auth, requireActivePlan, checkLimit('tools'), async (req, res) => {
    try {
        const body = await createJoi.validateAsync(req.body || {}, { abortEarly: true });
        const parameters = body.parameters || { type: 'object', properties: {} };
        const paramErr = checkParameters(parameters);
        if (paramErr) return res.status(400).json({ status: 'error', message: paramErr });
        await assertSafe(body.webhook.url);
        const created = await Tool.create({
            name: body.name,
            description: body.description,
            type: 'webhook',
            parameters,
            webhook: {
                url: body.webhook.url,
                method: body.webhook.method || 'POST',
                headers: headersDoc(body.webhook.headers || []),
                timeoutMs: body.webhook.timeoutMs ?? 10000,
            },
            createdBy: req.user._id,
        });
        res.status(201).json({ status: 'success', data: { tool: toJson(created.toObject()) } });
    } catch (err) { fail(res, err); }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const doc = await Tool.findOne({ _id: req.params.id, ...owned(req) }).lean();
        if (!doc) return res.status(404).json({ status: 'error', message: 'Tool not found' });
        res.json({ status: 'success', data: { tool: toJson(doc) } });
    } catch (err) { fail(res, err); }
});

router.patch('/:id', auth, async (req, res) => {
    try {
        const body = await updateJoi.validateAsync(req.body || {}, { abortEarly: true });
        const existing = await Tool.findOne({ _id: req.params.id, ...owned(req) }).lean();
        if (!existing) return res.status(404).json({ status: 'error', message: 'Tool not found' });

        const set = {};
        if (body.name !== undefined) set.name = body.name;
        if (body.description !== undefined) set.description = body.description;
        if (body.parameters !== undefined) {
            const paramErr = checkParameters(body.parameters);
            if (paramErr) return res.status(400).json({ status: 'error', message: paramErr });
            set.parameters = body.parameters;
        }
        if (body.webhook) {
            if (body.webhook.url !== undefined) { await assertSafe(body.webhook.url); set['webhook.url'] = body.webhook.url; }
            if (body.webhook.method !== undefined) set['webhook.method'] = body.webhook.method;
            if (body.webhook.timeoutMs !== undefined) set['webhook.timeoutMs'] = body.webhook.timeoutMs;
            if (body.webhook.headers !== undefined) set['webhook.headers'] = headersDoc(body.webhook.headers, existing.webhook?.headers || []);
        }
        if (Object.keys(set).length === 0) return res.json({ status: 'success', data: { tool: toJson(existing) } });

        const doc = await Tool.findOneAndUpdate({ _id: existing._id, ...owned(req) }, { $set: set }, { returnDocument: 'after' }).lean();
        if (!doc) return res.status(404).json({ status: 'error', message: 'Tool not found' });
        res.json({ status: 'success', data: { tool: toJson(doc) } });
    } catch (err) { fail(res, err); }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const doc = await Tool.findOneAndDelete({ _id: req.params.id, ...owned(req) });
        if (!doc) return res.status(404).json({ status: 'error', message: 'Tool not found' });
        // An agent pointing at a deleted tool would carry a dangling id forever.
        await Agent.updateMany({ ...owned(req), toolIds: doc._id }, { $pull: { toolIds: doc._id } });
        res.json({ status: 'success', message: 'Tool deleted' });
    } catch (err) { fail(res, err); }
});

/**
 * POST /api/tools/:id/test — run the tool once with sample arguments and answer
 * with what the agent would hear. The request is exactly a call's, signature
 * included, with X-IntelliCall-Call-Id `test`.
 */
router.post('/:id/test', auth, async (req, res) => {
    try {
        const body = await testJoi.validateAsync(req.body || {});
        const tool = await Tool.findOne({ _id: req.params.id, ...owned(req) }).lean();
        if (!tool) return res.status(404).json({ status: 'error', message: 'Tool not found' });
        const secret = await ensureWebhookSecret(req.user._id).catch(() => null);
        const r = await runWebhookTool(tool, body.arguments, { callId: 'test', agentId: null, secret });
        await Tool.updateOne({ _id: tool._id }, { $set: { lastTest: { ok: r.ok, status: r.status, at: new Date() } } });
        res.json({ status: 'success', data: { ok: r.ok, status: r.status, durationMs: r.durationMs, output: r.output } });
    } catch (err) { fail(res, err); }
});

module.exports = router;
module.exports.TOOL_NAME_PATTERN = TOOL_NAME_PATTERN;
