/**
 * Per-agent Voice Quality & Conversation configuration.
 *
 * Resolves an agent's stored voice-quality fields (voiceQualityPreset,
 * elevenLabsVoiceSettings, turnTaking) into the concrete values the classic
 * pipelines feed to ElevenLabs, Deepgram and their own turn-taking timers.
 *
 * Backwards compatibility is the primary constraint: an agent that predates
 * these fields (or one left on the 'default' preset) must behave exactly like
 * today's hardcoded pipeline — no voice_settings sent, auto model selection,
 * latency-optimized chunk schedule, and the same turn-taking timings.
 */

/** Streaming-capable ElevenLabs models selectable per agent. 'auto' keeps the legacy rule. */
const EL_MODELS = ['eleven_turbo_v2_5', 'eleven_flash_v2_5', 'eleven_multilingual_v2'];

/**
 * ElevenLabs chunk_length_schedule per latency profile — the CURRENT replacement for the
 * deprecated optimize_streaming_latency query param. Smaller first buckets = faster first
 * audio; larger buckets = more context per generation = better prosody.
 * 'fast' mirrors what optimize_streaming_latency=3 used to do, so it is also the
 * 'default'-preset schedule (legacy behaviour preserved).
 */
const CHUNK_SCHEDULES = {
    fast: [50, 90, 120, 150, 200],
    balanced: [120, 160, 250, 290], // ElevenLabs default
    quality: [180, 250, 320, 400],
};

/**
 * Named presets → concrete ElevenLabs voice_settings + latency profile.
 * stability DOWN and style UP = more expressive but less consistent; speed is the
 * native ElevenLabs speed control (1.0 = neutral, supported range 0.7–1.2).
 */
const VOICE_PRESETS = {
    fast: { stability: 0.5, similarityBoost: 0.75, style: 0, useSpeakerBoost: false, speed: 1.0, latencyProfile: 'fast' },
    balanced: { stability: 0.5, similarityBoost: 0.75, style: 0, useSpeakerBoost: true, speed: 1.0, latencyProfile: 'balanced' },
    natural: { stability: 0.4, similarityBoost: 0.8, style: 0.15, useSpeakerBoost: true, speed: 1.0, latencyProfile: 'quality' },
    expressive: { stability: 0.3, similarityBoost: 0.8, style: 0.45, useSpeakerBoost: true, speed: 1.05, latencyProfile: 'quality' },
};

/** Fallbacks for a 'custom' preset whose individual fields were left empty. */
const CUSTOM_DEFAULTS = { stability: 0.5, similarityBoost: 0.75, style: 0, useSpeakerBoost: true, speed: 1.0 };

/**
 * Interrupt sensitivity → the knobs the classic pipelines' barge-in logic runs on.
 * 'normal' is exactly today's hardcoded behaviour.
 *   minInterruptWords — words the caller must say to cut the agent off mid-sentence
 *   stabilizationMs   — window after first audio where short utterances can't interrupt
 *   vadConfirmMs      — how long a bare VAD hit waits for a confirming transcript (false-VAD protection)
 */
const INTERRUPT_SENSITIVITY = {
    low: { minInterruptWords: 4, stabilizationMs: 3500, vadConfirmMs: 1600 },
    normal: { minInterruptWords: 3, stabilizationMs: 2500, vadConfirmMs: 1200 },
    high: { minInterruptWords: 2, stabilizationMs: 1200, vadConfirmMs: 800 },
};

/** Today's hardcoded turn-taking timings — used when the agent has no overrides. */
const TURN_TAKING_DEFAULTS = {
    endpointingMs: 300,      // Deepgram end-of-speech silence detection
    finalCompleteWaitMs: 200, // dispatch guard after a complete-sounding final
    finalIncompleteWaitMs: 500, // silence tolerance after an unfinished-sounding final
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);

/**
 * Resolve the ElevenLabs model for an agent.
 * 'auto' (or unset) keeps the legacy rule: Flash v2.5 for non-English (32 langs at ~75ms),
 * Turbo v2.5 for English.
 */
function resolveElevenLabsModel(agent) {
    const chosen = agent?.elevenLabsVoiceSettings?.model;
    if (chosen && EL_MODELS.includes(chosen)) return chosen;
    return agent?.language && agent.language !== 'en' ? 'eleven_flash_v2_5' : 'eleven_turbo_v2_5';
}

/**
 * Resolve everything the classic pipelines need for one call.
 * Returns:
 * {
 *   preset:          'default' | 'fast' | 'balanced' | 'natural' | 'expressive' | 'custom',
 *   voiceSettings:   null | ElevenLabs wire-format voice_settings for the BOS message,
 *   model:           ElevenLabs model id,
 *   latencyProfile:  'fast' | 'balanced' | 'quality',
 *   chunkSchedule:   generation_config.chunk_length_schedule array,
 *   chunking:        { legacy, minClauseChars, firstChunkChars } for the TTS chunk buffer,
 *   turnTaking:      { endpointingMs, finalCompleteWaitMs, finalIncompleteWaitMs,
 *                      minInterruptWords, stabilizationMs, vadConfirmMs }
 * }
 */
function resolveVoiceQuality(agent) {
    const preset = agent?.voiceQualityPreset || 'default';
    const stored = agent?.elevenLabsVoiceSettings || {};

    // ── voice_settings + latency profile ──
    let voiceSettings = null;
    let latencyProfile = 'fast'; // legacy default behaved like optimize_streaming_latency=3

    if (VOICE_PRESETS[preset]) {
        const p = VOICE_PRESETS[preset];
        voiceSettings = {
            stability: p.stability,
            similarity_boost: p.similarityBoost,
            style: p.style,
            use_speaker_boost: p.useSpeakerBoost,
            speed: p.speed,
        };
        latencyProfile = p.latencyProfile;
    } else if (preset === 'custom') {
        voiceSettings = {
            stability: clamp(num(stored.stability, CUSTOM_DEFAULTS.stability), 0, 1),
            similarity_boost: clamp(num(stored.similarityBoost, CUSTOM_DEFAULTS.similarityBoost), 0, 1),
            style: clamp(num(stored.style, CUSTOM_DEFAULTS.style), 0, 1),
            use_speaker_boost: typeof stored.useSpeakerBoost === 'boolean' ? stored.useSpeakerBoost : CUSTOM_DEFAULTS.useSpeakerBoost,
            speed: clamp(num(stored.speed, CUSTOM_DEFAULTS.speed), 0.7, 1.2),
        };
        latencyProfile = 'balanced';
    }
    // An explicit latencyProfile always wins (any preset, including custom)
    if (stored.latencyProfile && CHUNK_SCHEDULES[stored.latencyProfile]) {
        latencyProfile = stored.latencyProfile;
    }

    // ── TTS text chunking ──
    // 'default' keeps the legacy flush-on-any-punctuation buffer; every explicit preset
    // opts into the prosody-aware buffer, tuned by latency profile.
    const chunking = preset === 'default'
        ? { legacy: true, minClauseChars: 0, firstChunkChars: 12 }
        : {
            legacy: false,
            minClauseChars: latencyProfile === 'fast' ? 28 : latencyProfile === 'balanced' ? 48 : 72,
            firstChunkChars: 24,
        };

    // ── turn-taking ──
    const tt = agent?.turnTaking || {};
    const sensitivity = INTERRUPT_SENSITIVITY[tt.interruptSensitivity] || INTERRUPT_SENSITIVITY.normal;
    const turnTaking = {
        endpointingMs: clamp(num(tt.endpointingMs, TURN_TAKING_DEFAULTS.endpointingMs), 100, 2000),
        finalCompleteWaitMs: TURN_TAKING_DEFAULTS.finalCompleteWaitMs,
        finalIncompleteWaitMs: clamp(num(tt.silenceWaitMs, TURN_TAKING_DEFAULTS.finalIncompleteWaitMs), 200, 3000),
        ...sensitivity,
    };

    return {
        preset,
        voiceSettings,
        model: resolveElevenLabsModel(agent),
        latencyProfile,
        chunkSchedule: CHUNK_SCHEDULES[latencyProfile],
        chunking,
        turnTaking,
    };
}

/**
 * Build the ElevenLabs stream-input URL for a call.
 * optimize_streaming_latency is deprecated at ElevenLabs and no longer sent; the
 * latency behaviour now lives in the BOS generation_config.chunk_length_schedule
 * (see buildElevenLabsBOS).
 */
function buildElevenLabsStreamUrl({ voiceId, model, outputFormat = 'ulaw_8000' }) {
    return `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${model}&output_format=${outputFormat}`;
}

/**
 * Build the BOS (beginning-of-stream) message that authenticates the ElevenLabs
 * websocket and applies the per-agent voice_settings + chunk schedule.
 */
function buildElevenLabsBOS({ apiKey, voiceQuality }) {
    const bos = { text: ' ', xi_api_key: apiKey };
    if (voiceQuality?.voiceSettings) bos.voice_settings = voiceQuality.voiceSettings;
    if (voiceQuality?.chunkSchedule) bos.generation_config = { chunk_length_schedule: voiceQuality.chunkSchedule };
    return bos;
}

module.exports = {
    EL_MODELS,
    VOICE_PRESETS,
    CHUNK_SCHEDULES,
    INTERRUPT_SENSITIVITY,
    TURN_TAKING_DEFAULTS,
    resolveElevenLabsModel,
    resolveVoiceQuality,
    buildElevenLabsStreamUrl,
    buildElevenLabsBOS,
};
