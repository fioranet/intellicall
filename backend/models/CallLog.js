const mongoose = require('mongoose');

/** See `meeting` below. */
const meetingSchema = new mongoose.Schema({
    botProvider: { type: String, default: 'attendee' },
    botId: { type: String, default: null },
    meetingUrl: { type: String, default: null },
    platform: { type: String, default: null },
    botName: { type: String, default: null },
    respondWhen: { type: String, default: null },
    signedIn: { type: Boolean, default: false },
    state: { type: String, default: null },
    stateChangedAt: { type: Date, default: null },
    joinedAt: { type: Date, default: null },
    endReason: { type: String, default: null },
    /** Replies the agent generated that the "speak only when named" gate dropped. */
    mutedReplies: { type: Number, default: 0 },
    error: { type: String, default: null },
    webhookTokenHash: { type: String, default: null },
    events: [{
        _id: false,
        state: String,
        eventType: String,
        eventSubType: String,
        at: Date,
    }],
}, { _id: false });

const callLogSchema = new mongoose.Schema({
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign'
    },
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        // A meeting bot has no lead. Phone calls always write their Lead.
        required: function () { return this.provider !== 'meeting'; }
    },
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    callSid: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['initiated', 'queued', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer', 'canceled'],
        default: 'queued'
    },
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        default: 'outbound'
    },
    provider: {
        type: String,
        // 'meeting' is an agent in a Zoom, Meet or Teams meeting through the
        // owner's own Attendee bot (meetings/*).
        enum: ['twilio', 'sip', 'meeting'],
        default: 'twilio'
    },
    /**
     * The meeting bot behind a `provider: 'meeting'` call (meetings/*). Absent
     * on every other call. Attendee's own state names are kept as they arrive;
     * `webhookTokenHash` is how a state webhook finds its call, never returned.
     */
    meeting: { type: meetingSchema, default: undefined },
    voiceEngine: {
        type: String,
        enum: ['classic', 'deepgram_agent', 'sarvam', 'gemini_live'],
        default: 'classic'
    },
    duration: {
        type: Number, // in seconds
        default: 0
    },
    recordingUrl: {
        type: String
    },
    transcript: [{
        role: String,
        content: String,
        timestamp: { type: Date, default: Date.now }
    }],
    summary: {
        type: String
    },
    errors: [{
        // 'sip' is the trunk or Asterisk refusing to place a call.
        service: { type: String, enum: ['elevenlabs', 'deepgram', 'openrouter', 'twilio', 'sarvam', 'gemini', 'sip', 'system'] },
        code: String,
        message: String,
        timestamp: { type: Date, default: Date.now }
    }],
    /**
     * Human Transfer attempts made during this call, newest last. Written by
     * services/sip/sip-manager.js as each attempt is requested and again as it settles,
     * so a call that was handed to a human — or tried to be — carries its own timeline.
     * Empty on every call that never attempted a transfer.
     */
    transfers: [{
        /** Correlates the 'requested' push with the later settle update. */
        attemptId: { type: String, required: true },
        destinationId: String,
        destinationName: String,
        reason: String,
        status: {
            type: String,
            enum: ['ringing', 'connected', 'completed', 'busy', 'no_answer', 'rejected', 'unavailable', 'failed'],
            default: 'ringing'
        },
        /** 1-based attempt counter within this call, capped by maxTransfersPerCall. */
        attempt: { type: Number, default: 1 },
        requestedAt: { type: Date, default: Date.now },
        answeredAt: { type: Date, default: null },
        endedAt: { type: Date, default: null },
        ringDurationMs: { type: Number, default: 0 },
        /** How long the caller and the human actually spoke. */
        connectedDurationMs: { type: Number, default: 0 },
        failureCode: { type: String, default: '' },
        /** Raw Q.850 cause from Asterisk, for diagnosing carrier-side rejections. */
        sipCause: { type: Number, default: null }
    }],
    /**
     * Tools the agent called, in order: the account's own webhook tools,
     * connected MCP servers' (integration) and the built-in WhatsApp tools.
     * Written once at cleanup from the call's tool session
     * (services/tools/agent-tool-session.js). Arguments are truncated there;
     * results are not kept, only whether it worked.
     */
    toolCalls: [{
        _id: false,
        type: { type: String, enum: ['integration', 'webhook', 'whatsapp'], default: 'integration' },
        toolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', default: null },
        mcpServerId: { type: mongoose.Schema.Types.ObjectId, ref: 'McpServer', default: null },
        serverName: String,
        tool: String,
        arguments: { type: mongoose.Schema.Types.Mixed, default: null },
        ok: Boolean,
        error: { type: String, default: null },
        durationMs: Number,
        at: Date
    }],
    /**
     * Voice Quality diagnostics, accumulated by the classic pipelines during the call
     * and written once at cleanup. Latencies are measured from turn dispatch.
     */
    voiceMetrics: {
        turns: Number,
        interruptions: Number,
        falseVadEvents: Number,
        rtpQueueDrops: Number,
        ttsChunksSent: Number,
        avgLlmFirstTokenMs: Number,
        avgTtsFirstTextMs: Number,
        avgFirstAudioMs: Number,
        maxFirstAudioMs: Number
    },
    analysis: {
        isQualified: Boolean,
        qualificationScore: Number,
        reason: String,
        budget: String,
        timeline: String,
        nextSteps: String,
        aiOpinion: String
    },
    /**
     * Why the last analysis attempt (automatic or Analyze Now) produced nothing, in
     * words the call's owner can act on. Cleared when an analysis succeeds.
     */
    analysisError: {
        message: String,
        at: Date
    },
    startTime: {
        type: Date
    },
    endTime: {
        type: Date
    }
}, {
    timestamps: true
});

// A meeting bot's state webhook finds its call by the token in its URL.
callLogSchema.index({ 'meeting.webhookTokenHash': 1 }, { sparse: true });

const CallLog = mongoose.model('CallLog', callLogSchema);

module.exports = CallLog;
