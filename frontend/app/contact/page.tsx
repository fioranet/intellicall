"use client";

import Link from "next/link";
import { ChevronLeft, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Footer } from "@/components/layout/footer";
import { getContactDisplayEmail, useSettings } from "@/components/settings-provider";

export default function ContactPage() {
    const { branding, publicSite } = useSettings();
    const contactEmail = getContactDisplayEmail(publicSite);

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground font-sora">
            <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/">
                        <Logo width={180} height={45} variant="auto" />
                    </Link>
                    <div className="flex items-center gap-4">
                        <ModeToggle />
                        <Button asChild variant="ghost" className="rounded-full">
                            <Link href="/"><ChevronLeft className="mr-2 h-4 w-4" /> Back to Home</Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="pt-32 pb-20 px-6">
                <div className="max-w-2xl mx-auto space-y-12">
                    <div className="space-y-6">
                        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
                            Get in <span style={{ color: branding.primaryColor }}>Touch</span>
                        </h1>
                        <p className="text-xl text-muted-foreground leading-relaxed">
                            Have questions about how {branding.appName} can help your business? We're here to help.
                        </p>
                    </div>

                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-muted rounded-2xl" style={{ color: branding.primaryColor }}>
                            <Mail className="h-6 w-6" />
                        </div>
                        <div>
                            <h4 className="font-bold">Email Us</h4>
                            <p className="text-muted-foreground">
                                <a href={`mailto:${contactEmail}`} className="hover:underline" style={{ color: "inherit" }}>
                                    {contactEmail}
                                </a>
                            </p>
                        </div>
                    </div>

                    {publicSite.hqAddress && (
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-muted rounded-2xl" style={{ color: branding.primaryColor }}>
                                <MapPin className="h-6 w-6" />
                            </div>
                            <div>
                                <h4 className="font-bold">Headquarters</h4>
                                <p className="text-muted-foreground">{publicSite.hqAddress}</p>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
}
