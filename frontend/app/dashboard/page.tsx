"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Phone,
    Zap,
    Users,
    Timer,
    TrendingUp,
    Plus,
    Activity,
    ChevronRight,
    Loader2,
    Calendar,
    MessageSquare,
    CheckCircle2,
    XCircle,
    PhoneOff,
    Clock,
    History,
    ArrowUpRight,
    BarChart3,
    Download,
    Bot,
    Megaphone
} from "lucide-react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";
import { useSettings, formatTime } from "@/components/settings-provider";

import { useTranslations, useLocale } from "next-intl";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface SummaryItem {
    label: string;
    value: string | number;
    icon: string;
    trend: string;
}

interface ActivityItem {
    _id: string;
    leadId?: { name: string };
    agentId?: { name: string };
    status: string;
    direction?: 'inbound' | 'outbound';
    createdAt: string;
}

interface ChartData {
    name: string;
    calls: number;
}

interface DashboardData {
    summary: SummaryItem[];
    recentActivity: ActivityItem[];
    chartData: ChartData[];
    counts: {
        leads: number;
        contactedLeads: number;
        uncontactedLeads: number;
        campaigns: number;
        agents: number;
    }
}

export default function DashboardPage() {
    const t = useTranslations("dashboard");
    const locale = useLocale();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const { timeFormat } = useSettings();

    const formatStatLabel = (label: string) => {
        if (locale === "pt") {
            switch (label) {
                case "Total Calls": return "Total de Chamadas";
                case "Success Rate": return "Taxa de Sucesso";
                case "Total Leads": return "Total de Leads";
                case "Talk Time": return "Tempo de Conversação";
                default: return label;
            }
        }
        return label;
    };

    const formatStatTrend = (trend: string) => {
        if (!trend) return trend;
        if (locale === "pt") {
            if (trend === "Lifetime") return "Total histórico";
            if (trend === "Overall") return "Geral";
            if (trend === "Total") return "Total";
            if (trend.toLowerCase().includes("contacted")) {
                const count = trend.replace(/\D/g, "");
                return `${count} contatados`;
            }
        }
        return trend;
    };

    const fetchDashboardData = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/dashboard/stats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setData(response.data.data);
            }
        } catch (err: any) {
            toast.error(t("toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    const getIcon = (iconName: string) => {
        switch (iconName) {
            case 'phone': return <Phone className="h-4 w-4 text-muted-foreground" />;
            case 'zap': return <Zap className="h-4 w-4 text-muted-foreground" />;
            case 'users': return <Users className="h-4 w-4 text-muted-foreground" />;
            case 'timer': return <Timer className="h-4 w-4 text-muted-foreground" />;
            default: return <Activity className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        const labelsPt: Record<string, string> = {
            pending: "Execução Pendente",
            queued: "Na Fila",
            ringing: "Chamando...",
            "in-progress": "Em Conversa",
            completed: "Contato com Sucesso",
            failed: "Chamada Falhou",
            busy: "Linha Ocupada",
            "no-answer": "Não Atende",
            canceled: "Cancelada",
            initiated: "Iniciando...",
        };

        const getBadgeLabel = (key: string, fallback: string) => {
            return locale === "pt" ? (labelsPt[key] || fallback) : fallback;
        };

        const config = {
            pending: { label: getBadgeLabel("pending", "Pending Execution"), variant: "secondary" as const },
            queued: { label: getBadgeLabel("queued", "Queued"), variant: "secondary" as const, className: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20" },
            ringing: { label: getBadgeLabel("ringing", "Ringing..."), variant: "default" as const, className: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20 animate-pulse" },
            "in-progress": { label: getBadgeLabel("in-progress", "In Conversation"), variant: "default" as const, className: "bg-primary/10 text-primary border-primary/20" },
            completed: { label: getBadgeLabel("completed", "Contact Successful"), variant: "outline" as const, className: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400 border-green-200 dark:border-green-500/20" },
            failed: { label: getBadgeLabel("failed", "Call Failed"), variant: "destructive" as const, className: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/20" },
            busy: { label: getBadgeLabel("busy", "Line Busy"), variant: "destructive" as const, className: "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 border-orange-200 dark:border-orange-500/20" },
            "no-answer": { label: getBadgeLabel("no-answer", "No Answer"), variant: "destructive" as const, className: "bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400 border-gray-300 dark:border-gray-500/20" },
            canceled: { label: getBadgeLabel("canceled", "Canceled"), variant: "secondary" as const, className: "bg-gray-50 text-gray-500 dark:bg-gray-500/10 dark:text-gray-400 border-gray-200 dark:border-gray-500/20" },
            initiated: { label: getBadgeLabel("initiated", "Initiating..."), variant: "secondary" as const, className: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border-blue-100 dark:border-blue-500/20" },
        };

        const current = config[status as keyof typeof config] || config.pending;

        return (
            <Badge
                variant={current.variant}
                className={`text-[9px] font-black px-2 h-5 uppercase tracking-tighter ${"className" in current ? current.className : ""}`}
            >
                {current.label}
            </Badge>
        );
    };

    if (loading && !data) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">{t("title")}</h2>
                    <div className="flex items-center space-x-2">
                        <Button asChild>
                            <Link href="/campaigns">
                                <Plus className="me-2 h-4 w-4" />
                                {t("newCampaign")}
                            </Link>
                        </Button>
                    </div>
                </div>
                <Tabs defaultValue="overview" className="space-y-4">
                    <TabsContent value="overview" className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            {data.summary.map((stat, i) => (
                                <Card key={i}>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">
                                            {formatStatLabel(stat.label)}
                                        </CardTitle>
                                        {getIcon(stat.icon)}
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{stat.value}</div>
                                        <p className="text-xs text-muted-foreground">
                                            <span className="text-primary font-medium">{formatStatTrend(stat.trend)}</span>
                                        </p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                            <Card className="col-span-4">
                                <CardHeader>
                                    <CardTitle>{t("overview.title")}</CardTitle>
                                    <CardDescription>
                                        {t("overview.description")}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="ps-2">
                                    <div className="h-[350px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.chartData}>
                                                <XAxis
                                                    dataKey="name"
                                                    stroke="#888888"
                                                    fontSize={12}
                                                    tickLine={false}
                                                    axisLine={false}
                                                />
                                                <YAxis
                                                    stroke="#888888"
                                                    fontSize={12}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tickFormatter={(value) => `${value}`}
                                                />
                                                <Tooltip
                                                    cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            return (
                                                                <div className="rounded-lg border bg-background p-2 shadow-sm text-xs font-bold">
                                                                    {t("overview.callsTooltip", { count: String(payload[0].value) })}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Bar
                                                    dataKey="calls"
                                                    fill="currentColor"
                                                    radius={[4, 4, 0, 0]}
                                                    className="fill-primary"
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="col-span-3">
                                <CardHeader>
                                    <CardTitle>{t("recentActivity.title")}</CardTitle>
                                    <CardDescription>
                                        {t("recentActivity.description")}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-8">
                                        {data.recentActivity.map((log) => (
                                            <div key={log._id} className="flex items-center">
                                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                                                    <span className="text-xs font-bold">{log.leadId?.name?.charAt(0) || "?"}</span>
                                                </div>
                                                <div className="ms-4 space-y-1 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-medium leading-none">
                                                            {log.leadId?.name || t("recentActivity.systemEvent")}
                                                        </p>
                                                        {log.direction === 'inbound' && (
                                                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" title={t("recentActivity.inbound")} />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("recentActivity.withAgent", { agent: log.agentId?.name ?? "" })}
                                                    </p>
                                                </div>
                                                <div className="ms-auto flex flex-col items-end gap-1">
                                                    <StatusBadge status={log.status} />
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {formatTime(log.createdAt, timeFormat)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <Button variant="ghost" className="w-full mt-6 text-xs" asChild>
                                        <Link href="/call-logs">
                                            {t("recentActivity.viewAllLogs")}
                                            <ChevronRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                                        </Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t("counts.leads")}</CardTitle>
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{data.counts.leads}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="flex items-center gap-1">
                                            <div className="h-2 w-2 rounded-full bg-green-500" />
                                            <span className="text-[10px] text-muted-foreground">{t("counts.contacted", { count: data.counts.contactedLeads })}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="h-2 w-2 rounded-full bg-amber-500" />
                                            <span className="text-[10px] text-muted-foreground">{t("counts.uncontacted", { count: data.counts.uncontactedLeads })}</span>
                                        </div>
                                    </div>
                                    <Button variant="link" size="sm" className="px-0 h-auto text-xs mt-2" asChild>
                                        <Link href="/leads">{t("counts.manageLeads")}</Link>
                                    </Button>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t("counts.agents")}</CardTitle>
                                    <Bot className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{data.counts.agents}</div>
                                    <Button variant="link" size="sm" className="px-0 h-auto text-xs" asChild>
                                        <Link href="/agents">{t("counts.configureAgents")}</Link>
                                    </Button>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">{t("counts.campaigns")}</CardTitle>
                                    <Megaphone className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{data.counts.campaigns}</div>
                                    <Button variant="link" size="sm" className="px-0 h-auto text-xs" asChild>
                                        <Link href="/campaigns">{t("counts.reviewCampaigns")}</Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}