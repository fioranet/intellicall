/**
 * Meeting sessions live in this process, beside the SIP and Twilio calls.
 *
 * One registry so the places that need to know agree: capacity (meetings count
 * against SIP_MAX_CONCURRENT_CALLS like any conversation) and the stale-row
 * sweeper, which must never mark a live meeting's CallLog failed.
 *
 * In memory on purpose: pm2 runs one backend process, so the process is the
 * truth, and a restart ends every session anyway.
 */
const sessions = new Set();

const addWebSession = (callId) => { sessions.add(callId); };
const removeWebSession = (callId) => { sessions.delete(callId); };
const webSessionCount = () => sessions.size;
const webSessionIds = () => [...sessions];

/**
 * Meeting bots that are joining or waiting to be admitted, with no audio yet.
 * Not counted against capacity, but the sweeper must not fail their CallLogs
 * while they wait. Each entry expires at its join deadline.
 */
const pendingMeetings = new Map();

const addPendingMeeting = (callId, until) => { pendingMeetings.set(callId, until); };
const removePendingMeeting = (callId) => { pendingMeetings.delete(callId); };
const pendingMeetingIds = (now = Date.now()) => {
    for (const [id, until] of pendingMeetings) if (until <= now) pendingMeetings.delete(id);
    return [...pendingMeetings.keys()];
};

module.exports = { addWebSession, removeWebSession, webSessionCount, webSessionIds, addPendingMeeting, removePendingMeeting, pendingMeetingIds };
