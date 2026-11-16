/**
 * The only way this process talks to a URL a user typed in: a webhook tool's
 * endpoint, an MCP server, an Attendee install.
 *
 * Such a URL is a server-side request to an address someone else chose.
 * Without this, adding `http://169.254.169.254/` as a tool reads the VPS's
 * metadata endpoint, and `http://127.0.0.1:5001/api/...` talks to this API from
 * inside its own firewall.
 *
 * Each request, and each redirect hop, resolves the hostname once, refuses a
 * private, loopback, link-local or otherwise non-public answer (IPv4-mapped and
 * NAT64 forms included, kb-from-website/ssrf.js), and then connects to exactly
 * the address that was checked, through an undici Agent whose `lookup` is
 * pinned. A second DNS answer never gets a vote. TLS is still verified against
 * the hostname in the URL.
 *
 * MCP_ALLOW_PRIVATE_URLS=true lifts the check. IntelliCall is self-hosted, and
 * an install commonly has its n8n, MCP server or Attendee on the same box or
 * LAN; the operator decides.
 */
const { Agent, fetch: undiciFetch } = require('undici');
const { resolveSafeUrl, createPinnedLookup } = require('../services/kb-from-website/ssrf');

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const AGENT_CACHE_MAX = 64;

/** @param {NodeJS.ProcessEnv} [env] */
function privateUrlsAllowed(env = process.env) {
    return env.MCP_ALLOW_PRIVATE_URLS === 'true';
}

class UnsafeUrlError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsafeUrlError';
        this.status = 400;
    }
}

/**
 * Throw UnsafeUrlError if this URL may not be connected to. Used at save time,
 * so a bad URL is refused when it is entered rather than when a call needs it.
 * @param {string} href
 */
async function assertSafeMcpUrl(href) {
    let url;
    try {
        url = new URL(href);
    } catch {
        throw new UnsafeUrlError('Invalid URL.');
    }
    await checkedTarget(url);
}

/**
 * @param {URL} url
 * @returns {Promise<{address: string, family: 4|6} | null>}
 */
async function checkedTarget(url) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new UnsafeUrlError('Only http and https URLs are allowed.');
    }
    if (url.username || url.password) {
        throw new UnsafeUrlError('Put credentials in a header, not in the URL.');
    }
    // No pinning when private addresses are allowed: the normal resolver is
    // what a self-hoster's /etc/hosts and LAN DNS expect.
    if (privateUrlsAllowed()) return null;
    try {
        const r = await resolveSafeUrl(url.href);
        return { address: r.address, family: r.family };
    } catch (err) {
        throw new UnsafeUrlError(err.message);
    }
}

/**
 * One keep-alive Agent per pinned address, so a call that makes several tool
 * calls to the same server reuses its connection. Bounded, because addresses
 * are user-controlled.
 */
const agents = new Map();

function pinnedAgent(target) {
    const key = `${target.family}|${target.address}`;
    let agent = agents.get(key);
    if (agent) {
        agents.delete(key);
        agents.set(key, agent);
        return agent;
    }
    agent = new Agent({
        connect: { lookup: createPinnedLookup(target.address, target.family) },
        keepAliveTimeout: 30_000,
    });
    agents.set(key, agent);
    if (agents.size > AGENT_CACHE_MAX) {
        const oldest = agents.keys().next().value;
        const evicted = agents.get(oldest);
        agents.delete(oldest);
        if (evicted && typeof evicted.close === 'function') evicted.close().catch(() => undefined);
    }
    return agent;
}

const PROTOCOL_HEADERS = new Set(['accept', 'content-type', 'mcp-protocol-version', 'user-agent', 'last-event-id']);

function protocolHeadersOnly(headers) {
    const kept = {};
    if (!headers) return kept;
    const entries = typeof headers.forEach === 'function' && typeof headers.entries === 'function'
        ? headers.entries()
        : Object.entries(headers);
    for (const [k, v] of entries) {
        if (PROTOCOL_HEADERS.has(k.toLowerCase())) kept[k] = v;
    }
    return kept;
}

function urlOf(input) {
    if (typeof input === 'string') return new URL(input);
    if (input instanceof URL) return new URL(input.href);
    return new URL(input.url);
}

/**
 * fetch(), with the address of every hop checked and pinned.
 *
 * Redirects are followed here rather than by undici, because undici would
 * follow them to wherever the server pointed without asking.
 *
 * @param {string | URL | {url: string}} input
 * @param {Record<string, any>} [init]
 * @returns {Promise<Response>}
 */
async function safeFetch(input, init = {}) {
    let url = urlOf(input);
    let options = { ...init };

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const target = await checkedTarget(url);
        const res = await undiciFetch(url, {
            ...options,
            redirect: 'manual',
            ...(target ? { dispatcher: pinnedAgent(target) } : {}),
        });

        const location = res.headers.get('location');
        if (!REDIRECT_STATUSES.has(res.status) || !location) return res;

        // Drain so the connection can be reused.
        if (res.body) await res.body.cancel().catch(() => undefined);
        const next = new URL(location, url);
        // A redirect to another origin must not carry the user's credentials
        // with it: everything but the protocol's own headers is dropped.
        if (next.origin !== url.origin) options = { ...options, headers: protocolHeadersOnly(options.headers) };
        url = next;
        // 303, and 301/302 after a POST, become a bodyless GET, as browsers do.
        const method = String(options.method || 'GET').toUpperCase();
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
            const { body: _body, ...rest } = options;
            options = { ...rest, method: 'GET' };
        }
    }
    throw new UnsafeUrlError(`More than ${MAX_REDIRECTS} redirects.`);
}

module.exports = { safeFetch, assertSafeMcpUrl, UnsafeUrlError, privateUrlsAllowed };
