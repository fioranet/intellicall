import { Card } from "@wixzel/react";
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
        <SectionShell id="integrations">
            <div className="flex flex-col gap-12">
                <SectionHeading
                    eyebrow="Integrations"
                    title="Plug into the tools you already use"
                    subtitle="One-click OAuth into your CRM, calendar, spreadsheet, and team chat. Leads, calls, and appointments flow into your stack automatically — no copy-paste, no Zapier required."
                />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {INTEGRATIONS.map((it, i) => (
                        <Reveal key={it.name} delayMs={i * 60} className="h-full">
                            <Card className="h-full flex-row items-start gap-4 p-6">
                                <span className="grid size-12 shrink-0 place-items-center rounded-md bg-surface">
                                    <img src={it.src} alt={it.name} className="size-7 object-contain" />
                                </span>
                                <div className="flex min-w-0 flex-col gap-1">
                                    <h3 className="text-heading-sm text-fg">{it.name}</h3>
                                    <p className="text-body-sm text-fg-muted">{it.desc}</p>
                                </div>
                            </Card>
                        </Reveal>
                    ))}
                </div>
                <Reveal className="text-center">
                    <p className="text-body-sm text-fg-muted">Signed webhooks and a documented REST API cover everything else.</p>
                </Reveal>
            </div>
        </SectionShell>
    );
}
