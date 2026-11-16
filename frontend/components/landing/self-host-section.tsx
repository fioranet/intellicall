import { Button, Card } from "@wixzel/react";
import { ArrowRightIcon, PlayCircleIcon, CheckCircleIcon } from "@wixzel/react/icons";
import { SectionShell } from "./_shared/section-shell";
import { Eyebrow } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";

const POINTS = [
    "One-click web installer — set up everything from your browser, no command line.",
    "Full source code access — customize the platform to your needs.",
    "Deploy on any VPS: DigitalOcean, Hetzner, AWS, Contabo, and more.",
    "One-time purchase on CodeCanyon or the Wixzel Store — no platform subscription.",
];

export function SelfHostSection() {
    return (
        <SectionShell id="self-host">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-20">
                <Reveal className="flex flex-col gap-5">
                    <Eyebrow>Self Hosting</Eyebrow>
                    <h2 className="text-balance text-display-md text-fg md:text-display-lg">
                        Run it on <span className="text-accent-ink">your own server</span>
                    </h2>
                    <p className="max-w-2xl text-pretty text-body-lg text-fg-muted">
                        Take full control of your data and infrastructure. Buy the source code once and deploy on your own VPS with the web-based installer — no recurring platform fees.
                    </p>
                    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
                        <Button asChild variant="primary" size="lg" iconEnd={<ArrowRightIcon />}>
                            <a href="https://codecanyon.net/item/intellicall-ai-ai-voice-calling-agents-for-lead-campaign-automation/61664541" target="_blank" rel="noopener noreferrer">
                                Purchase on CodeCanyon
                            </a>
                        </Button>
                        <Button asChild variant="secondary" size="lg" iconEnd={<ArrowRightIcon />}>
                            <a href="https://store.wixzel.com/products/intellicall-ai" target="_blank" rel="noopener noreferrer">
                                Wixzel Store
                            </a>
                        </Button>
                        <Button asChild variant="ghost" size="lg" iconStart={<PlayCircleIcon />}>
                            <a href="https://www.youtube.com/watch?v=Vd2jzOCLjhg" target="_blank" rel="noopener noreferrer">
                                Install Tutorial
                            </a>
                        </Button>
                    </div>
                </Reveal>

                <Reveal delayMs={120}>
                    <Card>
                        <ul className="divide-y divide-border">
                            {POINTS.map((p) => (
                                <li key={p} className="flex items-start gap-3 px-5 py-4 text-body-sm text-fg-muted">
                                    <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-accent-ink" />
                                    <span>{p}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </Reveal>
            </div>
        </SectionShell>
    );
}
