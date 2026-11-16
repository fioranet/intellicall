"use client";

import { usePathname } from "next/navigation";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Badge, Button } from "@wixzel/react";
import { useSettings } from "@/components/settings-provider";

import { useTranslations } from "next-intl";
const ALLOWED_PATHS = new Set(["/", "/about", "/contact", "/terms", "/privacy"]);

const LINKS = [
    { label: "CodeCanyon", href: "https://codecanyon.net/item/intellicall-ai-ai-voice-calling-agents-for-lead-campaign-automation/61664541" },
    { label: "Wixzel Store", href: "https://store.wixzel.com/products/intellicall-ai" },
];

export function CodeCanyonButton() {
    const t = useTranslations("common");
    const pathname = usePathname();
    const { showCodeCanyonButton } = useSettings();

    if (!showCodeCanyonButton) return null;
    if (!pathname || !ALLOWED_PATHS.has(pathname)) return null;

    return (
        <div className="fixed bottom-6 end-6 z-50 flex flex-col items-end gap-2">
            {LINKS.map((l) => (
                <Button
                    key={l.label}
                    asChild
                    size="lg"
                    iconStart={<Badge tone="accent" appearance="solid" size="sm">{t("selfHost.badge")}</Badge>}
                    iconEnd={<ArrowUpRight className="rtl:-scale-x-100" />}
                >
                    <a href={l.href} target="_blank" rel="noopener noreferrer">
                        {t("selfHost.buyOn", { marketplace: l.label })}
                    </a>
                </Button>
            ))}
        </div>
    );
}
