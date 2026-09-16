import { cn } from "@/lib/utils";

interface WatermarkProps {
    word: string;
    position?: "left" | "right";
    onBrand?: boolean;
    className?: string;
}

/**
 * A huge outlined watermark word bleeding off the section edge. Stroke-only (transparent fill),
 * theme-aware, and driven by LandingMotion for slow scroll parallax + a subtle cursor shift and
 * float (data-par / data-mouse / data-amp) — the reference design's signature background type.
 */
export function Watermark({ word, position = "left", onBrand = false, className }: WatermarkProps) {
    const strokeColor = onBrand ? "rgba(255,255,255,0.32)" : "color-mix(in oklch, var(--foreground) 14%, transparent)";
    return (
        <div
            aria-hidden
            data-par="0.3"
            data-mouse="46"
            data-amp="7"
            className={cn(
                "pointer-events-none absolute bottom-[2%] -z-10 will-change-transform select-none",
                position === "left" ? "left-[1%]" : "right-[1%]",
                className
            )}
        >
            <span
                style={{
                    fontFamily: "var(--font-sans)",
                    fontWeight: 800,
                    letterSpacing: "-0.05em",
                    lineHeight: 0.85,
                    fontSize: "clamp(78px, 15vw, 208px)",
                    color: "transparent",
                    WebkitTextStrokeWidth: "1.5px",
                    WebkitTextStrokeColor: strokeColor,
                }}
            >
                {word}
            </span>
        </div>
    );
}
