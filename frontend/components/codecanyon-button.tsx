"use client";

import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
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
                <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2.5 text-sm font-semibold text-foreground backdrop-blur-md transition-colors hover:border-brand hover:text-brand"
                >
                    <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white">{t("selfHost.badge")}</span>
                    {t("selfHost.buyOn", { marketplace: l.label })}
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-brand rtl:-scale-x-100" />
                </a>
            ))}
        </div>
    );
}
