/**
 * UI locale registry.
 *
 * NOTE: "locale" here means the *interface* language. It is unrelated to the
 * agent voice languages in components/agents/sarvam-options.ts, which control
 * what language the AI speaks on a call.
 */

export interface LocaleDef {
    /** Folder name under messages/ and the value stored in the cookie. */
    code: string;
    /** Shown in the language switcher — always written in its own language. */
    label: string;
    dir: "ltr" | "rtl";
}

// ─────────────────────────────────────────────────────────────────────────────
// Adding a language:
//   1. Add an entry to this array.
//   2. Create messages/<code>/ and copy the JSON files from messages/en/.
//   3. Translate the values. Anything you leave out falls back to English.
// ─────────────────────────────────────────────────────────────────────────────
export const LOCALES: LocaleDef[] = [
    { code: "pt", label: "Português", dir: "ltr" },
    { code: "en", label: "English", dir: "ltr" },
    { code: "es", label: "Español", dir: "ltr" },
    { code: "fr", label: "Français", dir: "ltr" },
    { code: "de", label: "Deutsch", dir: "ltr" },
    { code: "ar", label: "العربية", dir: "rtl" },
];

export const DEFAULT_LOCALE = "pt";

/** Cookie holding the visitor's chosen locale. Read server-side in i18n/request.ts. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const localeCodes = LOCALES.map((l) => l.code);

export function isLocale(value: unknown): value is string {
    return typeof value === "string" && localeCodes.includes(value);
}

export function dirFor(code: string): "ltr" | "rtl" {
    return LOCALES.find((l) => l.code === code)?.dir ?? "ltr";
}
