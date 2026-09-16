import { BarChart3, Mic, FileSpreadsheet, MessageSquare, Plug, Sparkles } from "lucide-react";
import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";

const FEATURES = [
    { icon: BarChart3, title: "Lead scoring & qualification", desc: "Every call ends with an AI score and qualification so reps focus on the hottest prospects." },
    { icon: Mic, title: "Recordings & transcripts", desc: "Every conversation recorded and transcribed word-for-word, with AI summaries." },
    { icon: Sparkles, title: "AI call analysis", desc: "Automatic outcomes, sentiment, and next steps extracted from each call." },
    { icon: FileSpreadsheet, title: "Leads & custom fields", desc: "Import, tag, and personalize calls with your own merge fields per lead." },
    { icon: MessageSquare, title: "WhatsApp reminders", desc: "Appointment reminders delivered automatically over the WhatsApp Cloud API." },
    { icon: Plug, title: "REST API & webhooks", desc: "Personal API keys and signed webhooks to wire calling into anything." },
];

export function FeaturesCombinedSection() {
    return (
        <SectionShell id="features" variant="brand" strokes="b" watermark="build">
            <div className="space-y-10">
                <SectionHeading
                    number="06"
                    eyebrow="Everything else"
                    title="A complete calling operation"
                    subtitle="Beyond the headline features, everything you need to run and measure AI calling at scale."
                    onBrand
                />
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map((f, i) => (
                        <Reveal key={f.title} delayMs={i * 70}>
                            <div className="h-full rounded-2xl border border-border bg-card p-6 transition-colors hover:border-brand/40">
                                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-brand/10 text-brand">
                                    <f.icon className="h-5 w-5" />
                                </div>
                                <h3 className="mb-1.5 text-base font-bold text-foreground">{f.title}</h3>
                                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </SectionShell>
    );
}
