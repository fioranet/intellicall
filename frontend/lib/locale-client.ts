"use client";

import { LOCALE_COOKIE, dirFor } from "@/i18n/config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * The locale cookie is deliberately readable by JS: it holds a display
 * preference, not a credential, and the switcher needs to write it without a
 * server round-trip so the layout can flip instantly.
 */
export function setLocaleCookie(locale: string) {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export function clearLocaleCookie() {
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Flip <html lang>/<html dir> immediately, ahead of the router refresh that
 * brings the new strings. Without this the layout direction lags the click.
 */
export function applyDocumentDir(locale: string) {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirFor(locale);
}
