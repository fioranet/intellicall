"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback, useRef } from "react";
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
    Hash,
    MoreVertical,
    Edit,
    Trash2,
    Loader2,
    Info,
    Settings,
    User,
    Phone,
    Server,
    Zap,
    Copy,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import axios from "axios";
import { PhoneNumberDialog } from "@/components/numbers/phone-number-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { cn } from "@/lib/utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function PhoneNumbersPage() {
    const t = useTranslations("numbers");
    const [numbers, setNumbers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(() => {
        if (typeof window !== "undefined") {
            try {
                const stored = localStorage.getItem("user");
                return stored ? JSON.parse(stored) : null;
            } catch {
                return null;
            }
        }
        return null;
    });
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedNumber, setSelectedNumber] = useState<any>(null);
    const [isTwilioConfigured, setIsTwilioConfigured] = useState(true);
    const [configStatus, setConfigStatus] = useState({
        isElevenLabsConfigured: true,
        isDeepgramConfigured: true,
        isModelConfigured: true
    });
    const [sipOriginationUri, setSipOriginationUri] = useState('');

    const fetchNumbers = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/numbers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setNumbers(response.data.data.numbers);
            }

            // Also check Twilio config status
            const configRes = await axios.get(`${API_BASE_URL}/settings/config-status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (configRes.data?.status === "success") {
                const { isTwilioConfigured, isElevenLabsConfigured, isDeepgramConfigured, isModelConfigured, sipOriginationUri } = configRes.data.data;
                setIsTwilioConfigured(isTwilioConfigured);
                setConfigStatus({
                    isElevenLabsConfigured,
                    isDeepgramConfigured,
                    isModelConfigured
                });
                if (sipOriginationUri) setSipOriginationUri(sipOriginationUri);
            }
        } catch (err: any) {
            console.error("Failed to fetch data:", err);
            toast.error(t("toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNumbers();
    }, [fetchNumbers]);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to remove this phone number?")) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/numbers/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.removed"));
            fetchNumbers();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.deleteFailed"));
        }
    };

    const handleEdit = (number: any) => {
        setSelectedNumber(number);
        setDialogOpen(true);
    };

    const handleAdd = () => {
        setSelectedNumber(null);
        setDialogOpen(true);
    };

    const [testingNumberId, setTestingNumberId] = useState<string | null>(null);
    const sipWsRef = useRef<WebSocket | null>(null);

    // Connect WebSocket to listen for real-time SIP events (call failures, etc.)
    useEffect(() => {
        const wsBase = API_BASE_URL.replace(/^http/, "ws").replace(/\/api$/, "");
        const ws = new WebSocket(wsBase);
        sipWsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "sip:call-failed") {
                    toast.error(data.reason || t("toast.sipCallFailed"), {
                        description: "Check your SIP trunk configuration in your provider's portal.",
                        duration: 10000,
                    });
                    setTestingNumberId(null);
                }
            } catch (_) { }
        };

        ws.onerror = () => { };
        ws.onclose = () => { };

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };
    }, []);

    const handleTestCall = async (number: any) => {
        const phoneToCall = prompt("Informe o número de destino com DDI e DDD (ex: +5511999999999):");
        if (!phoneToCall) return;

        try {
            setTestingNumberId(number._id);
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/calls/test`, {
                to: phoneToCall,
                fromNumberId: number._id
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (number.provider === "sip") {
                toast.info(t("toast.sipCallInitiated"), {
                    description: "If the call doesn't ring within 15 seconds, check your SIP trunk settings.",
                    duration: 15000,
                });
                // Auto-clear loading state after 20s if no error event comes
                setTimeout(() => setTestingNumberId((prev) => prev === number._id ? null : prev), 20000);
            } else {
                toast.success(t("toast.testCallInitiated"));
                setTestingNumberId(null);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.testCallFailed"));
            setTestingNumberId(null);
        }
    };

    const hasSipNumbers = numbers.some((n) => n.provider === "sip");
    const hasTwilioNumbers = numbers.some((n) => !n.provider || n.provider === "twilio");

    return (
        <div className="flex-col md:flex">
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">{t("title")}</h1>
                        <p className="text-muted-foreground">{t("subtitle")}</p>
                    </div>
                    <Button onClick={handleAdd} className="w-full md:w-auto">
                        <Plus className="me-2 h-4 w-4" />
                        {t("addNumber")}
                    </Button>
                </div>

                {user?.operatingMode === "byok" && (!configStatus.isElevenLabsConfigured || !configStatus.isDeepgramConfigured || !configStatus.isModelConfigured) && (
                    <Alert variant="warning" className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-500/20">
                        <Zap className="h-4 w-4 text-amber-600" />
                        <AlertTitle className="text-amber-800 dark:text-amber-400">{t("alerts.aiNotConfiguredTitle")}</AlertTitle>
                        <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-amber-700 dark:text-amber-500">
                            <span>{t("alerts.aiNotConfiguredBody")}</span>
                            <Button variant="outline" size="sm" asChild className="border-amber-200 dark:border-amber-500/30 shrink-0 text-amber-700 dark:text-amber-400">
                                <Link href="/settings">{t("alerts.configureAiKeys")}</Link>
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}

                {!isTwilioConfigured && hasTwilioNumbers && (
                    <Alert variant="destructive">
                        <Settings className="h-4 w-4" />
                        <AlertTitle>{t("alerts.twilioNotConfiguredTitle")}</AlertTitle>
                        <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span>{t("alerts.twilioNotConfiguredBody")}</span>
                            <Button variant="outline" size="sm" asChild className="shrink-0">
                                <Link href="/settings">{t("alerts.configureNow")}</Link>
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Hash className="h-5 w-5 text-primary" />
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
                        ) : numbers.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                                <Hash className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-foreground">{t("list.emptyTitle")}</h3>
                                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                                    {t("list.emptyDescription")}
                                </p>
                                <Button onClick={handleAdd} variant="outline" className="rounded-full">
                                    <Plus className="me-2 h-4 w-4" />
                                    {t("addNumber")}
                                </Button>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-border overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">{t("table.friendlyName")}</TableHead>
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">{t("table.phoneNumber")}</TableHead>
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">{t("table.provider")}</TableHead>
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">{t("table.inboundAgent")}</TableHead>
                                            <TableHead className="py-4 font-bold text-muted-foreground uppercase text-[10px]">{t("table.testCall")}</TableHead>
                                            <TableHead className="py-4 text-end font-bold text-muted-foreground uppercase text-[10px]">{t("table.actions")}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {numbers.map((number) => (
                                            <TableRow key={number._id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="py-4 font-bold text-foreground">
                                                    {number.name}
                                                </TableCell>
                                                <TableCell className="py-4 font-mono text-muted-foreground">
                                                    <span className="ltr-data">{number.phoneNumber}</span>
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    {number.provider === "sip" ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            <Badge variant="outline" className="w-fit text-[9px] font-bold uppercase bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20">
                                                                {t("table.sipTrunk")}
                                                            </Badge>
                                                            {number.sipTrunkId && (
                                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                    <Server className="h-2.5 w-2.5" />
                                                                    {typeof number.sipTrunkId === "object"
                                                                        ? number.sipTrunkId.name
                                                                        : t("table.linked")}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[9px] font-bold uppercase bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">
                                                            {t("table.twilio")}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    {number.inboundAgentId ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="bg-primary/10 p-1.5 rounded-lg">
                                                                <User className="h-3.5 w-3.5 text-primary" />
                                                            </div>
                                                            <div>
                                                                <span className="font-medium">
                                                                    {typeof number.inboundAgentId === "object"
                                                                        ? number.inboundAgentId.name
                                                                        : t("table.assigned")}
                                                                </span>
                                                                {number.fallbackNumber && (
                                                                    <p className="text-[9px] text-muted-foreground">
                                                                        {t("table.fallback", { number: number.fallbackNumber })}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <span className="text-muted-foreground text-xs italic">{t("table.noAgent")}</span>
                                                            {number.fallbackNumber && (
                                                                <p className="text-[9px] text-muted-foreground">
                                                                    {t("table.forwardsTo", { number: number.fallbackNumber })}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 text-xs"
                                                        onClick={() => handleTestCall(number)}
                                                        disabled={testingNumberId === number._id}
                                                    >
                                                        {testingNumberId === number._id ? (
                                                            <Loader2 className="me-2 h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <Phone className="me-2 h-3 w-3" />
                                                        )}
                                                        {testingNumberId === number._id ? "Calling..." : "Test Call"}
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
                                                            <DropdownMenuItem onClick={() => handleEdit(number)}>
                                                                <Edit className="me-2 h-4 w-4" />
                                                                {t("table.edit")}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(number._id)}>
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

                {/* Info Boxes — show relevant ones */}
                <div className="space-y-4">
                    {/* Twilio info (always show unless user only has SIP numbers) */}
                    {(!hasSipNumbers || hasTwilioNumbers) && (
                        <div className="bg-muted/40 p-6 rounded-2xl border border-dashed border-border">
                            <div className="flex items-start gap-4">
                                <div className="bg-muted p-3 rounded-xl border border-border shrink-0">
                                    <Phone className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="font-bold text-foreground">{t("twilioInfo.title")}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {t.rich("twilioInfo.body", { b: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
                                        <code className="block mt-2 p-3 bg-muted border border-border rounded-lg font-mono text-xs text-primary" dir="ltr">
                                            {API_BASE_URL.replace(/\/+$/, '')}/twilio/voice
                                        </code>
                                        {t("twilioInfo.afterCode")}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SIP info (show when there are SIP numbers or none yet to educate) */}
                    <div className="bg-muted/40 p-6 rounded-2xl border border-dashed border-border">
                        <div className="flex items-start gap-4">
                            <div className="bg-muted p-3 rounded-xl border border-border shrink-0">
                                <Server className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-bold text-foreground">{t("sipInfo.title")}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {t.rich("sipInfo.body", { b: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
                                </p>
                                {sipOriginationUri && (
                                    <div className="mt-3 space-y-1.5">
                                        <p className="text-sm text-muted-foreground">
                                            {t.rich("sipInfo.originationBody", { b: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 p-3 bg-muted border border-border rounded-lg font-mono text-xs text-primary" dir="ltr">
                                                {sipOriginationUri}
                                            </code>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9 shrink-0"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(sipOriginationUri);
                                                    toast.success(t("toast.uriCopied"));
                                                }}
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                <Button variant="outline" size="sm" asChild className="mt-1">
                                    <Link href="/sip-trunks">
                                        <Server className="me-2 h-3.5 w-3.5" />
                                        {t("sipInfo.manageTrunks")}
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <PhoneNumberDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                phoneNumber={selectedNumber}
                onSuccess={fetchNumbers}
            />
        </div>
    );
}
