"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import axios, { isAxiosError } from "axios";
import { BracketsCurly, Plus, X } from "@phosphor-icons/react";
import {
    Button,
    Checkbox,
    Field,
    InfoTip,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
    toast,
} from "@wixzel/react";
import { FormIssues, hasErrors, type FormIssue } from "@/components/ui/form-issues";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const METHODS: HttpMethod[] = ["POST", "GET", "PUT", "PATCH", "DELETE"];

/** One property of a tool's JSON Schema. Anything beyond type/description/enum is kept as-is. */
export interface ToolParameterSchema {
    type?: string | string[];
    description?: string;
    enum?: unknown[];
    [key: string]: unknown;
}

export interface ToolParameters {
    type: "object";
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
    [key: string]: unknown;
}

/** A tool as GET /tools returns it. Header values never leave the server; only their names do. */
export interface Tool {
    _id: string;
    name: string;
    description: string;
    type: "webhook";
    parameters: ToolParameters;
    webhook: {
        url: string;
        method: HttpMethod;
        headerNames: string[];
        timeoutMs: number;
    };
    lastTest: { ok: boolean; status: number | null; at: string } | null;
    createdAt: string;
    updatedAt: string;
}

/** The same rule routes/tools.js applies to a tool's name. */
export const TOOL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
/** How many tools one agent may carry (routes/agents.js). */
export const MAX_TOOLS_PER_AGENT = 20;

/** "https://api.example.com/v1/orders" → "api.example.com", or null when it is not a URL yet. */
export function hostOf(url?: string | null): string | null {
    if (!url) return null;
    try {
        return new URL(url).host || null;
    } catch {
        return null;
    }
}

type ParamType = "string" | "number" | "integer" | "boolean" | "enum";
interface ParamRow { key: number; name: string; type: ParamType; description: string; required: boolean; options: string }
interface HeaderRow { key: number; name: string; value: string; stored: boolean }

const PARAM_TYPES: { value: ParamType; label: string }[] = [
    { value: "string", label: "form.typeText" },
    { value: "number", label: "form.typeNumber" },
    { value: "integer", label: "form.typeInteger" },
    { value: "boolean", label: "form.typeBoolean" },
    { value: "enum", label: "form.typeEnum" },
];

let seq = 0;
const nextKey = () => ++seq;

const EMPTY_SCHEMA: ToolParameters = { type: "object", properties: {} };

/** Rows for the builder, or null when the schema is richer than rows can show (nested, lists, unions). */
function rowsFrom(schema: unknown): ParamRow[] | null {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;
    const s = schema as Partial<ToolParameters>;
    if (s.type !== undefined && s.type !== "object") return null;
    const props = s.properties ?? {};
    if (typeof props !== "object" || Array.isArray(props)) return null;
    const required = new Set(Array.isArray(s.required) ? s.required : []);
    const rows: ParamRow[] = [];
    for (const [name, p] of Object.entries(props)) {
        if (!p || typeof p !== "object") return null;
        const isEnum = Array.isArray(p.enum) && (p.type === "string" || p.type === undefined);
        if (!isEnum && (typeof p.type !== "string" || !["string", "number", "integer", "boolean"].includes(p.type))) return null;
        // Keys the rows cannot carry (nested properties, items, formats) would be lost on the way back.
        const extra = Object.keys(p).filter((k) => !["type", "description", "enum"].includes(k));
        if (extra.length) return null;
        rows.push({
            key: nextKey(),
            name,
            type: isEnum ? "enum" : (p.type as ParamType),
            description: typeof p.description === "string" ? p.description : "",
            required: required.has(name),
            options: isEnum ? (p.enum as unknown[]).map(String).join(", ") : "",
        });
    }
    return rows;
}

function schemaFrom(rows: ParamRow[]): ToolParameters {
    const properties: ToolParameters["properties"] = {};
    for (const r of rows) {
        const name = r.name.trim();
        if (!name) continue;
        const description = r.description.trim() || undefined;
        properties[name] = r.type === "enum"
            ? { type: "string", enum: r.options.split(",").map((o) => o.trim()).filter(Boolean), ...(description ? { description } : {}) }
            : { type: r.type, ...(description ? { description } : {}) };
    }
    const required = rows.filter((r) => r.required && r.name.trim()).map((r) => r.name.trim());
    return { type: "object", properties, ...(required.length ? { required } : {}) };
}

/** "Check order status" → "Check_order_status", as the person types. */
const asName = (v: string) => v.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 64);

interface ToolFormProps {
    /** The tool to change; omitted for a new one. */
    tool?: Tool | null;
    onSaved: (tool: Tool) => void;
    onCancel?: () => void;
    /** Prefix for the form's element ids, so two forms on one page do not collide. */
    idPrefix?: string;
}

/**
 * Creating or changing one of the account's tools. Used by the Tools page's
 * drawer and by the agent drawer's "New tool" dialog, so a tool reads the same
 * wherever it is made. Owns its state and the POST/PATCH; the parent only
 * hears about the saved tool.
 */
export function ToolForm({ tool, onSaved, onCancel, idPrefix = "tool" }: ToolFormProps) {
    const t = useTranslations("tools");
    const c = useTranslations("common");
    const editing = Boolean(tool);
    const [name, setName] = useState(tool?.name ?? "");
    const [description, setDescription] = useState(tool?.description ?? "");
    const initialRows = useMemo(() => rowsFrom(tool?.parameters ?? EMPTY_SCHEMA), [tool]);
    const [rows, setRows] = useState<ParamRow[]>(initialRows ?? []);
    const [jsonMode, setJsonMode] = useState(initialRows === null);
    const [json, setJson] = useState(JSON.stringify(tool?.parameters ?? EMPTY_SCHEMA, null, 2));
    const [url, setUrl] = useState(tool?.webhook?.url ?? "");
    const [method, setMethod] = useState<HttpMethod>(tool?.webhook?.method ?? "POST");
    const [headers, setHeaders] = useState<HeaderRow[]>(
        (tool?.webhook?.headerNames ?? []).map((n) => ({ key: nextKey(), name: n, value: "", stored: true }))
    );
    const [timeout, setTimeoutS] = useState(String(Math.round((tool?.webhook?.timeoutMs ?? 10000) / 1000)));
    const [busy, setBusy] = useState(false);

    const id = (suffix: string) => `${idPrefix}-${suffix}`;
    const setRow = (key: number, patch: Partial<ParamRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const setHeader = (key: number, patch: Partial<HeaderRow>) => setHeaders((hs) => hs.map((h) => (h.key === key ? { ...h, ...patch } : h)));

    /** The schema as it would be saved, or an error key when JSON mode holds something unusable. */
    const parsedSchema = useMemo((): { schema: ToolParameters } | { error: "invalidJson" | "schemaNotObject" } => {
        if (!jsonMode) return { schema: schemaFrom(rows) };
        try {
            const parsed = JSON.parse(json);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "schemaNotObject" };
            if ((parsed.type !== undefined && parsed.type !== "object") || (parsed.properties !== undefined && (typeof parsed.properties !== "object" || Array.isArray(parsed.properties)))) {
                return { error: "schemaNotObject" };
            }
            return { schema: { ...parsed, type: "object", properties: parsed.properties ?? {} } };
        } catch {
            return { error: "invalidJson" };
        }
    }, [jsonMode, json, rows]);

    // What the server would refuse, said before Save and in the reader's language.
    const issues: FormIssue[] = [];
    if (name && !TOOL_NAME_RE.test(name)) issues.push({ level: "error", message: t("form.checks.badName") });
    const trimmedUrl = url.trim();
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) issues.push({ level: "error", message: t("form.checks.urlScheme") });
    else if (/^http:\/\//i.test(trimmedUrl)) issues.push({ level: "warning", message: t("form.checks.urlPlainHttp") });
    if (!jsonMode) {
        const seen = new Set<string>();
        for (const r of rows) {
            const n = r.name.trim();
            if (!n) continue;
            if (seen.has(n)) issues.push({ level: "error", message: t("form.checks.duplicateParam", { name: n }) });
            seen.add(n);
            if (r.type === "enum" && !r.options.split(",").some((o) => o.trim())) {
                issues.push({ level: "error", message: t("form.checks.enumNoOptions", { name: n }) });
            }
        }
    } else if ("error" in parsedSchema) {
        issues.push({ level: "error", message: t(`form.checks.${parsedSchema.error}`) });
    }
    {
        const seen = new Set<string>();
        for (const h of headers) {
            const n = h.name.trim();
            if (!n) continue;
            const lower = n.toLowerCase();
            if (seen.has(lower)) issues.push({ level: "error", message: t("form.checks.duplicateHeader", { name: n }) });
            seen.add(lower);
            if (!h.value && !h.stored) issues.push({ level: "error", message: t("form.checks.headerNoValue", { name: n }) });
        }
    }
    const blocked = hasErrors(issues);

    function toggleJson() {
        if (!jsonMode) {
            setJson(JSON.stringify(schemaFrom(rows), null, 2));
            setJsonMode(true);
            return;
        }
        if ("error" in parsedSchema) {
            toast.error(t(`form.checks.${parsedSchema.error}`));
            return;
        }
        const back = rowsFrom(parsedSchema.schema);
        if (!back) {
            toast.error(t("form.checks.nestedSchema"));
            return;
        }
        setRows(back);
        setJsonMode(false);
    }

    async function save(e: React.FormEvent) {
        e.preventDefault();
        const firstError = issues.find((i) => i.level === "error");
        if (firstError) {
            toast.error(firstError.message);
            return;
        }
        if (!TOOL_NAME_RE.test(name)) {
            toast.error(t("form.checks.badName"));
            return;
        }
        if ("error" in parsedSchema) {
            toast.error(t(`form.checks.${parsedSchema.error}`));
            return;
        }
        const timeoutMs = Math.min(30, Math.max(1, Number(timeout) || 10)) * 1000;
        const body = {
            name,
            description: description.trim(),
            parameters: parsedSchema.schema,
            webhook: {
                url: trimmedUrl,
                method,
                // A stored header sent without a value keeps the value the server already has.
                headers: headers
                    .filter((h) => h.name.trim())
                    .map((h) => (h.value ? { name: h.name.trim(), value: h.value } : { name: h.name.trim() })),
                timeoutMs,
            },
        };
        setBusy(true);
        try {
            const token = localStorage.getItem("token");
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const res = editing
                ? await axios.patch(`${API_BASE_URL}/tools/${tool!._id}`, body, config)
                : await axios.post(`${API_BASE_URL}/tools`, body, config);
            onSaved(res.data.data.tool as Tool);
        } catch (err) {
            const data = isAxiosError(err) ? (err.response?.data as { code?: string; message?: string } | undefined) : undefined;
            if (data?.code === "tool_name_taken") toast.error(t("toast.nameTaken", { name }));
            else toast.error(data?.message || t("toast.saveFailed"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={save} className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
                <Field id={id("name")} label={t("form.name")} hint={t("form.nameHint")} required>
                    <Input
                        value={name}
                        onChange={(e) => setName(asName(e.target.value))}
                        placeholder={t("form.namePlaceholder")}
                        maxLength={64}
                        required
                        disabled={busy}
                        className="ltr-data font-mono"
                        aria-invalid={Boolean(name) && !TOOL_NAME_RE.test(name)}
                    />
                </Field>
                <Field id={id("description")} label={t("form.description")} hint={t("form.descriptionHint")} required>
                    <Textarea
                        rows={3}
                        maxLength={1000}
                        required
                        disabled={busy}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t("form.descriptionPlaceholder")}
                    />
                </Field>
            </div>

            <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-body-sm font-medium text-fg">
                        {t("form.passes")}
                        <InfoTip>{t("form.passesInfo")}</InfoTip>
                    </span>
                    <Button type="button" variant="ghost" size="xs" onClick={toggleJson} iconStart={<BracketsCurly />} disabled={busy}>
                        {jsonMode ? t("form.useBuilder") : t("form.editJson")}
                    </Button>
                </div>
                {jsonMode ? (
                    <Textarea
                        aria-label={t("form.schemaLabel")}
                        dir="ltr"
                        rows={12}
                        value={json}
                        onChange={(e) => setJson(e.target.value)}
                        spellCheck={false}
                        disabled={busy}
                        className="font-mono text-caption"
                    />
                ) : (
                    <div className="flex flex-col gap-2">
                        {rows.length === 0 && (
                            <p className="rounded-md bg-surface px-3 py-4 text-center text-caption text-fg-muted">
                                {t("form.noParameters")}
                            </p>
                        )}
                        {rows.map((r, i) => (
                            <div key={r.key} className="grid gap-2 rounded-md bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
                                <Input
                                    size="sm"
                                    className="ltr-data font-mono"
                                    aria-label={t("form.paramName", { n: i + 1 })}
                                    placeholder={t("form.paramNamePlaceholder")}
                                    value={r.name}
                                    maxLength={64}
                                    disabled={busy}
                                    onChange={(e) => setRow(r.key, { name: asName(e.target.value) })}
                                />
                                <Select value={r.type} onValueChange={(v) => setRow(r.key, { type: v as ParamType })} disabled={busy}>
                                    <SelectTrigger size="sm" aria-label={t("form.paramType", { n: i + 1 })}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PARAM_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{t(p.label)}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <Checkbox
                                            id={id(`param-required-${r.key}`)}
                                            checked={r.required}
                                            onCheckedChange={(v) => setRow(r.key, { required: v === true })}
                                            disabled={busy}
                                        />
                                        <Label htmlFor={id(`param-required-${r.key}`)} className="text-caption font-normal text-fg-muted">
                                            {t("form.required")}
                                        </Label>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={t("form.removeParam", { n: i + 1 })}
                                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                                        disabled={busy}
                                    >
                                        <X />
                                    </Button>
                                </div>
                                <Input
                                    size="sm"
                                    className="sm:col-span-3"
                                    aria-label={t("form.paramDescription", { n: i + 1 })}
                                    placeholder={t("form.paramDescriptionPlaceholder")}
                                    value={r.description}
                                    maxLength={500}
                                    disabled={busy}
                                    onChange={(e) => setRow(r.key, { description: e.target.value })}
                                />
                                {r.type === "enum" && (
                                    <Input
                                        size="sm"
                                        className="sm:col-span-3"
                                        aria-label={t("form.paramOptions", { n: i + 1 })}
                                        placeholder={t("form.paramOptionsPlaceholder")}
                                        value={r.options}
                                        disabled={busy}
                                        onChange={(e) => setRow(r.key, { options: e.target.value })}
                                    />
                                )}
                            </div>
                        ))}
                        {rows.length < 30 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="w-fit"
                                iconStart={<Plus />}
                                disabled={busy}
                                onClick={() => setRows((rs) => [...rs, { key: nextKey(), name: "", type: "string", description: "", required: true, options: "" }])}
                            >
                                {t("form.addParam")}
                            </Button>
                        )}
                    </div>
                )}
            </section>

            <section className="flex flex-col gap-4">
                <span className="text-body-sm font-medium text-fg">{t("form.request")}</span>
                <div className="grid gap-4 sm:grid-cols-[130px_minmax(0,1fr)_120px]">
                    <Field label={t("form.method")}>
                        <Select value={method} onValueChange={(v) => setMethod(v as HttpMethod)} disabled={busy}>
                            <SelectTrigger className="w-full ltr-data font-mono" aria-label={t("form.method")}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {METHODS.map((m) => <SelectItem key={m} value={m}><span className="ltr-data font-mono">{m}</span></SelectItem>)}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field id={id("url")} label={t("form.url")} required className="min-w-0">
                        <Input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder={t("form.urlPlaceholder")}
                            required
                            disabled={busy}
                            className="ltr-data font-mono"
                        />
                    </Field>
                    <Field id={id("timeout")} label={t("form.timeout")}>
                        <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={30}
                            value={timeout}
                            disabled={busy}
                            onChange={(e) => setTimeoutS(e.target.value.replace(/\D/g, "").slice(0, 2))}
                            className="tabular-nums"
                        />
                    </Field>
                </div>
                <p className="-mt-2 text-caption text-fg-muted">
                    {method === "GET" || method === "DELETE" ? t("form.queryString") : t("form.jsonBody")} {t("form.timeoutHint")}
                </p>

                <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-body-sm font-medium text-fg">{t("form.headers")}</span>
                        <p className="text-caption text-fg-muted">{t("form.headersHint")}</p>
                    </div>
                    {headers.map((h, i) => (
                        <div key={h.key} className="flex gap-2">
                            <Input
                                size="sm"
                                className="w-44 shrink-0 ltr-data font-mono"
                                aria-label={t("form.headerName", { n: i + 1 })}
                                placeholder={t("form.headerNamePlaceholder")}
                                value={h.name}
                                disabled={busy}
                                onChange={(e) => setHeader(h.key, { name: e.target.value })}
                            />
                            <Input
                                size="sm"
                                className="min-w-0 flex-1 ltr-data font-mono"
                                aria-label={t("form.headerValue", { n: i + 1 })}
                                type="password"
                                autoComplete="off"
                                placeholder={h.stored ? t("form.headerSaved") : t("form.headerValuePlaceholder")}
                                value={h.value}
                                disabled={busy}
                                onChange={(e) => setHeader(h.key, { value: e.target.value })}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("form.removeHeader", { n: i + 1 })}
                                onClick={() => setHeaders((hs) => hs.filter((x) => x.key !== h.key))}
                                disabled={busy}
                            >
                                <X />
                            </Button>
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit"
                        iconStart={<Plus />}
                        disabled={busy}
                        onClick={() => setHeaders((hs) => [...hs, { key: nextKey(), name: "", value: "", stored: false }])}
                    >
                        {t("form.addHeader")}
                    </Button>
                    {headers.length > 0 && <p className="text-caption text-fg-subtle">{t("form.encrypted")}</p>}
                </div>
            </section>

            <FormIssues issues={issues} />

            <div className="flex items-center justify-end gap-3">
                {onCancel && (
                    <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
                        {c("actions.cancel")}
                    </Button>
                )}
                <Button type="submit" variant="primary" loading={busy} disabled={blocked}>
                    {editing ? t("form.saveChanges") : t("form.create")}
                </Button>
            </div>
        </form>
    );
}
