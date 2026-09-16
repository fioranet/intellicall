import React from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

interface SectionHeadingProps {
    eyebrow?: string;
    /** Two-digit section number shown before the eyebrow, e.g. "05". */
    number?: string;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    align?: "center" | "left";
    onBrand?: boolean;
    className?: string;
}

/** Editorial mono numbered eyebrow + bold h2 + subcopy, used across every section. */
export function SectionHeading({
    eyebrow,
    number,
    title,
    subtitle,
    align = "center",
    onBrand = false,
    className,
}: SectionHeadingProps) {
    const centered = align === "center";
    return (
        <Reveal
            className={cn("space-y-5", centered ? "mx-auto max-w-3xl text-center" : "max-w-2xl text-left", className)}
        >
            {eyebrow && (
                <p className={cn("font-mono text-xs font-medium uppercase tracking-[0.16em]", onBrand ? "text-white/75" : "text-brand")}>
                    {number ? `${number} · ` : ""}
                    {eyebrow}
                </p>
            )}
            <h2 className={cn("text-3xl font-bold leading-[1.05] tracking-tight md:text-5xl", onBrand ? "text-white" : "text-foreground")}>
                {title}
            </h2>
            {subtitle && (
                <p className={cn("text-base leading-relaxed md:text-lg", onBrand ? "text-white/80" : "text-muted-foreground")}>
                    {subtitle}
                </p>
            )}
        </Reveal>
    );
}
