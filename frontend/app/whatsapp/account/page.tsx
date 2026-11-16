"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import axios from "axios";
import {
    ArrowLeft, ArrowBendUpLeft, ArrowsClockwise, Check, Checks, Clock, FileText, Image as ImageIcon, MapPin, Microphone, Plus, Sticker, Trash, Tray, UserCircle, VideoCamera, Warning, Wrench,
} from "@phosphor-icons/react";
import {
    Alert, Button, Card, CopyField, DescriptionList, EmptyState, Field, Input, Message, Section, Skeleton, Stat, Switch,
    Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Transcript, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn, toast, useConfirm,
} from "@wixzel/react";
import { useSettings } from "@/components/settings-provider";
import { StatusDot, StatusPill, WhatsAppMark, accountTone, qualityTone, useAgo, useApiMessage } from "@/components/whatsapp/parts";
import { TemplateDialog } from "@/components/whatsapp/template-dialog";
import {
    API_BASE_URL, authHeaders, type AgentRef, type WhatsAppAccount, type WhatsAppAccountSettings, type WhatsAppConversation, type WhatsAppMessage, type WhatsAppTemplate,
} from "@/components/whatsapp/types";

const NONE = "none";
type Tab = "overview" | "inbox" | "templates" | "settings";
type T = ReturnType<typeof useTranslations<"whatsapp">>;

export default function WhatsAppAccountPage() {
    return (
        <Suspense fallback={null}>
            <AccountScreen />
        </Suspense>
    );
}

/** One connected number: who answers it, its chats, its templates, and how it behaves. */
function AccountScreen() {
    const params = useSearchParams();
    const router = useRouter();
    const id = params.get("id") ?? "";
    const t = useTranslations("whatsapp");
    const c = useTranslations("common");
    const { branding } = useSettings();
    const confirm = useConfirm();
    const message = useApiMessage();
    const [account, setAccount] = useState<WhatsAppAccount | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [agents, setAgents] = useState<AgentRef[]>([]);
    const [conversations, setConversations] = useState<WhatsAppConversation[] | null>(null);
    const [tab, setTab] = useState<Tab>("overview");
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!id) return;
        const headers = authHeaders();
        try {
            const [a, g, cv] = await Promise.all([
                axios.get(`${API_BASE_URL}/whatsapp/accounts/${id}`, { headers }),
                axios.get(`${API_BASE_URL}/agents`, { headers }).catch(() => null),
                axios.get(`${API_BASE_URL}/whatsapp/conversations`, { params: { accountId: id, limit: 200 }, headers }).catch(() => null),
            ]);
            setAccount(a.data.data.account as WhatsAppAccount);
            if (g?.data?.status === "success") setAgents(g.data.data.agents as AgentRef[]);
            setConversations((cv?.data?.data?.conversations as WhatsAppConversation[]) ?? []);
        } catch (err) {
            setFailed(message(err, t("account.loadFailed")));
        }
    }, [id, message, t]);

    useEffect(() => { void load(); }, [load]);

    async function patch(body: Record<string, unknown>, ok: string) {
        if (!account) return;
        setBusy("patch");
        try {
            const res = await axios.patch(`${API_BASE_URL}/whatsapp/accounts/${account._id}`, body, { headers: authHeaders() });
            setAccount(res.data.data.account as WhatsAppAccount);
            toast.success(ok);
        } catch (err) {
            toast.error(message(err, t("account.saveFailed")));
        } finally {
            setBusy(null);
        }
    }

    async function refresh() {
        if (!account) return;
        setBusy("refresh");
        try {
            const res = await axios.post(`${API_BASE_URL}/whatsapp/accounts/${account._id}/refresh`, {}, { headers: authHeaders() });
            setAccount(res.data.data.account as WhatsAppAccount);
            toast.success(t("account.refreshed"));
        } catch (err) {
            toast.error(message(err, t("account.refreshFailed")));
        } finally {
            setBusy(null);
        }
    }

    async function disconnect() {
        if (!account) return;
        const number = account.displayPhoneNumber || account.phoneNumberId;
        const ok = await confirm({
            title: t("account.disconnectTitle", { number }),
            description: t("account.disconnectConfirm", { appName: branding.appName }),
            confirmLabel: t("account.disconnect"),
            tone: "danger",
        });
        if (!ok) return;
        setBusy("delete");
        try {
            await axios.delete(`${API_BASE_URL}/whatsapp/accounts/${account._id}`, { headers: authHeaders() });
            toast.success(t("account.disconnected", { number }));
            router.push("/whatsapp");
        } catch (err) {
            toast.error(message(err, t("account.disconnectFailed")));
            setBusy(null);
        }
    }

    if (!id || failed) return <Alert tone="danger">{failed ?? t("account.noNumber")}</Alert>;
    if (!account) return <Skeleton className="h-64 rounded-lg" />;

    const st = accountTone(account, t);
    return (
        <div className="flex flex-col gap-6">
            <div>
                <Button asChild variant="ghost" size="sm" className="-ms-2.5">
                    <Link href="/whatsapp"><ArrowLeft className="rtl:-scale-x-100" aria-hidden /> {t("account.back")}</Link>
                </Button>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <WhatsAppMark size={22} />
                        <div className="min-w-0">
                            <h1 dir="ltr" className="truncate text-start font-mono text-heading-lg tabular-nums">{account.displayPhoneNumber || account.phoneNumberId}</h1>
                            <p className="truncate text-body-sm text-fg-muted">{account.verifiedName || account.name}</p>
                        </div>
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => void refresh()} loading={busy === "refresh"} iconStart={<ArrowsClockwise aria-hidden />}>{c("actions.refresh")}</Button>
                        <Button variant="secondary" onClick={() => void disconnect()} loading={busy === "delete"}>{t("account.disconnect")}</Button>
                    </div>
                </div>
            </div>

            <Tabs variant="line" value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full gap-6">
                <TabsList className="max-w-full justify-start overflow-x-auto">
                    <TabsTrigger value="overview">{t("account.tabOverview")}</TabsTrigger>
                    <TabsTrigger value="inbox">{t("account.tabInbox")}</TabsTrigger>
                    <TabsTrigger value="templates">{t("account.tabTemplates")}</TabsTrigger>
                    <TabsTrigger value="settings">{t("account.tabSettings")}</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                    <Overview account={account} agents={agents} conversations={conversations ?? []} onPatch={patch} saving={busy === "patch"} />
                </TabsContent>
                <TabsContent value="inbox">
                    <InboxTab conversations={conversations} agents={agents} onOpenSettings={() => setTab("settings")} />
                </TabsContent>
                <TabsContent value="templates">
                    <TemplatesTab account={account} />
                </TabsContent>
                <TabsContent value="settings">
                    <SettingsTab account={account} onPatch={patch} saving={busy === "patch"} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function Overview({ account, agents, conversations, onPatch, saving }: {
    account: WhatsAppAccount;
    agents: AgentRef[];
    conversations: WhatsAppConversation[];
    onPatch: (body: Record<string, unknown>, ok: string) => Promise<void>;
    saving: boolean;
}) {
    const t = useTranslations("whatsapp");
    const locale = useLocale();
    const ago = useAgo();
    const agentName = new Map(agents.map((a) => [a._id, a.name]));
    // The 30-day window is fixed when the tab opens; the counts do not need to tick.
    const [since] = useState(() => Date.now() - 30 * 86400_000);
    const recent = conversations.filter((cv) => new Date(cv.lastMessageAt).getTime() > since);
    const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

    return (
        <div className="flex flex-col gap-6">
            <Section title={t("account.answeringAgent")} description={t("account.answeringAgentLine")}>
                <div className="flex flex-wrap items-center gap-3">
                    <Select value={account.inboundAgentId ?? NONE} disabled={saving}
                        onValueChange={(v) => void onPatch({ inboundAgentId: v === NONE ? null : v }, v !== NONE ? t("account.agentAnswers", { agent: agentName.get(v) ?? t("account.theAgent") }) : t("account.nobodyAnswers"))}>
                        <SelectTrigger className="min-w-[260px]" aria-label={t("account.answeringAgent")}><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>{t("account.noAgentOption")}</SelectItem>
                            {agents.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {account.inboundAgentId && (
                        <Link href="/agents" className="text-body-sm font-semibold text-accent-ink underline">{t("account.agentTools")}</Link>
                    )}
                </div>
            </Section>

            <div className="grid gap-4 sm:grid-cols-2">
                <Card><Stat label={t("account.kpiChats")} value={String(recent.length)} /></Card>
                <Card><Stat label={t("account.kpiMessages")} value={String(recent.reduce((n, cv) => n + cv.messageCount, 0))} /></Card>
            </div>

            <Card>
                <DescriptionList items={[
                    { term: t("account.quality"), value: <span className="inline-flex items-center gap-2"><StatusDot tone={qualityTone(account.qualityRating)} />{ratingLabel(account.qualityRating, t)}</span> },
                    { term: t("account.newChatsPerDay"), value: account.messagingLimitTier ? account.messagingLimitTier.replace("TIER_", "").toLowerCase() : t("account.notSetYet") },
                    { term: t("account.lastFromMeta"), value: ago(account.webhook.lastReceivedAt) },
                    { term: t("account.connection"), value: `${account.connection === "manual" ? t("page.connectionManual") : t("page.connectionEmbedded")}${account.coexistence ? ` · ${t("page.coexistence")}` : ""}` },
                    { term: t("account.tokenExpires"), value: account.tokenExpiresAt ? dateFmt.format(new Date(account.tokenExpiresAt)) : t("account.tokenNever") },
                ]} />
                {account.lastError && <Alert tone="danger" className="mt-4">{account.lastError}</Alert>}
            </Card>

            {account.connection === "manual" && account.webhook.ownDoor && (
                <Section
                    title={t("account.webhookTitle")}
                    description={account.webhook.status === "ok" ? t("account.webhookOk") : account.webhook.status === "error" ? t("account.webhookError") : t("account.webhookWaiting")}
                >
                    <CopyField value={account.webhook.url} className="ltr-data" />
                </Section>
            )}
        </div>
    );
}

/** Meta's quality rating as a word, "Green". */
function ratingLabel(q: string, t: T): string {
    if (q === "GREEN") return t("account.ratingGreen");
    if (q === "YELLOW") return t("account.ratingYellow");
    if (q === "RED") return t("account.ratingRed");
    if (!q || q === "UNKNOWN" || q === "NA") return t("account.ratingUnknown");
    return q.charAt(0) + q.slice(1).toLowerCase();
}

function ticks(t: T): Record<string, React.ReactNode> {
    return {
        accepted: <Clock size={12} aria-label={t("account.tickSending")} />,
        sent: <Check size={12} aria-label={t("account.tickSent")} />,
        delivered: <Checks size={12} aria-label={t("account.tickDelivered")} />,
        read: <Checks size={12} className="text-info-ink" aria-label={t("account.tickRead")} />,
        failed: <Warning size={12} className="text-danger-ink" aria-label={t("account.tickFailed")} />,
    };
}

const ORIGIN = {
    chat: "account.originChat", agent_tool: "account.originAgentTool", api: "account.originApi", scheduled: "account.originScheduled", business_app: "account.originBusinessApp",
} as const;

/** Who sent an outgoing message; the system's own messages carry the platform's name. */
function originLabel(origin: string, t: T, appName: string): string {
    if (origin === "system") return appName;
    const key = (ORIGIN as Record<string, string>)[origin];
    return key ? t(key) : t("account.originBusiness");
}

const MEDIA_ICON: Record<string, typeof FileText> = { audio: Microphone, image: ImageIcon, video: VideoCamera, document: FileText, sticker: Sticker, location: MapPin, contacts: UserCircle };
const MEDIA_LABEL: Record<string, string> = { audio: "account.voiceNote", image: "account.photo", video: "account.video", document: "account.file", sticker: "account.sticker", location: "account.location", contacts: "account.contacts" };

/**
 * One message's content. Text as is; a voice note as its transcript; a photo
 * or voice note that was kept comes through the authenticated media route into
 * a blob URL; anything else a placeholder naming the kind of attachment.
 */
function Bubble({ m, t }: { m: WhatsAppMessage; t: T }) {
    if (m.type === "interactive" || m.type === "button") return <span className="whitespace-pre-wrap">{m.direction === "in" ? t("account.tapped", { text: m.transcript || m.text }) : m.text}</span>;
    if (m.type === "reaction") return <span>{t("account.reacted", { text: m.text })}</span>;
    if (m.type === "template" && m.template) return <span className="whitespace-pre-wrap">{m.text || t("account.templateSent", { name: m.template.name })}</span>;
    const Icon = MEDIA_ICON[m.type];
    if (!Icon) return <span className="whitespace-pre-wrap">{m.text}</span>;
    return (
        <span className="flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted">
                <Icon size={14} aria-hidden />
                {m.type === "audio" && m.transcript ? t("account.voiceNoteText", { text: m.transcript }) : m.mediaFilename || t(MEDIA_LABEL[m.type])}
            </span>
            {m.hasMedia && (m.type === "image" || m.type === "audio") && <MediaPreview message={m} t={t} />}
            {m.text && m.type !== "audio" && <span className="whitespace-pre-wrap">{m.text}</span>}
        </span>
    );
}

/** A kept photo or voice note, fetched with the Bearer header because the media route is authenticated. */
function MediaPreview({ message, t }: { message: WhatsAppMessage; t: T }) {
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let objectUrl: string | null = null;
        let cancelled = false;
        axios.get(`${API_BASE_URL}/whatsapp/media/${message._id}`, { headers: authHeaders(), responseType: "blob" })
            .then((r) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(r.data as Blob);
                setUrl(objectUrl);
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [message._id]);

    if (failed) return <span className="text-caption text-fg-subtle">{t("account.mediaUnavailable")}</span>;
    if (!url) return <Skeleton className="h-10 w-40 rounded-md" />;
    if (message.type === "image") {
        return (
            <a href={url} target="_blank" rel="noreferrer" aria-label={t("account.mediaOpen")}>
                {/* A blob URL from this page, not a remote image: next/image has nothing to optimise here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={message.mediaFilename || t("account.photo")} className="max-h-60 max-w-full rounded-md object-contain" />
            </a>
        );
    }
    return <audio controls preload="metadata" src={url} className="max-w-full" />;
}

function InboxTab({ conversations, agents, onOpenSettings }: { conversations: WhatsAppConversation[] | null; agents: AgentRef[]; onOpenSettings: () => void }) {
    const [open, setOpen] = useState<WhatsAppConversation | null>(null);
    const [loading, setLoading] = useState(false);
    const t = useTranslations("whatsapp");
    const locale = useLocale();
    const { branding } = useSettings();
    const message = useApiMessage();
    const ago = useAgo();
    const tick = useMemo(() => ticks(t), [t]);
    const timeFmt = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }), [locale]);
    const agentName = useMemo(() => new Map(agents.map((a) => [a._id, a.name])), [agents]);

    async function show(cv: WhatsAppConversation) {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/whatsapp/conversations/${cv._id}`, { headers: authHeaders() });
            setOpen(res.data.data.conversation as WhatsAppConversation);
        } catch (err) {
            toast.error(message(err, t("account.loadFailed")));
        } finally {
            setLoading(false);
        }
    }

    if (conversations === null) return <Skeleton className="h-64 rounded-lg" />;
    if (conversations.length === 0) {
        return <EmptyState icon={<Tray />} title={t("account.noChats")} description={t("account.noChatsLine")} actions={<Button variant="secondary" onClick={onOpenSettings}>{t("account.howItAnswers")}</Button>} />;
    }

    /** Tool calls in time order with the messages, so "Used book_appointment" sits where it happened. */
    const items = open ? [
        ...(open.messages ?? []).map((m) => ({ kind: "message" as const, at: new Date(m.createdAt).getTime(), m })),
        ...(open.toolCalls ?? []).filter((tc) => tc.tool).map((tc, i) => ({ kind: "tool" as const, at: tc.createdAt ? new Date(tc.createdAt).getTime() : Number.MAX_SAFE_INTEGER - i, tc })),
    ].sort((a, b) => a.at - b.at) : [];

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
            {/* Chats on one tinted panel; the open chat takes the accent wash, as a selected table row does. */}
            <ul className="flex max-h-[640px] flex-col gap-1 overflow-y-auto rounded-lg bg-surface p-2">
                {conversations.map((cv) => (
                    <li key={cv._id}>
                        <button type="button" onClick={() => void show(cv)} aria-current={open?._id === cv._id || undefined}
                            className={cn("flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2.5 text-start transition-colors",
                                open?._id === cv._id ? "bg-accent-subtle" : "hover:bg-bg-muted")}>
                            <span className="flex w-full items-center justify-between gap-2">
                                <span className="truncate text-body-sm font-medium text-fg">{cv.contact.name || <bdi dir="ltr">+{cv.contact.waId}</bdi>}</span>
                                <span className="shrink-0 text-caption text-fg-subtle">{ago(cv.lastMessageAt)}</span>
                            </span>
                            <span className="flex items-center gap-2 text-caption text-fg-subtle">
                                <StatusDot tone={cv.status === "open" ? "live" : "idle"} size={6} />
                                {t("account.messageCount", { count: cv.messageCount })}
                                {cv.status === "closed" && ` · ${t("account.closed")}`}
                                {cv.contact.optedOut && ` · ${t("account.optedOut")}`}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            <div className="min-h-[320px] rounded-lg bg-surface p-4">
                {loading && <Skeleton className="h-40 rounded-md" />}
                {!loading && !open && <p className="flex h-full items-center justify-center text-body-sm text-fg-subtle"><ArrowBendUpLeft size={16} className="me-2" aria-hidden />{t("account.pickChat")}</p>}
                {!loading && open && (
                    <>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                            <div>
                                <p className="text-body-sm font-semibold text-fg">{open.contact.name || t("account.whatsappUser")} <bdi dir="ltr" className="font-mono font-normal text-fg-muted">+{open.contact.waId}</bdi></p>
                                <p className="text-caption text-fg-subtle">
                                    {open.agentId ? t("account.answeredBy", { agent: agentName.get(open.agentId) ?? t("account.anAgent") }) : t("account.noAgent")}
                                </p>
                            </div>
                            {open.contact.leadId && <Link href="/leads" className="text-caption font-semibold text-accent-ink underline">{t("account.lead")}</Link>}
                        </div>
                        {/*
                          * Message names its sides for a call (the agent on the start side, the
                          * person on the end side); in this inbox the business's own messages belong
                          * on the end side, so ours go in as "person" and the customer's as "agent".
                          */}
                        <Transcript>
                            {items.map((it, i) => {
                                if (it.kind === "tool") {
                                    return (
                                        <div key={`tool-${i}`} className="my-1 flex justify-center">
                                            <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-2.5 py-1 text-caption", it.tc.ok === false ? "text-danger-ink" : "text-fg-muted")}>
                                                <Wrench size={12} aria-hidden />
                                                <span className="ltr-data font-mono">{it.tc.ok === false ? t("account.toolCallFailed", { tool: it.tc.tool ?? "" }) : t("account.toolCall", { tool: it.tc.tool ?? "" })}</span>
                                            </span>
                                        </div>
                                    );
                                }
                                const m = it.m;
                                const mine = m.direction === "out";
                                return (
                                    <Message
                                        key={m._id}
                                        from={mine ? "person" : "agent"}
                                        name={mine ? originLabel(m.origin, t, branding.appName) : t("account.customer")}
                                        time={timeFmt.format(new Date(m.createdAt))}
                                    >
                                        <Bubble m={m} t={t} />
                                        {mine && <span className="ms-2 inline-flex translate-y-0.5 text-fg-subtle">{tick[m.status]}</span>}
                                        {m.error?.message && <span className="mt-0.5 block text-caption text-danger-ink">{m.error.message}</span>}
                                    </Message>
                                );
                            })}
                        </Transcript>
                    </>
                )}
            </div>
        </div>
    );
}

const TEMPLATE_STATUS: Record<string, string> = {
    APPROVED: "account.statusApproved", PENDING: "account.statusPending", REJECTED: "account.statusRejected", PAUSED: "account.statusPaused", DISABLED: "account.statusDisabled",
};
const TEMPLATE_CATEGORY: Record<string, string> = {
    UTILITY: "account.categoryUtility", MARKETING: "account.categoryMarketing", AUTHENTICATION: "account.categoryAuthentication",
};

/** Meta's template status, "approved"; one Meta adds later shows as Meta sends it. */
function templateStatus(s: string | null, t: T): string {
    if (!s) return t("account.statusUnknown");
    const key = TEMPLATE_STATUS[s];
    return key ? t(key) : s.toLowerCase();
}

function templateCategory(cat: string, t: T): string {
    const key = TEMPLATE_CATEGORY[cat];
    return key ? t(key) : cat.toLowerCase();
}

function TemplatesTab({ account }: { account: WhatsAppAccount }) {
    const t = useTranslations("whatsapp");
    const c = useTranslations("common");
    const confirm = useConfirm();
    const message = useApiMessage();
    const [rows, setRows] = useState<WhatsAppTemplate[] | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        axios.get(`${API_BASE_URL}/whatsapp/templates`, { params: { accountId: account._id }, headers: authHeaders() })
            .then((r) => { if (!cancelled) setRows((r.data?.data?.templates as WhatsAppTemplate[]) ?? []); })
            .catch((err) => { if (!cancelled) { toast.error(message(err, t("account.templatesLoadFailed"))); setRows([]); } });
        return () => { cancelled = true; };
    }, [account._id, message, t]);

    async function remove(tpl: WhatsAppTemplate) {
        const ok = await confirm({
            title: t("account.deleteTitle", { name: tpl.name }),
            description: t("account.deleteLine"),
            confirmLabel: c("actions.delete"),
            tone: "danger",
        });
        if (!ok) return;
        setDeleting(tpl._id);
        try {
            await axios.delete(`${API_BASE_URL}/whatsapp/templates/${tpl._id}`, { headers: authHeaders() });
            setRows((list) => (list ?? []).filter((x) => x._id !== tpl._id));
            toast.success(t("account.templateDeleted", { name: tpl.name }));
        } catch (err) {
            toast.error(message(err, t("account.templateDeleteFailed")));
        } finally {
            setDeleting(null);
        }
    }

    async function sync() {
        setSyncing(true);
        try {
            const res = await axios.post(`${API_BASE_URL}/whatsapp/templates/sync`, { accountId: account._id }, { headers: authHeaders() });
            const list = (res.data?.data?.templates as WhatsAppTemplate[]) ?? [];
            setRows(list);
            toast.success(t("account.templatesSynced", { count: list.length }));
        } catch (err) {
            toast.error(message(err, t("account.templatesSyncFailed")));
        } finally {
            setSyncing(false);
        }
    }

    const tone = (s: string | null): "good" | "warn" | "bad" => (s === "APPROVED" ? "good" : s === "PENDING" ? "warn" : "bad");
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-xl text-body-sm text-fg-muted">{t("account.templatesIntro")}</p>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => void sync()} loading={syncing} iconStart={<ArrowsClockwise aria-hidden />}>{t("account.sync")}</Button>
                    <Button variant="primary" onClick={() => setCreating(true)} iconStart={<Plus aria-hidden />}>{t("account.newTemplate")}</Button>
                </div>
            </div>
            {rows === null && <Skeleton className="h-40 rounded-lg" />}
            {rows?.length === 0 && <EmptyState icon={<ArrowBendUpLeft />} title={t("account.noTemplates")} description={t("account.noTemplatesLine")} />}
            {rows && rows.length > 0 && (
                <ul className="grid gap-3 lg:grid-cols-2">
                    {rows.map((tpl) => (
                        <li key={tpl._id}>
                            <Card className="flex h-full flex-col p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p dir="ltr" className="font-mono text-body-sm text-fg">{tpl.name} <span className="text-fg-subtle">{tpl.language}</span></p>
                                    <div className="flex items-center gap-2">
                                        <StatusPill tone={tone(tpl.status)}>{templateStatus(tpl.status, t)}</StatusPill>
                                        {tpl.category && <StatusPill tone={tpl.category === "MARKETING" ? "warn" : "info"}>{templateCategory(tpl.category, t)}</StatusPill>}
                                        <Button variant="ghost" size="icon-xs" onClick={() => void remove(tpl)} loading={deleting === tpl._id} aria-label={t("account.deleteTemplate", { name: tpl.name })}>
                                            <Trash aria-hidden />
                                        </Button>
                                    </div>
                                </div>
                                <Message from="agent" className="mt-3"><span className="whitespace-pre-wrap">{tpl.body || t("account.noBody")}</span></Message>
                                <p className="mt-2 text-caption text-fg-subtle">{t("account.valuesToFill", { count: tpl.parameterCount })}</p>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
            <TemplateDialog open={creating} onOpenChange={setCreating} accountId={account._id}
                onCreated={(tpl) => {
                    setRows((list) => [...(list ?? []).filter((x) => x._id !== tpl._id), tpl].sort((a, b) => a.name.localeCompare(b.name)));
                    toast.success(t("account.templateSubmitted", { name: tpl.name }));
                }} />
        </div>
    );
}

function SettingsTab({ account, onPatch, saving }: {
    account: WhatsAppAccount;
    onPatch: (body: Record<string, unknown>, ok: string) => Promise<void>;
    saving: boolean;
}) {
    const [s, setS] = useState<WhatsAppAccountSettings>(account.settings);
    const [name, setName] = useState(account.name);
    const t = useTranslations("whatsapp");
    const c = useTranslations("common");
    useEffect(() => { setS(account.settings); setName(account.name); }, [account]);

    const toggle = (key: "messagingEnabled" | "voiceNoteReplies" | "typingIndicator", label: string, hint: string) => (
        <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
                <span className="text-body-sm font-medium text-fg">{label}</span>
                <span className="text-caption text-fg-muted">{hint}</span>
            </div>
            <Switch checked={s[key]} onCheckedChange={(v) => setS({ ...s, [key]: v })} aria-label={label} />
        </div>
    );

    return (
        <form
            className="flex max-w-2xl flex-col gap-5"
            onSubmit={(e) => { e.preventDefault(); void onPatch({ name, settings: s }, t("account.saved")); }}
        >
            <Section title={t("account.behaviour")}>
                {toggle("messagingEnabled", t("account.answersMessages"), t("account.answersMessagesHint"))}
                {toggle("voiceNoteReplies", t("account.voiceReplies"), t("account.voiceRepliesHint"))}
                {toggle("typingIndicator", t("account.typing"), t("account.typingHint"))}
            </Section>
            <Section title={t("account.details")}>
                <Field label={t("account.label")}>
                    <Input value={name} placeholder={t("account.labelPlaceholder")} maxLength={100} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label={t("account.inactivity")} hint={t("account.inactivityHint")}>
                    <Input type="number" min={1} max={1440} value={s.inactivityMinutes} className="tabular-nums"
                        onChange={(e) => setS({ ...s, inactivityMinutes: Math.min(1440, Math.max(1, Number(e.target.value) || 15)) })} />
                </Field>
                {account.coexistence && (
                    <Field label={t("account.humanPause")} hint={t("account.humanPauseHint")}>
                        <Input type="number" min={0} max={1440} value={s.humanPauseMinutes} className="tabular-nums"
                            onChange={(e) => setS({ ...s, humanPauseMinutes: Math.min(1440, Math.max(0, Number(e.target.value) || 0)) })} />
                    </Field>
                )}
                <Field label={t("account.fallbackReply")} hint={t("account.fallbackReplyHint")}>
                    <Textarea rows={2} maxLength={1000} value={s.fallbackReply} placeholder={t("account.fallbackReplyPlaceholder")}
                        onChange={(e) => setS({ ...s, fallbackReply: e.target.value })} />
                </Field>
            </Section>
            <div><Button type="submit" variant="primary" loading={saving}>{c("actions.save")}</Button></div>
        </form>
    );
}
