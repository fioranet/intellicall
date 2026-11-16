"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Plus, Trash } from "@phosphor-icons/react";
import {
    Alert,
    Avatar,
    Button,
    Card,
    Checkbox,
    CopyField,
    Field,
    InfoTip,
    Input,
    Label,
    PageHeader,
    RadioCard,
    RadioCards,
    Section,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Skeleton,
    Stepper,
    toast,
    useConfirm,
} from "@wixzel/react";
import { useSettings } from "@/components/settings-provider";
import { AppIcon } from "@/components/integrations/app-icon";
import { StatusBadge, ToolRisk, api, apiMessage, type AgentRef, type McpAuthBody, type McpAuthType, type McpServer, type McpTransport } from "@/components/integrations/mcp";
import { appForUrl } from "@/lib/app-catalog";

/**
 * One MCP server: how to reach it, how to authenticate, and which of its tools
 * agents may call. `?id=` edits; no id creates a custom server.
 */
export default function McpServerPage() {
    return (
        <Suspense fallback={null}>
            <Editor />
        </Suspense>
    );
}

interface HeaderRow { name: string; value: string; saved: boolean }

const AUTH_OPTIONS: { value: McpAuthType; key: "authNone" | "authHeaders" | "authOauth"; hint: "authNoneHint" | "authHeadersHint" | "authOauthHint" }[] = [
    { value: "none", key: "authNone", hint: "authNoneHint" },
    { value: "headers", key: "authHeaders", hint: "authHeadersHint" },
    { value: "oauth", key: "authOauth", hint: "authOauthHint" },
];

function Editor() {
    const router = useRouter();
    const params = useSearchParams();
    const id = params.get("id");
    const t = useTranslations("integrations");
    const locale = useLocale();
    const confirm = useConfirm();
    const { branding } = useSettings();

    const [server, setServer] = useState<McpServer | null>(null);
    const [agents, setAgents] = useState<AgentRef[]>([]);
    const [loading, setLoading] = useState(Boolean(id));
    const [busy, setBusy] = useState<string | null>(null);
    const [redirectUri, setRedirectUri] = useState<string | null>(null);

    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [transport, setTransport] = useState<McpTransport>("auto");
    const [authType, setAuthType] = useState<McpAuthType>("none");
    const [headers, setHeaders] = useState<HeaderRow[]>([{ name: "Authorization", value: "", saved: false }]);
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [scope, setScope] = useState("");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [enabled, setEnabled] = useState<Set<string>>(new Set());

    const adopt = useCallback((s: McpServer) => {
        setServer(s);
        setName(s.name);
        setUrl(s.url);
        setTransport(s.transport);
        setAuthType(s.auth.type);
        setHeaders(s.auth.headerNames?.length
            ? s.auth.headerNames.map((n) => ({ name: n, value: "", saved: true }))
            : [{ name: "Authorization", value: "", saved: false }]);
        setClientId(s.auth.oauth?.clientId ?? "");
        setScope(s.auth.oauth?.scope ?? "");
        setClientSecret("");
        setEnabled(new Set(s.tools.filter((x) => x.enabled).map((x) => x.name)));
    }, []);

    const load = useCallback(async () => {
        if (!id) return;
        try {
            const [s, a] = await Promise.all([
                api<{ server: McpServer }>("get", `/mcp-servers/${encodeURIComponent(id)}`),
                api<{ agents: AgentRef[] }>("get", "/agents").catch(() => ({ agents: [] as AgentRef[] })),
            ]);
            adopt(s.server);
            setAgents(a.agents ?? []);
        } catch (err) {
            toast.error(apiMessage(err) || t("server.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [id, adopt, t]);

    useEffect(() => { void load(); }, [load]);

    // The redirect URL a server that needs the owner's own OAuth client must know.
    useEffect(() => {
        if (authType !== "oauth" || !showAdvanced || redirectUri !== null) return;
        api<{ redirectUri: string }>("get", "/mcp-servers/oauth/redirect-uri")
            .then((d) => setRedirectUri(d.redirectUri), () => setRedirectUri(""));
    }, [authType, showAdvanced, redirectUri]);

    // Back from an OAuth sign-in.
    useEffect(() => {
        const outcome = params.get("oauth");
        if (outcome === "connected") toast.success(t("server.oauthConnected"));
        if (outcome === "error") toast.error(params.get("message") || t("server.signInIncomplete"));
        // Once, on arrival.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const usedBy = useMemo(() => agents.filter((a) => server && (a.mcpServerIds ?? []).includes(server._id)), [agents, server]);

    function authBody(): McpAuthBody {
        if (authType === "headers") {
            return {
                type: "headers",
                headers: headers
                    .filter((h) => h.name.trim())
                    // A saved header left blank keeps its stored value.
                    .map((h) => (h.value ? { name: h.name.trim(), value: h.value } : { name: h.name.trim() })),
            };
        }
        if (authType === "oauth") {
            const oauth = {
                ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
                ...(clientSecret ? { clientSecret } : {}),
                ...(scope.trim() ? { scope: scope.trim() } : {}),
            };
            return { type: "oauth", ...(Object.keys(oauth).length ? { oauth } : {}) };
        }
        return { type: "none" };
    }

    async function save(e: FormEvent) {
        e.preventDefault();
        setBusy("save");
        try {
            const body = { name, url, transport, auth: authBody() };
            if (server) {
                const d = await api<{ server: McpServer }>("patch", `/mcp-servers/${server._id}`, body);
                adopt(d.server);
                toast.success(t("server.saved"));
            } else {
                const d = await api<{ server: McpServer }>("post", "/mcp-servers", body);
                adopt(d.server);
                router.replace(`/integrations/edit?id=${d.server._id}`);
                toast.success(d.server.status === "needs_auth" ? t("server.savedConnectNext", { appName: branding.appName }) : t("server.saved"));
            }
        } catch (err) {
            toast.error(apiMessage(err) || t("server.saveFailed"));
        } finally {
            setBusy(null);
        }
    }

    async function refresh() {
        if (!server) return;
        setBusy("refresh");
        try {
            const d = await api<{ server: McpServer }>("post", `/mcp-servers/${server._id}/refresh`);
            adopt(d.server);
            if (d.server.status === "ready") toast.success(t("server.readTools", { count: d.server.tools.length }));
            else if (d.server.lastError) toast.error(d.server.lastError);
        } catch (err) {
            toast.error(apiMessage(err) || t("server.refreshFailed"));
        } finally {
            setBusy(null);
        }
    }

    async function connect() {
        if (!server) return;
        setBusy("connect");
        try {
            const res = await api<{ authorizationUrl: string }>("post", `/mcp-servers/${server._id}/oauth/start`);
            // A full navigation: the provider's sign-in page, then back to this page.
            window.location.href = res.authorizationUrl;
        } catch (err) {
            toast.error(apiMessage(err) || t("server.signInStartFailed"));
            setBusy(null);
        }
    }

    async function saveTools() {
        if (!server) return;
        setBusy("tools");
        try {
            const d = await api<{ server: McpServer }>("patch", `/mcp-servers/${server._id}`, { enabledTools: [...enabled] });
            adopt(d.server);
            toast.success(t("server.toolAccessSaved"));
        } catch (err) {
            toast.error(apiMessage(err) || t("server.toolAccessFailed"));
        } finally {
            setBusy(null);
        }
    }

    async function remove() {
        if (!server) return;
        const ok = await confirm({
            title: t("server.deleteTitle", { name: server.name }),
            description: usedBy.length ? t("server.deleteDescriptionUsed", { count: usedBy.length }) : t("server.deleteDescription"),
            confirmLabel: t("server.deleteConfirmLabel"),
            tone: "danger",
        });
        if (!ok) return;
        setBusy("delete");
        try {
            await api("delete", `/mcp-servers/${server._id}`);
            toast.success(t("server.deleted", { name: server.name }));
            router.push("/integrations");
        } catch (err) {
            toast.error(apiMessage(err) || t("server.deleteFailed"));
            setBusy(null);
        }
    }

    const toolsDirty = server ? !sameSet(enabled, new Set(server.tools.filter((x) => x.enabled).map((x) => x.name))) : false;
    const app = server ? appForUrl(server.url) : null;

    if (loading) {
        return (
            <div className="flex flex-col gap-6">
                <Skeleton className="h-12 w-72" />
                <Skeleton className="h-64 w-full rounded-lg" />
            </div>
        );
    }
    const readOnlyCount = server ? server.tools.filter((x) => x.readOnly).length : 0;
    const step = !server ? 0 : server.status !== "ready" ? 0 : usedBy.length === 0 ? (server.tools.some((x) => x.enabled) ? 2 : 1) : 3;

    return (
        <div className="flex flex-col gap-6">
            <p>
                <Button asChild variant="ghost" size="sm">
                    <Link href="/integrations"><ArrowLeft aria-hidden className="rtl:-scale-x-100" /> {t("server.back")}</Link>
                </Button>
            </p>
            <PageHeader
                title={server
                    ? <span className="flex items-center gap-3"><AppIcon appId={app?.id} url={server.url} name={server.name} size={36} />{server.name}</span>
                    : t("server.newTitle")}
                description={server
                    ? (
                        <>
                            {t("server.description")}
                            {app && <> <Button asChild variant="link" size="xs"><a href={app.docsUrl} target="_blank" rel="noreferrer">{t("server.docsLink", { app: app.name })}</a></Button></>}
                        </>
                    )
                    : t("server.newDescription")}
                info={server ? undefined : t("server.newInfo")}
                actions={server ? <StatusBadge status={server.status} className="mt-1" /> : undefined}
            />
            <Stepper steps={[{ title: t("server.stepConnect") }, { title: t("server.stepChooseTools") }, { title: t("server.stepAddToAgent") }]} current={step} />

            {server && server.status !== "ready" && (
                <Section
                    title={server.status === "needs_auth" ? t("server.signInToConnect") : t("server.notConnected")}
                    description={server.lastError || (server.status === "needs_auth" ? t("server.needsAuthLine", { appName: branding.appName }) : t("server.notReachedLine"))}
                >
                    <div className="flex flex-wrap gap-3">
                        {server.auth.type === "oauth" && (
                            <Button variant="primary" onClick={() => void connect()} loading={busy === "connect"}>{t("server.connect")}</Button>
                        )}
                        <Button variant="secondary" onClick={() => void refresh()} loading={busy === "refresh"}>{t("server.retry")}</Button>
                    </div>
                    <p className="text-caption text-fg-subtle">{t("server.readyOnly")}</p>
                </Section>
            )}

            <Card className="p-5">
                <form onSubmit={save} className="flex flex-col gap-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                        <Field label={t("server.name")} hint={t("server.nameHint")} required>
                            <Input name="name" required value={name} placeholder="HubSpot" onChange={(e) => setName(e.target.value)} />
                        </Field>
                        <Field label={t("server.url")} hint={t("server.urlHint")} required>
                            <Input name="url" type="url" required value={url} dir="ltr" placeholder="https://mcp.example.com/mcp" onChange={(e) => setUrl(e.target.value)} />
                        </Field>
                    </div>

                    <div>
                        <p id="mcp-auth-label" className="mb-2 text-body-sm font-medium text-fg">{t("server.authentication")}</p>
                        <RadioCards aria-labelledby="mcp-auth-label" columns={3} value={authType} onValueChange={(v) => setAuthType(v as McpAuthType)}>
                            {AUTH_OPTIONS.map((o) => (
                                <RadioCard key={o.value} value={o.value} title={t(`server.${o.key}`)} description={t(`server.${o.hint}`)} />
                            ))}
                        </RadioCards>
                    </div>

                    {authType === "headers" && (
                        <div className="flex flex-col gap-3">
                            {headers.map((h, i) => (
                                <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
                                    <Field label={t("server.header")}>
                                        <Input name={`header-name-${i}`} value={h.name} placeholder="Authorization" dir="ltr"
                                            onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                                    </Field>
                                    <Field label={t("server.value")}>
                                        <Input name={`header-value-${i}`} type="password" autoComplete="off" value={h.value} dir="ltr"
                                            placeholder={h.saved ? t("server.savedKeepBlank") : "Bearer sk_live_…"}
                                            onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                                    </Field>
                                    <Button type="button" variant="ghost" size="icon" aria-label={t("server.removeHeader")}
                                        onClick={() => setHeaders(headers.filter((_, j) => j !== i))}>
                                        <Trash />
                                    </Button>
                                </div>
                            ))}
                            <div>
                                <Button type="button" variant="secondary" size="sm" iconStart={<Plus />}
                                    onClick={() => setHeaders([...headers, { name: "", value: "", saved: false }])}>
                                    {t("server.addHeader")}
                                </Button>
                            </div>
                            <p className="text-caption text-fg-subtle">{t("server.encrypted")}</p>
                        </div>
                    )}

                    {authType === "oauth" && (
                        <div className="flex flex-col gap-3">
                            <p className="text-body-sm text-fg-muted">{t("server.oauthHelp", { appName: branding.appName })}</p>
                            <div>
                                <Button type="button" variant="link" size="xs" aria-expanded={showAdvanced} onClick={() => setShowAdvanced(!showAdvanced)}>
                                    {showAdvanced ? t("server.hideAdvanced") : t("server.showAdvanced")}
                                </Button>
                            </div>
                            {showAdvanced && (
                                <div className="flex flex-col gap-4">
                                    <div className="grid gap-4 sm:grid-cols-3">
                                        <Field label={t("server.clientId")}>
                                            <Input name="client_id" value={clientId} dir="ltr" autoComplete="off" onChange={(e) => setClientId(e.target.value)} />
                                        </Field>
                                        <Field label={t("server.clientSecret")}>
                                            <Input name="client_secret" type="password" autoComplete="off" value={clientSecret} dir="ltr"
                                                placeholder={server?.auth.oauth?.clientId ? t("server.savedKeepBlank") : ""}
                                                onChange={(e) => setClientSecret(e.target.value)} />
                                        </Field>
                                        <Field label={t("server.scopes")}>
                                            <Input name="scope" value={scope} placeholder={t("server.scopesPlaceholder")} dir="ltr" onChange={(e) => setScope(e.target.value)} />
                                        </Field>
                                    </div>
                                    {redirectUri && (
                                        <Field label={t("server.redirectUrl")}>
                                            <CopyField value={redirectUri} className="ltr-data" />
                                        </Field>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <Field label={t("server.transport")} hint={t("server.transportHint")} className="sm:max-w-xs">
                        <Select value={transport} onValueChange={(v) => setTransport(v as McpTransport)}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">{t("server.transportAuto")}</SelectItem>
                                <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                                <SelectItem value="sse">SSE</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>

                    <div className="flex flex-wrap gap-3">
                        <Button type="submit" variant="primary" loading={busy === "save"}>{server ? t("server.save") : t("server.saveAndConnect")}</Button>
                        {server?.auth.type === "oauth" && server.status === "ready" && (
                            <Button type="button" variant="secondary" onClick={() => void connect()} loading={busy === "connect"}>{t("server.reconnect")}</Button>
                        )}
                    </div>
                </form>
            </Card>

            {server && (
                <Section
                    title={<span className="flex items-center gap-1">{t("server.tools")}<InfoTip>{t("server.toolsInfo")}</InfoTip></span>}
                    description={t.rich("server.switchedOn", { enabled: enabled.size, total: server.tools.length, n: (c) => <span className="font-medium tabular-nums text-fg">{c}</span> })}
                    actions={(
                        <Button variant="secondary" size="sm" onClick={() => void refresh()} loading={busy === "refresh"}>
                            {t("server.refreshTools")}
                        </Button>
                    )}
                >
                    <div className="-mt-2">
                        <p className="flex flex-wrap items-center gap-1.5">
                            <ToolRisk readOnly />{" "}<span className="text-caption tabular-nums text-fg-muted">{readOnlyCount}</span>
                            <ToolRisk readOnly={false} />{" "}<span className="text-caption tabular-nums text-fg-muted">{server.tools.length - readOnlyCount}</span>
                        </p>
                        <p className="mt-1 text-caption text-fg-subtle">
                            {server.serverInfo?.name ? `${server.serverInfo.name}${server.serverInfo.version ? ` ${server.serverInfo.version}` : ""} · ` : ""}
                            {t("server.readAt", { when: server.toolsRefreshedAt ? new Date(server.toolsRefreshedAt).toLocaleString(locale) : "—" })}
                        </p>
                    </div>

                    {server.tools.length === 0 ? (
                        <p className="text-body-sm text-fg-subtle">{t("server.noTools")}</p>
                    ) : (
                        <>
                            {!server.tools.some((x) => x.readOnly) && server.tools.every((x) => !x.enabled) && (
                                <Alert tone="info">{t("server.noReadOnly")}</Alert>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="link" size="xs"
                                    onClick={() => setEnabled(new Set(server.tools.filter((x) => x.readOnly).map((x) => x.name)))}>
                                    {t("server.readOnlyOnly")}
                                </Button>
                                <span className="text-caption text-fg-subtle">·</span>
                                <Button variant="link" size="xs" onClick={() => setEnabled(new Set(server.tools.map((x) => x.name)))}>{t("server.all")}</Button>
                                <span className="text-caption text-fg-subtle">·</span>
                                <Button variant="link" size="xs" onClick={() => setEnabled(new Set())}>{t("server.none")}</Button>
                            </div>
                            {/* Tools as rows on one light face, split by hairlines. */}
                            <ul className="divide-y divide-border rounded-md bg-surface">
                                {server.tools.map((tool) => {
                                    const inputId = `mcp-tool-${tool.name}`;
                                    return (
                                        <li key={tool.name} className="flex items-start gap-3 px-4 py-3">
                                            <Checkbox
                                                id={inputId}
                                                checked={enabled.has(tool.name)}
                                                onCheckedChange={(on) => {
                                                    const next = new Set(enabled);
                                                    if (on === true) next.add(tool.name); else next.delete(tool.name);
                                                    setEnabled(next);
                                                }}
                                                className="mt-0.5"
                                            />
                                            <Label htmlFor={inputId} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 font-normal">
                                                <span className="flex flex-wrap items-center gap-2">
                                                    <span className="font-medium">{tool.title || tool.name}</span>
                                                    {tool.title && <span className="ltr-data font-mono text-caption text-fg-subtle">{tool.name}</span>}
                                                    {/* Unmarked tools are treated as writing, as the MCP spec says to. */}
                                                    <ToolRisk readOnly={tool.readOnly} destructive={tool.destructive} />
                                                </span>
                                                {tool.description && <span className="line-clamp-2 text-caption text-fg-muted">{tool.description}</span>}
                                            </Label>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="flex items-center gap-3">
                                <Button variant="primary" onClick={() => void saveTools()} loading={busy === "tools"} disabled={!toolsDirty}>{t("server.saveToolAccess")}</Button>
                                <span className="text-caption text-fg-subtle">{t("server.onCount", { enabled: enabled.size, total: server.tools.length })}</span>
                            </div>
                        </>
                    )}
                </Section>
            )}

            {server && (
                <Section title={t("server.agentsUsing")} description={usedBy.length === 0 ? t("server.agentsUsingNone") : undefined}>
                    {usedBy.length > 0 && (
                        <ul className="flex flex-wrap gap-2">
                            {usedBy.map((a) => (
                                <li key={a._id}>
                                    <Button asChild variant="secondary" size="sm" className="ps-1">
                                        <Link href="/agents"><Avatar name={a.name} size="xs" shape="square" />{a.name}</Link>
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>
            )}

            {server && (
                <div>
                    <Button variant="danger" onClick={() => void remove()} loading={busy === "delete"} iconStart={<Trash />}>{t("server.deleteServer")}</Button>
                </div>
            )}
        </div>
    );
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}
