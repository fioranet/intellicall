"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useCallback } from "react";
import {
    Phone,
    Clock,
    Timer,
    Calendar,
    Search,
    Bot,
    User,
    MessageSquare,
    Loader2,
    Filter,
    Mic,
    CheckCircle2,
    XCircle,
    PhoneOff,
    Brain,
    Activity,
    History,
    RefreshCw,
    Download,
    Play,
    AlertTriangle,
    PhoneForwarded,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import axios from "axios";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import Papa from "papaparse";
import { ModernAudioPlayer } from "@/components/ui/modern-audio-player";
import { useSettings, formatTime } from "@/components/settings-provider";
import { cn } from "@/lib/utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const formatDate = (isoString: string) => {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric'
    }).format(new Date(isoString));
};



/** The CallLog transfers.status enum. Anything outside it is shown raw rather than
 *  asking next-intl for a key that does not exist. */
const TRANSFER_STATUSES = ["ringing", "connected", "completed", "busy", "no_answer", "rejected", "unavailable", "failed"];

/** Transfer durations arrive in ms; show them the way a human reads a call timer. */
const formatTransferMs = (ms?: number) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms} ms`;
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
};

interface TranscriptItem {
    role: "system" | "assistant" | "user";
    content: string;
    timestamp: string;
}

interface CallLog {
    _id: string;
    campaignId?: { _id: string; name: string };
    leadId: { _id: string; name: string; phone: string };
    agentId: { _id: string; name: string; outboundPhoneNumber?: { phoneNumber: string } };
    status: string;
    duration: number;
    createdAt: string;
    direction?: 'inbound' | 'outbound';
    transcript: TranscriptItem[];
    recordingUrl?: string;
    summary?: string;
    errors?: {
        service: 'elevenlabs' | 'deepgram' | 'openrouter' | 'twilio' | 'sarvam' | 'gemini' | 'system';
        code: string;
        message: string;
        timestamp: string;
    }[];
    /** Human Transfer attempts on this call. Absent on every call that never tried one. */
    transfers?: {
        _id?: string;
        attemptId: string;
        destinationId?: string;
        destinationName?: string;
        reason?: string;
        status: string;
        attempt?: number;
        ringDurationMs?: number;
        connectedDurationMs?: number;
        failureCode?: string;
        sipCause?: number | null;
    }[];
    voiceMetrics?: {
        turns?: number;
        interruptions?: number;
        falseVadEvents?: number;
        rtpQueueDrops?: number;
        ttsChunksSent?: number;
        avgLlmFirstTokenMs?: number;
        avgTtsFirstTextMs?: number;
        avgFirstAudioMs?: number;
        maxFirstAudioMs?: number;
    };
    analysis?: {
        isQualified: boolean;
        qualificationScore: number;
        reason: string;
        budget: string;
        timeline: string;
        nextSteps: string;
        aiOpinion: string;
    };
}

export default function CallLogsPage() {
    const t = useTranslations("calls");
    const [logs, setLogs] = useState<CallLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
    const [qualificationFilter, setQualificationFilter] = useState<string>("all");
    const [directionFilter, setDirectionFilter] = useState<string>("all");
    const [campaigns, setCampaigns] = useState<{ _id: string; name: string }[]>([]);
    const transferStatusLabel = (status: string) =>
        TRANSFER_STATUSES.includes(status) ? t(`detail.transfers.status.${status}`) : status;

    const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const { timeFormat } = useSettings();

    const fetchCampaigns = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/campaigns`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setCampaigns(response.data.data.campaigns || []);
            }
        } catch (err: any) {
            console.error("Failed to fetch campaigns", err);
        }
    }, []);

    const analyzeCall = async (id: string) => {
        try {
            setAnalyzing(true);
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/call-logs/${id}/analyze`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                const updatedLog = { ...selectedLog, ...response.data.data } as CallLog;
                setSelectedLog(updatedLog);
                setLogs(prev => prev.map(log => log._id === id ? updatedLog : log));
                toast.success(t("toast.analysisComplete"));
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.analysisFailed"));
        } finally {
            setAnalyzing(false);
        }
    };
    const fetchLogs = useCallback(async (manual = false) => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/call-logs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setLogs(response.data.data.logs);
                if (manual) toast.success(t("toast.updated"));
            }
        } catch (err: any) {
            toast.error(t("toast.fetchFailed"));
        } finally {
            setLoading(false);
        }
    }, []);

    const exportToCSV = () => {
        if (filteredLogs.length === 0) {
            toast.error(t("toast.noExportData"));
            return;
        }

        const dataToExport = filteredLogs.map(log => ({
            Date: formatDate(log.createdAt),
            Time: formatTime(log.createdAt, timeFormat),
            LeadName: log.leadId?.name || "Unknown",
            LeadPhone: log.leadId?.phone || "N/A",
            Agent: log.agentId?.name || "N/A",
            Direction: log.direction || "outbound",
            Campaign: log.campaignId?.name || "One-off Call",
            Status: log.status,
            DurationSeconds: log.duration,
            AIScore: log.analysis ? `${log.analysis.qualificationScore}%` : (['no-answer', 'failed', 'busy', 'canceled'].includes(log.status) ? "0%" : "N/A"),
            QualificationStatus: log.analysis ? (log.analysis.isQualified ? "Qualified" : "Unqualified") : (['no-answer', 'failed', 'busy', 'canceled'].includes(log.status) ? "Unqualified" : "Pending/N/A")
        }));

        const csv = Papa.unparse(dataToExport);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `intellicall_logs_${new Date().getTime()}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(t("toast.exported"));
    };

    useEffect(() => {
        fetchLogs();
        fetchCampaigns();
    }, [fetchLogs, fetchCampaigns]);

    const filteredLogs = logs.filter(log => {
        const matchesCampaign = selectedCampaignId === "all" || log.campaignId?._id === selectedCampaignId;

        const matchesQualification = qualificationFilter === "all" ||
            (qualificationFilter === "qualified" && log.analysis?.isQualified === true) ||
            (qualificationFilter === "unqualified" && (log.analysis?.isQualified === false || !log.analysis));

        const matchesDirection = directionFilter === "all" ||
            log.direction === directionFilter ||
            (directionFilter === "outbound" && !log.direction);

        return matchesCampaign && matchesQualification && matchesDirection;
    });

    const StatusBadge = ({ status }: { status: string }) => {
        const config = {
            pending: { label: "Pending Execution", variant: "secondary" as const },
            queued: { label: "Queued", variant: "secondary" as const, className: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20" },
            ringing: { label: "Ringing...", variant: "default" as const, className: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20 animate-pulse" },
            "in-progress": { label: "In Conversation", variant: "default" as const, className: "bg-primary/10 text-primary border-primary/20" },
            completed: { label: "Contact Successful", variant: "outline" as const, className: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400 border-green-200 dark:border-green-500/20" },
            failed: { label: "Call Failed", variant: "destructive" as const, className: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/20" },
            busy: { label: "Line Busy", variant: "destructive" as const, className: "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 border-orange-200 dark:border-orange-500/20" },
            "no-answer": { label: "No Answer", variant: "destructive" as const, className: "bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400 border-gray-300 dark:border-gray-500/20" },
            canceled: { label: "Canceled", variant: "secondary" as const, className: "bg-gray-50 text-gray-500 dark:bg-gray-500/10 dark:text-gray-400 border-gray-200 dark:border-gray-500/20" },
            initiated: { label: "Initiating...", variant: "secondary" as const, className: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border-blue-100 dark:border-blue-500/20" },
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

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between space-y-2">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">{t("title")}</h2>
                        <p className="text-muted-foreground">{t("subtitle")}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Select value={qualificationFilter} onValueChange={setQualificationFilter}>
                            <SelectTrigger className="w-[140px] h-9">
                                <SelectValue placeholder={t("filters.qualification")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t("filters.allLeads")}</SelectItem>
                                <SelectItem value="qualified">{t("filters.qualified")}</SelectItem>
                                <SelectItem value="unqualified">{t("filters.unqualified")}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={directionFilter} onValueChange={setDirectionFilter}>
                            <SelectTrigger className="w-[130px] h-9">
                                <SelectValue placeholder={t("filters.direction")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t("filters.allDirections")}</SelectItem>
                                <SelectItem value="inbound">{t("filters.inbound")}</SelectItem>
                                <SelectItem value="outbound">{t("filters.outbound")}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                            <SelectTrigger className="w-[180px] h-9">
                                <SelectValue placeholder={t("filters.campaign")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t("filters.allCampaigns")}</SelectItem>
                                {campaigns.map((camp) => (
                                    <SelectItem key={camp._id} value={camp._id}>
                                        {camp.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => fetchLogs(true)}>
                            <RefreshCw className={`me-2 h-4 w-4 ${loading && "animate-spin"}`} />
                            {t("filters.refresh")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportToCSV}>
                            <Download className="me-2 h-4 w-4" />
                            {t("filters.export")}
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[200px]">{t("table.lead")}</TableHead>
                                    <TableHead>{t("table.context")}</TableHead>
                                    <TableHead>{t("table.dateTime")}</TableHead>
                                    <TableHead>{t("table.duration")}</TableHead>
                                    <TableHead>{t("table.status")}</TableHead>
                                    <TableHead>{t("table.score")}</TableHead>
                                    <TableHead>{t("table.recording")}</TableHead>
                                    <TableHead className="text-end">{t("table.action")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading && filteredLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                            {t("table.noLogs")}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <TableRow key={log._id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{log.leadId?.name || "Unknown"}</span>
                                                        <Badge variant="outline" className={cn(
                                                            "text-[8px] h-4 px-1.5 uppercase tracking-tighter",
                                                            log.direction === 'inbound'
                                                                ? "bg-blue-50 text-blue-600 border-blue-200"
                                                                : "bg-gray-50 text-gray-600 border-gray-200"
                                                        )}>
                                                            {log.direction || 'outbound'}
                                                        </Badge>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground ltr-data">{log.leadId?.phone}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-semibold uppercase text-muted-foreground tracking-tighter">
                                                        {log.campaignId?.name || "One-off Call"}
                                                    </span>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <Bot className="h-3 w-3 text-primary" />
                                                        <span className="text-sm font-medium">{log.agentId?.name}</span>
                                                    </div>
                                                    {log.agentId?.outboundPhoneNumber?.phoneNumber && (
                                                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                                                            <Phone className="h-2.5 w-2.5" />
                                                            <span className="ltr-data">{log.agentId.outboundPhoneNumber.phoneNumber}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm">{formatDate(log.createdAt)}</span>
                                                    <span className="text-xs text-muted-foreground">{formatTime(log.createdAt, timeFormat)}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {log.duration > 0 ? `${Math.floor(log.duration / 60)}m ${log.duration % 60}s` : "---"}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <StatusBadge status={log.status} />
                                                    {log.errors && log.errors.length > 0 && (
                                                        <span title={log.errors[0].message} className="flex items-center">
                                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {log.analysis ? (
                                                    <div className="flex flex-col">
                                                        <span className={cn(
                                                            "text-sm font-black",
                                                            log.analysis.qualificationScore >= 70 ? "text-green-600" :
                                                                log.analysis.qualificationScore >= 40 ? "text-amber-600" :
                                                                    "text-red-600"
                                                        )}>
                                                            {log.analysis.qualificationScore}%
                                                        </span>
                                                        <span className="text-[9px] uppercase font-bold text-muted-foreground leading-none">
                                                            {log.analysis.isQualified ? t("filters.qualified") : t("filters.unqualified")}
                                                        </span>
                                                    </div>
                                                ) : (['no-answer', 'failed', 'busy', 'canceled'].includes(log.status)) ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-black text-red-600">0%</span>
                                                        <span className="text-[9px] uppercase font-bold text-muted-foreground leading-none">{t("filters.unqualified")}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        {log.status === 'completed' ? t("table.pending") : '---'}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {log.recordingUrl ? (
                                                    <ModernAudioPlayer
                                                        src={`${API_BASE_URL}/call-logs/${log._id}/recording?token=${localStorage.getItem("token")}`}
                                                    />
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">{t("table.notAvailable")}</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-end">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={() => setSelectedLog(log)}
                                                    disabled={!log.transcript || log.transcript.length === 0}
                                                >
                                                    <MessageSquare className="me-1.5 h-3 w-3" />
                                                    {t("table.details")}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Transcript Sheet */}
                <Sheet open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
                    <SheetContent className="sm:max-w-xl flex flex-col p-0 gap-0">
                        <SheetHeader className="p-6 pb-2 border-b space-y-1 text-start">
                            <div className="flex items-center justify-between pe-8">
                                <div>
                                    <SheetTitle className="text-xl font-bold">{t("detail.title")}</SheetTitle>
                                    <SheetDescription>
                                        {t("detail.description")}
                                    </SheetDescription>
                                </div>
                                <div className="text-end">
                                    <Badge variant="outline" className="font-mono text-[10px]">
                                        {selectedLog?._id.slice(-8).toUpperCase()}
                                    </Badge>
                                </div>
                            </div>
                        </SheetHeader>

                        <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
                            <div className="px-6 py-2 border-b bg-muted/20">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="summary">{t("detail.tabSummary")}</TabsTrigger>
                                    <TabsTrigger value="transcript">{t("detail.tabTranscript")}</TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="summary" className="flex-1 m-0 p-0 overflow-hidden outline-none">
                                <ScrollArea className="h-full p-6">
                                    <div className="space-y-6">
                                        {/* Meta Information Cards */}
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="p-3 rounded-lg border bg-card flex flex-col items-center justify-center text-center">
                                                <Calendar className="h-4 w-4 text-muted-foreground mb-1.5" />
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none mb-1">{t("detail.date")}</p>
                                                <p className="text-xs font-semibold">{selectedLog && formatDate(selectedLog.createdAt)}</p>
                                            </div>
                                            <div className="p-3 rounded-lg border bg-card flex flex-col items-center justify-center text-center">
                                                <Clock className="h-4 w-4 text-muted-foreground mb-1.5" />
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none mb-1">{t("detail.time")}</p>
                                                <p className="text-xs font-semibold">{selectedLog && formatTime(selectedLog.createdAt, timeFormat)}</p>
                                            </div>
                                            <div className="p-3 rounded-lg border bg-card flex flex-col items-center justify-center text-center">
                                                <Timer className="h-4 w-4 text-muted-foreground mb-1.5" />
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none mb-1">{t("detail.duration")}</p>
                                                <p className="text-xs font-semibold">{selectedLog && selectedLog.duration}s</p>
                                            </div>
                                        </div>

                                        {/* Error Alerts */}
                                        {selectedLog?.errors && selectedLog.errors.length > 0 && (
                                            <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                                    <h4 className="text-sm font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">{t("detail.issuesDetected")}</h4>
                                                </div>
                                                <div className="space-y-1.5">
                                                    {selectedLog.errors.map((error, index) => {
                                                        const serviceColors: Record<string, string> = {
                                                            elevenlabs: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border-purple-200 dark:border-purple-500/30',
                                                            deepgram: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
                                                            openrouter: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
                                                            sarvam: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
                                                            gemini: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
                                                            twilio: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border-red-200 dark:border-red-500/30',
                                                            system: 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300 border-gray-200 dark:border-gray-500/30',
                                                        };
                                                        return (
                                                            <div key={index} className="flex items-start gap-2 text-sm">
                                                                <Badge variant="outline" className={`text-[8px] h-4 px-1.5 uppercase tracking-tighter shrink-0 mt-0.5 border ${serviceColors[error.service] || serviceColors.system}`}>
                                                                    {error.service}
                                                                </Badge>
                                                                <span className="text-red-700 dark:text-red-300 text-xs leading-relaxed">{error.message}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Human Transfers — only on calls that actually attempted one */}
                                        {(selectedLog?.transfers?.length ?? 0) > 0 && (
                                            <div className="rounded-lg border bg-card p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <PhoneForwarded className="h-4 w-4 text-primary" />
                                                    <h4 className="text-sm font-bold uppercase tracking-wider">{t("detail.transfers.title")}</h4>
                                                </div>
                                                <div className="space-y-2.5">
                                                    {selectedLog!.transfers!.map((transfer, index) => (
                                                        <div key={transfer.attemptId || index} className="rounded-md border bg-muted/20 p-3 space-y-2">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-tight mb-0.5">{t("detail.transfers.destination")}</p>
                                                                    <p className="text-xs font-semibold truncate">{transfer.destinationName || transfer.destinationId || "—"}</p>
                                                                </div>
                                                                <Badge variant={transfer.status === "completed" || transfer.status === "connected" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                                                                    {transferStatusLabel(transfer.status)}
                                                                </Badge>
                                                            </div>
                                                            <div className="grid grid-cols-4 gap-x-3 gap-y-2">
                                                                {([
                                                                    [t("detail.transfers.attempt"), `${transfer.attempt ?? 1}`],
                                                                    [t("detail.transfers.ringTime"), formatTransferMs(transfer.ringDurationMs)],
                                                                    [t("detail.transfers.talkTime"), formatTransferMs(transfer.connectedDurationMs)],
                                                                    [t("detail.transfers.sipCause"), transfer.sipCause ? `${transfer.sipCause}` : "—"],
                                                                ] as [string, string][]).map(([label, value]) => (
                                                                    <div key={label}>
                                                                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-tight mb-0.5">{label}</p>
                                                                        <p className="text-xs font-semibold tabular-nums">{value}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Voice Quality diagnostics (classic-engine calls) */}
                                        {selectedLog?.voiceMetrics && (selectedLog.voiceMetrics.turns || 0) > 0 && (
                                            <div className="rounded-lg border bg-card p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <Activity className="h-4 w-4 text-primary" />
                                                    <h4 className="text-sm font-bold uppercase tracking-wider">{t("detail.voiceQuality.title")}</h4>
                                                </div>
                                                <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
                                                    {([
                                                        [t("detail.voiceQuality.turns"), `${selectedLog.voiceMetrics.turns ?? 0}`],
                                                        [t("detail.voiceQuality.interruptions"), `${selectedLog.voiceMetrics.interruptions ?? 0}`],
                                                        [t("detail.voiceQuality.falseVad"), `${selectedLog.voiceMetrics.falseVadEvents ?? 0}`],
                                                        [t("detail.voiceQuality.ttsChunks"), `${selectedLog.voiceMetrics.ttsChunksSent ?? 0}`],
                                                        [t("detail.voiceQuality.rtpDrops"), `${selectedLog.voiceMetrics.rtpQueueDrops ?? 0}`],
                                                        [t("detail.voiceQuality.llmFirstToken"), `${selectedLog.voiceMetrics.avgLlmFirstTokenMs ?? 0} ms`],
                                                        [t("detail.voiceQuality.ttsFirstText"), `${selectedLog.voiceMetrics.avgTtsFirstTextMs ?? 0} ms`],
                                                        [t("detail.voiceQuality.firstAudio"), `${selectedLog.voiceMetrics.avgFirstAudioMs ?? 0} ms`],
                                                        [t("detail.voiceQuality.maxFirstAudio"), `${selectedLog.voiceMetrics.maxFirstAudioMs ?? 0} ms`],
                                                    ] as [string, string][]).map(([label, value]) => (
                                                        <div key={label}>
                                                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-tight mb-0.5">{label}</p>
                                                            <p className="text-xs font-semibold tabular-nums">{value}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* AI Analysis Section */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Brain className="h-5 w-5 text-primary" />
                                                    <h3 className="font-bold text-sm uppercase tracking-widest">{t("detail.aiIntelligence")}</h3>
                                                </div>
                                                {!selectedLog?.analysis && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-[10px] font-bold uppercase tracking-wider"
                                                        onClick={() => selectedLog && analyzeCall(selectedLog._id)}
                                                        disabled={analyzing}
                                                    >
                                                        {analyzing ? <Loader2 className="h-3 w-3 animate-spin me-1.5" /> : <Activity className="h-3 w-3 me-1.5" />}
                                                        {analyzing ? "Analyzing..." : "Analyze Now"}
                                                    </Button>
                                                )}
                                            </div>

                                            {selectedLog?.analysis ? (
                                                <div className="space-y-4">
                                                    <Card className="bg-primary/5 border-primary/20 overflow-hidden">
                                                        <CardContent className="p-4 space-y-4">
                                                            <div className="flex items-start justify-between gap-4">
                                                                <div className="space-y-1 flex-1">
                                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("detail.conversationSummary")}</p>
                                                                    <p className="text-sm leading-relaxed">{selectedLog.summary}</p>
                                                                </div>
                                                                <div className="text-end shrink-0">
                                                                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase mb-1 ${selectedLog.analysis.isQualified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                        {selectedLog.analysis.isQualified ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                                                        {selectedLog.analysis.isQualified ? 'Qualified' : 'Unqualified'}
                                                                    </div>
                                                                    <p className="text-2xl font-black text-primary leading-none">{selectedLog.analysis.qualificationScore}%</p>
                                                                    <p className="text-[8px] font-bold text-muted-foreground uppercase">{t("detail.score")}</p>
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-primary/10">
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{t("detail.estimatedBudget")}</p>
                                                                    <p className="text-xs font-semibold">{selectedLog.analysis.budget}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{t("detail.timeline")}</p>
                                                                    <p className="text-xs font-semibold">{selectedLog.analysis.timeline}</p>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-1">
                                                                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{t("detail.reasoning")}</p>
                                                                <p className="text-xs italic text-muted-foreground leading-relaxed">"{selectedLog.analysis.reason}"</p>
                                                            </div>

                                                            <div className="p-3 bg-white/50 dark:bg-black/20 rounded-lg border border-primary/10">
                                                                <p className="text-[9px] font-bold text-primary uppercase tracking-wider mb-1">{t("detail.nextSteps")}</p>
                                                                <p className="text-xs font-medium">{selectedLog.analysis.nextSteps}</p>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </div>
                                            ) : (
                                                <div className="h-40 rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-center p-6 bg-muted/20">
                                                    <Brain className="h-10 w-10 text-muted-foreground/30 mb-2" />
                                                    <p className="text-sm text-muted-foreground font-semibold">{t("detail.noAnalysis")}</p>
                                                    <p className="text-xs text-muted-foreground/60 mt-1 max-w-[280px]">{t("detail.noAnalysisHint")}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="transcript" className="flex-1 m-0 p-0 overflow-hidden outline-none">
                                <ScrollArea className="h-full p-6">
                                    <div className="space-y-6 pb-4">
                                        {selectedLog?.transcript.map((item, index) => (
                                            <div key={index} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[85%] space-y-1 ${item.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                                                    <div className="flex items-center gap-1.5 px-1 opacity-70">
                                                        {item.role === 'assistant' ? (
                                                            <><Bot className="h-3 w-3" /><span className="text-[10px] font-bold uppercase tracking-wider">{t("detail.roleAgent")}</span></>
                                                        ) : item.role === 'user' ? (
                                                            <><span className="text-[10px] font-bold uppercase tracking-wider">{selectedLog?.leadId?.name || t("detail.roleLead")}</span><User className="h-3 w-3" /></>
                                                        ) : (
                                                            <><Brain className="h-3 w-3 text-amber-500" /><span className="text-[10px] font-bold uppercase tracking-wider">{t("detail.roleSystem")}</span></>
                                                        )}
                                                    </div>
                                                    <div className={`p-3 rounded-xl text-sm ${item.role === 'assistant'
                                                        ? 'bg-muted border border-border text-foreground rounded-tl-none'
                                                        : item.role === 'user'
                                                            ? 'bg-primary text-primary-foreground rounded-tr-none'
                                                            : 'bg-amber-50 border border-amber-100 text-amber-900 italic text-[13px] rounded-sm'
                                                        }`}>
                                                        {item.content}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    </SheetContent>
                </Sheet>
            </div>
        </div>
    );
}
