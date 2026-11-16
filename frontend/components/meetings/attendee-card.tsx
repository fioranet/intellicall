"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import axios from "axios";
import { PlugsConnected } from "@phosphor-icons/react";
import {
    Badge,
    Button,
    Card,
    Field,
    Input,
    Label,
    Switch,
    Tabs,
    TabsList,
    TabsTrigger,
    TextLink,
    toast,
    useConfirm,
} from "@wixzel/react";
import { useSettings } from "@/components/settings-provider";
import { API_BASE_URL, apiError, authHeaders, sameBaseUrl, type MeetingIntegration } from "./types";

type Where = "hosted" | "self";

interface AttendeeCardProps {
    /** The connected account, or null when none is. */
    integration: MeetingIntegration | null;
    /** Attendee's own hosted address, from the server. */
    hostedUrl: string;
    onSaved: (integration: MeetingIntegration) => void;
    onDisconnected: () => void;
}

/**
 * The owner's Attendee account: where it runs, its API key, the optional
 * webhook secret and the signed-in bot accounts. Bring your own, as a SIP
 * trunk is bring your own carrier: Attendee's Elastic License keeps the app
 * from running it for anyone.
 */
export function AttendeeCard({ integration, hostedUrl, onSaved, onDisconnected }: AttendeeCardProps) {
    const t = useTranslations("meetings");
    const { branding } = useSettings();
    const confirm = useConfirm();

    const [where, setWhere] = useState<Where>("hosted");
    const [baseUrl, setBaseUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [webhookSecret, setWebhookSecret] = useState("");
    const [clearSecret, setClearSecret] = useState(false);
    const [signInMeet, setSignInMeet] = useState(false);
    const [signInTeams, setSignInTeams] = useState(false);
    const [loginGroup, setLoginGroup] = useState("");
    const [busy, setBusy] = useState<"save" | "disconnect" | null>(null);

    // The form shows the saved account; a fresh one after a disconnect.
    useEffect(() => {
        if (integration) {
            setWhere(integration.hosted ? "hosted" : "self");
            setBaseUrl(integration.hosted ? "" : integration.baseUrl);
            setSignInMeet(integration.signedInBots.googleMeet);
            setSignInTeams(integration.signedInBots.teams);
            setLoginGroup(integration.signedInBots.loginGroup ?? "");
        } else {
            setWhere("hosted");
            setBaseUrl("");
            setSignInMeet(false);
            setSignInTeams(false);
            setLoginGroup("");
        }
        setApiKey("");
        setWebhookSecret("");
        setClearSecret(false);
    }, [integration]);

    const targetUrl = where === "hosted" ? hostedUrl : baseUrl;
    // The stored key stays only for the Attendee it was saved for.
    const keyKept = Boolean(integration) && sameBaseUrl(targetUrl, integration?.baseUrl ?? "");
    const keyRequired = !keyKept;

    const failMessage = (err: unknown, fallback: string) => {
        const { code, message, missing } = apiError(err);
        if (code && t.has(`errors.${code}`)) return t(`errors.${code}`, { missing: (missing ?? []).join(", ") });
        return message || fallback;
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy("save");
        try {
            const body: Record<string, unknown> = {
                baseUrl: targetUrl.trim(),
                signedInBots: { googleMeet: signInMeet, teams: signInTeams, loginGroup: loginGroup.trim() || null },
            };
            if (apiKey.trim()) body.apiKey = apiKey.trim();
            // null clears the saved secret, a value replaces it, and nothing sent leaves it alone.
            if (clearSecret) body.webhookSecret = null;
            else if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim();
            const res = await axios.post(`${API_BASE_URL}/meetings/integration`, body, { headers: authHeaders() });
            const saved = res.data?.data?.integration as MeetingIntegration;
            toast.success(integration ? t("attendee.toast.saved") : t("attendee.toast.connected"));
            onSaved(saved);
        } catch (err) {
            toast.error(failMessage(err, t("attendee.toast.connectFailed")));
        } finally {
            setBusy(null);
        }
    };

    const disconnect = async () => {
        const ok = await confirm({
            title: t("attendee.disconnectTitle"),
            description: t("attendee.disconnectDescription"),
            confirmLabel: t("attendee.disconnectConfirm"),
            tone: "danger",
        });
        if (!ok) return;
        setBusy("disconnect");
        try {
            await axios.delete(`${API_BASE_URL}/meetings/integration`, { headers: authHeaders() });
            toast.success(t("attendee.toast.disconnected"));
            onDisconnected();
        } catch (err) {
            toast.error(failMessage(err, t("attendee.toast.disconnectFailed")));
        } finally {
            setBusy(null);
        }
    };

    const mono = (chunks: React.ReactNode) => <span className="ltr-data font-mono">{chunks}</span>;

    return (
        <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                    <PlugsConnected className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-heading-sm text-fg">{t("attendee.heading")}</h2>
                    <p className="mt-1 text-body-sm text-fg-muted">
                        {integration
                            ? t.rich("attendee.connectedLine", { url: integration.baseUrl, last4: integration.apiKeyLast4, mono })
                            : t.rich("attendee.signUpLine", {
                                link: (chunks) => (
                                    <TextLink href="https://app.attendee.dev" target="_blank" rel="noreferrer" className="ltr-data">
                                        {chunks}
                                    </TextLink>
                                ),
                            })}
                    </p>
                    {/* Why this is bring-your-own: Attendee's licence, not a choice of ours. */}
                    <p className="mt-1 text-caption text-fg-subtle">{t("attendee.byoLine", { appName: branding.appName })}</p>
                    {integration?.lastError && (
                        <p className="mt-2 text-caption text-danger-ink">{t("attendee.lastError", { error: integration.lastError })}</p>
                    )}
                </div>
                {integration ? (
                    integration.status === "connected"
                        ? <Badge tone="success" dot>{t("attendee.connected")}</Badge>
                        : <Badge tone="danger" dot>{t("attendee.error")}</Badge>
                ) : (
                    <Badge tone="neutral" dot>{t("attendee.notConnected")}</Badge>
                )}
            </div>

            <form onSubmit={save} className="mt-6 flex flex-col gap-5">
                <div>
                    <p className="mb-2 text-body-sm font-medium text-fg">{t("attendee.where")}</p>
                    <Tabs variant="segment" value={where} onValueChange={(v) => setWhere(v as Where)}>
                        <TabsList aria-label={t("attendee.where")}>
                            <TabsTrigger value="hosted">{t("attendee.whereHosted")}</TabsTrigger>
                            <TabsTrigger value="self">{t("attendee.whereSelf")}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <p className="mt-2 text-caption text-fg-subtle">
                        {where === "hosted" ? t.rich("attendee.hostedLine", { url: hostedUrl, mono }) : t("attendee.selfLine")}
                    </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                    {where === "self" && (
                        <Field label={t("attendee.baseUrl")} hint={t("attendee.baseUrlHint")} required>
                            <Input
                                type="url"
                                dir="ltr"
                                className="ltr-data"
                                value={baseUrl}
                                placeholder="https://attendee.example.com"
                                required
                                disabled={busy !== null}
                                onChange={(e) => setBaseUrl(e.target.value)}
                            />
                        </Field>
                    )}
                    <Field
                        label={t("attendee.apiKey")}
                        hint={keyKept ? t("attendee.apiKeyHint") : integration ? t("attendee.apiKeyNewUrlHint") : t("attendee.apiKeyHint")}
                        required={keyRequired}
                    >
                        <Input
                            type="password"
                            dir="ltr"
                            className="ltr-data"
                            autoComplete="off"
                            value={apiKey}
                            placeholder={keyKept && integration ? t("attendee.keyEnding", { last4: integration.apiKeyLast4 }) : ""}
                            required={keyRequired}
                            disabled={busy !== null}
                            onChange={(e) => setApiKey(e.target.value)}
                        />
                    </Field>
                </div>

                <Field
                    label={t("attendee.webhookSecret")}
                    labelAside={t("attendee.optional")}
                    hint={clearSecret ? t("attendee.webhookSecretClearing") : t("attendee.webhookSecretHint")}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            type="password"
                            dir="ltr"
                            className="ltr-data min-w-0 flex-1"
                            autoComplete="off"
                            value={webhookSecret}
                            placeholder={integration?.webhookSecretSet && !clearSecret ? t("attendee.webhookSecretSaved") : t("attendee.webhookSecretPlaceholder")}
                            disabled={busy !== null || clearSecret}
                            onChange={(e) => setWebhookSecret(e.target.value)}
                        />
                        {integration?.webhookSecretSet && (
                            clearSecret
                                ? <Button type="button" size="sm" onClick={() => setClearSecret(false)}>{t("attendee.undo")}</Button>
                                : <Badge tone="success" dot>{t("attendee.webhookSecretSet")}</Badge>
                        )}
                        {integration?.webhookSecretSet && !clearSecret && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => { setClearSecret(true); setWebhookSecret(""); }}>
                                {t("attendee.webhookSecretClear")}
                            </Button>
                        )}
                    </div>
                </Field>

                <div className="flex flex-col gap-3">
                    <div>
                        <p className="text-body-sm font-medium text-fg">{t("attendee.signedInBots")}</p>
                        <p className="mt-1 text-caption text-fg-subtle">{t("attendee.signedInBotsLine")}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md bg-surface p-3">
                        <div className="min-w-0">
                            <Label htmlFor="signed-in-meet">{t("platform.google_meet")}</Label>
                            <p className="text-caption text-fg-subtle">{t("attendee.meetHint")}</p>
                        </div>
                        <Switch id="signed-in-meet" checked={signInMeet} onCheckedChange={setSignInMeet} disabled={busy !== null} />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md bg-surface p-3">
                        <div className="min-w-0">
                            <Label htmlFor="signed-in-teams">{t("platform.teams")}</Label>
                            <p className="text-caption text-fg-subtle">{t("attendee.teamsHint")}</p>
                        </div>
                        <Switch id="signed-in-teams" checked={signInTeams} onCheckedChange={setSignInTeams} disabled={busy !== null} />
                    </div>
                    {(signInMeet || signInTeams) && (
                        <Field label={t("attendee.loginGroup")} labelAside={t("attendee.optional")} hint={t("attendee.loginGroupHint")} className="sm:max-w-sm">
                            <Input
                                value={loginGroup}
                                placeholder={t("attendee.loginGroupPlaceholder")}
                                disabled={busy !== null}
                                onChange={(e) => setLoginGroup(e.target.value)}
                            />
                        </Field>
                    )}
                </div>

                <p className="text-caption text-fg-subtle">{t("attendee.zoomNote")}</p>

                <div className="flex flex-wrap gap-3">
                    <Button type="submit" variant="primary" loading={busy === "save"} disabled={busy === "disconnect"}>
                        {integration ? t("attendee.save") : t("attendee.connect")}
                    </Button>
                    {integration && (
                        <Button type="button" onClick={() => void disconnect()} loading={busy === "disconnect"} disabled={busy === "save"}>
                            {t("attendee.disconnect")}
                        </Button>
                    )}
                </div>
            </form>
        </Card>
    );
}
