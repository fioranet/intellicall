"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import axios from "axios";
import { CalendarDots, CalendarCheck, ListChecks, ChatText, PaperPlaneTilt, Plus } from "@phosphor-icons/react";
import {
    Button, Checkbox, Chip, Chips, Field, InfoTip, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch,
} from "@wixzel/react";
import { WhatsAppMark } from "./parts";
import { API_BASE_URL, authHeaders, type AgentWhatsApp, type WhatsAppAccount, type WhatsAppTemplate } from "./types";

const NONE = "none";

const TOOLS = [
    { key: "templates", icon: PaperPlaneTilt, title: "agent.toolTemplates", line: "agent.toolTemplatesLine" },
    { key: "messages", icon: ChatText, title: "agent.toolMessages", line: "agent.toolMessagesLine" },
    { key: "schedule", icon: CalendarDots, title: "agent.toolSchedule", line: "agent.toolScheduleLine" },
    { key: "interactive", icon: ListChecks, title: "agent.toolInteractive", line: "agent.toolInteractiveLine" },
] as const satisfies readonly { key: keyof AgentWhatsApp["tools"]; icon: typeof PaperPlaneTilt; title: string; line: string }[];

const PURPOSES = [
    { key: "booking_confirmation", label: "agent.purposeBooking", hint: "agent.purposeBookingHint" },
    { key: "reminder", label: "agent.purposeReminder", hint: "agent.purposeReminderHint" },
    { key: "follow_up", label: "agent.purposeFollowUp", hint: "agent.purposeFollowUpHint" },
] as const satisfies readonly { key: keyof AgentWhatsApp["templates"]; label: string; hint: string }[];

/**
 * The agent's WhatsApp, inside the drawer's Capabilities: the number it sends
 * from during calls, which WhatsApp tools it has, and which approved template
 * it uses for each purpose. Every tool sends only to the person on the call or
 * in the chat. Styled like the drawer's Tools and Connected apps blocks.
 */
export function AgentWhatsAppCard({ value, onChange, accounts, agentId, disabled }: {
    value: AgentWhatsApp;
    onChange: (v: AgentWhatsApp) => void;
    /** The account's connected numbers; null while they load. */
    accounts: WhatsAppAccount[] | null;
    /** The agent being edited, to say which numbers' chats it answers. */
    agentId?: string;
    disabled?: boolean;
}) {
    const t = useTranslations("whatsapp");
    // Approved templates by number, kept once fetched so switching numbers back and forth is instant.
    const [fetched, setFetched] = useState<Record<string, WhatsAppTemplate[]>>({});
    const answers = useMemo(() => (accounts ?? []).filter((a) => agentId && a.inboundAgentId === agentId), [accounts, agentId]);
    const templateAccount = value.accountId ?? answers[0]?._id ?? null;
    const templates = useMemo(() => (templateAccount ? fetched[templateAccount] ?? [] : []), [fetched, templateAccount]);

    useEffect(() => {
        if (!templateAccount) return;
        let cancelled = false;
        axios.get(`${API_BASE_URL}/whatsapp/templates`, { params: { accountId: templateAccount, status: "APPROVED" }, headers: authHeaders() })
            .then((r) => { if (!cancelled) setFetched((f) => ({ ...f, [templateAccount]: (r.data?.data?.templates as WhatsAppTemplate[]) ?? [] })); })
            .catch(() => { if (!cancelled) setFetched((f) => ({ ...f, [templateAccount]: [] })); });
        return () => { cancelled = true; };
    }, [templateAccount]);

    const usable = useMemo(() => templates.filter((x) => value.allowMarketing || x.category !== "MARKETING"), [templates, value.allowMarketing]);
    const set = (patch: Partial<AgentWhatsApp>) => onChange({ ...value, ...patch });
    const anyTool = Object.values(value.tools).some(Boolean);

    const head = (
        <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-bg-muted"><WhatsAppMark size={10} /></span>
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-body-sm font-semibold">{t("agent.title")}<InfoTip>{t("agent.info")}</InfoTip></span>
                    <p className="text-caption text-fg-muted">{t("agent.sendsFrom")}</p>
                </div>
            </div>
            <Button type="button" variant="secondary" size="xs" asChild>
                <Link href="/whatsapp"><Plus aria-hidden /> {t("agent.connectLink")}</Link>
            </Button>
        </div>
    );

    if (!accounts || accounts.length === 0) {
        return (
            <div className="flex flex-col gap-3 rounded-md bg-surface p-3">
                {head}
                <p className="text-caption text-fg-muted">
                    {t("agent.connectNumber")}{" "}
                    <Link href="/whatsapp" className="font-semibold text-accent-ink underline">{t("agent.connectLink")}</Link>
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 rounded-md bg-surface p-3">
            {head}

            <Field label={t("agent.sendsFromLabel")} hint={answers.length > 0
                ? t("agent.answersChatsOn", { numbers: answers.map((a) => a.displayPhoneNumber || a.phoneNumberId).join(", ") })
                : t.rich("agent.answersNone", { link: (chunks) => <Link href="/whatsapp" className="font-semibold text-accent-ink underline">{chunks}</Link> })}>
                <Select value={value.accountId ?? NONE} onValueChange={(v) => set({ accountId: v === NONE ? null : v })} disabled={disabled}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE}>{t("agent.noWhatsAppOnCalls")}</SelectItem>
                        {accounts.map((a) => (
                            <SelectItem key={a._id} value={a._id}>
                                <span className="ltr-data">{a.displayPhoneNumber || a.phoneNumberId}</span>{a.verifiedName ? ` · ${a.verifiedName}` : ""}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>

            <ul className="grid gap-2 sm:grid-cols-2">
                {TOOLS.map(({ key, icon: Icon, title, line }) => {
                    const id = `agent-wa-tool-${key}`;
                    return (
                        <li key={key}>
                            {/* A tool on a light face with a switch; the whole row is its label. */}
                            <Label htmlFor={id} className="flex h-full cursor-pointer items-center gap-3 rounded-sm bg-bg-muted p-2.5 font-normal">
                                <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-surface text-fg-muted"><Icon className="size-4" aria-hidden /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-body-sm font-medium text-fg">{t(title)}</span>
                                    <span className="mt-0.5 block text-caption text-fg-muted">{t(line)}</span>
                                </span>
                                <Switch id={id} size="sm" checked={value.tools[key]} disabled={disabled}
                                    onCheckedChange={(on) => set({ tools: { ...value.tools, [key]: on } })} />
                            </Label>
                        </li>
                    );
                })}
            </ul>

            {(anyTool || value.autoBookingConfirmation || value.autoReminderMinutes > 0) && (
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                    <span className="flex items-center gap-1.5 text-body-sm font-medium text-fg">
                        {t("agent.templates")}
                        <InfoTip>{t("agent.templatesInfo")}</InfoTip>
                    </span>
                    {templates.length === 0 ? (
                        <p className="text-caption text-fg-muted">{t("agent.noApproved")}</p>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-3">
                            {PURPOSES.map((p) => {
                                const cur = value.templates[p.key];
                                const key = cur?.name ? `${cur.name}|${cur.language ?? ""}` : NONE;
                                return (
                                    <Field key={p.key} label={t(p.label)} hint={t(p.hint)}>
                                        <Select value={key} disabled={disabled}
                                            onValueChange={(v) => {
                                                const [name, language] = v.split("|");
                                                set({ templates: { ...value.templates, [p.key]: v === NONE ? null : { name: name!, language: language || null } } });
                                            }}>
                                            <SelectTrigger className="w-full" size="sm"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={NONE}>{t("agent.none")}</SelectItem>
                                                {usable.map((tpl) => <SelectItem key={tpl._id} value={`${tpl.name}|${tpl.language}`}><span className="ltr-data font-mono">{tpl.name} ({tpl.language})</span></SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                );
                            })}
                        </div>
                    )}
                    {value.tools.templates && usable.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <span className="text-caption font-medium text-fg">{t("agent.otherTemplates")}</span>
                            {/* Any number of templates: multiple-choice chips, inked while on. */}
                            <Chips type="multiple" aria-label={t("agent.otherTemplates")} value={value.allowedTemplates}
                                onValueChange={(v) => set({ allowedTemplates: v })} disabled={disabled}>
                                {[...new Set(usable.map((tpl) => tpl.name))].map((n) => (
                                    <Chip key={n} value={n} className="ltr-data font-mono">{n}</Chip>
                                ))}
                            </Chips>
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-3 border-t border-border pt-3">
                <div className="flex items-start gap-2.5">
                    <Checkbox id="agent-wa-auto-booking" checked={value.autoBookingConfirmation} disabled={disabled}
                        onCheckedChange={(v) => set({ autoBookingConfirmation: v === true })} className="mt-0.5" />
                    <Label htmlFor="agent-wa-auto-booking" className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 font-normal">
                        <span className="inline-flex items-center gap-1.5 text-body-sm font-medium text-fg"><CalendarCheck className="size-4" aria-hidden /> {t("agent.confirmBookings")}</span>
                        <span className="text-caption text-fg-muted">{t("agent.confirmBookingsHint")}</span>
                    </Label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("agent.reminderMinutes")} hint={t("agent.reminderMinutesHint")}>
                        <Input type="number" min={0} max={10080} value={value.autoReminderMinutes} disabled={disabled} className="tabular-nums"
                            onChange={(e) => set({ autoReminderMinutes: Math.min(10080, Math.max(0, Number(e.target.value) || 0)) })} />
                    </Field>
                    <Field label={t("agent.maxSends")} hint={t("agent.maxSendsHint")}>
                        <Input type="number" min={1} max={10} value={value.maxSendsPerCall} disabled={disabled} className="tabular-nums"
                            onChange={(e) => set({ maxSendsPerCall: Math.min(10, Math.max(1, Number(e.target.value) || 3)) })} />
                    </Field>
                </div>
                <div className="flex items-start gap-2.5">
                    <Checkbox id="agent-wa-marketing" checked={value.allowMarketing} disabled={disabled}
                        onCheckedChange={(v) => set({ allowMarketing: v === true })} className="mt-0.5" />
                    <Label htmlFor="agent-wa-marketing" className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 font-normal">
                        <span className="text-body-sm font-medium text-fg">{t("agent.allowMarketing")}</span>
                        <span className="text-caption text-fg-muted">{t("agent.allowMarketingHint")}</span>
                    </Label>
                </div>
            </div>
        </div>
    );
}
