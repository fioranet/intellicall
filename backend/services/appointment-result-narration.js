const axios = require('axios');
const { openRouterModel } = require('../utils/models');
const { SARVAM_LLM_MODEL } = require('../utils/sarvam-voices');

/** Align with agent voice language options in voice-stream.js / agent-sheet */
const LANG_MAP = {
    ar: 'Arabic',
    hi: 'Hindi',
    he: 'Hebrew',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    'pt-BR': 'Portuguese (Brazil)',
    it: 'Italian',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    nl: 'Dutch',
    ur: 'Urdu',
    ta: 'Tamil',
};

/**
 * Turn raw English appointment tool output into text suitable for TTS.
 * English: same as legacy path (optional speakTimeFn for HH:mm → words).
 * Other languages: non-streaming LLM paraphrase; falls back to English path on failure.
 *
 * @param {object} opts
 * @param {string} opts.rawResult
 * @param {string} [opts.agentLanguage]
 * @param {string} [opts.lastUserUtterance] — for multi: language detection
 * @param {boolean} opts.isListOrSlots
 * @param {string} [opts.openRouterKey]
 * @param {string} [opts.sarvamKey] — used (with Sarvam's chat model) when no OpenRouter key is set,
 *   e.g. the self-contained Sarvam voice engine.
 * @param {string} [opts.model]
 * @param {(text: string) => string} [opts.speakTimeFn] — English fallback path
 * @param {'booking'|'transfer'} [opts.domain='booking'] — which kind of result is being
 *   narrated. Only changes the non-English system prompt; 'booking' is the original wording.
 */
async function narrateAppointmentResult({
    rawResult,
    agentLanguage,
    lastUserUtterance,
    isListOrSlots,
    openRouterKey,
    sarvamKey,
    model = openRouterModel,
    speakTimeFn,
    domain = 'booking',
}) {
    const normalized = (rawResult || '').replace(/\n+/g, '. ').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';

    const lang = agentLanguage || 'en';

    const englishTts = () => {
        let voiceText = normalized;
        voiceText = speakTimeFn ? speakTimeFn(voiceText) : voiceText;
        return isListOrSlots ? `${voiceText}. What day and time would you like?` : voiceText;
    };

    if (lang === 'en') {
        return englishTts();
    }

    if (!openRouterKey && !sarvamKey) {
        return englishTts();
    }

    const userTail = isListOrSlots
        ? 'If there are many time slots, give a brief summary (e.g. the next few options) and offer to hear more detail. End with one short question to help them choose a day and time.'
        : 'State the outcome clearly in natural spoken style. Maximum 3 short sentences.';

    // The only difference a non-booking domain makes: what the narrator is told it narrates.
    const domainSentence = domain === 'transfer'
        ? 'You relay the outcome of a call transfer on a phone call.'
        : 'You narrate booking-system results on a phone call.';

    const userContent = `BACKEND RESULT (English, facts only):\n${rawResult}\n\n${userTail}`;

    let systemPrompt;
    if (lang === 'multi') {
        const sample = JSON.stringify((lastUserUtterance || '').trim() || 'unknown');
        systemPrompt =
            `${domainSentence} The facts are in the user message. ` +
            'Respond ONLY in the same language the caller used in their last message (infer from the sample below). ' +
            'If you cannot detect the language, use English. ' +
            'No bullet lists. Natural spoken phrasing only. Prefer words for dates and times, not raw ISO strings.\n' +
            `Last caller message (for language detection): ${sample}`;
    } else {
        const langName = LANG_MAP[lang] || LANG_MAP[lang.split('-')[0]] || lang;
        systemPrompt =
            `${domainSentence} The facts are in the user message. ` +
            `Respond ONLY in ${langName}. No bullet lists. Natural spoken phrasing only. ` +
            `Prefer words for dates and times appropriate for ${langName}, not raw ISO strings.`;
    }

    // Prefer OpenRouter when available; otherwise use Sarvam's chat model (self-contained Sarvam engine).
    const useSarvam = !openRouterKey && !!sarvamKey;
    const llmUrl = useSarvam ? 'https://api.sarvam.ai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const llmModel = useSarvam ? SARVAM_LLM_MODEL : model;
    const llmKey = useSarvam ? sarvamKey : openRouterKey;

    try {
        const resp = await axios.post(
            llmUrl,
            {
                model: llmModel,
                temperature: 0.3,
                max_tokens: 400,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent },
                ],
                // Sarvam reasons by default (slow); disable it for this short narration hop.
                ...(useSarvam ? { reasoning_effort: null } : {}),
            },
            {
                headers: {
                    Authorization: `Bearer ${llmKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 25000,
            }
        );

        const text = (resp.data?.choices?.[0]?.message?.content || '').trim();
        if (text) return text;
    } catch (err) {
        console.error('[AppointmentNarration] OpenRouter error:', err.message);
    }

    return englishTts();
}

module.exports = { narrateAppointmentResult, LANG_MAP };
