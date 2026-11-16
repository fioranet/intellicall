"use client";

import { Gavel, Scales, Handshake } from "@phosphor-icons/react";
import { Alert, Separator } from "@wixzel/react";
import { Footer } from "@/components/layout/footer";
import { PublicPageHeader } from "@/components/landing/_shared/public-page-header";
import { useSettings } from "@/components/settings-provider";

export default function TermsPage() {
    const { branding, publicSite } = useSettings();
    const legalEmail = publicSite.legalEmail?.trim() || "legal@intellicall.ai";

    return (
        <div className="flex min-h-screen flex-col bg-bg text-fg">
            <PublicPageHeader />

            <main className="flex-1 px-6 pb-24 pt-18">
                <div className="mx-auto flex max-w-4xl flex-col gap-14">
                    <div className="flex flex-col items-center gap-5 text-center">
                        <span className="grid size-14 place-items-center rounded-lg bg-accent-subtle text-accent-ink">
                            <Scales className="size-8" />
                        </span>
                        <h1 className="text-balance text-display-md text-fg md:text-display-lg">Terms of Service</h1>
                        <p className="text-body-md text-fg-muted">Operating Agreement & Usage Rules</p>
                    </div>

                    <div className="flex flex-col gap-10 text-body-md text-fg-muted">
                        <Alert tone="warning">
                            Important Notice: Users are strictly responsible for complying with local regulations regarding automated outbound calling, including TCPA in the US and GDPR/DNC rules globally.
                        </Alert>

                        <section className="flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                <Handshake className="size-6 shrink-0 text-accent-ink" />
                                <h2 className="text-heading-lg text-fg">1. Acceptance of Terms</h2>
                            </div>
                            <p>
                                By accessing or using {branding.appName}, you agree to be bound by these Terms of Service. If you do not agree to all terms, you must not access or use our services.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                <Gavel className="size-6 shrink-0 text-accent-ink" />
                                <h2 className="text-heading-lg text-fg">2. Acceptable Use</h2>
                            </div>
                            <p>
                                You agree not to use our services for:
                            </p>
                            <ul className="flex list-disc flex-col gap-2 ps-6">
                                <li>Unsolicited telemarketing (spamming)</li>
                                <li>Impersonating individuals without consent</li>
                                <li>Harassment or illegal activities</li>
                                <li>Circumventing security measures or rate limits</li>
                                <li>Use of the service in violation of any applicable law or regulation</li>
                            </ul>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">3. User Responsibility for Data &amp; Consent</h2>
                            <p>
                                You are solely responsible for ensuring that you have obtained all necessary consents and permissions from individuals involved in calls, including consent for recording and AI processing, in accordance with applicable laws.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">4. Your Account and Data</h2>
                            <p>
                                You are responsible for all activities conducted under your account, including the content and data processed through the service.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">5. Self-Hosted Software</h2>
                            <p>
                                For self-hosted versions of the software, users are solely responsible for all data processed within their own infrastructure.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">6. AI-Generated Outputs</h2>
                            <p>
                                AI-generated outputs may be inaccurate and should not be solely relied upon. Users are responsible for verifying outcomes.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">7. Subscription & Payments</h2>
                            <p>
                                Service is provided based on monthly or annual subscription plans. Except as required by applicable law, all fees are non-refundable, including for partial billing periods, unused usage, or plan downgrades. We reserve the right to change our pricing upon 30 days notice.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">8. Service Availability</h2>
                            <p>
                                We do not guarantee uninterrupted availability, specific uptime, or that the service will meet your requirements. We are not liable for delays or failures due to events beyond our reasonable control, including outages, natural disasters, acts of government, labor disputes, or failures of third-party providers or infrastructure.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">9. Disclaimer of Warranties</h2>
                            <p>
                                The service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether express, implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement, to the fullest extent permitted by law.
                            </p>
                            <p>
                                We do not guarantee that the service will be error-free or secure, and are not liable for unauthorized access, data breaches, or data loss.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">10. Indemnification</h2>
                            <p>
                                You agree to indemnify and hold harmless {branding.appName} from any claims, damages, losses, or liabilities arising out of your use of the service, violation of these Terms, or violation of any applicable laws.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">11. Limitation of Liability</h2>
                            <p>
                                {branding.appName} shall not be liable for any indirect, incidental, or consequential damages arising out of your use of the service or any actions taken by automated agents based on your instructions.
                            </p>
                            <p>
                                Our total liability for any claims arising out of or related to these Terms or the service shall not exceed the amount you paid to us in fees for the service in the three (3) months preceding the event giving rise to the claim, except where prohibited by applicable law.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">12. Changes to the Service</h2>
                            <p>
                                We reserve the right to modify or discontinue the service (or any part of it, including features or pricing) at any time without liability.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">13. Termination</h2>
                            <p>
                                We reserve the right to suspend or terminate accounts that violate our usage policies or local laws without prior warning.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">14. No Agency Relationship</h2>
                            <p>
                                Nothing in these Terms creates any partnership, agency, or employment relationship between you and {branding.appName}.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">15. Governing Law</h2>
                            <p>
                                These Terms shall be governed by the laws of India, without regard to conflict-of-law principles.
                            </p>
                        </section>
                    </div>

                    <Separator />
                    <div className="text-center">
                        <p className="text-body-sm text-fg-muted">
                            For legal inquiries, please contact:{" "}
                            <a href={`mailto:${legalEmail}`} className="ltr-data text-accent-ink underline-offset-2 hover:underline">
                                {legalEmail}
                            </a>
                        </p>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
