"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "@wixzel/react";
import { Section, Button, Input, Field, Alert, CopyField, PageHeader, Tooltip, Spinner } from "@wixzel/react";
import { WhatsAppMark } from "@/components/whatsapp/parts";
import { FloppyDisk, Eye, EyeSlash } from "@phosphor-icons/react";
import { AdminNav } from "@/components/admin/nav";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const PROVIDER_LABELS: Record<string, string> = { google: "Google", hubspot: "HubSpot", slack: "Slack", meta: "Meta" };

type ProviderForm = { clientId: string; clientSecret: string; callbackUrl: string };
type Provider = "google" | "hubspot" | "slack";
type IntegrationsState = Record<Provider, ProviderForm>;

/** The platform's Meta app, for WhatsApp Embedded Signup and the shared webhook (GET /admin/integrations → meta). */
type MetaForm = { appId: string; appSecret: string; esConfigId: string; webhookVerifyToken: string; systemUserToken: string; systemUserId: string };
type MetaInfo = { webhookUrl: string; envConfigured: boolean };
const BLANK_META: MetaForm = { appId: "", appSecret: "", esConfigId: "", webhookVerifyToken: "", systemUserToken: "", systemUserId: "" };

export default function AdminIntegrationsPage() {
    const t = useTranslations("admin");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<Provider | "meta" | null>(null);
    const [meta, setMeta] = useState<MetaForm>(BLANK_META);
    const [metaInfo, setMetaInfo] = useState<MetaInfo>({ webhookUrl: "", envConfigured: false });
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
                const m = data.meta || {};
                setMeta({
                    appId: m.appId || "",
                    appSecret: m.appSecret || "",
                    esConfigId: m.esConfigId || "",
                    webhookVerifyToken: m.webhookVerifyToken || "",
                    systemUserToken: m.systemUserToken || "",
                    systemUserId: m.systemUserId || ""
                });
                setMetaInfo({ webhookUrl: m.webhookUrl || "", envConfigured: Boolean(m.envConfigured) });
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

    const handleSaveMeta = async () => {
        setSaving("meta");
        try {
            const token = localStorage.getItem("token");
            await axios.patch(
                `${API_BASE_URL}/admin/integrations`,
                { meta },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(t("integrations.toast.saved", { provider: PROVIDER_LABELS.meta }));
        } catch (err) {
            const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
            toast.error(message || t("integrations.toast.saveFailed"));
        } finally {
            setSaving(null);
        }
    };

    const updateField = (provider: Provider, field: keyof ProviderForm, value: string) => {
        setState((s) => ({ ...s, [provider]: { ...s[provider], [field]: value } }));
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("integrations.title")} description={t("integrations.subtitle")} />

            <AdminNav currentPath="/admin/integrations" />

            {loading ? (
                <div className="flex items-center justify-center gap-2 py-20 text-fg-muted">
                    <Spinner /> {t("loading")}
                </div>
            ) : (
            <div className="grid gap-4 max-w-3xl">
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

                <MetaCard
                    form={meta}
                    info={metaInfo}
                    onChange={(field, v) => setMeta((m) => ({ ...m, [field]: v }))}
                    onSave={handleSaveMeta}
                    saving={saving === "meta"}
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
        <Section
            icon={<img src={logoSrc} alt={title} width={20} height={20} className="size-5 object-contain" />}
            title={title}
            description={
                <>
                    {description}{" "}
                    <a href={docsUrl} target="_blank" className="text-accent-ink underline underline-offset-2">{t("integrations.openDocs")}</a>
                </>
            }
        >
            {notice && <Alert tone="warning">{notice}</Alert>}

            <Field label={t("integrations.clientId")}>
                <Input
                    value={form.clientId}
                    onChange={(e) => onChange("clientId", e.target.value)}
                    placeholder={clientIdPlaceholder || "••••-••••-••••-••••"}
                    className="font-mono"
                />
            </Field>

            <Field label={t("integrations.clientSecret")}>
                <Input
                    type={showSecret ? "text" : "password"}
                    value={form.clientSecret}
                    onChange={(e) => onChange("clientSecret", e.target.value)}
                    placeholder="••••••••••••••••"
                    className="font-mono"
                    trailing={
                        <Tooltip content={showSecret ? t("integrations.hide") : t("integrations.show")}>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                onClick={onToggleSecret}
                                aria-label={showSecret ? t("integrations.hide") : t("integrations.show")}
                            >
                                {showSecret ? <EyeSlash /> : <Eye />}
                            </Button>
                        </Tooltip>
                    }
                />
            </Field>

            {callbackPath && (
                <Field label={t("integrations.callbackUrl")} hint={t("integrations.callbackHint")}>
                    <Input
                        value={form.callbackUrl}
                        onChange={(e) => onChange("callbackUrl", e.target.value)}
                        placeholder={`https://api.yourdomain.com${callbackPath}`}
                        className="font-mono"
                    />
                </Field>
            )}

            {redirectPaths && redirectPaths.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <span className="text-body-sm font-medium">{t("integrations.redirectUris")}</span>
                    {redirectPaths.map((path) => (
                        <CopyField key={path} value={`${origin}${path}`} className="ltr-data" />
                    ))}
                    <p className="text-caption text-fg-muted">
                        {t("integrations.redirectUrisHint")}
                    </p>
                </div>
            )}

            <div className="flex justify-end">
                <Button variant="primary" onClick={onSave} loading={saving} iconStart={<FloppyDisk />}>
                    {t("integrations.save", { provider: title })}
                </Button>
            </div>
        </Section>
    );
}

/**
 * The platform's Meta app: what "Connect WhatsApp" (Embedded Signup) runs
 * with, and the webhook every connected number's messages arrive through. The
 * same values can come from the environment; then the form only shows them.
 */
function MetaCard({ form, info, onChange, onSave, saving }: {
    form: MetaForm;
    info: MetaInfo;
    onChange: (field: keyof MetaForm, v: string) => void;
    onSave: () => void;
    saving: boolean;
}) {
    const t = useTranslations("admin");
    const [show, setShow] = useState<Record<string, boolean>>({});
    const secretToggle = (key: string) => (
        <Tooltip content={show[key] ? t("integrations.hide") : t("integrations.show")}>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
                aria-label={show[key] ? t("integrations.hide") : t("integrations.show")}>
                {show[key] ? <EyeSlash /> : <Eye />}
            </Button>
        </Tooltip>
    );
    const text = (field: keyof MetaForm, label: string, hint?: string, placeholder?: string) => (
        <Field label={label} hint={hint}>
            <Input value={form[field]} onChange={(e) => onChange(field, e.target.value)} placeholder={placeholder || "••••••••••••••••"} className="font-mono" dir="ltr" />
        </Field>
    );
    const secret = (field: keyof MetaForm, label: string, hint?: string) => (
        <Field label={label} hint={hint}>
            <Input type={show[field] ? "text" : "password"} value={form[field]} onChange={(e) => onChange(field, e.target.value)}
                placeholder="••••••••••••••••" className="font-mono" dir="ltr" autoComplete="off" trailing={secretToggle(field)} />
        </Field>
    );
    return (
        <Section
            icon={<WhatsAppMark size={12} />}
            title={t("integrations.metaTitle")}
            description={
                <>
                    {t("integrations.metaDescription")}{" "}
                    <a href="https://developers.facebook.com/apps" target="_blank" className="text-accent-ink underline underline-offset-2">{t("integrations.openDocs")}</a>
                </>
            }
        >
            {info.envConfigured && <Alert tone="info">{t("integrations.metaEnvNotice")}</Alert>}

            {text("appId", t("integrations.metaAppId"), undefined, "1234567890123456")}
            {secret("appSecret", t("integrations.metaAppSecret"))}
            {text("esConfigId", t("integrations.metaEsConfigId"), t("integrations.metaEsConfigIdHint"), "1234567890123456")}
            {text("webhookVerifyToken", t("integrations.metaVerifyToken"), t("integrations.metaVerifyTokenHint"))}
            {secret("systemUserToken", t("integrations.metaSystemUserToken"), t("integrations.metaSystemUserTokenHint"))}
            {text("systemUserId", t("integrations.metaSystemUserId"), t("integrations.metaSystemUserIdHint"), "1234567890123456")}

            {info.webhookUrl && (
                <div className="flex flex-col gap-1.5">
                    <span className="text-body-sm font-medium">{t("integrations.metaWebhookUrl")}</span>
                    <CopyField value={info.webhookUrl} className="ltr-data" />
                    <p className="text-caption text-fg-muted">{t("integrations.metaWebhookHint")}</p>
                </div>
            )}

            <div className="flex justify-end">
                <Button variant="primary" onClick={onSave} loading={saving} iconStart={<FloppyDisk />}>
                    {t("integrations.save", { provider: PROVIDER_LABELS.meta })}
                </Button>
            </div>
        </Section>
    );
}
