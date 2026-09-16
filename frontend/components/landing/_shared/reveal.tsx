"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./use-in-view";

interface RevealProps {
    children: React.ReactNode;
    className?: string;
    /** Distance (px) the element lifts up from as it reveals. */
    y?: number;
    delayMs?: number;
    durationMs?: number;
    once?: boolean;
}

/**
 * Scroll reveal: opacity 0→1 and a translateY lift, eased over ~700ms and staggerable via
 * delayMs — matching the reference design's reveal feel. Reduced-motion users see content
 * immediately with no animation.
 */
export function Reveal({ children, className, y = 40, delayMs = 0, durationMs = 700, once = true }: RevealProps) {
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
              transition: `opacity ${durationMs}ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms, transform ${durationMs}ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms`,
              willChange: "opacity, transform",
          };

    return (
        <div ref={ref} className={cn(className)} style={style}>
            {children}
        </div>
    );
}
