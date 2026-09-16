import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionShell } from "./_shared/section-shell";
import { SectionHeading } from "./_shared/section-heading";
import { Reveal } from "./_shared/reveal";

interface PricingSectionProps {
    plans: any[];
    loading: boolean;
    currencySymbol: string;
    isLoggedIn: boolean;
}

export function PricingSection({ plans, loading, currencySymbol, isLoggedIn }: PricingSectionProps) {
    return (
        <SectionShell id="pricing" variant="brand" strokes="a" watermark="plans">
            <div className="space-y-10">
                <SectionHeading
                    number="08"
                    eyebrow="Pricing"
                    title="Simple, transparent pricing"
                    subtitle="Choose the plan that fits your growth. No hidden fees, ever."
                    onBrand
                />

                <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {loading ? (
                        Array(3).fill(0).map((_, i) => (
                            <div key={i} className="animate-pulse rounded-2xl border border-border bg-card p-8">
                                <div className="mb-4 h-6 w-24 rounded bg-muted" />
                                <div className="mb-6 h-10 w-32 rounded bg-muted" />
                                <div className="space-y-3">
                                    <div className="h-4 w-full rounded bg-muted/50" />
                                    <div className="h-4 w-full rounded bg-muted/50" />
                                    <div className="h-4 w-full rounded bg-muted/50" />
                                </div>
                            </div>
                        ))
                    ) : plans.length > 0 ? (
                        plans.map((plan, i) => {
                            const popular = i === 1;
                            return (
                                <Reveal key={i} delayMs={i * 90}>
                                    <div className={cn("relative h-full rounded-2xl bg-card p-8", popular ? "border-2 border-white" : "border border-border")}>
                                        {popular && (
                                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-1 text-xs font-bold uppercase text-brand">
                                                Most Popular
                                            </div>
                                        )}
                                        <div className="space-y-6">
                                            <div>
                                                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                                                <div className="mt-4 flex items-baseline gap-1">
                                                    <span className="text-4xl font-bold text-foreground">{currencySymbol}{plan.price}</span>
                                                    <span className="text-sm text-muted-foreground">/{plan.interval}</span>
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                {[
                                                    `${plan.limits?.agents || 0} AI Agents`,
                                                    `${plan.limits?.campaigns || 0} Active Campaigns`,
                                                    `${plan.limits?.leads || 0} Lead Capacity`,
                                                    plan.limits?.callsPerMonth === -1 ? "Unlimited Calls (BYOK)" : `${plan.limits?.callsPerMonth ?? 0} Calls/mo`,
                                                ].map((line) => (
                                                    <div key={line} className="flex items-center gap-3">
                                                        <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" />
                                                        <span className="text-sm text-muted-foreground">{line}</span>
                                                    </div>
                                                ))}
                                                {plan.description && <p className="pt-2 text-xs italic text-muted-foreground">{plan.description}</p>}
                                            </div>
                                            <Button
                                                asChild
                                                className={cn("h-12 w-full rounded-full font-bold", popular ? "bg-brand text-white hover:bg-brand/90" : "bg-primary text-primary-foreground hover:bg-primary/90")}
                                            >
                                                <Link href={isLoggedIn ? "/settings?tab=billing" : "/signup"}>Get Started</Link>
                                            </Button>
                                        </div>
                                    </div>
                                </Reveal>
                            );
                        })
                    ) : (
                        <div className="col-span-full py-12 text-center text-muted-foreground">No plans available at the moment.</div>
                    )}
                </div>
            </div>
        </SectionShell>
    );
}
