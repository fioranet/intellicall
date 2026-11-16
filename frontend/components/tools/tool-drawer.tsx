"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import axios, { isAxiosError } from "axios";
import { ArrowCounterClockwise, Play, Trash, Wrench } from "@phosphor-icons/react";
import {
    Badge,
    Button,
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    Field,
    Section,
    Textarea,
    toast,
    useConfirm,
} from "@wixzel/react";
import { ToolForm, type Tool, type ToolParameterSchema } from "./tool-form";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface TestResult { ok: boolean; status: number | null; durationMs: number; output: string }

/** The server's own words for a failed request, when it gave any. */
const apiMessage = (err: unknown): string | undefined =>
    isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined;

interface ToolDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The tool to edit; null for a new one. */
    tool: Tool | null;
    /** Names of the agents that carry this tool, for the delete confirmation. */
    usedBy?: string[];
    onSaved: (tool: Tool) => void;
    onDeleted?: (tool: Tool) => void;
}

/** A sample value for one parameter, so the test starts from something the webhook will accept. */
function exampleFor(p: ToolParameterSchema): unknown {
    if (Array.isArray(p.enum) && p.enum.length) return p.enum[0];
    const type = Array.isArray(p.type) ? p.type[0] : p.type;
    switch (type) {
        case "number": return 1.5;
        case "integer": return 1;
        case "boolean": return true;
        case "array": return [];
        case "object": return {};
        case "null": return null;
        default: return typeof p.description === "string" && p.description ? p.description : "example";
    }
}

function exampleArguments(tool: Tool): string {
    const args: Record<string, unknown> = {};
    for (const [name, p] of Object.entries(tool.parameters?.properties ?? {})) args[name] = exampleFor(p);
    return JSON.stringify(args, null, 2);
}

/**
 * The Tools page's editor: the form, and for a saved tool a test bench and the
 * delete action. Narrower than the agent drawer; a tool is one screen of fields.
 */
export function ToolDrawer({ open, onOpenChange, tool, usedBy = [], onSaved, onDeleted }: ToolDrawerProps) {
    const t = useTranslations("tools");
    const confirm = useConfirm();
    const [deleting, setDeleting] = useState(false);

    async function remove() {
        if (!tool) return;
        const ok = await confirm({
            title: t("delete.title", { name: tool.name }),
            description: usedBy.length ? t("delete.descriptionUsed", { agents: usedBy.join(", ") }) : t("delete.description"),
            confirmLabel: t("delete.confirm"),
            tone: "danger",
        });
        if (!ok) return;
        setDeleting(true);
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/tools/${tool._id}`, { headers: { Authorization: `Bearer ${token}` } });
            toast.success(t("toast.deleted", { name: tool.name }));
            onOpenChange(false);
            onDeleted?.(tool);
        } catch (err) {
            toast.error(apiMessage(err) || t("toast.deleteFailed"));
        } finally {
            setDeleting(false);
        }
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent side="right" style={{ "--wx-drawer-size": "760px" } as CSSProperties}>
                <DrawerHeader>
                    <DrawerTitle className="flex items-center gap-2">
                        <Wrench className="size-5 text-accent-ink" />
                        {tool ? <span className="ltr-data font-mono">{tool.name}</span> : t("drawer.createTitle")}
                    </DrawerTitle>
                    <DrawerDescription>{tool ? t("drawer.editDescription") : t("drawer.createDescription")}</DrawerDescription>
                </DrawerHeader>
                <DrawerBody className="flex flex-col gap-4">
                    <Section title={t("drawer.settings")} className="min-w-0">
                        {/* Remount on save so stored headers show as saved and the rows match the server's copy. */}
                        <ToolForm
                            key={tool ? `${tool._id}:${tool.updatedAt}` : "new"}
                            tool={tool}
                            idPrefix="tool-drawer"
                            onCancel={() => onOpenChange(false)}
                            onSaved={(saved) => {
                                toast.success(tool ? t("toast.saved") : t("toast.created", { name: saved.name }));
                                onSaved(saved);
                            }}
                        />
                    </Section>

                    {tool && <TestPanel tool={tool} />}

                    {tool && (
                        <Section tone="danger" title={t("drawer.dangerTitle")} description={t("drawer.dangerDescription")}>
                            <Button type="button" variant="danger" className="w-fit" iconStart={<Trash />} loading={deleting} onClick={() => void remove()}>
                                {t("drawer.deleteTool")}
                            </Button>
                        </Section>
                    )}
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    );
}

/** Run the webhook with sample arguments and show what the agent would hear. */
function TestPanel({ tool }: { tool: Tool }) {
    const t = useTranslations("tools");
    const example = useMemo(() => exampleArguments(tool), [tool]);
    const [args, setArgs] = useState(example);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<TestResult | null>(null);

    // A saved change to the parameters gives the sample a fresh start.
    useEffect(() => {
        setArgs(example);
        setResult(null);
    }, [example]);

    let parsed: Record<string, unknown> | null = null;
    let invalid = false;
    try {
        const v = JSON.parse(args);
        if (v && typeof v === "object" && !Array.isArray(v)) parsed = v;
        else invalid = true;
    } catch {
        invalid = true;
    }

    async function run() {
        if (!parsed) {
            toast.error(t("test.invalidJson"));
            return;
        }
        setBusy(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.post(`${API_BASE_URL}/tools/${tool._id}/test`, { arguments: parsed }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setResult(res.data.data as TestResult);
        } catch (err) {
            toast.error(apiMessage(err) || t("toast.testFailed"));
        } finally {
            setBusy(false);
        }
    }

    const lastTest = result ?? tool.lastTest;

    return (
        <Section
            title={t("test.title")}
            description={t("test.description")}
            actions={lastTest && !result ? (
                <Badge tone={lastTest.ok ? "success" : "danger"} dot>
                    {lastTest.ok ? t("card.testPassed") : t("card.testFailed")}
                </Badge>
            ) : undefined}
            className="min-w-0"
        >
            <Field
                id="tool-test-args"
                label={t("test.arguments")}
                hint={invalid ? undefined : t("test.argumentsHint")}
                error={invalid ? t("test.invalidJson") : undefined}
                labelAside={(
                    <Button type="button" variant="ghost" size="xs" iconStart={<ArrowCounterClockwise />} onClick={() => setArgs(example)} disabled={busy}>
                        {t("test.reset")}
                    </Button>
                )}
            >
                <Textarea
                    dir="ltr"
                    rows={Math.min(12, Math.max(4, args.split("\n").length))}
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    spellCheck={false}
                    disabled={busy}
                    className="font-mono text-caption"
                />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" loading={busy} disabled={invalid} onClick={() => void run()} iconStart={<Play />}>
                    {t("test.run")}
                </Button>
                {tool.lastTest && !result && (
                    <span className="text-caption text-fg-muted">
                        {t("test.lastTested", { date: new Date(tool.lastTest.at).toLocaleString() })}
                    </span>
                )}
            </div>
            {result && (
                <div className="flex flex-col gap-2 rounded-md bg-surface p-3">
                    <span className="flex flex-wrap items-center gap-2 text-caption text-fg">
                        <Badge tone={result.ok ? "success" : "danger"} dot>
                            {result.status ? t("test.http", { status: result.status }) : t("test.noAnswer")}
                        </Badge>
                        <span className="tabular-nums text-fg-muted">{t("test.duration", { ms: result.durationMs })}</span>
                    </span>
                    <pre tabIndex={0} dir="ltr" className="wx-focus max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xs font-mono text-caption text-fg-muted">
                        {result.output}
                    </pre>
                    <span className="text-caption text-fg-subtle">{t("test.agentHears")}</span>
                </div>
            )}
        </Section>
    );
}
