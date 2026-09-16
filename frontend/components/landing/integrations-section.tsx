import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";

const INTEGRATIONS = [
    { src: "/images/integrations/hubspot.png", name: "HubSpot CRM", desc: "New leads sync as contacts automatically, matched by phone." },
    { src: "/images/integrations/calendar.png", name: "Google Calendar", desc: "Booked appointments mirror to your calendar in real time." },
    { src: "/images/integrations/sheets.png", name: "Google Sheets", desc: "Import leads from a spreadsheet and keep them in sync." },
    { src: "/images/integrations/slack.png", name: "Slack", desc: "Real-time channel alerts for leads, calls, and bookings." },
    { src: "/images/integrations/whatsapp.png", name: "WhatsApp", desc: "Event alerts and reminders via the Meta Cloud API." },
    { src: "/images/integrations/n8n.png", name: "n8n", desc: "Stream events into 400+ apps, plus REST API callbacks." },
];

export function IntegrationsSection() {
    return (
        <SectionShell id="integrations" variant="base" strokes="c" watermark="connect" watermarkPos="right">
            <div className="space-y-10">
                <SectionHeading
                    number="07"
                    eyebrow="Integrations"
                    title="Plug into the tools you already use"
                    subtitle="One-click OAuth into your CRM, calendar, spreadsheet, and team chat. Leads, calls, and appointments flow into your stack automatically — no copy-paste, no Zapier required."
                />
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {INTEGRATIONS.map((it, i) => (
                        <Reveal key={it.name} delayMs={i * 70}>
                            <div className="flex h-full items-start gap-4 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-brand/40">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
                                    <img src={it.src} alt={it.name} className="h-7 w-7 object-contain" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-foreground">{it.name}</h3>
                                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{it.desc}</p>
                                </div>
                            </div>
                        </Reveal>
                    ))}
                </div>
                <Reveal className="text-center">
                    <p className="text-sm text-muted-foreground">Signed webhooks and a documented REST API cover everything else.</p>
                </Reveal>
            </div>
        </SectionShell>
    );
}
