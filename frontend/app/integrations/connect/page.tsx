"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowSquareOut, PuzzlePiece } from "@phosphor-icons/react";
import { Alert, Badge, Button, Card, Chip, Chips, CopyField, EmptyState, Field, InfoTip, Input, PageHeader, Section, Stepper, toast } from "@wixzel/react";
import { useSettings } from "@/components/settings-provider";
import { AppIcon } from "@/components/integrations/app-icon";
import { ToolRisk, api, apiMessage, type McpAuthBody, type McpServer, type McpToolDiscovery } from "@/components/integrations/mcp";
import { type CatalogApp, type InputField, appById, fillUrl, localizeApp, statusLabel } from "@/lib/app-catalog";

/**
 * Connect one app from the directory: `?app=<id>`.
 *
 * Creates an ordinary MCP server with the app's URL, auth and recommended
 * tools. An OAuth app goes straight on to the vendor's sign-in, which comes
 * back to the server's edit page; any other lands on the edit page with its
 * tools already read.
 *
 * The tool list on the right is read from the app's own server through
 * POST /mcp-servers/discover as soon as there is enough to connect with (the
 * URL, and the key for an API-key app), so what the owner sees is what the
 * server offers today. Every hosted OAuth server refuses to list anything
 * before a sign-in, so for those the page says so and shows the catalog's
 * examples, clearly labelled; the real list is read the moment the sign-in
 * comes back.
 */
export default function ConnectAppPage() {
    return (
        <Suspense fallback={null}>
            <Connect />
        </Suspense>
    );
}

function Connect() {
    const params = useSearchParams();
    const t = useTranslations("integrations");
    const id = params.get("app");
    const app = useMemo(() => {
        const found = appById(id);
        return found && localizeApp(found, t);
    }, [id, t]);

    if (!app) {
        return (
            <div className="flex flex-col gap-6">
                <BackLink />
                <Card>
                    <EmptyState
                        icon={<PuzzlePiece />}
                        title={t("connect.notInDirectoryTitle")}
                        description={t("connect.notInDirectory")}
                        actions={<Button asChild variant="primary"><Link href="/integrations">{t("connect.back")}</Link></Button>}
                    />
                </Card>
            </div>
        );
    }
    return <ConnectForm key={app.id} app={app} />;
}

function BackLink() {
    const t = useTranslations("integrations");
    return (
        <p>
            <Button asChild variant="ghost" size="sm">
                <Link href="/integrations"><ArrowLeft aria-hidden className="rtl:-scale-x-100" /> {t("connect.back")}</Link>
            </Button>
        </p>
    );
}

type Preview = { state: "idle" | "loading" | "done"; result: McpToolDiscovery | null };

function ConnectForm({ app }: { app: CatalogApp }) {
    const router = useRouter();
    const t = useTranslations("integrations");
    const { branding } = useSettings();
    const [values, setValues] = useState<Record<string, string>>({});
    const [region, setRegion] = useState(app.regions?.[0]?.url ?? app.url);
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [busy, setBusy] = useState(false);
    const [redirectUri, setRedirectUri] = useState<string | null>(null);

    const auth = app.auth;
    const oauthApp = auth.kind === "oauth" || auth.kind === "oauth-own-client";
    const url = fillUrl(app.regions ? region : app.url, values);
    // Everything the server needs before it will answer: the URL's fields, and the key for a header app.
    const complete = (app.urlFields ?? []).every((f) => (values[f.key] ?? "").trim())
        && !/\{[^}]+\}/.test(url)
        && (auth.kind !== "headers" || auth.fields.every((f) => (values[f.key] ?? "").trim()));

    const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

    // The redirect URL an "own client" app needs registered with the vendor.
    useEffect(() => {
        if (auth.kind !== "oauth-own-client") return;
        api<{ redirectUri: string }>("get", "/mcp-servers/oauth/redirect-uri")
            .then((d) => setRedirectUri(d.redirectUri), () => setRedirectUri(""));
    }, [auth.kind]);

    // The live read of the server's tools. Runs when the form is complete and
    // again whenever a field changes, after a pause; a stale answer is dropped.
    const [preview, setPreview] = useState<Preview>({ state: "idle", result: null });
    const attempt = useRef(0);
    const valuesKey = JSON.stringify(values);
    useEffect(() => {
        if (oauthApp || !complete) { setPreview({ state: "idle", result: null }); return; }
        const id = ++attempt.current;
        setPreview((p) => ({ state: "loading", result: p.result }));
        const timer = setTimeout(async () => {
            try {
                const result = await api<McpToolDiscovery>("post", "/mcp-servers/discover", { url, auth: authBody() });
                if (attempt.current === id) setPreview({ state: "done", result });
            } catch (err) {
                if (attempt.current !== id) return;
                const message = apiMessage(err) || t("connect.unreachable");
                setPreview({ state: "done", result: { status: "error", lastError: message, serverInfo: null, tools: [] } });
            }
        }, 500);
        return () => clearTimeout(timer);
        // authBody reads the same state this key covers.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, complete, oauthApp, valuesKey]);

    function authBody(): McpAuthBody {
        switch (auth.kind) {
            case "none":
                return { type: "none" };
            case "headers":
                return { type: "headers", headers: auth.headers(values) };
            case "oauth":
                return { type: "oauth", ...(auth.scope ? { oauth: { scope: auth.scope } } : {}) };
            case "oauth-own-client":
                return {
                    type: "oauth",
                    oauth: {
                        clientId: clientId.trim(),
                        ...(clientSecret ? { clientSecret } : {}),
                        ...(auth.scope ? { scope: auth.scope } : {}),
                    },
                };
        }
    }

    async function connect(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        let created: McpServer | null = null;
        try {
            const d = await api<{ server: McpServer }>("post", "/mcp-servers", {
                name: app.name,
                url,
                auth: authBody(),
                ...(app.recommendedTools ? { enabledTools: app.recommendedTools } : {}),
            });
            created = d.server;
            if (oauthApp) {
                const res = await api<{ authorizationUrl: string }>("post", `/mcp-servers/${created._id}/oauth/start`);
                // A full navigation: the vendor's sign-in, then back to the server's page.
                window.location.href = res.authorizationUrl;
                return;
            }
            router.push(`/integrations/edit?id=${created._id}`);
        } catch (err) {
            const message = apiMessage(err) || t("connect.connectFailed");
            if (created) {
                // The server exists; its page has Connect and Retry.
                router.push(`/integrations/edit?id=${created._id}&oauth=error&message=${encodeURIComponent(message)}`);
                return;
            }
            toast.error(message);
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <BackLink />
            <PageHeader
                title={
                    <span className="flex items-center gap-3">
                        <AppIcon appId={app.id} name={app.name} size={40} />
                        {app.name}
                        {app.status && <Badge tone="warning" size="sm">{statusLabel(app.status, t)}</Badge>}
                    </span>
                }
                description={app.blurb}
                actions={
                    <Button asChild variant="ghost" size="sm">
                        <a href={app.docsUrl} target="_blank" rel="noreferrer">{t("connect.docsLink", { app: app.name })} <ArrowSquareOut aria-hidden /></a>
                    </Button>
                }
            />

            <Stepper steps={[{ title: t("connect.stepConnect", { app: app.name }) }, { title: t("connect.stepChooseTools") }, { title: t("connect.stepAddToAgent") }]} current={0} />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <Card className="p-5">
                    <form onSubmit={connect} className="flex flex-col gap-5">
                        <h2 className="text-heading-sm">{t("connect.connectHeading", { app: app.name })}</h2>

                        {app.regions && (
                            <div>
                                <p className="mb-2 text-body-sm font-medium text-fg">{t("connect.server")}</p>
                                <Chips type="single" value={region} onValueChange={(v) => { if (v) setRegion(v); }} aria-label={t("connect.server")}>
                                    {app.regions.map((r) => <Chip key={r.key} value={r.url}>{r.label}</Chip>)}
                                </Chips>
                            </div>
                        )}

                        {app.urlFields?.map((f) => <InputRow key={f.key} field={f} value={values[f.key] ?? ""} onChange={set} />)}

                        {auth.kind === "oauth" && (
                            <p className="text-body-sm text-fg-muted">{t("connect.oauthLine", { app: app.name, appName: branding.appName })}</p>
                        )}

                        {auth.kind === "none" && !app.urlFields && (
                            <p className="text-body-sm text-fg-muted">{t("connect.noKeyNeeded")}</p>
                        )}

                        {auth.kind === "headers" && (
                            <>
                                <p className="text-body-sm text-fg-muted">{auth.help}</p>
                                {auth.fields.map((f) => <InputRow key={f.key} field={f} value={values[f.key] ?? ""} onChange={set} />)}
                                <p className="text-caption text-fg-subtle">{t("connect.keysEncrypted")}</p>
                            </>
                        )}

                        {auth.kind === "oauth-own-client" && (
                            <>
                                <p className="text-body-sm text-fg-muted">{t("connect.ownClientLine", { app: app.name })}</p>
                                <ol className="flex list-decimal flex-col gap-1.5 ps-5 text-body-sm text-fg">
                                    {auth.steps.map((s) => <li key={s}>{s}</li>)}
                                </ol>
                                <Field label={t("connect.redirectUrl")}>
                                    {redirectUri
                                        ? <CopyField value={redirectUri} className="ltr-data" />
                                        : <p className="text-body-sm text-fg-subtle">{t("connect.redirectUrlLoading")}</p>}
                                </Field>
                                {auth.scope && (
                                    <p className="text-caption text-fg-subtle">
                                        {t.rich("connect.scopesAskedFor", { scope: auth.scope, code: (c) => <span className="ltr-data font-mono">{c}</span> })}
                                    </p>
                                )}
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label={t("connect.clientId")} required>
                                        <Input name="client_id" required value={clientId} dir="ltr" autoComplete="off" onChange={(e) => setClientId(e.target.value)} />
                                    </Field>
                                    <Field label={t("connect.clientSecret")}>
                                        <Input name="client_secret" type="password" autoComplete="off" dir="ltr" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
                                    </Field>
                                </div>
                                <p>
                                    <Button asChild variant="link" size="xs">
                                        <a href={auth.consoleUrl} target="_blank" rel="noreferrer">{t("connect.setupGuide", { app: app.name })}</a>
                                    </Button>
                                </p>
                            </>
                        )}

                        {app.note && <Alert tone="info">{app.note}</Alert>}

                        <div>
                            <Button type="submit" variant="primary" loading={busy}>
                                {oauthApp ? t("connect.signInTo", { app: app.name }) : t("connect.connectApp", { app: app.name })}
                            </Button>
                        </div>
                    </form>
                </Card>

                <Section
                    className="self-start"
                    title={(
                        <span className="flex items-center gap-1">
                            {t("connect.whatAgentsCanDo")}
                            <InfoTip>
                                {app.recommendedTools ? t("connect.recommendedInfo") : t("connect.readOnlyInfo")}
                                {" "}{t("connect.confirmInfo")}
                            </InfoTip>
                        </span>
                    )}
                >
                    <ToolPreview app={app} oauthApp={oauthApp} complete={complete} preview={preview} />
                </Section>
            </div>
        </div>
    );
}

/**
 * The tool list: the server's own, read live, whenever it can be read. An
 * OAuth server cannot be read before a sign-in, so the catalog's examples
 * stand in, labelled as examples, until the sign-in comes back.
 */
function ToolPreview({ app, oauthApp, complete, preview }: { app: CatalogApp; oauthApp: boolean; complete: boolean; preview: Preview }) {
    const t = useTranslations("integrations");
    const result = preview.result;
    const live = result?.status === "ready" ? result.tools : null;

    if (live) {
        const count = t("connect.toolCount", { count: live.length });
        return (
            <>
                <p className="flex items-center justify-between text-caption text-fg-subtle">
                    <span>{t("connect.readFrom", { server: result?.serverInfo?.name || app.name })}</span>
                    <span>{preview.state === "loading" ? t("connect.readingAgain", { tools: count }) : count}</span>
                </p>
                <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-md bg-surface">
                    {live.map((x) => (
                        <li key={x.name} className="flex items-start justify-between gap-3 px-4 py-2.5">
                            <div className="min-w-0">
                                <p className="truncate text-body-sm text-fg">{x.title || x.name}</p>
                                {x.title && <p className="ltr-data truncate font-mono text-caption text-fg-subtle">{x.name}</p>}
                                {x.description && <p className="mt-0.5 line-clamp-2 text-caption text-fg-muted">{x.description}</p>}
                            </div>
                            <ToolRisk readOnly={x.readOnly} destructive={x.destructive} className="mt-0.5" />
                        </li>
                    ))}
                </ul>
            </>
        );
    }

    const examples = (
        <>
            {/* Examples, not the server's own list: on the muted fill, a step quieter than the live list's light face. */}
            <ul className="divide-y divide-border rounded-md bg-bg-muted">
                {app.tools.map((x) => (
                    <li key={x.name} className="flex items-start justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                            <p className="ltr-data font-mono text-body-sm text-fg-muted">{x.name}</p>
                            <p className="text-caption text-fg-subtle">{x.summary}</p>
                        </div>
                        <ToolRisk readOnly={!x.writes} className="mt-0.5" />
                    </li>
                ))}
            </ul>
            <p className="text-caption text-fg-subtle">
                {app.toolCount ? t("connect.examplesNoteCount", { app: app.name, count: app.toolCount }) : t("connect.examplesNote", { app: app.name })}
            </p>
        </>
    );

    if (oauthApp) {
        return (
            <>
                <p className="text-body-sm text-fg-muted">{t("connect.oauthToolsLine", { app: app.name })}</p>
                {examples}
            </>
        );
    }

    if (!complete) {
        return (
            <>
                <p className="text-body-sm text-fg-muted">{t("connect.fillFormLine", { app: app.name })}</p>
                {examples}
            </>
        );
    }

    if (preview.state === "loading" && !result) {
        return <p className="text-body-sm text-fg-muted">{t("connect.readingTools", { app: app.name })}</p>;
    }

    const message = result?.lastError || t("connect.readToolsFailed", { app: app.name });
    return (
        <>
            <ToolsUnread message={preview.state === "loading" ? t("connect.tryingAgain", { message }) : message} />
            {examples}
        </>
    );
}

function InputRow({ field, value, onChange }: { field: InputField; value: string; onChange: (key: string, value: string) => void }) {
    return (
        <Field label={field.label} hint={field.hint} required>
            <Input
                name={field.key}
                required
                value={value}
                placeholder={field.placeholder}
                type={field.secret ? "password" : "text"}
                dir="ltr"
                autoComplete="off"
                onChange={(e) => onChange(field.key, e.target.value)}
            />
        </Field>
    );
}

/** The tool list could not be read: said once as a toast, with the examples below standing in. */
function ToolsUnread({ message }: { message: string }) {
    const t = useTranslations("integrations");
    useEffect(() => { toast.error(message); }, [message]);
    return <p className="text-body-sm text-fg-muted">{t("connect.liveUnavailable")}</p>;
}
