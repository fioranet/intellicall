"use client";

import { useEffect, useState, useCallback } from "react";
import { Phone, Lightning, Users, Timer, Plus, Pulse, CaretRight, Robot, Megaphone } from "@phosphor-icons/react";
import {
    Avatar,
    Badge,
    type BadgeProps,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    PageHeader,
    Skeleton,
    StatCard,
    toast,
} from "@wixzel/react";
import Link from "next/link";
import axios from "axios";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { useSettings, formatTime } from "@/components/settings-provider";

import { useTranslations } from "next-intl";
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

/** Call statuses as Badge tones. Live states (ringing, in conversation) pulse. */
const CALL_STATUS: Record<string, { label: string; tone: BadgeProps["tone"]; pulse?: boolean }> = {
    pending: { label: "Pending Execution", tone: "neutral" },
    queued: { label: "Queued", tone: "info" },
    ringing: { label: "Ringing...", tone: "warning", pulse: true },
    "in-progress": { label: "In Conversation", tone: "accent", pulse: true },
    completed: { label: "Contact Successful", tone: "success" },
    failed: { label: "Call Failed", tone: "danger" },
    busy: { label: "Line Busy", tone: "warning" },
    "no-answer": { label: "No Answer", tone: "neutral" },
    canceled: { label: "Canceled", tone: "neutral" },
    initiated: { label: "Initiating...", tone: "info" },
};

const StatusBadge = ({ status }: { status: string }) => {
    const current = CALL_STATUS[status] || CALL_STATUS.pending;
    return (
        <Badge tone={current.tone} dot pulse={current.pulse}>
            {current.label}
        </Badge>
    );
};

export default function DashboardPage() {
    const t = useTranslations("dashboard");
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const { timeFormat } = useSettings();

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
            case 'phone': return <Phone />;
            case 'zap': return <Lightning />;
            case 'users': return <Users />;
            case 'timer': return <Timer />;
            default: return <Pulse />;
        }
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col gap-6" aria-busy>
                <Skeleton className="h-9 w-48" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 rounded-lg" />
                    ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-7">
                    <Skeleton className="h-[440px] rounded-lg lg:col-span-4" />
                    <Skeleton className="h-[440px] rounded-lg lg:col-span-3" />
                </div>
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                actions={
                    <Button variant="primary" iconStart={<Plus />} asChild>
                        <Link href="/campaigns">{t("newCampaign")}</Link>
                    </Button>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {data.summary.map((stat, i) => (
                    <StatCard
                        key={i}
                        label={stat.label}
                        icon={getIcon(stat.icon)}
                        value={stat.value}
                        footer={<span className="font-medium text-accent-ink">{stat.trend}</span>}
                    />
                ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-7">
                <Card className="lg:col-span-4">
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
                                    <CartesianGrid vertical={false} stroke="var(--wx-color-border)" />
                                    <XAxis
                                        dataKey="name"
                                        stroke="var(--wx-color-fg-subtle)"
                                        tick={{ fill: "var(--wx-color-fg-subtle)" }}
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="var(--wx-color-fg-subtle)"
                                        tick={{ fill: "var(--wx-color-fg-subtle)" }}
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value}`}
                                    />
                                    <Tooltip
                                        cursor={{ fill: "var(--wx-color-bg-muted)" }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="rounded-md bg-surface-overlay px-2.5 py-1.5 text-caption font-medium tabular-nums shadow-md">
                                                        {t("overview.callsTooltip", { count: String(payload[0].value) })}
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar
                                        dataKey="calls"
                                        fill="var(--wx-color-accent)"
                                        radius={[4, 4, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>{t("recentActivity.title")}</CardTitle>
                        <CardDescription>
                            {t("recentActivity.description")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                        <ul className="divide-y divide-border">
                            {data.recentActivity.map((log) => (
                                <li key={log._id} className="flex items-center gap-3 py-3 first:pt-0">
                                    <Avatar name={log.leadId?.name || "?"} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-body-sm font-medium">
                                                {log.leadId?.name || t("recentActivity.systemEvent")}
                                            </p>
                                            {log.direction === 'inbound' && (
                                                <span className="size-1.5 shrink-0 rounded-full bg-info" title={t("recentActivity.inbound")} />
                                            )}
                                        </div>
                                        <p className="truncate text-caption text-fg-muted">
                                            {t("recentActivity.withAgent", { agent: log.agentId?.name ?? "" })}
                                        </p>
                                    </div>
                                    <div className="ms-auto flex flex-col items-end gap-1">
                                        <StatusBadge status={log.status} />
                                        <span className="text-caption tabular-nums text-fg-subtle">
                                            {formatTime(log.createdAt, timeFormat)}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <Button variant="ghost" block className="mt-auto" iconEnd={<CaretRight />} asChild>
                            <Link href="/call-logs">{t("recentActivity.viewAllLogs")}</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    label={t("counts.leads")}
                    icon={<Users />}
                    value={data.counts.leads}
                    footer={
                        <div className="flex flex-col items-start gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge tone="success" dot>{t("counts.contacted", { count: data.counts.contactedLeads })}</Badge>
                                <Badge tone="warning" dot>{t("counts.uncontacted", { count: data.counts.uncontactedLeads })}</Badge>
                            </div>
                            <Button variant="link" size="sm" asChild>
                                <Link href="/leads">{t("counts.manageLeads")}</Link>
                            </Button>
                        </div>
                    }
                />
                <StatCard
                    label={t("counts.agents")}
                    icon={<Robot />}
                    value={data.counts.agents}
                    footer={
                        <Button variant="link" size="sm" asChild>
                            <Link href="/agents">{t("counts.configureAgents")}</Link>
                        </Button>
                    }
                />
                <StatCard
                    label={t("counts.campaigns")}
                    icon={<Megaphone />}
                    value={data.counts.campaigns}
                    footer={
                        <Button variant="link" size="sm" asChild>
                            <Link href="/campaigns">{t("counts.reviewCampaigns")}</Link>
                        </Button>
                    }
                />
            </div>
        </div>
    );
}
