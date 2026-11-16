"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import axios from "axios";
import {
    Alert,
    Badge,
    Button,
    Field,
    Input,
    Section,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    toast,
    useConfirm,
} from "@wixzel/react";
import { CalendarCheck, CheckCircle, ArrowSquareOut, SignOut, PencilSimple, PaperPlaneTilt } from "@phosphor-icons/react";
import { SectionLoading, SettingRow, SettingRows } from "@/components/settings/setting-row";

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
    const confirm = useConfirm();

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
        const ok = await confirm({
            title: "Disconnect WhatsApp?",
            description: "Notifications will stop arriving on your number. You can reconnect any time.",
            confirmLabel: t("disconnect"),
            tone: "danger",
        });
        if (!ok) return;
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
        return <SectionLoading>{t("loading")}</SectionLoading>;
    }

    return (
        <Section
            icon={<Image src="/images/integrations/whatsapp.png" alt="WhatsApp" width={16} height={16} className="size-4 object-contain" />}
            title={
                <span className="flex flex-wrap items-center gap-2">
                    WhatsApp
                    {status.connected && <Badge tone="success" dot>{t("connected")}</Badge>}
                </span>
            }
            description={t("whatsapp.description")}
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
            {!status.connected && (
                <>
                    <div className="flex flex-col gap-1 rounded-md bg-surface p-4 text-caption text-fg-muted">
                        <p className="text-body-sm font-medium text-fg">{t("whatsapp.howToTitle")}</p>
                        <p>
                            {t.rich("whatsapp.step1", { b: (chunks) => <span className="font-medium text-fg">{chunks}</span> })}{" "}
                            <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent-ink underline">
                                developers.facebook.com <ArrowSquareOut className="size-3" />
                            </a>
                        </p>
                        <p>{t.rich("whatsapp.step2", { b: (chunks) => <span className="font-medium text-fg">{chunks}</span> })}</p>
                        <p>{t("whatsapp.step3")}</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t("whatsapp.tokenLabel")} hint={t("whatsapp.tokenHint")} id="wa-token" className="md:col-span-2">
                            <Input
                                type="password"
                                placeholder={t("whatsapp.tokenPlaceholder")}
                                value={form.accessToken}
                                onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                                className="font-mono"
                            />
                        </Field>
                        <Field label={t("whatsapp.phoneIdLabel")} id="wa-phone-id">
                            <Input
                                placeholder="123456789012345"
                                value={form.phoneNumberId}
                                onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
                                className="font-mono"
                            />
                        </Field>
                        <Field label={t("whatsapp.recipientLabel")} id="wa-recipient">
                            <Input
                                placeholder="+15551234567"
                                value={form.recipientNumber}
                                onChange={(e) => setForm({ ...form, recipientNumber: e.target.value })}
                                className="font-mono"
                            />
                        </Field>
                    </div>

                    <div>
                        <Button
                            variant="primary"
                            onClick={handleConnect}
                            loading={connecting}
                            iconStart={<CheckCircle />}
                        >
                            {t("whatsapp.connect")}
                        </Button>
                    </div>
                </>
            )}

            {status.connected && (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface p-4 text-body-sm">
                        <div className="flex flex-col gap-1">
                            <div className="text-caption font-medium text-fg-muted">{t("whatsapp.sendingTo")}</div>
                            {editingRecipient ? (
                                <div className="flex items-center gap-2">
                                    <Input
                                        size="sm"
                                        value={newRecipient}
                                        onChange={(e) => setNewRecipient(e.target.value)}
                                        placeholder="+15551234567"
                                        className="w-44 font-mono"
                                    />
                                    <Button variant="primary" size="sm" onClick={handleSaveRecipient} loading={savingRecipient}>
                                        {c("actions.save")}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingRecipient(false)}>
                                        {c("actions.cancel")}
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 font-medium">
                                    +{status.recipientNumber}
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => { setNewRecipient(`+${status.recipientNumber}`); setEditingRecipient(true); }}
                                        aria-label={t("whatsapp.changeRecipient")}
                                    >
                                        <PencilSimple />
                                    </Button>
                                </div>
                            )}
                            <div className="text-caption text-fg-muted">
                                {t("whatsapp.from")} {status.businessName ? `${status.businessName} ` : ""}{status.businessNumber}
                            </div>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSendTest}
                            loading={sendingTest}
                            iconStart={<PaperPlaneTilt />}
                        >
                            {t("whatsapp.sendTest")}
                        </Button>
                    </div>

                    <Alert tone="warning">
                        {t.rich("whatsapp.sessionWarning", { number: status.businessNumber || t("whatsapp.yourBusinessNumber"), b: (chunks) => <span className="font-medium">{chunks}</span> })}
                    </Alert>

                    <div className="flex flex-col gap-4 rounded-md bg-surface p-4">
                        <SettingRow
                            className="py-0"
                            htmlFor="wa-reminders"
                            label={
                                <span className="flex items-center gap-2">
                                    <CalendarCheck className="size-4 text-fg-muted" /> {t("whatsapp.remindersTitle")}
                                </span>
                            }
                            description={t("whatsapp.remindersHint")}
                            control={
                                <Switch
                                    id="wa-reminders"
                                    checked={reminders.enabled}
                                    disabled={togglingReminders}
                                    onCheckedChange={toggleReminders}
                                />
                            }
                        />

                        <div className="flex flex-col gap-4 border-t border-border pt-4">
                            <div className="flex flex-col gap-1 rounded-md bg-bg-muted p-3 text-caption text-fg-muted">
                                <p className="font-medium text-fg">{t("whatsapp.templateSetupTitle")}</p>
                                <p>
                                    {t("whatsapp.templateSetupIntro")}{" "}
                                    <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent-ink underline">
                                        {t("whatsapp.metaBusinessManager")} <ArrowSquareOut className="size-3" />
                                    </a>{" "}
                                    {t.rich("whatsapp.templateSetupOutro", { b: (chunks) => <span className="font-medium text-fg">{chunks}</span>, code: (chunks) => <code className="rounded-xs bg-surface px-1 py-0.5 font-mono">{chunks}</code> })}
                                </p>
                                <p className="rounded-sm bg-surface p-2 font-mono text-fg">
                                    {t("whatsapp.templateBody", { v1: "{{1}}", v2: "{{2}}", v3: "{{3}}" })}
                                </p>
                                <p>
                                    {t.rich("whatsapp.templateVars", { v1: "{{1}}", v2: "{{2}}", v3: "{{3}}", b: (chunks) => <span className="font-medium">{chunks}</span> })}
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <Field label={t("whatsapp.templateNameLabel")} id="wa-template">
                                    <Input
                                        placeholder="appointment_reminder"
                                        value={reminders.templateName}
                                        onChange={(e) => setReminders({ ...reminders, templateName: e.target.value })}
                                        className="font-mono"
                                    />
                                </Field>
                                <Field label={t("whatsapp.templateLanguageLabel")} hint={t("whatsapp.templateLanguageHint")} id="wa-template-lang">
                                    <Input
                                        placeholder="en"
                                        value={reminders.templateLanguage}
                                        onChange={(e) => setReminders({ ...reminders, templateLanguage: e.target.value })}
                                        className="font-mono"
                                    />
                                </Field>
                                <Field label={t("whatsapp.sendReminderLabel")} id="wa-lead-minutes">
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
                                </Field>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button variant="primary" size="sm" onClick={saveReminderConfig} loading={savingReminders}>
                                    {t("whatsapp.saveReminders")}
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleSendReminderTest}
                                    loading={sendingReminderTest}
                                    iconStart={<PaperPlaneTilt />}
                                >
                                    {t("whatsapp.sendReminderTest")}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <SettingRows inset>
                        {EVENT_KEYS.map((key) => {
                            const enabled = status.events[key] !== false;
                            return (
                                <SettingRow
                                    key={key}
                                    htmlFor={`wa-event-${key}`}
                                    label={t(`n8n.events.${key}.label`)}
                                    description={t(`n8n.events.${key}.description`)}
                                    control={
                                        <Switch
                                            id={`wa-event-${key}`}
                                            checked={enabled}
                                            disabled={savingEvent === key}
                                            onCheckedChange={(v) => toggleEvent(key, v)}
                                        />
                                    }
                                />
                            );
                        })}
                    </SettingRows>
                </>
            )}
        </Section>
    );
}
