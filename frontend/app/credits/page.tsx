"use client";

import { ShieldCheck, PhoneCall, Bot, FileText, CheckCircle2 } from "lucide-react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card";

export default function CreditsPage() {
    return (
        <div className="container max-w-4xl py-10 space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Serviço Gerenciado Nuvv Telecom
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Informações sobre planos, tarifação de telefonia e inteligência artificial da sua conta.
                </p>
            </div>

            <Card className="border-emerald-500/20 bg-card/60 backdrop-blur-sm shadow-md">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <div>
                            <CardTitle className="text-xl font-bold">Faturamento Centralizado &amp; Gestão Unificada</CardTitle>
                            <CardDescription>
                                Sua operação está vinculada à infraestrutura de telecomunicações da Nuvv Telecom.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Nesta modalidade corporativa, você não precisa adquirir créditos pré-pagos em moedas virtuais ou configurar cartões no portal. 
                        Todo o consumo de chamadas, minutos de conversação por voz e processamento de IA é bilhetado em tempo real 
                        e consolidado diretamente na sua fatura através do <strong>MagnusBilling</strong> e do sistema de gestão <strong>SGP</strong>.
                    </p>

                    <div className="grid gap-4 md:grid-cols-3 pt-2">
                        <div className="rounded-xl border border-border/80 bg-background/50 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                                <Bot className="h-4 w-4" />
                                <span>Agentes de IA</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Criação de agentes, bases de conhecimento e prompts ilimitados na plataforma.
                            </p>
                        </div>

                        <div className="rounded-xl border border-border/80 bg-background/50 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                                <PhoneCall className="h-4 w-4" />
                                <span>Minutagem SIP</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Tarifação direta por segundo conectado no tronco Nuvv ou em terminação própria.
                            </p>
                        </div>

                        <div className="rounded-xl border border-border/80 bg-background/50 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                                <FileText className="h-4 w-4" />
                                <span>Extrato &amp; Fatura</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Histórico detalhado de chamadas (CDR) e fatura única via Central do Assinante SGP.
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-center gap-3 text-sm text-emerald-800 dark:text-emerald-200">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span>Sua conta está ativa e autorizada para chamadas e campanhas automáticas.</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
