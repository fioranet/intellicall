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
import { Tag } from "@phosphor-icons/react";
import axios from "axios";

import { useTranslations } from "next-intl";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface BulkTagDialogProps {
    selectedIds: string[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function BulkTagDialog({ selectedIds, open, onOpenChange, onSuccess }: BulkTagDialogProps) {
    const t = useTranslations("leads");
    const c = useTranslations("common");
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tags.trim()) {
            toast.error(t("toast.tagRequired"));
            return;
        }

        const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag !== "");

        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            await axios.patch(`${API_BASE_URL}/leads/bulk/tags`, {
                ids: selectedIds,
                tags: tagsArray
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            toast.success(t("toast.tagsAdded", { count: selectedIds.length }));
            onSuccess();
            setTags("");
            onOpenChange(false);
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.tagsFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Tag className="size-5 text-fg-muted" />
                        {t("bulkTag.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("bulkTag.description", { count: selectedIds.length })}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <Field id="bulk-add-tags" label={t("bulkTag.tagsLabel")}>
                        <Input
                            placeholder={t("bulkTag.tagsPlaceholder")}
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" variant="primary" loading={loading}>
                            {loading ? "Adding..." : "Add Tags"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
