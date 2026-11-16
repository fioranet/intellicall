import Link from "next/link";
import { Button } from "@wixzel/react";
import { ArrowRightIcon, PlayCircleIcon } from "@wixzel/react/icons";
import { SectionShell } from "./_shared/section-shell";
import { Eyebrow } from "./_shared/section-heading";

const POWERED_BY = [
    { src: "/images/logos/openrouter.png", alt: "OpenRouter" },
    { src: "/images/logos/elevenlabs.png", alt: "ElevenLabs" },
    { src: "/images/logos/deepgram.png", alt: "Deepgram" },
    { src: "/images/logos/twilio.png", alt: "Twilio" },
    { src: "/images/logos/sarvam.png", alt: "Sarvam AI" },
];

export function HeroSection({ isLoggedIn }: { isLoggedIn: boolean }) {
    return (
        <SectionShell id="hero" contentClassName="pt-18 pb-20 md:pt-26 md:pb-28">
            {/* Mount-triggered entrance (not scroll-observed) so the hero is never left invisible. */}
            <div className="mx-auto flex max-w-4xl animate-wx-rise-in flex-col items-center gap-7 text-center">
                <Eyebrow>AI Voice Agents · Inbound &amp; Outbound</Eyebrow>

                <h1 className="text-balance text-display-lg text-fg md:text-display-xl">
                    AI calls that sound <span className="text-accent-ink">human</span>,<br className="hidden sm:block" /> around the clock
                </h1>

                <p className="mx-auto max-w-2xl text-pretty text-body-lg text-fg-muted">
                    Deploy AI voice agents that answer inbound calls and run outbound campaigns 24/7 — qualifying leads, booking appointments, and speaking your customers&apos; language.
                </p>

                <div className="flex flex-col items-center justify-center gap-3 pt-1 sm:flex-row">
                    <Button asChild variant="primary" size="lg" iconEnd={<ArrowRightIcon />}>
                        <Link href={isLoggedIn ? "/dashboard" : "/signup"}>{isLoggedIn ? "Back to Dashboard" : "Start Free Trial"}</Link>
                    </Button>
                    <Button asChild variant="secondary" size="lg" iconStart={<PlayCircleIcon />}>
                        <a href="https://www.youtube.com/playlist?list=PL8zrhWETS5cBcHRdm2G8oxv-97Zf424HJ" target="_blank" rel="noopener noreferrer">
                            See How It Works
                        </a>
                    </Button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 pt-10">
                    <span className="text-caption font-medium text-fg-subtle">Powered by</span>
                    {POWERED_BY.map((p) => (
                        <img
                            key={p.alt}
                            src={p.src}
                            alt={p.alt}
                            className="h-6 object-contain opacity-60 grayscale transition-[opacity,filter] duration-(--wx-duration-fast) hover:opacity-100 hover:grayscale-0 dark:opacity-50"
                        />
                    ))}
                </div>
            </div>
        </SectionShell>
    );
}
