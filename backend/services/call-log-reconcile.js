/**
 * Reconcile stale campaign call logs with Twilio when status callback was missed
 * (e.g. app on localhost so Twilio could not POST to statusCallback URL).
 * Updates CallLog status and marks campaign completed when all calls are terminal.
 */
const CallLog = require('../models/CallLog');
const Campaign = require('../models/Campaign');
const Settings = require('../models/Settings');
const { estimateDurationFromTranscript } = require('../utils/call-duration');

const NON_TERMINAL = ['queued', 'ringing', 'initiated', 'in-progress'];
const TERMINAL = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
const STALE_MS = 2 * 60 * 1000; // 2 minutes

function normalizeTwilioStatus(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const s = raw.toLowerCase().trim().replace(/_/g, '-');
    return TERMINAL.includes(s) || NON_TERMINAL.includes(s) ? s : 'failed';
}

/**
 * Ask Twilio what actually happened to one call and close the row out.
 * Shared by the campaign reconcile and the global stale sweep below.
 */
async function _closeTwilioLog(log, client) {
    try {
        const call = await client.calls(log.callSid).fetch();
        const status = normalizeTwilioStatus(call.status);
        if (status && TERMINAL.includes(status)) {
            const update = { status, endTime: new Date() };
            // Twilio's own duration is authoritative; fall back to the transcript so the
            // row never reads "0s" for a call that clearly had a conversation.
            update.duration = call.duration
                ? (parseInt(call.duration, 10) || 0)
                : estimateDurationFromTranscript(log);
            await CallLog.findByIdAndUpdate(log._id, update);
            return true;
        }
    } catch (err) {
        if (err.code === 20404) {
            // Call not found in Twilio (expired) -> treat as no-answer/failed
            await CallLog.findByIdAndUpdate(log._id, {
                status: 'no-answer',
                endTime: new Date(),
                duration: estimateDurationFromTranscript(log)
            });
            return true;
        }
    }
    return false;
}

async function reconcileCampaignCallLogs(campaignId) {
    const stale = await CallLog.find({
        campaignId,
        provider: 'twilio',
        status: { $in: NON_TERMINAL },
        callSid: { $not: { $regex: /^failed-/ } },
        createdAt: { $lt: new Date(Date.now() - STALE_MS) }
    }).lean();

    if (stale.length === 0) return;

    const twilio = require('twilio');
    for (const log of stale) {
        const settings = await Settings.findOne({ userId: log.userId });
        if (!settings?.twilioSid || !settings?.twilioToken) continue;
        await _closeTwilioLog(log, twilio(settings.twilioSid, settings.twilioToken));
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return;
    const totalLeads = campaign.leadIds.length;
    const finishedCalls = await CallLog.countDocuments({
        campaignId,
        status: { $in: TERMINAL }
    });
    if (finishedCalls >= totalLeads) {
        await Campaign.findByIdAndUpdate(campaignId, { status: 'completed' });
    }
}

// ─── Stale SIP call reconciliation ───────────────────────────────────────────
// SIP calls have no external status API and rely entirely on the voice stream's
// cleanup() writing a terminal status. If the process crashes/restarts mid-call,
// or a call ends without cleanup running, the row is stuck non-terminal forever
// (UI shows it permanently "IN CONVERSATION"). This time-based sweep marks such
// rows 'failed' — but never touches a call that is still live (cross-checked
// against sip-manager's active-call set).
const STALE_SIP_MS = 5 * 60 * 1000;        // only consider rows older than 5 min
const SIP_SWEEP_INTERVAL_MS = 2 * 60 * 1000; // re-run every 2 min

async function reconcileStaleSipCallLogs() {
    try {
        const cutoff = new Date(Date.now() - STALE_SIP_MS);
        const stale = await CallLog.find({
            provider: 'sip',
            status: { $in: NON_TERMINAL },
            createdAt: { $lt: cutoff }
        }).select('_id callSid startTime createdAt transcript').lean();

        if (stale.length === 0) return;

        let activeIds = new Set();
        try {
            activeIds = new Set(require('./sip/sip-manager').getActiveCallIds());
        } catch (_) { /* sip-manager unavailable — treat all as inactive */ }

        const toClose = stale.filter((l) => !activeIds.has(l.callSid));
        if (toClose.length === 0) return;

        // Written per row rather than in one updateMany so each gets its own duration —
        // derived from the last thing said, never from how long the row sat here stale.
        const endTime = new Date();
        for (const log of toClose) {
            await CallLog.updateOne(
                { _id: log._id },
                { $set: { status: 'failed', endTime, duration: estimateDurationFromTranscript(log) } }
            );
        }
        console.log(`[SIP Reconcile] Marked ${toClose.length} stale SIP call log(s) as failed`);
    } catch (err) {
        console.error('[SIP Reconcile] sweep err:', err.message);
    }
}

// ─── Stale Twilio call reconciliation ────────────────────────────────────────
// The media-stream cleanup and POST /api/twilio/status normally close these rows, but a
// process crash or an unreachable BASE_URL (so the status callback never lands) leaves
// them non-terminal forever. Same shape as the SIP sweep, with Twilio as the source of
// truth for what actually happened.
const STALE_TWILIO_MS = 5 * 60 * 1000;

async function reconcileStaleTwilioCallLogs() {
    try {
        const cutoff = new Date(Date.now() - STALE_TWILIO_MS);
        const stale = await CallLog.find({
            provider: 'twilio',
            status: { $in: NON_TERMINAL },
            callSid: { $not: { $regex: /^failed-/ } },
            createdAt: { $lt: cutoff }
        }).select('_id callSid userId startTime createdAt transcript').lean();

        if (stale.length === 0) return;

        let activeSids = new Set();
        try {
            activeSids = new Set(require('./voice-stream').getActiveCallSids());
        } catch (_) { /* voice-stream unavailable — treat all as inactive */ }

        const toClose = stale.filter((l) => !activeSids.has(l.callSid));
        if (toClose.length === 0) return;

        // Grouped by user so the Settings lookup and Twilio client are built once per
        // account rather than once per row.
        const twilio = require('twilio');
        const byUser = new Map();
        for (const log of toClose) {
            const key = String(log.userId);
            if (!byUser.has(key)) byUser.set(key, []);
            byUser.get(key).push(log);
        }

        let closed = 0;
        for (const [userId, logs] of byUser.entries()) {
            const settings = await Settings.findOne({ userId });
            if (!settings?.twilioSid || !settings?.twilioToken) continue;
            const client = twilio(settings.twilioSid, settings.twilioToken);
            for (const log of logs) {
                if (await _closeTwilioLog(log, client)) closed++;
            }
        }
        if (closed > 0) {
            console.log(`[Twilio Reconcile] Marked ${closed} stale Twilio call log(s) terminal`);
        }
    } catch (err) {
        console.error('[Twilio Reconcile] sweep err:', err.message);
    }
}

let sipSweepTimer = null;
function startCallLogReconcileSchedulers() {
    if (sipSweepTimer) return;
    const sweep = () => {
        reconcileStaleSipCallLogs();
        reconcileStaleTwilioCallLogs();
    };
    sweep(); // run once shortly after boot
    sipSweepTimer = setInterval(sweep, SIP_SWEEP_INTERVAL_MS);
    if (typeof sipSweepTimer.unref === 'function') sipSweepTimer.unref();
    console.log('[Reconcile] stale-call sweep scheduler started (SIP + Twilio)');
}

module.exports = {
    reconcileCampaignCallLogs,
    reconcileStaleSipCallLogs,
    reconcileStaleTwilioCallLogs,
    startCallLogReconcileSchedulers,
    /** @deprecated renamed to startCallLogReconcileSchedulers — kept so older callers keep working. */
    startSipReconcileScheduler: startCallLogReconcileSchedulers,
};
