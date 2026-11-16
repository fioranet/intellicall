"use client";

import { useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Field,
    Input,
    toast,
} from "@wixzel/react";
import { UploadSimple } from "@phosphor-icons/react";
import Papa from "papaparse";
import axios from "axios";
import { leadPhoneSummary } from "@/lib/phone-checks";
import { FormIssues, type FormIssue } from "@/components/ui/form-issues";

import { useTranslations } from "next-intl";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function ImportCsvDialog({ onSuccess }: { onSuccess?: () => void }) {
    const t = useTranslations("leads");
    const c = useTranslations("common");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [tags, setTags] = useState("");
    // The file's number problems, shown as soon as it is picked rather than after the calls fail.
    const [issues, setIssues] = useState<FormIssue[]>([]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIssues([]);
        if (e.target.files && e.target.files[0]) {
            const picked = e.target.files[0];
            setFile(picked);
            Papa.parse(picked, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const rows = results.data as Record<string, string>[];
                    const hasPhoneColumn = (results.meta.fields || []).includes("phone");
                    const found: FormIssue[] = [];
                    if (rows.length > 0 && !hasPhoneColumn) {
                        found.push({ level: "error", message: t("importCsv.issues.noPhoneColumn") });
                    }
                    const missing = rows.filter((r) => !String(r.phone || "").trim()).length;
                    if (missing > 0 && hasPhoneColumn) {
                        found.push({ level: "warning", message: t("importCsv.issues.rowsWithoutPhone", { count: missing }) });
                    }
                    setIssues([...found, ...leadPhoneSummary(rows.map((r) => String(r.phone || "")).filter((p) => p.trim()), c)]);
                },
            });
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
                    setIssues([]);
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
                <Button variant="secondary" iconStart={<UploadSimple />}>
                    {t("importCsv.trigger")}
                </Button>
            </DialogTrigger>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>{t("importCsv.title")}</DialogTitle>
                    <DialogDescription>
                        {t("importCsv.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-4">
                        <Field
                            id="csv-file"
                            label={t("importCsv.fileLabel")}
                            hint={file ? `${t("importCsv.selected")} ${file.name}` : undefined}
                        >
                            {/* Wixzel has no file picker yet: a filled Input with the native button blended in. */}
                            <Input
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                                required
                                className="file:me-3 file:cursor-pointer file:border-0 file:bg-transparent file:font-medium file:text-fg"
                            />
                            <FormIssues issues={issues} />
                        </Field>
                        <Field id="bulk-tags" label={t("importCsv.tagsLabel")}>
                            <Input
                                placeholder={t("importCsv.tagsPlaceholder")}
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                            />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" variant="primary" loading={loading}>
                            {loading ? "Uploading..." : "Upload"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
