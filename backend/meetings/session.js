/**
 * One agent in one meeting, through the owner's Attendee bot.
 *
 * The lifecycle, and which side drives each step:
 *
 *   POST /api/meetings       routes/meetings.js: the bot is created at the owner's
 *                            Attendee, a CallLog (`provider: 'meeting'`) is written
 *                            as `queued`.
 *   joining, waiting room    Attendee's bot.state_change webhooks (meetingStateChanged
 *                            below) move the record along.
 *   in the meeting           the bot opens `wss /api/meetings/stream`, and
 *                            acceptMeetingSocket runs the voice pipeline
 *                            (services/voice-stream.js, transport 'meeting') on an
 *                            AttendeeLink in place of the socket.
 *   the end                  whichever comes first: the meeting ends (webhook), the
 *                            bot's socket stays gone past the reconnect grace, the
 *                            agent hangs up, max duration, idle, POST /:id/leave. All
 *                            end in the link's close, then the record, `callCompleted`
 *                            and, unless the meeting itself ended, telling the bot to leave.
 *
 * In memory: one backend process, and a restart ends every live conversation.
 */
const { AttendeeLink } = require('./attendee-link');
const { addWebSession, removeWebSession, webSessionCount, removePendingMeeting } = require('../voice/active-sessions');
const { meetingInstructions, withoutMuted } = require('../voice/meeting-mode');
const { burnMeetingToken } = require('./token');
const { leaveBot } = require('./attendee');
const { open } = require('../utils/credentials');

const Agent = require('../models/Agent');
const CallLog = require('../models/CallLog');
const User = require('../models/User');
const MeetingIntegration = require('../models/MeetingIntegration');
const WebhookService = require('../services/webhook-service');
const EmailService = require('../services/email-service');

/** Meetings have long quiet stretches (a screen share, a slide). Attendee's own auto-leave covers an empty room. */
const idleTimeoutMs = () => (Number(process.env.MEETING_IDLE_SECONDS) || 600) * 1000;
const platformMax = () => Number(process.env.SIP_MAX_CONCURRENT_CALLS) || 50;

const TERMINAL = new Set(['completed', 'failed', 'canceled', 'busy', 'no-answer']);

/** Close codes on the bot's socket. Attendee only logs them; they are for our logs. */
const MEETING_CLOSE = { refused: 4402, not_found: 4404, ended: 4410, unavailable: 4503 };

/** callId → { link, startedAt, agent, userId } */
const live = new Map();

const liveMeetingCount = () => live.size;
const isMeetingLive = (callId) => live.has(callId);

/** The owner's Attendee, opened for one request. Null when they have none (falls back to master). */
async function credentialsFor(userId) {
    let doc = await MeetingIntegration.findOne({ createdBy: userId, provider: 'attendee' }).lean();
    if (!doc) {
        doc = await MeetingIntegration.findOne({ provider: 'attendee', status: 'connected' }).sort({ createdAt: 1 }).lean();
    }
    if (!doc) return null;
    const apiKey = open(doc.apiKeyEncrypted, 'MeetingIntegration.apiKey');
    return apiKey ? { baseUrl: doc.baseUrl, apiKey } : null;
}

/** Best effort: the bot may already be gone, and nothing waits on this. */
async function tellBotToLeave(userId, botId, why) {
    if (!botId) return;
    try {
        const creds = await credentialsFor(userId);
        if (creds) await leaveBot(creds, botId);
    } catch (err) {
        console.warn(`[meeting] could not tell bot ${botId} to leave (${why}): ${err.message}`);
    }
}

function liveSipCalls() {
    try {
        return Number(require('../services/sip/sip-manager').getActiveCallCount()) || 0;
    } catch {
        return 0;
    }
}

function webhookPayload(log, extra) {
    return {
        callSid: log.callSid,
        leadId: log.leadId || null,
        campaignId: null,
        direction: 'outbound',
        recordingUrl: null,
        provider: 'meeting',
        meeting: {
            botId: (log.meeting && log.meeting.botId) || null,
            platform: (log.meeting && log.meeting.platform) || null,
            meetingUrl: (log.meeting && log.meeting.meetingUrl) || null,
        },
        ...extra,
    };
}

/**
 * End a meeting that never reached a conversation: the bot could not join, was
 * kept in the waiting room, was refused, or was called off before it got in.
 * @param {string} callId
 * @param {{status: 'failed' | 'canceled', endReason: string, error?: string | null}} outcome
 */
async function finishWithoutSession(callId, outcome) {
    removePendingMeeting(callId);
    burnMeetingToken(callId);
    const log = await CallLog.findOneAndUpdate(
        { callSid: callId, provider: 'meeting', status: { $nin: [...TERMINAL] } },
        {
            $set: {
                status: outcome.status, endTime: new Date(), duration: 0,
                'meeting.endReason': outcome.endReason,
                ...(outcome.error ? { 'meeting.error': outcome.error } : {}),
            },
        },
        { returnDocument: 'after' },
    );
    if (!log) return;
    const payload = webhookPayload(log, { duration: 0, status: outcome.status, endReason: outcome.endReason });
    WebhookService.trigger(String(log.userId), 'callCompleted', payload);
    EmailService.trigger(String(log.userId), 'callCompleted', payload);
}

/** End a live meeting from outside: a leave request, the meeting ending. False when none is live here. */
async function endMeeting(callId, reason) {
    const l = live.get(callId);
    if (!l) return false;
    l.endReason = reason;
    l.link.close(1000, reason);
    return true;
}

/** Refuse a bot's socket for good: close it, fail the record, tell the bot to go. */
async function refuseMeeting(ws, grant, close, code, message, botId) {
    try { ws.close(close, code); } catch { /* gone */ }
    console.warn(`[meeting] refused ${grant.callId}: ${code}`);
    await finishWithoutSession(grant.callId, { status: 'failed', endReason: code, error: message });
    await tellBotToLeave(grant.userId, botId, code);
}

/**
 * The bot's audio socket arrived (or came back). Admit it, or refuse it for good.
 * @param {import('ws').WebSocket} ws
 * @param {import('./token').MeetingGrant} grant
 */
async function acceptMeetingSocket(ws, grant) {
    const { callId, userId } = grant;

    // A reconnect: the conversation is still running, give it the new socket.
    const existing = live.get(callId);
    if (existing) {
        existing.link.attach(ws);
        return;
    }

    // Claimed before the first await, so a second socket racing this one joins
    // the same link instead of starting a second conversation.
    const link = new AttendeeLink({
        callId,
        respondWhen: grant.respondWhen,
        wakeNames: [grant.botName, ...grant.wakeNames],
        logTag: `meeting ${callId.slice(-8)}`,
    });
    const entry = { link, startedAt: 0, userId, agent: null, endReason: null, finished: false };
    live.set(callId, entry);
    const abandon = () => { live.delete(callId); link.terminate(); };

    const log = await CallLog.findOne({ callSid: callId, userId, provider: 'meeting' }).lean();
    if (!log) {
        try { ws.close(MEETING_CLOSE.not_found, 'meeting_not_found'); } catch { /* gone */ }
        abandon();
        return;
    }
    const botId = (log.meeting && log.meeting.botId) || link.botId || null;
    if (TERMINAL.has(log.status)) {
        try { ws.close(MEETING_CLOSE.ended, 'meeting_ended'); } catch { /* gone */ }
        abandon();
        burnMeetingToken(callId);
        await tellBotToLeave(userId, botId, 'meeting already ended');
        return;
    }

    const refuse = async (close, code, message) => {
        abandon();
        await refuseMeeting(ws, grant, close, code, message, botId);
    };

    const owner = await User.findById(userId).select('isActive').lean();
    if (!owner || owner.isActive === false) return refuse(MEETING_CLOSE.refused, 'account_deactivated', 'This account has been deactivated.');

    const agent = await Agent.findOne({ _id: grant.agentId, createdBy: userId });
    if (!agent) return refuse(MEETING_CLOSE.not_found, 'agent_not_found', 'The agent for this meeting no longer exists.');

    if (liveSipCalls() + webSessionCount() >= platformMax()) {
        return refuse(MEETING_CLOSE.unavailable, 'server_busy', 'The server was at capacity when the bot joined.');
    }

    // Admitted. From here the pipeline runs and every path reaches finish().
    addWebSession(callId);
    removePendingMeeting(callId);
    entry.startedAt = Date.now();
    entry.agent = agent;
    await CallLog.updateOne(
        { callSid: callId },
        {
            $set: {
                status: 'in-progress', startTime: new Date(), voiceEngine: agent.voiceEngine || 'classic',
                'meeting.joinedAt': (log.meeting && log.meeting.joinedAt) || new Date(),
                ...(botId && !(log.meeting && log.meeting.botId) ? { 'meeting.botId': botId } : {}),
            },
        },
    );

    // The link reports `close` once the conversation is over (the pipeline closed
    // it, or the bot stayed away past the grace). That is the one place the
    // record is written.
    link.once('close', () => { finish(callId, entry, log, botId).catch((err) => console.error(`[meeting] finish failed for ${callId}:`, err.message)); });

    const { handleVoiceStream } = require('../services/voice-stream');
    handleVoiceStream(link, null, {
        transport: 'meeting',
        userId: String(userId),
        agentId: String(agent._id),
        leadId: grant.leadId || null,
        maxDurationMs: grant.maxSeconds * 1000,
        idleTimeoutMs: idleTimeoutMs(),
        systemPromptSuffix: meetingInstructions({ botName: grant.botName, respondWhen: grant.respondWhen, wakeNames: grant.wakeNames }),
    });
    link.attach(ws);
}

async function finish(callId, entry, log, botId) {
    if (entry.finished) return;
    entry.finished = true;
    removeWebSession(callId);
    live.delete(callId);
    const link = entry.link;
    const reason = entry.endReason || link.endReason || 'ended';
    const duration = Math.max(0, Math.round((link.billableEndAt - entry.startedAt) / 1000));
    const transcript = withoutMuted(link.transcript, link.gate.mutedText);
    const spoke = transcript.some((t) => t.role === 'user' || t.role === 'assistant');
    const status = spoke && reason !== 'error' ? 'completed' : 'failed';
    if (link.gate.mutedReplies > 0) console.log(`[meeting] ${callId}: ${link.gate.mutedReplies} replies muted (not addressed)`);

    const set = {
        status, endTime: new Date(), duration,
        transcript,
        'meeting.endReason': reason,
        'meeting.mutedReplies': link.gate.mutedReplies,
    };
    const lastError = link.errors[link.errors.length - 1];
    if (lastError && !spoke) set['meeting.error'] = lastError.message;
    let done = null;
    try {
        done = await CallLog.findOneAndUpdate(
            { callSid: callId },
            { $set: set, ...(link.errors.length ? { $push: { errors: { $each: link.errors.map((e) => ({ service: e.service, code: '', message: e.message, timestamp: e.at })) } } } : {}) },
            { returnDocument: 'after' },
        );
    } catch (err) {
        console.error(`[meeting] call log for ${callId} failed:`, err.message);
    }
    if (done) {
        try {
            const Settings = require('../models/Settings');
            const settings = await Settings.findOne({ userId: entry.userId }).select('autoAnalysisEnabled').lean();
            if (status === 'completed' && settings && settings.autoAnalysisEnabled) {
                const { analyzeCallLog } = require('../utils/analyzer');
                analyzeCallLog(done._id).catch((e) => console.error('[meeting] analysis err:', e.message));
            }
        } catch (_) { /* analysis is optional */ }
        const payload = webhookPayload(done, { duration, status, endReason: reason });
        WebhookService.trigger(String(entry.userId), 'callCompleted', payload);
        EmailService.trigger(String(entry.userId), 'callCompleted', payload);
    }
    burnMeetingToken(callId);
    // The meeting ending took the bot with it; every other end leaves it sitting
    // silent in the room (and on the owner's Attendee bill).
    if (reason !== 'meeting_ended') await tellBotToLeave(String(entry.userId), botId || link.botId, reason);
}

// ── Bot state webhooks ─────────────────────────────────────────────────────

/** Attendee states in which the bot is in the meeting. */
const IN_MEETING = new Set(['joined_not_recording', 'joined_recording', 'joined_recording_paused', 'joined_recording_permission_denied', 'joining_breakout_room', 'leaving_breakout_room']);
/** States after which the bot is gone or going. */
const GONE = new Set(['leaving', 'post_processing', 'ended', 'fatal_error', 'data_deleted']);
const MAX_EVENTS = 50;

const str = (v) => (typeof v === 'string' && v.length <= 100 ? v : null);

/** One `bot.state_change` from the owner's Attendee, for a call already matched to it. */
async function meetingStateChanged(log, data) {
    const state = str(data.new_state);
    if (!state) return;
    const eventType = str(data.event_type);
    const eventSubType = str(data.event_sub_type);
    const at = typeof data.created_at === 'string' && !Number.isNaN(Date.parse(data.created_at)) ? new Date(data.created_at) : new Date();

    const set = { 'meeting.state': state, 'meeting.stateChangedAt': at };
    const nonTerminal = !TERMINAL.has(log.status);
    if (nonTerminal && state === 'waiting_room' && log.status === 'queued') set.status = 'ringing';
    if (nonTerminal && IN_MEETING.has(state) && !(log.meeting && log.meeting.joinedAt)) set['meeting.joinedAt'] = at;
    if (eventType === 'could_not_join_meeting' || eventType === 'fatal_error' || state === 'fatal_error') {
        set['meeting.error'] = [eventType || state, eventSubType].filter(Boolean).join(': ');
    }
    await CallLog.updateOne(
        { _id: log._id },
        {
            $set: set,
            $push: { 'meeting.events': { $each: [{ state, eventType, eventSubType, at }], $slice: -MAX_EVENTS } },
        },
    );

    if (!GONE.has(state) || !nonTerminal) return;
    if (await endMeeting(log.callSid, 'meeting_ended')) return;
    const failed = eventType === 'could_not_join_meeting' || state === 'fatal_error' || eventType === 'fatal_error';
    await finishWithoutSession(log.callSid, {
        status: 'failed',
        endReason: failed ? (eventType || 'fatal_error') : (eventType || 'meeting_ended'),
        error: failed ? String(set['meeting.error'] || state) : 'The bot left before it heard the meeting.',
    });
}

module.exports = {
    acceptMeetingSocket, meetingStateChanged, endMeeting, finishWithoutSession, tellBotToLeave,
    credentialsFor, isMeetingLive, liveMeetingCount, MEETING_CLOSE, TERMINAL,
};
