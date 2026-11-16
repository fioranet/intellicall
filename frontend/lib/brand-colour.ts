import { colorVariables, deriveProduct } from "@wixzel/tokens";

/** IntelliCall's own colour, the seed of data-product="intellicall" in Wixzel UI. */
export const DEFAULT_BRAND_COLOUR = "#7C3AED";

// The backend still stores the old default for every install that never picked a
// colour, so it means "IntelliCall's colour" too, not a choice to keep.
const DEFAULT_COLOURS = new Set([DEFAULT_BRAND_COLOUR, "#8078F0"]);

let applied: string[] = [];

/**
 * Washes the whole app in the admin's brand colour. Wixzel UI derives every
 * colour role (page tint, panels, the primary action, links, focus) from one
 * seed so contrast holds in both themes; for IntelliCall's own colour the
 * stylesheet already has them, so the inline overrides are removed instead.
 */
export function applyBrandColour(hex: string | undefined) {
    const root = document.documentElement;
    for (const name of applied) root.style.removeProperty(name);
    applied = [];
    const seed = hex?.trim().toUpperCase();
    if (!seed || !/^#[0-9A-F]{6}$/.test(seed) || DEFAULT_COLOURS.has(seed)) return;
    for (const [name, value] of Object.entries(colorVariables(deriveProduct({ seed })))) {
        root.style.setProperty(name, value);
        applied.push(name);
    }
}
