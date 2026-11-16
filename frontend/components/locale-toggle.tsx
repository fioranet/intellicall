"use client";

import * as React from "react";
import { Check, Translate } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import axios from "axios";

import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@wixzel/react";
import { LOCALES } from "@/i18n/config";
import { setLocaleCookie, applyDocumentDir } from "@/lib/locale-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function LocaleToggle() {
    const locale = useLocale();
    const router = useRouter();
    const t = useTranslations("common");
    const [isPending, startTransition] = React.useTransition();

    const selectLocale = (next: string) => {
        if (next === locale) return;

        // Cookie + direction first so the layout flips on click; the refresh
        // below brings the translated strings a moment later.
        setLocaleCookie(next);
        applyDocumentDir(next);
        startTransition(() => router.refresh());

        // Persist so the choice follows the user to their other devices. Fire
        // and forget — a failed write just means the cookie is the only record.
        const token = localStorage.getItem("token");
        if (token) {
            axios
                .patch(
                    `${API_BASE_URL}/settings/ui-language`,
                    { uiLanguage: next },
                    { headers: { Authorization: `Bearer ${token}` } }
                )
                .catch(() => { });
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" loading={isPending} aria-label={t("language.change")}>
                    <Translate />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {LOCALES.map((option) => (
                    <DropdownMenuItem
                        key={option.code}
                        onClick={() => selectLocale(option.code)}
                        className="justify-between"
                    >
                        <span>{option.label}</span>
                        {option.code === locale && <Check />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
