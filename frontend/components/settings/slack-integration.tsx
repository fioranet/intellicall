"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ExternalLink, Loader2, LogOut, Send } from "lucide-react";

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
            router.replace("/settings");
        } else if (p === "error") {
            toast.error(t("toast.slackConnectFailed"));
            router.replace("/settings");
        }
    }, [searchParams, fetchStatus, router]);

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
        if (!confirm("Disconnect Slack? Notifications will stop arriving in the channel. You can reconnect any time.")) return;
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
                            <Image src="/images/integrations/slack.png" alt="Slack" width={24} height={24} className="shrink-0" />
                            Slack
                            {status.connected && (
                                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 ms-2">
                                    <CheckCircle2 className="h-3 w-3 me-1" /> {t("connected")}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {t("slack.description")}
                        </CardDescription>
                    </div>
                    {status.connected ? (
                        <Button
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50 gap-2 shrink-0"
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                        >
                            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                            {t("disconnect")}
                        </Button>
                    ) : (
                        <Button
                            className="bg-[#4A154B] hover:bg-[#3a1039] text-white gap-2 shrink-0"
                            onClick={handleConnect}
                            disabled={!status.available}
                        >
                            <ExternalLink className="h-4 w-4" />
                            {t("slack.addToSlack")}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {!status.available && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        {t("slack.notConfigured")}
                        <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded">SLACK_CLIENT_ID</code> and
                        <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded">SLACK_CLIENT_SECRET</code> {t("slack.notConfiguredSuffix")}
                    </div>
                )}

                {status.connected && (
                    <>
                        <div className="rounded-xl border p-4 bg-muted/20 text-sm flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="text-xs font-bold uppercase text-muted-foreground">{t("slack.postingTo")}</div>
                                <div className="font-medium">
                                    {status.teamName ? `${status.teamName} ` : ""}
                                    <span className="text-muted-foreground">#{status.channelName || t("toast.slackDefaultChannel")}</span>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={handleSendTest}
                                disabled={sendingTest}
                            >
                                {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                {t("slack.sendTest")}
                            </Button>
                        </div>

                        <div className="rounded-xl border bg-muted/20 divide-y">
                            {EVENT_DEFS.map((ev) => {
                                const enabled = status.events[ev.key] !== false;
                                return (
                                    <div key={ev.key} className="flex items-start justify-between gap-4 p-4">
                                        <div className="space-y-0.5">
                                            <Label className="text-sm font-bold">{ev.label}</Label>
                                            <p className="text-xs text-muted-foreground">{ev.description}</p>
                                        </div>
                                        <Switch
                                            checked={enabled}
                                            disabled={savingEvent === ev.key}
                                            onCheckedChange={(v) => toggleEvent(ev.key, v)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
