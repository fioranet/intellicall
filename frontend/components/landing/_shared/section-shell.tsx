import React from "react";
import { cn } from "@/lib/utils";

interface SectionShellProps {
    id?: string;
    className?: string;
    contentClassName?: string;
    children: React.ReactNode;
}

/**
 * The backbone of every landing section: the tinted page, comfortable vertical rhythm and
 * a centered content column. Sections are told apart by spacing and their own tonal panels,
 * not by lines, grids or decoration. Keeps scroll-snap alignment and the fixed-nav anchor offset.
 */
export function SectionShell({ id, className, contentClassName, children }: SectionShellProps) {
    return (
        <section id={id} className={cn("relative w-full snap-start scroll-mt-22 bg-bg text-fg", className)}>
            <div className={cn("mx-auto w-full max-w-6xl px-6 py-20 md:py-28", contentClassName)}>{children}</div>
        </section>
    );
}
