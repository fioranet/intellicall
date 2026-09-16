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
import axios from "axios";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CustomFieldsEditor, sanitizeCustomFields, type CustomFieldRow } from "./custom-fields-editor";

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
                <Button><Plus className="h-4 w-4" />{t("add.trigger")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t("add.title")}</DialogTitle>
                    <DialogDescription>
                        {t("add.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">{t("add.nameLabel")}</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder={t("add.namePlaceholder")}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="phone">{t("add.phoneLabel")}</Label>
                            <Input
                                id="phone"
                                type="tel"
                                value={formData.phone}
                                onChange={(e) =>
                                    setFormData({ ...formData, phone: e.target.value })
                                }
                                placeholder="+1234567890"
                                required
                            />
                        </div>
                        <CustomFieldsEditor fields={customFields} onChange={setCustomFields} idPrefix="add-field" />
                        <div className="grid gap-2">
                            <Label htmlFor="tags">{t("add.tagsLabel")}</Label>
                            <Input
                                id="tags"
                                value={formData.tags}
                                onChange={(e) =>
                                    setFormData({ ...formData, tags: e.target.value })
                                }
                                placeholder={t("add.tagsPlaceholder")}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : "Save Lead"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
