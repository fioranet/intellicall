"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";
import type { Faq } from "./faq-data";

export function FaqSection({ faqs, appName }: { faqs: Faq[]; appName: string }) {
    const [open, setOpen] = useState<number | null>(0);

    return (
        <SectionShell id="faq" variant="base" strokes="a" watermark="ask">
            <div className="mx-auto max-w-3xl space-y-12">
                <SectionHeading
                    number="11"
                    eyebrow="Perguntas Frequentes"
                    title="Perguntas frequentes"
                    subtitle={`Tudo o que você precisa saber sobre agentes de voz inteligentes e como o ${appName} funciona.`}
                />
                <div className="space-y-3">
                    {faqs.map((faq, i) => {
                        const isOpen = open === i;
                        return (
                            <Reveal key={i} delayMs={i * 50}>
                                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                                    <button
                                        type="button"
                                        onClick={() => setOpen(isOpen ? null : i)}
                                        className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-muted/40 md:p-6"
                                        aria-expanded={isOpen}
                                    >
                                        <h3 className="text-base font-bold text-foreground md:text-lg">{faq.question}</h3>
                                        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                                    </button>
                                    {isOpen && (
                                        <div className="animate-in fade-in slide-in-from-top-1 px-5 pb-5 duration-300 md:px-6 md:pb-6">
                                            <p className="leading-relaxed text-muted-foreground">{faq.answer}</p>
                                        </div>
                                    )}
                                </div>
                            </Reveal>
                        );
                    })}
                </div>
            </div>
        </SectionShell>
    );
}
