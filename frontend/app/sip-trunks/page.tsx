"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Plus,
    Server,
    MoreVertical,
    Edit,
    Trash2,
    Loader2,
    Wifi,
    WifiOff,
    TestTube,
    RefreshCw,
    Globe,
    MapPin,
    Activity,
    CheckCircle2,
    XCircle,
    Info,
    Bug,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import axios from "axios";
import { SipTrunkDialog } from "@/components/sip-trunks/sip-trunk-dialog";
import { SipDebugPanel } from "@/components/sip-trunks/sip-debug-panel";
import { cn } from "@/lib/utils";
import { useSettings } from "@/components/settings-provider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function SipTrunksPage() {
    const t = useTranslations("sip");
    const { branding } = useSettings();
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
        if (!confirm("Are you sure you want to delete this SIP trunk?")) return;
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
        <div className="flex-col md:flex">
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">{t("title")}</h1>
                        <p className="text-muted-foreground">
                            {t("subtitle")}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setDebugOpen(true)} size="sm">
                            <Bug className="me-2 h-4 w-4" />
                            {t("actions.debug")}
                        </Button>
                        <Button variant="outline" onClick={handleReloadConfig} disabled={reloading} size="sm">
                            <RefreshCw className={cn("me-2 h-4 w-4", reloading && "animate-spin")} />
                            {t("actions.reloadAsterisk")}
                        </Button>
                        <Button onClick={handleAdd}>
                            <Plus className="me-2 h-4 w-4" />
                            {t("actions.addTrunk")}
                        </Button>
                    </div>
                </div>

                {/* Asterisk Status Bar */}
                <div className="flex items-center gap-4 p-4 rounded-xl border bg-muted/20">
                    <div className="flex items-center gap-2">
                        {asteriskStatus?.asteriskConnected ? (
                            <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-sm font-semibold text-green-700 dark:text-green-400">{t("status.connected")}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">{t("status.offline")}</span>
                            </div>
                        )}
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Activity className="h-3.5 w-3.5" />
                        <span>{t("status.activeCalls", { count: asteriskStatus?.activeSipCalls ?? 0 })}</span>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Server className="h-3.5 w-3.5" />
                        <span>{t("status.trunksConfigured", { count: trunks.length })}</span>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Server className="h-5 w-5 text-primary" />
                            <CardTitle>{t("list.title")}</CardTitle>
                        </div>
                        <CardDescription>
                            {t("list.description")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : trunks.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                                <Server className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-foreground">{t("list.emptyTitle")}</h3>
                                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                                    {t("list.emptyDescription")}
                                </p>
                                <Button onClick={handleAdd} variant="outline" className="rounded-full">
                                    <Plus className="me-2 h-4 w-4" />
                                    {t("actions.addTrunk")}
                                </Button>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-border overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">
                                                {t("table.trunk")}
                                            </TableHead>
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">
                                                {t("table.host")}
                                            </TableHead>
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">
                                                {t("table.provider")}
                                            </TableHead>
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">
                                                {t("table.status")}
                                            </TableHead>
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">
                                                {t("table.lastTest")}
                                            </TableHead>
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">
                                                {t("table.test")}
                                            </TableHead>
                                            <TableHead className="py-4 text-end font-bold text-muted-foreground uppercase text-[10px]">
                                                {t("table.actions")}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {trunks.map((trunk) => (
                                            <TableRow key={trunk._id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-primary/10 p-2 rounded-lg">
                                                            <Server className="h-4 w-4 text-primary" />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-foreground">{trunk.name}</p>
                                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                                                {t("table.port", { transport: trunk.transport.toUpperCase(), port: trunk.port })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-4 font-mono text-sm text-muted-foreground">
                                                    {trunk.host}
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {trunk.providerName && (
                                                            <div className="flex items-center gap-1.5 text-sm font-medium">
                                                                <Globe className="h-3 w-3 text-muted-foreground" />
                                                                {trunk.providerName}
                                                            </div>
                                                        )}
                                                        {trunk.region && (
                                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                <MapPin className="h-3 w-3" />
                                                                {trunk.region}
                                                            </div>
                                                        )}
                                                        {!trunk.providerName && !trunk.region && (
                                                            <span className="text-xs text-muted-foreground italic">—</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-[9px] font-bold uppercase",
                                                            trunk.status === "active"
                                                                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20"
                                                                : "bg-muted text-muted-foreground border-border"
                                                        )}
                                                    >
                                                        {trunk.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    {trunk.lastTestedAt ? (
                                                        <div className="flex items-center gap-1.5">
                                                            {trunk.lastTestResult === "success" ? (
                                                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                                                            ) : (
                                                                <XCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                                                            )}
                                                            <span className="text-xs text-muted-foreground">
                                                                {new Date(trunk.lastTestedAt).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground italic">{t("table.never")}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 text-xs"
                                                        onClick={() => handleTest(trunk._id)}
                                                        disabled={testingId === trunk._id}
                                                    >
                                                        {testingId === trunk._id ? (
                                                            <Loader2 className="me-1.5 h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <TestTube className="me-1.5 h-3 w-3" />
                                                        )}
                                                        {testingId === trunk._id ? "Testing..." : "Test"}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="py-4 text-end">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => handleEdit(trunk)}>
                                                                <Edit className="me-2 h-4 w-4" />
                                                                {t("table.edit")}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-red-600"
                                                                onClick={() => handleDelete(trunk._id)}
                                                            >
                                                                <Trash2 className="me-2 h-4 w-4" />
                                                                {t("table.delete")}
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Setup Info Box */}
                <div className="bg-muted/40 p-6 rounded-2xl border border-dashed border-border">
                    <div className="flex items-start gap-4">
                        <div className="bg-muted p-3 rounded-xl border border-border shrink-0">
                            <Info className="h-6 w-6 text-primary" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-bold text-foreground">{t("info.title")}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {t.rich("info.body", { appName: branding.appName, b: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
                            </p>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {t.rich("info.requirements", { b: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

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
