"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Eye, EyeOff } from "lucide-react";
import { AdminNav } from "@/components/admin/nav";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const PROVIDER_LABELS: Record<string, string> = { google: "Google", hubspot: "HubSpot", slack: "Slack" };

type ProviderForm = { clientId: string; clientSecret: string; callbackUrl: string };
type Provider = "google" | "hubspot" | "slack";
type IntegrationsState = Record<Provider, ProviderForm>;

export default function AdminIntegrationsPage() {
    const t = useTranslations("admin");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<Provider | null>(null);
    const [showSecret, setShowSecret] = useState<Record<Provider, boolean>>({ google: false, hubspot: false, slack: false });
    const [state, setState] = useState<IntegrationsState>({
        google: { clientId: "", clientSecret: "", callbackUrl: "" },
        hubspot: { clientId: "", clientSecret: "", callbackUrl: "" },
        slack: { clientId: "", clientSecret: "", callbackUrl: "" }
    });

    const fetchData = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            const resp = await axios.get(`${API_BASE_URL}/admin/integrations`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.data?.status === "success") {
                const data = resp.data.data.integrations;
                setState({
                    google: {
                        clientId: data.google?.clientId || "",
                        clientSecret: data.google?.clientSecret || "",
                        callbackUrl: ""
                    },
                    hubspot: {
                        clientId: data.hubspot?.clientId || "",
                        clientSecret: data.hubspot?.clientSecret || "",
                        callbackUrl: data.hubspot?.callbackUrl || ""
                    },
                    slack: {
                        clientId: data.slack?.clientId || "",
                        clientSecret: data.slack?.clientSecret || "",
                        callbackUrl: data.slack?.callbackUrl || ""
                    }
                });
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("integrations.toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSave = async (provider: Provider) => {
        setSaving(provider);
        try {
            const token = localStorage.getItem("token");
            await axios.patch(
                `${API_BASE_URL}/admin/integrations`,
                { [provider]: state[provider] },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(t("integrations.toast.saved", { provider: PROVIDER_LABELS[provider] }));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("integrations.toast.saveFailed"));
        } finally {
            setSaving(null);
        }
    };

    const updateField = (provider: Provider, field: keyof ProviderForm, value: string) => {
        setState((s) => ({ ...s, [provider]: { ...s[provider], [field]: value } }));
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora">{t("integrations.title")}</h1>
                <p className="text-muted-foreground">
                    {t("integrations.subtitle")}
                </p>
            </div>

            <AdminNav currentPath="/admin/integrations" />

            {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin me-2" /> {t("loading")}
                </div>
            ) : (
            <div className="grid gap-6 max-w-3xl">
                <ProviderCard
                    title={t("integrations.googleTitle")}
                    description={t("integrations.googleDescription")}
                    logoSrc="/images/integrations/calendar.png"
                    docsUrl="https://console.cloud.google.com/apis/credentials"
                    clientIdPlaceholder="000000000000-xxxxxxxx.apps.googleusercontent.com"
                    redirectPaths={["/api/auth/google-calendar/callback", "/api/auth/google-sheets/callback"]}
                    form={state.google}
                    showSecret={showSecret.google}
                    onToggleSecret={() => setShowSecret((s) => ({ ...s, google: !s.google }))}
                    onChange={(field, v) => updateField("google", field, v)}
                    onSave={() => handleSave("google")}
                    saving={saving === "google"}
                />

                <ProviderCard
                    title={t("integrations.hubspotTitle")}
                    description={t("integrations.hubspotDescription")}
                    logoSrc="/images/integrations/hubspot.png"
                    docsUrl="https://developers.hubspot.com/get-started"
                    callbackPath="/api/auth/hubspot/callback"
                    notice={t("integrations.hubspotLegacyNotice")}
                    form={state.hubspot}
                    showSecret={showSecret.hubspot}
                    onToggleSecret={() => setShowSecret((s) => ({ ...s, hubspot: !s.hubspot }))}
                    onChange={(field, v) => updateField("hubspot", field, v)}
                    onSave={() => handleSave("hubspot")}
                    saving={saving === "hubspot"}
                />

                <ProviderCard
                    title={t("integrations.slackTitle")}
                    description={t("integrations.slackDescription")}
                    logoSrc="/images/integrations/slack.png"
                    docsUrl="https://api.slack.com/apps"
                    callbackPath="/api/auth/slack/callback"
                    form={state.slack}
                    showSecret={showSecret.slack}
                    onToggleSecret={() => setShowSecret((s) => ({ ...s, slack: !s.slack }))}
                    onChange={(field, v) => updateField("slack", field, v)}
                    onSave={() => handleSave("slack")}
                    saving={saving === "slack"}
                />
            </div>
            )}
        </div>
    );
}

function ProviderCard({
    title, description, logoSrc, docsUrl, callbackPath, notice,
    clientIdPlaceholder, redirectPaths,
    form, showSecret, onToggleSecret, onChange, onSave, saving
}: {
    title: string;
    description: string;
    logoSrc: string;
    docsUrl: string;
    // Providers with a single OAuth flow expose an overridable callback URL.
    callbackPath?: string;
    notice?: string;
    clientIdPlaceholder?: string;
    // Providers whose redirect URIs are fixed and must simply be registered
    // with the provider — Google has one per flow, so there is nothing to edit.
    redirectPaths?: string[];
    form: ProviderForm;
    showSecret: boolean;
    onToggleSecret: () => void;
    onChange: (field: keyof ProviderForm, v: string) => void;
    onSave: () => void;
    saving: boolean;
}) {
    const t = useTranslations("admin");
    // The redirect URIs Google must have registered are built from the API
    // origin the browser is already talking to, so they are copy-pasteable
    // rather than something the admin has to assemble by hand.
    const origin = API_BASE_URL.replace(/\/api\/?$/, "");
    return (
        <Card>
            <CardHeader>
                <div className="flex items-start gap-3">
                    <img src={logoSrc} alt={title} width={32} height={32} className="shrink-0 object-contain" />
                    <div className="flex-1">
                        <CardTitle>{title}</CardTitle>
                        <CardDescription className="mt-1">
                            {description}{" "}
                            <a href={docsUrl} target="_blank" className="underline text-primary">{t("integrations.openDocs")}</a>
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {notice && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        {notice}
                    </div>
                )}

                <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">{t("integrations.clientId")}</Label>
                    <Input
                        value={form.clientId}
                        onChange={(e) => onChange("clientId", e.target.value)}
                        placeholder={clientIdPlaceholder || "••••-••••-••••-••••"}
                        className="font-mono text-sm"
                    />
                </div>

                <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">{t("integrations.clientSecret")}</Label>
                    <div className="flex gap-2">
                        <Input
                            type={showSecret ? "text" : "password"}
                            value={form.clientSecret}
                            onChange={(e) => onChange("clientSecret", e.target.value)}
                            placeholder="••••••••••••••••"
                            className="font-mono text-sm flex-1"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={onToggleSecret}
                            title={showSecret ? t("integrations.hide") : t("integrations.show")}
                        >
                            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>

                {callbackPath && (
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">{t("integrations.callbackUrl")}</Label>
                        <Input
                            value={form.callbackUrl}
                            onChange={(e) => onChange("callbackUrl", e.target.value)}
                            placeholder={`https://api.yourdomain.com${callbackPath}`}
                            className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            {t("integrations.callbackHint")}
                        </p>
                    </div>
                )}

                {redirectPaths && redirectPaths.length > 0 && (
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">{t("integrations.redirectUris")}</Label>
                        <div className="rounded-xl border bg-muted/40 p-3 space-y-1">
                            {redirectPaths.map((path) => (
                                <code key={path} className="block font-mono text-xs text-foreground break-all">
                                    {origin}{path}
                                </code>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t("integrations.redirectUrisHint")}
                        </p>
                    </div>
                )}

                <div className="flex justify-end pt-2">
                    <Button onClick={onSave} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t("integrations.save", { provider: title })}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
