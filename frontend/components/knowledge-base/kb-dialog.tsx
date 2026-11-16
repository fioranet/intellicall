"use client";

import { useState, useEffect, useMemo } from "react";
import {
    Alert,
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
    Textarea,
    toast,
} from "@wixzel/react";
import axios from "axios";
import { Plus, Trash, Question, Info, FileText } from "@phosphor-icons/react";
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
        trigger !== undefined ? trigger : <Button variant="primary" iconStart={<Plus />}>{t("create.trigger")}</Button>;

    // A section's name with its icon tile, used as the label of the field under it.
    const sectionLabel = (icon: React.ReactNode, label: string) => (
        <span className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-bg-muted text-fg-muted [&_svg]:size-3.5">
                {icon}
            </span>
            {label}
        </span>
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {showTrigger && <DialogTrigger asChild>{triggerNode}</DialogTrigger>}
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>{isEditing ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
                    <DialogDescription>
                        {t("dialog.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-5">
                    {/* The sections scroll on their own so Save stays in view with many FAQs. */}
                    <div className="-mx-1 flex max-h-[65vh] flex-col gap-6 overflow-y-auto px-1 py-1">
                        {!isEditing && importWarnings && importWarnings.length > 0 && (
                            <Alert tone="warning" title={t("dialog.importNotes")}>
                                <ul className="mt-1 list-disc space-y-1 ps-4">
                                    {importWarnings.map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            </Alert>
                        )}

                        <div className="grid gap-4">
                            <Field id="kb-name" label={t("dialog.nameLabel")}>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={t("dialog.namePlaceholder")}
                                    required
                                    disabled={loading}
                                />
                            </Field>
                            <Field id="kb-desc" label={t("dialog.descriptionLabel")}>
                                <Input
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder={t("dialog.descriptionPlaceholder")}
                                    disabled={loading}
                                />
                            </Field>
                        </div>

                        <Field className="border-t border-border pt-5" label={sectionLabel(<Info />, t("dialog.basicInfoLabel"))}>
                            <Textarea
                                value={formData.basicInfo}
                                onChange={(e) => setFormData({ ...formData, basicInfo: e.target.value })}
                                placeholder={t("dialog.basicInfoPlaceholder")}
                                rows={4}
                                disabled={loading}
                            />
                        </Field>

                        <div className="flex flex-col gap-4 border-t border-border pt-5">
                            <div className="flex items-center justify-between gap-3">
                                <h4 className="text-body-sm font-medium">{sectionLabel(<Question />, t("dialog.faqsLabel"))}</h4>
                                <Button
                                    type="button"
                                    size="xs"
                                    onClick={handleAddFAQ}
                                    disabled={loading}
                                    iconStart={<Plus />}
                                >
                                    {t("dialog.addFaq")}
                                </Button>
                            </div>

                            <div className="flex flex-col gap-3">
                                {formData.faqs.map((faq, index) => (
                                    <div key={index} className="group relative grid gap-3 rounded-lg bg-card p-4">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            aria-label={c("actions.remove")}
                                            className="absolute end-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                            onClick={() => handleRemoveFAQ(index)}
                                            disabled={loading}
                                        >
                                            <Trash />
                                        </Button>
                                        <Field label={t("dialog.questionLabel", { number: index + 1 })}>
                                            <Input
                                                value={faq.question}
                                                onChange={(e) => handleFAQChange(index, "question", e.target.value)}
                                                placeholder={t("dialog.questionPlaceholder")}
                                                required
                                            />
                                        </Field>
                                        <Field label={t("dialog.answerLabel")}>
                                            <Textarea
                                                value={faq.answer}
                                                onChange={(e) => handleFAQChange(index, "answer", e.target.value)}
                                                placeholder={t("dialog.answerPlaceholder")}
                                                rows={2}
                                                required
                                            />
                                        </Field>
                                    </div>
                                ))}
                                {formData.faqs.length === 0 && (
                                    <div className="rounded-lg bg-card py-8 text-center">
                                        <p className="text-body-sm italic text-fg-muted">
                                            {t("dialog.noFaqs")}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <Field className="border-t border-border pt-5" label={sectionLabel(<FileText />, t("dialog.otherInfoLabel"))}>
                            <Textarea
                                value={formData.otherInfo}
                                onChange={(e) => setFormData({ ...formData, otherInfo: e.target.value })}
                                placeholder={t("dialog.otherInfoPlaceholder")}
                                rows={4}
                                disabled={loading}
                            />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" variant="primary" loading={loading}>
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
