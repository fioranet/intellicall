"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import {
    Alert,
    Badge,
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    EmptyState,
    Field,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    toast,
    useConfirm,
} from "@wixzel/react";
import axios from "axios";
import { FileXls, ArrowRight, CheckCircle, ArrowsClockwise, Lightning } from "@phosphor-icons/react";
import { useSettings } from "@/components/settings-provider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function GoogleSheetsDialog({ onSuccess, syncing, trigger }: { onSuccess?: () => void, syncing?: boolean, trigger?: React.ReactNode }) {
    const t = useTranslations("leads");
    const c = useTranslations("common");
    const { googleSheetsConnected, googleSheetsConfig, refreshSettings } = useSettings();
    const confirm = useConfirm();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1); // 1: Connect/Select/Quick, 2: Select Sheet, 3: Map Columns

    const [spreadsheets, setSpreadsheets] = useState<any[]>([]);
    const [selectedSpreadsheet, setSelectedSpreadsheet] = useState("");
    const [sheets, setSheets] = useState<string[]>([]);
    const [selectedSheet, setSelectedSheet] = useState("");
    const [saveConfig, setSaveConfig] = useState(true);
    const [mapping, setMapping] = useState({
        name: "Name",
        phone: "Phone",
        fields: {} as Record<string, string>
    });

    const handleQuickSync = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/leads/google-sheets/sync-last`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(res.data.message || `Synced ${res.data.results} new leads!`);
            setOpen(false);
            onSuccess?.();
            refreshSettings();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.quickSyncFailed"));
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.post(`${API_BASE_URL}/leads/google-sheets/sync`, {
                spreadsheetId: selectedSpreadsheet,
                sheetName: selectedSheet,
                mapping,
                saveConfig
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(res.data.message || `Imported ${res.data.results} new leads!`);
            setOpen(false);
            onSuccess?.();
            refreshSettings();
            reset();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.syncFailed"));
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!(await confirm({
            title: "Are you sure you want to disconnect Google Sheets? This will clear your saved sync configuration.",
            tone: "danger",
        }))) return;

        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/leads/google-sheets/disconnect`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.sheetsDisconnected"));
            refreshSettings();
            setOpen(false);
        } catch (err: any) {
            toast.error(t("toast.disconnectFailed"));
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStep(1);
        setSelectedSpreadsheet("");
        setSelectedSheet("");
        setMapping({ name: "Name", phone: "Phone", fields: {} });
    };

    useEffect(() => {
        if (open && googleSheetsConnected && spreadsheets.length === 0) {
            fetchSpreadsheets();
        }
    }, [open, googleSheetsConnected]);

    const fetchSpreadsheets = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/leads/google-sheets/list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setSpreadsheets(res.data.data.files);
        } catch (err: any) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSheets = async (spreadsheetId: string) => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/leads/google-sheets/sheets/${spreadsheetId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setSheets(res.data.data.sheets);
            setStep(2);
        } catch (err: any) {
            toast.error(t("toast.fetchSheetsFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) reset(); }}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button
                        variant="secondary"
                        iconStart={<FileXls />}
                        loading={syncing}
                    >
                        {syncing
                            ? t("googleSheets.syncing")
                            : googleSheetsConfig?.sheetName || t("googleSheets.defaultLabel")}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileXls className="size-5 text-fg-muted" />
                        {t("googleSheets.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("googleSheets.description")}
                    </DialogDescription>
                </DialogHeader>

                {!googleSheetsConnected ? (
                    <EmptyState
                        icon={<FileXls />}
                        title={t("googleSheets.connectTitle")}
                        description={t("googleSheets.connectDescription")}
                        actions={
                            <Button
                                variant="primary"
                                onClick={() => {
                                    const userStr = localStorage.getItem("user");
                                    if (userStr) {
                                        const user = JSON.parse(userStr);
                                        window.location.href = `${API_BASE_URL}/auth/google-sheets?userId=${user._id}`;
                                    } else {
                                        toast.error(t("toast.userNotFound"));
                                    }
                                }}
                            >
                                {t("googleSheets.connectNow")}
                            </Button>
                        }
                    />
                ) : (
                    <div className="flex flex-col gap-5">
                        {step === 1 && (
                            <div className="flex flex-col gap-4">
                                {googleSheetsConfig?.spreadsheetId && (
                                    <Alert
                                        tone="success"
                                        icon={<Lightning />}
                                        title={t("googleSheets.quickSyncReady")}
                                        action={googleSheetsConfig.lastSynced && (
                                            <Badge tone="success">
                                                {t("googleSheets.lastSynced", { date: new Date(googleSheetsConfig.lastSynced).toLocaleDateString() })}
                                            </Badge>
                                        )}
                                    >
                                        <div className="flex flex-col gap-3">
                                            <p>
                                                {t.rich("googleSheets.previouslyConnected", { sheet: googleSheetsConfig.sheetName, b: (chunks) => <b>{chunks}</b> })}
                                            </p>
                                            <Button
                                                variant="primary"
                                                block
                                                iconStart={<ArrowsClockwise />}
                                                loading={loading}
                                                onClick={handleQuickSync}
                                            >
                                                {t("googleSheets.syncNow")}
                                            </Button>
                                        </div>
                                    </Alert>
                                )}

                                <Field label={googleSheetsConfig?.spreadsheetId ? t("googleSheets.orStartFresh") : t("googleSheets.selectSpreadsheet")}>
                                    <Select
                                        value={selectedSpreadsheet}
                                        onValueChange={(val) => {
                                            setSelectedSpreadsheet(val);
                                            fetchSheets(val);
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={loading ? "Searching files..." : "Choose a spreadsheet"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {spreadsheets.map((s) => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="flex flex-col gap-4">
                                <Field label={t("googleSheets.selectSheet")}>
                                    <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t("googleSheets.chooseSheet")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {sheets.map((name) => (
                                                <SelectItem key={name} value={name}>{name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <div className="flex flex-col gap-2">
                                    <Button variant="primary" block disabled={!selectedSheet} iconEnd={<ArrowRight />} onClick={() => setStep(3)}>
                                        {t("googleSheets.configureMapping")}
                                    </Button>
                                    <Button variant="ghost" block onClick={() => setStep(1)}>{t("googleSheets.back")}</Button>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="flex flex-col gap-4">
                                <Alert tone="info" icon={<CheckCircle />}>
                                    {t("googleSheets.mappingHint")}
                                </Alert>
                                <div className="flex flex-col gap-3">
                                    <Field label={t("googleSheets.nameColumn")}>
                                        <Input placeholder={t("googleSheets.namePlaceholder")} value={mapping.name} onChange={(e: any) => setMapping({ ...mapping, name: e.target.value })} />
                                    </Field>
                                    <Field label={t("googleSheets.phoneColumn")}>
                                        <Input placeholder={t("googleSheets.phonePlaceholder")} value={mapping.phone} onChange={(e: any) => setMapping({ ...mapping, phone: e.target.value })} />
                                    </Field>
                                    <Field label={t("googleSheets.companyColumn")}>
                                        <Input placeholder={t("googleSheets.companyPlaceholder")} onChange={(e: any) => setMapping({ ...mapping, fields: { ...mapping.fields, company: e.target.value } })} />
                                    </Field>
                                </div>

                                <div className="flex items-center gap-2 rounded-md bg-bg-subtle px-3 py-2.5">
                                    <Checkbox id="save-config" checked={saveConfig} onCheckedChange={(val) => setSaveConfig(val === true)} />
                                    <Label htmlFor="save-config" className="cursor-pointer">
                                        {t("googleSheets.saveForQuickSync")}
                                    </Label>
                                </div>

                                <Button
                                    variant="primary"
                                    block
                                    iconStart={<ArrowsClockwise />}
                                    loading={loading}
                                    disabled={!mapping.name || !mapping.phone}
                                    onClick={handleSync}
                                >
                                    {t("googleSheets.initialSync")}
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {googleSheetsConnected && (
                    <DialogFooter className="sm:justify-between">
                        <div className="flex items-center gap-3">
                            <Badge tone="success" dot>
                                {t("googleSheets.connectedToGoogle")}
                            </Badge>
                            <Button variant="ghost" size="xs" onClick={handleDisconnect}>
                                {t("googleSheets.disconnect")}
                            </Button>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>{c("actions.close")}</Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
