import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionShell } from "./section-shell";
import { Reveal } from "./reveal";

interface SpotlightLayoutProps {
    id: string;
    variant?: "base" | "brand";
    strokes?: "a" | "b" | "c";
    number?: string;
    eyebrow: string;
    watermark?: string;
    title: React.ReactNode;
    description: string;
    bullets: string[];
    mock: React.ReactNode;
    /** Place the mockup on the left instead of the right. */
    reverse?: boolean;
}

/** Two-column feature spotlight: copy + bullets on one side, a UI mockup on the other. */
export function SpotlightLayout({
    id,
    variant = "base",
    strokes = "a",
    number,
    eyebrow,
    watermark,
    title,
    description,
    bullets,
    mock,
    reverse = false,
}: SpotlightLayoutProps) {
    const onBrand = variant === "brand";
    return (
        <SectionShell id={id} variant={variant} strokes={strokes} watermark={watermark} watermarkPos={reverse ? "right" : "left"}>
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                <Reveal className={cn("space-y-6", reverse && "lg:order-2")}>
                    <p className={cn("font-mono text-xs font-medium uppercase tracking-[0.16em]", onBrand ? "text-white/75" : "text-brand")}>
                        {number ? `${number} · ` : ""}
                        {eyebrow}
                    </p>
                    <h2 className={cn("text-3xl font-bold leading-[1.05] tracking-tight md:text-5xl", onBrand ? "text-white" : "text-foreground")}>
                        {title}
                    </h2>
                    <p className={cn("max-w-xl text-base leading-relaxed md:text-lg", onBrand ? "text-white/85" : "text-muted-foreground")}>{description}</p>
                    <ul className="space-y-3 pt-1">
                        {bullets.map((b) => (
                            <li key={b} className="flex items-start gap-3 text-sm md:text-base">
                                <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", onBrand ? "bg-white/20 text-white" : "bg-brand/15 text-brand")}>
                                    <Check className="h-3 w-3" />
                                </span>
                                <span className={onBrand ? "text-white/85" : "text-muted-foreground"}>{b}</span>
                            </li>
                        ))}
                    </ul>
                </Reveal>

                <Reveal delayMs={120} className={cn(reverse && "lg:order-1")}>
                    <div style={{ transform: `rotate(${reverse ? 1.4 : -1.4}deg)` }}>{mock}</div>
                </Reveal>
            </div>
        </SectionShell>
    );
}
