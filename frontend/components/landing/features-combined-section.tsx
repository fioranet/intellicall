import { Card, CardDescription, CardTitle } from "@wixzel/react";
import { ChartBarIcon, MicrophoneIcon, FileXlsIcon, ChatTextIcon, PlugIcon, SparkleIcon } from "@wixzel/react/icons";
import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";

const FEATURES = [
    { icon: ChartBarIcon, title: "Lead scoring & qualification", desc: "Every call ends with an AI score and qualification so reps focus on the hottest prospects." },
    { icon: MicrophoneIcon, title: "Recordings & transcripts", desc: "Every conversation recorded and transcribed word-for-word, with AI summaries." },
    { icon: SparkleIcon, title: "AI call analysis", desc: "Automatic outcomes, sentiment, and next steps extracted from each call." },
    { icon: FileXlsIcon, title: "Leads & custom fields", desc: "Import, tag, and personalize calls with your own merge fields per lead." },
    { icon: ChatTextIcon, title: "WhatsApp reminders", desc: "Appointment reminders delivered automatically over the WhatsApp Cloud API." },
    { icon: PlugIcon, title: "REST API & webhooks", desc: "Personal API keys and signed webhooks to wire calling into anything." },
];

export function FeaturesCombinedSection() {
    return (
        <SectionShell id="features">
            <div className="flex flex-col gap-12">
                <SectionHeading
                    eyebrow="Everything else"
                    title="A complete calling operation"
                    subtitle="Beyond the headline features, everything you need to run and measure AI calling at scale."
                />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map((f, i) => (
                        <Reveal key={f.title} delayMs={i * 60} className="h-full">
                            <Card className="h-full gap-1.5 p-6">
                                <span className="mb-3 grid size-10 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                    <f.icon className="size-5" />
                                </span>
                                <CardTitle>{f.title}</CardTitle>
                                <CardDescription>{f.desc}</CardDescription>
                            </Card>
                        </Reveal>
                    ))}
                </div>
            </div>
        </SectionShell>
    );
}
