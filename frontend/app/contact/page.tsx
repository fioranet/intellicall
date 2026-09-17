"use client";

import Link from "next/link";
import { ChevronLeft, Mail, Phone, MessageSquare, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Footer } from "@/components/layout/footer";
import { getContactDisplayEmail, useSettings } from "@/components/settings-provider";

export default function ContactPage() {
    const { branding, publicSite } = useSettings();
    const contactEmail = getContactDisplayEmail(publicSite);
    const phoneNumber = "0800 800 6888";
    const phoneHref = "tel:08008006888";
    const whatsappHref = "https://wa.me/558008006888";

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
                <div className="max-w-2xl mx-auto space-y-12">
                    <div className="space-y-4">
                        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
                            Fale <span style={{ color: branding.primaryColor }}>Conosco</span>
                        </h1>
                        <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                            Tem dúvidas sobre como o {branding.appName} pode transformar o atendimento e a produtividade da sua empresa? Nossa equipe está pronta para te atender.
                        </p>
                    </div>

                    <div className="grid gap-6">
                        {/* Telefone e WhatsApp */}
                        <div className="p-6 rounded-2xl bg-muted/30 border border-border flex items-start gap-4 shadow-sm hover:border-primary/40 transition-colors">
                            <div className="p-3 bg-muted rounded-2xl shrink-0" style={{ color: branding.primaryColor }}>
                                <Phone className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="font-bold text-base">Telefone &amp; WhatsApp</h4>
                                <p className="text-lg font-semibold text-foreground">
                                    <a href={phoneHref} className="hover:underline">
                                        {phoneNumber}
                                    </a>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Ligação gratuita ou atendimento rápido via{" "}
                                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline" style={{ color: branding.primaryColor }}>
                                        WhatsApp
                                    </a>
                                </p>
                            </div>
                        </div>

                        {/* E-mail */}
                        <div className="p-6 rounded-2xl bg-muted/30 border border-border flex items-start gap-4 shadow-sm hover:border-primary/40 transition-colors">
                            <div className="p-3 bg-muted rounded-2xl shrink-0" style={{ color: branding.primaryColor }}>
                                <Mail className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="font-bold text-base">E-mail</h4>
                                <p className="text-muted-foreground">
                                    <a href={`mailto:${contactEmail}`} className="hover:underline font-medium" style={{ color: branding.primaryColor }}>
                                        {contactEmail}
                                    </a>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Envie sua mensagem e retornaremos o mais breve possível.
                                </p>
                            </div>
                        </div>

                        {/* Horário de Atendimento */}
                        <div className="p-6 rounded-2xl bg-muted/30 border border-border flex items-start gap-4 shadow-sm">
                            <div className="p-3 bg-muted rounded-2xl shrink-0" style={{ color: branding.primaryColor }}>
                                <Clock className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="font-bold text-base">Horário de Atendimento</h4>
                                <p className="text-sm text-foreground font-medium">
                                    Segunda a Sexta-feira, das 08:00 às 18:00
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Horário de Brasília (exceto feriados nacionais)
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
