/**
 * Processing one saved webhook event from Meta (routes/webhooks.js).
 *
 * An event is claimed atomically, so the boot sweep and a fresh delivery never
 * handle it twice at once, and every handler below is idempotent by Meta's ids.
 *
 * Which account an entry belongs to is decided by the door it came in. A
 * manual account's hook may only reach that account, so a signed webhook from
 * one user's Meta app can never touch another user's number. The platform's
 * own door reaches the account with that number, however it was connected.
 */
const { handleInbound, handleEcho } = require('./inbound');

const WhatsAppAccount = require('../../models/WhatsAppAccount');
const WhatsAppWebhookEvent = require('../../models/WhatsAppWebhookEvent');
const WhatsAppMessage = require('../../models/WhatsAppMessage');
const WhatsAppConversation = require('../../models/WhatsAppConversation');
const WhatsAppTemplate = require('../../models/WhatsAppTemplate');

const MAX_ATTEMPTS = 5;
const STATUS_RANK = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** Meta's USD list rates per conversation category, by calling code, as a rough estimate. */
const META_RATES = {
    // [marketing, utility, authentication, service]
    '91': [0.0118, 0.0014, 0.0014, 0.0014],
    '1': [0.025, 0.004, 0.0135, 0.0088],
    '44': [0.0529, 0.022, 0.0358, 0.0388],
    '971': [0.0384, 0.0157, 0.0178, 0.0272],
    '966': [0.0455, 0.0115, 0.0178, 0.0193],
};
const DEFAULT_RATES = [0.0604, 0.0157, 0.0178, 0.0272];

function metaEstimate(recipient, pricing) {
    if (!pricing || pricing.billable === false) return 0;
    const digits = String(recipient || '').replace(/\D/g, '');
    const rates = META_RATES[digits.slice(0, 3)] || META_RATES[digits.slice(0, 2)] || META_RATES[digits.slice(0, 1)] || DEFAULT_RATES;
    const cat = String(pricing.category || '').toLowerCase();
    const idx = cat === 'marketing' ? 0 : cat === 'utility' ? 1 : cat === 'authentication' ? 2 : 3;
    return Math.round(rates[idx] * 1_000_000);
}

function scopeFilter(hookId) {
    return hookId ? { hookId, tokenSource: 'manual' } : {};
}

async function accountForNumber(hookId, phoneNumberId) {
    if (!phoneNumberId) return null;
    return WhatsAppAccount.findOne({ phoneNumberId, ...scopeFilter(hookId) }).lean();
}

/** One delivery status from Meta: sent, delivered, read or failed, with what Meta charged. */
async function handleStatus(account, st) {
    const wamid = String(st.id ?? '');
    if (!wamid) return;
    const msg = await WhatsAppMessage.findOne({ wamid, accountId: account._id }).lean();
    if (!msg) return; // sent from outside, e.g. WhatsApp Manager

    const status = String(st.status ?? '');
    const at = st.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date();
    const set = {};
    if (status in STATUS_RANK) {
        set[`statusAt.${status}`] = at;
        // Statuses can arrive out of order; the furthest one wins, and failed wins over all.
        if ((STATUS_RANK[status] ?? -1) > (STATUS_RANK[msg.status] ?? -1)) set.status = status;
    }
    const err = Array.isArray(st.errors) ? st.errors[0] : null;
    if (err) {
        set.error = { code: Number(err.code) || null, title: String(err.title ?? err.message ?? ''), detail: String((err.error_data && err.error_data.details) ?? err.message ?? '') };
    }
    if (Object.keys(set).length) await WhatsAppMessage.updateOne({ _id: msg._id }, { $set: set });

    // Pricing arrives with sent or delivered. Recorded once.
    const pricing = st.pricing;
    if (pricing && pricing.category) {
        const costMicros = metaEstimate(String(st.recipient_id ?? ''), pricing);
        const first = await WhatsAppMessage.updateOne(
            { _id: msg._id, 'pricing.category': null },
            {
                $set: {
                    pricing: { billable: pricing.billable ?? null, pricingModel: pricing.pricing_model ?? null, category: pricing.category, type: pricing.type ?? null },
                    metaCostMicros: costMicros,
                },
            },
        );
        if (first.modifiedCount === 1 && msg.conversationId && costMicros > 0) {
            await WhatsAppConversation.updateOne({ _id: msg.conversationId }, { $inc: { metaCostMicros: costMicros } });
        }
    }
}

async function handleChange(hookId, entry, change) {
    const v = change.value || {};
    switch (change.field) {
        case 'messages': {
            const account = await accountForNumber(hookId, String((v.metadata && v.metadata.phone_number_id) ?? ''));
            if (!account) return;
            await WhatsAppAccount.updateOne({ _id: account._id }, { $set: { webhookStatus: 'ok', lastWebhookAt: new Date() } });
            for (const m of v.messages || []) await handleInbound(account, m, v.contacts || []);
            for (const st of v.statuses || []) await handleStatus(account, st);
            return;
        }
        case 'smb_message_echoes': {
            const account = await accountForNumber(hookId, String((v.metadata && v.metadata.phone_number_id) ?? ''));
            if (!account) return;
            for (const e of v.message_echoes || []) await handleEcho(account, e);
            return;
        }
        case 'message_template_status_update': {
            const ids = await WhatsAppAccount.find({ wabaId: String(entry.id), ...scopeFilter(hookId) }).distinct('_id');
            if (!ids.length) return;
            await WhatsAppTemplate.updateMany(
                { accountId: { $in: ids }, $or: [{ metaId: String(v.message_template_id ?? '') }, { name: v.message_template_name, language: v.message_template_language }] },
                { $set: { status: String(v.event ?? '').toUpperCase(), syncedAt: new Date() } },
            );
            return;
        }
        case 'phone_number_quality_update': {
            const accounts = await WhatsAppAccount.find({ wabaId: String(entry.id), ...scopeFilter(hookId) }).lean();
            const shown = String(v.display_phone_number ?? '').replace(/\D/g, '');
            for (const a of accounts) {
                if (shown && String(a.displayPhoneNumber).replace(/\D/g, '') !== shown) continue;
                if (v.current_limit) await WhatsAppAccount.updateOne({ _id: a._id }, { $set: { messagingLimitTier: v.current_limit } });
                require('./accounts').refreshAccount(a).catch(() => undefined);
            }
            return;
        }
        case 'account_update': {
            const event = String(v.event ?? '');
            if (event !== 'PARTNER_REMOVED' && event !== 'ACCOUNT_DELETED') return;
            const wabaId = String((v.waba_info && v.waba_info.waba_id) || entry.id);
            const filter = { wabaId, ...scopeFilter(hookId) };
            const before = await WhatsAppAccount.find({ ...filter, status: { $ne: 'disconnected' } }).lean();
            await WhatsAppAccount.updateMany(
                filter,
                { $set: { status: 'disconnected', lastError: event === 'PARTNER_REMOVED' ? 'This app was removed from the WhatsApp account in Meta Business Suite. Connect it again to use it.' : 'Meta deleted this WhatsApp account.' } },
            );
            const { notifyDisconnected } = require('./accounts');
            for (const a of before) notifyDisconnected(a).catch(() => undefined);
            return;
        }
        default:
            return;
    }
}

/** Handle one saved event. Resolves when done; a failure is recorded and retried by the sweep. */
async function processWebhookEvent(id) {
    const evt = await WhatsAppWebhookEvent.findOneAndUpdate(
        { _id: id, status: { $in: ['received', 'failed'] }, attempts: { $lt: MAX_ATTEMPTS } },
        { $set: { status: 'processing' }, $inc: { attempts: 1 } },
        { returnDocument: 'after' },
    ).lean();
    if (!evt) return;
    try {
        for (const entry of (evt.body && evt.body.entry) || []) {
            for (const change of entry.changes || []) await handleChange(evt.hookId || null, entry, change);
        }
        await WhatsAppWebhookEvent.updateOne({ _id: evt._id }, { $set: { status: 'processed', error: null } });
    } catch (err) {
        await WhatsAppWebhookEvent.updateOne({ _id: evt._id }, { $set: { status: 'failed', error: String(err.message).slice(0, 500) } });
        throw err;
    }
}

/** Events saved but not processed when the last process stopped, or that failed and may be retried. */
async function sweepPendingEvents() {
    const stale = new Date(Date.now() - 5 * 60_000);
    await WhatsAppWebhookEvent.updateMany({ status: 'processing', receivedAt: { $lt: stale } }, { $set: { status: 'received' } });
    const rows = await WhatsAppWebhookEvent.find({ status: { $in: ['received', 'failed'] }, attempts: { $lt: MAX_ATTEMPTS } })
        .sort({ receivedAt: 1 }).limit(500).select('_id').lean();
    for (const r of rows) {
        await processWebhookEvent(String(r._id)).catch((err) => console.error(`[whatsapp] sweep: event ${String(r._id)} failed:`, err.message));
    }
    return rows.length;
}

module.exports = { processWebhookEvent, sweepPendingEvents, handleStatus, metaEstimate };
