"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import axios from "axios";
import { Badge, Button, CopyField, Input, Section, Switch, toast, useConfirm } from "@wixzel/react";
import { CheckCircle, DownloadSimple, ArrowSquareOut, SignOut, PaperPlaneTilt, FlowArrow } from "@phosphor-icons/react";
import { SectionLoading, SettingRow, SettingRows } from "@/components/settings/setting-row";

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
    const confirm = useConfirm();

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
        const ok = await confirm({
            title: "Disconnect n8n?",
            description: "Events will stop flowing to your workflow. You can reconnect any time.",
            confirmLabel: t("disconnect"),
            tone: "danger",
        });
        if (!ok) return;
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
        return <SectionLoading>{t("loading")}</SectionLoading>;
    }

    return (
        <Section
            icon={<Image src="/images/integrations/n8n.png" alt="n8n" width={16} height={16} className="size-4 object-contain" />}
            title={
                <span className="flex flex-wrap items-center gap-2">
                    n8n
                    {status.connected && <Badge tone="success" dot>{t("connected")}</Badge>}
                </span>
            }
            description={t("n8n.description")}
            actions={
                status.connected && (
                    <Button
                        variant="secondary"
                        onClick={handleDisconnect}
                        loading={disconnecting}
                        iconStart={<SignOut />}
                    >
                        {t("disconnect")}
                    </Button>
                )
            }
        >
            {!status.connected && (
                <>
                    <div className="flex flex-col gap-1 rounded-md bg-surface p-4 text-caption text-fg-muted">
                        <p className="text-body-sm font-medium text-fg">{t("n8n.howToTitle")}</p>
                        <p>{t.rich("n8n.step1", { b: (chunks) => <span className="font-medium text-fg">{chunks}</span>, code: (chunks) => <span className="font-medium text-fg">{chunks}</span> })}</p>
                        <p>{t.rich("n8n.step2", { b: (chunks) => <span className="font-medium text-fg">{chunks}</span> })}</p>
                        <p>{t.rich("n8n.step3", { shape: "{ event, timestamp, data }", code: (chunks) => <code className="rounded-xs bg-bg-muted px-1 py-0.5 font-mono">{chunks}</code> })}</p>
                    </div>

                    <div className="flex gap-2">
                        <Input
                            placeholder={t("n8n.urlPlaceholder")}
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            className="font-mono"
                        />
                        <Button
                            variant="primary"
                            onClick={handleConnect}
                            loading={connecting}
                            iconStart={<CheckCircle />}
                        >
                            {t("n8n.connect")}
                        </Button>
                    </div>
                </>
            )}

            {status.connected && (
                <>
                    <div className="flex flex-wrap items-end gap-3 rounded-md bg-surface p-4">
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <div className="text-caption font-medium text-fg-muted">{t("n8n.deliveringTo")}</div>
                            <CopyField value={status.url} />
                        </div>
                        <Button
                            variant="secondary"
                            onClick={handleSendTest}
                            loading={sendingTest}
                            iconStart={<PaperPlaneTilt />}
                        >
                            {t("n8n.sendTest")}
                        </Button>
                    </div>

                    <SettingRows inset>
                        {EVENT_KEYS.map((key) => {
                            const enabled = status.events[key] !== false;
                            return (
                                <SettingRow
                                    key={key}
                                    htmlFor={`n8n-event-${key}`}
                                    label={t(`n8n.events.${key}.label`)}
                                    description={t(`n8n.events.${key}.description`)}
                                    control={
                                        <Switch
                                            id={`n8n-event-${key}`}
                                            checked={enabled}
                                            disabled={savingEvent === key}
                                            onCheckedChange={(v) => toggleEvent(key, v)}
                                        />
                                    }
                                />
                            );
                        })}
                    </SettingRows>
                </>
            )}

            <div className="flex flex-col gap-3 rounded-md bg-surface p-4">
                <div className="flex flex-col gap-0.5">
                    <h3 className="flex items-center gap-2 text-body-sm font-medium">
                        <FlowArrow className="size-4 text-fg-muted" /> {t("n8n.templatesTitle")}
                    </h3>
                    <p className="text-caption text-fg-muted">
                        {t("n8n.templatesHint")}
                    </p>
                </div>
                <div className="flex flex-col divide-y divide-border">
                    {TEMPLATES.map((tpl) => (
                        <div key={tpl.file} className="flex items-center justify-between gap-4 py-3 last:pb-0">
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <p className="text-body-sm font-medium">{t(`n8n.templates.${tpl.key}.name`)}</p>
                                <p className="text-caption text-fg-muted">{t(`n8n.templates.${tpl.key}.description`)}</p>
                            </div>
                            <Button variant="secondary" size="sm" asChild iconStart={<DownloadSimple />}>
                                <a href={`/n8n-templates/${tpl.file}`} download>
                                    {t("n8n.download")}
                                </a>
                            </Button>
                        </div>
                    ))}
                </div>
            </div>

            <p className="flex items-center gap-1 text-caption text-fg-muted">
                {t("n8n.newToN8n")}{" "}
                <a href="https://n8n.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent-ink underline">
                    n8n.io <ArrowSquareOut className="size-3" />
                </a>
            </p>
        </Section>
    );
}
