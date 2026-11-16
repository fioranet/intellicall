import React from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

interface SectionHeadingProps {
    eyebrow?: string;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    align?: "center" | "start";
    className?: string;
}

/** The short label above a section title, in the product colour. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn("text-body-sm font-semibold text-accent-ink", className)}>{children}</p>;
}

/** Eyebrow + bold h2 drawn in tight + subcopy, used across every section. */
export function SectionHeading({ eyebrow, title, subtitle, align = "center", className }: SectionHeadingProps) {
    const centered = align === "center";
    return (
        <Reveal className={cn("flex flex-col gap-4", centered ? "mx-auto max-w-3xl items-center text-center" : "max-w-2xl text-start", className)}>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h2 className="text-balance text-display-md text-fg md:text-display-lg">{title}</h2>
            {subtitle && <p className="text-pretty text-body-lg text-fg-muted">{subtitle}</p>}
        </Reveal>
    );
}
