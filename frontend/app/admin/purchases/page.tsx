"use client";

import { useTranslations } from "next-intl";
import {
    ShoppingBag,
    Search,
    Download,
    ExternalLink,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2
} from "lucide-react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AdminNav } from "@/components/admin/nav";
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { getCurrencySymbol } from "@/lib/currency-symbols";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export default function AdminPurchasesPage() {
    const t = useTranslations("admin");
    const [purchases, setPurchases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchPurchases = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/admin/purchases`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setPurchases(response.data.data.purchases);
            }
        } catch (err: any) {
            toast.error(t("purchases.toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPurchases();
    }, []);

    const handleExportCSV = () => {
        if (purchases.length === 0) {
            toast.error(t("purchases.toast.noExportData"));
            return;
        }

        const headers = ["User", "Email", "Plan", "Amount", "Currency", "Gateway", "Status", "Date"];
        const csvContent = [
            headers.join(","),
            ...purchases.map(p => [
                `"${p.user?.name || ''}"`,
                `"${p.user?.email || ''}"`,
                `"${p.plan?.name || ''}"`,
                p.amount,
                p.currency,
                p.paymentGateway,
                p.status,
                new Date(p.createdAt).toLocaleDateString()
            ].join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `purchases_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora">{t("purchases.title")}</h1>
                    <p className="text-muted-foreground">{t("purchases.subtitle")}</p>
                </div>
                <Button variant="outline" onClick={handleExportCSV}>
                    <Download className="me-2 h-4 w-4" />
                    {t("purchases.exportCsv")}
                </Button>
            </div>

            <AdminNav currentPath="/admin/purchases" />

            <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
                <CardHeader className="bg-card border-b border-border">
                    <CardTitle className="text-lg font-bold">{t("purchases.recentTransactions")}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex h-64 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : purchases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                            <ShoppingBag className="h-12 w-12 opacity-20" />
                            <p>{t("purchases.empty")}</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="px-6 font-semibold">{t("purchases.table.user")}</TableHead>
                                    <TableHead className="font-semibold">{t("purchases.table.plan")}</TableHead>
                                    <TableHead className="font-semibold">{t("purchases.table.amount")}</TableHead>
                                    <TableHead className="font-semibold">{t("purchases.table.gateway")}</TableHead>
                                    <TableHead className="font-semibold">{t("purchases.table.status")}</TableHead>
                                    <TableHead className="px-6 py-3 font-semibold text-end">{t("purchases.table.date")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {purchases.map((purchase) => (
                                    <TableRow key={purchase._id} className="group hover:bg-muted/50 transition-colors">
                                        <TableCell className="px-6">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-foreground">{purchase.user?.name}</span>
                                                <span className="text-xs text-muted-foreground font-mono italic ltr-data">{purchase.user?.email}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">{purchase.plan?.name}</Badge>
                                        </TableCell>
                                        <TableCell className="font-bold text-foreground">
                                            {`${getCurrencySymbol(purchase.currency)}${purchase.amount}`}
                                        </TableCell>
                                        <TableCell>
                                            <span className="capitalize text-sm font-medium">{purchase.paymentGateway}</span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                {purchase.status === 'completed' ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                ) : purchase.status === 'failed' ? (
                                                    <XCircle className="h-4 w-4 text-red-500" />
                                                ) : (
                                                    <Clock className="h-4 w-4 text-amber-500" />
                                                )}
                                                <span className={`text-sm font-bold capitalize ${purchase.status === 'completed' ? 'text-green-600' :
                                                    purchase.status === 'failed' ? 'text-red-600' :
                                                        'text-amber-600'
                                                    }`}>
                                                    {purchase.status}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-end px-6 text-sm text-muted-foreground">
                                            {new Date(purchase.createdAt).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
