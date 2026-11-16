/**
 * The WhatsApp ticker: scheduled sends, and closing chats that went quiet.
 * Hourly beside it, the daily per-number health check (accounts.js), and the
 * boot sweep of webhook events left unprocessed (ingest.js).
 *
 * Every 30 seconds, beside the campaign scheduler. A due row is claimed with
 * one atomic update, so two ticks never send it twice. A send that fails for a
 * passing reason (rate limit, Meta unavailable) is retried up to three times,
 * five then ten minutes later; one that can never succeed fails with the reason.
 *
 * Free text scheduled from the console needs the 24-hour window to still be
 * open when it goes; outside it, the send fails rather than sending something
 * the owner did not write.
 */
const { sendOutbound } = require('./send');
const { checkAccountHealth } = require('./accounts');

const ScheduledWhatsAppMessage = require('../../models/ScheduledWhatsAppMessage');
const WhatsAppAccount = require('../../models/WhatsAppAccount');
const WhatsAppContact = require('../../models/WhatsAppContact');
const WhatsAppConversation = require('../../models/WhatsAppConversation');
const Agent = require('../../models/Agent');

const TICK_MS = 30_000;
const BATCH = 50;
const MAX_ATTEMPTS = 3;
const TRANSIENT = new Set(['rate_limited', 'meta_error', 'plan_limit']);
const HEALTH_TICK_MS = 60 * 60_000;

let timer = null;
let healthTimer = null;
let running = false;

function start() {
    if (timer) return;
    timer = setInterval(() => { tick().catch(() => undefined); }, TICK_MS);
    if (typeof timer.unref === 'function') timer.unref();
    healthTimer = setInterval(() => {
        checkAccountHealth().catch((err) => console.error('[whatsapp] health check failed:', err.message));
    }, HEALTH_TICK_MS);
    if (typeof healthTimer.unref === 'function') healthTimer.unref();
    // Webhook events saved before the last restart and never processed.
    setTimeout(() => {
        require('./ingest').sweepPendingEvents().catch((err) => console.error('[whatsapp] event sweep failed:', err.message));
    }, 5_000);
    console.log('[WhatsApp] Scheduler started (sends every 30 s, health check hourly)');
}

function stop() {
    if (timer) clearInterval(timer);
    if (healthTimer) clearInterval(healthTimer);
    timer = null;
    healthTimer = null;
}

async function tick(now = new Date()) {
    if (running) return { sent: 0, failed: 0, closed: 0 };
    running = true;
    try {
        // A row left `sending` by a process that died mid-send goes back in the queue.
        await ScheduledWhatsAppMessage.updateMany(
            { status: 'sending', claimedAt: { $lt: new Date(now.getTime() - 10 * 60_000) } },
            { $set: { status: 'pending' } },
        );
        let sent = 0;
        let failed = 0;
        for (let i = 0; i < BATCH; i++) {
            const row = await ScheduledWhatsAppMessage.findOneAndUpdate(
                { status: 'pending', sendAt: { $lte: now } },
                { $set: { status: 'sending', claimedAt: new Date() }, $inc: { attempts: 1 } },
                { sort: { sendAt: 1 }, returnDocument: 'after' },
            ).lean();
            if (!row) break;
            const ok = await sendOne(row).catch((err) => {
                console.error(`[whatsapp] scheduled ${String(row._id)} failed:`, err.message);
                return finish(row, { ok: false, code: 'meta_error', reason: err.message });
            });
            if (ok) sent++; else failed++;
        }
        const closed = await closeIdle(now);
        return { sent, failed, closed };
    } catch (err) {
        console.error('[whatsapp] scheduler tick failed:', err.message);
        return { sent: 0, failed: 0, closed: 0 };
    } finally {
        running = false;
    }
}

async function finish(row, r) {
    if (r.ok) {
        await ScheduledWhatsAppMessage.updateOne({ _id: row._id }, { $set: { status: 'sent', sentAt: new Date(), messageId: r.messageId, lastError: null } });
        return true;
    }
    if (TRANSIENT.has(r.code) && row.attempts < MAX_ATTEMPTS) {
        await ScheduledWhatsAppMessage.updateOne({ _id: row._id }, {
            $set: { status: 'pending', sendAt: new Date(Date.now() + row.attempts * 5 * 60_000), lastError: r.reason },
        });
        return false;
    }
    await ScheduledWhatsAppMessage.updateOne({ _id: row._id }, { $set: { status: 'failed', lastError: r.reason } });
    return false;
}

async function sendOne(row) {
    const [account, contact, agent] = await Promise.all([
        WhatsAppAccount.findOne({ _id: row.accountId, createdBy: row.createdBy }).lean(),
        WhatsAppContact.findOne({ _id: row.contactId, accountId: row.accountId }).lean(),
        row.agentId ? Agent.findOne({ _id: row.agentId, createdBy: row.createdBy }).select('whatsapp').lean() : null,
    ]);
    if (!account) return finish(row, { ok: false, code: 'account_disconnected', reason: 'The number is no longer connected.' });
    if (!contact) return finish(row, { ok: false, code: 'no_contact', reason: 'The recipient is no longer on record.' });

    const conv = await WhatsAppConversation.findOne({ contactId: contact._id, status: 'open' }).select('_id').lean();
    const p = row.payload || {};
    const payload = p.template && p.template.name
        ? { kind: 'template', name: p.template.name, language: p.template.language, parameters: p.template.parameters || [] }
        : { kind: 'text', text: String(p.text ?? '') };
    if (payload.kind === 'text' && !payload.text.trim()) return finish(row, { ok: false, code: 'empty', reason: 'Nothing to send.' });

    const r = await sendOutbound(account, contact, payload, {
        origin: 'scheduled',
        conversationId: conv ? conv._id : null,
        callSid: (row.source && row.source.callSid) || null,
        allowMarketing: row.purpose === 'api' ? true : Boolean(agent && agent.whatsapp && agent.whatsapp.allowMarketing),
    });
    return finish(row, r.ok ? { ok: true, messageId: r.messageId } : r);
}

/** Close open chats quiet for longer than their account's inactivity timeout. */
async function closeIdle(now) {
    const candidates = await WhatsAppConversation.find({ status: 'open', lastMessageAt: { $lt: new Date(now.getTime() - 60_000) } })
        .sort({ lastMessageAt: 1 }).limit(500).select('_id accountId lastMessageAt').lean();
    if (!candidates.length) return 0;
    const ids = [...new Set(candidates.map((c) => String(c.accountId)))];
    const accounts = await WhatsAppAccount.find({ _id: { $in: ids } }).select('settings.inactivityMinutes').lean();
    const idle = new Map(accounts.map((a) => [String(a._id), Math.max(1, (a.settings && a.settings.inactivityMinutes) || 15) * 60_000]));
    const due = candidates.filter((c) => now.getTime() - new Date(c.lastMessageAt).getTime() >= (idle.get(String(c.accountId)) || 15 * 60_000));
    if (!due.length) return 0;
    const r = await WhatsAppConversation.updateMany(
        { _id: { $in: due.map((c) => c._id) }, status: 'open' },
        { $set: { status: 'closed', closedAt: now, closedReason: 'inactivity' } },
    );
    return r.modifiedCount || 0;
}

module.exports = { start, stop, tick };
