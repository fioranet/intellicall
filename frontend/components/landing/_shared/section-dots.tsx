"use client";

import { useEffect, useState } from "react";

/**
 * Fixed vertical section indicator (right-center). The active section's dot grows taller.
 * `mix-blend-difference` keeps the white dots legible over any section background (light,
 * dark, or brand). Hidden on small screens.
 */
export function SectionDots({ ids }: { ids: string[] }) {
    const [active, setActive] = useState(0);

    useEffect(() => {
        const sections = ids
            .map((id) => document.getElementById(id))
            .filter((el): el is HTMLElement => !!el);
        if (!sections.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        const idx = sections.indexOf(e.target as HTMLElement);
                        if (idx >= 0) setActive(idx);
                    }
                });
            },
            { threshold: 0.5 }
        );
        sections.forEach((s) => observer.observe(s));
        return () => observer.disconnect();
    }, [ids.join(",")]);

    return (
        <div
            aria-hidden
            className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2.5 md:flex"
            style={{ mixBlendMode: "difference" }}
        >
            {ids.map((id, i) => (
                <a
                    key={id}
                    href={`#${id}`}
                    className="block w-2 rounded-full bg-white transition-all duration-300"
                    style={{ height: active === i ? 24 : 8, opacity: active === i ? 1 : 0.4 }}
                />
            ))}
        </div>
    );
}
