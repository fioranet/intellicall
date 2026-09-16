import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./config";
import { loadMessages } from "./load-messages";

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const stored = cookieStore.get(LOCALE_COOKIE)?.value;
    const locale = isLocale(stored) ? stored : DEFAULT_LOCALE;

    return { locale, messages: await loadMessages(locale) };
});
