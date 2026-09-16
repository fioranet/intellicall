"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Instagram, Linkedin, Youtube } from "lucide-react";
import { useSettings, toExternalHref } from "@/components/settings-provider";
import { cn } from "@/lib/utils";

export function Footer() {
    const { branding, publicSite } = useSettings();
    const ig = publicSite.socialLinks.instagram?.trim();
    const li = publicSite.socialLinks.linkedin?.trim();
    const yt = publicSite.socialLinks.youtube?.trim();
    const hasSocial = !!(ig || li || yt);

    return (
        <footer className="bg-background border-t border-border py-16 px-6">
            <div className={cn("max-w-7xl mx-auto grid gap-12", hasSocial ? "md:grid-cols-4" : "md:grid-cols-3")}>
                <div className={cn("space-y-6", hasSocial ? "col-span-2" : "md:col-span-2")}>
                    <Logo width={180} height={45} variant="auto" />
                    <p className="text-muted-foreground max-w-sm">
                        Revolutionizing business communications with intelligent, automated calling solutions that scale with your growth.
                    </p>
                </div>
                <div className="space-y-4">
                    <h4 className="font-bold text-foreground uppercase text-xs tracking-widest">Company</h4>
                    <nav className="flex flex-col gap-2">
                        <Link href="/about" className="text-muted-foreground text-sm transition-colors" style={{ ["--hover-color" as any]: "var(--brand-primary)" }} onMouseEnter={e => (e.currentTarget.style.color = "var(--brand-primary)")} onMouseLeave={e => (e.currentTarget.style.color = "")}>About Us</Link>
                        <Link href="/contact" className="text-muted-foreground text-sm transition-colors" onMouseEnter={e => (e.currentTarget.style.color = "var(--brand-primary)")} onMouseLeave={e => (e.currentTarget.style.color = "")}>Contact</Link>
                        <Link href="/privacy" className="text-muted-foreground text-sm transition-colors" onMouseEnter={e => (e.currentTarget.style.color = "var(--brand-primary)")} onMouseLeave={e => (e.currentTarget.style.color = "")}>Privacy Policy</Link>
                        <Link href="/terms" className="text-muted-foreground text-sm transition-colors" onMouseEnter={e => (e.currentTarget.style.color = "var(--brand-primary)")} onMouseLeave={e => (e.currentTarget.style.color = "")}>Terms of Service</Link>
                    </nav>
                </div>
                {hasSocial && (
                    <div className="space-y-4">
                        <h4 className="font-bold text-foreground uppercase text-xs tracking-widest">Connect</h4>
                        <div className="flex gap-4">
                            {ig && (
                                <Button size="icon" variant="ghost" className="rounded-full bg-muted transition-all" asChild>
                                    <a href={toExternalHref(ig)} target="_blank" rel="noopener noreferrer" aria-label="Instagram" onMouseEnter={e => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--brand-primary) 10%, transparent)"; e.currentTarget.style.color = "var(--brand-primary)"; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; e.currentTarget.style.color = ""; }}>
                                        <Instagram className="h-5 w-5" />
                                    </a>
                                </Button>
                            )}
                            {li && (
                                <Button size="icon" variant="ghost" className="rounded-full bg-muted transition-all" asChild>
                                    <a href={toExternalHref(li)} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" onMouseEnter={e => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--brand-primary) 10%, transparent)"; e.currentTarget.style.color = "var(--brand-primary)"; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; e.currentTarget.style.color = ""; }}>
                                        <Linkedin className="h-5 w-5" />
                                    </a>
                                </Button>
                            )}
                            {yt && (
                                <Button size="icon" variant="ghost" className="rounded-full bg-muted transition-all" asChild>
                                    <a href={toExternalHref(yt)} target="_blank" rel="noopener noreferrer" aria-label="YouTube" onMouseEnter={e => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--brand-primary) 10%, transparent)"; e.currentTarget.style.color = "var(--brand-primary)"; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; e.currentTarget.style.color = ""; }}>
                                        <Youtube className="h-5 w-5" />
                                    </a>
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <div className="max-w-7xl mx-auto border-t border-border mt-16 pt-8 text-center text-muted-foreground/50 text-sm font-medium">
                © {new Date().getFullYear()} {branding.appName}. All rights reserved.
            </div>
        </footer>
    );
}
