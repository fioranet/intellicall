"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, SiteHeader, SiteNavLink } from "@wixzel/react";
import {
    CaretRightIcon,
    HardDrivesIcon,
    PhoneCallIcon,
    PlugsConnectedIcon,
    SparkleIcon,
    TagIcon,
} from "@wixzel/react/icons";
import { useTranslations } from "next-intl";
import { ChromeLockup } from "@/components/landing/_shared/chrome-lockup";
import { ThemeMenu } from "@/components/theme-menu";

/**
 * The shared Wixzel header, carrying this site's own links. They are in-page anchors,
 * not routes, so the inked item follows the section being read rather than the URL.
 */
export function LandingHeader({
    isLoggedIn,
    showSelfHosting,
}: {
    isLoggedIn: boolean;
    showSelfHosting: boolean;
}) {
    const t = useTranslations("common");
    const navLinks = useMemo(
        () => [
            { id: "voice-engines", label: "Voice AI", icon: PhoneCallIcon },
            { id: "features", label: "Features", icon: SparkleIcon },
            { id: "integrations", label: "Integrations", icon: PlugsConnectedIcon },
            { id: "pricing", label: "Pricing", icon: TagIcon },
            ...(showSelfHosting ? [{ id: "self-host", label: "Self Host", icon: HardDrivesIcon }] : []),
        ],
        [showSelfHosting],
    );

    const current = useCurrentSection(navLinks.map((l) => l.id));

    return (
        <SiteHeader
            // The sheet names itself with this too, so it reads as a title, not as a button.
            labels={{ nav: t("ui.navigation"), menu: t("ui.navigation"), close: t("actions.close") }}
            brand={<ChromeLockup />}
            nav={navLinks.map((l) => (
                <SiteNavLink key={l.id} asChild current={current === l.id}>
                    <Link href={`#${l.id}`}>
                        <l.icon />
                        {l.label}
                    </Link>
                </SiteNavLink>
            ))}
            sheetFooter={
                isLoggedIn ? undefined : (
                    <Button asChild variant="ghost" size="sm" block>
                        <Link href="/login">Login</Link>
                    </Button>
                )
            }
            actions={
                <>
                    <ThemeMenu />
                    {isLoggedIn ? (
                        <Button asChild variant="primary" size="sm">
                            <Link href="/dashboard">Dashboard</Link>
                        </Button>
                    ) : (
                        <>
                            <Button asChild variant="ghost" size="sm" className="hidden xl:inline-flex">
                                <Link href="/login">Login</Link>
                            </Button>
                            <Button asChild variant="primary" size="sm" iconEnd={<CaretRightIcon />}>
                                <Link href="/signup">Get Started</Link>
                            </Button>
                        </>
                    )}
                </>
            }
        />
    );
}

/**
 * Which section is being read. The reading line is a shallow band just under the header:
 * whichever section crosses it is the current one, so exactly one item is inked at a
 * time and the ink moves once per boundary instead of flickering between two.
 */
function useCurrentSection(ids: string[]) {
    const key = ids.join(",");
    const [current, setCurrent] = useState<string>();

    useEffect(() => {
        const sections = key
            .split(",")
            .map((id) => document.getElementById(id))
            .filter((el): el is HTMLElement => !!el);
        if (!sections.length) return;

        const inBand = new Set<HTMLElement>();
        const settle = () => {
            // The last section to have reached the band is the one being read: where two
            // cross it, the one starting wins over the one ending.
            const next = [...inBand].sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
            setCurrent(next?.id);
        };

        const observer = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) inBand.add(e.target as HTMLElement);
                    else inBand.delete(e.target as HTMLElement);
                }
                settle();
            },
            // The band: from just under the 72px header down a quarter of the viewport.
            { rootMargin: "-72px 0px -75% 0px" },
        );
        sections.forEach((s) => observer.observe(s));
        return () => observer.disconnect();
    }, [key]);

    return current;
}
