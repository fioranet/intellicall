/**
 * Running a webhook tool: the agent's arguments to the account's endpoint, and
 * its answer back as text the agent can use.
 *
 *   - The arguments are the JSON body, or query parameters for GET and DELETE,
 *     so an existing API or a Zapier / Make / n8n catch hook works as it is.
 *   - What the call is goes in headers: X-IntelliCall-Call-Id,
 *     X-IntelliCall-Agent-Id, X-IntelliCall-Tool, X-IntelliCall-Timestamp.
 *   - X-IntelliCall-Signature is HMAC-SHA256(secret, `${timestamp}.${body}`) in
 *     hex, with the account's webhook signing secret (Settings → Webhooks).
 *   - Every address, redirects included, is checked and pinned (safeFetch), so
 *     a tool cannot be pointed at the server's own network.
 *
 * Never throws. A failure is a sentence the agent can say.
 */

const { createHmac } = require('crypto');
const { safeFetch, UnsafeUrlError } = require('../../utils/safe-fetch');
const { open } = require('../../utils/credentials');

/** Characters of the answer handed back to the model. */
const MAX_RESULT_CHARS = 4_000;
/** Read at most this much of a response; anything larger is cut. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * @typedef {object} RunResult
 * @property {boolean} ok
 * @property {number | null} status
 * @property {number} durationMs
 * @property {string} output what the agent hears back
 * @property {string | null} error for the call record; null on success
 */

function signBody(secret, timestamp, body) {
    return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

const cap = (s) => (s.length > MAX_RESULT_CHARS ? `${s.slice(0, MAX_RESULT_CHARS)}… (truncated)` : s);

/** A query string from arguments: strings as they are, anything else as JSON. */
function withQuery(url, args) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(args)) {
        if (v === undefined || v === null) continue;
        u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    return u.toString();
}

async function readCapped(res) {
    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks = [];
    let size = 0;
    while (size < MAX_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        size += value.length;
    }
    reader.cancel().catch(() => undefined);
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8').slice(0, MAX_BODY_BYTES);
}

/** The answer as text for the model: compact JSON when it is JSON. */
function answerText(raw, contentType) {
    const text = raw.trim();
    if (!text) return '';
    if ((contentType || '').includes('json') || /^[[{]/.test(text)) {
        try { return JSON.stringify(JSON.parse(text)); } catch { /* not JSON after all */ }
    }
    return text;
}

/**
 * @param {{name: string, webhook: {url: string, method?: string, headers?: Array<{name: string, valueEncrypted: string}>, timeoutMs?: number}}} tool
 * @param {Record<string, unknown>} args
 * @param {{callId?: string | null, agentId?: string | null, secret?: string | null, signal?: AbortSignal}} [ctx]
 * @returns {Promise<RunResult>}
 */
async function runWebhookTool(tool, args, ctx = {}) {
    const started = Date.now();
    const w = tool.webhook;
    const method = w.method || 'POST';
    const queryOnly = method === 'GET' || method === 'DELETE';
    const body = queryOnly ? '' : JSON.stringify(args ?? {});
    const timestamp = String(Math.floor(started / 1000));

    const headers = {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.5',
        'user-agent': 'IntelliCall-AI-Tool/1.0',
    };
    for (const h of w.headers ?? []) {
        const value = open(h.valueEncrypted, `tool header ${h.name}`);
        if (value) headers[h.name] = value;
    }
    if (!queryOnly) headers['content-type'] = 'application/json';
    headers['x-intellicall-tool'] = tool.name;
    headers['x-intellicall-timestamp'] = timestamp;
    if (ctx.callId) headers['x-intellicall-call-id'] = String(ctx.callId);
    if (ctx.agentId) headers['x-intellicall-agent-id'] = String(ctx.agentId);
    if (ctx.secret) headers['x-intellicall-signature'] = signBody(ctx.secret, timestamp, body);

    const timeoutMs = Math.min(30_000, Math.max(1_000, w.timeoutMs ?? 10_000));
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = ctx.signal ? AbortSignal.any([timeout, ctx.signal]) : timeout;

    const done = (r) => ({ ...r, durationMs: Date.now() - started });

    try {
        const url = queryOnly ? withQuery(w.url, args ?? {}) : w.url;
        const res = await safeFetch(url, { method, headers, ...(queryOnly ? {} : { body }), signal });
        const text = answerText(await readCapped(res), res.headers.get('content-type'));
        if (!res.ok) {
            return done({
                ok: false,
                status: res.status,
                output: `The ${tool.name} service answered with an error (${res.status})${text ? `: ${text.slice(0, 300)}` : ''}. Tell the caller you could not do that right now, and carry on.`,
                error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
            });
        }
        return done({ ok: true, status: res.status, output: cap(text || 'Done. The service returned no details.'), error: null });
    } catch (err) {
        const timedOut = timeout.aborted || err.name === 'TimeoutError';
        if (timedOut) {
            return done({ ok: false, status: null, output: `The ${tool.name} service did not respond in time. Tell the caller you could not check right now, and carry on.`, error: 'timed out' });
        }
        if (ctx.signal?.aborted) {
            return done({ ok: false, status: null, output: 'The tool was stopped.', error: 'cancelled' });
        }
        const unsafe = err instanceof UnsafeUrlError;
        return done({
            ok: false,
            status: null,
            output: `The ${tool.name} service could not be reached. Tell the caller you could not do that right now, and carry on.`,
            error: unsafe ? `refused address: ${err.message}` : String(err.message ?? err).slice(0, 300),
        });
    }
}

module.exports = { runWebhookTool, signBody, answerText, MAX_RESULT_CHARS };
