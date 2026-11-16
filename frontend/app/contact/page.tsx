"use client";

import { Envelope, MapPin } from "@phosphor-icons/react";
import { Card } from "@wixzel/react";
import { Footer } from "@/components/layout/footer";
import { PublicPageHeader } from "@/components/landing/_shared/public-page-header";
import { getContactDisplayEmail, useSettings } from "@/components/settings-provider";

export default function ContactPage() {
    const { branding, publicSite } = useSettings();
    const contactEmail = getContactDisplayEmail(publicSite);

    return (
        <div className="flex min-h-screen flex-col bg-bg text-fg">
            <PublicPageHeader />

            <main className="flex-1 px-6 pb-24 pt-18">
                <div className="mx-auto flex max-w-2xl flex-col gap-12">
                    <div className="flex flex-col gap-6">
                        <h1 className="text-balance text-display-lg text-fg md:text-display-xl">
                            Get in <span className="text-accent-ink">Touch</span>
                        </h1>
                        <p className="text-pretty text-body-lg text-fg-muted">
                            Have questions about how {branding.appName} can help your business? We're here to help.
                        </p>
                    </div>

                    <Card className="divide-y divide-border">
                        <div className="flex items-start gap-4 p-5">
                            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                <Envelope className="size-6" />
                            </span>
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <h4 className="text-heading-sm text-fg">Email Us</h4>
                                <p className="text-body-md text-fg-muted">
                                    <a href={`mailto:${contactEmail}`} className="ltr-data break-all underline-offset-2 transition-colors hover:text-accent-ink hover:underline">
                                        {contactEmail}
                                    </a>
                                </p>
                            </div>
                        </div>

                        {publicSite.hqAddress && (
                            <div className="flex items-start gap-4 p-5">
                                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                    <MapPin className="size-6" />
                                </span>
                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <h4 className="text-heading-sm text-fg">Headquarters</h4>
                                    <p className="text-body-md text-fg-muted">{publicSite.hqAddress}</p>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            </main>
            <Footer />
        </div>
    );
}
