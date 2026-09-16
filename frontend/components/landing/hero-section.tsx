import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionShell } from "./_shared/section-shell";

const POWERED_BY = [
    { src: "/images/logos/openrouter.png", alt: "OpenRouter" },
    { src: "/images/logos/elevenlabs.png", alt: "ElevenLabs" },
    { src: "/images/logos/deepgram.png", alt: "Deepgram" },
    { src: "/images/logos/twilio.png", alt: "Twilio" },
    { src: "/images/logos/sarvam.png", alt: "Sarvam AI" },
];

export function HeroSection({ isLoggedIn }: { isLoggedIn: boolean }) {
    return (
        <SectionShell id="hero" variant="base" strokes="a" watermark="calls" watermarkPos="right">
            {/* Mount-triggered animation (not scroll-observed) so the hero is never left invisible. */}
            <div className="mx-auto max-w-4xl space-y-8 text-center">
                <p className="animate-in fade-in slide-in-from-bottom-3 font-mono text-xs font-medium uppercase tracking-[0.16em] text-brand duration-700">
                    01 · AI Voice Agents · Inbound &amp; Outbound
                </p>

                <h1 className="animate-in fade-in slide-in-from-bottom-4 text-5xl font-bold leading-[1.05] tracking-tight text-foreground duration-700 md:text-7xl">
                    AI calls that sound <span className="text-brand italic">human</span>,<br className="hidden sm:block" /> around the clock
                </h1>

                <p className="mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 text-lg leading-relaxed text-muted-foreground duration-700 [animation-delay:120ms] md:text-xl">
                    Deploy AI voice agents that answer inbound calls and run outbound campaigns 24/7 — qualifying leads, booking appointments, and speaking your customers&apos; language.
                </p>

                <div className="flex animate-in fade-in slide-in-from-bottom-4 flex-col items-center justify-center gap-4 pt-2 duration-700 [animation-delay:200ms] sm:flex-row">
                    <Button size="lg" className="h-14 rounded-full bg-brand px-10 text-base font-semibold text-white hover:bg-brand/90" asChild>
                        <Link href={isLoggedIn ? "/dashboard" : "/signup"} className="text-white">
                            {isLoggedIn ? "Back to Dashboard" : "Start Free Trial"} <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="h-14 rounded-full border-border px-10 text-base font-semibold hover:bg-muted" asChild>
                        <a href="https://www.youtube.com/playlist?list=PL8zrhWETS5cBcHRdm2G8oxv-97Zf424HJ" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                            <PlayCircle className="h-5 w-5" /> See How It Works
                        </a>
                    </Button>
                </div>

                <div className="animate-in fade-in flex flex-wrap items-center justify-center gap-x-8 gap-y-4 pt-8 duration-700 [animation-delay:320ms]">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Powered by</span>
                    {POWERED_BY.map((p) => (
                        <img
                            key={p.alt}
                            src={p.src}
                            alt={p.alt}
                            className="h-6 object-contain opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0 dark:opacity-50"
                        />
                    ))}
                </div>
            </div>
        </SectionShell>
    );
}
