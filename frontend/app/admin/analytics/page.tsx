"use client";

import { useTranslations } from "next-intl";
import { ChartBar, TrendUp, Users, CreditCard } from "@phosphor-icons/react";
import {
    Spinner,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    PageHeader,
    StatCard,
} from "@wixzel/react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from "recharts";
import { AdminNav } from "@/components/admin/nav";
import { useEffect, useState } from "react";
import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const AXIS = { stroke: "var(--wx-color-fg-subtle)", fontSize: 12, tickLine: false, axisLine: false } as const;

// Recharts tooltip drawn as a small Wixzel overlay panel.
interface ChartTooltipProps {
    active?: boolean;
    label?: string | number;
    payload?: { dataKey?: string | number; name?: string; value?: number | string; color?: string }[];
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-md bg-surface-overlay px-3 py-2 text-caption shadow-md">
            <div className="font-medium text-fg">{label}</div>
            {payload.map((p) => (
                <div key={String(p.dataKey)} className="flex items-center gap-2 tabular-nums text-fg-muted">
                    <span className="size-1.5 rounded-full" style={{ background: p.color }} />
                    {p.name}: <span className="font-medium text-fg">{p.value}</span>
                </div>
            ))}
        </div>
    );
}

export default function AdminAnalyticsPage() {
    const t = useTranslations("admin");
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem("token");
                const response = await axios.get(`${API_BASE_URL}/admin/analytics`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.data?.status === "success") {
                    setStats(response.data.data.stats);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("analytics.title")} description={t("analytics.subtitle")} />

            <AdminNav currentPath="/admin/analytics" />

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Spinner size="xl" />
                </div>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            label={t("analytics.totalUsers")}
                            icon={<Users />}
                            value={stats?.totalUsers || 0}
                            delta={stats?.userGrowth || 0}
                            footer="from last month"
                        />
                        <StatCard
                            label={t("analytics.activePlans")}
                            icon={<TrendUp />}
                            value={stats?.activePlans || 0}
                            delta={stats?.activePlanGrowth || 0}
                            footer="growth"
                        />
                        <StatCard
                            label={t("analytics.totalPurchases")}
                            icon={<CreditCard />}
                            value={stats?.totalPurchases || 0}
                            delta={stats?.purchaseGrowth || 0}
                            footer="this week"
                        />
                        <StatCard
                            label={t("analytics.totalRevenue")}
                            icon={<ChartBar />}
                            value={`$${stats?.revenue || 0}`}
                            delta={stats?.revenueGrowth || 0}
                            footer="increase"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                        <Card className="lg:col-span-4">
                            <CardHeader>
                                <CardTitle>{t("analytics.revenueTitle")}</CardTitle>
                                <CardDescription>{t("analytics.revenueDescription")}</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats?.chartData || []}>
                                        <defs>
                                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--wx-color-accent)" stopOpacity={0.18} />
                                                <stop offset="95%" stopColor="var(--wx-color-accent)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" {...AXIS} />
                                        <YAxis {...AXIS} tickFormatter={(value) => `$${value}`} />
                                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--wx-color-border)" }} />
                                        <Area type="monotone" dataKey="revenue" stroke="var(--wx-color-accent)" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card className="lg:col-span-3">
                            <CardHeader>
                                <CardTitle>{t("analytics.growthTitle")}</CardTitle>
                                <CardDescription>{t("analytics.growthDescription")}</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats?.chartData || []}>
                                        <XAxis dataKey="name" {...AXIS} />
                                        <YAxis {...AXIS} />
                                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--wx-color-bg-muted)" }} />
                                        <Bar dataKey="users" fill="var(--wx-color-accent)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
