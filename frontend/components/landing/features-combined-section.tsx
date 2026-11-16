import { BarChart3, Mic, FileSpreadsheet, MessageSquare, Plug, Sparkles } from "lucide-react";
import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";

const FEATURES = [
    { icon: BarChart3, title: "Qualificação & Score de Leads", desc: "Cada chamada é analisada e recebe uma nota automática para que sua equipe foque nos clientes com real intenção de compra." },
    { icon: Mic, title: "Gravações & Transcrições", desc: "Ouça cada conversa e leia a transcrição palavra por palavra, acompanhada de um resumo executivo gerado por IA." },
    { icon: Sparkles, title: "Análise de Sentimento & Objeções", desc: "Identificação automática do nível de interesse do cliente, principais dúvidas e próximos passos combinados." },
    { icon: FileSpreadsheet, title: "Gestão de Leads & Campos Personalizados", desc: "Importe contatos com variáveis customizadas para que o agente personalize a abordagem pelo nome e contexto." },
    { icon: MessageSquare, title: "Lembretes Automáticos no WhatsApp", desc: "Envio de confirmações e avisos de compromissos diretamente no WhatsApp do cliente para zerar faltas." },
    { icon: Plug, title: "API REST & Webhooks", desc: "Chaves de API seguras e webhooks em tempo real para conectar seu fluxo de chamadas com qualquer CRM ou ERP." },
];

export function FeaturesCombinedSection() {
    return (
        <SectionShell id="features" variant="brand" strokes="b" watermark="build">
            <div className="space-y-10">
                <SectionHeading
                    number="06"
                    eyebrow="Recursos Completos"
                    title="Tudo o que sua operação precisa para escalar"
                    subtitle="Além dos recursos principais, uma plataforma completa para gerenciar, medir e otimizar suas ligações com alta performance."
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
