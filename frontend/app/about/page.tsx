"use client";

import Link from "next/link";
import { ChevronLeft, Users, Target, Rocket, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Footer } from "@/components/layout/footer";
import { useSettings } from "@/components/settings-provider";

export default function AboutPage() {
    const { branding } = useSettings();

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground font-sora">
            <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/">
                        <Logo width={180} height={45} variant="auto" />
                    </Link>
                    <div className="flex items-center gap-4">
                        <ModeToggle />
                        <Button asChild variant="ghost" className="rounded-full">
                            <Link href="/">
                                <ChevronLeft className="mr-2 h-4 w-4" /> Voltar ao Início
                            </Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="pt-32 pb-20 px-6">
                <div className="max-w-4xl mx-auto space-y-16">
                    <div className="space-y-6 text-center">
                        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
                            Nossa Missão é <span style={{ color: branding.primaryColor }}>Humanizar</span> a IA
                        </h1>
                        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                            Estamos construindo o futuro da comunicação empresarial, onde a Inteligência Artificial não apenas automatiza tarefas, mas cria conexões autênticas e gera resultados reais.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 text-left">
                        <div className="space-y-4 p-8 rounded-3xl bg-muted/30 border border-border shadow-sm">
                            <div className="p-3 rounded-2xl w-fit" style={{ backgroundColor: `${branding.primaryColor}15`, color: branding.primaryColor }}>
                                <Target className="h-6 w-6" />
                            </div>
                            <h3 className="text-2xl font-bold">Nossa Visão</h3>
                            <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                                Capacitar empresas de todos os portes com agentes virtuais sofisticados que soam naturais, entendem contextos complexos e entregam valor a cada interação com o cliente.
                            </p>
                        </div>
                        <div className="space-y-4 p-8 rounded-3xl bg-muted/30 border border-border shadow-sm">
                            <div className="p-3 rounded-2xl w-fit" style={{ backgroundColor: `${branding.primaryColor}15`, color: branding.primaryColor }}>
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <h3 className="text-2xl font-bold">Tecnologia &amp; Inovação</h3>
                            <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                                Unimos o estado da arte em síntese neural de voz, processamento nativo em tempo real e modelos de linguagem para proporcionar chamadas telefônicas fluidas, inteligentes e sem atrito.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h2 className="text-3xl font-bold text-center">Por Que Criamos o {branding.appName}</h2>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4 text-base">
                            <p>
                                A comunicação por voz continua sendo o canal mais direto, decisivo e confiável para fechar negócios e solucionar demandas urgentes. No entanto, as centrais telefônicas tradicionais tornaram-se onerosas, filas de espera geram insatisfação e equipes de atendimento ficam sobrecarregadas com tarefas repetitivas.
                            </p>
                            <p>
                                O <strong>{branding.appName}</strong> nasceu para transformar essa realidade. Ao integrar inteligência artificial conversacional de ultra baixa latência com redes de telefonia corporativa, proporcionamos atendentes virtuais que atendem 24 horas por dia, 7 dias por semana, com empatia, agilidade e o profissionalismo que seus clientes merecem.
                            </p>
                        </div>
                    </div>

                    {/* CTA Box */}
                    <div className="p-10 md:p-14 rounded-3xl bg-slate-900 border border-slate-800 text-white text-center space-y-6 shadow-xl">
                        <Rocket className="h-10 w-10 md:h-12 md:w-12 mx-auto" style={{ color: branding.primaryColor }} />
                        <h2 className="text-2xl md:text-3xl font-bold">Pronto para transformar a sua comunicação?</h2>
                        <p className="text-slate-400 max-w-xl mx-auto text-sm md:text-base leading-relaxed">
                            Descubra como colocar agentes de voz com inteligência artificial para atender seus clientes e acelerar suas vendas hoje mesmo.
                        </p>
                        <Button size="lg" className="text-white rounded-full px-8 font-semibold shadow-lg transition-transform hover:scale-105" style={{ backgroundColor: branding.primaryColor }} asChild>
                            <Link href="/signup" className="text-white">Criar Conta Gratuitamente</Link>
                        </Button>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
