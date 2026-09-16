"use client";

import Link from "next/link";
import { ChevronLeft, Users, Target, Rocket, Heart } from "lucide-react";
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
                            <Link href="/"><ChevronLeft className="mr-2 h-4 w-4" /> Back to Home</Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="pt-32 pb-20 px-6">
                <div className="max-w-4xl mx-auto space-y-16">
                    <div className="space-y-6 text-center">
                        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
                            Our Mission to <span style={{ color: branding.primaryColor }}>Humanize</span> AI
                        </h1>
                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                            We're building the future of business communication, where AI doesn't just automate tasks—it builds relationships.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-12 pt-8 text-left">
                        <div className="space-y-4 p-8 rounded-3xl bg-muted/30 border border-border">
                            <div className="p-3 rounded-2xl w-fit" style={{ backgroundColor: `${branding.primaryColor}15`, color: branding.primaryColor }}>
                                <Target className="h-6 w-6" />
                            </div>
                            <h3 className="text-2xl font-bold">Our Vision</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                To empower businesses of all sizes with sophisticated AI that sounds authentic, understands context, and delivers value in every interaction.
                            </p>
                        </div>
                        <div className="space-y-4 p-8 rounded-3xl bg-muted/30 border border-border">
                            <div className="p-3 rounded-2xl w-fit" style={{ backgroundColor: `${branding.primaryColor}15`, color: branding.primaryColor }}>
                                <Users className="h-6 w-6" />
                            </div>
                            <h3 className="text-2xl font-bold">The Team</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                A collective of AI researchers, communication experts, and engineers dedicated to solving the challenges of modern outbound outreach.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <h2 className="text-3xl font-bold text-center">Why We Started</h2>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground leading-relaxed space-y-4">
                            <p>
                                Founded in 2024, {branding.appName} emerged from a simple observation: traditional outbound calling was broken. Sales teams were fatigued, conversion rates were dropping, and customers were tired of robotic interactions.
                            </p>
                            <p>
                                We saw an opportunity to bridge the gap using Large Language Models and advanced neural voices. By creating AI agents that can truly listen and adapt, we're giving businesses back their most valuable asset: time.
                            </p>
                        </div>
                    </div>

                    <div className="p-12 rounded-[2rem] bg-slate-900 text-white text-center space-y-6">
                        <Rocket className="h-12 w-12 mx-auto" style={{ color: branding.primaryColor }} />
                        <h2 className="text-3xl font-bold">Ready to join the revolution?</h2>
                        <p className="text-slate-400 max-w-xl mx-auto">
                            Whether you're a startup or an enterprise, we have the tools to scale your voice.
                        </p>
                        <Button size="lg" className="text-white rounded-full px-8" style={{ backgroundColor: branding.primaryColor }} asChild>
                            <Link href="/signup" className="text-white">Get Started Now</Link>
                        </Button>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
