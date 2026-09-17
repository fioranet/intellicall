const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    systemPrompt: {
        type: String,
        required: true
    },
    openingMessage: {
        type: String,
        required: true
    },
    voiceId: {
        type: String,
        trim: true,
        default: '21m00Tcm4TlvDq8ikWAM' // Default Rachel
    },
    voiceName: {
        type: String,
        trim: true,
        default: 'Rachel'
    },
    useCustomVoice: {
        type: Boolean,
        default: false
    },
    /**
     * Voice pipeline engine (applies when custom voice is active):
     * 'classic'        — self-orchestrated Deepgram STT → OpenRouter LLM → ElevenLabs TTS
     * 'deepgram_agent' — Deepgram Voice Agent API (server-side orchestration, low latency)
     * 'sarvam'         — self-contained Sarvam AI pipeline (Saaras STT → Sarvam-105B LLM →
     *                    Bulbul TTS) for Indian languages; needs only a Sarvam API key
     * 'gemini_live'    — Google Gemini Live API; one audio-in/audio-out model does
     *                    recognition, reasoning and speech; needs only a Gemini API key
     */
    voiceEngine: {
        type: String,
        enum: ['classic', 'deepgram_agent', 'sarvam', 'gemini_live'],
        default: 'classic'
    },
    /**
     * Sarvam TTS speaker (bulbul:v3), used when voiceEngine === 'sarvam'.
     * Agents predating the v3 migration may hold a v2-only speaker; those are
     * coerced at call time by utils/sarvam-voices → resolveSarvamSpeaker.
     */
    sarvamSpeaker: {
        type: String,
        default: 'shubh'
    },
    /** Sarvam BCP-47 language code (e.g. 'hi-IN'), used when voiceEngine === 'sarvam'. */
    sarvamLanguage: {
        type: String,
        default: 'hi-IN'
    },
    /** Gemini Live prebuilt voice name, used when voiceEngine === 'gemini_live'. */
    geminiVoice: {
        type: String,
        default: 'Kore'
    },
    /**
     * Language the Gemini agent speaks, used when voiceEngine === 'gemini_live'.
     * 'auto' leaves the model's natural multilingual behaviour alone — it follows the
     * caller and may switch mid-conversation. Any other code (see
     * services/gemini-live/gemini-languages.js) pins the agent to that language through
     * the system instruction, which is the only lever native-audio models expose.
     */
    geminiLanguage: {
        type: String,
        default: 'pt'
    },
    /**
     * Voice Quality preset (classic SIP/Twilio engines, ElevenLabs TTS).
     * 'default' preserves the exact pre-v10.9 pipeline behaviour (no voice_settings
     * sent to ElevenLabs, legacy chunking); named presets and 'custom' opt in to
     * per-session voice_settings + prosody-aware chunking. See utils/voice-quality.js.
     */
    voiceQualityPreset: {
        type: String,
        enum: ['default', 'fast', 'balanced', 'natural', 'expressive', 'custom'],
        default: 'default'
    },
    /**
     * Raw ElevenLabs per-session controls, used when voiceQualityPreset === 'custom'
     * (model/latencyProfile also apply to named presets when set). Nulls fall back
     * to safe defaults at call time.
     */
    elevenLabsVoiceSettings: {
        stability: { type: Number, min: 0, max: 1, default: null },
        similarityBoost: { type: Number, min: 0, max: 1, default: null },
        style: { type: Number, min: 0, max: 1, default: null },
        useSpeakerBoost: { type: Boolean, default: null },
        speed: { type: Number, min: 0.7, max: 1.2, default: null },
        /** 'auto' keeps the legacy language-based Flash/Turbo selection. */
        model: {
            type: String,
            enum: ['auto', 'eleven_turbo_v2_5', 'eleven_flash_v2_5', 'eleven_multilingual_v2'],
            default: 'auto'
        },
        /** Drives the ElevenLabs chunk_length_schedule + TTS text chunking granularity. */
        latencyProfile: {
            type: String,
            enum: ['auto', 'fast', 'balanced', 'quality'],
            default: 'auto'
        }
    },
    /**
     * Conversation / turn-taking controls (classic engines only — the Deepgram Voice
     * Agent and Gemini Live engines do their endpointing and barge-in server-side).
     * Nulls = the pipeline defaults that shipped before these fields existed.
     */
    turnTaking: {
        /** Deepgram endpointing (end-of-speech silence) in ms. Default 300. */
        endpointingMs: { type: Number, min: 100, max: 2000, default: null },
        /** Extra silence tolerated after an unfinished-sounding utterance. Default 500. */
        silenceWaitMs: { type: Number, min: 200, max: 3000, default: null },
        /** How easily the caller can barge in over the agent. Default 'normal'. */
        interruptSensitivity: {
            type: String,
            enum: ['low', 'normal', 'high'],
            default: 'normal'
        }
    },
    /**
     * Human Transfer / call routing. When enabled, the agent gains a transfer
     * capability (a native tool on the Deepgram/Gemini engines, a [[TRANSFER:id]]
     * command tag on the classic/Sarvam engines) that hands the live caller to one of
     * the authorised destinations below. SIP/Asterisk calls only — the Twilio transport
     * and the in-browser agent test have no second leg to bridge, so the capability is
     * never offered there.
     *
     * The model only ever sees destination ids and names; the phone numbers are
     * resolved server-side at dial time, so a hallucinating agent cannot dial an
     * arbitrary number. Defaults keep every pre-v11.5 agent on the exact old path.
     */
    humanTransfer: {
        enabled: { type: Boolean, default: false },
        /** 'blind' hands the caller straight over. Warm/attended transfer is not built yet. */
        mode: { type: String, enum: ['blind'], default: 'blind' },
        /** Used when the caller just asks for "a person" without naming a destination. */
        defaultDestinationId: { type: String, trim: true, default: '' },
        /** How long the destination may ring before the caller is handed back to the AI. */
        ringTimeoutSeconds: { type: Number, min: 5, max: 60, default: 20 },
        /** Stops a loop where the agent keeps re-dialling an unreachable human. */
        maxTransfersPerCall: { type: Number, min: 1, max: 10, default: 3 },
        returnToAgentOnFailure: { type: Boolean, default: true },
        destinations: [{
            _id: false,
            id: { type: String, required: true, trim: true, lowercase: true },
            name: { type: String, required: true, trim: true },
            type: { type: String, enum: ['phone'], default: 'phone' },
            value: { type: String, required: true, trim: true },
            enabled: { type: Boolean, default: true },
            /** null = inherit ringTimeoutSeconds above. */
            timeoutSeconds: { type: Number, min: 5, max: 60, default: null }
        }]
    },
    outboundPhoneNumber: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PhoneNumber',
        default: null
    },
    knowledgeBaseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'KnowledgeBase',
        default: null
    },
    kbSettings: {
        useBasicInfo: { type: Boolean, default: true },
        useFaqs: { type: Boolean, default: true },
        useOtherInfo: { type: Boolean, default: true }
    },
    language: {
        type: String,
        default: 'pt-BR'
    },
    appointmentBookingEnabled: {
        type: Boolean,
        default: false
    },
    appointmentDescription: {
        type: String,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

const Agent = mongoose.model('Agent', agentSchema);

module.exports = Agent;
