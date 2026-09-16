"use client";

import { useEffect } from "react";

/**
 * Global parallax controller (mirrors the reference design's engine). One rAF loop drives
 * every `[data-par]` element: scroll parallax (`data-par`), a gentle continuous float
 * (`data-amp`), and a cursor shift (`data-mouse`). Disabled entirely for reduced-motion.
 *
 * `scanKey` should change whenever conditionally-rendered sections mount/unmount so the
 * element list is re-collected.
 */
export function LandingMotion({ scanKey }: { scanKey?: string | number }) {
    useEffect(() => {
        if (typeof window === "undefined") return;
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (reduce) return;

        const els = Array.from(document.querySelectorAll<HTMLElement>("[data-par]"));
        if (!els.length) return;

        const items = els.map((el, i) => ({
            el,
            par: parseFloat(el.dataset.par || "0"),
            mouse: parseFloat(el.dataset.mouse || "0"),
            amp: parseFloat(el.dataset.amp || "0"),
            phase: i * 1.3,
            speed: 0.5,
        }));

        let cmx = 0;
        let targetMx = 0;
        let raf = 0;
        let running = true;

        const onMove = (e: MouseEvent) => {
            targetMx = e.clientX / window.innerWidth - 0.5;
        };
        window.addEventListener("mousemove", onMove, { passive: true });

        const tick = () => {
            if (!running) return;
            const vh = window.innerHeight || document.documentElement.clientHeight || 800;
            const t = performance.now() / 1000;
            cmx += (targetMx - cmx) * 0.06;
            for (const d of items) {
                const r = d.el.getBoundingClientRect();
                if (r.bottom < -240 || r.top > vh + 240) continue; // skip off-screen
                const p = (r.top + r.height / 2 - vh / 2) / vh;
                const ty = -p * d.par * 120 + (d.amp ? Math.sin(t * d.speed + d.phase) * d.amp : 0);
                const tx = cmx * d.mouse + (d.amp ? Math.cos(t * d.speed * 0.8 + d.phase) * d.amp * 0.35 : 0);
                d.el.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0)`;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        return () => {
            running = false;
            cancelAnimationFrame(raf);
            window.removeEventListener("mousemove", onMove);
        };
    }, [scanKey]);

    return null;
}
