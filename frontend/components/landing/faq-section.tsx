import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@wixzel/react";
import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";
import type { Faq } from "./faq-data";

export function FaqSection({ faqs, appName }: { faqs: Faq[]; appName: string }) {
    return (
        <SectionShell id="faq">
            <div className="mx-auto flex max-w-3xl flex-col gap-12">
                <SectionHeading
                    eyebrow="FAQ"
                    title="Frequently asked questions"
                    subtitle={`Everything you need to know about AI voice agents and how ${appName} works.`}
                />
                <Reveal>
                    {/* The first answer starts open, as before. */}
                    <Accordion type="single" collapsible defaultValue="0">
                        {faqs.map((faq, i) => (
                            <AccordionItem key={i} value={String(i)}>
                                <AccordionTrigger>{faq.question}</AccordionTrigger>
                                <AccordionContent>
                                    <p className="text-body-md text-fg-muted">{faq.answer}</p>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </Reveal>
            </div>
        </SectionShell>
    );
}
