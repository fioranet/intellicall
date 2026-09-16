import { cn } from "@/lib/utils";

interface ParallaxShapesProps {
    variant?: "a" | "b" | "c";
    onBrand?: boolean;
    className?: string;
}

/**
 * Decorative stroke geometry (dashed circle, rotated rounded square, accent dot) scattered at
 * the section corners. Each shape's OUTER wrapper carries a `data-par` factor so LandingMotion
 * gives it scroll parallax; the INNER element keeps its own rotation so parallax translate
 * never clobbers it. Clearly visible stroke-only shapes plus small accent marks.
 */
export function ParallaxShapes({ variant = "a", onBrand = false, className }: ParallaxShapesProps) {
    const ring = onBrand ? "border-white/45" : "border-foreground/25";
    const dot = onBrand ? "bg-white" : "bg-brand";

    return (
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
            {variant === "a" && (
                <>
                    <div data-par="1.0" className="absolute right-[7%] top-[13%] will-change-transform">
                        <div className={cn("h-40 w-40 rounded-full border-2 border-dashed md:h-56 md:w-56", ring)} />
                    </div>
                    <div data-par="-0.55" className="absolute bottom-[16%] left-[6%] will-change-transform">
                        <div className={cn("h-24 w-24 rounded-2xl border-2 md:h-28 md:w-28", ring)} style={{ transform: "rotate(24deg)" }} />
                    </div>
                    <div data-par="0.7" className="absolute left-[13%] top-[22%] will-change-transform">
                        <div className={cn("h-5 w-5 rounded-[6px]", dot)} style={{ transform: "rotate(45deg)" }} />
                    </div>
                </>
            )}
            {variant === "b" && (
                <>
                    <div data-par="0.9" className="absolute left-[7%] top-[14%] will-change-transform">
                        <div className={cn("h-36 w-36 rounded-full border-2 border-dashed md:h-52 md:w-52", ring)} />
                    </div>
                    <div data-par="-0.6" className="absolute bottom-[15%] right-[8%] will-change-transform">
                        <div className={cn("h-24 w-24 rounded-2xl border-2 md:h-28 md:w-28", ring)} style={{ transform: "rotate(32deg)" }} />
                    </div>
                    <div data-par="0.65" className="absolute right-[14%] top-[20%] will-change-transform">
                        <div className={cn("h-5 w-5 rounded-full", dot)} />
                    </div>
                </>
            )}
            {variant === "c" && (
                <>
                    <div data-par="0.85" className="absolute right-[8%] top-[16%] will-change-transform">
                        <div className={cn("h-32 w-32 rounded-[30%] border-2 md:h-44 md:w-44", ring)} style={{ transform: "rotate(14deg)" }} />
                    </div>
                    <div data-par="-0.6" className="absolute bottom-[14%] left-[7%] will-change-transform">
                        <div className={cn("h-28 w-28 rounded-full border-2 border-dashed md:h-36 md:w-36", ring)} />
                    </div>
                    <div data-par="0.6" className="absolute left-[12%] top-[24%] will-change-transform">
                        <div className={cn("h-5 w-5 rounded-[6px]", dot)} style={{ transform: "rotate(45deg)" }} />
                    </div>
                </>
            )}
        </div>
    );
}
