"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import axios from "axios";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, ArrowRight, CheckCircle2, RefreshCw, Zap, LogOut } from "lucide-react";
import { useSettings } from "@/components/settings-provider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function GoogleSheetsDialog({ onSuccess, syncing, trigger }: { onSuccess?: () => void, syncing?: boolean, trigger?: React.ReactNode }) {
    const t = useTranslations("leads");
    const c = useTranslations("common");
    const { googleSheetsConnected, googleSheetsConfig, refreshSettings } = useSettings();
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
        if (!confirm("Are you sure you want to disconnect Google Sheets? This will clear your saved sync configuration.")) return;

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
                        variant="outline"
                        className={`gap-2 transition-all ${googleSheetsConnected ? 'border-green-200 hover:border-green-400 hover:bg-green-50' : ''} ${syncing ? 'bg-green-50 border-green-400' : ''}`}
                        disabled={syncing}
                    >
                        {syncing ? (
                            <>
                                <RefreshCw className="h-4 w-4 text-green-600 animate-spin" />
                                {t("googleSheets.syncing")}
                            </>
                        ) : (
                            <>
                                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                                {googleSheetsConfig?.sheetName || t("googleSheets.defaultLabel")}
                            </>
                        )}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-green-600" />
                        {t("googleSheets.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("googleSheets.description")}
                    </DialogDescription>
                </DialogHeader>

                {!googleSheetsConnected ? (
                    <div className="py-12 text-center space-y-6">
                        <div className="bg-green-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                            <FileSpreadsheet className="h-10 w-10 text-green-600" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold">{t("googleSheets.connectTitle")}</h3>
                            <p className="text-sm text-muted-foreground px-8">
                                {t("googleSheets.connectDescription")}
                            </p>
                        </div>
                        <Button
                            className="bg-green-600 hover:bg-green-700 h-11 px-8 shadow-lg shadow-green-100"
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
                    </div>
                ) : (
                    <div className="space-y-6 py-4">
                        {step === 1 && (
                            <div className="space-y-4">
                                {googleSheetsConfig?.spreadsheetId && (
                                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border border-green-100 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                                                <span className="text-sm font-semibold text-green-900">{t("googleSheets.quickSyncReady")}</span>
                                            </div>
                                            {googleSheetsConfig.lastSynced && (
                                                <span className="text-[10px] text-green-600 font-medium bg-white px-2 py-0.5 rounded-full border border-green-100">
                                                    {t("googleSheets.lastSynced", { date: new Date(googleSheetsConfig.lastSynced).toLocaleDateString() })}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-green-700">
                                            {t.rich("googleSheets.previouslyConnected", { sheet: googleSheetsConfig.sheetName, b: (chunks) => <b>{chunks}</b> })}
                                        </p>
                                        <Button
                                            onClick={handleQuickSync}
                                            disabled={loading}
                                            className="w-full bg-green-600 hover:bg-green-700 shadow-md shadow-green-100"
                                        >
                                            {loading ? <Loader2 className="animate-spin h-4 w-4 me-2" /> : <RefreshCw className="h-4 w-4 me-2" />}
                                            {t("googleSheets.syncNow")}
                                        </Button>
                                    </div>
                                )}


                                <div className="space-y-3">
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                                        {googleSheetsConfig?.spreadsheetId ? t("googleSheets.orStartFresh") : t("googleSheets.selectSpreadsheet")}
                                    </Label>
                                    <Select
                                        value={selectedSpreadsheet}
                                        onValueChange={(val) => {
                                            setSelectedSpreadsheet(val);
                                            fetchSheets(val);
                                        }}
                                    >
                                        <SelectTrigger className="h-11">
                                            <SelectValue placeholder={loading ? "Searching files..." : "Choose a spreadsheet"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {spreadsheets.map((s) => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label>{t("googleSheets.selectSheet")}</Label>
                                    <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                                        <SelectTrigger className="h-11">
                                            <SelectValue placeholder={t("googleSheets.chooseSheet")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {sheets.map((name) => (
                                                <SelectItem key={name} value={name}>{name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button className="w-full h-11" disabled={!selectedSheet} onClick={() => setStep(3)}>
                                    {t("googleSheets.configureMapping")} <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                                </Button>
                                <Button variant="ghost" className="w-full text-xs" onClick={() => setStep(1)}>{t("googleSheets.back")}</Button>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-4">
                                <div className="bg-blue-50/50 p-3 rounded-lg text-xs text-blue-700 flex gap-2 border border-blue-100">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    {t("googleSheets.mappingHint")}
                                </div>
                                <div className="grid gap-3">
                                    <div className="grid gap-1.5">
                                        <Label className="text-xs font-bold">{t("googleSheets.nameColumn")}</Label>
                                        <Input placeholder={t("googleSheets.namePlaceholder")} value={mapping.name} onChange={(e: any) => setMapping({ ...mapping, name: e.target.value })} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label className="text-xs font-bold">{t("googleSheets.phoneColumn")}</Label>
                                        <Input placeholder={t("googleSheets.phonePlaceholder")} value={mapping.phone} onChange={(e: any) => setMapping({ ...mapping, phone: e.target.value })} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label className="text-xs font-bold">{t("googleSheets.companyColumn")}</Label>
                                        <Input placeholder={t("googleSheets.companyPlaceholder")} onChange={(e: any) => setMapping({ ...mapping, fields: { ...mapping.fields, company: e.target.value } })} />
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-lg border border-dashed">
                                    <Checkbox id="save-config" checked={saveConfig} onCheckedChange={(val: boolean) => setSaveConfig(val)} />
                                    <label htmlFor="save-config" className="text-xs font-medium leading-none cursor-pointer">
                                        {t("googleSheets.saveForQuickSync")}
                                    </label>
                                </div>

                                <Button className="w-full h-11" disabled={loading || !mapping.name || !mapping.phone} onClick={handleSync}>
                                    {loading ? <Loader2 className="animate-spin h-4 w-4 me-2" /> : <RefreshCw className="h-4 w-4 me-2" />}
                                    {t("googleSheets.initialSync")}
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {googleSheetsConnected && (
                    <DialogFooter className="sm:justify-between border-t pt-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                {t("googleSheets.connectedToGoogle")}
                            </div>
                            <button
                                onClick={handleDisconnect}
                                className="text-[10px] text-red-600 hover:underline font-bold uppercase tracking-tight"
                            >
                                {t("googleSheets.disconnect")}
                            </button>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>{c("actions.close")}</Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog >
    );
}
