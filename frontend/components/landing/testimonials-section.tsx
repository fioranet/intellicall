import { Star } from "lucide-react";
import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";

export function TestimonialsSection({ testimonials }: { testimonials: any[] }) {
    return (
        <SectionShell id="testimonials" variant="brand" strokes="c" watermark="loved" watermarkPos="right">
            <div className="space-y-10">
                <SectionHeading
                    number="10"
                    eyebrow="Testimonials"
                    title="Why teams love us"
                    subtitle="Join the companies that have transformed their calling operations."
                />
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {testimonials.map((t, i) => (
                        <Reveal key={t._id || i} delayMs={i * 80}>
                            <figure className="flex h-full flex-col rounded-2xl border border-border bg-card p-8">
                                <div className="mb-5 flex gap-1">
                                    {Array.from({ length: t.rating || 5 }, (_, s) => (
                                        <Star key={s} className="h-4 w-4 fill-brand text-brand" />
                                    ))}
                                </div>
                                <blockquote className="mb-6 flex-1 text-base font-medium italic leading-relaxed text-foreground">&ldquo;{t.quote}&rdquo;</blockquote>
                                <figcaption>
                                    <div className="font-bold text-foreground">{t.author}</div>
                                    <div className="text-sm text-muted-foreground">{t.role}</div>
                                </figcaption>
                            </figure>
                        </Reveal>
                    ))}
                </div>
            </div>
        </SectionShell>
    );
}
