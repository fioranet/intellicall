import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";

const INTEGRATIONS = [
    { src: "/images/integrations/hubspot.png", name: "HubSpot CRM", desc: "Novos contatos e oportunidades sincronizados automaticamente após a chamada." },
    { src: "/images/integrations/calendar.png", name: "Google Calendar", desc: "Compromissos agendados durante a chamada refletidos na sua agenda em tempo real." },
    { src: "/images/integrations/sheets.png", name: "Google Sheets", desc: "Importe listas de contatos de planilhas e mantenha os dados sempre atualizados." },
    { src: "/images/integrations/slack.png", name: "Slack", desc: "Notificações em tempo real no canal da sua equipe para cada lead qualificado." },
    { src: "/images/integrations/whatsapp.png", name: "WhatsApp", desc: "Envio de alertas de compromissos e confirmações automáticas para o cliente." },
    { src: "/images/integrations/n8n.png", name: "n8n", desc: "Dispare fluxos com mais de 400 aplicativos e crie automações avançadas." },
];

export function IntegrationsSection() {
    return (
        <SectionShell id="integrations" variant="base" strokes="c" watermark="connect" watermarkPos="right">
            <div className="space-y-10">
                <SectionHeading
                    number="07"
                    eyebrow="Integrações"
                    title="Conecte-se facilmente às ferramentas que você já utiliza"
                    subtitle="Sincronização com seu CRM, calendário, planilhas e canais de comunicação. Contatos, chamadas e reuniões fluem automaticamente para a sua operação sem retrabalho."
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
                    <p className="text-sm text-muted-foreground">Webhooks em tempo real e API REST documentada para integração com qualquer sistema interno.</p>
                </Reveal>
            </div>
        </SectionShell>
    );
}
