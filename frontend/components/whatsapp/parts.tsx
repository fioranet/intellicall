"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import axios from "axios";
import { WhatsappLogo } from "@phosphor-icons/react";
import {
    Alert, Badge, Button, CopyField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
    Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn,
} from "@wixzel/react";
import { useSettings } from "@/components/settings-provider";
import { API_BASE_URL, apiError, authHeaders, isPlanGate, type AgentRef, type WhatsAppAccount } from "./types";

/**
 * WhatsApp's own glyph, green on light and white on dark, shown only where the
 * name WhatsApp or a WhatsApp number is next to it (WhatsApp's brand rules).
 * The sidebar uses our own neutral icon, in whatsapp-icon.tsx.
 */
export function WhatsAppMark({ size = 20, className }: { size?: number; className?: string }) {
    return (
        <span className={cn("inline-flex shrink-0 items-center justify-center text-[#25D366] dark:text-white", className)}
            style={{ width: size + 8, height: size + 8 }} aria-hidden>
            <WhatsappLogo weight="fill" size={size + 6} />
        </span>
    );
}

export type StatusTone = "good" | "warn" | "bad" | "idle" | "live" | "info";
const BADGE: Record<StatusTone, "success" | "warning" | "danger" | "neutral" | "accent" | "info"> = {
    good: "success", warn: "warning", bad: "danger", idle: "neutral", live: "accent", info: "info",
};
const DOT: Record<StatusTone, string> = {
    good: "bg-success", warn: "bg-warning", bad: "bg-danger", idle: "bg-fg-subtle", live: "bg-accent", info: "bg-info",
};

export function StatusPill({ tone, children, className }: { tone: StatusTone; children: React.ReactNode; className?: string }) {
    return <Badge tone={BADGE[tone]} dot pulse={tone === "live"} className={className}>{children}</Badge>;
}

export function StatusDot({ tone, size = 8, className }: { tone: StatusTone; size?: number; className?: string }) {
    return <span className={cn("inline-flex shrink-0 rounded-full", DOT[tone], className)} style={{ width: size, height: size }} aria-hidden />;
}

export function qualityTone(q: string): StatusTone {
    return q === "GREEN" ? "good" : q === "YELLOW" ? "warn" : q === "RED" ? "bad" : "idle";
}

type PageT = ReturnType<typeof useTranslations<"whatsapp">>;

/** "Quality green", from Meta's rating, in the reader's language. */
export function qualityLine(q: string, t: PageT): string {
    return q === "GREEN" ? t("page.qualityGreen") : q === "YELLOW" ? t("page.qualityYellow") : q === "RED" ? t("page.qualityRed") : t("page.qualityOther", { rating: q.toLowerCase() });
}

export function accountTone(a: WhatsAppAccount, t: PageT): { tone: StatusTone; label: string } {
    if (a.status === "disconnected") return { tone: "bad", label: t("page.statusDisconnected") };
    if (a.status === "error") return { tone: "bad", label: t("page.statusError") };
    if (a.webhook.status !== "ok") return { tone: "warn", label: t("page.statusWaiting") };
    if (!a.settings.messagingEnabled) return { tone: "idle", label: t("page.statusSendingOnly") };
    return { tone: "good", label: t("page.statusLive") };
}

/** "3 minutes ago", "2 days ago", or a short date once it is older than a month. */
export function useAgo(): (iso: string | null | undefined, now?: number) => string {
    const t = useTranslations("whatsapp");
    const locale = useLocale();
    const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);
    return useCallback((iso: string | null | undefined, now = Date.now()) => {
        if (!iso) return t("ago.never");
        const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
        if (s < 60) return t("ago.justNow");
        if (s < 3600) return t("ago.minutes", { count: Math.floor(s / 60) });
        if (s < 86400) return t("ago.hours", { count: Math.floor(s / 3600) });
        if (s < 86400 * 30) return t("ago.days", { count: Math.floor(s / 86400) });
        return dateFmt.format(new Date(iso));
    }, [t, dateFmt]);
}

/** A failed request as words for a toast: the plan gate's own line, the server's message, or the fallback. */
export function useApiMessage() {
    const t = useTranslations("whatsapp");
    return useCallback((err: unknown, fallback: string) => (isPlanGate(err) ? t("errors.planGate") : apiError(err).message || fallback), [t]);
}

const NONE = "none";

/**
 * Connecting a number from a Meta app the account manages: the ids and token
 * from that app. On success the callback URL and verify token show once,
 * unless the number lives in the platform's own app and needs no webhook of
 * its own.
 */
export function ManualConnectDialog({ open, onOpenChange, agents, onConnected }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agents: AgentRef[];
    onConnected: (a: WhatsAppAccount) => void;
}) {
    const t = useTranslations("whatsapp");
    const c = useTranslations("common");
    const { branding } = useSettings();
    const blank = { name: "", phoneNumberId: "", wabaId: "", accessToken: "", appSecret: "", inboundAgentId: NONE };
    const [form, setForm] = useState(blank);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [made, setMade] = useState<{ account: WhatsAppAccount; verifyToken: string } | null>(null);
    const message = useApiMessage();

    function close(o: boolean) {
        if (!o) { setForm(blank); setMade(null); setError(null); }
        onOpenChange(o);
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await axios.post(`${API_BASE_URL}/whatsapp/accounts`, {
                ...(form.name.trim() ? { name: form.name.trim() } : {}),
                phoneNumberId: form.phoneNumberId.trim(),
                wabaId: form.wabaId.trim(),
                accessToken: form.accessToken.trim(),
                appSecret: form.appSecret.trim(),
                ...(form.inboundAgentId !== NONE ? { inboundAgentId: form.inboundAgentId } : {}),
            }, { headers: authHeaders() });
            const account = res.data.data.account as WhatsAppAccount;
            setMade({ account, verifyToken: String(res.data.data.verifyToken || "") });
            onConnected(account);
        } catch (err) {
            setError(message(err, t("page.connectFailed")));
        } finally {
            setBusy(false);
        }
    }

    const field = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent>
                {made && !made.verifyToken ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>{t("page.manualConnectedTitle", { number: made.account.displayPhoneNumber || t("page.yourNumber") })}</DialogTitle>
                            <DialogDescription>{t("page.manualConnectedLine", { appName: branding.appName })}</DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="primary" onClick={() => close(false)}>{c("actions.done")}</Button>
                        </DialogFooter>
                    </>
                ) : made ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>{t("page.webhookTitle")}</DialogTitle>
                            <DialogDescription>{t.rich("page.webhookLine", { b: (chunks) => <b>{chunks}</b> })}</DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-4">
                            <Field label={t("page.callbackUrl")}>
                                <CopyField value={made.account.webhook.url} className="ltr-data" />
                            </Field>
                            <Field label={t("page.verifyToken")} hint={t("page.verifyTokenOnce")}>
                                <CopyField value={made.verifyToken} className="ltr-data" />
                            </Field>
                        </div>
                        <DialogFooter>
                            <Button variant="primary" onClick={() => close(false)}>{c("actions.done")}</Button>
                        </DialogFooter>
                    </>
                ) : (
                    <form onSubmit={submit} className="flex flex-col gap-5">
                        <DialogHeader>
                            <DialogTitle>{t("page.manualTitle")}</DialogTitle>
                            <DialogDescription>{t("page.manualLine")}</DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-4">
                            <Field label={t("page.phoneNumberId")} required>
                                <Input required inputMode="numeric" dir="ltr" value={form.phoneNumberId} onChange={field("phoneNumberId")} className="font-mono" />
                            </Field>
                            <Field label={t("page.wabaId")} required>
                                <Input required inputMode="numeric" dir="ltr" value={form.wabaId} onChange={field("wabaId")} className="font-mono" />
                            </Field>
                            <Field label={t("page.accessToken")} hint={t("page.accessTokenHint")} required>
                                <Input required type="password" autoComplete="off" dir="ltr" value={form.accessToken} onChange={field("accessToken")} className="font-mono" />
                            </Field>
                            <Field label={t("page.appSecret")} hint={t("page.appSecretHint")} required>
                                <Input required type="password" autoComplete="off" dir="ltr" value={form.appSecret} onChange={field("appSecret")} className="font-mono" />
                            </Field>
                            <Field label={t("page.name")}>
                                <Input value={form.name} onChange={field("name")} placeholder={t("page.namePlaceholder")} maxLength={100} />
                            </Field>
                            <Field label={t("page.answeringAgent")}>
                                <Select value={form.inboundAgentId} onValueChange={(v) => setForm({ ...form, inboundAgentId: v })}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>{t("page.nobodyYet")}</SelectItem>
                                        {agents.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </Field>
                            {error && <Alert tone="danger">{error}</Alert>}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => close(false)}>{c("actions.cancel")}</Button>
                            <Button type="submit" variant="primary" loading={busy}>{t("page.connect")}</Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
