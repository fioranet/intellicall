"use client";

import { useTranslations } from "next-intl";
import { useSettings } from "@/components/settings-provider";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, LogOut } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const SERVICE_KEY_DOCS =
    "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/account-service-keys";

type AuthMode = "serviceKey" | "oauth" | "";

type Status = {
    connected: boolean;
    hubDomain: string;
    syncLeads: boolean;
    /** Legacy OAuth app configured at the platform level. */
    oauthAvailable: boolean;
    authMode: AuthMode;
    keyLast4: string;
};

export function HubSpotIntegration() {
    const t = useTranslations("settings");
    const { branding } = useSettings();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [savingPref, setSavingPref] = useState<string | null>(null);
    const [disconnecting, setDisconnecting] = useState(false);
    const [serviceKey, setServiceKey] = useState("");
    const [savingKey, setSavingKey] = useState(false);
    const [replacingKey, setReplacingKey] = useState(false);
    const [status, setStatus] = useState<Status>({
        connected: false,
        hubDomain: "",
        syncLeads: true,
        oauthAvailable: false,
        authMode: "",
        keyLast4: ""
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
                    connected: !!d.isHubSpotConnected,
                    hubDomain: d.hubspotHubDomain || "",
                    syncLeads: d.hubspotSyncLeads !== false,
                    oauthAvailable: d.isHubSpotAvailable === true,
                    authMode: (d.hubspotAuthMode as AuthMode) || "",
                    keyLast4: d.hubspotServiceKeyLast4 || ""
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
        const p = searchParams.get("hubspot");
        if (p === "connected") {
            toast.success(t("toast.hubspotConnected"));
            fetchStatus();
            router.replace("/settings");
        } else if (p === "error") {
            toast.error(t("toast.hubspotConnectFailed"));
            router.replace("/settings");
        }
    }, [searchParams, fetchStatus, router, t]);

    const handleSaveKey = async () => {
        const key = serviceKey.trim();
        if (!key) return;
        setSavingKey(true);
        try {
            const token = localStorage.getItem("token");
            const resp = await axios.post(
                `${API_BASE_URL}/settings/hubspot/service-key`,
                { serviceKey: key },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (resp.data?.status === "success") {
                toast.success(t("toast.hubspotKeySaved"));
                setServiceKey("");
                setReplacingKey(false);
                fetchStatus();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.hubspotKeyFailed"));
        } finally {
            setSavingKey(false);
        }
    };

    const handleConnect = () => {
        const userStr = localStorage.getItem("user");
        if (!userStr) {
            toast.error(t("toast.userNotFound"));
            return;
        }
        try {
            const user = JSON.parse(userStr);
            const apiBase = API_BASE_URL.replace(/\/$/, "");
            window.location.href = `${apiBase}/auth/hubspot?userId=${user._id}`;
        } catch {
            toast.error(t("toast.userNotFound"));
        }
    };

    const handleDisconnect = async () => {
        if (!confirm("Disconnect HubSpot? New leads will no longer sync, but contacts already pushed to HubSpot stay there.")) return;
        setDisconnecting(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/settings/hubspot/disconnect`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(t("toast.hubspotDisconnected"));
            setStatus((s) => ({ ...s, connected: false, hubDomain: "", authMode: "", keyLast4: "" }));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.disconnectFailed"));
        } finally {
            setDisconnecting(false);
        }
    };

    const togglePref = async (key: "syncLeads", value: boolean) => {
        const prev = status[key];
        setStatus((s) => ({ ...s, [key]: value }));
        setSavingPref(key);
        try {
            const token = localStorage.getItem("token");
            await axios.patch(`${API_BASE_URL}/settings/hubspot/preferences`, { hubspotSyncLeads: value }, {
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.preferenceFailed"));
            setStatus((s) => ({ ...s, [key]: prev }));
        } finally {
            setSavingPref(null);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin me-2" /> {t("loadingIntegrations")}
                </CardContent>
            </Card>
        );
    }

    const showKeyForm = !status.connected || replacingKey;

    const keyForm = (
        <div className="space-y-2">
            <Label htmlFor="hubspot-service-key" className="text-sm font-bold">
                {t("hubspot.serviceKeyLabel")}
            </Label>
            <div className="flex flex-col sm:flex-row gap-2">
                <Input
                    id="hubspot-service-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t("hubspot.serviceKeyPlaceholder")}
                    value={serviceKey}
                    onChange={(e) => setServiceKey(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && serviceKey.trim() && !savingKey) handleSaveKey();
                    }}
                    disabled={savingKey}
                    className="font-mono"
                />
                <div className="flex gap-2">
                    <Button
                        className="bg-orange-500 hover:bg-orange-600 gap-2 shrink-0"
                        onClick={handleSaveKey}
                        disabled={savingKey || !serviceKey.trim()}
                    >
                        {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        {t("hubspot.serviceKeySave")}
                    </Button>
                    {replacingKey && (
                        <Button
                            variant="ghost"
                            className="shrink-0"
                            onClick={() => {
                                setReplacingKey(false);
                                setServiceKey("");
                            }}
                            disabled={savingKey}
                        >
                            {t("hubspot.serviceKeyCancel")}
                        </Button>
                    )}
                </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("hubspot.serviceKeyHint")}</p>
            <a
                href={SERVICE_KEY_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"
            >
                {t("hubspot.serviceKeyDocs")} <ExternalLink className="h-3 w-3" />
            </a>
        </div>
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Image src="/images/integrations/hubspot.png" alt="HubSpot" width={24} height={24} className="shrink-0" />
                            {t("hubspot.title")}
                            {status.connected && (
                                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 ms-2">
                                    <CheckCircle2 className="h-3 w-3 me-1" /> {t("connected")}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {t("hubspot.description")}
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
                {status.connected && (
                    <div className="space-y-1">
                        {status.hubDomain && (
                            <p className="text-xs text-muted-foreground">
                                {t("hubspot.connectedTo")} <span className="font-medium text-foreground">{status.hubDomain}</span>
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {status.authMode === "serviceKey"
                                ? t("hubspot.connectedVia", { last4: status.keyLast4 })
                                : t("hubspot.connectedViaOAuth")}
                        </p>
                        {status.authMode === "serviceKey" && !replacingKey && (
                            <Button
                                variant="link"
                                className="h-auto p-0 text-xs text-orange-600"
                                onClick={() => setReplacingKey(true)}
                            >
                                {t("hubspot.serviceKeyReplace")}
                            </Button>
                        )}
                    </div>
                )}

                {showKeyForm && keyForm}

                {!status.connected && status.oauthAvailable && (
                    <>
                        <Separator />
                        <div className="space-y-2">
                            <Label className="text-sm font-bold">{t("hubspot.legacyOAuthTitle")}</Label>
                            <p className="text-xs text-muted-foreground">{t("hubspot.legacyOAuthHint")}</p>
                            <Button variant="outline" className="gap-2" onClick={handleConnect}>
                                <ExternalLink className="h-4 w-4" />
                                {t("hubspot.connect")}
                            </Button>
                        </div>
                    </>
                )}

                <div className="rounded-xl border p-4 bg-muted/20">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-bold">{t("hubspot.syncLeads")}</Label>
                            <p className="text-xs text-muted-foreground">
                                {t("hubspot.syncLeadsHint", { appName: branding.appName })}
                            </p>
                        </div>
                        <Switch
                            checked={status.syncLeads}
                            disabled={!status.connected || savingPref === "syncLeads"}
                            onCheckedChange={(v) => togglePref("syncLeads", v)}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
