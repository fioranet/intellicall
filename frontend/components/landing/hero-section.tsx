import Link from "next/link";
import { ArrowRight, PlayCircle, ShieldCheck, Sparkles, PhoneCall, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionShell } from "./_shared/section-shell";

const HIGHLIGHTS = [
    { icon: Sparkles, label: "IA em Tempo Real" },
    { icon: PhoneCall, label: "Receptivo & Ativo 24/7" },
    { icon: CalendarCheck, label: "Agendamento Automático" },
    { icon: ShieldCheck, label: "Conformidade LGPD" },
];

export function HeroSection({ isLoggedIn }: { isLoggedIn: boolean }) {
    return (
        <SectionShell id="hero" variant="base" strokes="a" watermark="calls" watermarkPos="right">
            {/* Mount-triggered animation (not scroll-observed) so the hero is never left invisible. */}
            <div className="mx-auto max-w-4xl space-y-8 text-center">
                <p className="animate-in fade-in slide-in-from-bottom-3 font-mono text-xs font-medium uppercase tracking-[0.16em] text-brand duration-700">
                    01 · Atendimento Inteligente por Voz · Receptivo &amp; Ativo
                </p>

                <h1 className="animate-in fade-in slide-in-from-bottom-4 text-5xl font-bold leading-[1.05] tracking-tight text-foreground duration-700 md:text-7xl">
                    Chamadas com IA que parecem <span className="text-brand italic">humanas</span>,<br className="hidden sm:block" /> 24 horas por dia
                </h1>

                <p className="mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 text-lg leading-relaxed text-muted-foreground duration-700 [animation-delay:120ms] md:text-xl">
                    Agentes de voz inteligentes que atendem chamadas receptivas e realizam campanhas ativas 24/7 — qualificando oportunidades, agendando reuniões e falando com naturalidade com seus clientes.
                </p>

                <div className="flex animate-in fade-in slide-in-from-bottom-4 flex-col items-center justify-center gap-4 pt-2 duration-700 [animation-delay:200ms] sm:flex-row">
                    <Button size="lg" className="h-14 rounded-full bg-brand px-10 text-base font-semibold text-white hover:bg-brand/90" asChild>
                        <Link href={isLoggedIn ? "/dashboard" : "/signup"} className="text-white">
                            {isLoggedIn ? "Acessar Painel" : "Começar Gratuitamente"} <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="h-14 rounded-full border-border px-10 text-base font-semibold hover:bg-muted" asChild>
                        <a href="https://www.youtube.com/playlist?list=PL8zrhWETS5cBcHRdm2G8oxv-97Zf424HJ" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                            <PlayCircle className="h-5 w-5" /> Ver em Funcionamento
                        </a>
                    </Button>
                </div>

                <div className="animate-in fade-in flex flex-wrap items-center justify-center gap-x-6 gap-y-3 pt-8 duration-700 [animation-delay:320ms]">
                    {HIGHLIGHTS.map((item) => (
                        <div
                            key={item.label}
                            className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm"
                        >
                            <item.icon className="h-3.5 w-3.5 text-brand" />
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </SectionShell>
    );
}
