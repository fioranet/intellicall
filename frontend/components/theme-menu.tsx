"use client";

import { useTheme } from "next-themes";
import { ThemeMenu as WixzelThemeMenu, type Theme } from "@wixzel/react";
import { useTranslations } from "next-intl";

/**
 * The shared preference menu, bound to this app's theme owner. The library draws the
 * trigger, the glyphs and the rows; next-themes keeps the state and the attribute, so
 * nothing else writes `data-theme`. Light and dark only, as the provider mounts with
 * `enableSystem={false}`.
 *
 * Passing `onValueChange` is what hands control over, so the undefined `theme`
 * next-themes reports before it mounts is safe: the trigger shows the first row, which
 * is the provider's default anyway.
 */
export function ThemeMenu() {
    const t = useTranslations("common");
    const { theme, setTheme } = useTheme();

    return (
        <WixzelThemeMenu
            value={theme as Theme}
            onValueChange={setTheme}
            options={["light", "dark"]}
            aria-label={t("actions.toggleTheme")}
        />
    );
}
