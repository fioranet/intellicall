"use client";

import { useTranslations } from "next-intl";
import { useSettings } from "@/components/settings-provider";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CheckCircle2, ChevronDown, Copy, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";

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

const METHOD_STYLES: Record<Endpoint["method"], string> = {
    GET: "bg-emerald-50 text-emerald-700 border-emerald-200",
    POST: "bg-violet-50 text-violet-700 border-violet-200",
    PATCH: "bg-amber-50 text-amber-700 border-amber-200",
    DELETE: "bg-red-50 text-red-700 border-red-200"
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
        if (regenerate && !confirm("Regenerate the API key? The current key stops working immediately and any workflow using it must be updated.")) return;
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
        if (!confirm("Revoke the API key? Anything using it (n8n, scripts) will stop working immediately.")) return;
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

    const copyKey = () => {
        if (!freshKey) return;
        navigator.clipboard.writeText(freshKey);
        toast.success(t("toast.keyCopied"));
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
        return (
            <Card>
                <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin me-2" /> {t("loading")}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-primary shrink-0" />
                            {t("apiAccess.title")}
                            {status.hasKey && (
                                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 ms-2">
                                    <CheckCircle2 className="h-3 w-3 me-1" /> {t("apiAccess.active")}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {t("apiAccess.description", { appName: branding.appName })}
                        </CardDescription>
                    </div>
                    {status.hasKey ? (
                        <div className="flex gap-2 shrink-0">
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => handleGenerate(true)} disabled={working}>
                                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                {t("apiAccess.regenerate")}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 border-red-200 hover:bg-red-50 gap-2"
                                onClick={handleRevoke}
                                disabled={working}
                            >
                                <Trash2 className="h-4 w-4" /> {t("apiAccess.revoke")}
                            </Button>
                        </div>
                    ) : (
                        <Button className="gap-2 shrink-0" onClick={() => handleGenerate(false)} disabled={working}>
                            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                            {t("apiAccess.generate")}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {freshKey && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
                        <p className="text-xs font-bold text-green-900">
                            {t("apiAccess.copyNow")}
                        </p>
                        <div className="flex gap-2">
                            <code className="flex-1 text-xs font-mono bg-white border rounded-lg px-3 py-2 break-all">{freshKey}</code>
                            <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={copyKey}>
                                <Copy className="h-4 w-4" /> {t("apiAccess.copy")}
                            </Button>
                        </div>
                    </div>
                )}

                {status.hasKey && (
                    <div className="rounded-xl border p-4 bg-muted/20 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-xs font-bold uppercase text-muted-foreground">{t("apiAccess.key")}</span>
                            <span className="font-mono">{status.prefix}…</span>
                        </div>
                        {status.createdAt && (
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-xs font-bold uppercase text-muted-foreground">{t("apiAccess.created")}</span>
                                <span className="text-xs">{new Date(status.createdAt).toLocaleString()}</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-xs font-bold uppercase text-muted-foreground">{t("apiAccess.lastUsed")}</span>
                            <span className="text-xs">{status.lastUsedAt ? new Date(status.lastUsedAt).toLocaleString() : t("apiAccess.never")}</span>
                        </div>
                    </div>
                )}

                <div className="rounded-xl border p-4 bg-muted/20 space-y-1">
                    <p className="text-xs font-bold text-foreground">{t("apiAccess.usage")}</p>
                    <p className="text-xs text-muted-foreground">
                        {t.rich("apiAccess.usageHint", { code: (chunks) => <code className="px-1 py-0.5 bg-muted rounded">{chunks}</code> })}
                    </p>
                </div>

                <div className="rounded-xl border bg-muted/20">
                    <button
                        type="button"
                        onClick={() => setDocsOpen((o) => !o)}
                        className="w-full flex items-center justify-between gap-4 p-4 text-start"
                    >
                        <span className="flex items-center gap-2 text-sm font-bold">
                            <BookOpen className="h-4 w-4" /> {t("apiAccess.reference")}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {t("apiAccess.endpointCount", { count: ENDPOINTS.length })}
                            <ChevronDown className={`h-4 w-4 transition-transform ${docsOpen ? "rotate-180" : ""}`} />
                        </span>
                    </button>

                    {docsOpen && (
                        <div className="border-t">
                            <p className="px-4 py-3 text-xs text-muted-foreground border-b">
                                {t.rich("apiAccess.referenceIntro", {
                                    baseUrl: API_BASE_URL,
                                    shape: "{ status, data }",
                                    code: (chunks) => <code className="px-1 py-0.5 bg-muted rounded">{chunks}</code>,
                                    em: (chunks) => <em>{chunks}</em>,
                                })}
                            </p>
                            <div className="divide-y">
                                {ENDPOINTS.map((ep) => {
                                    const id = `${ep.method} ${ep.path}`;
                                    const isOpen = openEndpoint === id;
                                    return (
                                        <div key={id}>
                                            <button
                                                type="button"
                                                onClick={() => setOpenEndpoint(isOpen ? null : id)}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-start hover:bg-muted/40 transition-colors"
                                            >
                                                <span className={`text-[10px] font-bold border rounded px-1.5 py-0.5 shrink-0 w-14 text-center ${METHOD_STYLES[ep.method]}`}>
                                                    {ep.method}
                                                </span>
                                                <code className="text-xs font-mono shrink-0">{ep.path}</code>
                                                <span className="text-xs text-muted-foreground truncate flex-1">{ep.summary}</span>
                                                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                            </button>

                                            {isOpen && (
                                                <div className="px-4 pb-4 space-y-3">
                                                    <p className="text-xs text-muted-foreground">{ep.description}</p>

                                                    {ep.body && (
                                                        <div className="rounded-lg border bg-background/60 divide-y">
                                                            {ep.body.map((p) => (
                                                                <div key={p.name} className="flex items-baseline gap-2 px-3 py-2 text-xs flex-wrap">
                                                                    <code className="font-mono font-semibold">{p.name}</code>
                                                                    <span className="text-muted-foreground font-mono text-[10px]">{p.type}</span>
                                                                    {p.required && (
                                                                        <span className="text-[10px] font-bold text-red-600">{t("apiAccess.required")}</span>
                                                                    )}
                                                                    <span className="text-muted-foreground basis-full sm:basis-auto sm:flex-1">{p.description}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="relative">
                                                        <pre className="text-[11px] font-mono bg-muted rounded-lg p-3 pe-10 overflow-x-auto whitespace-pre-wrap break-all">{curlFor(ep)}</pre>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="absolute top-1.5 end-1.5 h-7 w-7 p-0"
                                                            onClick={() => copyCurl(ep)}
                                                            aria-label={t("apiAccess.copyCurl")}
                                                        >
                                                            <Copy className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
