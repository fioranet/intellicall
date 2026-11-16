/**
 * The platform's Meta app for WhatsApp: Embedded Signup and the shared webhook
 * door. Admin → Integrations → Meta wins over the env vars; either may be unset,
 * in which case numbers are connected manually with the user's own Meta app.
 */
const AdminSettings = require('../../models/AdminSettings');

let cache = null;
let cachedAt = 0;
const TTL_MS = 60_000;

function fromEnv() {
    return {
        appId: process.env.META_APP_ID || '',
        appSecret: process.env.META_APP_SECRET || '',
        esConfigId: process.env.META_ES_CONFIG_ID || '',
        webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
        systemUserToken: process.env.META_SYSTEM_USER_TOKEN || '',
        systemUserId: process.env.META_SYSTEM_USER_ID || '',
    };
}

/** @returns {Promise<{appId: string, appSecret: string, esConfigId: string, webhookVerifyToken: string, systemUserToken: string, systemUserId: string}>} */
async function metaConfig() {
    if (cache && Date.now() - cachedAt < TTL_MS) return cache;
    const env = fromEnv();
    let admin = {};
    try {
        const doc = await AdminSettings.findOne().select('integrations.meta').lean();
        admin = (doc && doc.integrations && doc.integrations.meta) || {};
    } catch (_) { /* fall back to env */ }
    cache = {
        appId: admin.appId || env.appId,
        appSecret: admin.appSecret || env.appSecret,
        esConfigId: admin.esConfigId || env.esConfigId,
        webhookVerifyToken: admin.webhookVerifyToken || env.webhookVerifyToken,
        systemUserToken: admin.systemUserToken || env.systemUserToken,
        systemUserId: admin.systemUserId || env.systemUserId,
    };
    cachedAt = Date.now();
    return cache;
}

function invalidate() { cache = null; cachedAt = 0; }

/** Whether Embedded Signup can run on this server. */
async function embeddedSignupConfig() {
    const c = await metaConfig();
    const { graphVersion } = require('./graph');
    const ready = Boolean(c.appId && c.esConfigId && c.appSecret && c.webhookVerifyToken);
    return { enabled: ready, appId: ready ? c.appId : null, configId: ready ? c.esConfigId : null, graphVersion: graphVersion() };
}

module.exports = { metaConfig, embeddedSignupConfig, invalidate };
