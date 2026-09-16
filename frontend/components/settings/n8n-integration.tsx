"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Download, ExternalLink, Loader2, LogOut, Send, Workflow } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const EVENT_KEYS = [
    "leadCreated", "leadQualified", "callCompleted", "inboundCall",
    "outboundCall", "campaignCompleted", "appointmentBooked", "appointmentCanceled",
    "callTransferred", "transferFailed",
] as const;

const TEMPLATES: { file: string; key: string }[] = [
    { file: "intellicall-instant-call.json", key: "instantCall" },
    { file: "intellicall-call-log-to-sheets.json", key: "callLogToSheets" },
    { file: "intellicall-lead-qualified-crm.json", key: "leadQualifiedCrm" },
];

type Status = {
    connected: boolean;
    url: string;
    events: Record<string, boolean>;
};

export function N8nIntegration() {
    const t = useTranslations("settings");
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [sendingTest, setSendingTest] = useState(false);
    const [savingEvent, setSavingEvent] = useState<string | null>(null);
    const [urlInput, setUrlInput] = useState("");
    const [status, setStatus] = useState<Status>({ connected: false, url: "", events: {} });

    const fetchStatus = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            const resp = await axios.get(`${API_BASE_URL}/settings/config-status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.data?.status === "success") {
                const d = resp.data.data;
                setStatus({
                    connected: !!d.isN8nConnected,
                    url: d.n8nWebhookUrl || "",
                    events: d.n8nEvents || {}
                });
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleConnect = async () => {
        if (!urlInput.trim()) {
            toast.error(t("toast.n8nUrlRequired"));
            return;
        }
        setConnecting(true);
        try {
            const token = localStorage.getItem("token");
            const resp = await axios.post(`${API_BASE_URL}/settings/n8n/connect`, { url: urlInput.trim() }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.data?.status === "success") {
                toast.success(t("toast.n8nConnected"));
                setUrlInput("");
                fetchStatus();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.n8nConnectFailed"));
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm("Disconnect n8n? Events will stop flowing to your workflow. You can reconnect any time.")) return;
        setDisconnecting(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/settings/n8n/disconnect`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStatus({ connected: false, url: "", events: {} });
            toast.success(t("toast.n8nDisconnected"));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.disconnectFailed"));
        } finally {
            setDisconnecting(false);
        }
    };

    const handleSendTest = async () => {
        setSendingTest(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/settings/n8n/test`, { event: "leadCreated" }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(t("toast.testSent"));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.testFailed"));
        } finally {
            setSendingTest(false);
        }
    };

    const toggleEvent = async (key: string, value: boolean) => {
        const prev = status.events[key] !== false;
        setStatus((s) => ({ ...s, events: { ...s.events, [key]: value } }));
        setSavingEvent(key);
        try {
            const token = localStorage.getItem("token");
            await axios.patch(`${API_BASE_URL}/settings/n8n/preferences`, { events: { [key]: value } }, {
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.preferenceFailed"));
            setStatus((s) => ({ ...s, events: { ...s.events, [key]: prev } }));
        } finally {
            setSavingEvent(null);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin me-2" /> {t("loading")}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Image src="/images/integrations/n8n.png" alt="n8n" width={24} height={24} className="shrink-0" />
                            n8n
                            {status.connected && (
                                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 ms-2">
                                    <CheckCircle2 className="h-3 w-3 me-1" /> {t("connected")}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {t("n8n.description")}
                        </CardDescription>
                    </div>
                    {status.connected && (
                        <Button
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50 gap-2 shrink-0"
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                        >
                            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                            {t("disconnect")}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {!status.connected && (
                    <>
                        <div className="rounded-xl border p-4 bg-muted/20 text-xs text-muted-foreground space-y-1">
                            <p className="text-sm font-bold text-foreground">{t("n8n.howToTitle")}</p>
                            <p>{t.rich("n8n.step1", { b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>, code: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}</p>
                            <p>{t.rich("n8n.step2", { b: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}</p>
                            <p>{t.rich("n8n.step3", { shape: "{ event, timestamp, data }", code: (chunks) => <code className="px-1 py-0.5 bg-muted rounded">{chunks}</code> })}</p>
                        </div>

                        <div className="flex gap-2">
                            <Input
                                placeholder={t("n8n.urlPlaceholder")}
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="font-mono text-sm"
                            />
                            <Button
                                className="bg-[#EA4B71] hover:bg-[#d33a5f] text-white gap-2 shrink-0"
                                onClick={handleConnect}
                                disabled={connecting}
                            >
                                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                {t("n8n.connect")}
                            </Button>
                        </div>
                    </>
                )}

                {status.connected && (
                    <>
                        <div className="rounded-xl border p-4 bg-muted/20 text-sm flex items-center justify-between gap-4 flex-wrap">
                            <div className="space-y-1 min-w-0">
                                <div className="text-xs font-bold uppercase text-muted-foreground">{t("n8n.deliveringTo")}</div>
                                <div className="font-mono text-xs truncate max-w-[26rem]">{status.url}</div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={handleSendTest}
                                disabled={sendingTest}
                            >
                                {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                {t("n8n.sendTest")}
                            </Button>
                        </div>

                        <div className="rounded-xl border bg-muted/20 divide-y">
                            {EVENT_KEYS.map((key) => {
                                const enabled = status.events[key] !== false;
                                return (
                                    <div key={key} className="flex items-start justify-between gap-4 p-4">
                                        <div className="space-y-0.5">
                                            <Label className="text-sm font-bold">{t(`n8n.events.${key}.label`)}</Label>
                                            <p className="text-xs text-muted-foreground">{t(`n8n.events.${key}.description`)}</p>
                                        </div>
                                        <Switch
                                            checked={enabled}
                                            disabled={savingEvent === key}
                                            onCheckedChange={(v) => toggleEvent(key, v)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                <div className="rounded-xl border bg-muted/20">
                    <div className="p-4 pb-2">
                        <Label className="text-sm font-bold flex items-center gap-2">
                            <Workflow className="h-4 w-4" /> {t("n8n.templatesTitle")}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {t("n8n.templatesHint")}
                        </p>
                    </div>
                    <div className="divide-y">
                        {TEMPLATES.map((tpl) => (
                            <div key={tpl.file} className="flex items-center justify-between gap-4 p-4">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-semibold">{t(`n8n.templates.${tpl.key}.name`)}</p>
                                    <p className="text-xs text-muted-foreground">{t(`n8n.templates.${tpl.key}.description`)}</p>
                                </div>
                                <a href={`/n8n-templates/${tpl.file}`} download className="shrink-0">
                                    <Button variant="outline" size="sm" className="gap-2">
                                        <Download className="h-4 w-4" /> {t("n8n.download")}
                                    </Button>
                                </a>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    {t("n8n.newToN8n")}{" "}
                    <a href="https://n8n.io" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
                        n8n.io <ExternalLink className="h-3 w-3" />
                    </a>
                </p>
            </CardContent>
        </Card>
    );
}
