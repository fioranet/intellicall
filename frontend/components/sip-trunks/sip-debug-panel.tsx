"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback, useRef } from "react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    CheckCircle2,
    XCircle,
    HelpCircle,
    Loader2,
    RefreshCw,
    ScrollText,
    Stethoscope,
    Server,
    Trash2,
} from "lucide-react";
import axios from "axios";
import { cn } from "@/lib/utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
const LOG_POLL_INTERVAL_MS = 4000;

interface HealthCheck {
    id: string;
    label: string;
    status: "pass" | "fail" | "unknown";
    detail: string;
    hint?: string;
}

interface TrunkCheck {
    trunkId: string;
    name: string;
    host: string;
    transport?: string;
    endpointName: string;
    endpointLoaded: boolean | null;
    contactStatus?: "available" | "unavailable" | "not_qualified" | "missing" | "unknown";
    registration: "registered" | "pending" | "failed" | "missing" | "unknown" | "not_applicable";
}

interface LogEntry {
    id: number;
    ts: string;
    level: "info" | "warn" | "error" | "success";
    message: string;
    detail?: string;
}

const statusIcon = (status: HealthCheck["status"]) => {
    if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />;
    if (status === "fail") return <XCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />;
    return <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
};

const registrationBadge = (registration: TrunkCheck["registration"], t: (key: string) => string) => {
    switch (registration) {
        case "registered":
            return <Badge variant="outline" className="text-[9px] font-bold uppercase bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20">{t("debug.registration.registered")}</Badge>;
        case "failed":
            return <Badge variant="outline" className="text-[9px] font-bold uppercase bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">{t("debug.registration.failed")}</Badge>;
        case "missing":
            return <Badge variant="outline" className="text-[9px] font-bold uppercase bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">{t("debug.registration.missing")}</Badge>;
        case "pending":
            return <Badge variant="outline" className="text-[9px] font-bold uppercase bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20">{t("debug.registration.pending")}</Badge>;
        case "not_applicable":
            return <Badge variant="outline" className="text-[9px] font-bold uppercase bg-muted text-muted-foreground border-border">{t("debug.registration.ipAuth")}</Badge>;
        default:
            return <Badge variant="outline" className="text-[9px] font-bold uppercase bg-muted text-muted-foreground border-border">{t("debug.registration.unknown")}</Badge>;
    }
};

const levelStyles: Record<LogEntry["level"], string> = {
    error: "text-red-600 dark:text-red-400",
    warn: "text-yellow-700 dark:text-yellow-400",
    success: "text-green-700 dark:text-green-400",
    info: "text-muted-foreground",
};

export function SipDebugPanel({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations("sip");
    const [health, setHealth] = useState<{
        checks: HealthCheck[];
        trunks: TrunkCheck[];
        activeSipCalls: number;
        checkedAt: string;
    } | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const lastLogId = useRef(0);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const autoScroll = useRef(true);

    const authHeaders = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    const fetchHealth = useCallback(async () => {
        setHealthLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/sip-trunks/debug/health`, authHeaders());
            if (res.data?.status === "success") setHealth(res.data.data);
        } catch (_) {
            // Panel is best-effort; errors surface through the checks themselves
        } finally {
            setHealthLoading(false);
        }
    }, []);

    const fetchLogs = useCallback(async (initial = false) => {
        if (initial) setLogsLoading(true);
        try {
            const res = await axios.get(
                `${API_BASE_URL}/sip-trunks/debug/logs?sinceId=${initial ? 0 : lastLogId.current}`,
                authHeaders()
            );
            const newLogs: LogEntry[] = res.data?.data?.logs || [];
            if (newLogs.length > 0) {
                lastLogId.current = newLogs[newLogs.length - 1].id;
                setLogs((prev) => (initial ? newLogs : [...prev, ...newLogs].slice(-500)));
            } else if (initial) {
                setLogs([]);
            }
        } catch (_) {
            /* keep previous logs */
        } finally {
            if (initial) setLogsLoading(false);
        }
    }, []);

    // Load + poll while open
    useEffect(() => {
        if (!open) return;
        lastLogId.current = 0;
        fetchHealth();
        fetchLogs(true);
        const interval = setInterval(() => fetchLogs(false), LOG_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [open, fetchHealth, fetchLogs]);

    // Auto-scroll to newest log unless the user scrolled up
    useEffect(() => {
        if (autoScroll.current) {
            logsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }, [logs]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
                <SheetHeader className="px-6 pt-6 pb-4 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <Stethoscope className="h-5 w-5 text-primary" />
                        {t("debug.title")}
                    </SheetTitle>
                    <SheetDescription>
                        {t("debug.description")}
                    </SheetDescription>
                </SheetHeader>

                <Tabs defaultValue="health" className="flex-1 flex flex-col min-h-0 px-6 pb-6 pt-4">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="health">
                            <Stethoscope className="me-1.5 h-3.5 w-3.5" />
                            {t("debug.tabHealth")}
                        </TabsTrigger>
                        <TabsTrigger value="logs">
                            <ScrollText className="me-1.5 h-3.5 w-3.5" />
                            {t("debug.tabLogs")}
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Health Checks ─────────────────────────── */}
                    <TabsContent value="health" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                {health?.checkedAt
                                    ? `Last checked ${new Date(health.checkedAt).toLocaleTimeString()}`
                                    : "Running checks…"}
                            </p>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={fetchHealth} disabled={healthLoading}>
                                {healthLoading ? (
                                    <Loader2 className="me-1.5 h-3 w-3 animate-spin" />
                                ) : (
                                    <RefreshCw className="me-1.5 h-3 w-3" />
                                )}
                                {t("debug.rerun")}
                            </Button>
                        </div>

                        {!health && healthLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : health ? (
                            <>
                                <div className="space-y-2">
                                    {health.checks.map((check) => (
                                        <div
                                            key={check.id}
                                            className={cn(
                                                "flex items-start gap-3 rounded-lg border p-3",
                                                check.status === "fail" && "border-red-200 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5"
                                            )}
                                        >
                                            <div className="mt-0.5">{statusIcon(check.status)}</div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">{check.label}</p>
                                                <p className="text-xs text-muted-foreground break-words">{check.detail}</p>
                                                {check.hint && (
                                                    <p className="text-xs mt-1.5 text-red-700 dark:text-red-400">
                                                        <strong>{t("debug.fix")}</strong> {check.hint}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div>
                                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                                        <Server className="h-3.5 w-3.5 text-primary" />
                                        {t("debug.trunkStatus")}
                                    </h4>
                                    {health.trunks.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic">{t("debug.noTrunks")}</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {health.trunks.map((trunk) => (
                                                <div key={trunk.trunkId} className="rounded-lg border p-3 space-y-1.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-sm font-medium truncate">{trunk.name}</p>
                                                        {registrationBadge(trunk.registration, t)}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground font-mono truncate">
                                                        {trunk.host}
                                                        {trunk.transport ? ` · ${trunk.transport.toUpperCase()}` : ""}
                                                    </p>
                                                    <div className="flex items-center gap-1.5 text-xs">
                                                        {trunk.endpointLoaded === true ? (
                                                            <>
                                                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                                                                <span className="text-muted-foreground">{t("debug.endpointLoaded")}</span>
                                                            </>
                                                        ) : trunk.endpointLoaded === false ? (
                                                            <>
                                                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                                                                <span className="text-red-700 dark:text-red-400">
                                                                    {t("debug.endpointNotLoaded")}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                                                <span className="text-muted-foreground">{t("debug.endpointUnknown")}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-xs">
                                                        {trunk.contactStatus === "available" ? (
                                                            <>
                                                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                                                                <span className="text-muted-foreground">{t("debug.providerReachable")}</span>
                                                            </>
                                                        ) : trunk.contactStatus === "unavailable" ? (
                                                            <>
                                                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                                                                <span className="text-red-700 dark:text-red-400">
                                                                    {t("debug.providerUnreachable")}
                                                                </span>
                                                            </>
                                                        ) : trunk.contactStatus === "not_qualified" ? (
                                                            <>
                                                                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                                                <span className="text-muted-foreground">{t("debug.providerNotQualified")}</span>
                                                            </>
                                                        ) : trunk.contactStatus === "missing" ? (
                                                            <>
                                                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                                                                <span className="text-red-700 dark:text-red-400">
                                                                    {t("debug.noContact")}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                                                <span className="text-muted-foreground">{t("debug.providerUnknown")}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                {t("debug.healthFailed")}
                            </p>
                        )}
                    </TabsContent>

                    {/* ── Live Logs ─────────────────────────────── */}
                    <TabsContent value="logs" className="flex-1 min-h-0 flex flex-col mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-muted-foreground">
                                {t("debug.autoRefresh", { seconds: LOG_POLL_INTERVAL_MS / 1000 })}
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                    lastLogId.current = 0;
                                    setLogs([]);
                                }}
                            >
                                <Trash2 className="me-1.5 h-3 w-3" />
                                {t("debug.clearView")}
                            </Button>
                        </div>
                        <div
                            className="flex-1 min-h-0 overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs space-y-1"
                            onScroll={(e) => {
                                const el = e.currentTarget;
                                autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                            }}
                        >
                            {logsLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                            ) : logs.length === 0 ? (
                                <p className="text-muted-foreground italic py-8 text-center">
                                    {t("debug.noEvents")}
                                </p>
                            ) : (
                                logs.map((log) => (
                                    <div key={log.id} className="flex gap-2 leading-relaxed">
                                        <span className="text-muted-foreground/60 shrink-0">
                                            {new Date(log.ts).toLocaleTimeString()}
                                        </span>
                                        <span className={cn("break-words min-w-0", levelStyles[log.level])}>
                                            {log.message}
                                            {log.detail && (
                                                <span className="block text-muted-foreground/70">{log.detail}</span>
                                            )}
                                        </span>
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
