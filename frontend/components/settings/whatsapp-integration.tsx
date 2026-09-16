"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CalendarClock, CheckCircle2, ExternalLink, Loader2, LogOut, Pencil, Send } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

// Labels live in messages/<locale>/settings.json under n8n.events — the same
// event set drives both the n8n and WhatsApp panels.
const EVENT_KEYS = [
    "leadCreated", "leadQualified", "callCompleted", "inboundCall",
    "outboundCall", "campaignCompleted", "appointmentBooked", "appointmentCanceled",
    "callTransferred", "transferFailed",
] as const;

const LEAD_OPTIONS = [15, 30, 60, 120, 180, 720, 1440] as const;

type Reminders = {
    enabled: boolean;
    templateName: string;
    templateLanguage: string;
    leadMinutes: number;
};

type Status = {
    connected: boolean;
    businessNumber: string;
    businessName: string;
    recipientNumber: string;
    events: Record<string, boolean>;
};

export function WhatsAppIntegration() {
    const t = useTranslations("settings");
    const c = useTranslations("common");
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [sendingTest, setSendingTest] = useState(false);
    const [savingEvent, setSavingEvent] = useState<string | null>(null);
    const [form, setForm] = useState({ accessToken: "", phoneNumberId: "", recipientNumber: "" });
    const [editingRecipient, setEditingRecipient] = useState(false);
    const [newRecipient, setNewRecipient] = useState("");
    const [savingRecipient, setSavingRecipient] = useState(false);
    const [status, setStatus] = useState<Status>({
        connected: false,
        businessNumber: "",
        businessName: "",
        recipientNumber: "",
        events: {}
    });
    const [reminders, setReminders] = useState<Reminders>({
        enabled: false,
        templateName: "",
        templateLanguage: "en",
        leadMinutes: 60
    });
    const [togglingReminders, setTogglingReminders] = useState(false);
    const [savingReminders, setSavingReminders] = useState(false);
    const [sendingReminderTest, setSendingReminderTest] = useState(false);

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
                    connected: !!d.isWhatsAppConnected,
                    businessNumber: d.whatsappBusinessNumber || "",
                    businessName: d.whatsappBusinessName || "",
                    recipientNumber: d.whatsappRecipientNumber || "",
                    events: d.whatsappEvents || {}
                });
                setReminders({
                    enabled: !!d.whatsappReminders?.enabled,
                    templateName: d.whatsappReminders?.templateName || "",
                    templateLanguage: d.whatsappReminders?.templateLanguage || "en",
                    leadMinutes: d.whatsappReminders?.leadMinutes ?? 60
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

    const handleConnect = async () => {
        if (!form.accessToken.trim() || !form.phoneNumberId.trim() || !form.recipientNumber.trim()) {
            toast.error(t("toast.waCredentialsRequired"));
            return;
        }
        setConnecting(true);
        try {
            const token = localStorage.getItem("token");
            const resp = await axios.post(`${API_BASE_URL}/settings/whatsapp/connect`, {
                accessToken: form.accessToken.trim(),
                phoneNumberId: form.phoneNumberId.trim(),
                recipientNumber: form.recipientNumber.trim()
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.data?.status === "success") {
                toast.success(t("toast.waConnected"));
                setForm({ accessToken: "", phoneNumberId: "", recipientNumber: "" });
                fetchStatus();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.waConnectFailed"));
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm("Disconnect WhatsApp? Notifications will stop arriving on your number. You can reconnect any time.")) return;
        setDisconnecting(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/settings/whatsapp/disconnect`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStatus({ connected: false, businessNumber: "", businessName: "", recipientNumber: "", events: {} });
            toast.success(t("toast.waDisconnected"));
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
            await axios.post(`${API_BASE_URL}/settings/whatsapp/test`, { event: "leadCreated" }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(t("toast.waTestSent", { number: status.recipientNumber }));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.waTestFailed"));
        } finally {
            setSendingTest(false);
        }
    };

    const handleSaveRecipient = async () => {
        if (!newRecipient.trim()) return;
        setSavingRecipient(true);
        try {
            const token = localStorage.getItem("token");
            const resp = await axios.patch(`${API_BASE_URL}/settings/whatsapp/preferences`, { recipientNumber: newRecipient.trim() }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const saved = resp.data?.data?.whatsappRecipientNumber;
            setStatus((s) => ({ ...s, recipientNumber: saved || s.recipientNumber }));
            setEditingRecipient(false);
            toast.success(t("toast.waRecipientUpdated"));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.waRecipientFailed"));
        } finally {
            setSavingRecipient(false);
        }
    };

    const toggleEvent = async (key: string, value: boolean) => {
        const prev = status.events[key] !== false;
        setStatus((s) => ({ ...s, events: { ...s.events, [key]: value } }));
        setSavingEvent(key);
        try {
            const token = localStorage.getItem("token");
            await axios.patch(`${API_BASE_URL}/settings/whatsapp/preferences`, { events: { [key]: value } }, {
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.preferenceFailed"));
            setStatus((s) => ({ ...s, events: { ...s.events, [key]: prev } }));
        } finally {
            setSavingEvent(null);
        }
    };

    const toggleReminders = async (value: boolean) => {
        if (value && !reminders.templateName.trim()) {
            toast.error(t("toast.waTemplateFirst"));
            return;
        }
        const prev = reminders.enabled;
        setReminders((r) => ({ ...r, enabled: value }));
        setTogglingReminders(true);
        try {
            const token = localStorage.getItem("token");
            await axios.patch(`${API_BASE_URL}/settings/whatsapp/reminders`, { enabled: value }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(value ? "Appointment reminders enabled" : "Appointment reminders disabled");
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.waRemindersFailed"));
            setReminders((r) => ({ ...r, enabled: prev }));
        } finally {
            setTogglingReminders(false);
        }
    };

    const saveReminderConfig = async () => {
        setSavingReminders(true);
        try {
            const token = localStorage.getItem("token");
            await axios.patch(`${API_BASE_URL}/settings/whatsapp/reminders`, {
                templateName: reminders.templateName.trim(),
                templateLanguage: reminders.templateLanguage.trim() || "en",
                leadMinutes: reminders.leadMinutes
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(t("toast.waRemindersSaved"));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.waRemindersSaveFailed"));
        } finally {
            setSavingReminders(false);
        }
    };

    const handleSendReminderTest = async () => {
        if (!reminders.templateName.trim()) {
            toast.error(t("toast.waTemplateNameRequired"));
            return;
        }
        setSendingReminderTest(true);
        try {
            const token = localStorage.getItem("token");
            // Persist current fields first so the test always uses what's on screen
            await axios.patch(`${API_BASE_URL}/settings/whatsapp/reminders`, {
                templateName: reminders.templateName.trim(),
                templateLanguage: reminders.templateLanguage.trim() || "en",
                leadMinutes: reminders.leadMinutes
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await axios.post(`${API_BASE_URL}/settings/whatsapp/reminders/test`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(t("toast.waReminderTestSent", { number: status.recipientNumber }));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.waReminderTestFailed"));
        } finally {
            setSendingReminderTest(false);
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
                            <Image src="/images/integrations/whatsapp.png" alt="WhatsApp" width={24} height={24} className="shrink-0" />
                            WhatsApp
                            {status.connected && (
                                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 ms-2">
                                    <CheckCircle2 className="h-3 w-3 me-1" /> {t("connected")}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {t("whatsapp.description")}
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
                {!status.connected && (
                    <>
                        <div className="rounded-xl border p-4 bg-muted/20 text-xs text-muted-foreground space-y-1">
                            <p className="text-sm font-bold text-foreground">{t("whatsapp.howToTitle")}</p>
                            <p>
                                {t.rich("whatsapp.step1", { b: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}{" "}
                                <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
                                    developers.facebook.com <ExternalLink className="h-3 w-3" />
                                </a>
                            </p>
                            <p>{t.rich("whatsapp.step2", { b: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}</p>
                            <p>{t("whatsapp.step3")}</p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="wa-token" className="text-xs font-bold uppercase text-muted-foreground/80">{t("whatsapp.tokenLabel")}</Label>
                                <Input
                                    id="wa-token"
                                    type="password"
                                    placeholder={t("whatsapp.tokenPlaceholder")}
                                    value={form.accessToken}
                                    onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                                    className="font-mono text-sm"
                                />
                                <p className="text-[11px] text-muted-foreground">{t("whatsapp.tokenHint")}</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="wa-phone-id" className="text-xs font-bold uppercase text-muted-foreground/80">{t("whatsapp.phoneIdLabel")}</Label>
                                <Input
                                    id="wa-phone-id"
                                    placeholder="123456789012345"
                                    value={form.phoneNumberId}
                                    onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
                                    className="font-mono text-sm"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="wa-recipient" className="text-xs font-bold uppercase text-muted-foreground/80">{t("whatsapp.recipientLabel")}</Label>
                                <Input
                                    id="wa-recipient"
                                    placeholder="+15551234567"
                                    value={form.recipientNumber}
                                    onChange={(e) => setForm({ ...form, recipientNumber: e.target.value })}
                                    className="font-mono text-sm"
                                />
                            </div>
                        </div>

                        <Button
                            className="bg-[#25D366] hover:bg-[#1ebe5b] text-white gap-2"
                            onClick={handleConnect}
                            disabled={connecting}
                        >
                            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            {t("whatsapp.connect")}
                        </Button>
                    </>
                )}

                {status.connected && (
                    <>
                        <div className="rounded-xl border p-4 bg-muted/20 text-sm flex items-center justify-between gap-4 flex-wrap">
                            <div className="space-y-1">
                                <div className="text-xs font-bold uppercase text-muted-foreground">{t("whatsapp.sendingTo")}</div>
                                {editingRecipient ? (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={newRecipient}
                                            onChange={(e) => setNewRecipient(e.target.value)}
                                            placeholder="+15551234567"
                                            className="h-8 w-44 font-mono text-sm"
                                        />
                                        <Button size="sm" className="h-8" onClick={handleSaveRecipient} disabled={savingRecipient}>
                                            {savingRecipient ? <Loader2 className="h-3 w-3 animate-spin" /> : c("actions.save")}
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingRecipient(false)}>
                                            {c("actions.cancel")}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="font-medium flex items-center gap-2">
                                        +{status.recipientNumber}
                                        <button
                                            type="button"
                                            className="text-muted-foreground hover:text-foreground"
                                            onClick={() => { setNewRecipient(`+${status.recipientNumber}`); setEditingRecipient(true); }}
                                            aria-label={t("whatsapp.changeRecipient")}
                                        >
                                            <Pencil className="h-3 w-3" />
                                        </button>
                                    </div>
                                )}
                                <div className="text-xs text-muted-foreground">
                                    {t("whatsapp.from")} {status.businessName ? `${status.businessName} ` : ""}{status.businessNumber}
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
                                {t("whatsapp.sendTest")}
                            </Button>
                        </div>

                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            {t.rich("whatsapp.sessionWarning", { number: status.businessNumber || t("whatsapp.yourBusinessNumber"), b: (chunks) => <span className="font-medium">{chunks}</span> })}
                        </div>

                        <div className="rounded-xl border bg-muted/20">
                            <div className="flex items-start justify-between gap-4 p-4">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-bold flex items-center gap-2">
                                        <CalendarClock className="h-4 w-4" /> {t("whatsapp.remindersTitle")}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        {t("whatsapp.remindersHint")}
                                    </p>
                                </div>
                                <Switch
                                    checked={reminders.enabled}
                                    disabled={togglingReminders}
                                    onCheckedChange={toggleReminders}
                                />
                            </div>

                            <div className="border-t p-4 space-y-4">
                                <div className="rounded-lg border bg-background/60 p-3 text-xs text-muted-foreground space-y-1">
                                    <p className="font-bold text-foreground">{t("whatsapp.templateSetupTitle")}</p>
                                    <p>
                                        {t("whatsapp.templateSetupIntro")}{" "}
                                        <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
                                            {t("whatsapp.metaBusinessManager")} <ExternalLink className="h-3 w-3" />
                                        </a>{" "}
                                        {t.rich("whatsapp.templateSetupOutro", { b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>, code: (chunks) => <code className="px-1 py-0.5 bg-muted rounded">{chunks}</code> })}
                                    </p>
                                    <p className="font-mono text-[11px] bg-muted rounded p-2 text-foreground">
                                        {t("whatsapp.templateBody", { v1: "{{1}}", v2: "{{2}}", v3: "{{3}}" })}
                                    </p>
                                    <p>
                                        {t.rich("whatsapp.templateVars", { v1: "{{1}}", v2: "{{2}}", v3: "{{3}}", b: (chunks) => <span className="font-medium">{chunks}</span> })}
                                    </p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="wa-template" className="text-xs font-bold uppercase text-muted-foreground/80">{t("whatsapp.templateNameLabel")}</Label>
                                        <Input
                                            id="wa-template"
                                            placeholder="appointment_reminder"
                                            value={reminders.templateName}
                                            onChange={(e) => setReminders({ ...reminders, templateName: e.target.value })}
                                            className="font-mono text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="wa-template-lang" className="text-xs font-bold uppercase text-muted-foreground/80">{t("whatsapp.templateLanguageLabel")}</Label>
                                        <Input
                                            id="wa-template-lang"
                                            placeholder="en"
                                            value={reminders.templateLanguage}
                                            onChange={(e) => setReminders({ ...reminders, templateLanguage: e.target.value })}
                                            className="font-mono text-sm"
                                        />
                                        <p className="text-[11px] text-muted-foreground">{t("whatsapp.templateLanguageHint")}</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground/80">{t("whatsapp.sendReminderLabel")}</Label>
                                        <Select
                                            value={String(reminders.leadMinutes)}
                                            onValueChange={(v) => setReminders({ ...reminders, leadMinutes: parseInt(v, 10) })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {LEAD_OPTIONS.map((minutes) => (
                                                    <SelectItem key={minutes} value={String(minutes)}>{t(`whatsapp.leadOptions.${minutes}`)}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" onClick={saveReminderConfig} disabled={savingReminders}>
                                        {savingReminders && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                                        {t("whatsapp.saveReminders")}
                                    </Button>
                                    <Button size="sm" variant="outline" className="gap-2" onClick={handleSendReminderTest} disabled={sendingReminderTest}>
                                        {sendingReminderTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        {t("whatsapp.sendReminderTest")}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border bg-muted/20 divide-y">
                            {EVENT_KEYS.map((key) => {
                                const enabled = status.events[key] !== false;
                                return (
                                    <div key={key} className="flex items-start justify-between gap-4 p-4">
                                        <div className="space-y-0.5">
                                            <Label className="text-sm font-bold">{t(`n8n.events.${key}.label`)}</Label>
                                            <p className="text-xs text-muted-foreground">{t(`n8n.events.${key}.description`)}</p>
                                        </div>
                                        <Switch
                                            checked={enabled}
                                            disabled={savingEvent === key}
                                            onCheckedChange={(v) => toggleEvent(key, v)}
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
