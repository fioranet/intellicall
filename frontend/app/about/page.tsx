"use client";

import Link from "next/link";
import { Users, Target, Rocket } from "@phosphor-icons/react";
import { Button, Card } from "@wixzel/react";
import { Footer } from "@/components/layout/footer";
import { PublicPageHeader } from "@/components/landing/_shared/public-page-header";
import { useSettings } from "@/components/settings-provider";

export default function AboutPage() {
    const { branding } = useSettings();

    return (
        <div className="flex min-h-screen flex-col bg-bg text-fg">
            <PublicPageHeader />

            <main className="flex-1 px-6 pb-24 pt-18">
                <div className="mx-auto flex max-w-4xl flex-col gap-20">
                    <div className="flex flex-col items-center gap-6 text-center">
                        <h1 className="text-balance text-display-lg text-fg md:text-display-xl">
                            Our Mission to <span className="text-accent-ink">Humanize</span> AI
                        </h1>
                        <p className="mx-auto max-w-2xl text-pretty text-body-lg text-fg-muted">
                            We're building the future of business communication, where AI doesn't just automate tasks—it builds relationships.
                        </p>
                    </div>

                    <div className="grid gap-4 text-start md:grid-cols-2">
                        <Card className="gap-2 p-7">
                            <span className="mb-3 grid size-11 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                <Target className="size-6" />
                            </span>
                            <h3 className="text-heading-md text-fg">Our Vision</h3>
                            <p className="text-body-md text-fg-muted">
                                To empower businesses of all sizes with sophisticated AI that sounds authentic, understands context, and delivers value in every interaction.
                            </p>
                        </Card>
                        <Card className="gap-2 p-7">
                            <span className="mb-3 grid size-11 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                <Users className="size-6" />
                            </span>
                            <h3 className="text-heading-md text-fg">The Team</h3>
                            <p className="text-body-md text-fg-muted">
                                A collective of AI researchers, communication experts, and engineers dedicated to solving the challenges of modern outbound outreach.
                            </p>
                        </Card>
                    </div>

                    <div className="flex flex-col gap-6">
                        <h2 className="text-center text-heading-xl text-fg">Why We Started</h2>
                        <div className="flex flex-col gap-4 text-body-lg text-fg-muted">
                            <p>
                                Founded in 2024, {branding.appName} emerged from a simple observation: traditional outbound calling was broken. Sales teams were fatigued, conversion rates were dropping, and customers were tired of robotic interactions.
                            </p>
                            <p>
                                We saw an opportunity to bridge the gap using Large Language Models and advanced neural voices. By creating AI agents that can truly listen and adapt, we're giving businesses back their most valuable asset: time.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-5 rounded-xl bg-accent-subtle px-6 py-14 text-center">
                        <span className="grid size-14 place-items-center rounded-lg bg-surface text-accent-ink">
                            <Rocket className="size-7" />
                        </span>
                        <h2 className="text-balance text-heading-xl text-fg">Ready to join the revolution?</h2>
                        <p className="mx-auto max-w-xl text-body-md text-fg-muted">
                            Whether you're a startup or an enterprise, we have the tools to scale your voice.
                        </p>
                        <Button asChild variant="primary" size="lg">
                            <Link href="/signup">Get Started Now</Link>
                        </Button>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
