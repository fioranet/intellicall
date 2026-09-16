import { ArrowRight, PlayCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionShell } from "./_shared/section-shell";
import { Reveal } from "./_shared/reveal";

const POINTS = [
    "One-click web installer — set up everything from your browser, no command line.",
    "Full source code access — customize the platform to your needs.",
    "Deploy on any VPS: DigitalOcean, Hetzner, AWS, Contabo, and more.",
    "One-time purchase on CodeCanyon or the Wixzel Store — no platform subscription.",
];

export function SelfHostSection() {
    return (
        <SectionShell id="self-host" variant="base" strokes="b" watermark="deploy" watermarkPos="right">
            <Reveal className="mx-auto max-w-4xl space-y-8">
                <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-brand">09 · Self Hosting</p>
                <h2 className="text-3xl font-bold leading-[1.1] tracking-tight text-foreground md:text-5xl">
                    Run it on <span className="text-brand italic">your own server</span>
                </h2>
                <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                    Take full control of your data and infrastructure. Buy the source code once and deploy on your own VPS with the web-based installer — no recurring platform fees.
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                    {POINTS.map((p) => (
                        <li key={p} className="flex items-start gap-3 text-sm text-muted-foreground">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                            <span>{p}</span>
                        </li>
                    ))}
                </ul>
                <div className="flex flex-col gap-4 pt-2 sm:flex-row">
                    <Button size="lg" className="h-14 rounded-full bg-brand px-8 text-base font-semibold text-white hover:bg-brand/90" asChild>
                        <a href="https://codecanyon.net/item/intellicall-ai-ai-voice-calling-agents-for-lead-campaign-automation/61664541" target="_blank" rel="noopener noreferrer" className="flex items-center">
                            Purchase on CodeCanyon <ArrowRight className="ml-2 h-5 w-5" />
                        </a>
                    </Button>
                    <Button size="lg" variant="outline" className="h-14 rounded-full border-brand px-8 text-base font-semibold text-brand hover:bg-brand/10" asChild>
                        <a href="https://store.wixzel.com/products/intellicall-ai" target="_blank" rel="noopener noreferrer" className="flex items-center">
                            Wixzel Store <ArrowRight className="ml-2 h-5 w-5" />
                        </a>
                    </Button>
                    <Button size="lg" variant="outline" className="h-14 rounded-full border-border px-8 text-base font-semibold hover:bg-muted" asChild>
                        <a href="https://www.youtube.com/watch?v=Vd2jzOCLjhg" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                            <PlayCircle className="h-5 w-5" /> Install Tutorial
                        </a>
                    </Button>
                </div>
            </Reveal>
        </SectionShell>
    );
}
