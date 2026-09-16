const axios = require('axios');
const crypto = require('crypto');
const Settings = require('../models/Settings');
const AdminSettings = require('../models/AdminSettings');
const { callbackUrl } = require('./public-url');

const HUBSPOT_AUTH_BASE = 'https://app.hubspot.com/oauth/authorize';
const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';
const HUBSPOT_API_BASE = 'https://api.hubapi.com';

const SCOPES = [
    'oauth',
    'crm.objects.contacts.read',
    'crm.objects.contacts.write'
];

// What a service key must carry for the lead sync to work. No 'oauth' scope
// here — that one is only meaningful for the legacy authorization-code flow.
const REQUIRED_SERVICE_KEY_SCOPES = [
    'crm.objects.contacts.read',
    'crm.objects.contacts.write'
];

/**
 * Load OAuth credentials from AdminSettings, falling back to environment
 * variables for backwards compatibility with older deployments.
 */
async function getCreds() {
    try {
        const admin = await AdminSettings.findOne().lean();
        const h = admin?.integrations?.hubspot || {};
        return {
            clientId: h.clientId || process.env.HUBSPOT_CLIENT_ID || '',
            clientSecret: h.clientSecret || process.env.HUBSPOT_CLIENT_SECRET || '',
            callbackUrl: h.callbackUrl || process.env.HUBSPOT_CALLBACK_URL || ''
        };
    } catch {
        return {
            clientId: process.env.HUBSPOT_CLIENT_ID || '',
            clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
            callbackUrl: process.env.HUBSPOT_CALLBACK_URL || ''
        };
    }
}

async function getRedirectUri(req) {
    const creds = await getCreds();
    if (creds.callbackUrl) return creds.callbackUrl;
    return callbackUrl(req, 'hubspot');
}

/**
 * Generate an RFC 7636 PKCE pair: a random code_verifier and its S256
 * code_challenge. HubSpot enforces PKCE on some apps (newer public apps
 * default to it) and rejects the authorize request outright without it.
 */
function generatePkcePair() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url'); // 43 chars, within the 43-128 spec range
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
}

async function getAuthUrl(userId, redirectUri, codeChallenge) {
    const creds = await getCreds();
    const params = new URLSearchParams({
        client_id: creds.clientId,
        redirect_uri: redirectUri || (await getRedirectUri()),
        scope: SCOPES.join(' '),
        state: userId,
        response_type: 'code'
    });
    if (codeChallenge) {
        params.set('code_challenge', codeChallenge);
        params.set('code_challenge_method', 'S256');
    }
    return `${HUBSPOT_AUTH_BASE}?${params.toString()}`;
}

async function exchangeCode(code, redirectUri, codeVerifier) {
    const creds = await getCreds();
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri || (await getRedirectUri()),
        code
    });
    if (codeVerifier) body.set('code_verifier', codeVerifier);
    const { data } = await axios.post(HUBSPOT_TOKEN_URL, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return data;
}

async function refreshAccessToken(refreshToken) {
    const creds = await getCreds();
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: refreshToken
    });
    const { data } = await axios.post(HUBSPOT_TOKEN_URL, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return data;
}

async function getTokenInfo(accessToken) {
    const { data } = await axios.get(`${HUBSPOT_API_BASE}/oauth/v1/access-tokens/${accessToken}`);
    return data;
}

/**
 * Return a usable bearer token for the user.
 *
 * A service key is a static credential, so it is returned as-is; the legacy
 * OAuth path still refreshes on expiry. Service keys win when both are present.
 */
async function getAccessTokenForUser(userId) {
    const settings = await Settings.findOne({ userId });
    if (!settings || !settings.hubspotConnected) return null;
    if (settings.hubspotServiceKey) return settings.hubspotServiceKey;
    if (!settings.hubspotRefreshToken) return null;

    const expiresAt = settings.hubspotExpiresAt ? new Date(settings.hubspotExpiresAt).getTime() : 0;
    const now = Date.now();
    const skewMs = 60 * 1000;

    if (settings.hubspotAccessToken && expiresAt - skewMs > now) {
        return settings.hubspotAccessToken;
    }

    const refreshed = await refreshAccessToken(settings.hubspotRefreshToken);
    settings.hubspotAccessToken = refreshed.access_token;
    if (refreshed.refresh_token) settings.hubspotRefreshToken = refreshed.refresh_token;
    settings.hubspotExpiresAt = new Date(Date.now() + (refreshed.expires_in || 0) * 1000);
    await settings.save();
    return settings.hubspotAccessToken;
}

function apiClient(accessToken) {
    return axios.create({
        baseURL: HUBSPOT_API_BASE,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        timeout: 15000
    });
}

/** True when the legacy OAuth app is configured at the platform level. */
async function isAvailable() {
    const creds = await getCreds();
    return !!(creds.clientId && creds.clientSecret);
}

/** Service keys are issued in the user's own portal and all share this prefix. */
function looksLikeServiceKey(key) {
    return /^pat-[a-z0-9]+-/i.test(String(key || '').trim());
}

/**
 * Check a pasted service key before storing it, so a bad paste or a key with
 * the wrong scopes fails loudly at setup instead of silently dropping one lead
 * at a time later.
 *
 * Returns { hubId, hubDomain }. Throws an Error with a user-facing message.
 */
async function validateServiceKey(serviceKey) {
    const key = String(serviceKey || '').trim();
    if (!key) throw new Error('Service key is required');

    const client = apiClient(key);

    // Introspection reports the granted scopes, which lets us name a missing
    // one precisely. It is not documented for service keys, so a failure here
    // is not fatal — we fall through to probing the contacts API directly.
    let hubId = null;
    let hubDomain = '';
    try {
        const info = await getTokenInfo(key);
        hubId = info?.hub_id ?? null;
        hubDomain = info?.hub_domain || '';
        const scopes = Array.isArray(info?.scopes) ? info.scopes : [];
        if (scopes.length) {
            const missing = REQUIRED_SERVICE_KEY_SCOPES.filter((s) => !scopes.includes(s));
            if (missing.length) {
                throw new Error(`Service key is missing required scope(s): ${missing.join(', ')}`);
            }
            return { hubId, hubDomain };
        }
    } catch (err) {
        if (/missing required scope/i.test(err.message)) throw err;
        // fall through to the live probe below
    }

    try {
        await client.get('/crm/v3/objects/contacts', { params: { limit: 1 } });
    } catch (err) {
        const status = err.response?.status;
        if (status === 401) throw new Error('HubSpot rejected this service key. Check that it was copied in full.');
        if (status === 403) {
            throw new Error('This service key lacks the crm.objects.contacts.read and crm.objects.contacts.write scopes.');
        }
        throw new Error(err.response?.data?.message || err.message);
    }

    if (!hubDomain) {
        try {
            const { data } = await client.get('/account-info/v3/details');
            hubId = data?.portalId ?? hubId;
            hubDomain = data?.uiDomain || '';
        } catch {
            // account-info needs its own scope; the key still works for contacts.
        }
    }

    return { hubId, hubDomain };
}

module.exports = {
    SCOPES,
    REQUIRED_SERVICE_KEY_SCOPES,
    looksLikeServiceKey,
    validateServiceKey,
    getCreds,
    getRedirectUri,
    getAuthUrl,
    exchangeCode,
    generatePkcePair,
    refreshAccessToken,
    getTokenInfo,
    getAccessTokenForUser,
    apiClient,
    isAvailable
};
