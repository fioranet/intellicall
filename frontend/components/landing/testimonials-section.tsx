import { Avatar, Card } from "@wixzel/react";
import { StarIcon } from "@wixzel/react/icons";
import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";

export function TestimonialsSection({ testimonials }: { testimonials: any[] }) {
    return (
        <SectionShell id="testimonials">
            <div className="flex flex-col gap-12">
                <SectionHeading
                    eyebrow="Testimonials"
                    title="Why teams love us"
                    subtitle="Join the companies that have transformed their calling operations."
                />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {testimonials.map((t, i) => (
                        <Reveal key={t._id || i} delayMs={i * 70} className="h-full">
                            <Card asChild className="h-full gap-5 p-6">
                                <figure>
                                    <div className="flex gap-0.5 text-accent-ink">
                                        {Array.from({ length: t.rating || 5 }, (_, s) => (
                                            <StarIcon key={s} className="size-4" />
                                        ))}
                                    </div>
                                    <blockquote className="flex-1 text-body-lg font-medium text-fg">&ldquo;{t.quote}&rdquo;</blockquote>
                                    <figcaption className="flex items-center gap-3">
                                        <Avatar name={t.author || ""} size="md" />
                                        <div className="min-w-0">
                                            <div className="text-body-sm font-semibold text-fg">{t.author}</div>
                                            <div className="text-caption text-fg-muted">{t.role}</div>
                                        </div>
                                    </figcaption>
                                </figure>
                            </Card>
                        </Reveal>
                    ))}
                </div>
            </div>
        </SectionShell>
    );
}
