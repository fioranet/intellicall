"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    EmptyState,
    PageHeader,
    Section,
    Separator,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    toast,
    useConfirm,
} from "@wixzel/react";
import { Plus, HardDrives, DotsThreeVertical, PencilSimple, Trash, TestTube, ArrowsClockwise, Globe, MapPin, Pulse, CheckCircle, XCircle, Info, Bug } from "@phosphor-icons/react";
import axios from "axios";
import { SipTrunkDialog } from "@/components/sip-trunks/sip-trunk-dialog";
import { SipDebugPanel } from "@/components/sip-trunks/sip-debug-panel";
import { cn } from "@/lib/utils";
import { useSettings } from "@/components/settings-provider";
import { sipTrunkIssues } from "@/lib/sip-trunk-checks";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function SipTrunksPage() {
    const t = useTranslations("sip");
    const { branding } = useSettings();
    const confirm = useConfirm();
    const [trunks, setTrunks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedTrunk, setSelectedTrunk] = useState<any>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [reloading, setReloading] = useState(false);
    const [debugOpen, setDebugOpen] = useState(false);
    const [asteriskStatus, setAsteriskStatus] = useState<{
        asteriskConnected: boolean;
        activeSipCalls: number;
    } | null>(null);

    const fetchTrunks = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const [trunksRes, statusRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/sip-trunks`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                axios.get(`${API_BASE_URL}/sip-trunks/asterisk/status`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).catch(() => null),
            ]);

            if (trunksRes.data?.status === "success") {
                setTrunks(trunksRes.data.data.trunks);
            }
            if (statusRes?.data?.status === "success") {
                setAsteriskStatus(statusRes.data.data);
            }
        } catch (err: any) {
            toast.error(t("toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTrunks();
    }, [fetchTrunks]);

    const handleDelete = async (id: string) => {
        if (!(await confirm({ title: "Are you sure you want to delete this SIP trunk?", tone: "danger" }))) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/sip-trunks/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success(t("toast.deleted"));
            fetchTrunks();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.deleteFailed"));
        }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.post(
                `${API_BASE_URL}/sip-trunks/${id}/test`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = res.data?.data;
            if (data?.reachable) {
                toast.success(data.message);
            } else {
                toast.error(data?.message || t("toast.testFailed"));
            }
            fetchTrunks();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.testFailed"));
        } finally {
            setTestingId(null);
        }
    };

    const handleReloadConfig = async () => {
        setReloading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.post(
                `${API_BASE_URL}/sip-trunks/reload-config`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data?.status === "success") {
                toast.success(res.data.message);
            } else {
                toast.warning(res.data?.message || t("toast.configWarnings"));
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.reloadFailed"));
        } finally {
            setReloading(false);
        }
    };

    const handleEdit = (trunk: any) => {
        setSelectedTrunk(trunk);
        setDialogOpen(true);
    };

    const handleAdd = () => {
        setSelectedTrunk(null);
        setDialogOpen(true);
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("subtitle")}
                actions={
                    <>
                        <Button size="sm" onClick={() => setDebugOpen(true)} iconStart={<Bug />}>
                            {t("actions.debug")}
                        </Button>
                        <Button size="sm" onClick={handleReloadConfig} loading={reloading} iconStart={<ArrowsClockwise />}>
                            {t("actions.reloadAsterisk")}
                        </Button>
                        <Button variant="primary" onClick={handleAdd} iconStart={<Plus />}>
                            {t("actions.addTrunk")}
                        </Button>
                    </>
                }
            />

            {/* Asterisk Status Bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-card px-5 py-3.5 text-body-sm">
                {asteriskStatus?.asteriskConnected ? (
                    <Badge tone="success" pulse>{t("status.connected")}</Badge>
                ) : (
                    <Badge tone="danger" dot>{t("status.offline")}</Badge>
                )}
                <Separator orientation="vertical" className="h-4 self-center" />
                <span className="flex items-center gap-1.5 text-fg-muted tabular-nums">
                    <Pulse className="size-3.5" />
                    {t("status.activeCalls", { count: asteriskStatus?.activeSipCalls ?? 0 })}
                </span>
                <Separator orientation="vertical" className="h-4 self-center" />
                <span className="flex items-center gap-1.5 text-fg-muted tabular-nums">
                    <HardDrives className="size-3.5" />
                    {t("status.trunksConfigured", { count: trunks.length })}
                </span>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <HardDrives className="size-5 text-accent-ink" />
                        {t("list.title")}
                    </CardTitle>
                    <CardDescription>
                        {t("list.description")}
                    </CardDescription>
                </CardHeader>
                {loading ? (
                    <CardContent className="flex justify-center py-12">
                        <Spinner size="xl" className="text-accent-ink" />
                    </CardContent>
                ) : trunks.length === 0 ? (
                    <EmptyState
                        icon={<HardDrives />}
                        title={t("list.emptyTitle")}
                        description={t("list.emptyDescription")}
                        actions={
                            <Button onClick={handleAdd} iconStart={<Plus />}>
                                {t("actions.addTrunk")}
                            </Button>
                        }
                    />
                ) : (
                    <Table frameClassName="mt-3">
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("table.trunk")}</TableHead>
                                <TableHead>{t("table.host")}</TableHead>
                                <TableHead>{t("table.provider")}</TableHead>
                                <TableHead>{t("table.status")}</TableHead>
                                <TableHead>{t("table.lastTest")}</TableHead>
                                <TableHead>{t("table.test")}</TableHead>
                                <TableHead align="end">{t("table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {trunks.map((trunk) => (
                                <TableRow key={trunk._id}>
                                    <TableCell className="py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                                <HardDrives className="size-4" />
                                            </span>
                                            <div>
                                                <p className="font-semibold">{trunk.name}</p>
                                                <p className="text-caption text-fg-muted">
                                                    {t("table.port", { transport: trunk.transport.toUpperCase(), port: trunk.port })}
                                                </p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3 font-mono text-fg-muted">
                                        {trunk.host}
                                        <TrunkProblems trunk={trunk} />
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-1">
                                            {trunk.providerName && (
                                                <div className="flex items-center gap-1.5 font-medium">
                                                    <Globe className="size-3 text-fg-muted" />
                                                    {trunk.providerName}
                                                </div>
                                            )}
                                            {trunk.region && (
                                                <div className="flex items-center gap-1.5 text-caption text-fg-muted">
                                                    <MapPin className="size-3" />
                                                    {trunk.region}
                                                </div>
                                            )}
                                            {!trunk.providerName && !trunk.region && (
                                                <span className="text-fg-subtle">—</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <Badge tone={trunk.status === "active" ? "success" : "neutral"} dot className="capitalize">
                                            {trunk.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        {trunk.lastTestedAt ? (
                                            <div className="flex items-center gap-1.5">
                                                {trunk.lastTestResult === "success" ? (
                                                    <CheckCircle className="size-3.5 text-success-ink" />
                                                ) : (
                                                    <XCircle className="size-3.5 text-danger-ink" />
                                                )}
                                                <span className="text-caption text-fg-muted">
                                                    {new Date(trunk.lastTestedAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-caption italic text-fg-muted">{t("table.never")}</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <Button
                                            size="sm"
                                            onClick={() => handleTest(trunk._id)}
                                            loading={testingId === trunk._id}
                                            iconStart={<TestTube />}
                                        >
                                            {testingId === trunk._id ? "Testing..." : "Test"}
                                        </Button>
                                    </TableCell>
                                    <TableCell align="end" className="py-3">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon-sm" aria-label={t("table.actions")}>
                                                    <DotsThreeVertical />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleEdit(trunk)}>
                                                    <PencilSimple />
                                                    {t("table.edit")}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem tone="danger" onClick={() => handleDelete(trunk._id)}>
                                                    <Trash />
                                                    {t("table.delete")}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>

            {/* Setup Info Box */}
            <Section icon={<Info />} title={t("info.title")}>
                <div className="flex flex-col gap-2 text-body-sm text-fg-muted">
                    <p>
                        {t.rich("info.body", { appName: branding.appName, b: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong> })}
                    </p>
                    <p>
                        {t.rich("info.requirements", { b: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong> })}
                    </p>
                </div>
            </Section>

            <SipTrunkDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                trunk={selectedTrunk}
                onSuccess={fetchTrunks}
            />

            <SipDebugPanel open={debugOpen} onOpenChange={setDebugOpen} />
        </div>
    );
}

/** Problems a saved trunk already has, from the same checks the form runs before Save. */
function TrunkProblems({ trunk }: {
    trunk: {
        host?: string; port?: number; transport?: string; username?: string; authRealm?: string;
        defaultCallerId?: string; dialPrefix?: string; stripPlus?: boolean; hostProblem?: string | null;
    };
}) {
    const t = useTranslations("sip");
    const c = useTranslations("common");
    const issues = [
        // The server says this in English; the list says it in the user's language.
        ...(trunk.hostProblem ? [{ level: "error" as const, message: t("checks.ownHost") }] : []),
        ...sipTrunkIssues(
            {
                host: trunk.host || "", port: String(trunk.port ?? ""), transport: trunk.transport || "udp",
                username: trunk.username || "", password: "", authRealm: trunk.authRealm || "",
                defaultCallerId: trunk.defaultCallerId || "", dialPrefix: trunk.dialPrefix || "",
                stripPlus: !!trunk.stripPlus,
            },
            { isEditing: true, clearCredentials: false },
            { t, c }
        ),
    ];
    if (issues.length === 0) return null;
    issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
    const isError = issues[0].level === "error";
    return (
        <p
            title={issues.map((i) => i.message).join("\n\n")}
            className={cn(
                "mt-1 max-w-[260px] whitespace-normal font-sans text-caption line-clamp-3",
                isError ? "text-danger-ink" : "text-warning-ink"
            )}
        >
            {issues[0].message}
            {issues.length > 1 ? ` ${t("table.moreIssues", { count: issues.length - 1 })}` : ""}
        </p>
    );
}
