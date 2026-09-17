// Gemini Live prebuilt voices and supported languages.
// Shared by the agent drawer so the option lists stay in one place.
//
// Keep the language codes in step with backend/services/gemini-live/gemini-languages.js:
// the backend turns the stored code into a language NAME for the system instruction, and a
// code it does not recognise silently drops the pinning.

export interface GeminiVoiceOption {
    name: string;
    label: string;
    description: string;
}

export const GEMINI_VOICES: GeminiVoiceOption[] = [
    { name: "Kore", label: "Camila", description: "Firme e Profissional" },
    { name: "Charon", label: "Lucas", description: "Informativo e Confiante" },
    { name: "Aoede", label: "Mariana", description: "Leve e Serena" },
    { name: "Puck", label: "Gabriel", description: "Alegre e Descontraído" },
    { name: "Zephyr", label: "Ana", description: "Brilhante e Clara" },
    { name: "Fenrir", label: "Rodrigo", description: "Empolgado e Enérgico" },
    { name: "Leda", label: "Beatriz", description: "Jovem e Espontânea" },
    { name: "Orus", label: "Eduardo", description: "Firme e Maduro" },
    { name: "Callirrhoe", label: "Larissa", description: "Calma e Descontraída" },
    { name: "Autonoe", label: "Juliana", description: "Brilhante e Convidativa" },
    { name: "Enceladus", label: "Rafael", description: "Suave e Acolhedor" },
    { name: "Iapetus", label: "Felipe", description: "Claro e Direto" },
    { name: "Umbriel", label: "Gustavo", description: "Tranquilo e Amigável" },
    { name: "Algieba", label: "Fernanda", description: "Fluida e Aveludada" },
    { name: "Despina", label: "Isabela", description: "Fluida e Natural" },
    { name: "Erinome", label: "Letícia", description: "Clara e Expressiva" },
    { name: "Algenib", label: "Bruno", description: "Encorpado e Marcante" },
    { name: "Rasalgethi", label: "André", description: "Informativo e Didático" },
    { name: "Laomedeia", label: "Amanda", description: "Animada e Gentil" },
    { name: "Achernar", label: "Leonardo", description: "Suave e Confortável" },
    { name: "Alnilam", label: "Patrícia", description: "Firme e Segura" },
    { name: "Schedar", label: "Diego", description: "Equilibrado e Estável" },
    { name: "Gacrux", label: "Carlos", description: "Maduro e Sóbrio" },
    { name: "Pulcherrima", label: "Priscila", description: "Assertiva e Clara" },
    { name: "Achird", label: "Renata", description: "Amigável e Calorosa" },
    { name: "Zubenelgenubi", label: "Marcelo", description: "Casual e Natural" },
    { name: "Vindemiatrix", label: "Tatiane", description: "Gentil e Cordial" },
    { name: "Sadachbia", label: "Luciana", description: "Vibrante e Positiva" },
    { name: "Sadaltager", label: "Daniel", description: "Especialista e Confiável" },
    { name: "Sulafat", label: "Sabrina", description: "Calorosa e Atenciosa" },
];

export const GEMINI_DEFAULT_VOICE = "Kore";
export const GEMINI_DEFAULT_LANGUAGE = "pt";

export function getGeminiVoiceLabel(name?: string): string {
    if (!name) return "Camila";
    const found = GEMINI_VOICES.find(
        (v) => v.name.toLowerCase() === name.toLowerCase() || v.label.toLowerCase() === name.toLowerCase()
    );
    return found ? found.label : name;
}

export function resolveGeminiVoiceName(nameOrLabel?: string): string {
    if (!nameOrLabel) return GEMINI_DEFAULT_VOICE;
    const found = GEMINI_VOICES.find(
        (v) => v.name.toLowerCase() === nameOrLabel.toLowerCase() || v.label.toLowerCase() === nameOrLabel.toLowerCase()
    );
    return found ? found.name : nameOrLabel;
}

/**
 * "auto" is not a language — it is the absence of a pin. Native-audio models have no
 * language parameter, so with "auto" the model follows the caller and may switch
 * mid-conversation; any other value adds a hard instruction to speak only that language.
 */
export const GEMINI_AUTO_LANGUAGE = "auto";

export const GEMINI_LANGUAGES: { code: string; label: string }[] = [
    { code: "pt", label: "Português (Brasil)" },
    { code: GEMINI_AUTO_LANGUAGE, label: "Detectar automaticamente (segue o chamador)" },
    { code: "en", label: "Inglês" },
    { code: "es", label: "Espanhol" },
    { code: "fr", label: "Francês" },
    { code: "de", label: "Alemão" },
    { code: "it", label: "Italiano" },
    { code: "ja", label: "Japonês" },
    { code: "zh", label: "Chinês" },
    { code: "ru", label: "Russo" },
    { code: "ar", label: "Árabe" },
    { code: "hi", label: "Hindi" },
    { code: "ko", label: "Coreano" },
    { code: "nl", label: "Holandês" },
    { code: "tr", label: "Turco" },
    { code: "pl", label: "Polonês" },
    { code: "sv", label: "Sueco" },
    { code: "da", label: "Dinamarquês" },
    { code: "fi", label: "Finlandês" },
    { code: "no", label: "Norueguês" },
    { code: "el", label: "Grego" },
    { code: "cs", label: "Tcheco" },
    { code: "ro", label: "Romeno" },
    { code: "hu", label: "Húngaro" },
    { code: "id", label: "Indonésio" },
    { code: "ms", label: "Malaio" },
    { code: "th", label: "Tailandês" },
    { code: "vi", label: "Vietnamita" },
    { code: "uk", label: "Ucraniano" },
    { code: "he", label: "Hebraico" },
    { code: "af", label: "Africâner" },
    { code: "ak", label: "Akan" },
    { code: "sq", label: "Albanês" },
    { code: "am", label: "Amárico" },
    { code: "hy", label: "Armênio" },
    { code: "as", label: "Assamês" },
    { code: "az", label: "Azerbaijano" },
    { code: "eu", label: "Basco" },
    { code: "be", label: "Bielorrusso" },
    { code: "bn", label: "Bengali" },
    { code: "bs", label: "Bósnio" },
    { code: "bg", label: "Búlgaro" },
    { code: "my", label: "Birmanês" },
    { code: "ca", label: "Catalão" },
    { code: "ceb", label: "Cebuano" },
    { code: "hr", label: "Croata" },
    { code: "et", label: "Estoniano" },
    { code: "fo", label: "Faroês" },
    { code: "fil", label: "Filipino" },
    { code: "gl", label: "Galego" },
    { code: "ka", label: "Georgiano" },
    { code: "gu", label: "Guzerate" },
    { code: "ha", label: "Hauçá" },
    { code: "iw", label: "Hebraico (legado)" },
    { code: "is", label: "Islandês" },
    { code: "ga", label: "Irlandês" },
    { code: "kn", label: "Canarim" },
    { code: "kk", label: "Cazaque" },
    { code: "km", label: "Khmer" },
    { code: "rw", label: "Kinyarwanda" },
    { code: "ku", label: "Curdo" },
    { code: "ky", label: "Quirguiz" },
    { code: "lo", label: "Laosiano" },
    { code: "lv", label: "Letão" },
    { code: "lt", label: "Lituano" },
    { code: "mk", label: "Macedônio" },
    { code: "ml", label: "Malaiala" },
    { code: "mt", label: "Maltês" },
    { code: "mi", label: "Maori" },
    { code: "mr", label: "Marata" },
    { code: "mn", label: "Mongol" },
    { code: "ne", label: "Nepalês" },
    { code: "or", label: "Odia" },
    { code: "om", label: "Oromo" },
    { code: "ps", label: "Pashto" },
    { code: "fa", label: "Persa" },
    { code: "pa", label: "Punjabi" },
    { code: "qu", label: "Quéchua" },
    { code: "rm", label: "Romanche" },
    { code: "sr", label: "Sérvio" },
    { code: "sd", label: "Sindi" },
    { code: "si", label: "Cingalês" },
    { code: "sk", label: "Eslovaco" },
    { code: "sl", label: "Esloveno" },
    { code: "so", label: "Somali" },
    { code: "st", label: "Soto do Sul" },
    { code: "sw", label: "Suaíli" },
    { code: "tg", label: "Tajique" },
    { code: "ta", label: "Tâmil" },
    { code: "te", label: "Telugu" },
    { code: "tn", label: "Tswana" },
    { code: "tk", label: "Turcomeno" },
    { code: "ur", label: "Urdu" },
    { code: "uz", label: "Uzbeque" },
    { code: "cy", label: "Galês" },
    { code: "fy", label: "Frísio Ocidental" },
    { code: "wo", label: "Uolofe" },
    { code: "yo", label: "Iorubá" },
    { code: "zu", label: "Zulu" },
];
