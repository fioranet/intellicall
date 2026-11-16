"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import {
    Badge,
    Button,
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    Spinner,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@wixzel/react";
import { CheckCircle, XCircle, Question, ArrowsClockwise, Scroll, Stethoscope, HardDrives, Trash } from "@phosphor-icons/react";
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
    if (status === "pass") return <CheckCircle className="size-4 shrink-0 text-success-ink" />;
    if (status === "fail") return <XCircle className="size-4 shrink-0 text-danger-ink" />;
    return <Question className="size-4 shrink-0 text-fg-muted" />;
};

const registrationBadge = (registration: TrunkCheck["registration"], t: (key: string) => string) => {
    switch (registration) {
        case "registered":
            return <Badge tone="success" dot>{t("debug.registration.registered")}</Badge>;
        case "failed":
            return <Badge tone="danger" dot>{t("debug.registration.failed")}</Badge>;
        case "missing":
            return <Badge tone="danger" dot>{t("debug.registration.missing")}</Badge>;
        case "pending":
            return <Badge tone="warning" dot>{t("debug.registration.pending")}</Badge>;
        case "not_applicable":
            return <Badge>{t("debug.registration.ipAuth")}</Badge>;
        default:
            return <Badge>{t("debug.registration.unknown")}</Badge>;
    }
};

const levelStyles: Record<LogEntry["level"], string> = {
    error: "text-danger-ink",
    warn: "text-warning-ink",
    success: "text-success-ink",
    info: "text-fg-muted",
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
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent side="right" style={{ "--wx-drawer-size": "672px" } as CSSProperties}>
                <DrawerHeader>
                    <DrawerTitle className="flex items-center gap-2">
                        <Stethoscope className="size-5 text-accent-ink" />
                        {t("debug.title")}
                    </DrawerTitle>
                    <DrawerDescription>
                        {t("debug.description")}
                    </DrawerDescription>
                </DrawerHeader>

                <Tabs defaultValue="health" variant="segment" className="min-h-0 flex-1 p-5">
                    <TabsList>
                        <TabsTrigger value="health">
                            <Stethoscope />
                            {t("debug.tabHealth")}
                        </TabsTrigger>
                        <TabsTrigger value="logs">
                            <Scroll />
                            {t("debug.tabLogs")}
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Health Checks ─────────────────────────── */}
                    <TabsContent value="health" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-caption text-fg-muted">
                                {health?.checkedAt
                                    ? `Last checked ${new Date(health.checkedAt).toLocaleTimeString()}`
                                    : "Running checks…"}
                            </p>
                            <Button size="xs" onClick={fetchHealth} loading={healthLoading} iconStart={<ArrowsClockwise />}>
                                {t("debug.rerun")}
                            </Button>
                        </div>

                        {!health && healthLoading ? (
                            <div className="flex justify-center py-12">
                                <Spinner size="xl" className="text-accent-ink" />
                            </div>
                        ) : health ? (
                            <>
                                <ul className="divide-y divide-border overflow-hidden rounded-md bg-bg-muted">
                                    {health.checks.map((check) => (
                                        <li
                                            key={check.id}
                                            className={cn(
                                                "flex items-start gap-3 p-3",
                                                check.status === "fail" && "bg-danger-subtle"
                                            )}
                                        >
                                            <div className="mt-0.5">{statusIcon(check.status)}</div>
                                            <div className="min-w-0">
                                                <p className="text-body-sm font-medium">{check.label}</p>
                                                <p className="break-words text-caption text-fg-muted">{check.detail}</p>
                                                {check.hint && (
                                                    <p className="mt-1.5 text-caption text-danger-ink">
                                                        <strong>{t("debug.fix")}</strong> {check.hint}
                                                    </p>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                <div className="flex flex-col gap-2">
                                    <h4 className="flex items-center gap-1.5 text-heading-sm">
                                        <HardDrives className="size-4 text-accent-ink" />
                                        {t("debug.trunkStatus")}
                                    </h4>
                                    {health.trunks.length === 0 ? (
                                        <p className="text-caption italic text-fg-muted">{t("debug.noTrunks")}</p>
                                    ) : (
                                        <ul className="flex flex-col gap-2">
                                            {health.trunks.map((trunk) => (
                                                <li key={trunk.trunkId} className="flex flex-col gap-1.5 rounded-md bg-bg-muted p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="truncate text-body-sm font-medium">{trunk.name}</p>
                                                        {registrationBadge(trunk.registration, t)}
                                                    </div>
                                                    <p className="truncate font-mono text-caption text-fg-muted">
                                                        {trunk.host}
                                                        {trunk.transport ? ` · ${trunk.transport.toUpperCase()}` : ""}
                                                    </p>
                                                    <div className="flex items-center gap-1.5 text-caption">
                                                        {trunk.endpointLoaded === true ? (
                                                            <>
                                                                <CheckCircle className="size-3.5 text-success-ink" />
                                                                <span className="text-fg-muted">{t("debug.endpointLoaded")}</span>
                                                            </>
                                                        ) : trunk.endpointLoaded === false ? (
                                                            <>
                                                                <XCircle className="size-3.5 text-danger-ink" />
                                                                <span className="text-danger-ink">
                                                                    {t("debug.endpointNotLoaded")}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Question className="size-3.5 text-fg-muted" />
                                                                <span className="text-fg-muted">{t("debug.endpointUnknown")}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-caption">
                                                        {trunk.contactStatus === "available" ? (
                                                            <>
                                                                <CheckCircle className="size-3.5 text-success-ink" />
                                                                <span className="text-fg-muted">{t("debug.providerReachable")}</span>
                                                            </>
                                                        ) : trunk.contactStatus === "unavailable" ? (
                                                            <>
                                                                <XCircle className="size-3.5 text-danger-ink" />
                                                                <span className="text-danger-ink">
                                                                    {t("debug.providerUnreachable")}
                                                                </span>
                                                            </>
                                                        ) : trunk.contactStatus === "not_qualified" ? (
                                                            <>
                                                                <Question className="size-3.5 text-fg-muted" />
                                                                <span className="text-fg-muted">{t("debug.providerNotQualified")}</span>
                                                            </>
                                                        ) : trunk.contactStatus === "missing" ? (
                                                            <>
                                                                <XCircle className="size-3.5 text-danger-ink" />
                                                                <span className="text-danger-ink">
                                                                    {t("debug.noContact")}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Question className="size-3.5 text-fg-muted" />
                                                                <span className="text-fg-muted">{t("debug.providerUnknown")}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="py-8 text-center text-body-sm text-fg-muted">
                                {t("debug.healthFailed")}
                            </p>
                        )}
                    </TabsContent>

                    {/* ── Live Logs ─────────────────────────────── */}
                    <TabsContent value="logs" className="flex min-h-0 flex-1 flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-caption text-fg-muted">
                                {t("debug.autoRefresh", { seconds: LOG_POLL_INTERVAL_MS / 1000 })}
                            </p>
                            <Button
                                size="xs"
                                iconStart={<Trash />}
                                onClick={() => {
                                    lastLogId.current = 0;
                                    setLogs([]);
                                }}
                            >
                                {t("debug.clearView")}
                            </Button>
                        </div>
                        {/* A tonal log: one line per event, newest at the bottom, in the level's colour. */}
                        <div
                            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-md bg-bg-muted p-3 font-mono text-caption"
                            onScroll={(e) => {
                                const el = e.currentTarget;
                                autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                            }}
                        >
                            {logsLoading ? (
                                <div className="flex justify-center py-8">
                                    <Spinner size="lg" className="text-accent-ink" />
                                </div>
                            ) : logs.length === 0 ? (
                                <p className="py-8 text-center italic text-fg-muted">
                                    {t("debug.noEvents")}
                                </p>
                            ) : (
                                logs.map((log) => (
                                    <div key={log.id} className="flex gap-2 leading-relaxed">
                                        <span className="shrink-0 tabular-nums text-fg-subtle">
                                            {new Date(log.ts).toLocaleTimeString()}
                                        </span>
                                        <span className={cn("min-w-0 break-words", levelStyles[log.level])}>
                                            {log.message}
                                            {log.detail && (
                                                <span className="block text-fg-muted">{log.detail}</span>
                                            )}
                                        </span>
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    </TabsContent>
                </Tabs>
            </DrawerContent>
        </Drawer>
    );
}
