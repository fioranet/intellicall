import { DEFAULT_LOCALE } from "./config";

/**
 * One file per product area under messages/<locale>/. Keeping them split means
 * no single catalog file grows past a few hundred lines, so a translator can
 * work on one screen without scrolling past the rest of the app.
 */
export const NAMESPACES = [
    "common",
    "nav",
    "auth",
    "dashboard",
    "leads",
    "agents",
    "campaigns",
    "calls",
    "numbers",
    "knowledge",
    "appointments",
    "sip",
    "support",
    "settings",
    "users",
    "admin",
    "errors",
] as const;

type Tree = Record<string, unknown>;

/** Overlay `over` on top of `base`, recursing into plain objects. */
function deepMerge(base: Tree, over: Tree): Tree {
    const out: Tree = { ...base };
    for (const [key, value] of Object.entries(over)) {
        const existing = out[key];
        const bothPlainObjects =
            existing !== null && value !== null &&
            typeof existing === "object" && typeof value === "object" &&
            !Array.isArray(existing) && !Array.isArray(value);
        out[key] = bothPlainObjects
            ? deepMerge(existing as Tree, value as Tree)
            : value;
    }
    return out;
}

async function loadNamespace(locale: string, namespace: string): Promise<Tree> {
    try {
        return (await import(`../messages/${locale}/${namespace}.json`)).default;
    } catch {
        // Missing file is not an error — the English underlay below covers it.
        return {};
    }
}

async function loadTree(locale: string): Promise<Tree> {
    const entries = await Promise.all(
        NAMESPACES.map(async (ns) => [ns, await loadNamespace(locale, ns)] as const)
    );
    return Object.fromEntries(entries);
}

/**
 * Load a locale's catalog layered over the full English one, so a partially
 * translated language renders English for the keys it is missing rather than
 * exposing raw key paths to the user.
 */
export async function loadMessages(locale: string): Promise<Tree> {
    const english = await loadTree(DEFAULT_LOCALE);
    if (locale === DEFAULT_LOCALE) return english;
    return deepMerge(english, await loadTree(locale));
}
