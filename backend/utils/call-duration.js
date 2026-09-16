const CallLog = require('../models/CallLog');

/**
 * Call duration helpers.
 *
 * Six terminal writers (voice-stream cleanup, the two Twilio adapters, the three SIP
 * streams) and two reconcile sweeps all need the same two rules:
 *
 *   1. duration measures ANSWERED time — never dial/ring time, and never
 *      "how long the row sat around before someone noticed it was stale".
 *   2. Twilio's own CallDuration (carrier-observed, billed) always wins over ours,
 *      whichever order the two writes race in. That is enforced by having every
 *      other writer go through persistDurationIfUnset() while
 *      routes/twilio.js POST /status writes unconditionally.
 */

/**
 * Whole seconds between `answeredAtMs` (or `fallbackStartedAtMs`) and now.
 * Returns 0 when neither timestamp is set — a call that never got answered has
 * no duration, and guessing one is how logs end up inflated.
 */
function computeDuration(answeredAtMs, fallbackStartedAtMs) {
    const from = answeredAtMs || fallbackStartedAtMs;
    if (!from) return 0;
    const seconds = Math.round((Date.now() - from) / 1000);
    return seconds > 0 ? seconds : 0;
}

/**
 * Write `seconds` only if the row has no duration yet. Fire-and-forget, matching the
 * other non-critical CallLog writes (e.g. _pushError in the SIP streams) — a failed
 * duration write must never take down a call teardown.
 */
async function persistDurationIfUnset(callSid, seconds) {
    if (!callSid || !seconds || seconds <= 0) return;
    try {
        await CallLog.updateOne(
            {
                callSid,
                $or: [{ duration: { $exists: false } }, { duration: null }, { duration: 0 }]
            },
            { $set: { duration: seconds } }
        );
    } catch (_) { /* non-fatal */ }
}

/**
 * Duration estimate for rows closed by a reconcile sweep, where the process that owned
 * the call is long gone. Uses the last thing anyone actually said — deliberately NOT
 * wall-clock-to-sweep-time, which would report the staleness window (5+ minutes) as
 * call duration and re-introduce exactly the inflation these sweeps exist to clean up.
 */
function estimateDurationFromTranscript(log) {
    const start = log?.startTime || log?.createdAt;
    if (!start) return 0;
    const startMs = new Date(start).getTime();

    const stamps = (log.transcript || [])
        .map(t => (t?.timestamp ? new Date(t.timestamp).getTime() : 0))
        .filter(ms => ms > startMs);
    if (stamps.length === 0) return 0;

    const seconds = Math.round((Math.max(...stamps) - startMs) / 1000);
    return seconds > 0 ? seconds : 0;
}

module.exports = { computeDuration, persistDurationIfUnset, estimateDurationFromTranscript };
