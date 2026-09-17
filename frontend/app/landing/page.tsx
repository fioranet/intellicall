"use client";

import Link from "next/link";
import { ChevronRight, Menu, X, Layers, Plug, CreditCard, Server, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Footer } from "@/components/layout/footer";
import { useEffect, useState } from "react";
import axios from "axios";
import { getCurrencySymbol } from "@/lib/currency-symbols";
import { buildFaqs } from "@/components/landing/faq-data";
import { HeroSection } from "@/components/landing/hero-section";
import { SpotlightVoiceEngines } from "@/components/landing/spotlight-voice-engines";
import { SpotlightOutbound } from "@/components/landing/spotlight-outbound";
import { SpotlightInbound } from "@/components/landing/spotlight-inbound";
import { SpotlightAppointments } from "@/components/landing/spotlight-appointments";
import { FeaturesCombinedSection } from "@/components/landing/features-combined-section";
import { IntegrationsSection } from "@/components/landing/integrations-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { SelfHostSection } from "@/components/landing/self-host-section";
import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { FaqSection } from "@/components/landing/faq-section";
import { CtaSection } from "@/components/landing/cta-section";
import { LandingMotion } from "@/components/landing/_shared/landing-motion";
import { SectionDots } from "@/components/landing/_shared/section-dots";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function LandingPage() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [plans, setPlans] = useState<any[]>([]);
    const [currencySymbol, setCurrencySymbol] = useState("$");
    const [loadingPlans, setLoadingPlans] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [testimonials, setTestimonials] = useState<any[]>([]);
    const [appName, setAppName] = useState("IntelliCallAI");
    const [currencyCode, setCurrencyCode] = useState("USD");
    const [showSelfHosting, setShowSelfHosting] = useState(false);

    const faqs = buildFaqs(appName);

    // Enable snap scrolling only on this page (scoped to the document via a class) so other
    // routes are unaffected. Mandatory on desktop, proximity on smaller screens.
    useEffect(() => {
        document.documentElement.classList.add("landing-snap");
        return () => document.documentElement.classList.remove("landing-snap");
    }, []);

    useEffect(() => {
        const token = localStorage.getItem("token");
        setIsLoggedIn(!!token);

        const fetchData = async () => {
            try {
                const [plansRes, settingsRes, testimonialsRes] = await Promise.all([
                    axios.get(`${API_BASE_URL}/plans`),
                    axios.get(`${API_BASE_URL}/settings/public`),
                    axios.get(`${API_BASE_URL}/admin/testimonials`).catch(() => ({ data: null })),
                ]);

                if (plansRes.data?.status === "success") {
                    setPlans(plansRes.data.data.plans);
                }

                if (settingsRes.data?.status === "success") {
                    const d = settingsRes.data.data;
                    setCurrencySymbol(getCurrencySymbol(d.currency));
                    setCurrencyCode(d.currency || "USD");
                    if (d.branding?.appName) setAppName(d.branding.appName);
                    setShowSelfHosting(Boolean(d.showSelfHostingSection));
                }

                if (testimonialsRes.data?.status === "success") {
                    setTestimonials(testimonialsRes.data.data.testimonials);
                }
            } catch (err) {
                console.error("Failed to fetch landing page data", err);
            } finally {
                setLoadingPlans(false);
            }
        };

        fetchData();
    }, []);

    const dotIds = [
        "hero", "voice-engines", "outbound", "inbound", "appointments", "features", "integrations", "pricing",
        ...(showSelfHosting ? ["self-host"] : []),
        ...(testimonials.length > 0 ? ["testimonials"] : []),
        "faq", "start",
    ];

    const navLinks = [
        { href: "#voice-engines", label: "Vozes & IA", icon: Mic },
        { href: "#features", label: "Recursos", icon: Layers },
        { href: "#integrations", label: "Integrações", icon: Plug },
        { href: "#pricing", label: "Planos", icon: CreditCard },
        ...(showSelfHosting ? [{ href: "#self-host", label: "Hospedagem Própria", icon: Server }] : []),
    ];

    return (
        <div className="flex min-h-screen flex-col bg-background font-sora text-foreground">
            <LandingMotion scanKey={`${showSelfHosting}-${testimonials.length}`} />
            <SectionDots ids={dotIds} />

            {/* Navigation */}
            <header className="fixed top-0 z-50 w-full border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
                    <div className="origin-left scale-110 sm:scale-100">
                        <Logo width={180} height={45} variant="auto" />
                    </div>

                    <nav className="hidden items-center gap-8 md:flex">
                        {navLinks.map((l) => (
                            <Link key={l.href} href={l.href} className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-brand">
                                <l.icon className="h-4 w-4" /> {l.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="flex items-center gap-3">
                        {isLoggedIn ? (
                            <Button asChild variant="default" className="h-8 rounded-full bg-brand px-4 text-xs text-white hover:bg-brand/90 sm:h-9 sm:px-6 sm:text-sm">
                                <Link href="/dashboard">Acessar Painel</Link>
                            </Button>
                        ) : (
                            <>
                                <div className="flex items-center gap-2 md:hidden">
                                    <Button asChild variant="default" className="h-8 rounded-full bg-brand px-3 text-xs text-white hover:bg-brand/90">
                                        <Link href="/signup" className="flex items-center">Começar<ChevronRight className="ml-1 h-3 w-3" /></Link>
                                    </Button>
                                </div>
                                <div className="hidden items-center gap-4 md:flex">
                                    <Link href="/login" className="px-4 py-2 text-sm font-medium transition-colors hover:text-brand">Entrar</Link>
                                    <Button asChild variant="default" className="rounded-full bg-brand px-6 text-white hover:bg-brand/90">
                                        <Link href="/signup" className="text-white">Criar Conta <ChevronRight className="ml-2 h-4 w-4" /></Link>
                                    </Button>
                                </div>
                            </>
                        )}
                        <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground md:hidden"
                            onClick={() => setMobileMenuOpen((p) => !p)}
                            aria-label="Alternar menu de navegação"
                        >
                            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                        </button>
                        <ModeToggle />
                    </div>
                </div>

                {mobileMenuOpen && (
                    <div className="border-t border-border bg-background/95 backdrop-blur-sm md:hidden">
                        <nav className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3">
                            {navLinks.map((l) => (
                                <Link key={l.href} href={l.href} className="flex items-center gap-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
                                    <l.icon className="h-4 w-4" /> {l.label}
                                </Link>
                            ))}
                            <div className="my-1 h-px bg-border" />
                            <Link href="/login" className="py-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Entrar</Link>
                        </nav>
                    </div>
                )}
            </header>

            <main>
                <HeroSection isLoggedIn={isLoggedIn} />
                <SpotlightVoiceEngines />
                <SpotlightOutbound />
                <SpotlightInbound />
                <SpotlightAppointments />
                <FeaturesCombinedSection />
                <IntegrationsSection />
                <PricingSection plans={plans} loading={loadingPlans} currencySymbol={currencySymbol} isLoggedIn={isLoggedIn} />
                {showSelfHosting && <SelfHostSection />}
                {testimonials.length > 0 && <TestimonialsSection testimonials={testimonials} />}
                <FaqSection faqs={faqs} appName={appName} />
                <CtaSection isLoggedIn={isLoggedIn} showSelfHosting={showSelfHosting} />
            </main>

            {/* Structured data for search engines and AI answer engines (SEO / AEO) */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        name: appName,
                        applicationCategory: "BusinessApplication",
                        operatingSystem: "Web",
                        description: `${appName} é uma plataforma de atendimento por voz com inteligência artificial: agentes humanizados atendem e realizam chamadas 24/7, qualificam leads em tempo real, agendam reuniões e enviam lembretes via WhatsApp.`,
                        offers: plans.length > 0 ? plans.map((p) => ({ "@type": "Offer", name: p.name, price: p.price, priceCurrency: currencyCode })) : undefined,
                        featureList: [
                            "Agentes de voz com IA para chamadas receptivas e ativas",
                            "Vozes neurais ultra-realistas com respostas em tempo real",
                            "Campanhas ativas de chamadas automatizadas",
                            "Qualificação e pontuação de oportunidades em tempo real",
                            "Agendamento de reuniões com sincronização no Google Calendar",
                            "Lembretes automáticos para clientes via WhatsApp",
                            "Gravações de chamadas, transcrições e resumos por IA",
                            "Integrações nativas com n8n, HubSpot, Slack e Google Sheets",
                            "API REST e Webhooks para integrações personalizadas",
                        ],
                    }),
                }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "FAQPage",
                        mainEntity: faqs.map((faq) => ({
                            "@type": "Question",
                            name: faq.question,
                            acceptedAnswer: { "@type": "Answer", text: faq.answer },
                        })),
                    }),
                }}
            />

            <div className="snap-start">
                <Footer />
            </div>
        </div>
    );
}
