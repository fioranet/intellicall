/**
 * Which provider API keys a given agent + transport actually needs.
 *
 * The per-agent voice engine only applies on SIP, or on Twilio when custom voice
 * is enabled; otherwise the standard Twilio gather loop always uses the classic trio.
 *
 *  - 'sarvam'         → fully self-contained (Saaras STT + Sarvam-105B LLM + Bulbul TTS),
 *                       so it needs ONLY a Sarvam key. No Deepgram/ElevenLabs/OpenRouter.
 *  - 'gemini_live'    → fully self-contained (one audio-in/audio-out model), so it needs
 *                       ONLY a Gemini key.
 *  - 'deepgram_agent' → Deepgram + ElevenLabs (LLM is Deepgram-managed, no OpenRouter).
 *  - 'classic'        → Deepgram + ElevenLabs + OpenRouter.
 *
 * @returns {string[]} human-readable names of the missing keys ([] when all present).
 */
function missingEngineKeys(settings, agent, provider) {
    // 'browser' is the in-browser agent test: it always drives a streaming engine
    // (the Twilio TwiML gather loop has no browser equivalent), so the per-engine
    // key requirements always apply there, exactly as they do on SIP.
    const engineApplies = provider === 'sip' || provider === 'browser' || agent?.useCustomVoice;
    const isSarvam = engineApplies && agent?.voiceEngine === 'sarvam';
    const isGemini = engineApplies && agent?.voiceEngine === 'gemini_live';
    const isDgAgent = engineApplies && agent?.voiceEngine === 'deepgram_agent';

    const missing = [];
    if (isSarvam) {
        if (!settings?.sarvamKey) missing.push('Sarvam');
        return missing;
    }
    if (isGemini) {
        if (!settings?.geminiKey) missing.push('Gemini');
        return missing;
    }
    if (!settings?.deepgramKey) missing.push('Deepgram');
    if (!settings?.elevenLabsKey) missing.push('ElevenLabs');
    if (!isDgAgent && !settings?.openRouterKey) missing.push('OpenRouter');
    return missing;
}

module.exports = { missingEngineKeys };
