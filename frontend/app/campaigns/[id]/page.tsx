"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { CaretLeft, Play, CheckCircle, Clock, StopCircle, Robot, Users, Phone, Calendar, CalendarCheck, Pulse, ChatText, Brain, Microphone, Timer, Lightning, ClockCounterClockwise } from "@phosphor-icons/react";
import {
    Avatar,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    DescriptionList,
    EmptyState,
    PageHeader,
    Progress,
    Separator,
    Spinner,
    StatCard,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    toast,
    useConfirm,
} from "@wixzel/react";
import axios from "axios";
import { useSettings, formatTime } from "@/components/settings-provider";
import { agentVoiceLabel, agentVoiceProvider } from "@/components/agents/voice-engines";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface Agent {
    _id: string;
    name: string;
    systemPrompt: string;
    openingMessage: string;
    voice?: string;
    voiceId?: string;
    voiceName?: string;
    useCustomVoice?: boolean;
    voiceEngine?: string;
    sarvamSpeaker?: string;
    geminiVoice?: string;
    deepgramVoice?: string;
    outboundPhoneNumber?: { _id: string; phoneNumber: string };
}

interface Lead {
    _id: string;
    name: string;
    phone: string;
    tags: string[];
    callStatus?: "pending" | "initiated" | "queued" | "ringing" | "in-progress" | "completed" | "failed" | "busy" | "no-answer" | "canceled";
    lastCallTime?: string;
    lastCallTimestamp?: string;
    duration?: string;
}

interface CallLog {
    _id: string;
    leadId: string;
    status: string;
    duration: number;
    createdAt: string;
    transcript: { role: string; content: string; timestamp: string }[];
}

interface Campaign {
    _id: string;
    name: string;
    agentId: Agent;
    leadIds: Lead[];
    status: "idle" | "scheduled" | "running" | "completed" | "stopped";
    scheduledAt?: string | null;
    createdAt: string;
}

export default function CampaignDetailsPage() {
    const t = useTranslations("campaigns");
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const campaignId = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [callLogs, setCallLogs] = useState<CallLog[]>([]);
    const [loading, setLoading] = useState(true);
    const pollInterval = useRef<NodeJS.Timeout | null>(null);
    const [activeLeadIndex, setActiveLeadIndex] = useState<number>(-1);
    const { timeFormat } = useSettings();
    const confirm = useConfirm();

    const fetchCampaign = useCallback(async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/campaigns/${campaignId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                const { campaign: fetchedCampaign, callLogs: fetchedLogs } = response.data.data;

                // Map logs to leads: use latest log per lead for execution status (robust id comparison)
                const leadIdStr = (id: any) => (id && (typeof id === 'string' ? id : id._id)) || '';
                const enrichedLeads = fetchedCampaign.leadIds.map((lead: any) => {
                    const leadLogs = fetchedLogs
                        .filter((log: any) => leadIdStr(log.leadId) === leadIdStr(lead._id))
                        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    const leadLog = leadLogs[0];
                    if (leadLog) {
                        return {
                            ...lead,
                            callStatus: leadLog.status,
                            lastCallTime: new Date(leadLog.createdAt).toLocaleTimeString(),
                            lastCallTimestamp: leadLog.createdAt,
                            duration: leadLog.duration > 0 ? `${Math.floor(leadLog.duration / 60)}m ${leadLog.duration % 60}s` : "---",
                            logId: leadLog._id
                        };
                    }
                    return { ...lead, callStatus: "pending" };
                });

                fetchedCampaign.leadIds = enrichedLeads;
                setCampaign(fetchedCampaign);
                setCallLogs(fetchedLogs);

                // Find currently active call if any (in-progress, ringing, or queued)
                const activeLogIndex = enrichedLeads.findIndex((l: any) =>
                    ["in-progress", "ringing", "queued"].includes(l.callStatus)
                );
                setActiveLeadIndex(activeLogIndex);
            }
        } catch (err: any) {
            toast.error(t("toast.statsFailed"));
            router.push("/campaigns");
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [campaignId, router]);

    const startCampaign = async () => {
        if (!campaign) return;
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/campaigns/start`, { id: campaign._id }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.sequenceStarted"));
            fetchCampaign(false);
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.startFailed"));
        }
    };

    const stopCampaign = async () => {
        if (!campaign) return;
        if (!(await confirm({ title: "Are you sure you want to stop this campaign? This will terminate all active calls.", tone: "danger" }))) return;

        try {
            toast.loading(t("toast.stopping"), { id: "stop-campaign" });
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/campaigns/stop`, { id: campaign._id }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.stopped"), { id: "stop-campaign" });
            fetchCampaign(false);
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.stopFailed"), { id: "stop-campaign" });
        }
    };

    useEffect(() => {
        fetchCampaign();
    }, [fetchCampaign]);

    useEffect(() => {
        const hasActiveCalls = campaign?.leadIds.some(lead =>
            ["queued", "ringing", "in-progress", "initiated"].includes(lead.callStatus || "")
        );

        if (campaign?.status === "running" || campaign?.status === "scheduled" || hasActiveCalls) {
            if (!pollInterval.current) {
                pollInterval.current = setInterval(() => {
                    fetchCampaign(false);
                }, 3000);
            }
        } else {
            if (pollInterval.current) {
                clearInterval(pollInterval.current);
                pollInterval.current = null;
            }
        }
        return () => {
            if (pollInterval.current) {
                clearInterval(pollInterval.current);
                pollInterval.current = null;
            }
        };
    }, [campaign?.status, fetchCampaign]);

    if (loading && !campaign) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Spinner size="xl" className="text-fg-muted" />
            </div>
        );
    }

    if (!campaign) return null;

    const completedCount = callLogs.filter(l => l.status === "completed").length;
    const failedCount = callLogs.filter(l => ["failed", "busy", "no-answer", "canceled"].includes(l.status)).length;
    const activeCount = callLogs.filter(l => ["in-progress", "ringing"].includes(l.status)).length;

    const totalDuration = callLogs.reduce((acc, log) => acc + (log.duration || 0), 0);
    const avgDurationSeconds = callLogs.length > 0 ? totalDuration / callLogs.length : 0;
    const avgDuration = `${Math.floor(avgDurationSeconds / 60)}m ${Math.floor(avgDurationSeconds % 60)}s`;

    const totalFinished = completedCount + failedCount;
    const successRate = totalFinished > 0 ? Math.round((completedCount / totalFinished) * 100) : 0;
    const progress = campaign.leadIds.length > 0
        ? ((completedCount + failedCount) / campaign.leadIds.length) * 100
        : 0;

    const activeLead = activeLeadIndex >= 0 ? campaign.leadIds[activeLeadIndex] : null;

    return (
        <div className="flex flex-col gap-6 max-w-7xl mx-auto">
            {/* Header stays Global */}
            <div className="flex items-start gap-3 px-2">
                <Button variant="secondary" size="icon" className="mt-1 shrink-0" onClick={() => router.push("/campaigns")}>
                    <CaretLeft className="rtl:rotate-180" />
                </Button>
                <PageHeader
                    className="min-w-0 flex-1"
                    title={
                        <>
                            {campaign.name}
                            <StatusBadge status={campaign.status} />
                        </>
                    }
                    description={
                        <span className="flex items-center gap-1.5">
                            <Calendar className="size-3.5" />
                            {t("detail.createdOn", { date: new Date(campaign.createdAt).toLocaleDateString() })}
                        </span>
                    }
                    actions={
                        campaign.status === "running" ? (
                            <Button variant="danger" iconStart={<StopCircle />} onClick={stopCampaign}>
                                {t("detail.stop")}
                            </Button>
                        ) : campaign.status === "scheduled" ? (
                            <span className="flex items-center gap-2 text-body-sm text-fg-muted">
                                <CalendarCheck className="size-4" />
                                {t("detail.scheduledFor", { date: campaign.scheduledAt
                                    ? new Date(campaign.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                                    : "—" })}
                            </span>
                        ) : (
                            <Button
                                variant="primary"
                                iconStart={<Play />}
                                disabled={campaign.status === "completed"}
                                onClick={startCampaign}
                            >
                                {t("detail.start")}
                            </Button>
                        )
                    }
                />
            </div>

            {/* Performance Stats stays Global */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 px-2">
                <StatCard label={t("detail.totalLeads")} icon={<Users />} value={campaign.leadIds.length} />
                <StatCard label={t("detail.completed")} icon={<CheckCircle />} value={completedCount} />
                <StatCard label={t("detail.avgDuration")} icon={<Timer />} value={avgDuration} />
                <StatCard label={t("detail.successRate")} icon={<Lightning />} value={`${successRate}%`} />
            </div>

            {/* Main Content Reorganized into Tabs */}
            <Tabs defaultValue="activity" className="w-full">
                <TabsList className="px-2">
                    <TabsTrigger value="activity">
                        <Pulse />
                        {t("detail.tabs.activity")}
                    </TabsTrigger>
                    <TabsTrigger value="roster">
                        <Users />
                        {t("detail.tabs.leads")}
                    </TabsTrigger>
                    <TabsTrigger value="protocol">
                        <Robot />
                        {t("detail.tabs.agent")}
                    </TabsTrigger>
                </TabsList>

                {/* Tab: Live Pulse */}
                <TabsContent value="activity">
                    <div className="grid gap-6 lg:grid-cols-2 px-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Pulse className={`size-4 ${campaign.status === "running" ? "text-accent-ink" : "text-fg-muted"}`} />
                                    {t("detail.activity.title")}
                                </CardTitle>
                                <CardDescription>{t("detail.activity.description")}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-6">
                                {activeLead ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex items-center gap-3 rounded-md bg-surface p-4">
                                            <Avatar name={activeLead.name} size="lg" />
                                            <div className="min-w-0">
                                                <p className="text-caption font-medium text-fg-subtle">{t("detail.activity.activeCall")}</p>
                                                <p className="truncate text-heading-sm">{activeLead.name}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex flex-col items-center justify-center gap-1.5 rounded-md bg-surface p-3 text-center">
                                                <span className="text-caption font-medium text-fg-subtle">{t("detail.activity.status")}</span>
                                                <Badge
                                                    tone={activeLead.callStatus === "in-progress" ? "accent" : activeLead.callStatus === "ringing" ? "warning" : "neutral"}
                                                    pulse={activeLead.callStatus === "in-progress" || activeLead.callStatus === "ringing"}
                                                >
                                                    <Microphone />
                                                    {activeLead.callStatus === "in-progress" ? t("detail.activity.talking") :
                                                        activeLead.callStatus === "ringing" ? t("detail.activity.ringing") : t("detail.activity.queued")}
                                                </Badge>
                                            </div>
                                            <div className="flex flex-col items-center justify-center gap-1.5 rounded-md bg-surface p-3 text-center">
                                                <span className="text-caption font-medium text-fg-subtle">{t("detail.activity.queue")}</span>
                                                <span className="text-body-sm font-semibold">{t("detail.activity.live")}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <EmptyState
                                        icon={<Lightning />}
                                        title={t("detail.activity.emptyTitle")}
                                        description={t("detail.activity.emptyDescription")}
                                    />
                                )}

                                <Separator />

                                <div className="flex flex-col gap-2">
                                    <Progress
                                        value={progress}
                                        label={t("detail.activity.completion")}
                                        showValue
                                    />
                                    <div className="flex justify-between text-caption tabular-nums text-fg-muted">
                                        <span>{t("detail.activity.processed", { count: completedCount + failedCount })}</span>
                                        <span>{t("detail.activity.remaining", { count: campaign.leadIds.length - (completedCount + failedCount) })}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Recent Alerts or Mini Logs could go here in future */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <ClockCounterClockwise className="size-4 text-fg-muted" />
                                    {t("detail.summary.title")}
                                </CardTitle>
                                <CardDescription>{t("detail.summary.description")}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <DescriptionList
                                    items={[
                                        { term: t("detail.summary.handledBy"), value: campaign.agentId?.name },
                                        {
                                            term: t("detail.summary.voiceEngine"),
                                            value: (
                                                <span className="inline-flex items-center gap-1.5">
                                                    {campaign.agentId?.useCustomVoice ? (
                                                        <>
                                                            <Lightning className="size-3.5 text-accent-ink" />
                                                            {agentVoiceProvider(campaign.agentId)}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Pulse className="size-3.5 text-fg-subtle" />
                                                            {t("detail.summary.standard")}
                                                        </>
                                                    )}
                                                </span>
                                            ),
                                        },
                                        {
                                            term: t("detail.summary.personaVoice"),
                                            icon: <Microphone />,
                                            value: agentVoiceLabel(campaign.agentId),
                                        },
                                        { term: t("detail.summary.totalCalls"), value: callLogs.length },
                                        { term: t("detail.summary.avgPulse"), value: avgDuration },
                                    ]}
                                />
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Tab: Campaign Roster */}
                <TabsContent value="roster">
                    <div className="px-2">
                        <Card>
                            <CardHeader>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex flex-col gap-1">
                                        <CardTitle>{t("detail.contacts.title")}</CardTitle>
                                        <CardDescription>{t("detail.contacts.description")}</CardDescription>
                                    </div>
                                    <Badge>
                                        {t("detail.contacts.totalTargets", { count: campaign.leadIds.length })}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="px-0 pb-2">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="first:ps-5">{t("detail.contacts.leadProfile")}</TableHead>
                                            <TableHead>{t("detail.contacts.executionStatus")}</TableHead>
                                            <TableHead className="last:pe-5">{t("detail.contacts.callMetrics")}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {campaign.leadIds.map((lead) => (
                                            <TableRow key={lead._id}>
                                                <TableCell className="py-2.5 first:ps-5">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar name={lead.name} size="md" />
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium">{lead.name}</p>
                                                            <p className="flex items-center gap-1 text-caption text-fg-muted">
                                                                <Phone className="size-3 text-fg-subtle" />
                                                                <span className="ltr-data">{lead.phone}</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <LeadStatusBadge status={lead.callStatus || "pending"} />
                                                </TableCell>
                                                <TableCell className="last:pe-5">
                                                    <div className="flex flex-col gap-0.5 select-none">
                                                        {lead.lastCallTimestamp ? (
                                                            <>
                                                                <div className="flex items-center gap-1.5 text-body-sm font-medium">
                                                                    <Clock className="size-3.5 text-fg-subtle" />
                                                                    {formatTime(lead.lastCallTimestamp, timeFormat)}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-caption text-fg-muted">
                                                                    <Timer className="size-3 text-fg-subtle" />
                                                                    {lead.duration}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <span className="text-caption italic text-fg-subtle">{t("detail.contacts.waiting")}</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Tab: Agent Details */}
                <TabsContent value="protocol">
                    <div className="grid gap-6 lg:grid-cols-2 px-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Robot className="size-5 text-fg-muted" />
                                    {t("detail.agent.title")}
                                </CardTitle>
                                <CardDescription>{t("detail.agent.description")}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-6">
                                <div className="flex flex-col gap-2">
                                    <p className="text-caption font-medium text-fg-subtle">{t("detail.agent.selected")}</p>
                                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface p-4">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                                <Robot className="size-5" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-body-md font-semibold">{campaign.agentId?.name || "N/A"}</p>
                                                <p className="flex items-center gap-1 text-caption text-fg-muted">
                                                    <Phone className="size-3" />
                                                    {campaign.agentId?.outboundPhoneNumber?.phoneNumber || "No outbound number set"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <Badge tone={campaign.agentId?.useCustomVoice ? "accent" : "neutral"}>
                                                {campaign.agentId?.useCustomVoice ? 'Premium Voice' : 'Standard Voice'}
                                            </Badge>
                                            <Badge appearance="outline">
                                                <Microphone />
                                                {agentVoiceLabel(campaign.agentId)}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <p className="flex items-center gap-1.5 text-caption font-medium text-fg-subtle">
                                        <ChatText className="size-3.5" /> {t("detail.agent.openingMessage")}
                                    </p>
                                    <div className="rounded-md bg-surface p-5 text-body-md italic leading-relaxed text-fg">
                                        &quot;{renderVariableHighlight(campaign.agentId?.openingMessage)}&quot;
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Brain className="size-5 text-fg-muted" />
                                    {t("detail.agent.instructions")}
                                </CardTitle>
                                <CardDescription>{t("detail.agent.instructionsHint")}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <div className="h-[400px] w-full overflow-y-auto rounded-md bg-surface p-5">
                                    <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-fg-muted">
                                        {campaign.agentId?.systemPrompt}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

// Helpers
// -------

function renderVariableHighlight(text: string | undefined): ReactNode {
    if (!text) return "";
    const parts = text.split(/(\{\{[^{}]+\}\})/g);
    return parts.map((part, i) => {
        if (part.startsWith("{{") && part.endsWith("}}")) {
            return (
                <span key={i} className="rounded-xs bg-accent-subtle px-1 font-mono text-[0.9em] font-medium not-italic text-accent-ink">
                    {part}
                </span>
            );
        }
        return part;
    });
}

function StatusBadge({ status }: { status: Campaign["status"] }) {
    const tones = {
        idle: "neutral",
        scheduled: "warning",
        running: "info",
        completed: "success",
        stopped: "danger",
    } as const;

    // A running campaign pulses instead of showing an icon: it is live.
    const icons = {
        idle: <Clock />,
        scheduled: <CalendarCheck />,
        running: null,
        completed: <CheckCircle />,
        stopped: <StopCircle />,
    };

    return (
        <Badge tone={tones[status]} pulse={status === "running"} className="capitalize">
            {icons[status]}
            {status}
        </Badge>
    );
}

function LeadStatusBadge({ status }: { status: Lead["callStatus"] }) {
    type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
    const config: Record<string, { label: string; tone: Tone; pulse?: boolean }> = {
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

    const style = config[status as string] || config.pending;

    return (
        <Badge tone={style.tone} pulse={style.pulse} dot={!style.pulse}>
            {style.label}
        </Badge>
    );
}
