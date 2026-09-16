const AdminSettings = require('../models/AdminSettings');

/**
 * Google OAuth credentials, shared by the Calendar and Sheets integrations.
 *
 * Both integrations authenticate against the same Google Cloud OAuth client, so
 * the credentials live in one place. AdminSettings wins over the environment,
 * matching HubSpot and Slack (utils/hubspot.js, utils/slack.js): an admin can
 * fix a wrong client id from Admin → Integrations without shell access, and
 * without the "edited .env but the process kept the old value" class of problem
 * that a restart-only workflow creates.
 */
async function getCreds() {
    try {
        const admin = await AdminSettings.findOne().lean();
        const g = admin?.integrations?.google || {};
        return {
            clientId: g.clientId || process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: g.clientSecret || process.env.GOOGLE_CLIENT_SECRET || ''
        };
    } catch {
        return {
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
        };
    }
}

/** Unfilled .env.example values, in every casing the templates have shipped. */
const isPlaceholder = (v) => !v || /^your[_-]/i.test(String(v).trim());

/**
 * Google client ids always end in `.apps.googleusercontent.com`. Checking the
 * shape here is what turns the most common misconfiguration into something the
 * admin can act on: pasting a project number, an API key, or the client secret
 * into GOOGLE_CLIENT_ID sends the user to Google, which answers with a bare
 * "Access blocked: Authorization Error / Error 401: invalid_client — The OAuth
 * client was not found" on Google's own domain, where we cannot explain it.
 */
const looksLikeClientId = (v) => /\.apps\.googleusercontent\.com$/.test(String(v || '').trim());

/**
 * Why the integration cannot start an OAuth flow, or '' when it can.
 * The string is a status code the settings page maps to a localised message.
 */
function credentialProblem(creds) {
    if (isPlaceholder(creds.clientId) || isPlaceholder(creds.clientSecret)) return 'not_configured';
    if (!looksLikeClientId(creds.clientId)) return 'invalid_client_id';
    return '';
}

module.exports = { getCreds, credentialProblem, isPlaceholder, looksLikeClientId };
