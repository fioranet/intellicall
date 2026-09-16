/**
 * Resolve the externally-visible origin used to build OAuth redirect URIs.
 *
 * Behind a reverse proxy that terminates TLS and forwards to Node over plain
 * HTTP, `req.protocol` reports "http" unless the proxy sends X-Forwarded-Proto.
 * Self-hosted installs routinely miss that nginx directive, and the resulting
 * `http://` callback is rejected outright by HubSpot, Google and Slack, which
 * all require HTTPS for non-localhost redirect URLs.
 *
 * So rather than trusting the connection protocol, assume HTTPS for any host
 * that isn't local. A missing proxy header can no longer break OAuth, and an
 * install that genuinely serves plain HTTP can still force the origin with
 * BASE_URL (or the per-provider callback URL override in Admin → Integrations).
 */

/** Hosts we should still address over plain HTTP. */
function isLocalHost(host) {
    const hostname = String(host || '').replace(/:\d+$/, '').toLowerCase();
    return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '[::1]'
        || hostname === '::1'
        || hostname.endsWith('.local');
}

/** Proxies may append to these headers, so only the first hop is ours. */
function firstHop(value) {
    return String(value || '').split(',')[0].trim();
}

/**
 * Externally-visible origin (scheme + host, no trailing slash) for this request.
 * Falls back to BASE_URL when there is no request in hand.
 */
function externalOrigin(req) {
    const configured = process.env.BASE_URL || '';
    if (configured) return configured.replace(/\/+$/, '');

    if (!req) return 'http://localhost:5001';

    const host = firstHop(req.get('x-forwarded-host')) || req.get('host') || '';
    if (!host) return 'http://localhost:5001';

    const forwardedProto = firstHop(req.get('x-forwarded-proto'));
    const protocol = forwardedProto || (isLocalHost(host) ? 'http' : 'https');

    return `${protocol}://${host}`;
}

/** Build a provider's OAuth callback URL for this request. */
function callbackUrl(req, providerPath) {
    return `${externalOrigin(req)}/api/auth/${providerPath}/callback`;
}

module.exports = { externalOrigin, callbackUrl, isLocalHost };
