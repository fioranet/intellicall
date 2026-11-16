"use client";

import { useEffect, useState } from "react";
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
import { CustomFieldsEditor, sanitizeCustomFields, type CustomFieldRow } from "./custom-fields-editor";
import { leadPhoneIssue } from "@/lib/phone-checks";
import { FormIssues, hasErrors } from "@/components/ui/form-issues";

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

    const phoneIssue = leadPhoneIssue(formData.phone, c);
    const issues = phoneIssue ? [phoneIssue] : [];

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
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>{t("edit.title")}</DialogTitle>
                    <DialogDescription>
                        {t("edit.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-4">
                        <Field id="edit-name" label={t("edit.nameLabel")}>
                            <Input
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder={t("edit.namePlaceholder")}
                                required
                            />
                        </Field>
                        <Field id="edit-phone" label={t("edit.phoneLabel")}>
                            <Input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) =>
                                    setFormData({ ...formData, phone: e.target.value })
                                }
                                placeholder="+1234567890"
                                required
                            />
                            <FormIssues issues={issues} />
                        </Field>
                        <CustomFieldsEditor fields={customFields} onChange={setCustomFields} idPrefix="edit-field" />
                        <Field id="edit-tags" label={t("edit.tagsLabel")}>
                            <Input
                                value={formData.tags}
                                onChange={(e) =>
                                    setFormData({ ...formData, tags: e.target.value })
                                }
                                placeholder={t("edit.tagsPlaceholder")}
                            />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" variant="primary" loading={loading} disabled={hasErrors(issues)}>
                            {loading ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
