"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import { Badge, Button, Section, toast, useConfirm } from "@wixzel/react";
import Image from "next/image";
import { ArrowSquareOut, SignOut } from "@phosphor-icons/react";
import { SectionLoading } from "@/components/settings/setting-row";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function GoogleCalendarIntegration() {
    const t = useTranslations("settings");
    const searchParams = useSearchParams();
    const router = useRouter();
    // The card is mounted on /integrations now and used to live on /settings: clear the query where it is.
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);
    const [connected, setConnected] = useState(false);
    const [email, setEmail] = useState("");
    const confirm = useConfirm();

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
            router.replace(pathname);
        } else if (p === "error") {
            toast.error(t("toast.calendarConnectFailed"));
            router.replace(pathname);
        } else if (p === "not_configured") {
            toast.error(t("toast.googleOAuthNotConfigured"));
            router.replace(pathname);
        } else if (p === "invalid_client_id") {
            // Caught before the redirect, so the admin sees this instead of
            // Google's own "Error 401: invalid_client" page.
            toast.error(t("toast.googleOAuthInvalidClientId"));
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
            window.location.href = `${apiBase}/auth/google-calendar?userId=${user._id}`;
        } catch {
            toast.error(t("toast.userNotFound"));
        }
    };

    const handleDisconnect = async () => {
        const ok = await confirm({
            title: "Disconnect Google Calendar?",
            description: "Existing events remain on your calendar but new appointments will no longer sync.",
            confirmLabel: t("disconnect"),
            tone: "danger",
        });
        if (!ok) return;
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
        return <SectionLoading>{t("loading")}</SectionLoading>;
    }

    return (
        <Section
            icon={<Image src="/images/integrations/calendar.png" alt={t("googleCalendar.title")} width={16} height={16} className="size-4 object-contain" />}
            title={
                <span className="flex flex-wrap items-center gap-2">
                    {t("googleCalendar.title")}
                    {connected && <Badge tone="success" dot>{t("connected")}</Badge>}
                </span>
            }
            description={t("googleCalendar.description")}
            actions={
                connected ? (
                    <Button
                        variant="secondary"
                        onClick={handleDisconnect}
                        loading={disconnecting}
                        iconStart={<SignOut />}
                    >
                        {t("disconnect")}
                    </Button>
                ) : (
                    <Button variant="primary" onClick={handleConnect} iconStart={<ArrowSquareOut />}>
                        {t("googleCalendar.connect")}
                    </Button>
                )
            }
        >
            {connected && (
                <div className="flex flex-col gap-1 rounded-md bg-surface p-4 text-body-sm">
                    <div className="text-caption font-medium text-fg-muted">{t("googleCalendar.connectedAccount")}</div>
                    <div className="font-medium break-all">{email || t("googleCalendar.primaryAccount")}</div>
                    <div className="text-caption text-fg-muted">{t.rich("googleCalendar.syncTarget", { b: (chunks) => <span className="font-medium text-fg">{chunks}</span> })}</div>
                </div>
            )}
        </Section>
    );
}
