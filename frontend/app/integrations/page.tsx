"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowsClockwise, MagnifyingGlass, Plus, VideoCamera } from "@phosphor-icons/react";
import { Avatar, AvatarGroup, Badge, Button, Card, Chip, Chips, InfoTip, Input, PageHeader, Progress, Skeleton, toast } from "@wixzel/react";
import { AppIcon } from "@/components/integrations/app-icon";
import { StatusBadge, api, apiMessage, useAgo, type AgentRef, type McpServer } from "@/components/integrations/mcp";
import {
    NATIVE_INTEGRATIONS,
    NativeIntegrationDrawer,
    NativeIntegrationLogo,
    PARAM_TO_ID,
    type NativeIntegrationId,
} from "@/components/integrations/native-integration-drawer";
import { CATEGORIES, RAW_APPS, type Category, appForUrl, authHint, categoryLabel, hostOf, localizeApp, statusLabel } from "@/lib/app-catalog";

/**
 * Integrations: the account's own apps (alerts, exports, syncs), then other
 * apps' MCP servers, whose tools agents use during calls.
 *
 * IntelliCall does not build an MCP integration per app. Any app with a remote
 * MCP server can be connected; the directory below sets up the popular ones so
 * the owner does not have to find their URL and sign-in details.
 */
export default function IntegrationsPage() {
    return (
        <Suspense fallback={null}>
            <Integrations />
        </Suspense>
    );
}

function Integrations() {
    const params = useSearchParams();
    const t = useTranslations("integrations");
    const ago = useAgo();
    const [servers, setServers] = useState<McpServer[] | null>(null);
    const [agents, setAgents] = useState<AgentRef[]>([]);
    const [meetingsConnected, setMeetingsConnected] = useState(false);
    const [nativeConnected, setNativeConnected] = useState<Record<string, boolean>>({});
    const [nativeOpen, setNativeOpen] = useState<NativeIntegrationId | null>(() => {
        // An OAuth return (?slack=connected) opens that integration's card.
        for (const [param, id] of Object.entries(PARAM_TO_ID)) if (params.get(param)) return id;
        return null;
    });
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<Category | "All">("All");

    const load = useCallback(async () => {
        try {
            const [s, a] = await Promise.all([
                api<{ servers: McpServer[] }>("get", "/mcp-servers"),
                // Agents only say who uses what; the page still works without them.
                api<{ agents: AgentRef[] }>("get", "/agents").catch(() => ({ agents: [] as AgentRef[] })),
            ]);
            setServers(s.servers ?? []);
            setAgents(a.agents ?? []);
        } catch (err) {
            toast.error(apiMessage(err) || t("loadFailed"));
            setServers([]);
        }
    }, [t]);

    /** The Connected dots on the account's apps: config-status, and the API key's existence. */
    const loadNative = useCallback(async () => {
        const next: Record<string, boolean> = {};
        try {
            const d = await api<Record<string, unknown>>("get", "/settings/config-status");
            for (const item of NATIVE_INTEGRATIONS) if (item.statusKey) next[item.id] = Boolean(d?.[item.statusKey]);
        } catch {
            // The dots stay off; each card says more when opened.
        }
        try {
            const d = await api<{ hasKey?: boolean }>("get", "/users/api-key");
            next["api-access"] = Boolean(d?.hasKey);
        } catch {
            // Same.
        }
        setNativeConnected(next);
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { void loadNative(); }, [loadNative]);
    useEffect(() => {
        api<{ integration: unknown | null }>("get", "/meetings/integration")
            .then((d) => setMeetingsConnected(Boolean(d?.integration)), () => setMeetingsConnected(false));
    }, []);

    // Back from an MCP server's OAuth sign-in that failed before the server was known.
    useEffect(() => {
        if (params.get("oauth") === "error") toast.error(params.get("message") || t("signInIncomplete"));
        // The toast is for the arrival, not every re-render with the same URL.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const usedBy = useMemo(() => {
        const names = new Map<string, string[]>();
        for (const a of agents) for (const id of a.mcpServerIds ?? []) names.set(id, [...(names.get(id) ?? []), a.name]);
        return names;
    }, [agents]);

    /** Per directory app: whether one of its servers is ready, or only added. */
    const connectedApps = useMemo(() => {
        const state = new Map<string, "ready" | "added">();
        for (const s of servers ?? []) {
            const app = appForUrl(s.url);
            if (app && state.get(app.id) !== "ready") state.set(app.id, s.status === "ready" ? "ready" : "added");
        }
        return state;
    }, [servers]);

    const catalog = useMemo(() => RAW_APPS.map((a) => localizeApp(a, t)), [t]);
    const apps = useMemo(() => {
        const q = query.trim().toLowerCase();
        return catalog.filter((a) => (category === "All" || a.category === category)
            && (!q || `${a.name} ${categoryLabel(a.category, t)} ${a.tagline} ${a.blurb}`.toLowerCase().includes(q)));
    }, [catalog, query, category, t]);

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("description")}
                info={t("info")}
                actions={
                    <Button variant="primary" asChild>
                        <Link href="/integrations/edit"><Plus aria-hidden /> {t("addCustom")}</Link>
                    </Button>
                }
            />

            {/* The account's own apps: alerts, exports and syncs, each opening its card in a drawer. */}
            <section>
                <h2 className="mb-3 flex items-center gap-1 text-heading-sm">
                    {t("native.heading")}
                    <InfoTip>{t("native.info")}</InfoTip>
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {NATIVE_INTEGRATIONS.map((item) => {
                        const connected = Boolean(nativeConnected[item.id]);
                        return (
                            <li key={item.id} className="min-w-0">
                                {/* The whole card is the button; the row inside it keeps its own direction, since Card stacks. */}
                                <Card interactive asChild className="h-full w-full p-4 text-start">
                                    <button type="button" onClick={() => setNativeOpen(item.id)}>
                                        <span className="flex items-center gap-3">
                                            <NativeIntegrationLogo item={item} size={40} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-body-sm font-medium text-fg">{t(`native.items.${item.id}.name`)}</span>
                                                <span className="block truncate text-caption text-fg-muted">{t(`native.items.${item.id}.description`)}</span>
                                            </span>
                                            {connected && (
                                                <Badge tone="success" dot size="sm">
                                                    {item.id === "api-access" ? t("native.active") : t("connected")}
                                                </Badge>
                                            )}
                                        </span>
                                    </button>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            </section>

            {servers === null && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-lg" />)}</div>
            )}

            {servers && servers.length > 0 && (
                <section>
                    <h2 className="mb-3 text-heading-sm">{t("servers.heading")}</h2>
                    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {servers.map((s) => {
                            const enabled = s.tools.filter((x) => x.enabled).length;
                            const app = appForUrl(s.url);
                            const users = usedBy.get(s._id) ?? [];
                            return (
                                <li key={s._id} className="min-w-0">
                                    {/* The whole card is the link. */}
                                    <Card interactive asChild className="flex h-full flex-col gap-4 p-5">
                                        <Link href={`/integrations/edit?id=${s._id}`}>
                                            <div className="flex items-start gap-3">
                                                <AppIcon appId={app?.id} url={s.url} name={s.name} size={44} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-semibold text-fg">{s.name}</p>
                                                    <p className="ltr-data truncate text-start font-mono text-caption text-fg-subtle">{hostOf(s.url)}</p>
                                                </div>
                                                <StatusBadge status={s.status} />
                                            </div>
                                            <div className="mt-auto flex items-center justify-between gap-3">
                                                <div className="w-32">
                                                    <div className="text-caption text-fg-muted">
                                                        {t.rich("servers.toolsOn", { enabled, total: s.tools.length, n: (c) => <span className="font-medium tabular-nums text-fg">{c}</span> })}
                                                    </div>
                                                    <Progress value={enabled} max={Math.max(1, s.tools.length)} size="sm" className="mt-1.5" />
                                                </div>
                                                {users.length > 0
                                                    ? (
                                                        <AvatarGroup size="sm" max={4}>
                                                            {users.map((name) => <Avatar key={name} name={name} size="sm" shape="square" />)}
                                                        </AvatarGroup>
                                                    )
                                                    : <span className="text-caption text-fg-subtle">{t("servers.noAgents")}</span>}
                                            </div>
                                            {s.toolsRefreshedAt && (
                                                <p className="-mt-1 flex items-center gap-1 text-caption text-fg-subtle">
                                                    <ArrowsClockwise className="size-3" aria-hidden />{t("servers.toolsRead", { when: ago(s.toolsRefreshedAt) })}
                                                </p>
                                            )}
                                        </Link>
                                    </Card>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <section>
                <h2 className="mb-3 flex items-center gap-1 text-heading-sm">
                    {t("meetings.heading")}
                    <InfoTip>{t("meetings.info")}</InfoTip>
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <li className="min-w-0">
                        <Card interactive asChild className="flex h-full flex-col gap-3 p-4">
                            <Link href="/meetings">
                                <div className="flex items-center gap-3">
                                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                        <VideoCamera className="size-4" aria-hidden />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-body-sm font-medium text-fg">{t("meetings.name")}</p>
                                        <p className="truncate text-caption text-fg-subtle">{t("meetings.line")}</p>
                                    </div>
                                    {meetingsConnected && <Badge tone="success" dot size="sm">{t("connected")}</Badge>}
                                </div>
                                <p className="truncate text-body-sm text-fg-muted">{t("meetings.tagline")}</p>
                            </Link>
                        </Card>
                    </li>
                </ul>
            </section>

            <section>
                <h2 className="mb-3 flex items-center gap-1 text-heading-sm">
                    {t("directory.heading")}
                    <InfoTip>{t("directory.info")}</InfoTip>
                </h2>
                <div className="flex flex-col gap-3">
                    <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("directory.searchApps")}
                        aria-label={t("directory.searchApps")}
                        leading={<MagnifyingGlass />}
                        className="sm:max-w-sm"
                    />
                    {/* One choice of category: single-choice chips, which move with the arrow keys. */}
                    <Chips type="single" value={category} onValueChange={(v) => { if (v) setCategory(v as Category | "All"); }} aria-label={t("directory.heading")}>
                        {(["All", ...CATEGORIES] as const).map((c) => (
                            <Chip key={c} value={c}>{c === "All" ? t("catalog.category.all") : categoryLabel(c, t)}</Chip>
                        ))}
                    </Chips>
                </div>

                <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <li className="min-w-0">
                        <Card interactive asChild className="flex h-full flex-col gap-3 p-4">
                            <Link href="/integrations/edit">
                                <div className="flex items-center gap-3">
                                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                        <Plus className="size-4" aria-hidden />
                                    </span>
                                    <p className="text-body-sm font-medium text-fg">{t("directory.customTitle")}</p>
                                </div>
                                <p className="truncate text-body-sm text-fg-muted" title={t("directory.customHint")}>
                                    {t("directory.customLine")}
                                </p>
                            </Link>
                        </Card>
                    </li>
                    {apps.map((a) => (
                        <li key={a.id} className="min-w-0">
                            <Card interactive asChild className="flex h-full flex-col gap-3 p-4">
                                <Link href={`/integrations/connect?app=${a.id}`}>
                                    <div className="flex items-center gap-3">
                                        <AppIcon appId={a.id} name={a.name} size={36} />
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-fg">
                                                {a.name}
                                                {a.status && <Badge tone="warning" size="sm">{statusLabel(a.status, t)}</Badge>}
                                            </p>
                                            <p className="truncate text-caption text-fg-subtle">{categoryLabel(a.category, t)} · {authHint(a, t)}</p>
                                        </div>
                                        {connectedApps.get(a.id) === "ready" && <Badge tone="success" dot size="sm">{t("connected")}</Badge>}
                                        {connectedApps.get(a.id) === "added" && <Badge tone="warning" dot size="sm">{t("notReady")}</Badge>}
                                    </div>
                                    <p className="truncate text-body-sm text-fg-muted" title={a.blurb}>{a.tagline}</p>
                                </Link>
                            </Card>
                        </li>
                    ))}
                </ul>
                {apps.length === 0 && (
                    <p className="mt-3 text-body-sm text-fg-subtle">{t("directory.noMatch")}</p>
                )}
            </section>

            <NativeIntegrationDrawer
                id={nativeOpen}
                onOpenChange={(open) => {
                    if (open) return;
                    setNativeOpen(null);
                    // Connects and disconnects made inside the card move the dots.
                    void loadNative();
                }}
            />
        </div>
    );
}
