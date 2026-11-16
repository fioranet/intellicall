"use client";

import { useTranslations } from "next-intl";
import { useSettings } from "@/components/settings-provider";
import { useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import { Badge, Button, Field, Input, Section, Separator, Switch, toast, useConfirm } from "@wixzel/react";
import Image from "next/image";
import { ArrowSquareOut, Key, SignOut } from "@phosphor-icons/react";
import { SectionLoading, SettingRow, SettingRows } from "@/components/settings/setting-row";

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
    // The card is mounted on /integrations now and used to live on /settings: clear the query where it is.
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [savingPref, setSavingPref] = useState<string | null>(null);
    const [disconnecting, setDisconnecting] = useState(false);
    const [serviceKey, setServiceKey] = useState("");
    const [savingKey, setSavingKey] = useState(false);
    const [replacingKey, setReplacingKey] = useState(false);
    const confirm = useConfirm();
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
            router.replace(pathname);
        } else if (p === "error") {
            toast.error(t("toast.hubspotConnectFailed"));
            router.replace(pathname);
        }
    }, [searchParams, fetchStatus, router, pathname, t]);

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
        const ok = await confirm({
            title: "Disconnect HubSpot?",
            description: "New leads will no longer sync, but contacts already pushed to HubSpot stay there.",
            confirmLabel: t("disconnect"),
            tone: "danger",
        });
        if (!ok) return;
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
        return <SectionLoading>{t("loadingIntegrations")}</SectionLoading>;
    }

    const showKeyForm = !status.connected || replacingKey;

    const keyForm = (
        <Field label={t("hubspot.serviceKeyLabel")} hint={t("hubspot.serviceKeyHint")} id="hubspot-service-key">
            <div className="flex flex-col gap-2 sm:flex-row">
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
                        variant="primary"
                        onClick={handleSaveKey}
                        disabled={!serviceKey.trim()}
                        loading={savingKey}
                        iconStart={<Key />}
                    >
                        {t("hubspot.serviceKeySave")}
                    </Button>
                    {replacingKey && (
                        <Button
                            variant="ghost"
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
        </Field>
    );

    return (
        <Section
            icon={<Image src="/images/integrations/hubspot.png" alt="HubSpot" width={16} height={16} className="size-4 object-contain" />}
            title={
                <span className="flex flex-wrap items-center gap-2">
                    {t("hubspot.title")}
                    {status.connected && <Badge tone="success" dot>{t("connected")}</Badge>}
                </span>
            }
            description={t("hubspot.description")}
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
            {status.connected && (
                <div className="flex flex-col items-start gap-1">
                    {status.hubDomain && (
                        <p className="text-caption text-fg-muted">
                            {t("hubspot.connectedTo")} <span className="font-medium text-fg">{status.hubDomain}</span>
                        </p>
                    )}
                    <p className="text-caption text-fg-muted">
                        {status.authMode === "serviceKey"
                            ? t("hubspot.connectedVia", { last4: status.keyLast4 })
                            : t("hubspot.connectedViaOAuth")}
                    </p>
                    {status.authMode === "serviceKey" && !replacingKey && (
                        <Button variant="link" size="sm" onClick={() => setReplacingKey(true)}>
                            {t("hubspot.serviceKeyReplace")}
                        </Button>
                    )}
                </div>
            )}

            {showKeyForm && (
                <div className="flex flex-col items-start gap-2">
                    <div className="w-full">{keyForm}</div>
                    <Button variant="link" size="sm" asChild iconEnd={<ArrowSquareOut />}>
                        <a href={SERVICE_KEY_DOCS} target="_blank" rel="noopener noreferrer">
                            {t("hubspot.serviceKeyDocs")}
                        </a>
                    </Button>
                </div>
            )}

            {!status.connected && status.oauthAvailable && (
                <>
                    <Separator />
                    <div className="flex flex-col items-start gap-2">
                        <h3 className="text-body-sm font-medium">{t("hubspot.legacyOAuthTitle")}</h3>
                        <p className="text-caption text-fg-muted">{t("hubspot.legacyOAuthHint")}</p>
                        <Button variant="secondary" onClick={handleConnect} iconStart={<ArrowSquareOut />}>
                            {t("hubspot.connect")}
                        </Button>
                    </div>
                </>
            )}

            <SettingRows inset>
                <SettingRow
                    htmlFor="hubspot-sync-leads"
                    label={t("hubspot.syncLeads")}
                    description={t("hubspot.syncLeadsHint", { appName: branding.appName })}
                    control={
                        <Switch
                            id="hubspot-sync-leads"
                            checked={status.syncLeads}
                            disabled={!status.connected || savingPref === "syncLeads"}
                            onCheckedChange={(v) => togglePref("syncLeads", v)}
                        />
                    }
                />
            </SettingRows>
        </Section>
    );
}
