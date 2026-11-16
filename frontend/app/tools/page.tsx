"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
    Badge,
    Button,
    Card,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    EmptyState,
    PageHeader,
    Skeleton,
    toast,
    useConfirm,
} from "@wixzel/react";
import { DotsThreeVertical, PencilSimple, Plus, Trash, WebhooksLogo, Wrench } from "@phosphor-icons/react";
import axios, { isAxiosError } from "axios";
import { ToolDrawer } from "@/components/tools/tool-drawer";
import { hostOf, type Tool } from "@/components/tools/tool-form";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface AgentRef { _id: string; name: string; toolIds?: (string | { _id: string })[] }

/** The server's own words for a failed request, when it gave any. */
const apiMessage = (err: unknown): string | undefined =>
    isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined;

/**
 * Tools: the account's own actions for agents to take during a call. Each is a
 * webhook on the account's server; an agent gets one from its Capabilities.
 */
export default function ToolsPage() {
    const t = useTranslations("tools");
    const confirm = useConfirm();
    const [tools, setTools] = useState<Tool[] | null>(null);
    const [agents, setAgents] = useState<AgentRef[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selected, setSelected] = useState<Tool | null>(null);

    useEffect(() => {
        let cancelled = false;
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };
        Promise.all([
            axios.get(`${API_BASE_URL}/tools`, { headers }),
            // Agents only say who uses what; the page still works without them.
            axios.get(`${API_BASE_URL}/agents`, { headers }).catch(() => null),
        ])
            .then(([toolsRes, agentsRes]) => {
                if (cancelled) return;
                if (toolsRes.data?.status === "success") setTools(toolsRes.data.data.tools as Tool[]);
                if (agentsRes?.data?.status === "success") setAgents(agentsRes.data.data.agents as AgentRef[]);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                toast.error(apiMessage(err) || t("loadFailed"));
                setTools([]);
            });
        return () => {
            cancelled = true;
        };
    }, [t]);

    /** Tool id → the names of the agents that carry it. */
    const usedBy = useMemo(() => {
        const m = new Map<string, string[]>();
        for (const a of agents) {
            for (const ref of a.toolIds ?? []) {
                const id = typeof ref === "string" ? ref : String(ref?._id ?? "");
                if (id) m.set(id, [...(m.get(id) ?? []), a.name]);
            }
        }
        return m;
    }, [agents]);

    const openNew = () => {
        setSelected(null);
        setDrawerOpen(true);
    };
    const openEdit = (tool: Tool) => {
        setSelected(tool);
        setDrawerOpen(true);
    };

    const handleDelete = async (tool: Tool) => {
        const users = usedBy.get(tool._id) ?? [];
        const ok = await confirm({
            title: t("delete.title", { name: tool.name }),
            description: users.length ? t("delete.descriptionUsed", { agents: users.join(", ") }) : t("delete.description"),
            confirmLabel: t("delete.confirm"),
            tone: "danger",
        });
        if (!ok) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/tools/${tool._id}`, { headers: { Authorization: `Bearer ${token}` } });
            toast.success(t("toast.deleted", { name: tool.name }));
            setTools((list) => (list ?? []).filter((x) => x._id !== tool._id));
        } catch (err) {
            toast.error(apiMessage(err) || t("toast.deleteFailed"));
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("subtitle")}
                info={t("info")}
                actions={
                    <Button variant="primary" onClick={openNew} iconStart={<Plus />}>
                        {t("newTool")}
                    </Button>
                }
            />

            {tools === null && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
                </div>
            )}

            {tools?.length === 0 && (
                <Card>
                    <EmptyState
                        icon={<Wrench />}
                        title={t("empty.title")}
                        description={t("empty.description")}
                        actions={
                            <Button variant="primary" onClick={openNew} iconStart={<Plus />}>
                                {t("newTool")}
                            </Button>
                        }
                    />
                </Card>
            )}

            {tools && tools.length > 0 && (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {tools.map((tool) => {
                        const users = usedBy.get(tool._id) ?? [];
                        const paramCount = Object.keys(tool.parameters?.properties ?? {}).length;
                        return (
                            <li key={tool._id} className="min-w-0">
                                <Card interactive className="relative flex h-full flex-col p-5">
                                    <div className="flex items-start gap-3">
                                        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                            <WebhooksLogo className="size-5" aria-hidden />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            {/* The whole card opens the tool: the name's hit area is stretched over it. */}
                                            <button
                                                type="button"
                                                onClick={() => openEdit(tool)}
                                                className="ltr-data block w-full truncate text-start font-mono text-body-sm font-semibold text-fg after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
                                            >
                                                {tool.name}
                                            </button>
                                            <p className="mt-0.5 truncate text-caption text-fg-muted">
                                                <bdi dir="ltr">{tool.webhook?.method} · {hostOf(tool.webhook?.url) ?? "—"}</bdi>
                                            </p>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon-sm" className="relative z-10 -me-2 -mt-1" aria-label={t("card.actions")}>
                                                    <DotsThreeVertical />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openEdit(tool)}>
                                                    <PencilSimple />
                                                    {t("card.edit")}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem tone="danger" onClick={() => void handleDelete(tool)}>
                                                    <Trash />
                                                    {t("card.delete")}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <p className="mt-4 line-clamp-2 text-body-sm text-fg-muted" title={tool.description}>
                                        {tool.description}
                                    </p>
                                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                                        <span className="text-caption text-fg-subtle">
                                            {t("card.parameters", { count: paramCount })}
                                            {" · "}
                                            {users.length === 0
                                                ? t("card.notUsed")
                                                : <span title={t("card.usedByNames", { names: users.join(", ") })}>{t("card.usedBy", { count: users.length })}</span>}
                                        </span>
                                        {tool.lastTest ? (
                                            <Badge tone={tool.lastTest.ok ? "success" : "danger"} dot size="sm">
                                                {tool.lastTest.ok ? t("card.testPassed") : t("card.testFailed")}
                                            </Badge>
                                        ) : (
                                            <Badge size="sm">{t("card.untested")}</Badge>
                                        )}
                                    </div>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}

            <ToolDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                tool={selected}
                usedBy={selected ? usedBy.get(selected._id) ?? [] : []}
                onSaved={(saved) => {
                    setTools((list) => {
                        const current = list ?? [];
                        return current.some((x) => x._id === saved._id)
                            ? current.map((x) => (x._id === saved._id ? saved : x))
                            : [saved, ...current];
                    });
                    setSelected(saved);
                }}
                onDeleted={(deleted) => setTools((list) => (list ?? []).filter((x) => x._id !== deleted._id))}
            />
        </div>
    );
}
