"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import axios from "axios";
import { Plus, Trash2, HelpCircle, Info, FileText, AlertTriangle } from "lucide-react";
import type { KbDraftPrefill } from "@/components/knowledge-base/kb-from-website-dialog";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface FAQ {
    question: string;
    answer: string;
}

interface KnowledgeBase {
    _id: string;
    name: string;
    description: string;
    basicInfo: string;
    faqs: FAQ[];
    otherInfo: string;
}

interface KBDialogProps {
    kb?: KnowledgeBase;
    trigger?: React.ReactNode;
    onSuccess?: () => void;
    /** Controlled open (omit for legacy trigger-only usage) */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Applied when opening in create mode; merge into empty form */
    prefill?: KbDraftPrefill | null;
    /** Shown after website import (non-blocking) */
    importWarnings?: string[];
}

const emptyCreateForm = {
    name: "",
    description: "",
    basicInfo: "",
    otherInfo: "",
    faqs: [] as FAQ[],
};

export function KBDialog({
    kb,
    trigger,
    onSuccess,
    open: controlledOpen,
    onOpenChange,
    prefill,
    importWarnings,
}: KBDialogProps) {
    const t = useTranslations("knowledge");
    const c = useTranslations("common");
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;

    const setOpen = (next: boolean) => {
        onOpenChange?.(next);
        if (!isControlled) setInternalOpen(next);
    };

    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: kb?.name || "",
        description: kb?.description || "",
        basicInfo: kb?.basicInfo || "",
        otherInfo: kb?.otherInfo || "",
        faqs: kb?.faqs || ([] as FAQ[]),
    });

    const prefillKey = useMemo(() => (prefill ? JSON.stringify(prefill) : ""), [prefill]);

    useEffect(() => {
        if (!open) return;
        if (kb) {
            setFormData({
                name: kb.name,
                description: kb.description || "",
                basicInfo: kb.basicInfo || "",
                otherInfo: kb.otherInfo || "",
                faqs: kb.faqs || [],
            });
            return;
        }
        if (prefillKey) {
            const p = prefill!;
            setFormData({
                name: p.name || "",
                description: p.description || "",
                basicInfo: p.basicInfo || "",
                otherInfo: p.otherInfo || "",
                faqs: p.faqs?.length ? [...p.faqs] : [],
            });
            return;
        }
        setFormData({ ...emptyCreateForm, faqs: [] });
    }, [open, kb?._id, prefillKey, kb]);

    const handleAddFAQ = () => {
        setFormData({
            ...formData,
            faqs: [...formData.faqs, { question: "", answer: "" }],
        });
    };

    const handleRemoveFAQ = (index: number) => {
        const newFaqs = [...formData.faqs];
        newFaqs.splice(index, 1);
        setFormData({ ...formData, faqs: newFaqs });
    };

    const handleFAQChange = (index: number, field: keyof FAQ, value: string) => {
        const newFaqs = [...formData.faqs];
        newFaqs[index][field] = value;
        setFormData({ ...formData, faqs: newFaqs });
    };

    const isEditing = !!kb;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            if (isEditing) {
                await axios.patch(`${API_BASE_URL}/knowledge-base/${kb._id}`, formData, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                toast.success(t("toast.updated"));
            } else {
                await axios.post(`${API_BASE_URL}/knowledge-base`, formData, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                toast.success(t("toast.created"));
            }
            setOpen(false);
            onSuccess?.();
        } catch (err: unknown) {
            const ax = err as { response?: { data?: { message?: string } } };
            toast.error(ax.response?.data?.message || t("toast.generic"));
        } finally {
            setLoading(false);
        }
    };

    const showTrigger = !isControlled || trigger !== undefined;
    const triggerNode =
        trigger !== undefined ? trigger : <Button><Plus className="h-4 w-4 me-2" />{t("create.trigger")}</Button>;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {showTrigger && <DialogTrigger asChild>{triggerNode}</DialogTrigger>}
            <DialogContent className="sm:max-w-[700px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
                    <DialogDescription>
                        {t("dialog.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="max-h-[70vh] overflow-y-auto px-1 py-4 space-y-6">
                        {!isEditing && importWarnings && importWarnings.length > 0 && (
                            <Alert variant="default" className="border-amber-500/40 bg-amber-500/5">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                <AlertTitle className="text-sm">{t("dialog.importNotes")}</AlertTitle>
                                <AlertDescription className="text-xs text-muted-foreground">
                                    <ul className="list-disc ps-4 space-y-1 mt-1">
                                        {importWarnings.map((w, i) => (
                                            <li key={i}>{w}</li>
                                        ))}
                                    </ul>
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="kb-name">{t("dialog.nameLabel")}</Label>
                                <Input
                                    id="kb-name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={t("dialog.namePlaceholder")}
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="kb-desc">{t("dialog.descriptionLabel")}</Label>
                                <Input
                                    id="kb-desc"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder={t("dialog.descriptionPlaceholder")}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="space-y-4 pt-2 border-t">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
                                    <Info className="h-4 w-4" />
                                </div>
                                <Label className="text-sm font-bold uppercase tracking-wider">{t("dialog.basicInfoLabel")}</Label>
                            </div>
                            <Textarea
                                value={formData.basicInfo}
                                onChange={(e) => setFormData({ ...formData, basicInfo: e.target.value })}
                                placeholder={t("dialog.basicInfoPlaceholder")}
                                rows={4}
                                disabled={loading}
                                className="bg-muted/30"
                            />
                        </div>

                        <div className="space-y-4 pt-2 border-t">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
                                        <HelpCircle className="h-4 w-4" />
                                    </div>
                                    <Label className="text-sm font-bold uppercase tracking-wider">
                                        {t("dialog.faqsLabel")}
                                    </Label>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddFAQ}
                                    disabled={loading}
                                    className="h-7 text-[10px] font-bold uppercase"
                                >
                                    <Plus className="me-1 h-3 w-3" /> {t("dialog.addFaq")}
                                </Button>
                            </div>

                            <div className="space-y-4">
                                {formData.faqs.map((faq, index) => (
                                    <div key={index} className="grid gap-3 p-4 rounded-xl border bg-muted/20 relative group">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-2 end-2 h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleRemoveFAQ(index)}
                                            disabled={loading}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                        <div className="grid gap-1.5">
                                            <Label className="text-xs font-semibold text-muted-foreground uppercase">
                                                {t("dialog.questionLabel", { number: index + 1 })}
                                            </Label>
                                            <Input
                                                value={faq.question}
                                                onChange={(e) => handleFAQChange(index, "question", e.target.value)}
                                                placeholder={t("dialog.questionPlaceholder")}
                                                required
                                                className="bg-background"
                                            />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label className="text-xs font-semibold text-muted-foreground uppercase">
                                                {t("dialog.answerLabel")}
                                            </Label>
                                            <Textarea
                                                value={faq.answer}
                                                onChange={(e) => handleFAQChange(index, "answer", e.target.value)}
                                                placeholder={t("dialog.answerPlaceholder")}
                                                rows={2}
                                                required
                                                className="bg-background"
                                            />
                                        </div>
                                    </div>
                                ))}
                                {formData.faqs.length === 0 && (
                                    <div className="text-center py-8 rounded-xl border border-dashed bg-muted/5">
                                        <p className="text-xs text-muted-foreground italic">
                                            {t("dialog.noFaqs")}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4 pt-2 border-t">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                                    <FileText className="h-4 w-4" />
                                </div>
                                <Label className="text-sm font-bold uppercase tracking-wider">{t("dialog.otherInfoLabel")}</Label>
                            </div>
                            <Textarea
                                value={formData.otherInfo}
                                onChange={(e) => setFormData({ ...formData, otherInfo: e.target.value })}
                                placeholder={t("dialog.otherInfoPlaceholder")}
                                rows={4}
                                disabled={loading}
                                className="bg-muted/30"
                            />
                        </div>
                    </div>
                    <DialogFooter className="pt-4 border-t">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading
                                ? isEditing
                                    ? t("dialog.updating")
                                    : t("dialog.creating")
                                : isEditing
                                  ? t("dialog.save")
                                  : t("dialog.create")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
