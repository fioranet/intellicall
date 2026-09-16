/**
 * Sarvam AI model identifiers and the Bulbul v3 speaker roster.
 *
 * Kept in one place because the live call bridge and the voice-preview route must
 * agree — a speaker the preview accepts but the bridge rejects means the voice the
 * user auditioned is not the voice that dials out.
 *
 * Deprecations tracked here (Sarvam docs, Aug 2026):
 *  - Chat: `sarvam-m` was removed outright, and `sarvam-30b` is deprecated in favour
 *    of `sarvam-105b`. The chat-completions API now accepts only `sarvam-105b` and
 *    `sarvam-105b-conversations`; we use the latter, which is post-trained for
 *    real-time dialogue / voice-agent workloads.
 *  - STT: `saarika:v1`/`v2`/`flash` are deprecated. `saaras:v3-realtime` on
 *    /speech-to-text-realtime/ws is the current model for voice agents — it emits true
 *    partial transcripts, accepts µ-law 8 kHz natively and tunes its VAD in milliseconds.
 *    `saaras:v3` on /speech-to-text/ws is now the LEGACY endpoint (no interim results at
 *    all, only one final per utterance) and is kept solely as a fallback for accounts not
 *    yet enabled for realtime.
 *  - TTS: `bulbul:v1` was sunset (Apr 2025) and `bulbul:v2` is legacy; `bulbul:v3` is current.
 */

const SARVAM_STT_REALTIME_MODEL = 'saaras:v3-realtime';
const SARVAM_STT_MODEL = 'saaras:v3';   // legacy fallback only
const SARVAM_TTS_MODEL = 'bulbul:v3';
const SARVAM_LLM_MODEL = 'sarvam-105b-conversations';

/** Documented default speaker for bulbul:v3. */
const SARVAM_DEFAULT_SPEAKER = 'shubh';

/** Every speaker bulbul:v3 supports. */
const SARVAM_V3_SPEAKERS = [
    'shubh', 'aditya', 'ritu', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran',
    'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit',
    'roopa', 'kabir', 'aayan', 'ashutosh', 'advait', 'anand', 'tanya', 'tarun',
    'sunny', 'mani', 'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha',
    'rehan', 'soham', 'rupali',
];

/**
 * bulbul:v2-only speakers → the closest v3 voice.
 *
 * Agents created before the v3 migration have one of these stored on them (the old
 * default was 'anushka'), and v3 does not serve them. Mapped by apparent gender so an
 * existing agent keeps a broadly similar voice instead of silently flipping.
 */
const LEGACY_SPEAKER_MAP = {
    anushka: 'priya',
    manisha: 'priya',
    vidya: 'ritu',
    arya: 'kavya',
    abhilash: 'aditya',
    karun: 'aditya',
    hitesh: 'rahul',
};

/**
 * Coerce any stored speaker into one bulbul:v3 actually serves.
 * @param {string} speaker
 * @returns {string} a valid v3 speaker (never empty)
 */
function resolveSarvamSpeaker(speaker) {
    const name = String(speaker || '').trim().toLowerCase();
    if (!name) return SARVAM_DEFAULT_SPEAKER;
    if (SARVAM_V3_SPEAKERS.includes(name)) return name;
    return LEGACY_SPEAKER_MAP[name] || SARVAM_DEFAULT_SPEAKER;
}

module.exports = {
    SARVAM_STT_REALTIME_MODEL,
    SARVAM_STT_MODEL,
    SARVAM_TTS_MODEL,
    SARVAM_LLM_MODEL,
    SARVAM_DEFAULT_SPEAKER,
    SARVAM_V3_SPEAKERS,
    resolveSarvamSpeaker,
};
