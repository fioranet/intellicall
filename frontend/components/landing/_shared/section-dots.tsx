"use client";

import { useEffect, useState } from "react";

/**
 * Fixed vertical section indicator (end-center). The current section's dot is inked and
 * grows taller; the rest stay quiet. Hidden on small screens.
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
        <div aria-hidden className="fixed end-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2 md:flex">
            {ids.map((id, i) => (
                <a
                    key={id}
                    href={`#${id}`}
                    tabIndex={-1}
                    className={
                        active === i
                            ? "block h-5 w-1.5 rounded-full bg-fg transition-[height,background-color] duration-(--wx-duration-move) ease-move"
                            : "block h-1.5 w-1.5 rounded-full bg-border-strong transition-[height,background-color] duration-(--wx-duration-move) ease-move hover:bg-fg-subtle"
                    }
                />
            ))}
        </div>
    );
}
