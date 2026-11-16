"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback, useRef } from "react";
import {
    Alert,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CopyField,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    EmptyState,
    PageHeader,
    Section,
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
import { Plus, Hash, DotsThreeVertical, PencilSimple, Trash, Gear, User, Phone, HardDrives, Lightning } from "@phosphor-icons/react";
import axios from "axios";
import { PhoneNumberDialog } from "@/components/numbers/phone-number-dialog";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function PhoneNumbersPage() {
    const t = useTranslations("numbers");
    const confirm = useConfirm();
    const [numbers, setNumbers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedNumber, setSelectedNumber] = useState<any>(null);
    const [isTwilioConfigured, setIsTwilioConfigured] = useState(true);
    const [configStatus, setConfigStatus] = useState({
        isElevenLabsConfigured: true,
        isDeepgramConfigured: true,
        isModelConfigured: true
    });
    const [sipOriginationUri, setSipOriginationUri] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        try {
            const u = localStorage.getItem("user");
            if (u) {
                const parsed = JSON.parse(u);
                setIsAdmin(Boolean(parsed.role === "admin" || parsed.isSuperAdmin));
            }
        } catch {}
    }, []);

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
        if (!(await confirm({ title: "Are you sure you want to remove this phone number?", tone: "danger" }))) return;
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
        const phoneToCall = prompt("Enter the phone number to call (with country code, e.g. +1234567890):");
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
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("subtitle")}
                actions={
                    <Button variant="primary" onClick={handleAdd} iconStart={<Plus />} className="w-full md:w-auto">
                        {t("addNumber")}
                    </Button>
                }
            />

            {(!configStatus.isElevenLabsConfigured || !configStatus.isDeepgramConfigured || !configStatus.isModelConfigured) && (
                <Alert
                    tone="warning"
                    icon={<Lightning />}
                    title={t("alerts.aiNotConfiguredTitle")}
                    action={
                        <Button size="sm" asChild>
                            <Link href="/settings">{t("alerts.configureAiKeys")}</Link>
                        </Button>
                    }
                >
                    {t("alerts.aiNotConfiguredBody")}
                </Alert>
            )}

            {!isTwilioConfigured && hasTwilioNumbers && (
                <Alert
                    tone="danger"
                    icon={<Gear />}
                    title={t("alerts.twilioNotConfiguredTitle")}
                    action={
                        <Button size="sm" asChild>
                            <Link href="/settings">{t("alerts.configureNow")}</Link>
                        </Button>
                    }
                >
                    {t("alerts.twilioNotConfiguredBody")}
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Hash className="size-5 text-accent-ink" />
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
                ) : numbers.length === 0 ? (
                    <EmptyState
                        icon={<Hash />}
                        title={t("list.emptyTitle")}
                        description={t("list.emptyDescription")}
                        actions={
                            <Button onClick={handleAdd} iconStart={<Plus />}>
                                {t("addNumber")}
                            </Button>
                        }
                    />
                ) : (
                    <Table frameClassName="mt-3">
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("table.friendlyName")}</TableHead>
                                <TableHead>{t("table.phoneNumber")}</TableHead>
                                <TableHead>{t("table.provider")}</TableHead>
                                <TableHead>{t("table.inboundAgent")}</TableHead>
                                <TableHead>{t("table.testCall")}</TableHead>
                                <TableHead align="end">{t("table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {numbers.map((number) => (
                                <TableRow key={number._id}>
                                    <TableCell className="py-3 font-semibold">
                                        {number.name}
                                    </TableCell>
                                    <TableCell className="py-3 font-mono text-fg-muted">
                                        <span className="ltr-data">{number.phoneNumber}</span>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        {number.provider === "sip" ? (
                                            <div className="flex flex-col gap-1">
                                                <Badge tone="accent">
                                                    {t("table.sipTrunk")}
                                                </Badge>
                                                {number.sipTrunkId && (
                                                    <span className="flex items-center gap-1 text-caption text-fg-muted">
                                                        <HardDrives className="size-3" />
                                                        {typeof number.sipTrunkId === "object"
                                                            ? number.sipTrunkId.name
                                                            : t("table.linked")}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <Badge>
                                                {t("table.twilio")}
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        {number.inboundAgentId ? (
                                            <div className="flex items-center gap-2">
                                                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                                    <User className="size-3.5" />
                                                </span>
                                                <div>
                                                    <span className="font-medium">
                                                        {typeof number.inboundAgentId === "object"
                                                            ? number.inboundAgentId.name
                                                            : t("table.assigned")}
                                                    </span>
                                                    {number.fallbackNumber && (
                                                        <p className="text-caption text-fg-muted">
                                                            {t("table.fallback", { number: number.fallbackNumber })}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <span className="text-body-sm italic text-fg-muted">{t("table.noAgent")}</span>
                                                {number.fallbackNumber && (
                                                    <p className="text-caption text-fg-muted">
                                                        {t("table.forwardsTo", { number: number.fallbackNumber })}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <Button
                                            size="sm"
                                            onClick={() => handleTestCall(number)}
                                            loading={testingNumberId === number._id}
                                            iconStart={<Phone />}
                                        >
                                            {testingNumberId === number._id ? "Calling..." : "Test Call"}
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
                                                <DropdownMenuItem onClick={() => handleEdit(number)}>
                                                    <PencilSimple />
                                                    {t("table.edit")}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem tone="danger" onClick={() => handleDelete(number._id)}>
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

            {/* Info Boxes — show relevant ones */}
            <div className="grid gap-4">
                {/* Twilio info (always show unless user only has SIP numbers) */}
                {(!hasSipNumbers || hasTwilioNumbers) && (
                    <Section icon={<Phone />} title={t("twilioInfo.title")}>
                        <div className="flex flex-col gap-2 text-body-sm text-fg-muted">
                            <p>
                                {t.rich("twilioInfo.body", { b: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong> })}
                            </p>
                            <CopyField dir="ltr" value={`${API_BASE_URL.replace(/\/+$/, '')}/twilio/voice`} />
                            <p>{t("twilioInfo.afterCode")}</p>
                        </div>
                    </Section>
                )}

                {/* SIP info (show when there are SIP numbers or none yet to educate) */}
                {isAdmin && (
                    <Section icon={<HardDrives />} title={t("sipInfo.title")}>
                        <div className="flex flex-col items-start gap-3 text-body-sm text-fg-muted">
                            <p>
                                {t.rich("sipInfo.body", { b: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong> })}
                            </p>
                            {sipOriginationUri && (
                                <div className="flex w-full flex-col gap-1.5">
                                    <p>
                                        {t.rich("sipInfo.originationBody", { b: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong> })}
                                    </p>
                                    {/* Not a secret, so the only button in the field is Copy. */}
                                    <CopyField
                                        dir="ltr"
                                        value={sipOriginationUri}
                                        onClickCapture={(e) => {
                                            if ((e.target as HTMLElement).closest("button")) toast.success(t("toast.uriCopied"));
                                        }}
                                    />
                                </div>
                            )}
                            <Button size="sm" asChild iconStart={<HardDrives />}>
                                <Link href="/sip-trunks">
                                    {t("sipInfo.manageTrunks")}
                                </Link>
                            </Button>
                        </div>
                    </Section>
                )}
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
