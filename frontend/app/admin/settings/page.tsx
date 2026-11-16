"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useRef } from "react";
import { CurrencyDollar, FloppyDisk, Palette, UploadSimple, Trash, Image, ArrowCounterClockwise, ArrowsClockwise, ArrowSquareOut, CheckCircle, Envelope, ShareNetwork, Star } from "@phosphor-icons/react";
import {
    Spinner,
    Button,
    Input,
    Label,
    Field,
    Switch,
    Section,
    Alert,
    ConfirmDialog,
    PageHeader,
    Separator,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@wixzel/react";
import axios from "axios";
import { toast } from "@wixzel/react";
import { AdminNav } from "@/components/admin/nav";
import { DEFAULT_BRAND_COLOUR } from "@/lib/brand-colour";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

/** Current app version – compared against latest from version API */
const CURRENT_VERSION = "v13.0";

const VERSION_CHECK_URL = "https://envatosupportapi.wixzel.com/api/products/latest-version/61664541";
const INSTALLER_URL = "https://envato.aqeelshamz.com/installer";

const BRANDING_DEFAULTS: Record<string, string> = {
    logoLight: "/images/logo_black.png",
    logoDark: "/images/logo_white.png",
    favicon: "/favicon.ico",
};

// The default branding files are blank on purpose (see logoToShow in settings-provider), and
// the app shows these in their place until an admin uploads their own.
const BLANK_DEFAULTS: Record<string, string> = {
    "/images/logo_black.png": "/images/originals/logo_black.png",
    "/images/logo_white.png": "/images/originals/logo_white.png",
    "/favicon.ico": "/images/originals/favicon.ico",
};

function BrandingUpload({
    label,
    description,
    type,
    currentUrl,
    onUploaded,
    onDeleted,
}: {
    label: string;
    description: string;
    type: string;
    currentUrl: string;
    onUploaded: (url: string) => void;
    onDeleted: (defaultUrl: string) => void;
}) {
    const t = useTranslations("admin");
    const c = useTranslations("common");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const isUploaded = currentUrl.startsWith("/uploads/");

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", type);

        try {
            setUploading(true);
            const token = localStorage.getItem("token");
            const res = await axios.post(`${API_BASE_URL}/admin/branding/upload`, formData, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "multipart/form-data",
                },
            });
            if (res.data?.status === "success") {
                onUploaded(res.data.data.url);
                toast.success(t("settings.toast.uploaded", { label }));
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || `Failed to upload ${label.toLowerCase()}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDelete = async () => {
        try {
            setDeleting(true);
            const token = localStorage.getItem("token");
            const res = await axios.delete(`${API_BASE_URL}/admin/branding/${type}`, {
                headers: { "Authorization": `Bearer ${token}` },
            });
            if (res.data?.status === "success") {
                onDeleted(res.data.data.url);
                toast.success(t("settings.toast.reverted", { label }));
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || `Failed to delete ${label.toLowerCase()}`);
        } finally {
            setDeleting(false);
        }
    };

    // Build the preview URL — uploaded files are served from the backend
    const previewSrc = isUploaded
        ? `${API_BASE_URL.replace(/\/api$/, "")}${currentUrl}`
        : BLANK_DEFAULTS[currentUrl] ?? currentUrl;

    return (
        <div className="flex flex-col gap-1.5">
            <Label>{label}</Label>
            <div className="flex items-center gap-4">
                {/* Each logo sits on the theme it's made for: a white logo disappears on a light tile. */}
                <div
                    data-theme={type === "logoDark" ? "dark" : type === "logoLight" ? "light" : undefined}
                    className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-md bg-bg-muted"
                >
                    {currentUrl ? (
                        <img
                            src={previewSrc}
                            alt={label}
                            className="max-w-full max-h-full object-contain p-1"
                        />
                    ) : (
                        <Image className="size-6 text-fg-muted" />
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.ico"
                            onChange={handleUpload}
                            className="hidden"
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            loading={uploading}
                            iconStart={<UploadSimple />}
                        >
                            {isUploaded ? "Replace" : "Upload"}
                        </Button>
                        {isUploaded && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleDelete}
                                loading={deleting}
                                iconStart={<Trash />}
                            >
                                {c("actions.delete")}
                            </Button>
                        )}
                    </div>
                    <p className="text-caption text-fg-muted">{description}</p>
                    {isUploaded && (
                        <p className="text-caption text-fg-subtle italic">{t("settings.branding.customUploaded")}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdminSettingsPage() {
    const t = useTranslations("admin");
    const c = useTranslations("common");
    const [settings, setSettings] = useState<any>({
        currency: "USD",
        showCodeCanyonButton: false,
        showSelfHostingSection: false,
        supportEmail: "",
        privacyEmail: "privacy@intellicall.ai",
        legalEmail: "legal@intellicall.ai",
        contactEmail: "",
        hqAddress: "",
        socialLinks: { instagram: "", linkedin: "", youtube: "" },
        branding: {
            appName: "IntelliCallAI",
            primaryColor: DEFAULT_BRAND_COLOUR,
            logoLight: "/images/logo_black.png",
            logoDark: "/images/logo_white.png",
            favicon: "/favicon.ico",
        }
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [versionCheckLoading, setVersionCheckLoading] = useState(false);
    const [versionCheckError, setVersionCheckError] = useState<string | null>(null);

    const checkForUpdates = useCallback(async () => {
        try {
            setVersionCheckLoading(true);
            setVersionCheckError(null);
            const res = await axios.get<{ version: string }>(VERSION_CHECK_URL);
            const version = res.data?.version ?? null;
            setLatestVersion(version);
        } catch (err: any) {
            setVersionCheckError(err.message || "Failed to check for updates");
            setLatestVersion(null);
        } finally {
            setVersionCheckLoading(false);
        }
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/admin/settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success" && response.data.data.settings) {
                const s = response.data.data.settings;
                setSettings({
                    currency: s.currency || "USD",
                    showCodeCanyonButton: Boolean(s.showCodeCanyonButton),
                    showSelfHostingSection: Boolean(s.showSelfHostingSection),
                    supportEmail: s.supportEmail || "support@intellicall.ai",
                    privacyEmail: s.privacyEmail || "privacy@intellicall.ai",
                    legalEmail: s.legalEmail || "legal@intellicall.ai",
                    contactEmail: typeof s.contactEmail === "string" ? s.contactEmail : "",
                    hqAddress: typeof s.hqAddress === "string" ? s.hqAddress : "",
                    socialLinks: {
                        instagram: s.socialLinks?.instagram || "",
                        linkedin: s.socialLinks?.linkedin || "",
                        youtube: s.socialLinks?.youtube || "",
                    },
                    branding: {
                        appName: s.branding?.appName || "IntelliCallAI",
                        primaryColor: s.branding?.primaryColor || DEFAULT_BRAND_COLOUR,
                        logoLight: s.branding?.logoLight || "/images/logo_black.png",
                        logoDark: s.branding?.logoDark || "/images/logo_white.png",
                        favicon: s.branding?.favicon || "/favicon.ico",
                    }
                });
            }
        } catch (err: any) {
            toast.error(t("settings.toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        checkForUpdates();
    }, [checkForUpdates]);

    const handleSave = async () => {
        try {
            setSaving(true);
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/admin/settings`, settings, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                toast.success(t("settings.toast.saved"));
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (err: any) {
            toast.error(t("settings.toast.saveFailed"));
        } finally {
            setSaving(false);
        }
    };

    const updateBranding = (key: string, value: string) => {
        setSettings({
            ...settings,
            branding: { ...settings.branding, [key]: value }
        });
    };

    const handleResetBranding = async () => {
        try {
            setResetting(true);
            const token = localStorage.getItem("token");
            const res = await axios.post(`${API_BASE_URL}/admin/branding/reset`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.data?.status === "success") {
                setSettings({
                    ...settings,
                    branding: res.data.data.branding
                });
                toast.success(t("settings.toast.brandingReset"));
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (err: any) {
            toast.error(t("settings.toast.brandingResetFailed"));
        } finally {
            setResetting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Spinner size="xl" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />

            <AdminNav currentPath="/admin/settings" />

            <div className="grid gap-4 max-w-4xl">
                {/* Branding */}
                <Section
                    icon={<Palette />}
                    title={t("settings.branding.title")}
                    description={t("settings.branding.description")}
                    actions={
                        <ConfirmDialog
                            trigger={
                                <Button variant="secondary" size="sm" iconStart={<ArrowCounterClockwise />}>
                                    {t("settings.branding.reset")}
                                </Button>
                            }
                            title={t("settings.branding.resetTitle")}
                            description={t("settings.branding.resetDescription")}
                            cancelLabel={c("actions.cancel")}
                            confirmLabel={t("settings.branding.resetAll")}
                            tone="danger"
                            onConfirm={handleResetBranding}
                        />
                    }
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t("settings.branding.appName")} hint={t("settings.branding.appNameHint")} id="appName">
                            <Input
                                placeholder={t("settings.branding.appName")}
                                value={settings.branding.appName}
                                onChange={(e) => updateBranding("appName", e.target.value)}
                            />
                        </Field>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="primaryColor">{t("settings.branding.primaryColor")}</Label>
                            <div className="flex gap-2">
                                {/* The chosen brand colour is data: the native picker shows it as a swatch. */}
                                <input
                                    id="primaryColor"
                                    type="color"
                                    value={settings.branding.primaryColor}
                                    onChange={(e) => updateBranding("primaryColor", e.target.value)}
                                    className="h-control-md w-14 shrink-0 cursor-pointer rounded-md bg-bg-muted p-1 wx-focus"
                                />
                                <Input
                                    value={settings.branding.primaryColor}
                                    onChange={(e) => updateBranding("primaryColor", e.target.value)}
                                    placeholder="#8078F0"
                                    className="font-mono"
                                    aria-label={t("settings.branding.primaryColor")}
                                />
                            </div>
                            <p className="text-caption text-fg-muted">{t("settings.branding.primaryColorHint")}</p>
                        </div>
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            <BrandingUpload
                                label={t("settings.branding.logoLight")}
                                description={t("settings.branding.logoLightHint")}
                                type="logoLight"
                                currentUrl={settings.branding.logoLight}
                                onUploaded={(url) => updateBranding("logoLight", url)}
                                onDeleted={(url) => updateBranding("logoLight", url)}
                            />
                            <BrandingUpload
                                label={t("settings.branding.logoDark")}
                                description={t("settings.branding.logoDarkHint")}
                                type="logoDark"
                                currentUrl={settings.branding.logoDark}
                                onUploaded={(url) => updateBranding("logoDark", url)}
                                onDeleted={(url) => updateBranding("logoDark", url)}
                            />
                        </div>

                        <BrandingUpload
                            label={t("settings.branding.favicon")}
                            description={t("settings.branding.faviconHint")}
                            type="favicon"
                            currentUrl={settings.branding.favicon}
                            onUploaded={(url) => updateBranding("favicon", url)}
                            onDeleted={(url) => updateBranding("favicon", url)}
                        />
                    </div>

                    {/* Preview */}
                    <div className="rounded-md bg-bg-muted p-4">
                        <p className="mb-3 text-overline text-fg-muted">{t("settings.branding.preview")}</p>
                        <div className="flex items-center gap-3">
                            <div className="size-8 rounded-sm" style={{ backgroundColor: settings.branding.primaryColor }} />
                            <span className="text-body-md font-semibold text-fg">{settings.branding.appName || t("settings.branding.yourApp")}</span>
                        </div>
                    </div>
                </Section>

                {/* Updates */}
                <Section
                    icon={<ArrowsClockwise />}
                    title={t("settings.updates.title")}
                    description={t("settings.updates.description")}
                >
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="text-body-sm">
                            <span className="text-fg-muted">{t("settings.updates.currentVersion")} </span>
                            <span className="font-semibold tabular-nums">{CURRENT_VERSION}</span>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={checkForUpdates}
                            loading={versionCheckLoading}
                            iconStart={<ArrowsClockwise />}
                        >
                            {t("settings.updates.check")}
                        </Button>
                    </div>
                    {versionCheckError && (
                        <p className="text-body-sm text-danger-ink">{versionCheckError}</p>
                    )}
                    {!versionCheckLoading && latestVersion != null && (
                        latestVersion !== CURRENT_VERSION ? (
                            <Alert
                                tone="info"
                                title={t("settings.updates.available")}
                                action={
                                    <Button variant="link" size="sm" iconEnd={<ArrowSquareOut />} asChild>
                                        <a href={INSTALLER_URL} target="_blank" rel="noopener noreferrer">
                                            {t("settings.updates.openInstaller")}
                                        </a>
                                    </Button>
                                }
                            >
                                {t("settings.updates.latestIs", { version: latestVersion })}
                            </Alert>
                        ) : (
                            <Alert tone="success" icon={<CheckCircle />}>
                                {t("settings.updates.upToDate", { version: CURRENT_VERSION })}
                            </Alert>
                        )
                    )}

                    <Alert
                        tone="warning"
                        icon={<Star />}
                        title={t("settings.updates.rateTitle", { appName: settings.branding.appName })}
                    >
                        <p>{t("settings.updates.rateBody")}</p>
                        <Button variant="link" size="sm" iconStart={<Star />} iconEnd={<ArrowSquareOut />} className="mt-1" asChild>
                            <a href="https://codecanyon.net/downloads" target="_blank" rel="noopener noreferrer">
                                {t("settings.updates.rateCta")}
                            </a>
                        </Button>
                    </Alert>
                </Section>

                {/* Public site: emails & social (landing, legal pages, footer) */}
                <Section
                    icon={<Envelope />}
                    title={t("settings.contact.title")}
                    description={t("settings.contact.description")}
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t("settings.contact.privacyEmail")} hint={t("settings.contact.privacyEmailHint")} id="privacyEmail">
                            <Input
                                type="email"
                                placeholder="privacy@example.com"
                                value={settings.privacyEmail}
                                onChange={(e) => setSettings({ ...settings, privacyEmail: e.target.value })}
                            />
                        </Field>
                        <Field label={t("settings.contact.legalEmail")} hint={t("settings.contact.legalEmailHint")} id="legalEmail">
                            <Input
                                type="email"
                                placeholder="legal@example.com"
                                value={settings.legalEmail}
                                onChange={(e) => setSettings({ ...settings, legalEmail: e.target.value })}
                            />
                        </Field>
                    </div>
                    <Field label={t("settings.contact.contactEmail")} hint={t("settings.contact.contactEmailHint")} id="contactEmail" className="max-w-md">
                        <Input
                            type="email"
                            placeholder={t("settings.contact.contactEmailPlaceholder")}
                            value={settings.contactEmail}
                            onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                        />
                    </Field>
                    <Field label={t("settings.contact.hqAddress")} hint={t("settings.contact.hqAddressHint")} id="hqAddress" className="max-w-md">
                        <Input
                            type="text"
                            placeholder={t("settings.contact.hqAddressPlaceholder")}
                            value={settings.hqAddress}
                            onChange={(e) => setSettings({ ...settings, hqAddress: e.target.value })}
                        />
                    </Field>

                    <Separator />

                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-body-sm font-medium text-fg">
                            <ShareNetwork className="size-4 text-fg-muted" />
                            {t("settings.contact.socialLinks")}
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <Field label={t("settings.contact.instagram")} id="socialInstagram">
                                <Input
                                    type="url"
                                    placeholder="https://instagram.com/..."
                                    value={settings.socialLinks.instagram}
                                    onChange={(e) =>
                                        setSettings({
                                            ...settings,
                                            socialLinks: { ...settings.socialLinks, instagram: e.target.value },
                                        })
                                    }
                                />
                            </Field>
                            <Field label={t("settings.contact.linkedin")} id="socialLinkedin">
                                <Input
                                    type="url"
                                    placeholder="https://linkedin.com/company/..."
                                    value={settings.socialLinks.linkedin}
                                    onChange={(e) =>
                                        setSettings({
                                            ...settings,
                                            socialLinks: { ...settings.socialLinks, linkedin: e.target.value },
                                        })
                                    }
                                />
                            </Field>
                            <Field label={t("settings.contact.youtube")} id="socialYoutube">
                                <Input
                                    type="url"
                                    placeholder="https://youtube.com/..."
                                    value={settings.socialLinks.youtube}
                                    onChange={(e) =>
                                        setSettings({
                                            ...settings,
                                            socialLinks: { ...settings.socialLinks, youtube: e.target.value },
                                        })
                                    }
                                />
                            </Field>
                        </div>
                    </div>
                </Section>

                {/* General Settings */}
                <Section
                    icon={<CurrencyDollar />}
                    title={t("settings.general.title")}
                    description={t("settings.general.description")}
                >
                    <Field label={t("settings.general.currency")} id="currency" className="w-full md:w-[200px]">
                        <Select
                            value={settings.currency}
                            onValueChange={(val) => setSettings({ ...settings, currency: val })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={t("settings.general.selectCurrency")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="USD">USD ($)</SelectItem>
                                <SelectItem value="EUR">EUR (€)</SelectItem>
                                <SelectItem value="GBP">GBP (£)</SelectItem>
                                <SelectItem value="INR">INR (₹)</SelectItem>
                                <SelectItem value="AUD">AUD ($)</SelectItem>
                                <SelectItem value="ZAR">ZAR (R)</SelectItem>
                                <SelectItem value="CAD">CAD (C$)</SelectItem>
                                <SelectItem value="BRL">BRL (R$)</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>

                    <Field label={t("settings.general.supportEmail")} hint={t("settings.general.supportEmailHint")} id="supportEmail" className="max-w-md">
                        <Input
                            type="email"
                            placeholder="support@example.com"
                            value={settings.supportEmail}
                            onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                        />
                    </Field>

                    <div className="flex flex-col divide-y divide-border border-t border-border">
                        <div className="flex items-start justify-between gap-4 py-3">
                            <div className="flex flex-col gap-1">
                                <Label htmlFor="showCodeCanyonButton" className="cursor-pointer">{t("settings.general.showStoreButton")}</Label>
                                <p className="max-w-md text-caption text-fg-muted">
                                    {t("settings.general.showStoreButtonHint")}
                                </p>
                            </div>
                            <Switch
                                id="showCodeCanyonButton"
                                checked={!!settings.showCodeCanyonButton}
                                onCheckedChange={(checked) => setSettings({ ...settings, showCodeCanyonButton: checked })}
                            />
                        </div>

                        <div className="flex items-start justify-between gap-4 pt-3">
                            <div className="flex flex-col gap-1">
                                <Label htmlFor="showSelfHostingSection" className="cursor-pointer">{t("settings.general.showSelfHosting")}</Label>
                                <p className="max-w-md text-caption text-fg-muted">
                                    {t("settings.general.showSelfHostingHint")}
                                </p>
                            </div>
                            <Switch
                                id="showSelfHostingSection"
                                checked={!!settings.showSelfHostingSection}
                                onCheckedChange={(checked) => setSettings({ ...settings, showSelfHostingSection: checked })}
                            />
                        </div>
                    </div>
                </Section>

                <div className="flex justify-end">
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        loading={saving}
                        iconStart={<FloppyDisk />}
                    >
                        {t("settings.general.save")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
