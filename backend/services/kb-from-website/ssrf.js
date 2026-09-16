const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');

const ALLOWED_PORTS = new Set(['80', '443']);

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
        return true;
    }
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
}

function isPrivateIPv6(ip) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
        const v4 = ip.slice(7);
        if (net.isIPv4(v4)) return isPrivateIPv4(v4);
    }
    return false;
}

function isBlockedIP(ip) {
    const v = net.isIP(ip);
    if (v === 4) return isPrivateIPv4(ip);
    if (v === 6) return isPrivateIPv6(ip);
    return true;
}

/**
 * @param {string} href
 * @returns {Promise<void>}
 */
async function assertSafeUrl(href) {
    let u;
    try {
        u = new URL(href);
    } catch {
        throw Object.assign(new Error('Invalid URL'), { status: 400 });
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw Object.assign(new Error('Only http and https URLs are allowed'), { status: 400 });
    }
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    if (!ALLOWED_PORTS.has(port)) {
        throw Object.assign(new Error('Only ports 80 and 443 are allowed'), { status: 400 });
    }

    const host = u.hostname;
    if (net.isIP(host)) {
        if (isBlockedIP(host)) {
            throw Object.assign(new Error('Target address is not allowed'), { status: 400 });
        }
        return;
    }

    let address;
    try {
        const r = await dns.lookup(host, { verbatim: true });
        address = r.address;
    } catch (e) {
        throw Object.assign(new Error(`DNS resolution failed: ${e.message}`), { status: 400 });
    }
    if (isBlockedIP(address)) {
        throw Object.assign(new Error('Target address is not allowed'), { status: 400 });
    }
}

module.exports = {
    assertSafeUrl,
    isBlockedIP,
};
