// Which provider API keys each voice engine actually needs.
// Frontend mirror of backend/utils/engine-keys.js — that file stays the authority
// (it gates real calls); this one only decides what the agent drawer offers, so a
// user is never blocked from an engine whose keys they DO have.

export type EngineId = "twilio_standard" | "classic" | "deepgram_agent" | "gemini_live" | "sarvam";

export interface EngineConfigStatus {
    isTwilioConfigured: boolean;
    isElevenLabsConfigured: boolean;
    isDeepgramConfigured: boolean;
    isModelConfigured: boolean;
    isSarvamConfigured: boolean;
    isGeminiConfigured: boolean;
}

/** Engines offered in the dropdown, in display order. */
export const VOICE_ENGINES: EngineId[] = ["twilio_standard", "classic", "deepgram_agent", "gemini_live", "sarvam"];

/**
 * Engines that only run on the SIP transport today. Gemini Live speaks 16k/24k PCM rather
 * than µ-law, and only the SIP transport resamples for it — the Twilio media-stream path has
 * no Gemini branch, so offering it on a Twilio number would produce a call that connects and
 * says nothing. An agent with NO outbound number is fine: inbound SIP calls reach the agent
 * through the Phone Numbers page assignment, so only an actual Twilio number blocks these.
 */
export const SIP_ONLY_ENGINES: EngineId[] = ["gemini_live"];

/**
 * Human-readable names of the keys still missing for an engine ([] means usable).
 * A null configStatus means "not loaded yet" — treat everything as usable so the
 * form doesn't flicker into a disabled state during the fetch.
 *
 * `deepgramVoice` is the Deepgram Voice Agent's Aura voice: a non-empty string means it
 * speaks with Deepgram TTS (no ElevenLabs key), "" or null means it speaks with ElevenLabs.
 * Left undefined — the engine picker — the engine counts as usable with either voice.
 */
export function missingKeysForEngine(engine: EngineId, cs: EngineConfigStatus | null, deepgramVoice?: string | null): string[] {
    if (!cs) return [];
    const missing: string[] = [];
    switch (engine) {
        case "sarvam":
            // Fully self-contained: Saaras STT + Sarvam-105B LLM + Bulbul TTS.
            if (!cs.isSarvamConfigured) missing.push("Sarvam");
            return missing;
        case "gemini_live":
            // Fully self-contained: one model does speech, reasoning and voice.
            if (!cs.isGeminiConfigured) missing.push("Gemini");
            return missing;
        case "deepgram_agent":
            // LLM is Deepgram-managed, so no OpenRouter key needed; an Aura voice needs no ElevenLabs.
            if (!cs.isDeepgramConfigured) missing.push("Deepgram");
            if (deepgramVoice !== undefined && !deepgramVoice && !cs.isElevenLabsConfigured) missing.push("ElevenLabs");
            return missing;
        case "classic":
            if (!cs.isDeepgramConfigured) missing.push("Deepgram");
            if (!cs.isElevenLabsConfigured) missing.push("ElevenLabs");
            if (!cs.isModelConfigured) missing.push("OpenRouter");
            return missing;
        case "twilio_standard":
            if (!cs.isTwilioConfigured) missing.push("Twilio");
            return missing;
    }
}

export function isEngineUsable(engine: EngineId, cs: EngineConfigStatus | null): boolean {
    return missingKeysForEngine(engine, cs).length === 0;
}

/**
 * The engines a user can actually pick right now. `allowTwilioStandard` is false
 * for a SIP number, where the Twilio TwiML voice path doesn't apply.
 *
 * `nonSipNumberSelected` is true when the agent's outbound number is a real non-SIP
 * (Twilio) number — the one case that rules out SIP-only engines. It defaults to false
 * because "no outbound number" (new agents, inbound-only agents) does NOT block them.
 */
export function usableEngines(
    cs: EngineConfigStatus | null,
    allowTwilioStandard: boolean,
    nonSipNumberSelected = false,
): EngineId[] {
    return VOICE_ENGINES.filter((e) => {
        if (e === "twilio_standard" && !allowTwilioStandard) return false;
        if (SIP_ONLY_ENGINES.includes(e) && nonSipNumberSelected) return false;
        return isEngineUsable(e, cs);
    });
}

/** The agent fields that decide which engine and voice a call actually uses. */
export interface AgentVoiceFields {
    voiceEngine?: string;
    useCustomVoice?: boolean;
    voice?: string;
    voiceName?: string;
    sarvamSpeaker?: string;
    geminiVoice?: string;
    deepgramVoice?: string;
}

/** "aura-2-livia-it" → "Livia": the voice name is the second-to-last segment of an Aura id. */
export function deepgramVoiceName(model: string): string {
    const parts = model.split("-");
    const name = parts.length >= 3 ? parts[parts.length - 2] : model;
    return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Display name of the engine a call will run on. The Sarvam and Gemini engines also set
 * useCustomVoice, so reading that flag alone labels every streaming agent "ElevenLabs".
 */
export function agentVoiceProvider(a?: AgentVoiceFields | null): string {
    if (!a) return "";
    if (a.voiceEngine === "sarvam") return "Sarvam AI";
    if (a.voiceEngine === "gemini_live") return "Gemini Live";
    if (a.voiceEngine === "deepgram_agent") return "Deepgram Voice Agent";
    return a.useCustomVoice ? "ElevenLabs" : "Twilio";
}

/**
 * The voice that will actually speak. Sarvam, Gemini and Deepgram Aura store it on their own
 * fields (sarvamSpeaker, geminiVoice, deepgramVoice), never on voiceName.
 */
export function agentVoiceLabel(a?: AgentVoiceFields | null): string {
    if (!a) return "";
    if (a.voiceEngine === "sarvam") {
        return a.sarvamSpeaker ? a.sarvamSpeaker.charAt(0).toUpperCase() + a.sarvamSpeaker.slice(1) : "Sarvam Voice";
    }
    if (a.voiceEngine === "gemini_live") return a.geminiVoice || "Gemini Voice";
    if (a.voiceEngine === "deepgram_agent" && a.deepgramVoice) return deepgramVoiceName(a.deepgramVoice);
    return a.useCustomVoice ? (a.voiceName || "Premium Voice") : (a.voice || "Standard Voice");
}
