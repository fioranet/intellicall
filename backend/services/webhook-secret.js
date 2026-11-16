/**
 * The account's webhook signing secret, made on first need.
 *
 * Event webhooks and webhook tools are both signed with `Settings.webhooks.secret`,
 * and only two routes ever created one (legacy settings GET and
 * `POST /v1/webhook/rotate-secret`), neither reachable from the console. An
 * account configured through `/v1` PATCH or the console's tool form therefore
 * sent events signed with an empty key, which anyone can forge, and tool calls
 * with no signature header at all. Every signer now goes through here, and
 * `sign()` refuses an empty key outright.
 */

const crypto = require('crypto');
const Settings = require('../models/Settings');

function newWebhookSecret() {
    return `whsec_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Return the account's secret, creating it if it has none. Atomic: two
 * deliveries racing on a fresh account agree on one secret, because only the
 * update that finds the field empty writes, and both then read what was kept.
 */
async function ensureWebhookSecret(userId) {
    const existing = await Settings.findOne({ userId }).select('webhooks.secret').lean();
    if (existing?.webhooks?.secret) return existing.webhooks.secret;

    const secret = newWebhookSecret();
    const empty = { $or: [{ 'webhooks.secret': { $exists: false } }, { 'webhooks.secret': { $in: ['', null] } }] };
    await Settings.updateOne(
        { userId, ...empty },
        { $set: { 'webhooks.secret': secret }, $setOnInsert: { userId } },
        { upsert: !existing },
    ).catch((err) => {
        // A concurrent upsert of the same account loses the unique race; the
        // winner's secret is read back below.
        if (err.code !== 11000) throw err;
    });
    const kept = await Settings.findOne({ userId }).select('webhooks.secret').lean();
    return kept?.webhooks?.secret || secret;
}

module.exports = { ensureWebhookSecret, newWebhookSecret };
