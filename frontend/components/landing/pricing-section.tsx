import Link from "next/link";
import { Badge, Button, Card, CardTitle, Skeleton } from "@wixzel/react";
import { CheckCircleIcon } from "@wixzel/react/icons";
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
        <SectionShell id="pricing">
            <div className="flex flex-col gap-12">
                <SectionHeading
                    eyebrow="Pricing"
                    title="Simple, transparent pricing"
                    subtitle="Choose the plan that fits your growth. No hidden fees, ever."
                />

                <div className="mx-auto grid w-full max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {loading ? (
                        Array(3).fill(0).map((_, i) => (
                            <Card key={i} className="gap-6 p-6">
                                <Skeleton className="h-6 w-24" />
                                <Skeleton className="h-10 w-32" />
                                <div className="flex flex-col gap-3">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-full" />
                                </div>
                            </Card>
                        ))
                    ) : plans.length > 0 ? (
                        plans.map((plan, i) => {
                            const popular = i === 1;
                            return (
                                <Reveal key={i} delayMs={i * 80} className="h-full">
                                    <Card className="h-full">
                                        <div className="flex flex-col gap-4 p-6 pb-0">
                                            <div className="flex items-center justify-between gap-3">
                                                <CardTitle>{plan.name}</CardTitle>
                                                {popular && <Badge tone="accent">Most Popular</Badge>}
                                            </div>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-display-md tabular-nums text-fg">{currencySymbol}{plan.price}</span>
                                                <span className="text-body-sm text-fg-muted">/{plan.interval}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-1 flex-col gap-3 p-6">
                                            {[
                                                `${plan.limits?.agents || 0} AI Agents`,
                                                `${plan.limits?.campaigns || 0} Active Campaigns`,
                                                `${plan.limits?.leads || 0} Lead Capacity`,
                                                plan.limits?.callsPerMonth === -1 ? "Unlimited Calls (BYOK)" : `${plan.limits?.callsPerMonth ?? 0} Calls/mo`,
                                            ].map((line) => (
                                                <div key={line} className="flex items-center gap-3">
                                                    <CheckCircleIcon className="size-5 shrink-0 text-accent-ink" />
                                                    <span className="text-body-sm tabular-nums text-fg-muted">{line}</span>
                                                </div>
                                            ))}
                                            {plan.description && <p className="pt-2 text-caption text-fg-subtle">{plan.description}</p>}
                                        </div>
                                        <div className="mt-auto px-6 pb-6">
                                            <Button asChild block size="lg" variant={popular ? "primary" : "secondary"}>
                                                <Link href={isLoggedIn ? "/settings?tab=billing" : "/signup"}>Get Started</Link>
                                            </Button>
                                        </div>
                                    </Card>
                                </Reveal>
                            );
                        })
                    ) : (
                        <div className="col-span-full py-12 text-center text-body-md text-fg-muted">No plans available at the moment.</div>
                    )}
                </div>
            </div>
        </SectionShell>
    );
}
