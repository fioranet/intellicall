"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import axios from "axios";
import { ArrowRight, ArrowsClockwise, ArrowBendUpLeft, CalendarCheck, GearSix, Microphone, PaperPlaneTilt } from "@phosphor-icons/react";
import {
    Alert, Button, Card, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, PageHeader,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Tile, toast,
} from "@wixzel/react";
import { preloadEmbeddedSignup, runEmbeddedSignup, SignupCancelled, SignupError } from "@/components/whatsapp/embedded-signup";
import { ManualConnectDialog, StatusDot, StatusPill, WhatsAppMark, accountTone, qualityLine, qualityTone, useAgo, useApiMessage } from "@/components/whatsapp/parts";
import { API_BASE_URL, authHeaders, isPlanGate, type AgentRef, type WhatsAppAccount, type WhatsAppConfig } from "@/components/whatsapp/types";

const NONE = "none";

export default function WhatsAppPage() {
    return (
        <Suspense fallback={null}>
            <WhatsAppNumbers />
        </Suspense>
    );
}

/**
 * WhatsApp: the account's connected business numbers, the agent that answers
 * each, and the two ways to connect one: Meta's Embedded Signup popup when the
 * platform has a Meta app, and the account's own Meta app by hand.
 */
function WhatsAppNumbers() {
    const router = useRouter();
    const params = useSearchParams();
    const fromApp = params.get("connect") === "1";
    const t = useTranslations("whatsapp");
    const c = useTranslations("common");
    const ago = useAgo();
    const message = useApiMessage();
    const [accounts, setAccounts] = useState<WhatsAppAccount[] | null>(null);
    const [agents, setAgents] = useState<AgentRef[]>([]);
    const [config, setConfig] = useState<WhatsAppConfig | null>(null);
    const [gated, setGated] = useState(false);
    const [manual, setManual] = useState(false);
    const [choosing, setChoosing] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [saving, setSaving] = useState<string | null>(null);

    const load = useCallback(async () => {
        const headers = authHeaders();
        try {
            const [a, g, c] = await Promise.all([
                axios.get(`${API_BASE_URL}/whatsapp/accounts`, { headers }),
                axios.get(`${API_BASE_URL}/agents`, { headers }).catch(() => null),
                axios.get(`${API_BASE_URL}/whatsapp/config`, { headers }).catch(() => null),
            ]);
            setAccounts((a.data?.data?.accounts as WhatsAppAccount[]) ?? []);
            if (g?.data?.status === "success") setAgents(g.data.data.agents as AgentRef[]);
            setConfig((c?.data?.data as WhatsAppConfig) ?? null);
        } catch (err) {
            if (isPlanGate(err)) setGated(true);
            else toast.error(message(err, t("page.loadFailed")));
            setAccounts([]);
        }
    }, [message, t]);

    useEffect(() => { void load(); }, [load]);

    const signup = config?.embeddedSignup;
    const canSignup = Boolean(signup?.enabled && signup.appId && signup.configId);

    // Ready before the click, so Meta's popup is not blocked.
    useEffect(() => {
        if (canSignup && signup?.appId) preloadEmbeddedSignup({ appId: signup.appId, graphVersion: signup.graphVersion });
    }, [canSignup, signup?.appId, signup?.graphVersion]);
    const agentName = useMemo(() => new Map(agents.map((a) => [a._id, a.name])), [agents]);

    async function connect(coexistence: boolean) {
        if (!signup?.appId || !signup.configId) return;
        setChoosing(false);
        setConnecting(true);
        try {
            const r = await runEmbeddedSignup({ appId: signup.appId, configId: signup.configId, graphVersion: signup.graphVersion }, coexistence);
            const res = await axios.post(`${API_BASE_URL}/whatsapp/embedded-signup`, r, { headers: authHeaders() });
            const a = res.data.data.account as WhatsAppAccount;
            toast.success(t("page.connectedNotice", { number: a.displayPhoneNumber || t("page.yourNumber") }));
            router.push(`/whatsapp/account?id=${a._id}`);
        } catch (err) {
            if (err instanceof SignupCancelled) return;
            if (isPlanGate(err)) setGated(true);
            toast.error(err instanceof SignupError ? t(`signup.${err.key}`, err.values) : message(err, t("page.connectFailed")));
        } finally {
            setConnecting(false);
        }
    }

    async function assign(a: WhatsAppAccount, agentId: string | null) {
        setSaving(a._id);
        try {
            const res = await axios.patch(`${API_BASE_URL}/whatsapp/accounts/${a._id}`, { inboundAgentId: agentId }, { headers: authHeaders() });
            const updated = res.data.data.account as WhatsAppAccount;
            setAccounts((list) => (list ?? []).map((x) => (x._id === a._id ? updated : x)));
            const number = a.displayPhoneNumber || a.phoneNumberId;
            toast.success(agentId
                ? t("page.agentAnswers", { agent: agentName.get(agentId) ?? t("page.theAgent"), number })
                : t("page.nobodyAnswers", { number }));
        } catch (err) {
            toast.error(message(err, t("page.changeAgentFailed")));
        } finally {
            setSaving(null);
        }
    }

    const connectButton = canSignup
        ? <Button variant="primary" onClick={() => setChoosing(true)} loading={connecting} disabled={gated}>{t("page.connectWhatsApp")}</Button>
        : <Button variant="primary" onClick={() => setManual(true)} disabled={gated}>{t("page.connectNumber")}</Button>;
    const ownAppButton = canSignup ? <Button variant="secondary" onClick={() => setManual(true)} disabled={gated}>{t("page.useOwnApp")}</Button> : null;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("page.title")}
                description={t("page.description")}
                info={t("page.info")}
                actions={(accounts?.length ?? 0) > 0 ? <div className="flex flex-wrap gap-2">{ownAppButton}{connectButton}</div> : undefined}
            />

            {gated && <Alert tone="warning" title={t("errors.planGateTitle")}>{t("errors.planGate")}</Alert>}

            {accounts === null && <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-lg" />)}</div>}

            {accounts?.length === 0 && <Intro highlight={fromApp} action={<>{connectButton}{ownAppButton}</>} />}

            {accounts && accounts.length > 0 && (
                <ul className="grid gap-4 lg:grid-cols-2">
                    {accounts.map((a) => {
                        const st = accountTone(a, t);
                        const number = a.displayPhoneNumber || a.phoneNumberId;
                        return (
                            <li key={a._id}>
                                <Card className="flex h-full flex-col gap-4 p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <WhatsAppMark size={18} />
                                            <div className="min-w-0">
                                                <p dir="ltr" className="truncate text-start font-mono text-heading-sm font-medium tabular-nums text-fg">{number}</p>
                                                <p className="truncate text-caption text-fg-subtle">{a.verifiedName || a.name || t("page.businessFallback")}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <StatusPill tone={st.tone}>{st.label}</StatusPill>
                                            {a.status !== "connected" && (
                                                <Button variant="primary" size="xs" loading={connecting} iconStart={<ArrowsClockwise aria-hidden />}
                                                    onClick={() => (a.connection === "embedded_signup" && canSignup ? void connect(a.coexistence) : setManual(true))}>
                                                    {t("page.reconnect")}
                                                </Button>
                                            )}
                                            <Button asChild size="xs" variant="secondary">
                                                <Link href={`/whatsapp/account?id=${a._id}`}><GearSix aria-hidden /> {t("page.open")}</Link>
                                            </Button>
                                        </div>
                                    </div>
                                    {/* Where chats go: a light stop on the muted band, then the agent picker. */}
                                    <div className="flex flex-wrap items-center gap-2 rounded-md bg-bg-muted p-2.5">
                                        <span className="inline-flex items-center gap-1.5 rounded-sm bg-surface px-2.5 py-1.5 text-caption text-fg-muted">
                                            <ArrowBendUpLeft className="size-3.5" aria-hidden />{t("page.chats")}
                                        </span>
                                        <ArrowRight className="size-4 shrink-0 text-fg-subtle rtl:-scale-x-100" aria-hidden />
                                        <Select value={a.inboundAgentId ?? NONE} onValueChange={(v) => void assign(a, v === NONE ? null : v)} disabled={saving === a._id}>
                                            <SelectTrigger size="sm" className="max-w-[220px]" aria-label={t("page.agentFor", { number })}><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={NONE}>{t("page.noAgentYet")}</SelectItem>
                                                {agents.map((g) => <SelectItem key={g._id} value={g._id}>{g.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-subtle">
                                        <span className="inline-flex items-center gap-1.5"><StatusDot tone={qualityTone(a.qualityRating)} size={7} />{qualityLine(a.qualityRating, t)}</span>
                                        {a.messagingLimitTier && <span>{t("page.limitPerDay", { tier: a.messagingLimitTier.replace("TIER_", "").toLowerCase() })}</span>}
                                        <span>{t("page.lastFromMeta", { when: ago(a.webhook.lastReceivedAt) })}</span>
                                        <span>{a.connection === "manual" ? t("page.connectionManual") : t("page.connectionEmbedded")}</span>
                                        {a.coexistence && <span>{t("page.coexistence")}</span>}
                                        {a.lastError && <span className="text-danger-ink">{a.lastError}</span>}
                                    </div>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}

            {accounts && accounts.length > 0 && agents.length > 0 && (
                <p className="text-body-sm text-fg-muted">
                    {t.rich("page.toolsHint", { link: (chunks) => <Link href="/agents" className="font-semibold text-accent-ink underline">{chunks}</Link> })}
                </p>
            )}

            <ManualConnectDialog open={manual} onOpenChange={setManual} agents={agents} onConnected={() => { void load(); }} />

            <Dialog open={choosing} onOpenChange={setChoosing}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("page.whichNumber")}</DialogTitle>
                        <DialogDescription>{t("page.whichNumberLine")}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                        <ChoiceCard title={t("page.choiceNewTitle")} line={t("page.choiceNewLine")} onClick={() => void connect(false)} />
                        <ChoiceCard title={t("page.choiceAppTitle")} line={t("page.choiceAppLine")} onClick={() => void connect(true)} />
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setChoosing(false)}>{c("actions.cancel")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ChoiceCard({ title, line, onClick }: { title: string; line: string; onClick: () => void }) {
    return (
        // A Tile given its own two lines: its built-in description is one truncated line, and these are sentences.
        <Tile asChild>
            <button type="button" onClick={onClick} className="flex-col items-start gap-1 p-4">
                <span className="block text-body-sm font-semibold text-fg">{title}</span>
                <span className="block text-start text-body-sm text-fg-muted">{line}</span>
            </button>
        </Tile>
    );
}

const WHAT_IT_DOES = [
    { icon: ArrowBendUpLeft, title: "page.featureChats", line: "page.featureChatsLine" },
    { icon: Microphone, title: "page.featureVoice", line: "page.featureVoiceLine" },
    { icon: CalendarCheck, title: "page.featureBooking", line: "page.featureBookingLine" },
    { icon: PaperPlaneTilt, title: "page.featureTemplates", line: "page.featureTemplatesLine" },
] as const;

/** The empty page: what WhatsApp gives an agent, the three steps, and the button. */
function Intro({ action, highlight }: { action: React.ReactNode; highlight: boolean }) {
    const t = useTranslations("whatsapp");
    return (
        // Arriving from an agent's "connect" link, the card is shown selected: the accent ring.
        <Card selected={highlight} className="overflow-hidden p-0">
            <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
                <div className="p-6 sm:p-8">
                    <WhatsAppMark size={22} />
                    <h2 className="mt-4 text-heading-md">{t("page.introTitle")}</h2>
                    <ol className="mt-5 flex flex-col gap-3 text-body-sm text-fg-muted">
                        {[t("page.introStep1"), t("page.introStep2"), t("page.introStep3")].map((s, i) => (
                            <li key={s} className="flex items-center gap-3">
                                <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-accent-subtle text-caption font-semibold tabular-nums text-accent-ink">{i + 1}</span>
                                {s}
                            </li>
                        ))}
                    </ol>
                    <div className="mt-6 flex flex-wrap gap-2">{action}</div>
                    <p className="mt-4 text-caption text-fg-subtle">{t("page.introNote")}</p>
                </div>
                {/* Hairlines between the cells: lines only divide inside the panel. */}
                <div className="grid grid-cols-2 gap-px bg-border">
                    {WHAT_IT_DOES.map(({ icon: Icon, title, line }) => (
                        <div key={title} className="flex flex-col gap-2 bg-bg-muted p-5">
                            <Icon className="size-5 text-fg-muted" aria-hidden />
                            <span className="text-body-sm font-semibold text-fg">{t(title)}</span>
                            <span className="text-caption text-fg-muted">{t(line)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
}
