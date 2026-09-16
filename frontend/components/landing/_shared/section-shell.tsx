import React from "react";
import { cn } from "@/lib/utils";
import { GridBackground } from "./grid-background";
import { ParallaxShapes } from "./parallax-shapes";
import { Watermark } from "./watermark";

type Variant = "base" | "brand";

interface SectionShellProps {
    id?: string;
    /** "base" = solid white / near-black (per theme); "brand" = the primary color. */
    variant?: Variant;
    /** Parallax shape composition (a/b/c) or false to omit. */
    strokes?: "a" | "b" | "c" | false;
    grid?: boolean;
    /** Giant outlined watermark word bleeding off the edge. */
    watermark?: string;
    watermarkPos?: "left" | "right";
    className?: string;
    contentClassName?: string;
    children: React.ReactNode;
}

// Bold two-tone alternation: the theme base (white / near-black) and the brand primary color.
const BG: Record<Variant, string> = {
    base: "bg-background text-foreground",
    brand: "bg-brand text-white",
};

/**
 * The backbone of every landing section: full-screen height, a bold solid background
 * (base or brand-primary), the masked grid + parallax stroke shapes + optional watermark word
 * behind a centered content column, scroll-snap alignment, and the fixed-nav anchor offset.
 */
export function SectionShell({
    id,
    variant = "base",
    strokes = "a",
    grid = true,
    watermark,
    watermarkPos = "left",
    className,
    contentClassName,
    children,
}: SectionShellProps) {
    const onBrand = variant === "brand";
    return (
        <section
            id={id}
            className={cn(
                // `isolate` makes the section its own stacking context so the z-0 grid/shapes/
                // watermark paint ABOVE the section's background (not hidden behind it).
                // min-h grows with content (tall spotlights) but keeps content-light sections
                // from swimming in empty space.
                "relative isolate flex min-h-[82vh] w-full items-center overflow-hidden snap-start scroll-mt-20",
                BG[variant],
                className
            )}
        >
            {grid && <GridBackground onBrand={onBrand} />}
            {watermark && <Watermark word={watermark} position={watermarkPos} onBrand={onBrand} />}
            {strokes && <ParallaxShapes variant={strokes} onBrand={onBrand} />}
            <div className={cn("relative z-10 mx-auto w-full max-w-7xl px-6 py-14 md:py-16", contentClassName)}>
                {children}
            </div>
        </section>
    );
}
