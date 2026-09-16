"use client";

import { useTranslations } from "next-intl";
import {
    BarChart3,
    TrendingUp,
    Users,
    CreditCard,
    ArrowUpRight,
    ArrowDownRight,
    Loader2
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    AreaChart,
    Area
} from "recharts";
import { AdminNav } from "@/components/admin/nav";
import { useEffect, useState } from "react";
import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

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

    const renderGrowth = (value: number, label: string) => {
        const isPositive = value >= 0;
        const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
        const colorClass = isPositive ? "text-green-500" : "text-red-500";

        return (
            <p className={`text-xs ${colorClass} font-bold flex items-center gap-1 mt-1`}>
                <Icon className="h-3 w-3" /> {isPositive ? '+' : ''}{value}% {label}
            </p>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora">{t("analytics.title")}</h1>
                    <p className="text-muted-foreground">{t("analytics.subtitle")}</p>
                </div>
            </div>

            <AdminNav currentPath="/admin/analytics" />

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card className="rounded-2xl border-border shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t("analytics.totalUsers")}</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
                                {renderGrowth(stats?.userGrowth || 0, "from last month")}
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl border-border shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t("analytics.activePlans")}</CardTitle>
                                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats?.activePlans || 0}</div>
                                {renderGrowth(stats?.activePlanGrowth || 0, "growth")}
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl border-border shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t("analytics.totalPurchases")}</CardTitle>
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold font-mono italic text-primary">{stats?.totalPurchases || 0}</div>
                                {renderGrowth(stats?.purchaseGrowth || 0, "this week")}
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl border-border shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t("analytics.totalRevenue")}</CardTitle>
                                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold font-mono italic text-foreground">${stats?.revenue || 0}</div>
                                {renderGrowth(stats?.revenueGrowth || 0, "increase")}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                        <Card className="col-span-4 rounded-2xl border-border shadow-sm">
                            <CardHeader>
                                <CardTitle>{t("analytics.revenueTitle")}</CardTitle>
                                <CardDescription>{t("analytics.revenueDescription")}</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px] w-full pt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats?.chartData || []}>
                                        <defs>
                                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                        <Tooltip />
                                        <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card className="col-span-3 rounded-2xl border-border shadow-sm">
                            <CardHeader>
                                <CardTitle>{t("analytics.growthTitle")}</CardTitle>
                                <CardDescription>{t("analytics.growthDescription")}</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px] w-full pt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats?.chartData || []}>
                                        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                        <Bar dataKey="users" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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
