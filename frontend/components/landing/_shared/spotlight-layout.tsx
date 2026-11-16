import React from "react";
import { CheckIcon } from "@wixzel/react/icons";
import { cn } from "@/lib/utils";
import { SectionShell } from "./section-shell";
import { Eyebrow } from "./section-heading";
import { Reveal } from "./reveal";

interface SpotlightLayoutProps {
    id: string;
    eyebrow: string;
    title: React.ReactNode;
    description: string;
    bullets: string[];
    mock: React.ReactNode;
    /** Place the mockup on the start side instead of the end. */
    reverse?: boolean;
}

/** Two-column feature spotlight: copy + bullets on one side, a tonal product mockup on the other. */
export function SpotlightLayout({ id, eyebrow, title, description, bullets, mock, reverse = false }: SpotlightLayoutProps) {
    return (
        <SectionShell id={id}>
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
                <Reveal className={cn("flex flex-col gap-5", reverse && "lg:order-2")}>
                    <Eyebrow>{eyebrow}</Eyebrow>
                    <h2 className="text-balance text-display-md text-fg md:text-display-lg">{title}</h2>
                    <p className="max-w-xl text-pretty text-body-lg text-fg-muted">{description}</p>
                    <ul className="flex flex-col gap-3 pt-1">
                        {bullets.map((b) => (
                            <li key={b} className="flex items-start gap-3 text-body-md">
                                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-xs bg-accent-subtle text-accent-ink">
                                    <CheckIcon className="size-3" />
                                </span>
                                <span className="text-fg-muted">{b}</span>
                            </li>
                        ))}
                    </ul>
                </Reveal>

                <Reveal delayMs={120} className={cn(reverse && "lg:order-1")}>
                    {mock}
                </Reveal>
            </div>
        </SectionShell>
    );
}
