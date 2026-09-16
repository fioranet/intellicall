"use client";

import { useEffect, useRef, useState } from "react";

interface UseInViewOptions {
    threshold?: number;
    rootMargin?: string;
    once?: boolean;
}

/**
 * Scroll-reveal primitive. Returns `inView=false` on first paint (server + first client
 * render agree → no hydration flash), then flips true once the element scrolls into view.
 * Honors prefers-reduced-motion and environments without IntersectionObserver by revealing
 * immediately. With `once` (default), the observer disconnects after firing.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(options: UseInViewOptions = {}) {
    const { threshold = 0.15, rootMargin = "0px 0px -10% 0px", once = true } = options;
    const ref = useRef<T | null>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const prefersReduced =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReduced || typeof IntersectionObserver === "undefined") {
            setInView(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setInView(true);
                        if (once) observer.disconnect();
                    } else if (!once) {
                        setInView(false);
                    }
                });
            },
            { threshold, rootMargin }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [threshold, rootMargin, once]);

    return { ref, inView };
}
