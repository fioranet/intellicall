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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tag } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

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
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Tag className="h-5 w-5" />
                        {t("bulkTag.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("bulkTag.description", { count: selectedIds.length })}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="bulk-add-tags">{t("bulkTag.tagsLabel")}</Label>
                            <Input
                                id="bulk-add-tags"
                                placeholder={t("bulkTag.tagsPlaceholder")}
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Adding..." : "Add Tags"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
