const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign'
    },
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true
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
        enum: ['twilio', 'sip'],
        default: 'twilio'
    },
    voiceEngine: {
        type: String,
        enum: ['classic', 'deepgram_agent', 'sarvam', 'gemini_live'],
        default: 'classic'
    },
    duration: {
        type: Number, // in seconds
        default: 0
    },
    isManagedAi: {
        type: Boolean,
        default: false
    },
    creditsConsumed: {
        type: Number,
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
        service: { type: String, enum: ['elevenlabs', 'deepgram', 'openrouter', 'twilio', 'sarvam', 'system'] },
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
    startTime: {
        type: Date
    },
    endTime: {
        type: Date
    }
}, {
    timestamps: true
});

const CallLog = mongoose.model('CallLog', callLogSchema);

module.exports = CallLog;
