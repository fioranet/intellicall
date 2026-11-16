/**
 * /api/whatsapp — WhatsApp numbers, their templates and chats, and sending.
 *
 *   GET  /config                   whether "Connect with Meta" (Embedded Signup) can run here
 *   POST /embedded-signup          finish connecting a number after Meta's popup
 *   accounts                       connect (manual mode), list, get, update, refresh, disconnect
 *   templates                      list, create and delete a number's templates, sync them
 *   POST /messages                 send now, or schedule (`sendAt`)
 *   conversations                  the chats agents have had, with their messages
 *   scheduled-messages             reminders and follow-ups waiting to go, and cancelling one
 *   GET  /media/:messageId         a kept inbound media file, for the inbox
 *
 * Every send goes through services/whatsapp/send.js, which applies WhatsApp's rules.
 */
const express = require('express');
const joi = require('joi');
const path = require('path');
const { Types } = require('mongoose');
const { auth, requireActivePlan } = require('../middleware/auth');
const checkLimit = require('../middleware/limit-checker');
const { requireFeature } = require('../middleware/limit-checker');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const WhatsAppContact = require('../models/WhatsAppContact');
const WhatsAppConversation = require('../models/WhatsAppConversation');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const ScheduledWhatsAppMessage = require('../models/ScheduledWhatsAppMessage');
const Agent = require('../models/Agent');
const { embeddedSignupConfig } = require('../services/whatsapp/config');
const {
    AccountError, connectManual, connectEmbeddedSignup, refreshAccount, syncTemplates, disconnectAccount, webhookUrlFor,
    createTemplate, deleteTemplate,
} = require('../services/whatsapp/accounts');
const { sendOutbound } = require('../services/whatsapp/send');
const { mediaPath } = require('../services/whatsapp/media');

const router = express.Router();

const objectId = joi.string().pattern(/^[a-f\d]{24}$/i);
const MAX_SCHEDULE_MS = 30 * 86400_000;

const owned = (req) => ({ createdBy: new Types.ObjectId(String(req.user._id)) });

function fail(res, err) {
    if (err && err.isJoi) return res.status(400).json({ status: 'error', message: (err.details && err.details[0] && err.details[0].message) || err.message });
    if (err instanceof AccountError) return res.status(err.status).json({ status: 'error', code: err.code, message: err.message, param: err.param });
    const status = err && err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('[whatsapp]', err);
    return res.status(status).json({ status: 'error', message: status === 500 ? 'Something went wrong.' : err.message });
}

function accountJson(doc, req) {
    const s = doc.settings || {};
    return {
        _id: String(doc._id),
        name: doc.name || '',
        displayPhoneNumber: doc.displayPhoneNumber || '',
        verifiedName: doc.verifiedName || '',
        phoneNumberId: doc.phoneNumberId,
        wabaId: doc.wabaId,
        qualityRating: doc.qualityRating || 'UNKNOWN',
        messagingLimitTier: doc.messagingLimitTier || null,
        connection: doc.tokenSource,
        coexistence: Boolean(doc.coexistence),
        status: doc.status,
        lastError: doc.lastError || null,
        tokenExpiresAt: doc.tokenExpiresAt || null,
        webhook: {
            status: doc.webhookStatus || 'pending',
            lastReceivedAt: doc.lastWebhookAt || null,
            url: webhookUrlFor(doc, req),
            // A manual number in the platform's own Meta app has no door of its own.
            ownDoor: Boolean(doc.tokenSource === 'manual' && doc.hookId),
        },
        inboundAgentId: doc.inboundAgentId ? String(doc.inboundAgentId) : null,
        settings: {
            messagingEnabled: s.messagingEnabled !== false,
            voiceNoteReplies: s.voiceNoteReplies !== false,
            typingIndicator: s.typingIndicator !== false,
            inactivityMinutes: s.inactivityMinutes ?? 15,
            fallbackReply: s.offlineReply || '',
            humanPauseMinutes: s.humanPauseMinutes ?? 30,
        },
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

function templateJson(doc) {
    return {
        _id: String(doc._id),
        accountId: String(doc.accountId),
        name: doc.name,
        language: doc.language,
        category: doc.category || null,
        status: doc.status || null,
        body: doc.bodyText || '',
        parameterCount: doc.bodyParamCount || 0,
        parameterNames: doc.bodyParamNames || [],
        headerFormat: doc.headerFormat || null,
        syncedAt: doc.syncedAt,
    };
}

function messageJson(doc) {
    const hasError = doc.error && (doc.error.code != null || doc.error.title);
    return {
        _id: String(doc._id),
        accountId: String(doc.accountId),
        conversationId: doc.conversationId ? String(doc.conversationId) : null,
        wamid: doc.wamid || null,
        direction: doc.direction,
        type: doc.type,
        text: doc.text || '',
        transcript: doc.transcript || null,
        voice: Boolean(doc.voice),
        hasMedia: Boolean(doc.media && doc.media.storageKey),
        mediaMimeType: (doc.media && doc.media.mimeType) || null,
        mediaFilename: (doc.media && doc.media.filename) || null,
        origin: doc.origin,
        status: doc.status,
        error: hasError ? { code: doc.error.code ?? null, message: doc.error.title || null } : null,
        template: doc.template && doc.template.name ? { name: doc.template.name, language: doc.template.language || null, category: doc.template.category || null } : null,
        pricing: doc.pricing && doc.pricing.category ? { category: doc.pricing.category, billable: doc.pricing.billable ?? null, type: doc.pricing.type || null } : null,
        metaCostMicros: doc.metaCostMicros || 0,
        createdAt: doc.createdAt,
    };
}

function conversationJson(doc, contact, messages) {
    return {
        _id: String(doc._id),
        accountId: String(doc.accountId),
        agentId: doc.agentId ? String(doc.agentId) : null,
        contact: {
            waId: (contact && contact.waId) || '',
            name: (contact && contact.profileName) || '',
            leadId: contact && contact.leadId ? String(contact.leadId) : null,
            optedOut: Boolean(contact && contact.optedOut),
        },
        status: doc.status,
        startedAt: doc.startedAt,
        lastMessageAt: doc.lastMessageAt,
        closedReason: doc.closedReason || null,
        messageCount: doc.messageCount || 0,
        metaCostMicros: doc.metaCostMicros || 0,
        toolCalls: doc.toolCalls || [],
        ...(messages ? { messages: messages.map(messageJson) } : {}),
    };
}

function scheduledJson(doc, contact) {
    const p = doc.payload || {};
    return {
        _id: String(doc._id),
        accountId: String(doc.accountId),
        to: (contact && contact.waId) || '',
        purpose: doc.purpose,
        sendAt: doc.sendAt,
        status: doc.status,
        attempts: doc.attempts || 0,
        lastError: doc.lastError || null,
        text: p.text || null,
        template: p.template && p.template.name ? { name: p.template.name, language: p.template.language || null, parameters: p.template.parameters || [] } : null,
        messageId: doc.messageId ? String(doc.messageId) : null,
        createdAt: doc.createdAt,
    };
}

async function findAccount(req, id = req.params.id) {
    if (!id || !/^[a-f\d]{24}$/i.test(String(id))) return null;
    return WhatsAppAccount.findOne({ _id: id, ...owned(req) }).lean();
}

async function assertOwnedAgent(req, agentId) {
    if (!agentId) return;
    const ok = await Agent.exists({ _id: agentId, createdBy: req.user._id });
    if (!ok) throw Object.assign(new Error('You do not own this agent.'), { status: 403 });
}

const gate = [auth, requireFeature('whatsapp')];

// ─── Config and Embedded Signup ─────────────────────────────────────────────

router.get('/config', auth, async (req, res) => {
    try {
        const cfg = await embeddedSignupConfig();
        res.json({ status: 'success', data: { embeddedSignup: { enabled: cfg.enabled, appId: cfg.appId, configId: cfg.configId, graphVersion: cfg.graphVersion }, webhookBase: require('../utils/public-url').externalOrigin(req) } });
    } catch (err) { fail(res, err); }
});

const signupJoi = joi.object({
    code: joi.string().trim().min(10).max(2000).required(),
    wabaId: joi.string().trim().pattern(/^\d{5,30}$/).required(),
    phoneNumberId: joi.string().trim().pattern(/^\d{5,30}$/).required(),
    coexistence: joi.boolean(),
    inboundAgentId: objectId.allow('', null),
});

router.post('/embedded-signup', ...gate, requireActivePlan, async (req, res) => {
    try {
        const body = await signupJoi.validateAsync(req.body || {});
        const userId = req.user._id;
        const existing = await WhatsAppAccount.findOne({ phoneNumberId: body.phoneNumberId, createdBy: userId }).select('_id').lean();
        if (!existing) {
            // The limit middleware answers itself; run it by hand so a reconnect is never counted.
            const limited = await new Promise((resolve) => checkLimit('whatsappAccounts')(req, { status: (c) => ({ json: (b) => resolve({ c, b }) }) }, () => resolve(null)));
            if (limited) return res.status(limited.c).json(limited.b);
        }
        if (body.inboundAgentId) await assertOwnedAgent(req, body.inboundAgentId);
        const r = await connectEmbeddedSignup(userId, {
            code: body.code, wabaId: body.wabaId, phoneNumberId: body.phoneNumberId, coexistence: Boolean(body.coexistence),
            ...(body.inboundAgentId !== undefined ? { inboundAgentId: body.inboundAgentId || null } : {}),
        });
        res.status(r.created ? 201 : 200).json({ status: 'success', data: { account: accountJson(r.account, req) } });
    } catch (err) { fail(res, err); }
});

// ─── Accounts ────────────────────────────────────────────────────────────────

router.get('/accounts', auth, async (req, res) => {
    try {
        const docs = await WhatsAppAccount.find(owned(req)).sort({ createdAt: -1 }).lean();
        res.json({ status: 'success', data: { accounts: docs.map((d) => accountJson(d, req)) } });
    } catch (err) { fail(res, err); }
});

const manualJoi = joi.object({
    name: joi.string().trim().max(100).allow(''),
    accessToken: joi.string().trim().min(20).max(1000).required(),
    phoneNumberId: joi.string().trim().pattern(/^\d{5,30}$/).required(),
    wabaId: joi.string().trim().pattern(/^\d{5,30}$/).required(),
    appSecret: joi.string().trim().min(16).max(200).required(),
    inboundAgentId: objectId.allow('', null),
});

router.post('/accounts', ...gate, requireActivePlan, async (req, res) => {
    try {
        const body = await manualJoi.validateAsync(req.body || {});
        const userId = req.user._id;
        const existing = await WhatsAppAccount.findOne({ phoneNumberId: body.phoneNumberId, createdBy: userId }).select('_id').lean();
        if (!existing) {
            const limited = await new Promise((resolve) => checkLimit('whatsappAccounts')(req, { status: (c) => ({ json: (b) => resolve({ c, b }) }) }, () => resolve(null)));
            if (limited) return res.status(limited.c).json(limited.b);
        }
        if (body.inboundAgentId) await assertOwnedAgent(req, body.inboundAgentId);
        const r = await connectManual(userId, {
            accessToken: body.accessToken, phoneNumberId: body.phoneNumberId, wabaId: body.wabaId, appSecret: body.appSecret,
            name: body.name || null,
            ...(body.inboundAgentId !== undefined ? { inboundAgentId: body.inboundAgentId || null } : {}),
        });
        res.status(r.created ? 201 : 200).json({ status: 'success', data: { account: accountJson(r.account, req), verifyToken: r.verifyToken || '' } });
    } catch (err) { fail(res, err); }
});

router.get('/accounts/:id', auth, async (req, res) => {
    try {
        const doc = await findAccount(req);
        if (!doc) return res.status(404).json({ status: 'error', message: 'WhatsApp number not found' });
        res.json({ status: 'success', data: { account: accountJson(doc, req) } });
    } catch (err) { fail(res, err); }
});

const updateJoi = joi.object({
    name: joi.string().trim().max(100).allow(''),
    inboundAgentId: objectId.allow('', null),
    settings: joi.object({
        messagingEnabled: joi.boolean(),
        voiceNoteReplies: joi.boolean(),
        typingIndicator: joi.boolean(),
        inactivityMinutes: joi.number().integer().min(1).max(1440),
        fallbackReply: joi.string().max(1000).allow(''),
        humanPauseMinutes: joi.number().integer().min(0).max(1440),
    }),
});

router.patch('/accounts/:id', auth, async (req, res) => {
    try {
        const body = await updateJoi.validateAsync(req.body || {});
        const existing = await findAccount(req);
        if (!existing) return res.status(404).json({ status: 'error', message: 'WhatsApp number not found' });
        if (body.inboundAgentId) await assertOwnedAgent(req, body.inboundAgentId);
        const set = {};
        if (body.name !== undefined) set.name = body.name;
        if (body.inboundAgentId !== undefined) set.inboundAgentId = body.inboundAgentId || null;
        const map = { messagingEnabled: 'messagingEnabled', voiceNoteReplies: 'voiceNoteReplies', typingIndicator: 'typingIndicator', inactivityMinutes: 'inactivityMinutes', fallbackReply: 'offlineReply', humanPauseMinutes: 'humanPauseMinutes' };
        for (const [k, v] of Object.entries(body.settings || {})) if (v !== undefined && map[k]) set[`settings.${map[k]}`] = v;
        const doc = Object.keys(set).length
            ? await WhatsAppAccount.findOneAndUpdate({ _id: existing._id, ...owned(req) }, { $set: set }, { returnDocument: 'after' }).lean()
            : existing;
        res.json({ status: 'success', data: { account: accountJson(doc, req) } });
    } catch (err) { fail(res, err); }
});

router.delete('/accounts/:id', auth, async (req, res) => {
    try {
        const doc = await findAccount(req);
        if (!doc) return res.status(404).json({ status: 'error', message: 'WhatsApp number not found' });
        await disconnectAccount(doc);
        res.json({ status: 'success', message: 'WhatsApp number disconnected' });
    } catch (err) { fail(res, err); }
});

router.post('/accounts/:id/refresh', auth, async (req, res) => {
    try {
        const doc = await findAccount(req);
        if (!doc) return res.status(404).json({ status: 'error', message: 'WhatsApp number not found' });
        res.json({ status: 'success', data: { account: accountJson(await refreshAccount(doc), req) } });
    } catch (err) { fail(res, err); }
});

// ─── Templates ───────────────────────────────────────────────────────────────

router.get('/templates', auth, async (req, res) => {
    try {
        const account = await findAccount(req, req.query.accountId);
        if (!account) return res.status(404).json({ status: 'error', message: 'WhatsApp number not found' });
        const status = req.query.status ? String(req.query.status).toUpperCase() : null;
        const docs = await WhatsAppTemplate.find({ accountId: account._id, ...(status ? { status } : {}) }).sort({ name: 1, language: 1 }).limit(500).lean();
        res.json({ status: 'success', data: { templates: docs.map(templateJson) } });
    } catch (err) { fail(res, err); }
});

router.post('/templates/sync', auth, async (req, res) => {
    try {
        const account = await findAccount(req, req.body && req.body.accountId);
        if (!account) return res.status(404).json({ status: 'error', message: 'WhatsApp number not found' });
        await syncTemplates(account);
        const docs = await WhatsAppTemplate.find({ accountId: account._id }).sort({ name: 1, language: 1 }).limit(500).lean();
        res.json({ status: 'success', data: { templates: docs.map(templateJson) } });
    } catch (err) { fail(res, err); }
});

const templateJoi = joi.object({
    accountId: objectId.required(),
    name: joi.string().trim().pattern(/^[a-z0-9_]{1,512}$/).required().messages({ 'string.pattern.base': 'Lowercase letters, digits and underscores only.' }),
    language: joi.string().trim().pattern(/^[a-z]{2,3}(_[A-Z]{2})?$/).default('en_US'),
    category: joi.string().valid('UTILITY', 'MARKETING').required(),
    header: joi.string().trim().max(60).allow(''),
    body: joi.string().trim().min(1).max(1024).required(),
    examples: joi.array().items(joi.string().trim().min(1).max(200)).max(20).default([]),
    footer: joi.string().trim().max(60).allow(''),
});

function checkTemplateBody(t) {
    const found = [...t.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
    const count = new Set(found).size;
    for (let i = 1; i <= count; i++) if (!found.includes(i)) return `Placeholders must be numbered {{1}} to {{${count}}} with none missing.`;
    if (/\{\{\s*[^}\d\s][^}]*\}\}/.test(t.body)) return 'Use numbered placeholders, {{1}}, {{2}}, ….';
    if (t.examples.length !== count) return `Give one example value for each of the ${count} placeholders.`;
    return null;
}

router.post('/templates', ...gate, async (req, res) => {
    try {
        const body = await templateJoi.validateAsync(req.body || {});
        const problem = checkTemplateBody(body);
        if (problem) return res.status(400).json({ status: 'error', message: problem });
        const account = await findAccount(req, body.accountId);
        if (!account) return res.status(404).json({ status: 'error', message: 'WhatsApp number not found' });
        const doc = await createTemplate(account, {
            name: body.name, language: body.language, category: body.category,
            header: body.header || undefined, body: body.body, examples: body.examples, footer: body.footer || undefined,
        });
        res.status(201).json({ status: 'success', data: { template: templateJson(doc) } });
    } catch (err) { fail(res, err); }
});

router.delete('/templates/:id', auth, async (req, res) => {
    try {
        const template = await WhatsAppTemplate.findOne({ _id: req.params.id, ...owned(req) }).lean();
        if (!template) return res.status(404).json({ status: 'error', message: 'Template not found' });
        const account = await findAccount(req, String(template.accountId));
        if (!account) return res.status(404).json({ status: 'error', message: 'WhatsApp number not found' });
        await deleteTemplate(account, template);
        res.json({ status: 'success', message: 'Template deleted' });
    } catch (err) { fail(res, err); }
});

// ─── Sending ─────────────────────────────────────────────────────────────────

const sendJoi = joi.object({
    accountId: objectId.required(),
    to: joi.string().trim().pattern(/^\+?\d{8,15}$/).required(),
    text: joi.string().trim().min(1).max(4096),
    template: joi.object({
        name: joi.string().trim().min(1).max(512).required(),
        language: joi.string().trim().max(20).allow('', null),
        parameters: joi.array().items(joi.string().max(1024)).max(30),
    }),
    sendAt: joi.date().iso(),
}).xor('text', 'template');

router.post('/messages', ...gate, requireActivePlan, checkLimit('whatsappMessages'), async (req, res) => {
    try {
        const body = await sendJoi.validateAsync(req.body || {});
        const account = await findAccount(req, body.accountId);
        if (!account) return res.status(404).json({ status: 'error', message: 'WhatsApp number not found' });
        if (account.status !== 'connected') return res.status(400).json({ status: 'error', code: 'account_disconnected', message: 'This WhatsApp number is not connected. Connect it again first.' });
        const waId = body.to.replace(/\D/g, '');
        const contact = await WhatsAppContact.findOneAndUpdate(
            { accountId: account._id, waId },
            { $setOnInsert: { createdBy: account.createdBy, accountId: account._id, waId } },
            { upsert: true, returnDocument: 'after' },
        ).lean();
        const payload = body.template
            ? { kind: 'template', name: body.template.name, language: body.template.language || null, parameters: body.template.parameters || [] }
            : { kind: 'text', text: body.text };

        if (body.sendAt) {
            const at = new Date(body.sendAt);
            if (at.getTime() <= Date.now() + 30_000) return res.status(400).json({ status: 'error', code: 'send_at_past', message: 'The send time must be in the future.' });
            if (at.getTime() > Date.now() + MAX_SCHEDULE_MS) return res.status(400).json({ status: 'error', code: 'send_at_too_far', message: 'Messages can be scheduled up to 30 days ahead.' });
            const row = await ScheduledWhatsAppMessage.create({
                createdBy: account.createdBy, accountId: account._id, contactId: contact._id, purpose: 'api', sendAt: at,
                payload: payload.kind === 'template' ? { template: { name: payload.name, language: payload.language, parameters: payload.parameters } } : { text: payload.text },
            });
            return res.status(201).json({ status: 'success', data: { sent: null, scheduled: scheduledJson(row.toObject(), contact) } });
        }

        const conv = await WhatsAppConversation.findOne({ contactId: contact._id, status: 'open' }).select('_id').lean();
        const r = await sendOutbound(account, contact, payload, { origin: 'api', conversationId: conv ? conv._id : null, allowMarketing: true });
        if (!r.ok) return res.status(r.code === 'rate_limited' ? 429 : 400).json({ status: 'error', code: r.code, message: r.reason });
        const message = await WhatsAppMessage.findById(r.messageId).lean();
        res.status(201).json({ status: 'success', data: { sent: messageJson(message), scheduled: null } });
    } catch (err) { fail(res, err); }
});

// ─── Conversations ───────────────────────────────────────────────────────────

router.get('/conversations', auth, async (req, res) => {
    try {
        const filter = { ...owned(req) };
        if (req.query.accountId && /^[a-f\d]{24}$/i.test(req.query.accountId)) filter.accountId = req.query.accountId;
        if (req.query.agentId && /^[a-f\d]{24}$/i.test(req.query.agentId)) filter.agentId = req.query.agentId;
        if (req.query.status === 'open' || req.query.status === 'closed') filter.status = req.query.status;
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const docs = await WhatsAppConversation.find(filter).sort({ lastMessageAt: -1 }).limit(limit).lean();
        const contacts = await WhatsAppContact.find({ _id: { $in: docs.map((d) => d.contactId) } }).lean();
        const byId = new Map(contacts.map((c) => [String(c._id), c]));
        res.json({ status: 'success', data: { conversations: docs.map((d) => conversationJson(d, byId.get(String(d.contactId)))) } });
    } catch (err) { fail(res, err); }
});

router.get('/conversations/:id', auth, async (req, res) => {
    try {
        const doc = await WhatsAppConversation.findOne({ _id: req.params.id, ...owned(req) }).lean();
        if (!doc) return res.status(404).json({ status: 'error', message: 'Conversation not found' });
        const [contact, messages] = await Promise.all([
            WhatsAppContact.findById(doc.contactId).lean(),
            WhatsAppMessage.find({ conversationId: doc._id }).sort({ createdAt: -1 }).limit(200).lean(),
        ]);
        res.json({ status: 'success', data: { conversation: conversationJson(doc, contact, messages.reverse()) } });
    } catch (err) { fail(res, err); }
});

/** A kept inbound media file (a photo, a voice note), for the inbox. */
router.get('/media/:messageId', auth, async (req, res) => {
    try {
        const msg = await WhatsAppMessage.findOne({ _id: req.params.messageId, ...owned(req) }).select('media accountId').lean();
        if (!msg || !msg.media || !msg.media.storageKey) return res.status(404).json({ status: 'error', message: 'No file for this message' });
        res.type(msg.media.mimeType || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.sendFile(mediaPath(msg.accountId, msg._id), (err) => { if (err && !res.headersSent) res.status(404).end(); });
    } catch (err) { fail(res, err); }
});

// ─── Scheduled ───────────────────────────────────────────────────────────────

router.get('/scheduled-messages', auth, async (req, res) => {
    try {
        const filter = { ...owned(req) };
        if (req.query.accountId && /^[a-f\d]{24}$/i.test(req.query.accountId)) filter.accountId = req.query.accountId;
        if (['pending', 'sending', 'sent', 'failed', 'canceled'].includes(req.query.status)) filter.status = req.query.status;
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const docs = await ScheduledWhatsAppMessage.find(filter).sort({ sendAt: -1 }).limit(limit).lean();
        const contacts = await WhatsAppContact.find({ _id: { $in: docs.map((d) => d.contactId) } }).select('waId').lean();
        const byId = new Map(contacts.map((c) => [String(c._id), c]));
        res.json({ status: 'success', data: { scheduled: docs.map((d) => scheduledJson(d, byId.get(String(d.contactId)))) } });
    } catch (err) { fail(res, err); }
});

router.delete('/scheduled-messages/:id', auth, async (req, res) => {
    try {
        const r = await ScheduledWhatsAppMessage.updateOne({ _id: req.params.id, ...owned(req), status: 'pending' }, { $set: { status: 'canceled', lastError: 'Canceled.' } });
        if (r.matchedCount === 0) {
            const exists = await ScheduledWhatsAppMessage.exists({ _id: req.params.id, ...owned(req) });
            if (!exists) return res.status(404).json({ status: 'error', message: 'Scheduled message not found' });
            return res.status(409).json({ status: 'error', code: 'not_pending', message: 'This message has already been sent, or is being sent, or was canceled.' });
        }
        res.json({ status: 'success', message: 'Canceled' });
    } catch (err) { fail(res, err); }
});

module.exports = router;
module.exports.accountJson = accountJson;
