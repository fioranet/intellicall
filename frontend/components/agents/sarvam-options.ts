// Sarvam AI (Bulbul v3) TTS speakers and supported Indian languages (BCP-47 codes).
// Shared by the agent drawer and sheet so the option lists stay in sync.
//
// The bulbul:v2 speakers (anushka, abhilash, manisha, vidya, arya, karun, hitesh) are
// deliberately absent — v3 does not serve them. Agents saved with one are coerced to a
// v3 equivalent server-side (backend/utils/sarvam-voices.js), so this list must stay in
// sync with SARVAM_V3_SPEAKERS there.
export const SARVAM_SPEAKERS = [
    "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran",
    "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan", "sumit",
    "roopa", "kabir", "aayan", "ashutosh", "advait", "anand", "tanya", "tarun",
    "sunny", "mani", "gokul", "vijay", "shruti", "suhani", "mohit", "kavitha",
    "rehan", "soham", "rupali",
] as const;

/** Documented default speaker for bulbul:v3. */
export const SARVAM_DEFAULT_SPEAKER = "shubh";

/** bulbul:v2-only speakers → closest v3 voice. Mirrors LEGACY_SPEAKER_MAP on the backend. */
const LEGACY_SPEAKER_MAP: Record<string, string> = {
    anushka: "priya",
    manisha: "priya",
    vidya: "ritu",
    arya: "kavya",
    abhilash: "aditya",
    karun: "aditya",
    hitesh: "rahul",
};

/**
 * Coerce a stored speaker to one bulbul:v3 serves, so editing a pre-v3 agent shows the
 * voice that will actually be used rather than an empty select.
 */
export function resolveSarvamSpeaker(speaker?: string | null): string {
    const name = (speaker || "").trim().toLowerCase();
    if (!name) return SARVAM_DEFAULT_SPEAKER;
    if ((SARVAM_SPEAKERS as readonly string[]).includes(name)) return name;
    return LEGACY_SPEAKER_MAP[name] || SARVAM_DEFAULT_SPEAKER;
}

export const SARVAM_LANGUAGES: { code: string; label: string; flag: string }[] = [
    { code: "hi-IN", label: "Hindi", flag: "🇮🇳" },
    { code: "en-IN", label: "English (India)", flag: "🇮🇳" },
    { code: "bn-IN", label: "Bengali", flag: "🇮🇳" },
    { code: "gu-IN", label: "Gujarati", flag: "🇮🇳" },
    { code: "kn-IN", label: "Kannada", flag: "🇮🇳" },
    { code: "ml-IN", label: "Malayalam", flag: "🇮🇳" },
    { code: "mr-IN", label: "Marathi", flag: "🇮🇳" },
    { code: "od-IN", label: "Odia", flag: "🇮🇳" },
    { code: "pa-IN", label: "Punjabi", flag: "🇮🇳" },
    { code: "ta-IN", label: "Tamil", flag: "🇮🇳" },
    { code: "te-IN", label: "Telugu", flag: "🇮🇳" },
];
