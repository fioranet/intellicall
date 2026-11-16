"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { Phone, Clock, Timer, Calendar, Robot, User, ChatText, CheckCircle, XCircle, Brain, Pulse, ArrowsClockwise, DownloadSimple, Warning, PhoneTransfer, Wrench, VideoCamera } from "@phosphor-icons/react";
import {
    Alert,
    Badge,
    type BadgeProps,
    Button,
    DescriptionList,
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    EmptyState,
    Message,
    PageHeader,
    Section,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Skeleton,
    Spinner,
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
    Transcript,
    toast,
} from "@wixzel/react";
import axios from "axios";
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

/** Transfer statuses as Badge tones. A ringing or connected transfer is live, so it pulses. */
const TRANSFER_TONES: Record<string, { tone: BadgeProps["tone"]; pulse?: boolean }> = {
    ringing: { tone: "warning", pulse: true },
    connected: { tone: "success", pulse: true },
    completed: { tone: "success" },
    busy: { tone: "danger" },
    no_answer: { tone: "danger" },
    rejected: { tone: "danger" },
    unavailable: { tone: "danger" },
    failed: { tone: "danger" },
};

/** Transfer durations arrive in ms; show them the way a human reads a call timer. */
const formatTransferMs = (ms?: number) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms} ms`;
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
};

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

/** A grid of small measures: a label over a tabular value. */
const MetricGrid = ({ items, columns }: { items: [string, string][]; columns: 3 | 4 }) => (
    <dl className={cn("grid gap-x-3 gap-y-3", columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
        {items.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-0.5">
                <dt className="truncate text-caption text-fg-subtle">{label}</dt>
                <dd className="text-body-sm font-medium tabular-nums">{value}</dd>
            </div>
        ))}
    </dl>
);

interface TranscriptItem {
    role: "system" | "assistant" | "user";
    content: string;
    timestamp: string;
}

/** The transcript minus the system prompt, which every call is seeded with. */
const conversationTurns = (log: { transcript?: TranscriptItem[] }) =>
    (log.transcript || []).filter(item => item.role !== "system");

/** How long after a call ends its automatic analysis still counts as on its way. */
const ANALYSIS_GRACE_MS = 5 * 60 * 1000;

interface CallLog {
    _id: string;
    campaignId?: { _id: string; name: string };
    leadId: { _id: string; name: string; phone: string };
    agentId: { _id: string; name: string; outboundPhoneNumber?: { phoneNumber: string } };
    status: string;
    duration: number;
    createdAt: string;
    updatedAt?: string;
    endTime?: string;
    direction?: 'inbound' | 'outbound';
    /** Where the call ran. 'meeting' is an agent in a Zoom, Meet or Teams meeting. */
    provider?: 'twilio' | 'sip' | 'meeting';
    /** The meeting bot behind a provider 'meeting' call. Absent on phone calls. */
    meeting?: {
        platform?: string | null;
        botName?: string | null;
        meetingUrl?: string | null;
        respondWhen?: string | null;
        joinedAt?: string | null;
        endReason?: string | null;
        mutedReplies?: number;
        error?: string | null;
    };
    transcript: TranscriptItem[];
    recordingUrl?: string;
    summary?: string;
    /** Why the last analysis attempt produced nothing. Cleared when one succeeds. */
    analysisError?: { message: string; at: string };
    errors?: {
        service: 'elevenlabs' | 'deepgram' | 'openrouter' | 'twilio' | 'sarvam' | 'gemini' | 'sip' | 'system';
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
    /** Tools the agent called during this call. Absent on calls that used none. */
    toolCalls?: {
        type: 'webhook' | 'integration' | 'whatsapp';
        tool: string;
        /** The app an integration tool belongs to. */
        serverName?: string;
        arguments: Record<string, unknown> | null;
        ok: boolean;
        error: string | null;
        durationMs: number;
        at: string;
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

/** The platform's own name for a meeting row; the raw code when it is one we do not know. */
function meetingPlatformName(platform?: string | null): string {
    switch (platform) {
        case 'google_meet': return 'Google Meet';
        case 'teams': return 'Microsoft Teams';
        case 'zoom': return 'Zoom';
        default: return platform || '';
    }
}

/** Just the host of a meeting link, for the compact row. */
function hostOfUrl(url: string): string {
    try { return new URL(url).host; } catch { return url; }
}

export default function CallLogsPage() {
    const t = useTranslations("calls");

    /**
     * One line on why a call went wrong, for the table row. The first recorded error is
     * the cause; later ones are usually its knock-on effects. A failed call with nothing
     * recorded still gets a reason, so the row is never a bare "Call Failed".
     */
    const failureReason = (log: CallLog) => {
        if (log.errors?.length) return log.errors[0].message;
        if (log.status === "failed") return t("detail.failedNoConversation");
        return null;
    };

    /**
     * Why a completed call has no AI score, or null while its automatic analysis may
     * still be running. Shown in the row instead of a "Pending" that never ends.
     */
    const missingAnalysisReason = (log: CallLog): string | null => {
        if (log.analysisError?.message) return log.analysisError.message;
        if (conversationTurns(log).length === 0) return t("table.nothingToAnalyze");
        const ended = new Date(log.endTime || log.updatedAt || log.createdAt).getTime();
        if (Date.now() - ended < ANALYSIS_GRACE_MS) return null;
        return t("table.notAutoAnalyzed");
    };
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
                const updatedLog = { ...selectedLog, ...response.data.data, analysisError: undefined } as CallLog;
                setSelectedLog(updatedLog);
                setLogs(prev => prev.map(log => log._id === id ? updatedLog : log));
                toast.success(t("toast.analysisComplete"));
            }
        } catch (err: any) {
            const message = err.response?.data?.message || t("toast.analysisFailed");
            // The server keeps the owner's own wording on the call; the row shows that
            // after the next refresh. Until then show what this attempt said.
            const analysisError = { message, at: new Date().toISOString() };
            setSelectedLog(prev => prev && prev._id === id ? { ...prev, analysisError } : prev);
            setLogs(prev => prev.map(log => log._id === id ? { ...log, analysisError } : log));
            toast.error(message);
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

    const scoreInk = (score: number) =>
        score >= 70 ? "text-success-ink" : score >= 40 ? "text-warning-ink" : "text-danger-ink";

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("subtitle")}
                actions={
                    <>
                        <Select value={qualificationFilter} onValueChange={setQualificationFilter}>
                            <SelectTrigger size="sm" className="w-[140px]">
                                <SelectValue placeholder={t("filters.qualification")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t("filters.allLeads")}</SelectItem>
                                <SelectItem value="qualified">{t("filters.qualified")}</SelectItem>
                                <SelectItem value="unqualified">{t("filters.unqualified")}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={directionFilter} onValueChange={setDirectionFilter}>
                            <SelectTrigger size="sm" className="w-[130px]">
                                <SelectValue placeholder={t("filters.direction")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t("filters.allDirections")}</SelectItem>
                                <SelectItem value="inbound">{t("filters.inbound")}</SelectItem>
                                <SelectItem value="outbound">{t("filters.outbound")}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                            <SelectTrigger size="sm" className="w-[180px]">
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
                        <Button size="sm" onClick={() => fetchLogs(true)} loading={loading} iconStart={<ArrowsClockwise />}>
                            {t("filters.refresh")}
                        </Button>
                        <Button size="sm" onClick={exportToCSV} iconStart={<DownloadSimple />}>
                            {t("filters.export")}
                        </Button>
                    </>
                }
            />

            {!loading && filteredLogs.length === 0 ? (
                <EmptyState icon={<Phone />} title={t("table.noLogs")} />
            ) : (
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
                            <TableHead align="end">{t("table.action")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && filteredLogs.length === 0 ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    {Array.from({ length: 8 }).map((_, j) => (
                                        <TableCell key={j} className="py-3">
                                            <Skeleton className="h-4 w-full max-w-[120px]" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            filteredLogs.map((log) => (
                                <TableRow key={log._id}>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-0.5">
                                            {log.provider === 'meeting' ? (
                                                <>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{log.meeting?.botName || log.agentId?.name || t("meeting.label")}</span>
                                                        <Badge size="sm" tone="info">{t("meeting.label")}</Badge>
                                                    </div>
                                                    <span className="text-caption text-fg-muted ltr-data truncate max-w-[220px]" title={log.meeting?.meetingUrl || undefined}>
                                                        {meetingPlatformName(log.meeting?.platform)}{log.meeting?.meetingUrl ? ` · ${hostOfUrl(log.meeting.meetingUrl)}` : ''}
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{log.leadId?.name || "Unknown"}</span>
                                                        <Badge size="sm" tone={log.direction === 'inbound' ? "info" : "neutral"} className="capitalize">
                                                            {log.direction || 'outbound'}
                                                        </Badge>
                                                    </div>
                                                    <span className="text-caption text-fg-muted ltr-data">{log.leadId?.phone}</span>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-caption text-fg-subtle">
                                                {log.campaignId?.name || "One-off Call"}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <Robot className="size-3.5 text-fg-subtle" />
                                                <span className="font-medium">{log.agentId?.name}</span>
                                            </div>
                                            {log.agentId?.outboundPhoneNumber?.phoneNumber && (
                                                <div className="flex items-center gap-1.5 text-caption text-fg-muted">
                                                    <Phone className="size-3" />
                                                    <span className="ltr-data">{log.agentId.outboundPhoneNumber.phoneNumber}</span>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-0.5 whitespace-nowrap">
                                            <span>{formatDate(log.createdAt)}</span>
                                            <span className="text-caption text-fg-muted">{formatTime(log.createdAt, timeFormat)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                            <Timer className="size-3.5 text-fg-subtle" />
                                            {log.duration > 0 ? `${Math.floor(log.duration / 60)}m ${log.duration % 60}s` : "---"}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <StatusBadge status={log.status} />
                                                {(log.errors?.length ?? 0) > 0 && (
                                                    <Warning className="size-3.5 shrink-0 text-warning-ink" aria-hidden />
                                                )}
                                            </div>
                                            {failureReason(log) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedLog(log)}
                                                    title={failureReason(log) ?? undefined}
                                                    className="line-clamp-2 max-w-[240px] whitespace-normal text-start text-caption text-danger-ink hover:underline"
                                                >
                                                    {failureReason(log)}
                                                </button>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        {log.analysis ? (
                                            <div className="flex flex-col">
                                                <span className={cn("font-semibold tabular-nums", scoreInk(log.analysis.qualificationScore))}>
                                                    {log.analysis.qualificationScore}%
                                                </span>
                                                <span className="text-caption text-fg-subtle">
                                                    {log.analysis.isQualified ? t("filters.qualified") : t("filters.unqualified")}
                                                </span>
                                            </div>
                                        ) : (['no-answer', 'failed', 'busy', 'canceled'].includes(log.status)) ? (
                                            <div className="flex flex-col">
                                                <span className="font-semibold tabular-nums text-danger-ink">0%</span>
                                                <span className="text-caption text-fg-subtle">{t("filters.unqualified")}</span>
                                            </div>
                                        ) : log.status !== 'completed' ? (
                                            <span className="text-caption text-fg-subtle">---</span>
                                        ) : missingAnalysisReason(log) ? (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedLog(log)}
                                                title={missingAnalysisReason(log) ?? undefined}
                                                className="flex max-w-[160px] flex-col text-start hover:underline"
                                            >
                                                <span className="text-caption font-medium text-fg-muted">{t("table.notAnalyzed")}</span>
                                                <span className="line-clamp-2 whitespace-normal text-caption text-fg-subtle">
                                                    {missingAnalysisReason(log)}
                                                </span>
                                            </button>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted">
                                                <Spinner size="sm" />
                                                {t("table.analyzing")}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        {log.recordingUrl ? (
                                            <ModernAudioPlayer
                                                src={`${API_BASE_URL}/call-logs/${log._id}/recording?token=${localStorage.getItem("token")}`}
                                            />
                                        ) : (
                                            <span className="text-caption text-fg-subtle">{t("table.notAvailable")}</span>
                                        )}
                                    </TableCell>
                                    <TableCell align="end" className="py-3">
                                        <Button
                                            size="xs"
                                            iconStart={<ChatText />}
                                            onClick={() => setSelectedLog(log)}
                                            disabled={conversationTurns(log).length === 0 && !failureReason(log)}
                                        >
                                            {t("table.details")}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            )}

            {/* Call detail drawer */}
            <Drawer open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
                <DrawerContent side="right" style={{ "--wx-drawer-size": "576px" } as CSSProperties}>
                    <DrawerHeader>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-col gap-1">
                                <DrawerTitle>{t("detail.title")}</DrawerTitle>
                                <DrawerDescription>
                                    {t("detail.description")}
                                </DrawerDescription>
                            </div>
                            <Badge appearance="outline" className="font-mono">
                                {selectedLog?._id.slice(-8).toUpperCase()}
                            </Badge>
                        </div>
                    </DrawerHeader>

                    <Tabs variant="segment" defaultValue="summary" className="min-h-0 flex-1 gap-0">
                        <div className="px-5 pt-4">
                            <TabsList>
                                <TabsTrigger value="summary">{t("detail.tabSummary")}</TabsTrigger>
                                <TabsTrigger value="transcript">{t("detail.tabTranscript")}</TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="summary" asChild>
                            <DrawerBody className="flex flex-col gap-4">
                                {/* Call metadata */}
                                <Section>
                                    <DescriptionList
                                        items={[
                                            { icon: <Calendar />, term: t("detail.date"), value: selectedLog && formatDate(selectedLog.createdAt) },
                                            { icon: <Clock />, term: t("detail.time"), value: selectedLog && formatTime(selectedLog.createdAt, timeFormat) },
                                            { icon: <Timer />, term: t("detail.duration"), value: selectedLog && `${selectedLog.duration}s` },
                                        ]}
                                    />
                                </Section>

                                {/* A failed call with no recorded error still says why it failed */}
                                {selectedLog && !selectedLog.errors?.length && failureReason(selectedLog) && (
                                    <Alert tone="danger">{failureReason(selectedLog)}</Alert>
                                )}

                                {/* Error Alerts */}
                                {selectedLog?.errors && selectedLog.errors.length > 0 && (
                                    <Alert tone="danger" title={t("detail.issuesDetected")}>
                                        <ul className="mt-1 flex flex-col gap-1.5">
                                            {selectedLog.errors.map((error, index) => (
                                                <li key={index} className="flex items-start gap-2">
                                                    <Badge size="sm" appearance="outline" className="mt-0.5">
                                                        {error.service}
                                                    </Badge>
                                                    <span className="text-caption text-danger-ink">{error.message}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </Alert>
                                )}

                                {/* Human Transfers — only on calls that actually attempted one */}
                                {(selectedLog?.transfers?.length ?? 0) > 0 && (
                                    <Section icon={<PhoneTransfer />} title={t("detail.transfers.title")}>
                                        <div className="flex flex-col gap-2.5">
                                            {selectedLog!.transfers!.map((transfer, index) => {
                                                const tone = TRANSFER_TONES[transfer.status] || { tone: "neutral" as const };
                                                return (
                                                    <div key={transfer.attemptId || index} className="flex flex-col gap-3 rounded-md bg-surface p-3">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                                <p className="text-caption text-fg-subtle">{t("detail.transfers.destination")}</p>
                                                                <p className="truncate text-body-sm font-medium">{transfer.destinationName || transfer.destinationId || "—"}</p>
                                                            </div>
                                                            <Badge tone={tone.tone} dot pulse={tone.pulse}>
                                                                {transferStatusLabel(transfer.status)}
                                                            </Badge>
                                                        </div>
                                                        <MetricGrid
                                                            columns={4}
                                                            items={[
                                                                [t("detail.transfers.attempt"), `${transfer.attempt ?? 1}`],
                                                                [t("detail.transfers.ringTime"), formatTransferMs(transfer.ringDurationMs)],
                                                                [t("detail.transfers.talkTime"), formatTransferMs(transfer.connectedDurationMs)],
                                                                [t("detail.transfers.sipCause"), transfer.sipCause ? `${transfer.sipCause}` : "—"],
                                                            ]}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </Section>
                                )}

                                {/* The meeting behind a meeting call — only on meeting calls */}
                                {selectedLog?.provider === 'meeting' && (
                                    <Section icon={<VideoCamera />} title={t("meeting.title")}>
                                        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-body-sm sm:grid-cols-2">
                                            <div>
                                                <dt className="text-caption text-fg-muted">{t("meeting.platform")}</dt>
                                                <dd>{meetingPlatformName(selectedLog.meeting?.platform)}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-caption text-fg-muted">{t("meeting.botName")}</dt>
                                                <dd>{selectedLog.meeting?.botName || selectedLog.agentId?.name || '—'}</dd>
                                            </div>
                                            <div className="sm:col-span-2">
                                                <dt className="text-caption text-fg-muted">{t("meeting.link")}</dt>
                                                <dd className="ltr-data break-all">{selectedLog.meeting?.meetingUrl || '—'}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-caption text-fg-muted">{t("meeting.speaks")}</dt>
                                                <dd>{selectedLog.meeting?.respondWhen === 'always' ? t("meeting.speaksAlways") : t("meeting.speaksAddressed")}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-caption text-fg-muted">{t("meeting.mutedReplies")}</dt>
                                                <dd>{selectedLog.meeting?.mutedReplies ?? 0}</dd>
                                            </div>
                                            {selectedLog.meeting?.endReason && (
                                                <div className="sm:col-span-2">
                                                    <dt className="text-caption text-fg-muted">{t("meeting.endReason")}</dt>
                                                    <dd className="font-mono text-caption">{selectedLog.meeting.endReason}</dd>
                                                </div>
                                            )}
                                        </dl>
                                    </Section>
                                )}

                                {/* Tools the agent called — only on calls that used one */}
                                {(selectedLog?.toolCalls?.length ?? 0) > 0 && (
                                    <Section icon={<Wrench />} title={t("detail.tools.title")}>
                                        <div className="flex flex-col gap-2.5">
                                            {selectedLog!.toolCalls!.map((call, index) => (
                                                <div key={`${call.at}-${index}`} className="flex flex-col gap-2 rounded-md bg-surface p-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex min-w-0 flex-col gap-0.5">
                                                            <p className="truncate text-body-sm font-medium">
                                                                <span className="ltr-data font-mono">{call.tool}</span>
                                                                {call.type === "integration" && call.serverName && (
                                                                    <span className="ms-2 text-caption font-normal text-fg-muted">{t("detail.tools.viaApp", { app: call.serverName })}</span>
                                                                )}
                                                                {call.type === "whatsapp" && (
                                                                    <span className="ms-2 text-caption font-normal text-fg-muted">{t("detail.tools.viaWhatsApp")}</span>
                                                                )}
                                                            </p>
                                                            <p className="text-caption text-fg-subtle tabular-nums">
                                                                {formatTime(call.at, timeFormat)} · {formatTransferMs(call.durationMs)}
                                                            </p>
                                                        </div>
                                                        <Badge tone={call.ok ? "success" : "danger"} dot>
                                                            {call.ok ? t("detail.tools.ok") : t("detail.tools.failed")}
                                                        </Badge>
                                                    </div>
                                                    {!call.ok && call.error && (
                                                        <p className="text-caption text-danger-ink">{call.error}</p>
                                                    )}
                                                    {call.arguments && Object.keys(call.arguments).length > 0 ? (
                                                        <code className="ltr-data block overflow-x-auto whitespace-pre-wrap break-all rounded-sm bg-bg-muted px-2 py-1.5 font-mono text-caption text-fg-muted">
                                                            {JSON.stringify(call.arguments)}
                                                        </code>
                                                    ) : (
                                                        <p className="text-caption text-fg-subtle">{t("detail.tools.noArguments")}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </Section>
                                )}

                                {/* Voice Quality diagnostics (classic-engine calls) */}
                                {selectedLog?.voiceMetrics && (selectedLog.voiceMetrics.turns || 0) > 0 && (
                                    <Section icon={<Pulse />} title={t("detail.voiceQuality.title")}>
                                        <MetricGrid
                                            columns={3}
                                            items={[
                                                [t("detail.voiceQuality.turns"), `${selectedLog.voiceMetrics.turns ?? 0}`],
                                                [t("detail.voiceQuality.interruptions"), `${selectedLog.voiceMetrics.interruptions ?? 0}`],
                                                [t("detail.voiceQuality.falseVad"), `${selectedLog.voiceMetrics.falseVadEvents ?? 0}`],
                                                [t("detail.voiceQuality.ttsChunks"), `${selectedLog.voiceMetrics.ttsChunksSent ?? 0}`],
                                                [t("detail.voiceQuality.rtpDrops"), `${selectedLog.voiceMetrics.rtpQueueDrops ?? 0}`],
                                                [t("detail.voiceQuality.llmFirstToken"), `${selectedLog.voiceMetrics.avgLlmFirstTokenMs ?? 0} ms`],
                                                [t("detail.voiceQuality.ttsFirstText"), `${selectedLog.voiceMetrics.avgTtsFirstTextMs ?? 0} ms`],
                                                [t("detail.voiceQuality.firstAudio"), `${selectedLog.voiceMetrics.avgFirstAudioMs ?? 0} ms`],
                                                [t("detail.voiceQuality.maxFirstAudio"), `${selectedLog.voiceMetrics.maxFirstAudioMs ?? 0} ms`],
                                            ]}
                                        />
                                    </Section>
                                )}

                                {/* AI Analysis Section */}
                                <Section
                                    icon={<Brain />}
                                    title={t("detail.aiIntelligence")}
                                    actions={!selectedLog?.analysis && selectedLog && conversationTurns(selectedLog).length > 0 && (
                                        <Button
                                            size="xs"
                                            iconStart={<Pulse />}
                                            loading={analyzing}
                                            onClick={() => selectedLog && analyzeCall(selectedLog._id)}
                                        >
                                            {analyzing ? t("detail.analyzingNow") : t("detail.analyzeNow")}
                                        </Button>
                                    )}
                                >
                                    {selectedLog?.analysis ? (
                                        <div className="flex flex-col gap-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex flex-1 flex-col gap-1">
                                                    <p className="text-caption text-fg-subtle">{t("detail.conversationSummary")}</p>
                                                    <p className="text-body-sm">{selectedLog.summary}</p>
                                                </div>
                                                <div className="flex shrink-0 flex-col items-end gap-1">
                                                    <Badge tone={selectedLog.analysis.isQualified ? "success" : "danger"}>
                                                        {selectedLog.analysis.isQualified ? <CheckCircle /> : <XCircle />}
                                                        {selectedLog.analysis.isQualified ? 'Qualified' : 'Unqualified'}
                                                    </Badge>
                                                    <p className="text-heading-lg tabular-nums text-accent-ink">{selectedLog.analysis.qualificationScore}%</p>
                                                    <p className="text-caption text-fg-subtle">{t("detail.score")}</p>
                                                </div>
                                            </div>

                                            <DescriptionList
                                                className="border-t border-border pt-3"
                                                items={[
                                                    { term: t("detail.estimatedBudget"), value: selectedLog.analysis.budget },
                                                    { term: t("detail.timeline"), value: selectedLog.analysis.timeline },
                                                ]}
                                            />

                                            <div className="flex flex-col gap-1">
                                                <p className="text-caption text-fg-subtle">{t("detail.reasoning")}</p>
                                                <p className="text-body-sm italic text-fg-muted">"{selectedLog.analysis.reason}"</p>
                                            </div>

                                            <div className="flex flex-col gap-1 rounded-md bg-surface p-3">
                                                <p className="text-caption font-medium text-accent-ink">{t("detail.nextSteps")}</p>
                                                <p className="text-body-sm">{selectedLog.analysis.nextSteps}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <EmptyState
                                            className="py-6"
                                            icon={<Brain />}
                                            title={t("detail.noAnalysis")}
                                            description={selectedLog?.analysisError?.message || t("detail.noAnalysisHint")}
                                        />
                                    )}
                                </Section>
                            </DrawerBody>
                        </TabsContent>

                        <TabsContent value="transcript" asChild>
                            <DrawerBody>
                                {selectedLog && conversationTurns(selectedLog).length === 0 && (
                                    <EmptyState
                                        icon={<ChatText />}
                                        title={t("detail.noConversation")}
                                        description={failureReason(selectedLog) ? t("detail.noConversationHint", { tab: t("detail.tabSummary") }) : undefined}
                                    />
                                )}
                                <Transcript>
                                    {selectedLog?.transcript.map((item, index) => item.role === 'system' ? (
                                        // Wixzel's Message has no system turn: a quiet note across the log.
                                        <div key={index} className="flex flex-col gap-1 self-stretch rounded-md bg-bg-subtle px-3 py-2">
                                            <span className="flex items-center gap-1.5 text-caption font-medium text-fg-subtle">
                                                <Brain className="size-3.5" />
                                                {t("detail.roleSystem")}
                                            </span>
                                            <p className="text-caption italic text-fg-muted">{item.content}</p>
                                        </div>
                                    ) : (
                                        <Message
                                            key={index}
                                            from={item.role === 'assistant' ? "agent" : "person"}
                                            name={item.role === 'assistant' ? (
                                                <span className="inline-flex items-center gap-1"><Robot className="size-3" />{t("detail.roleAgent")}</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1">{selectedLog?.leadId?.name || t("detail.roleLead")}<User className="size-3" /></span>
                                            )}
                                        >
                                            {item.content}
                                        </Message>
                                    ))}
                                </Transcript>
                            </DrawerBody>
                        </TabsContent>
                    </Tabs>
                </DrawerContent>
            </Drawer>
        </div>
    );
}
