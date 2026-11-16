"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button, FooterColumn, FooterLink, SiteFooter } from "@wixzel/react";
import { InstagramLogo, LinkedinLogo, YoutubeLogo } from "@phosphor-icons/react";
import { useSettings, toExternalHref } from "@/components/settings-provider";
import { ThemeMenu } from "@/components/theme-menu";

export function Footer() {
    const { publicSite } = useSettings();
    const ig = publicSite.socialLinks.instagram?.trim();
    const li = publicSite.socialLinks.linkedin?.trim();
    const yt = publicSite.socialLinks.youtube?.trim();
    const hasSocial = !!(ig || li || yt);

    const social = [
        ig && { href: ig, label: "Instagram", icon: InstagramLogo },
        li && { href: li, label: "LinkedIn", icon: LinkedinLogo },
        yt && { href: yt, label: "YouTube", icon: YoutubeLogo },
    ].filter(Boolean) as { href: string; label: string; icon: typeof InstagramLogo }[];

    // The shared footer: this site's own columns lead, then the company signs off.
    // The copyright line is the library's, the same wording on every Wixzel site.
    return (
        <SiteFooter
            logo={
                <>
                    <img src="/wixzel_black.png" alt="Wixzel" className="block dark:hidden" />
                    <img src="/wixzel_white.png" alt="Wixzel" className="hidden dark:block" />
                </>
            }
            preferences={<ThemeMenu />}
            lede={
                <div className="flex flex-col gap-5">
                    <Logo width={180} height={45} variant="auto" />
                    <p className="max-w-sm text-body-md text-fg-muted">
                        Revolutionizing business communications with intelligent, automated calling solutions that scale with your growth.
                    </p>
                </div>
            }
        >
            <FooterColumn label="Company">
                <FooterLink asChild><Link href="/about">About Us</Link></FooterLink>
                <FooterLink asChild><Link href="/contact">Contact</Link></FooterLink>
                <FooterLink asChild><Link href="/privacy">Privacy Policy</Link></FooterLink>
                <FooterLink asChild><Link href="/terms">Terms of Service</Link></FooterLink>
            </FooterColumn>

            {hasSocial && (
                <FooterColumn label="Connect">
                    <li className="flex gap-1">
                        {social.map((s) => (
                            <Button key={s.label} asChild variant="ghost" size="icon">
                                <a href={toExternalHref(s.href)} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
                                    <s.icon className="size-5" />
                                </a>
                            </Button>
                        ))}
                    </li>
                </FooterColumn>
            )}
        </SiteFooter>
    );
}
