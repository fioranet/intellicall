"use client";

import { useEffect, useState } from "react";
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
import axios from "axios";
import { toast } from "sonner";
import { CustomFieldsEditor, sanitizeCustomFields, type CustomFieldRow } from "./custom-fields-editor";

import { useTranslations } from "next-intl";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface Lead {
    _id: string;
    name: string;
    phone: string;
    fields: Array<{ name: string; value: any }>;
    tags: string[];
}

interface EditLeadDialogProps {
    lead: Lead;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function EditLeadDialog({ lead, open, onOpenChange, onSuccess }: EditLeadDialogProps) {
    const t = useTranslations("leads");
    const c = useTranslations("common");
    const [loading, setLoading] = useState(false);
    const toFieldRows = (l: Lead): CustomFieldRow[] =>
        (l.fields || []).map(f => ({ name: f.name, value: f.value == null ? "" : String(f.value) }));
    const [formData, setFormData] = useState({
        name: lead.name,
        phone: lead.phone,
        tags: lead.tags?.join(", ") || "",
    });
    const [customFields, setCustomFields] = useState<CustomFieldRow[]>(toFieldRows(lead));

    // Update form data when lead prop changes
    useEffect(() => {
        setFormData({
            name: lead.name,
            phone: lead.phone,
            tags: lead.tags?.join(", ") || "",
        });
        setCustomFields(toFieldRows(lead));
    }, [lead]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const tagsArray = formData.tags
                .split(",")
                .map((tag) => tag.trim())
                .filter((tag) => tag !== "");

            await axios.patch(`${API_BASE_URL}/leads/${lead._id}`, {
                name: formData.name,
                phone: formData.phone,
                fields: sanitizeCustomFields(customFields),
                tags: tagsArray
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            toast.success(t("toast.updated"));
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.updateFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t("edit.title")}</DialogTitle>
                    <DialogDescription>
                        {t("edit.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">{t("edit.nameLabel")}</Label>
                            <Input
                                id="edit-name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder={t("edit.namePlaceholder")}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-phone">{t("edit.phoneLabel")}</Label>
                            <Input
                                id="edit-phone"
                                type="tel"
                                value={formData.phone}
                                onChange={(e) =>
                                    setFormData({ ...formData, phone: e.target.value })
                                }
                                placeholder="+1234567890"
                                required
                            />
                        </div>
                        <CustomFieldsEditor fields={customFields} onChange={setCustomFields} idPrefix="edit-field" />
                        <div className="grid gap-2">
                            <Label htmlFor="edit-tags">{t("edit.tagsLabel")}</Label>
                            <Input
                                id="edit-tags"
                                value={formData.tags}
                                onChange={(e) =>
                                    setFormData({ ...formData, tags: e.target.value })
                                }
                                placeholder={t("edit.tagsPlaceholder")}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
