"use client";

import { useTranslations } from "next-intl";
import { useSettings } from "@/components/settings-provider";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
    Alert,
    Badge,
    Button,
    CopyField,
    DescriptionList,
    Section,
    toast,
    useConfirm,
} from "@wixzel/react";
import { BookOpen, Copy, Key as KeyRound, ArrowsClockwise, Trash } from "@phosphor-icons/react";
import { SectionLoading } from "@/components/settings/setting-row";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

type EndpointParam = { name: string; type: string; required?: boolean; description: string };

type Endpoint = {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    summary: string;
    description: string;
    body?: EndpointParam[];
    example?: object;
};

const ENDPOINTS: Endpoint[] = [
    {
        method: "POST",
        path: "/calls/dial",
        summary: "Call a number with an AI agent now",
        description: "Places an outbound AI call immediately — no campaign needed. If no lead exists with this phone number, one is created automatically (tagged 'api'). Counts toward your monthly call limit.",
        body: [
            { name: "to", type: "string", required: true, description: "Destination phone number, e.g. +15551234567" },
            { name: "agentId", type: "string", required: true, description: "Agent to run the call (see GET /agents)" },
            { name: "name", type: "string", description: "Lead name when a new lead is created" },
            { name: "fromNumberId", type: "string", description: "Override the agent's outbound phone number" },
            { name: "tags", type: "string[]", description: "Extra tags for a newly created lead" }
        ],
        example: { to: "+15551234567", agentId: "AGENT_ID", name: "Jane Doe", tags: ["website"] }
    },
    {
        method: "GET",
        path: "/agents",
        summary: "List your AI agents",
        description: "Returns all agents with their IDs — use these as agentId in other calls."
    },
    {
        method: "GET",
        path: "/leads",
        summary: "List leads",
        description: "Returns all your leads, newest first."
    },
    {
        method: "POST",
        path: "/leads",
        summary: "Create a lead",
        description: "Adds a lead to your workspace. Fires the leadCreated event to your webhooks / n8n / Slack / WhatsApp.",
        body: [
            { name: "name", type: "string", required: true, description: "Lead name" },
            { name: "phone", type: "string", required: true, description: "Phone number with country code" },
            { name: "tags", type: "string[]", description: "Tags for segmenting and campaign targeting" },
            { name: "fields", type: "{name, value}[]", description: "Custom fields, e.g. company or email" }
        ],
        example: { name: "Jane Doe", phone: "+15551234567", tags: ["api"], fields: [{ name: "company", value: "Acme Inc" }] }
    },
    {
        method: "POST",
        path: "/campaigns",
        summary: "Create a campaign",
        description: "Creates a calling campaign from a list of lead IDs. Pass scheduledAt (ISO date) to schedule it, or start it manually with POST /campaigns/start.",
        body: [
            { name: "name", type: "string", required: true, description: "Campaign name" },
            { name: "agentId", type: "string", required: true, description: "Agent that makes the calls" },
            { name: "leadIds", type: "string[]", required: true, description: "Leads to dial" },
            { name: "scheduledAt", type: "ISO date", description: "Optional start time — omit to start manually" }
        ],
        example: { name: "Friday follow-ups", agentId: "AGENT_ID", leadIds: ["LEAD_ID_1", "LEAD_ID_2"] }
    },
    {
        method: "POST",
        path: "/campaigns/start",
        summary: "Start a campaign",
        description: "Begins dialing all leads in the campaign. Counts toward your monthly call limit.",
        body: [
            { name: "id", type: "string", required: true, description: "Campaign ID" }
        ],
        example: { id: "CAMPAIGN_ID" }
    },
    {
        method: "GET",
        path: "/campaigns/:id",
        summary: "Get campaign status & stats",
        description: "Returns the campaign with its status (idle, scheduled, running, completed, stopped) and call stats."
    },
    {
        method: "GET",
        path: "/appointments",
        summary: "List appointments",
        description: "Returns all appointments with client, time, duration, and status."
    },
    {
        method: "POST",
        path: "/appointments",
        summary: "Book an appointment",
        description: "Books an appointment for a lead. Fires appointmentBooked, syncs to Google Calendar, and schedules the WhatsApp client reminder when those integrations are on.",
        body: [
            { name: "agentId", type: "string", required: true, description: "Agent the appointment belongs to" },
            { name: "leadId", type: "string", required: true, description: "Lead being booked" },
            { name: "clientPhone", type: "string", required: true, description: "Client's phone number" },
            { name: "dateTime", type: "ISO date", required: true, description: "Appointment start time" },
            { name: "duration", type: "number", description: "Minutes, default 30" },
            { name: "notes", type: "string", description: "Free-form notes" }
        ],
        example: { agentId: "AGENT_ID", leadId: "LEAD_ID", clientPhone: "+15551234567", dateTime: "2026-07-01T15:00:00Z", duration: 30 }
    },
    {
        method: "GET",
        path: "/call-logs",
        summary: "List calls",
        description: "Returns all call logs with lead and agent info — duration, status, direction."
    },
    {
        method: "GET",
        path: "/call-logs/:id",
        summary: "Get call details",
        description: "Returns one call including transcript, AI summary, and qualification score when analysis has run."
    },
    {
        method: "POST",
        path: "/call-logs/:id/analyze",
        summary: "Run AI analysis on a call",
        description: "Generates the AI summary and lead qualification for a completed call using your OpenRouter key."
    }
];

const METHOD_TONES: Record<Endpoint["method"], "success" | "accent" | "warning" | "danger"> = {
    GET: "success",
    POST: "accent",
    PATCH: "warning",
    DELETE: "danger"
};

type KeyStatus = {
    hasKey: boolean;
    prefix: string;
    createdAt: string | null;
    lastUsedAt: string | null;
};

export function ApiAccessCard() {
    const t = useTranslations("settings");
    const { branding } = useSettings();
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [status, setStatus] = useState<KeyStatus>({ hasKey: false, prefix: "", createdAt: null, lastUsedAt: null });
    // Full key is only ever held in memory right after generation
    const [freshKey, setFreshKey] = useState<string | null>(null);
    const [docsOpen, setDocsOpen] = useState(false);
    const [openEndpoint, setOpenEndpoint] = useState<string | null>(null);
    const confirm = useConfirm();

    const fetchStatus = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            const resp = await axios.get(`${API_BASE_URL}/users/api-key`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.data?.status === "success") {
                setStatus(resp.data.data);
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

    const handleGenerate = async (regenerate: boolean) => {
        if (regenerate && !(await confirm({
            title: "Regenerate the API key?",
            description: "The current key stops working immediately and any workflow using it must be updated.",
            confirmLabel: t("apiAccess.regenerate"),
            tone: "danger",
        }))) return;
        setWorking(true);
        try {
            const token = localStorage.getItem("token");
            const resp = await axios.post(`${API_BASE_URL}/users/api-key`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.data?.status === "success") {
                setFreshKey(resp.data.data.apiKey);
                toast.success(regenerate ? "API key regenerated" : "API key generated");
                fetchStatus();
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.keyGenerateFailed"));
        } finally {
            setWorking(false);
        }
    };

    const handleRevoke = async () => {
        const ok = await confirm({
            title: "Revoke the API key?",
            description: "Anything using it (n8n, scripts) will stop working immediately.",
            confirmLabel: t("apiAccess.revoke"),
            tone: "danger",
        });
        if (!ok) return;
        setWorking(true);
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/users/api-key`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setFreshKey(null);
            setStatus({ hasKey: false, prefix: "", createdAt: null, lastUsedAt: null });
            toast.success(t("toast.keyRevoked"));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.keyRevokeFailed"));
        } finally {
            setWorking(false);
        }
    };

    const keyPlaceholder = freshKey || (status.hasKey ? `${status.prefix}…` : "ic_your_key");

    const curlFor = (ep: Endpoint) => {
        const lines = [`curl -X ${ep.method} ${API_BASE_URL}${ep.path}`];
        lines.push(`  -H "X-API-Key: ${keyPlaceholder}"`);
        if (ep.example) {
            lines.push(`  -H "Content-Type: application/json"`);
            lines.push(`  -d '${JSON.stringify(ep.example)}'`);
        }
        return lines.join(" \\\n");
    };

    const copyCurl = (ep: Endpoint) => {
        navigator.clipboard.writeText(curlFor(ep));
        toast.success(t("toast.curlCopied"));
    };

    if (loading) {
        return <SectionLoading>{t("loading")}</SectionLoading>;
    }

    const code = (chunks: React.ReactNode) => <code className="rounded-xs bg-bg-muted px-1 py-0.5 font-mono">{chunks}</code>;

    return (
        <div className="flex flex-col gap-4">
            <Section
                icon={<KeyRound />}
                title={
                    <span className="flex flex-wrap items-center gap-2">
                        {t("apiAccess.title")}
                        {status.hasKey && <Badge tone="success" dot>{t("apiAccess.active")}</Badge>}
                    </span>
                }
                description={t("apiAccess.description", { appName: branding.appName })}
                actions={
                    status.hasKey ? (
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleGenerate(true)}
                                loading={working}
                                iconStart={<ArrowsClockwise />}
                            >
                                {t("apiAccess.regenerate")}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleRevoke}
                                disabled={working}
                                iconStart={<Trash />}
                            >
                                {t("apiAccess.revoke")}
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="primary"
                            onClick={() => handleGenerate(false)}
                            loading={working}
                            iconStart={<KeyRound />}
                        >
                            {t("apiAccess.generate")}
                        </Button>
                    )
                }
            >
                {freshKey && (
                    <Alert tone="success" title={t("apiAccess.copyNow")}>
                        <CopyField value={freshKey} label={t("apiAccess.copy")} className="mt-1.5" />
                    </Alert>
                )}

                {status.hasKey && (
                    <div className="rounded-md bg-surface p-4">
                        <DescriptionList
                            items={[
                                { term: t("apiAccess.key"), value: <span className="font-mono">{status.prefix}…</span> },
                                ...(status.createdAt ? [{ term: t("apiAccess.created"), value: new Date(status.createdAt).toLocaleString() }] : []),
                                { term: t("apiAccess.lastUsed"), value: status.lastUsedAt ? new Date(status.lastUsedAt).toLocaleString() : t("apiAccess.never") },
                            ]}
                        />
                    </div>
                )}

                <div className="flex flex-col gap-1 rounded-md bg-surface p-4">
                    <p className="text-body-sm font-medium text-fg">{t("apiAccess.usage")}</p>
                    <p className="text-caption text-fg-muted">
                        {t.rich("apiAccess.usageHint", { code })}
                    </p>
                </div>
            </Section>

            <Accordion type="single" collapsible value={docsOpen ? "reference" : ""} onValueChange={(v) => setDocsOpen(v === "reference")}>
                <AccordionItem value="reference">
                    <AccordionTrigger>
                        <BookOpen className="size-4 shrink-0 text-fg-muted" />
                        <span className="flex-1">{t("apiAccess.reference")}</span>
                        <span className="text-caption font-normal text-fg-muted">
                            {t("apiAccess.endpointCount", { count: ENDPOINTS.length })}
                        </span>
                    </AccordionTrigger>
                    <AccordionContent className="p-0">
                        <p className="border-b border-border px-4 py-3 text-caption text-fg-muted">
                            {t.rich("apiAccess.referenceIntro", {
                                baseUrl: API_BASE_URL,
                                shape: "{ status, data }",
                                code,
                                em: (chunks) => <em>{chunks}</em>,
                            })}
                        </p>
                        <Accordion type="single" collapsible value={openEndpoint ?? ""} onValueChange={(v) => setOpenEndpoint(v || null)}>
                            {ENDPOINTS.map((ep) => {
                                const id = `${ep.method} ${ep.path}`;
                                return (
                                    <AccordionItem key={id} value={id}>
                                        <AccordionTrigger>
                                            <Badge tone={METHOD_TONES[ep.method]} className="w-14 justify-center font-mono">
                                                {ep.method}
                                            </Badge>
                                            <code className="shrink-0 font-mono text-caption">{ep.path}</code>
                                            <span className="min-w-0 flex-1 truncate text-caption font-normal text-fg-muted">{ep.summary}</span>
                                        </AccordionTrigger>
                                        <AccordionContent className="flex flex-col gap-3">
                                            <p className="text-caption text-fg-muted">{ep.description}</p>

                                            {ep.body && (
                                                <div className="flex flex-col divide-y divide-border rounded-md bg-surface">
                                                    {ep.body.map((p) => (
                                                        <div key={p.name} className="flex flex-wrap items-baseline gap-2 px-3 py-2 text-caption">
                                                            <code className="font-mono font-semibold">{p.name}</code>
                                                            <span className="font-mono text-fg-muted">{p.type}</span>
                                                            {p.required && (
                                                                <Badge tone="danger" size="sm">{t("apiAccess.required")}</Badge>
                                                            )}
                                                            <span className="basis-full text-fg-muted sm:flex-1 sm:basis-auto">{p.description}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="relative">
                                                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-bg-muted p-3 pe-10 font-mono text-caption">{curlFor(ep)}</pre>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    className="absolute end-1.5 top-1.5"
                                                    onClick={() => copyCurl(ep)}
                                                    aria-label={t("apiAccess.copyCurl")}
                                                >
                                                    <Copy />
                                                </Button>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
