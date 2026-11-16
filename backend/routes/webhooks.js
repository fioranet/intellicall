/**
 * Public webhooks from third parties. Mounted at /api/webhooks with no auth:
 * each route proves the sender its own way.
 *
 *   POST /attendee/:token              bot state changes from an owner's Attendee (meetings)
 *   GET/POST /whatsapp                 Meta's WhatsApp webhooks for the platform's own Meta app
 *   GET/POST /whatsapp/a/:hookId       one manual WhatsApp account's own Meta app
 *
 * WhatsApp: every POST is checked against X-Hub-Signature-256 (HMAC-SHA256 of
 * the exact bytes, kept as req.rawBody by server.js's parser) and refused
 * otherwise, failing closed when no secret is configured. A verified body is
 * saved and answered at once; Meta retries anything slower than a few seconds,
 * and the work (a model turn, a voice note) takes longer than that.
 *
 * Attendee: each bot is created with its own webhook URL, and the token in it
 * is random per meeting and stored only as a hash on the CallLog, so the URL
 * alone says which call an event is about and nobody can guess another's. When
 * the owner also gave us their Attendee project's webhook secret, the
 * X-Webhook-Signature header is checked too, as Attendee documents it:
 * base64(HMAC-SHA256(base64-decoded secret, the payload as JSON with sorted
 * keys and no spaces)). A body must also name the bot the call was created with.
 * Unknown tokens answer 404, which Attendee retries three times and then stops.
 */
const express = require('express');
const crypto = require('crypto');
const CallLog = require('../models/CallLog');
const MeetingIntegration = require('../models/MeetingIntegration');
const { open } = require('../utils/credentials');
const { hashWebhookToken } = require('../meetings/token');
const { meetingStateChanged } = require('../meetings/session');

const router = express.Router();

/** Python's json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")). */
function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

function attendeeSignature(payload, secretBase64) {
    return crypto.createHmac('sha256', Buffer.from(secretBase64, 'base64')).update(canonicalJson(payload), 'utf8').digest('base64');
}

function signatureMatches(payload, header, secretBase64) {
    if (typeof header !== 'string' || !header) return false;
    const expected = Buffer.from(attendeeSignature(payload, secretBase64));
    const got = Buffer.from(header);
    return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

router.post('/attendee/:token', async (req, res) => {
    try {
        const token = String(req.params.token || '');
        if (token.length < 20 || token.length > 100) return res.status(404).json({ ok: false });
        const log = await CallLog.findOne({ 'meeting.webhookTokenHash': hashWebhookToken(token), provider: 'meeting' }).lean();
        if (!log) return res.status(404).json({ ok: false });

        const body = req.body || {};
        const integration = await MeetingIntegration.findOne({ createdBy: log.userId, provider: 'attendee' }).lean();
        const secret = integration && integration.webhookSecretEncrypted ? open(integration.webhookSecretEncrypted, 'MeetingIntegration.webhookSecret') : '';
        if (secret && !signatureMatches(body, req.get('x-webhook-signature'), secret)) {
            console.warn(`[attendee] webhook for ${log.callSid} failed its signature check`);
            return res.status(401).json({ ok: false });
        }
        if (log.meeting && log.meeting.botId && body.bot_id !== log.meeting.botId) {
            return res.status(409).json({ ok: false });
        }
        if (body.trigger === 'bot.state_change' && body.data && typeof body.data === 'object') {
            await meetingStateChanged(log, body.data);
        }
        return res.json({ ok: true });
    } catch (err) {
        console.error('[attendee] webhook failed:', err.message);
        return res.status(500).json({ ok: false });
    }
});

// ─── WhatsApp (Meta) ─────────────────────────────────────────────────────────

const WhatsAppAccount = require('../models/WhatsAppAccount');
const WhatsAppWebhookEvent = require('../models/WhatsAppWebhookEvent');

/** Constant-time string compare that is safe on different lengths. */
function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    if (x.length !== y.length) return false;
    return crypto.timingSafeEqual(x, y);
}

/** Whether `header` is a valid sha256 signature of `raw` with `secret`. */
function validSignature(raw, header, secret) {
    if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return safeEqual(header, expected);
}

/** The secrets for the door a request came in by, or null when that door is not configured. */
async function whatsappSecretsFor(hookId) {
    if (!hookId) {
        const { metaConfig } = require('../services/whatsapp/config');
        const c = await metaConfig();
        return c.appSecret && c.webhookVerifyToken ? { appSecret: c.appSecret, verifyToken: c.webhookVerifyToken, hookId: null } : null;
    }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(hookId)) return null;
    const account = await WhatsAppAccount.findOne({ hookId, tokenSource: 'manual' }).select('appSecretEncrypted verifyTokenEncrypted').lean();
    if (!account) return null;
    const appSecret = open(account.appSecretEncrypted, 'WhatsApp app secret');
    const verifyToken = open(account.verifyTokenEncrypted, 'WhatsApp verify token');
    return appSecret && verifyToken ? { appSecret, verifyToken, hookId } : null;
}

async function whatsappVerify(req, res) {
    const secrets = await whatsappSecretsFor(req.params.hookId);
    if (!secrets) return res.status(404).type('text/plain').send('not found');
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode !== 'subscribe' || typeof token !== 'string' || typeof challenge !== 'string' || !safeEqual(token, secrets.verifyToken)) {
        return res.status(403).type('text/plain').send('forbidden');
    }
    // Echoed verbatim, as text: Meta compares the body to what it sent.
    return res.status(200).type('text/plain').send(challenge.slice(0, 256));
}

async function whatsappReceive(req, res) {
    const secrets = await whatsappSecretsFor(req.params.hookId);
    if (!secrets) {
        if (!req.params.hookId) {
            console.error('[webhook/whatsapp] The Meta app secret or verify token is not set (Admin → Integrations → Meta, or META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN); refusing an unverifiable webhook.');
            return res.status(503).json({ error: 'webhook_not_configured' });
        }
        return res.status(404).json({ error: 'not_found' });
    }
    const raw = req.rawBody;
    if (!Buffer.isBuffer(raw)) {
        console.error('[webhook/whatsapp] no raw request body; the JSON parser in server.js must keep its verify hook.');
        return res.status(500).json({ error: 'raw_body_unavailable' });
    }
    if (!validSignature(raw, req.headers['x-hub-signature-256'], secrets.appSecret)) {
        return res.status(401).json({ error: 'invalid_signature' });
    }
    const body = req.body;
    if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
        return res.status(200).json({ received: true, ignored: true });
    }
    let id;
    try {
        const evt = await WhatsAppWebhookEvent.create({ hookId: secrets.hookId, body });
        id = String(evt._id);
    } catch (err) {
        console.error('[webhook/whatsapp] could not save an event:', err.message);
        return res.status(500).json({ error: 'save_failed' });
    }
    res.status(200).json({ received: true });
    setImmediate(() => {
        require('../services/whatsapp/ingest').processWebhookEvent(id)
            .catch((err) => console.error(`[webhook/whatsapp] event ${id} failed:`, err.message));
    });
}

router.get('/whatsapp', whatsappVerify);
router.get('/whatsapp/a/:hookId', whatsappVerify);
router.post('/whatsapp', whatsappReceive);
router.post('/whatsapp/a/:hookId', whatsappReceive);

module.exports = router;
module.exports.canonicalJson = canonicalJson;
module.exports.validSignature = validSignature;
module.exports.attendeeSignature = attendeeSignature;
