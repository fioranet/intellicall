"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import axios from "axios";
import { Alert, Badge, Button, Section, Switch, toast, useConfirm } from "@wixzel/react";
import { ArrowSquareOut, SignOut, PaperPlaneTilt } from "@phosphor-icons/react";
import { SectionLoading, SettingRow, SettingRows } from "@/components/settings/setting-row";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const EVENT_DEFS: { key: string; label: string; description: string }[] = [
    { key: "leadCreated", label: "Lead created", description: "New lead added manually, via bulk import, or campaign." },
    { key: "leadQualified", label: "Lead qualified", description: "AI marks a lead as qualified after analysis." },
    { key: "callCompleted", label: "Call completed", description: "Call finishes — includes duration, status, recording." },
    { key: "inboundCall", label: "Inbound call", description: "Incoming call hits the platform." },
    { key: "outboundCall", label: "Outbound call", description: "Outbound call is placed." },
    { key: "campaignCompleted", label: "Campaign completed", description: "All calls in a campaign finish." },
    { key: "appointmentBooked", label: "Appointment booked", description: "Manual or AI-booked appointment is scheduled." },
    { key: "callTransferred", label: "Caller transferred", description: "A caller was connected to a human. SIP calls only." },
    { key: "transferFailed", label: "Transfer failed", description: "A human could not be reached and the caller stayed with the agent." },
    { key: "appointmentCanceled", label: "Appointment canceled", description: "Scheduled appointment is canceled." }
];

type Status = {
    connected: boolean;
    teamName: string;
    channelName: string;
    events: Record<string, boolean>;
    available: boolean;
};

export function SlackIntegration() {
    const t = useTranslations("settings");
    const searchParams = useSearchParams();
    const router = useRouter();
    // The card is mounted on /integrations now and used to live on /settings: clear the query where it is.
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);
    const [sendingTest, setSendingTest] = useState(false);
    const [savingEvent, setSavingEvent] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>({
        connected: false,
        teamName: "",
        channelName: "",
        events: {},
        available: true
    });
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
                    connected: !!d.isSlackConnected,
                    teamName: d.slackTeamName || "",
                    channelName: (d.slackChannelName || "").replace(/^#+/, ""),
                    events: d.slackEvents || {},
                    available: d.isSlackAvailable !== false
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

    useEffect(() => {
        const p = searchParams.get("slack");
        if (p === "connected") {
            toast.success(t("toast.slackConnected"));
            fetchStatus();
            router.replace(pathname);
        } else if (p === "error") {
            toast.error(t("toast.slackConnectFailed"));
            router.replace(pathname);
        }
    }, [searchParams, fetchStatus, router, pathname]);

    const handleConnect = () => {
        const userStr = localStorage.getItem("user");
        if (!userStr) {
            toast.error(t("toast.userNotFound"));
            return;
        }
        try {
            const user = JSON.parse(userStr);
            const apiBase = API_BASE_URL.replace(/\/$/, "");
            window.location.href = `${apiBase}/auth/slack?userId=${user._id}`;
        } catch {
            toast.error(t("toast.userNotFound"));
        }
    };

    const handleDisconnect = async () => {
        const ok = await confirm({
            title: "Disconnect Slack?",
            description: "Notifications will stop arriving in the channel. You can reconnect any time.",
            confirmLabel: t("disconnect"),
            tone: "danger",
        });
        if (!ok) return;
        setDisconnecting(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/settings/slack/disconnect`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStatus({ connected: false, teamName: "", channelName: "", events: {}, available: status.available });
            toast.success(t("toast.slackDisconnected"));
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
            await axios.post(`${API_BASE_URL}/settings/slack/test`, { event: "leadCreated" }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(t("toast.slackTestSent", { channel: status.channelName || t("toast.slackDefaultChannel") }));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.slackTestFailed"));
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
            await axios.patch(`${API_BASE_URL}/settings/slack/preferences`, { events: { [key]: value } }, {
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
            icon={<Image src="/images/integrations/slack.png" alt="Slack" width={16} height={16} className="size-4 object-contain" />}
            title={
                <span className="flex flex-wrap items-center gap-2">
                    Slack
                    {status.connected && <Badge tone="success" dot>{t("connected")}</Badge>}
                </span>
            }
            description={t("slack.description")}
            actions={
                status.connected ? (
                    <Button
                        variant="secondary"
                        onClick={handleDisconnect}
                        loading={disconnecting}
                        iconStart={<SignOut />}
                    >
                        {t("disconnect")}
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        onClick={handleConnect}
                        disabled={!status.available}
                        iconStart={<ArrowSquareOut />}
                    >
                        {t("slack.addToSlack")}
                    </Button>
                )
            }
        >
            {!status.available && (
                <Alert tone="warning">
                    {t("slack.notConfigured")}
                    <code className="mx-1 rounded-xs bg-bg-muted px-1 py-0.5 font-mono">SLACK_CLIENT_ID</code> and
                    <code className="mx-1 rounded-xs bg-bg-muted px-1 py-0.5 font-mono">SLACK_CLIENT_SECRET</code> {t("slack.notConfiguredSuffix")}
                </Alert>
            )}

            {status.connected && (
                <>
                    <div className="flex items-center justify-between gap-4 rounded-md bg-surface p-4 text-body-sm">
                        <div className="flex flex-col gap-1">
                            <div className="text-caption font-medium text-fg-muted">{t("slack.postingTo")}</div>
                            <div className="font-medium">
                                {status.teamName ? `${status.teamName} ` : ""}
                                <span className="text-fg-muted">#{status.channelName || t("toast.slackDefaultChannel")}</span>
                            </div>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSendTest}
                            loading={sendingTest}
                            iconStart={<PaperPlaneTilt />}
                        >
                            {t("slack.sendTest")}
                        </Button>
                    </div>

                    <SettingRows inset>
                        {EVENT_DEFS.map((ev) => {
                            const enabled = status.events[ev.key] !== false;
                            return (
                                <SettingRow
                                    key={ev.key}
                                    htmlFor={`slack-event-${ev.key}`}
                                    label={ev.label}
                                    description={ev.description}
                                    control={
                                        <Switch
                                            id={`slack-event-${ev.key}`}
                                            checked={enabled}
                                            disabled={savingEvent === ev.key}
                                            onCheckedChange={(v) => toggleEvent(ev.key, v)}
                                        />
                                    }
                                />
                            );
                        })}
                    </SettingRows>
                </>
            )}
        </Section>
    );
}
