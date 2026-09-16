"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ChevronLeft,
    Play,
    Loader2,
    CheckCircle2,
    Clock,
    StopCircle,
    Bot,
    Users,
    Phone,
    Calendar,
    CalendarClock,
    Activity,
    MessageSquare,
    Brain,
    Mic2,
    Timer,
    Zap,
    History,
    LayoutDashboard,
    FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import axios from "axios";
import { toast } from "sonner";
import { useSettings, formatTime } from "@/components/settings-provider";
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
        if (!window.confirm("Are you sure you want to stop this campaign? This will terminate all active calls.")) return;

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
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header stays Global */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => router.push("/campaigns")}>
                        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-bold">{campaign.name}</h1>
                            <StatusBadge status={campaign.status} />
                        </div>
                        <p className="text-muted-foreground text-sm flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {t("detail.createdOn", { date: new Date(campaign.createdAt).toLocaleDateString() })}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {campaign.status === "running" ? (
                        <Button variant="destructive" onClick={stopCampaign}>
                            <StopCircle className="me-2 h-4 w-4" />
                            {t("detail.stop")}
                        </Button>
                    ) : campaign.status === "scheduled" ? (
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <CalendarClock className="h-4 w-4" />
                            {t("detail.scheduledFor", { date: campaign.scheduledAt
                                ? new Date(campaign.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                                : "—" })}
                        </span>
                    ) : (
                        <Button
                            disabled={campaign.status === "completed"}
                            onClick={startCampaign}
                        >
                            <Play className="me-2 h-4 w-4 fill-current" />
                            {t("detail.start")}
                        </Button>
                    )}
                </div>
            </div>

            {/* Performance Stats stays Global */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 px-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t("detail.totalLeads")}</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{campaign.leadIds.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t("detail.completed")}</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{completedCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t("detail.avgDuration")}</CardTitle>
                        <Timer className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{avgDuration}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t("detail.successRate")}</CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{successRate}%</div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Reorganized into Tabs */}
            <Tabs defaultValue="activity" className="w-full">
                <TabsList className="bg-muted/50 p-1">
                    <TabsTrigger value="activity" className="gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider">
                        <Activity className="h-3.5 w-3.5" />
                        {t("detail.tabs.activity")}
                    </TabsTrigger>
                    <TabsTrigger value="roster" className="gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider">
                        <Users className="h-3.5 w-3.5" />
                        {t("detail.tabs.leads")}
                    </TabsTrigger>
                    <TabsTrigger value="protocol" className="gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider">
                        <Bot className="h-3.5 w-3.5" />
                        {t("detail.tabs.agent")}
                    </TabsTrigger>
                </TabsList>

                {/* Tab: Live Activity */}
                <TabsContent value="activity">
                    <div className="grid gap-6 lg:grid-cols-2 px-2">
                        <Card className={campaign.status === "running" ? "border-primary/50 ring-1 ring-primary/20" : ""}>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Activity className={`h-4 w-4 ${campaign.status === "running" ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                                    {t("detail.activity.title")}
                                </CardTitle>
                                <CardDescription>{t("detail.activity.description")}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6 py-6">
                                {activeLeadIndex >= 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border-2">
                                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg uppercase">
                                                {campaign.leadIds[activeLeadIndex].name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{t("detail.activity.activeCall")}</p>
                                                <p className="text-lg font-bold">{campaign.leadIds[activeLeadIndex].name}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 border rounded-xl bg-muted/20 text-center">
                                                <span className="text-[10px] text-muted-foreground block uppercase font-black mb-1">{t("detail.activity.status")}</span>
                                                <span className="text-sm font-bold flex items-center justify-center gap-1.5 capitalize">
                                                    <Mic2 className={`h-4 w-4 ${campaign.leadIds[activeLeadIndex].callStatus === "in-progress" ? "text-red-500 animate-pulse" : "text-muted-foreground"}`} />
                                                    {campaign.leadIds[activeLeadIndex].callStatus === "in-progress" ? t("detail.activity.talking") :
                                                        campaign.leadIds[activeLeadIndex].callStatus === "ringing" ? t("detail.activity.ringing") : t("detail.activity.queued")}
                                                </span>
                                            </div>
                                            <div className="p-3 border rounded-xl bg-muted/20 text-center">
                                                <span className="text-[10px] text-muted-foreground block uppercase font-black mb-1">{t("detail.activity.queue")}</span>
                                                <span className="text-sm font-bold">{t("detail.activity.live")}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground opacity-40 border-2 border-dashed rounded-xl">
                                        <Zap className="h-12 w-12 mb-4" />
                                        <p className="text-lg font-bold uppercase tracking-wider">{t("detail.activity.emptyTitle")}</p>
                                        <p className="text-sm">{t("detail.activity.emptyDescription")}</p>
                                    </div>
                                )}

                                <Separator />

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs font-black uppercase text-muted-foreground tracking-widest">
                                        <span>{t("detail.activity.completion")}</span>
                                        <span className="text-primary">{Math.round(progress)}%</span>
                                    </div>
                                    <Progress value={progress} className="h-3" />
                                    <div className="flex justify-between text-[11px] font-bold text-muted-foreground">
                                        <span>{t("detail.activity.processed", { count: completedCount + failedCount })}</span>
                                        <span>{t("detail.activity.remaining", { count: campaign.leadIds.length - (completedCount + failedCount) })}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Recent Alerts or Mini Logs could go here in future */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <History className="h-4 w-4 text-muted-foreground" />
                                    {t("detail.summary.title")}
                                </CardTitle>
                                <CardDescription>{t("detail.summary.description")}</CardDescription>
                            </CardHeader>
                            <CardContent className="py-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{t("detail.summary.handledBy")}</p>
                                        <p className="text-sm font-bold">{campaign.agentId?.name}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{t("detail.summary.voiceEngine")}</p>
                                        <div className="flex items-center gap-1.5">
                                            {campaign.agentId?.useCustomVoice ? (
                                                <>
                                                    <Zap className="h-3 w-3 text-primary" />
                                                    <p className="text-sm font-bold">{t("detail.summary.elevenLabs")}</p>
                                                </>
                                            ) : (
                                                <>
                                                    <Activity className="h-3 w-3 text-muted-foreground" />
                                                    <p className="text-sm font-bold">{t("detail.summary.standard")}</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{t("detail.summary.personaVoice")}</p>
                                        <div className="flex items-center gap-1.5">
                                            <Mic2 className="h-3 w-3 text-muted-foreground" />
                                            <p className="text-sm font-bold truncate max-w-[120px]">
                                                {campaign.agentId?.useCustomVoice
                                                    ? (campaign.agentId?.voiceName || campaign.agentId?.voiceId || "Rachel")
                                                    : (campaign.agentId?.voice?.replace("Polly.", "") || "Amy")}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{t("detail.summary.totalCalls")}</p>
                                        <p className="text-sm font-bold">{callLogs.length}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{t("detail.summary.avgPulse")}</p>
                                        <p className="text-sm font-bold">{avgDuration}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Tab: Campaign Roster */}
                <TabsContent value="roster">
                    <div className="px-2">
                        <Card className="min-h-[500px]">
                            <CardHeader className="border-b bg-muted/10 py-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-lg">{t("detail.contacts.title")}</CardTitle>
                                        <CardDescription>{t("detail.contacts.description")}</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="font-bold">
                                            {t("detail.contacts.totalTargets", { count: campaign.leadIds.length })}
                                        </Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="ps-6 uppercase text-[10px] font-black tracking-wider py-4">{t("detail.contacts.leadProfile")}</TableHead>
                                            <TableHead className="uppercase text-[10px] font-black tracking-wider py-4">{t("detail.contacts.executionStatus")}</TableHead>
                                            <TableHead className="uppercase text-[10px] font-black tracking-wider py-4">{t("detail.contacts.callMetrics")}</TableHead>

                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {campaign.leadIds.map((lead) => (
                                            <TableRow key={lead._id} className="group h-16">
                                                <TableCell className="ps-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs uppercase border">
                                                            {lead.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-sm tracking-tight">{lead.name}</p>
                                                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                                                                <Phone className="h-3 w-3 opacity-50" />
                                                                <span className="ltr-data">{lead.phone}</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <LeadStatusBadge status={lead.callStatus || "pending"} />
                                                </TableCell>
                                                <TableCell>
                                                    <div
                                                        className="space-y-0.5 select-none"
                                                    >
                                                        {lead.lastCallTimestamp ? (
                                                            <>
                                                                <div className="flex items-center gap-1.5 text-xs font-bold">
                                                                    <Clock className="h-3.5 w-3.5 opacity-40" />
                                                                    {formatTime(lead.lastCallTimestamp, timeFormat)}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                                                                    <Timer className="h-3 w-3 opacity-40" />
                                                                    {lead.duration}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <span className="text-[10px] text-muted-foreground/30 font-black italic tracking-wider">{t("detail.contacts.waiting")}</span>
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
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Bot className="h-5 w-5 text-primary" />
                                        {t("detail.agent.title")}
                                    </CardTitle>
                                    <CardDescription>{t("detail.agent.description")}</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pb-8">
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("detail.agent.selected")}</p>
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <Bot className="h-6 w-6" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-base">{campaign.agentId?.name || "N/A"}</p>
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                        <Phone className="h-3 w-3" />
                                                        {campaign.agentId?.outboundPhoneNumber?.phoneNumber || "No outbound number set"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <Badge variant="secondary" className="font-medium">
                                                    {campaign.agentId?.useCustomVoice ? 'Premium Voice' : 'Standard Voice'}
                                                </Badge>
                                                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-white px-2 py-1 rounded-md border shadow-sm">
                                                    <Mic2 className="h-3 w-3 text-primary" />
                                                    {campaign.agentId?.useCustomVoice ? (campaign.agentId?.voiceName || campaign.agentId?.voiceId || 'Rachel') : (campaign.agentId?.voice || 'Polly.Amy')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <MessageSquare className="h-3.5 w-3.5" /> {t("detail.agent.openingMessage")}
                                        </p>
                                        <div className="relative group">
                                            <div className="p-5 text-base rounded-xl bg-primary/5 border italic text-foreground/80 leading-relaxed shadow-sm">
                                                &quot;{renderVariableHighlight(campaign.agentId?.openingMessage)}&quot;
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-6">
                            <Card className="h-full flex flex-col">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Brain className="h-5 w-5 text-primary" />
                                            {t("detail.agent.instructions")}
                                        </CardTitle>
                                    </div>
                                    <CardDescription>{t("detail.agent.instructionsHint")}</CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1 pb-6">
                                    <ScrollArea className="h-[400px] w-full rounded-xl border bg-muted/10 p-6">
                                        <div className="prose prose-sm max-w-none text-muted-foreground">
                                            <p className="whitespace-pre-wrap leading-relaxed">
                                                {campaign.agentId?.systemPrompt}
                                            </p>
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                        </div>
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
                <span key={i} className="text-primary font-black decoration-primary/40 decoration-2 underline underline-offset-4 bg-primary/5 px-0.5 rounded">
                    {part}
                </span>
            );
        }
        return part;
    });
}

function StatusBadge({ status }: { status: Campaign["status"] }) {
    const variants = {
        idle: "secondary",
        scheduled: "outline",
        running: "default",
        completed: "outline",
        stopped: "destructive",
    } as const;

    const icons = {
        idle: <Clock className="me-1.5 h-3.5 w-3.5" />,
        scheduled: <CalendarClock className="me-1.5 h-3.5 w-3.5" />,
        running: <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />,
        completed: <CheckCircle2 className="me-1.5 h-3.5 w-3.5" />,
        stopped: <StopCircle className="me-1.5 h-3.5 w-3.5" />,
    };

    return (
        <Badge variant={variants[status]} className="capitalize flex items-center h-7 px-3 font-bold">
            {icons[status]}
            {status}
        </Badge>
    );
}

function LeadStatusBadge({ status }: { status: Lead["callStatus"] }) {
    const config = {
        pending: { label: "Pending Execution", variant: "secondary" as const },
        queued: { label: "Queued", variant: "secondary" as const, className: "bg-blue-50 text-blue-700 border-blue-200" },
        ringing: { label: "Ringing...", variant: "default" as const, className: "bg-amber-50 text-amber-700 border-amber-200 animate-pulse" },
        "in-progress": { label: "In Conversation", variant: "default" as const, className: "bg-primary/10 text-primary border-primary/20" },
        completed: { label: "Contact Successful", variant: "outline" as const, className: "bg-green-50 text-green-700 border-green-200" },
        failed: { label: "Call Failed", variant: "destructive" as const, className: "bg-red-50 text-red-700 border-red-200" },
        busy: { label: "Line Busy", variant: "destructive" as const, className: "bg-orange-50 text-orange-700 border-orange-200" },
        "no-answer": { label: "No Answer", variant: "destructive" as const, className: "bg-gray-100 text-gray-700 border-gray-300" },
        canceled: { label: "Canceled", variant: "secondary" as const, className: "bg-gray-50 text-gray-500 border-gray-200" },
        initiated: { label: "Initiating...", variant: "secondary" as const, className: "bg-blue-50 text-blue-600 border-blue-100" },
    };

    const style = config[status as keyof typeof config] || config.pending;

    return (
        <Badge
            variant={style.variant}
            className={`text-[9px] font-black px-2 h-5 uppercase tracking-tighter ${"className" in style ? style.className : ""}`}
        >
            {style.label}
        </Badge>
    );
}
