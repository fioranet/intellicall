const dnsCallback = require('dns');
const dns = dnsCallback.promises;
const http = require('http');
const https = require('https');
const net = require('net');
const { URL } = require('url');

const ALLOWED_PORTS = new Set(['80', '443']);

/**
 * Whether an IPv4 address is anywhere but the public internet. Malformed input
 * counts as blocked: an address we cannot read is not one we can prove safe.
 */
function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return true;
    }
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8, "this network"; 0.0.0.0 reaches loopback on Linux
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, the cloud metadata address
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking, 198.18/15
    if (a >= 224) return true; // multicast 224/4, reserved 240/4, broadcast
    return false;
}

/**
 * An IPv6 address as its eight 16-bit groups, or null if it is not one.
 *
 * The check has to work on the number, not the spelling. Node's URL parser
 * rewrites `[::ffff:169.254.169.254]` to `::ffff:a9fe:a9fe` and
 * `[::127.0.0.1]` to `::7f00:1`, and a resolver may answer in either form, so a
 * prefix match on the text lets the metadata address through.
 */
function ipv6Groups(ip) {
    let s = ip.toLowerCase();
    const zone = s.indexOf('%');
    if (zone !== -1) s = s.slice(0, zone);
    if (!net.isIPv6(s)) return null;
    const lastColon = s.lastIndexOf(':');
    const tail = s.slice(lastColon + 1);
    if (net.isIPv4(tail)) {
        const [a, b, c, d] = tail.split('.').map(Number);
        s = `${s.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    }
    const halves = s.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
    if (fill < 0 || head.length + fill + rest.length !== 8) return null;
    const groups = [...head, ...Array(fill).fill('0'), ...rest].map((h) => parseInt(h, 16));
    if (groups.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
    return groups;
}

function embeddedIPv4(hi, lo) {
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/**
 * Whether an IPv6 address is anywhere but the public internet.
 *
 * Only global unicast (2000::/3) is allowed, which refuses ::, ::1, the
 * IPv4-compatible ::/96, 64:ff9b:1::/48, 100::/64, fc00::/7, fe80::/10,
 * fec0::/10 and ff00::/8 in one rule rather than one prefix each. The forms that
 * carry an IPv4 address (IPv4-mapped ::ffff:0:0/96, NAT64 64:ff9b::/96, 6to4
 * 2002::/16) are judged by that address, because a dual-stack or NAT64 host
 * delivers them to it.
 */
function isPrivateIPv6(ip) {
    const g = ipv6Groups(ip);
    if (!g) return true;
    const zeros = (from, to) => g.slice(from, to).every((n) => n === 0);
    if (zeros(0, 5) && g[5] === 0xffff) return isPrivateIPv4(embeddedIPv4(g[6], g[7]));
    if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isPrivateIPv4(embeddedIPv4(g[6], g[7]));
    if ((g[0] & 0xe000) !== 0x2000) return true;
    // 2001::/23 is IETF protocol assignments, Teredo 2001::/32 among them,
    // which tunnels to an obfuscated IPv4 address. 2001:db8::/32 is documentation.
    if (g[0] === 0x2001 && (g[1] < 0x200 || g[1] === 0xdb8)) return true;
    if (g[0] === 0x2002) return isPrivateIPv4(embeddedIPv4(g[1], g[2]));
    return false;
}

function isBlockedIP(ip) {
    const v = net.isIP(ip);
    if (v === 4) return isPrivateIPv4(ip);
    if (v === 6) return isPrivateIPv6(ip);
    // net.isIP is false for a zone-scoped address such as fe80::1%eth0.
    if (ip.includes('%')) return isPrivateIPv6(ip);
    return true;
}

function blockedError() {
    return Object.assign(new Error('Target address is not allowed'), { status: 400 });
}

/**
 * Resolve a URL and validate the address it points at, RETURNING that address.
 *
 * The returned address is the whole point. Validating a hostname and then
 * handing the *hostname* to an HTTP client is a DNS-rebinding hole (M17): the
 * client resolves the name a second time, and an attacker who controls the
 * record with a 0-second TTL can answer 1.2.3.4 for our check and 127.0.0.1 for
 * the fetch that follows. Nothing about the first answer binds the second.
 *
 * So callers must connect to the address that was actually checked — see
 * createPinnedLookup below — rather than to the name that produced it.
 *
 * @param {string} href
 * @returns {Promise<{ url: URL, hostname: string, address: string, family: 4 | 6, port: number }>}
 */
async function resolveSafeUrl(href) {
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

    // A bracketed IPv6 literal arrives as `[::1]` in u.hostname on some Node
    // versions and `::1` on others; strip the brackets before net.isIP sees it.
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) {
        if (isBlockedIP(host)) throw blockedError();
        return {
            url: u,
            hostname: host,
            address: host,
            family: /** @type {4 | 6} */ (net.isIP(host)),
            port: Number(port),
        };
    }

    let answers;
    try {
        const r = await dns.lookup(host, { verbatim: true, all: true });
        answers = Array.isArray(r) ? r : [r];
    } catch (e) {
        throw Object.assign(new Error(`DNS resolution failed: ${e.message}`), { status: 400 });
    }
    // Every answer, not just the first. The caller below pins the first, but an
    // assertSafeUrl caller hands the name to a client that may pick another.
    if (answers.length === 0 || answers.some((a) => isBlockedIP(a.address))) {
        throw blockedError();
    }
    const { address, family } = answers[0];
    return {
        url: u,
        hostname: host,
        address,
        family: /** @type {4 | 6} */ (family || net.isIP(address) || 4),
        port: Number(port),
    };
}

/**
 * The existing throw-or-continue validator. Unchanged in name, arguments and
 * behaviour — several call sites outside this directory depend on exactly this
 * shape, so resolveSafeUrl was added beside it rather than replacing it.
 *
 * @param {string} href
 * @returns {Promise<void>}
 */
async function assertSafeUrl(href) {
    await resolveSafeUrl(href);
}

/**
 * A `lookup` implementation for http.Agent / https.Agent that always answers
 * with the address resolveSafeUrl already validated, whatever name it is asked
 * about.
 *
 * This is the half of the rebinding fix that closes the window: the socket goes
 * to the checked address, so a second DNS answer never gets a vote. TLS is
 * unaffected — the certificate is still verified against the hostname in the
 * URL, because only the address lookup is short-circuited, not the SNI name.
 *
 * @param {string} address
 * @param {4 | 6} family
 */
function createPinnedLookup(address, family) {
    return function pinnedLookup(hostname, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (options && options.all) {
            callback(null, [{ address, family }]);
            return;
        }
        callback(null, address, family);
    };
}

/**
 * A `lookup` for http.Agent / https.Agent that resolves the name itself and
 * refuses the connection if any answer is a blocked address.
 *
 * For a client that is handed a hostname after assertSafeUrl rather than a
 * pinned address: the check then runs on the answer the socket actually
 * connects to, so a name that flips to 127.0.0.1 after validation fails at
 * connect time instead of reaching loopback. An IP-literal URL never calls
 * lookup, which is fine, because assertSafeUrl already judged the literal and
 * a literal cannot change.
 */
function guardedLookup(hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    const wantAll = Boolean(options && options.all);
    const family = typeof options === 'number' ? options : options && options.family;
    dnsCallback.lookup(hostname, { family: family || 0, all: true, verbatim: true }, (err, answers) => {
        if (err) return callback(err);
        if (!answers.length || answers.some((a) => isBlockedIP(a.address))) {
            return callback(Object.assign(blockedError(), { code: 'ESSRFBLOCKED' }));
        }
        if (wantAll) return callback(null, answers);
        callback(null, answers[0].address, answers[0].family);
    });
}

const guardedHttpAgent = new http.Agent({ lookup: guardedLookup });
const guardedHttpsAgent = new https.Agent({ lookup: guardedLookup });

module.exports = {
    assertSafeUrl,
    resolveSafeUrl,
    createPinnedLookup,
    guardedLookup,
    guardedHttpAgent,
    guardedHttpsAgent,
    isBlockedIP,
};
