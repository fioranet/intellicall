import { cn } from "@/lib/utils";

interface GridBackgroundProps {
    className?: string;
    cellSize?: number;
    fade?: boolean;
    onBrand?: boolean;
}

/**
 * Pure-CSS light grid. Line color derives from the theme foreground (auto-adapts to dark),
 * or a translucent white on the brand section. The radial `mask` fades the grid toward the
 * edges — a mask, not a visible gradient, so it complies with the no-gradients rule.
 */
export function GridBackground({ className, cellSize = 72, fade = true, onBrand = false }: GridBackgroundProps) {
    const line = onBrand
        ? "color-mix(in oklch, white 24%, transparent)"
        : "color-mix(in oklch, var(--foreground) 12%, transparent)";
    // Gentler fade so the grid reads clearly across most of the section.
    const mask = "radial-gradient(135% 105% at 50% 45%, #000 55%, transparent 96%)";

    return (
        <div
            aria-hidden
            className={cn("pointer-events-none absolute inset-0 -z-10", className)}
            style={{
                backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
                backgroundSize: `${cellSize}px ${cellSize}px`,
                maskImage: fade ? mask : undefined,
                WebkitMaskImage: fade ? mask : undefined,
            }}
        />
    );
}
