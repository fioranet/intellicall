"use client";

import { useTranslations } from "next-intl";
import { ShoppingBag, DownloadSimple } from "@phosphor-icons/react";
import {
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Button,
    Badge,
    EmptyState,
    PageHeader,
} from "@wixzel/react";
import { AdminNav } from "@/components/admin/nav";
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "@wixzel/react";
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

    const statusTone = (status: string) =>
        status === 'completed' ? "success" : status === 'failed' ? "danger" : "warning";

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("purchases.title")}
                description={t("purchases.subtitle")}
                actions={
                    <Button variant="secondary" onClick={handleExportCSV} iconStart={<DownloadSimple />}>
                        {t("purchases.exportCsv")}
                    </Button>
                }
            />

            <AdminNav currentPath="/admin/purchases" />

            <section className="flex flex-col gap-3">
                <h2 className="text-heading-sm">{t("purchases.recentTransactions")}</h2>
                {loading ? (
                    <div className="flex h-64 items-center justify-center rounded-lg bg-card">
                        <Spinner size="xl" />
                    </div>
                ) : purchases.length === 0 ? (
                    <EmptyState icon={<ShoppingBag />} title={t("purchases.empty")} />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("purchases.table.user")}</TableHead>
                                <TableHead>{t("purchases.table.plan")}</TableHead>
                                <TableHead>{t("purchases.table.amount")}</TableHead>
                                <TableHead>{t("purchases.table.gateway")}</TableHead>
                                <TableHead>{t("purchases.table.status")}</TableHead>
                                <TableHead align="end">{t("purchases.table.date")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {purchases.map((purchase) => (
                                <TableRow key={purchase._id}>
                                    <TableCell className="py-2.5">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-fg">{purchase.user?.name}</span>
                                            <span className="text-caption text-fg-muted ltr-data">{purchase.user?.email}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge>{purchase.plan?.name}</Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {`${getCurrencySymbol(purchase.currency)}${purchase.amount}`}
                                    </TableCell>
                                    <TableCell>
                                        <span className="capitalize">{purchase.paymentGateway}</span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge tone={statusTone(purchase.status)} dot className="capitalize">
                                            {purchase.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell align="end" className="text-fg-muted">
                                        {new Date(purchase.createdAt).toLocaleDateString()}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </section>
        </div>
    );
}
