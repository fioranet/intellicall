"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./use-in-view";

interface RevealProps {
    children: React.ReactNode;
    className?: string;
    /** Distance (px) the element rises from as it reveals. */
    y?: number;
    delayMs?: number;
    durationMs?: number;
    once?: boolean;
}

/**
 * Scroll reveal in the Wixzel entrance: the element sharpens out of a light blur as it rises a
 * few pixels and fades in, landing softly with no overshoot. Staggerable via delayMs.
 * Reduced-motion users see content immediately with no animation.
 */
export function Reveal({ children, className, y = 10, delayMs = 0, durationMs = 420, once = true }: RevealProps) {
    const { ref, inView } = useInView<HTMLDivElement>({ once });
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        setReduced(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    }, []);

    const style: React.CSSProperties = reduced
        ? { opacity: 1 }
        : {
              opacity: inView ? 1 : 0,
              transform: inView ? "translateY(0)" : `translateY(${y}px)`,
              filter: inView ? "blur(0)" : "blur(6px)",
              transition: ["opacity", "transform", "filter"]
                  .map((p) => `${p} ${durationMs}ms var(--wx-ease-move) ${delayMs}ms`)
                  .join(", "),
          };

    return (
        <div ref={ref} className={cn(className)} style={style}>
            {children}
        </div>
    );
}
