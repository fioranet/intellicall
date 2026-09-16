"use client";

import Link from "next/link";
import { ChevronLeft, Gavel, Scale, Handshake, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Footer } from "@/components/layout/footer";
import { useSettings } from "@/components/settings-provider";

export default function TermsPage() {
    const { branding, publicSite } = useSettings();
    const legalEmail = publicSite.legalEmail?.trim() || "legal@intellicall.ai";

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
                <div className="max-w-4xl mx-auto space-y-12">
                    <div className="text-center space-y-6">
                        <div className="inline-flex p-3 rounded-2xl mb-4" style={{ backgroundColor: `${branding.primaryColor}15`, color: branding.primaryColor }}>
                            <Scale className="h-8 w-8" />
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold">Terms of Service</h1>
                        <p className="text-muted-foreground italic">Operating Agreement & Usage Rules</p>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none space-y-10 text-muted-foreground leading-relaxed">
                        <div className="p-8 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-4">
                            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-1" />
                            <p className="text-sm text-amber-600 dark:text-amber-400 leading-relaxed font-medium m-0">
                                Important Notice: Users are strictly responsible for complying with local regulations regarding automated outbound calling, including TCPA in the US and GDPR/DNC rules globally.
                            </p>
                        </div>

                        <section className="space-y-4">
                            <div className="flex items-center gap-3 text-foreground">
                                <Handshake className="h-6 w-6" style={{ color: branding.primaryColor }} />
                                <h2 className="text-2xl font-bold m-0">1. Acceptance of Terms</h2>
                            </div>
                            <p>
                                By accessing or using {branding.appName}, you agree to be bound by these Terms of Service. If you do not agree to all terms, you must not access or use our services.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <div className="flex items-center gap-3 text-foreground">
                                <Gavel className="h-6 w-6" style={{ color: branding.primaryColor }} />
                                <h2 className="text-2xl font-bold m-0">2. Acceptable Use</h2>
                            </div>
                            <p>
                                You agree not to use our services for:
                            </p>
                            <ul className="list-disc pl-6 space-y-2">
                                <li>Unsolicited telemarketing (spamming)</li>
                                <li>Impersonating individuals without consent</li>
                                <li>Harassment or illegal activities</li>
                                <li>Circumventing security measures or rate limits</li>
                                <li>Use of the service in violation of any applicable law or regulation</li>
                            </ul>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">3. User Responsibility for Data &amp; Consent</h2>
                            <p>
                                You are solely responsible for ensuring that you have obtained all necessary consents and permissions from individuals involved in calls, including consent for recording and AI processing, in accordance with applicable laws.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">4. Your Account and Data</h2>
                            <p>
                                You are responsible for all activities conducted under your account, including the content and data processed through the service.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">5. Self-Hosted Software</h2>
                            <p>
                                For self-hosted versions of the software, users are solely responsible for all data processed within their own infrastructure.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">6. AI-Generated Outputs</h2>
                            <p>
                                AI-generated outputs may be inaccurate and should not be solely relied upon. Users are responsible for verifying outcomes.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">7. Subscription & Payments</h2>
                            <p>
                                Service is provided based on monthly or annual subscription plans. Except as required by applicable law, all fees are non-refundable, including for partial billing periods, unused usage, or plan downgrades. We reserve the right to change our pricing upon 30 days notice.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">8. Service Availability</h2>
                            <p>
                                We do not guarantee uninterrupted availability, specific uptime, or that the service will meet your requirements. We are not liable for delays or failures due to events beyond our reasonable control, including outages, natural disasters, acts of government, labor disputes, or failures of third-party providers or infrastructure.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">9. Disclaimer of Warranties</h2>
                            <p>
                                The service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether express, implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement, to the fullest extent permitted by law.
                            </p>
                            <p>
                                We do not guarantee that the service will be error-free or secure, and are not liable for unauthorized access, data breaches, or data loss.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">10. Indemnification</h2>
                            <p>
                                You agree to indemnify and hold harmless {branding.appName} from any claims, damages, losses, or liabilities arising out of your use of the service, violation of these Terms, or violation of any applicable laws.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">11. Limitation of Liability</h2>
                            <p>
                                {branding.appName} shall not be liable for any indirect, incidental, or consequential damages arising out of your use of the service or any actions taken by automated agents based on your instructions.
                            </p>
                            <p>
                                Our total liability for any claims arising out of or related to these Terms or the service shall not exceed the amount you paid to us in fees for the service in the three (3) months preceding the event giving rise to the claim, except where prohibited by applicable law.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">12. Changes to the Service</h2>
                            <p>
                                We reserve the right to modify or discontinue the service (or any part of it, including features or pricing) at any time without liability.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">13. Termination</h2>
                            <p>
                                We reserve the right to suspend or terminate accounts that violate our usage policies or local laws without prior warning.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">14. No Agency Relationship</h2>
                            <p>
                                Nothing in these Terms creates any partnership, agency, or employment relationship between you and {branding.appName}.
                            </p>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-2xl font-bold text-foreground">15. Governing Law</h2>
                            <p>
                                These Terms shall be governed by the laws of India, without regard to conflict-of-law principles.
                            </p>
                        </section>
                    </div>

                    <div className="pt-12 border-t border-border text-center">
                        <p className="text-muted-foreground text-sm">
                            For legal inquiries, please contact:{" "}
                            <a href={`mailto:${legalEmail}`} className="underline-offset-2 hover:underline" style={{ color: branding.primaryColor }}>
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
