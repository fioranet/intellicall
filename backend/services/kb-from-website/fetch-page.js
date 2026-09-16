const axios = require('axios');
const { URL } = require('url');
const { assertSafeUrl } = require('./ssrf');

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 25000;
const MAX_BYTES = 20 * 1024 * 1024;
const USER_AGENT = 'IntelliCall-KBImport/1.0';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function normalizeHeaders(raw) {
    /** @type {Record<string, string>} */
    const headers = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'string') headers[k.toLowerCase()] = v;
        else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(', ');
    }
    return headers;
}

/**
 * GET a text resource with per-hop SSRF checks (redirect target re-validated each hop).
 * @param {string} startUrl
 * @param {{ maxBytes?: number, timeoutMs?: number, accept?: string }} [options]
 * @returns {Promise<{ finalUrl: string, status: number, headers: Record<string, string>, body: string }>}
 */
async function fetchExternalText(startUrl, options = {}) {
    const maxBytes = options.maxBytes ?? MAX_BYTES;
    const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    const accept =
        options.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    let url = startUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertSafeUrl(url);

        let res;
        try {
            res = await axios.get(url, {
                maxRedirects: 0,
                timeout: timeoutMs,
                maxContentLength: maxBytes,
                maxBodyLength: maxBytes,
                responseType: 'text',
                validateStatus: () => true,
                headers: {
                    'User-Agent': USER_AGENT,
                    Accept: accept,
                },
            });
        } catch (err) {
            if (err.response) {
                const status = err.response?.status;
                const msg = err.response?.data
                    ? String(err.response.data).slice(0, 200)
                    : err.message;
                throw Object.assign(new Error(`Fetch failed: ${status || err.message} ${msg}`), {
                    status: 502,
                });
            }
            if (err.code === 'ECONNABORTED') {
                throw Object.assign(new Error('Request timed out'), { status: 502 });
            }
            if (err.message && err.message.includes('maxContentLength')) {
                throw Object.assign(new Error('Response too large'), { status: 413 });
            }
            throw Object.assign(new Error(err.message || 'Fetch failed'), { status: 502 });
        }

        if (REDIRECT_STATUSES.has(res.status)) {
            const loc = res.headers.location;
            if (!loc) {
                throw Object.assign(new Error('Redirect without Location header'), { status: 502 });
            }
            url = new URL(loc, url).href;
            continue;
        }

        if (res.status >= 200 && res.status < 300) {
            return {
                finalUrl: url,
                status: res.status,
                headers: normalizeHeaders(res.headers),
                body: typeof res.data === 'string' ? res.data : String(res.data),
            };
        }

        throw Object.assign(new Error(`HTTP ${res.status}`), { status: 502 });
    }

    throw Object.assign(new Error('Too many redirects'), { status: 502 });
}

/**
 * @param {string} startUrl
 * @returns {Promise<{ finalUrl: string, status: number, headers: Record<string, string>, body: string }>}
 */
async function fetchPage(startUrl) {
    return fetchExternalText(startUrl, { maxBytes: MAX_BYTES, timeoutMs: TIMEOUT_MS });
}

module.exports = { fetchPage, fetchExternalText, MAX_BYTES, TIMEOUT_MS, MAX_REDIRECTS };
