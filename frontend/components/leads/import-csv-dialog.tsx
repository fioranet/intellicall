"use client";

import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import axios from "axios";

import { useTranslations } from "next-intl";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function ImportCsvDialog({ onSuccess }: { onSuccess?: () => void }) {
    const t = useTranslations("leads");
    const c = useTranslations("common");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [tags, setTags] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            toast.error(t("toast.selectCsv"));
            return;
        }

        const bulkTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== "");

        setLoading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const token = localStorage.getItem("token");
                    const leads = results.data.map((row: any) => {
                        const { name, phone, ...rest } = row;
                        const fields = Object.entries(rest).map(([key, value]) => ({
                            name: key,
                            value
                        }));
                        return {
                            name: name || "Unknown",
                            phone: phone || "",
                            fields,
                            tags: bulkTags
                        };
                    }).filter(lead => lead.phone);

                    if (leads.length === 0) {
                        toast.error(t("toast.noValidLeads"));
                        setLoading(false);
                        return;
                    }

                    await axios.post(`${API_BASE_URL}/leads/bulk`, leads, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    toast.success(t("toast.imported", { count: leads.length }));
                    setOpen(false);
                    setFile(null);
                    setTags("");
                    onSuccess?.();
                } catch (err: any) {
                    toast.error(err.response?.data?.message || t("toast.importFailed"));
                } finally {
                    setLoading(false);
                }
            },
            error: (error) => {
                toast.error(t("toast.parseError", { message: error.message }));
                setLoading(false);
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Upload className="me-2 h-4 w-4" />
                    {t("importCsv.trigger")}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t("importCsv.title")}</DialogTitle>
                    <DialogDescription>
                        {t("importCsv.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="csv-file">{t("importCsv.fileLabel")}</Label>
                            <Input
                                id="csv-file"
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                required
                            />
                            {file && (
                                <p className="text-sm text-muted-foreground">
                                    {t("importCsv.selected")} {file.name}
                                </p>
                            )}
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="bulk-tags">{t("importCsv.tagsLabel")}</Label>
                            <Input
                                id="bulk-tags"
                                placeholder={t("importCsv.tagsPlaceholder")}
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Uploading..." : "Upload"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
