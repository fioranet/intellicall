const axios = require('axios');
const AdminSettings = require('../models/AdminSettings');
const { callbackUrl } = require('./public-url');

const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

// Only `incoming-webhook` is needed. Slack returns a per-channel webhook URL
// the user picks during install — no token refresh, no ongoing API auth.
const SCOPES = ['incoming-webhook'];

/**
 * Load Slack OAuth credentials from AdminSettings, falling back to environment
 * variables for backwards compatibility with older deployments.
 */
async function getCreds() {
    try {
        const admin = await AdminSettings.findOne().lean();
        const s = admin?.integrations?.slack || {};
        return {
            clientId: s.clientId || process.env.SLACK_CLIENT_ID || '',
            clientSecret: s.clientSecret || process.env.SLACK_CLIENT_SECRET || '',
            callbackUrl: s.callbackUrl || process.env.SLACK_CALLBACK_URL || ''
        };
    } catch {
        return {
            clientId: process.env.SLACK_CLIENT_ID || '',
            clientSecret: process.env.SLACK_CLIENT_SECRET || '',
            callbackUrl: process.env.SLACK_CALLBACK_URL || ''
        };
    }
}

async function getRedirectUri(req) {
    const creds = await getCreds();
    if (creds.callbackUrl) return creds.callbackUrl;
    return callbackUrl(req, 'slack');
}

async function getAuthUrl(userId, redirectUri) {
    const creds = await getCreds();
    const params = new URLSearchParams({
        client_id: creds.clientId,
        scope: SCOPES.join(','),
        redirect_uri: redirectUri || (await getRedirectUri()),
        state: userId
    });
    return `${SLACK_AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code, redirectUri) {
    const creds = await getCreds();
    const body = new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        redirect_uri: redirectUri || (await getRedirectUri())
    });
    const { data } = await axios.post(SLACK_TOKEN_URL, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (!data.ok) {
        const err = new Error(data.error || 'Slack OAuth exchange failed');
        err.slack = data;
        throw err;
    }
    return data;
}

async function isAvailable() {
    const creds = await getCreds();
    return !!(creds.clientId && creds.clientSecret);
}

module.exports = {
    SCOPES,
    getCreds,
    getRedirectUri,
    getAuthUrl,
    exchangeCode,
    isAvailable
};
