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
import axios from "axios";
import { Plus } from "@phosphor-icons/react";
import { CustomFieldsEditor, sanitizeCustomFields, type CustomFieldRow } from "./custom-fields-editor";
import { leadPhoneIssue } from "@/lib/phone-checks";
import { FormIssues, hasErrors } from "@/components/ui/form-issues";

import { useTranslations } from "next-intl";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export function AddLeadDialog({ onSuccess }: { onSuccess?: () => void }) {
    const t = useTranslations("leads");
    const c = useTranslations("common");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        tags: "",
    });
    const [customFields, setCustomFields] = useState<CustomFieldRow[]>([{ name: "company", value: "" }]);

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

            await axios.post(`${API_BASE_URL}/leads`, {
                name: formData.name,
                phone: formData.phone,
                fields: sanitizeCustomFields(customFields).filter(f => f.value !== ""),
                tags: tagsArray
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            toast.success(t("toast.added"));
            setOpen(false);
            setFormData({ name: "", phone: "", tags: "" });
            setCustomFields([{ name: "company", value: "" }]);
            onSuccess?.();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.addFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="primary" iconStart={<Plus />}>{t("add.trigger")}</Button>
            </DialogTrigger>
            <DialogContent size="sm">
                <DialogHeader>
                    <DialogTitle>{t("add.title")}</DialogTitle>
                    <DialogDescription>
                        {t("add.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-4">
                        <Field id="name" label={t("add.nameLabel")}>
                            <Input
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder={t("add.namePlaceholder")}
                                required
                            />
                        </Field>
                        <Field id="phone" label={t("add.phoneLabel")}>
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
                        <CustomFieldsEditor fields={customFields} onChange={setCustomFields} idPrefix="add-field" />
                        <Field id="tags" label={t("add.tagsLabel")}>
                            <Input
                                value={formData.tags}
                                onChange={(e) =>
                                    setFormData({ ...formData, tags: e.target.value })
                                }
                                placeholder={t("add.tagsPlaceholder")}
                            />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" variant="primary" loading={loading} disabled={hasErrors(issues)}>
                            {loading ? "Saving..." : "Save Lead"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
