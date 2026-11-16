"use client";

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
import { SectionDots } from "@/components/landing/_shared/section-dots";
import { LandingHeader } from "@/components/landing/_shared/landing-header";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function LandingPage() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [plans, setPlans] = useState<any[]>([]);
    const [currencySymbol, setCurrencySymbol] = useState("$");
    const [loadingPlans, setLoadingPlans] = useState(true);
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

    return (
        <div className="flex min-h-screen flex-col bg-bg text-fg">
            <SectionDots ids={dotIds} />

            <LandingHeader isLoggedIn={isLoggedIn} showSelfHosting={showSelfHosting} />

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
                        description: `${appName} is an AI voice calling platform: human-like AI agents answer and place calls 24/7, qualify leads in real time, book appointments, and send WhatsApp reminders.`,
                        offers: plans.length > 0 ? plans.map((p) => ({ "@type": "Offer", name: p.name, price: p.price, priceCurrency: currencyCode })) : undefined,
                        featureList: [
                            "AI voice agents for inbound and outbound calls",
                            "Multiple voice engines including Deepgram Voice Agent, Gemini Live, and Sarvam AI for Indian languages",
                            "Automated outbound call campaigns",
                            "Real-time lead qualification and scoring",
                            "AI appointment booking with Google Calendar sync",
                            "WhatsApp client appointment reminders",
                            "Call recordings, transcripts, and AI summaries",
                            "n8n, HubSpot, Slack, and Google Sheets integrations",
                            "REST API with personal API keys",
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
