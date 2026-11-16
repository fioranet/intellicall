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
    Field,
    Input,
    toast,
} from "@wixzel/react";
import axios from "axios";
import { Globe } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export interface KbDraftPrefill {
    name: string;
    description: string;
    basicInfo: string;
    faqs: { question: string; answer: string }[];
    otherInfo: string;
}

interface KbFromWebsiteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onGenerated: (draft: KbDraftPrefill, warnings: string[]) => void;
}

export function KbFromWebsiteDialog({ open, onOpenChange, onGenerated }: KbFromWebsiteDialogProps) {
    const t = useTranslations("knowledge");
    const c = useTranslations("common");
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = url.trim();
        if (!trimmed) {
            toast.error(t("toast.urlRequired"));
            return;
        }
        let parsed: URL;
        try {
            parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
        } catch {
            toast.error(t("toast.urlInvalid"));
            return;
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            toast.error(t("toast.urlScheme"));
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.post(
                `${API_BASE_URL}/knowledge-base/from-website`,
                { url: parsed.href },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data?.status !== "success" || !res.data?.data?.draft) {
                toast.error(res.data?.message || t("toast.draftFailed"));
                return;
            }
            const { draft, warnings = [] } = res.data.data;
            onGenerated(
                {
                    name: draft.name || "",
                    description: draft.description || "",
                    basicInfo: draft.basicInfo || "",
                    faqs: Array.isArray(draft.faqs) ? draft.faqs : [],
                    otherInfo: draft.otherInfo || "",
                },
                warnings
            );
            setUrl("");
            onOpenChange(false);
            toast.success(t("toast.draftReady"));
        } catch (err: unknown) {
            const ax = err as { response?: { data?: { message?: string }; status?: number } };
            const msg = ax.response?.data?.message || "Failed to import from website";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Globe className="size-5 text-accent-ink" />
                        {t("fromWebsite.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("fromWebsite.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <Field id="kb-import-url" label={t("fromWebsite.urlLabel")}>
                        <Input
                            type="url"
                            inputMode="url"
                            placeholder="https://www.yourbusiness.com"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={loading}
                            autoComplete="url"
                        />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" variant="primary" loading={loading}>
                            {loading ? t("fromWebsite.generating") : t("fromWebsite.generate")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
