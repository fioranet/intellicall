"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { CheckCircle2, ExternalLink, Loader2, LogOut } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function GoogleCalendarIntegration() {
    const t = useTranslations("settings");
    const searchParams = useSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);
    const [connected, setConnected] = useState(false);
    const [email, setEmail] = useState("");

    const fetchStatus = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            const resp = await axios.get(`${API_BASE_URL}/settings/config-status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.data?.status === "success") {
                setConnected(!!resp.data.data.isGoogleCalendarConnected);
                setEmail(resp.data.data.googleCalendarEmail || "");
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
        const p = searchParams.get("google_calendar");
        if (p === "connected") {
            toast.success(t("toast.calendarConnected"));
            fetchStatus();
            router.replace("/settings");
        } else if (p === "error") {
            toast.error(t("toast.calendarConnectFailed"));
            router.replace("/settings");
        } else if (p === "not_configured") {
            toast.error(t("toast.googleOAuthNotConfigured"));
            router.replace("/settings");
        } else if (p === "invalid_client_id") {
            // Caught before the redirect, so the admin sees this instead of
            // Google's own "Error 401: invalid_client" page.
            toast.error(t("toast.googleOAuthInvalidClientId"));
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
            window.location.href = `${apiBase}/auth/google-calendar?userId=${user._id}`;
        } catch {
            toast.error(t("toast.userNotFound"));
        }
    };

    const handleDisconnect = async () => {
        if (!confirm("Disconnect Google Calendar? Existing events remain on your calendar but new appointments will no longer sync.")) return;
        setDisconnecting(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/settings/google-calendar/disconnect`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setConnected(false);
            setEmail("");
            toast.success(t("toast.calendarDisconnected"));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.disconnectFailed"));
        } finally {
            setDisconnecting(false);
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
                            <Image src="/images/integrations/calendar.png" alt={t("googleCalendar.title")} width={24} height={24} className="shrink-0" />
                            {t("googleCalendar.title")}
                            {connected && (
                                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 ms-2">
                                    <CheckCircle2 className="h-3 w-3 me-1" /> {t("connected")}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {t("googleCalendar.description")}
                        </CardDescription>
                    </div>
                    {connected ? (
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
                            className="bg-blue-600 hover:bg-blue-700 gap-2 shrink-0"
                            onClick={handleConnect}
                        >
                            <ExternalLink className="h-4 w-4" />
                            {t("googleCalendar.connect")}
                        </Button>
                    )}
                </div>
            </CardHeader>
            {connected && (
                <CardContent className="space-y-3">
                    <div className="rounded-xl border p-4 bg-muted/20 text-sm space-y-1">
                        <div className="text-xs font-bold uppercase text-muted-foreground">{t("googleCalendar.connectedAccount")}</div>
                        <div className="font-medium break-all">{email || t("googleCalendar.primaryAccount")}</div>
                        <div className="text-xs text-muted-foreground">{t.rich("googleCalendar.syncTarget", { b: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}</div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
