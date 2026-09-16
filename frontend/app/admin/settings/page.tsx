"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useRef } from "react";
import {
    Loader2,
    DollarSign,
    Save,
    Palette,
    Upload,
    Trash2,
    ImageIcon,
    RotateCcw,
    RefreshCw,
    ExternalLink,
    CheckCircle2,
    Mail,
    Share2,
    Star,
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import axios from "axios";
import { toast } from "sonner";
import { AdminNav } from "@/components/admin/nav";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

/** Current app version – compared against latest from version API */
const CURRENT_VERSION = "v11.7";

const VERSION_CHECK_URL = "https://envatosupportapi.wixzel.com/api/products/latest-version/61664541";
const INSTALLER_URL = "https://envato.aqeelshamz.com/installer";

const BRANDING_DEFAULTS: Record<string, string> = {
    logoLight: "/images/logo_black.png",
    logoDark: "/images/logo_white.png",
    favicon: "/favicon.ico",
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
        : currentUrl;

    return (
        <div className="space-y-3">
            <Label>{label}</Label>
            <div className="flex items-center gap-4">
                <div className="w-24 h-16 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                    {currentUrl ? (
                        <img
                            src={previewSrc}
                            alt={label}
                            className="max-w-full max-h-full object-contain p-1"
                        />
                    ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
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
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="text-xs"
                        >
                            {uploading ? <Loader2 className="h-3 w-3 animate-spin me-1" /> : <Upload className="h-3 w-3 me-1" />}
                            {isUploaded ? "Replace" : "Upload"}
                        </Button>
                        {isUploaded && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleDelete}
                                disabled={deleting}
                                className="text-xs text-destructive hover:text-destructive"
                            >
                                {deleting ? <Loader2 className="h-3 w-3 animate-spin me-1" /> : <Trash2 className="h-3 w-3 me-1" />}
                                {c("actions.delete")}
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">{description}</p>
                    {isUploaded && (
                        <p className="text-xs text-muted-foreground/60 italic">{t("settings.branding.customUploaded")}</p>
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
            primaryColor: "#8078F0",
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
                        primaryColor: s.branding?.primaryColor || "#8078F0",
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
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora">{t("settings.title")}</h1>
                <p className="text-muted-foreground">{t("settings.subtitle")}</p>
            </div>

            <AdminNav currentPath="/admin/settings" />

            <div className="grid gap-6 max-w-4xl">
                {/* Branding Card */}
                <Card className="rounded-2xl border-border shadow-sm">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Palette className="h-5 w-5 text-primary" />
                                    {t("settings.branding.title")}
                                </CardTitle>
                                <CardDescription className="mt-1.5">{t("settings.branding.description")}</CardDescription>
                            </div>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="text-xs text-muted-foreground shrink-0">
                                        <RotateCcw className="h-3 w-3 me-1" />
                                        {t("settings.branding.reset")}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>{t("settings.branding.resetTitle")}</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            {t("settings.branding.resetDescription")}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>{c("actions.cancel")}</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleResetBranding}
                                            disabled={resetting}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                            {resetting ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <RotateCcw className="h-4 w-4 me-2" />}
                                            {t("settings.branding.resetAll")}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="appName">{t("settings.branding.appName")}</Label>
                                <Input
                                    id="appName"
                                    placeholder={t("settings.branding.appName")}
                                    value={settings.branding.appName}
                                    onChange={(e) => updateBranding("appName", e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">{t("settings.branding.appNameHint")}</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="primaryColor">{t("settings.branding.primaryColor")}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="primaryColor"
                                        type="color"
                                        value={settings.branding.primaryColor}
                                        onChange={(e) => updateBranding("primaryColor", e.target.value)}
                                        className="w-14 h-10 p-1 cursor-pointer"
                                    />
                                    <Input
                                        value={settings.branding.primaryColor}
                                        onChange={(e) => updateBranding("primaryColor", e.target.value)}
                                        placeholder="#8078F0"
                                        className="font-mono text-sm"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">{t("settings.branding.primaryColorHint")}</p>
                            </div>
                        </div>

                        <div className="border-t border-border pt-6 space-y-6">
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
                        <div className="mt-4 p-4 rounded-xl border border-dashed border-border bg-muted/20">
                            <p className="text-xs font-bold uppercase text-muted-foreground mb-3 tracking-wider">{t("settings.branding.preview")}</p>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: settings.branding.primaryColor }} />
                                <span className="font-bold text-foreground">{settings.branding.appName || t("settings.branding.yourApp")}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Updates Card */}
                <Card className="rounded-2xl border-border shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <RefreshCw className="h-5 w-5 text-primary" />
                            {t("settings.updates.title")}
                        </CardTitle>
                        <CardDescription>{t("settings.updates.description")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="text-sm">
                                <span className="text-muted-foreground">{t("settings.updates.currentVersion")} </span>
                                <span className="font-semibold">{CURRENT_VERSION}</span>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={checkForUpdates}
                                disabled={versionCheckLoading}
                            >
                                {versionCheckLoading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" />
                                ) : (
                                    <RefreshCw className="h-3.5 w-3.5 me-1.5" />
                                )}
                                {t("settings.updates.check")}
                            </Button>
                        </div>
                        {versionCheckError && (
                            <p className="text-sm text-destructive">{versionCheckError}</p>
                        )}
                        {!versionCheckLoading && latestVersion != null && (
                            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                                {latestVersion !== CURRENT_VERSION ? (
                                    <>
                                        <p className="text-sm font-medium flex items-center gap-2">
                                            <span className="text-primary">{t("settings.updates.available")}</span>
                                            <span className="text-muted-foreground font-normal">{t("settings.updates.latestIs", { version: latestVersion })}</span>
                                        </p>
                                        <a
                                            href={INSTALLER_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                                        >
                                            {t("settings.updates.openInstaller")}
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    </>
                                ) : (
                                    <p className="text-sm flex items-center gap-2 text-muted-foreground">
                                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500 shrink-0" />
                                        {t("settings.updates.upToDate", { version: CURRENT_VERSION })}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
                            <Star className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{t("settings.updates.rateTitle", { appName: settings.branding.appName })}</p>
                                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                    {t("settings.updates.rateBody")}
                                </p>
                                <a
                                    href="https://codecanyon.net/downloads"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline mt-1"
                                >
                                    <Star className="h-3.5 w-3.5" />
                                    {t("settings.updates.rateCta")}
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Public site: emails & social (landing, legal pages, footer) */}
                <Card className="rounded-2xl border-border shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Mail className="h-5 w-5 text-primary" />
                            {t("settings.contact.title")}
                        </CardTitle>
                        <CardDescription>
                            {t("settings.contact.description")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="privacyEmail">{t("settings.contact.privacyEmail")}</Label>
                                <Input
                                    id="privacyEmail"
                                    type="email"
                                    placeholder="privacy@example.com"
                                    value={settings.privacyEmail}
                                    onChange={(e) => setSettings({ ...settings, privacyEmail: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground">{t("settings.contact.privacyEmailHint")}</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="legalEmail">{t("settings.contact.legalEmail")}</Label>
                                <Input
                                    id="legalEmail"
                                    type="email"
                                    placeholder="legal@example.com"
                                    value={settings.legalEmail}
                                    onChange={(e) => setSettings({ ...settings, legalEmail: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground">{t("settings.contact.legalEmailHint")}</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contactEmail">{t("settings.contact.contactEmail")}</Label>
                            <Input
                                id="contactEmail"
                                type="email"
                                placeholder={t("settings.contact.contactEmailPlaceholder")}
                                value={settings.contactEmail}
                                onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                                className="max-w-md"
                            />
                            <p className="text-xs text-muted-foreground">{t("settings.contact.contactEmailHint")}</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="hqAddress">{t("settings.contact.hqAddress")}</Label>
                            <Input
                                id="hqAddress"
                                type="text"
                                placeholder={t("settings.contact.hqAddressPlaceholder")}
                                value={settings.hqAddress}
                                onChange={(e) => setSettings({ ...settings, hqAddress: e.target.value })}
                                className="max-w-md"
                            />
                            <p className="text-xs text-muted-foreground">{t("settings.contact.hqAddressHint")}</p>
                        </div>
                        <div className="border-t border-border pt-6 space-y-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Share2 className="h-4 w-4 text-primary" />
                                {t("settings.contact.socialLinks")}
                            </div>
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="socialInstagram">{t("settings.contact.instagram")}</Label>
                                    <Input
                                        id="socialInstagram"
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
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="socialLinkedin">{t("settings.contact.linkedin")}</Label>
                                    <Input
                                        id="socialLinkedin"
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
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="socialYoutube">{t("settings.contact.youtube")}</Label>
                                    <Input
                                        id="socialYoutube"
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
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* General Settings Card */}
                <Card className="rounded-2xl border-border shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-primary" />
                            {t("settings.general.title")}
                        </CardTitle>
                        <CardDescription>{t("settings.general.description")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="currency">{t("settings.general.currency")}</Label>
                            <Select
                                value={settings.currency}
                                onValueChange={(val) => setSettings({ ...settings, currency: val })}
                            >
                                <SelectTrigger className="w-full md:w-[200px]">
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
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="supportEmail">{t("settings.general.supportEmail")}</Label>
                            <Input
                                id="supportEmail"
                                type="email"
                                placeholder="support@example.com"
                                value={settings.supportEmail}
                                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                                className="max-w-md"
                            />
                            <p className="text-xs text-muted-foreground">{t("settings.general.supportEmailHint")}</p>
                        </div>

                        <div className="flex items-start justify-between gap-4 pt-2 border-t border-border">
                            <div className="space-y-1">
                                <Label htmlFor="showCodeCanyonButton" className="cursor-pointer">{t("settings.general.showStoreButton")}</Label>
                                <p className="text-xs text-muted-foreground max-w-md">
                                    {t("settings.general.showStoreButtonHint")}
                                </p>
                            </div>
                            <Switch
                                id="showCodeCanyonButton"
                                checked={!!settings.showCodeCanyonButton}
                                onCheckedChange={(checked) => setSettings({ ...settings, showCodeCanyonButton: checked })}
                            />
                        </div>

                        <div className="flex items-start justify-between gap-4 pt-2 border-t border-border">
                            <div className="space-y-1">
                                <Label htmlFor="showSelfHostingSection" className="cursor-pointer">{t("settings.general.showSelfHosting")}</Label>
                                <p className="text-xs text-muted-foreground max-w-md">
                                    {t("settings.general.showSelfHostingHint")}
                                </p>
                            </div>
                            <Switch
                                id="showSelfHostingSection"
                                checked={!!settings.showSelfHostingSection}
                                onCheckedChange={(checked) => setSettings({ ...settings, showSelfHostingSection: checked })}
                            />
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8"
                    >
                        {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                        {t("settings.general.save")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
