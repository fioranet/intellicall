"use client";

import { ShieldCheck, Lock, Eye, FileText } from "@phosphor-icons/react";
import { Card, Separator } from "@wixzel/react";
import { Footer } from "@/components/layout/footer";
import { PublicPageHeader } from "@/components/landing/_shared/public-page-header";
import { useSettings } from "@/components/settings-provider";

export default function PrivacyPage() {
    const { branding, publicSite } = useSettings();
    const privacyEmail = publicSite.privacyEmail?.trim() || "privacy@intellicall.ai";

    return (
        <div className="flex min-h-screen flex-col bg-bg text-fg">
            <PublicPageHeader />

            <main className="flex-1 px-6 pb-24 pt-18">
                <div className="mx-auto flex max-w-4xl flex-col gap-14">
                    <div className="flex flex-col items-center gap-5 text-center">
                        <span className="grid size-14 place-items-center rounded-lg bg-accent-subtle text-accent-ink">
                            <ShieldCheck className="size-8" />
                        </span>
                        <h1 className="text-balance text-display-md text-fg md:text-display-lg">Privacy Policy</h1>
                        <p className="text-body-md text-fg-muted">Last updated: April 7, 2026</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="gap-3 p-6">
                            <Lock className="size-5 text-accent-ink" />
                            <h4 className="text-heading-sm text-fg">Security</h4>
                            <p className="text-body-sm text-fg-muted">We implement industry-standard security practices to help protect your information.</p>
                            <p className="text-body-sm text-fg-muted">However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>
                        </Card>
                        <Card className="gap-3 p-6">
                            <Eye className="size-5 text-accent-ink" />
                            <h4 className="text-heading-sm text-fg">Transparency</h4>
                            <p className="text-body-sm text-fg-muted">Clear disclosure on how interactions are handled and processed.</p>
                        </Card>
                        <Card className="gap-3 p-6">
                            <FileText className="size-5 text-accent-ink" />
                            <h4 className="text-heading-sm text-fg">Compliance</h4>
                            <p className="text-body-sm text-fg-muted">We strive to comply with applicable data protection laws, including where relevant GDPR, CCPA, and rules governing communications such as TCPA and do-not-call requirements.</p>
                        </Card>
                    </div>

                    <div className="flex flex-col gap-10 text-body-md text-fg-muted">
                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">1. Data Collection</h2>
                            <p>
                                We collect information you provide directly, such as when you create an account, configure AI agents, or contact support. This includes basic contact info, payment details, and the content of communications managed by our platform.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">2. Use of Information</h2>
                            <p>
                                We use the collected data to provide, maintain, and improve our services, process payments, and develop new features related to voice synthesis and conversation logic. We do not sell your personal information to third parties.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">3. Voice Data Processing</h2>
                            <p>
                                Audio recordings and transcripts generated through our agents are used to operate, maintain, and improve the service within the scope of your account. You have full control to enable or disable recording in your settings.
                            </p>
                            <p>
                                We process such data on behalf of users to provide the service. Users are responsible for ensuring that they have the legal right to collect, process, and transmit such data, including obtaining any required consents.
                            </p>
                            <p>
                                Users are responsible for informing call participants that calls may be recorded and processed by AI systems where required by applicable law.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">4. Third-Party Service Providers</h2>
                            <p>
                                We use third-party service providers for communication (for example, telephony and messaging), payment processing, hosting, analytics, and AI processing. These providers process data on our behalf in accordance with their terms and our agreements with them, and only as needed to deliver the services.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">5. Data Retention</h2>
                            <p>
                                We retain data only as long as necessary to provide services or until deletion is requested. We may retain certain information longer where required by law.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">6. Self-Hosted Deployment</h2>
                            <p>
                                For self-hosted deployments of {branding.appName}, all data, including call recordings and transcripts, is stored and processed on infrastructure controlled by the customer.
                            </p>
                            <p>
                                In such cases, {branding.appName} does not have access to or control over customer data, and the customer is solely responsible for data management, security, and compliance with applicable laws.
                            </p>
                        </section>

                        <section className="flex flex-col gap-4">
                            <h2 className="text-heading-lg text-fg">7. Your Rights</h2>
                            <p>
                                Depending on your location, you may have rights to access, correct, or delete your personal data. Please contact our data protection officer at{" "}
                                <a href={`mailto:${privacyEmail}`} className="ltr-data text-accent-ink underline-offset-2 hover:underline">
                                    {privacyEmail}
                                </a>{" "}
                                for any requests.
                            </p>
                        </section>
                    </div>

                    <Separator />
                    <div className="text-center">
                        <p className="mx-auto max-w-2xl text-body-md text-fg-muted">
                            By using {branding.appName}, you agree to the collection and use of information in accordance with this policy. We reserve the right to update this policy at any time.
                        </p>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
