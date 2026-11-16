import Link from "next/link";
import { Button } from "@wixzel/react";
import { ArrowRightIcon, HardDrivesIcon } from "@wixzel/react/icons";
import { SectionShell } from "./_shared/section-shell";
import { Reveal } from "./_shared/reveal";

interface CtaSectionProps {
    isLoggedIn: boolean;
    showSelfHosting: boolean;
}

export function CtaSection({ isLoggedIn, showSelfHosting }: CtaSectionProps) {
    return (
        <SectionShell id="start" contentClassName="pt-4 md:pt-8">
            {/* The closing band: one quiet wash of the product colour, the primary action on it. */}
            <Reveal className="flex flex-col items-center gap-6 rounded-xl bg-accent-subtle px-6 py-16 text-center md:py-20">
                <h2 className="max-w-3xl text-balance text-display-md text-fg md:text-display-lg">Start your AI calling today</h2>
                <p className="mx-auto max-w-xl text-pretty text-body-lg text-fg-muted">
                    Spin up your first AI agent in minutes — answer inbound calls, launch outbound campaigns, and book meetings on autopilot.
                </p>
                <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
                    <Button asChild variant="primary" size="lg" iconEnd={<ArrowRightIcon />}>
                        <Link href={isLoggedIn ? "/dashboard" : "/signup"}>{isLoggedIn ? "Back to Dashboard" : "Start Free Trial"}</Link>
                    </Button>
                    {showSelfHosting && (
                        <Button asChild variant="secondary" size="lg" iconStart={<HardDrivesIcon />}>
                            <a href="#self-host">Self-host it</a>
                        </Button>
                    )}
                </div>
            </Reveal>
        </SectionShell>
    );
}
