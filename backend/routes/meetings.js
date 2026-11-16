/**
 * /api/meetings — an agent joins a Zoom, Google Meet or Teams meeting as a named
 * participant, through the owner's own Attendee bot.
 *
 *   GET/POST/DELETE /integration  the owner's Attendee URL and key (POST connects or replaces it)
 *   POST /                        send a bot to a meeting
 *   GET  /, GET /:id              meetings, newest first; one meeting
 *   POST /:id/leave               call the bot out
 *
 * A meeting is a call (CallLog `provider: 'meeting'`), so it counts against the
 * plan's calls, and the plan's `features.meetings` gates it.
 */
const express = require('express');
const joi = require('joi');
const { randomUUID } = require('crypto');
const { Types } = require('mongoose');
const { auth, requireActivePlan } = require('../middleware/auth');
const checkLimit = require('../middleware/limit-checker');
const { requireFeature } = require('../middleware/limit-checker');
const Agent = require('../models/Agent');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const Settings = require('../models/Settings');
const MeetingIntegration = require('../models/MeetingIntegration');
const { seal } = require('../utils/credentials');
const { UnsafeUrlError } = require('../utils/safe-fetch');
const { externalOrigin } = require('../utils/public-url');
const { missingEngineKeys } = require('../utils/engine-keys');
const { AttendeeError, ATTENDEE_HOSTED_URL, assertSafeBaseUrl, createBot, normaliseBaseUrl, platformFor, verifyAttendeeKey } = require('../meetings/attendee');
const { mintMeetingToken, newWebhookToken, burnMeetingToken } = require('../meetings/token');
const { credentialsFor, endMeeting, finishWithoutSession, isMeetingLive, tellBotToLeave, TERMINAL } = require('../meetings/session');
const { MEETING_SAMPLE_RATE } = require('../meetings/attendee-link');
const { addPendingMeeting } = require('../voice/active-sessions');

const router = express.Router();

const MEETING_STREAM_PATH = '/api/meetings/stream';
const DEFAULT_MAX_SECONDS = 3600;
const DEFAULT_WAITING_ROOM_SECONDS = 600;
/** Join time beyond the waiting room: launching the bot, loading the meeting page. */
const JOIN_SLACK_SECONDS = 300;

const objectId = joi.string().pattern(/^[a-f\d]{24}$/i);

const integrationJoi = joi.object({
    baseUrl: joi.string().trim().max(2048).default(ATTENDEE_HOSTED_URL),
    apiKey: joi.string().trim().min(8).max(512).allow('', null),
    webhookSecret: joi.string().trim().max(512).allow('', null),
    signedInBots: joi.object({
        googleMeet: joi.boolean().default(false),
        teams: joi.boolean().default(false),
        loginGroup: joi.string().trim().max(200).allow('', null),
    }),
});

const createJoi = joi.object({
    agentId: objectId.required(),
    meetingUrl: joi.string().uri({ scheme: ['https'] }).max(2000).required(),
    botName: joi.string().trim().min(1).max(100).allow('', null),
    leadId: objectId.allow('', null),
    maxDurationSeconds: joi.number().integer().min(60).max(14400),
    waitingRoomTimeoutSeconds: joi.number().integer().min(30).max(3600),
    respondWhen: joi.string().valid('addressed', 'always').default('addressed'),
    signedIn: joi.boolean(),
    wakeNames: joi.array().items(joi.string().trim().min(2).max(60)).max(5),
});

const owned = (req) => ({ userId: new Types.ObjectId(String(req.user._id)), provider: 'meeting' });

function fail(res, err) {
    if (err?.isJoi) return res.status(400).json({ status: 'error', message: err.details?.[0]?.message || err.message });
    if (err instanceof UnsafeUrlError) return res.status(400).json({ status: 'error', code: 'unsafe_attendee_url', message: err.message });
    if (err instanceof AttendeeError) {
        // 4xx from Attendee is about the request (a bad meeting link, a Zoom app
        // not set up); anything else is Attendee being unavailable.
        const status = err.status >= 400 && err.status < 500 ? 400 : 502;
        return res.status(status).json({ status: 'error', code: err.code, message: err.message });
    }
    const status = err?.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('[meetings]', err);
    return res.status(status).json({ status: 'error', message: status === 500 ? 'Something went wrong.' : err.message });
}

/** The wss origin Attendee connects back to. Attendee requires wss. */
function meetingStreamUrl(req) {
    const origin = externalOrigin(req);
    return `${origin.replace(/^http/, 'ws')}${MEETING_STREAM_PATH}`;
}

/** The https webhook URL for one bot, or null without a public https origin (Attendee requires one). */
function webhookUrl(req, token) {
    const origin = externalOrigin(req);
    return origin.startsWith('https://') ? `${origin}/api/webhooks/attendee/${token}` : null;
}

/** The integration as the console sees it: the key never leaves the server. */
function integrationJson(doc) {
    return {
        _id: String(doc._id),
        provider: doc.provider,
        baseUrl: doc.baseUrl,
        hosted: doc.baseUrl === ATTENDEE_HOSTED_URL,
        apiKeyLast4: doc.apiKeyLast4 || '',
        webhookSecretSet: Boolean(doc.webhookSecretEncrypted),
        signedInBots: {
            googleMeet: Boolean(doc.signedInBots && doc.signedInBots.googleMeet),
            teams: Boolean(doc.signedInBots && doc.signedInBots.teams),
            loginGroup: (doc.signedInBots && doc.signedInBots.loginGroup) || null,
        },
        status: doc.status || 'connected',
        lastError: doc.lastError || null,
        verifiedAt: doc.verifiedAt || null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

/** joining | waiting_room | in_meeting | ended | failed, from the CallLog's status and the bot's state. */
function meetingStatus(doc) {
    if (doc.status === 'completed') return 'ended';
    if (TERMINAL.has(doc.status)) return 'failed';
    if (doc.status === 'in-progress') return 'in_meeting';
    if (doc.status === 'ringing' || (doc.meeting && doc.meeting.state === 'waiting_room')) return 'waiting_room';
    return 'joining';
}

function meetingJson(doc) {
    const m = doc.meeting || {};
    return {
        _id: String(doc._id),
        callSid: doc.callSid,
        status: meetingStatus(doc),
        callStatus: doc.status,
        agentId: doc.agentId ? String(doc.agentId._id || doc.agentId) : null,
        agentName: doc.agentId && doc.agentId.name ? doc.agentId.name : null,
        leadId: doc.leadId ? String(doc.leadId) : null,
        meetingUrl: m.meetingUrl || null,
        platform: m.platform || null,
        botName: m.botName || null,
        botId: m.botId || null,
        botState: m.state || null,
        respondWhen: m.respondWhen || 'addressed',
        signedIn: Boolean(m.signedIn),
        endReason: m.endReason || null,
        error: m.error || null,
        mutedReplies: m.mutedReplies || 0,
        durationSeconds: doc.duration || 0,
        events: m.events || [],
        createdAt: doc.createdAt,
        joinedAt: m.joinedAt || null,
        endedAt: doc.endTime || null,
    };
}

const integrationFor = (req) => MeetingIntegration.findOne({ createdBy: req.user._id, provider: 'attendee' }).lean();

// ── The integration ────────────────────────────────────────────────────────

router.get('/integration', auth, async (req, res) => {
    try {
        const doc = await integrationFor(req);
        res.json({ status: 'success', data: { integration: doc ? integrationJson(doc) : null, hostedUrl: ATTENDEE_HOSTED_URL } });
    } catch (err) { fail(res, err); }
});

router.post('/integration', auth, requireActivePlan, requireFeature('meetings'), async (req, res) => {
    try {
        const body = await integrationJoi.validateAsync(req.body || {});
        const baseUrl = normaliseBaseUrl(body.baseUrl);
        await assertSafeBaseUrl(baseUrl);

        // The stored key is kept when none is sent, but only for the Attendee it
        // was saved for: a key is never sent to a different address than its own.
        const existing = await integrationFor(req);
        let apiKey = body.apiKey || '';
        if (!apiKey) {
            const stored = existing && existing.baseUrl === baseUrl ? await credentialsFor(req.user._id) : null;
            if (!stored) {
                return res.status(400).json({ status: 'error', code: 'missing_api_key', message: existing ? 'A new Attendee URL needs its own API key.' : 'Paste an API key from your Attendee project.' });
            }
            apiKey = stored.apiKey;
        }
        await verifyAttendeeKey({ baseUrl, apiKey });

        const set = {
            baseUrl,
            apiKeyEncrypted: seal(apiKey),
            apiKeyLast4: apiKey.slice(-4),
            status: 'connected',
            lastError: null,
            verifiedAt: new Date(),
        };
        if (body.signedInBots !== undefined) {
            set.signedInBots = {
                googleMeet: Boolean(body.signedInBots.googleMeet),
                teams: Boolean(body.signedInBots.teams),
                loginGroup: (body.signedInBots.loginGroup || '').trim() || null,
            };
        }
        if (body.webhookSecret === null || body.webhookSecret === '') {
            if (body.webhookSecret === null) set.webhookSecretEncrypted = null;
        } else if (body.webhookSecret !== undefined) {
            if (Buffer.from(body.webhookSecret, 'base64').length < 16) {
                return res.status(400).json({ status: 'error', code: 'invalid_webhook_secret', message: 'That is not an Attendee webhook secret: paste it as Attendee shows it, in base64.' });
            }
            set.webhookSecretEncrypted = seal(body.webhookSecret);
        }
        const doc = await MeetingIntegration.findOneAndUpdate(
            { createdBy: req.user._id, provider: 'attendee' },
            { $set: set, $setOnInsert: { createdBy: req.user._id, provider: 'attendee' } },
            { upsert: true, returnDocument: 'after' },
        ).lean();
        res.json({ status: 'success', data: { integration: integrationJson(doc) } });
    } catch (err) { fail(res, err); }
});

router.delete('/integration', auth, async (req, res) => {
    try {
        const doc = await MeetingIntegration.findOneAndDelete({ createdBy: req.user._id, provider: 'attendee' });
        if (!doc) return res.status(404).json({ status: 'error', message: 'No Attendee account is connected.' });
        res.json({ status: 'success', message: 'Attendee disconnected' });
    } catch (err) { fail(res, err); }
});

// ── Meetings ───────────────────────────────────────────────────────────────

router.post('/', auth, requireActivePlan, requireFeature('meetings'), checkLimit('calls'), async (req, res) => {
    try {
        const body = await createJoi.validateAsync(req.body || {});
        const userId = req.user._id;

        const creds = await credentialsFor(userId);
        const integration = creds ? await integrationFor(req) : null;
        if (!creds) {
            return res.status(400).json({ status: 'error', code: 'meeting_integration_missing', message: 'Connect your Attendee account first, with its URL and API key.' });
        }
        const platform = platformFor(body.meetingUrl);
        if (!platform) {
            return res.status(400).json({ status: 'error', code: 'unsupported_meeting_url', message: 'Use an https Zoom, Google Meet or Microsoft Teams meeting link.' });
        }

        const agent = await Agent.findOne({ _id: body.agentId, createdBy: userId }).lean();
        if (!agent) return res.status(404).json({ status: 'error', message: 'Agent not found' });
        const engine = agent.voiceEngine || 'classic';
        // Signed in: the integration's setting for this platform, unless the
        // request says otherwise. Zoom signs in with ZAK tokens, which this does not do.
        if (body.signedIn === true && platform === 'zoom') {
            return res.status(400).json({ status: 'error', code: 'signed_in_not_supported', message: 'Signed-in bots work on Google Meet and Teams, not Zoom.' });
        }
        const settings = await Settings.findOne({ userId });
        const missing = missingEngineKeys(settings, agent, 'browser');
        if (missing.length > 0) {
            return res.status(400).json({ status: 'error', code: 'missing_keys', missing, message: `${missing.join(' and ')} ${missing.length > 1 ? 'keys are' : 'key is'} not configured. Add ${missing.length > 1 ? 'them' : 'it'} in Settings before sending this agent to a meeting.` });
        }
        if (body.leadId && !(await Lead.exists({ _id: body.leadId, createdBy: userId }))) {
            return res.status(404).json({ status: 'error', message: 'Lead not found' });
        }
        const signedInByDefault = platform === 'google_meet' ? Boolean(integration?.signedInBots?.googleMeet)
            : platform === 'teams' ? Boolean(integration?.signedInBots?.teams) : false;
        const signedIn = platform !== 'zoom' && (body.signedIn ?? signedInByDefault);

        const maxSeconds = body.maxDurationSeconds || DEFAULT_MAX_SECONDS;
        const waitingRoomSeconds = body.waitingRoomTimeoutSeconds || DEFAULT_WAITING_ROOM_SECONDS;
        const botName = (body.botName || agent.name || 'Assistant').trim().slice(0, 100) || 'Assistant';
        const respondWhen = body.respondWhen || 'addressed';
        const wakeNames = [...new Set([agent.name, ...(body.wakeNames || [])].filter(Boolean))];
        const callId = `mt-${randomUUID()}`;
        const joinWindowSeconds = waitingRoomSeconds + JOIN_SLACK_SECONDS;

        const token = mintMeetingToken({
            callId, userId: String(userId), agentId: String(agent._id), leadId: body.leadId || null,
            engine, maxSeconds, botName, respondWhen, wakeNames,
        }, joinWindowSeconds + maxSeconds + 600);
        const hook = newWebhookToken();

        await CallLog.create({
            userId, agentId: agent._id, leadId: body.leadId || null, callSid: callId,
            direction: 'outbound', provider: 'meeting', voiceEngine: engine,
            status: 'queued',
            meeting: {
                botProvider: 'attendee', meetingUrl: body.meetingUrl, platform, botName, respondWhen, signedIn,
                state: null, webhookTokenHash: hook.hash, events: [],
            },
        });

        let bot;
        try {
            bot = await createBot(creds, {
                meetingUrl: body.meetingUrl,
                botName,
                audioUrl: `${meetingStreamUrl(req)}?token=${encodeURIComponent(token)}`,
                sampleRate: MEETING_SAMPLE_RATE,
                webhookUrl: webhookUrl(req, hook.token),
                metadata: { intellicall_call_id: callId },
                deduplicationKey: callId,
                waitingRoomTimeoutSeconds: waitingRoomSeconds,
                maxUptimeSeconds: joinWindowSeconds + maxSeconds,
                login: signedIn ? { platform, group: (integration && integration.signedInBots && integration.signedInBots.loginGroup) || null } : null,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'The bot could not be created.';
            await finishWithoutSession(callId, { status: 'failed', endReason: 'bot_not_created', error: message });
            throw err;
        }

        addPendingMeeting(callId, Date.now() + joinWindowSeconds * 1000);
        const doc = await CallLog.findOneAndUpdate(
            { callSid: callId },
            { $set: { 'meeting.botId': bot.id, 'meeting.state': bot.state, 'meeting.stateChangedAt': new Date() } },
            { returnDocument: 'after' },
        ).populate('agentId', 'name').lean();
        res.status(201).json({ status: 'success', data: { meeting: meetingJson(doc) } });
    } catch (err) { fail(res, err); }
});

router.get('/', auth, async (req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const docs = await CallLog.find(owned(req)).sort({ createdAt: -1 }).limit(limit).select('-transcript').populate('agentId', 'name').lean();
        res.json({ status: 'success', data: { meetings: docs.map(meetingJson) } });
    } catch (err) { fail(res, err); }
});

async function findOwned(req) {
    return CallLog.findOne({ _id: req.params.id, ...owned(req) }).select('-transcript').populate('agentId', 'name').lean();
}

router.get('/:id', auth, async (req, res) => {
    try {
        const doc = await findOwned(req);
        if (!doc) return res.status(404).json({ status: 'error', message: 'Meeting not found' });
        res.json({ status: 'success', data: { meeting: meetingJson(doc) } });
    } catch (err) { fail(res, err); }
});

/** The agent leaves now. A bot still joining or waiting is called off; one in the meeting finishes as any call does. */
router.post('/:id/leave', auth, async (req, res) => {
    try {
        const doc = await findOwned(req);
        if (!doc) return res.status(404).json({ status: 'error', message: 'Meeting not found' });
        if (isMeetingLive(doc.callSid)) {
            await endMeeting(doc.callSid, 'client');
        } else if (!TERMINAL.has(doc.status)) {
            await tellBotToLeave(String(req.user._id), doc.meeting && doc.meeting.botId, 'leave requested');
            await finishWithoutSession(doc.callSid, { status: 'canceled', endReason: 'client' });
            burnMeetingToken(doc.callSid);
        }
        res.json({ status: 'success', data: { meeting: meetingJson(await findOwned(req)) } });
    } catch (err) { fail(res, err); }
});

module.exports = router;
module.exports.MEETING_STREAM_PATH = MEETING_STREAM_PATH;
