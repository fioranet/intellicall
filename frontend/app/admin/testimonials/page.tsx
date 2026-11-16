"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatText, Plus, Star, Trash, PencilSimple } from "@phosphor-icons/react";
import {
    Spinner,
    Button,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    ConfirmDialog,
    Input,
    Textarea,
    Label,
    Field,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    EmptyState,
    PageHeader,
    Tooltip,
} from "@wixzel/react";
import { AdminNav } from "@/components/admin/nav";
import axios from "axios";
import { toast } from "@wixzel/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const defaultFormData = {
    quote: "",
    author: "",
    role: "",
    rating: 5,
    isActive: true,
};

export default function AdminTestimonialsPage() {
    const t = useTranslations("admin");
    const c = useTranslations("common");
    const pathname = usePathname();
    const [testimonials, setTestimonials] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingTestimonial, setEditingTestimonial] = useState<any>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ ...defaultFormData });

    const fetchTestimonials = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/admin/testimonials/all`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data?.status === "success") {
                setTestimonials(res.data.data.testimonials);
            }
        } catch {
            toast.error(t("testimonials.toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTestimonials();
    }, []);

    const openCreate = () => {
        setEditingTestimonial(null);
        setFormData({ ...defaultFormData });
        setIsModalOpen(true);
    };

    const openEdit = (testimonial: any) => {
        setEditingTestimonial(testimonial);
        setFormData({
            quote: testimonial.quote,
            author: testimonial.author,
            role: testimonial.role,
            rating: testimonial.rating,
            isActive: testimonial.isActive,
        });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.quote.trim() || !formData.author.trim() || !formData.role.trim()) {
            toast.error(t("testimonials.toast.fieldsRequired"));
            return;
        }
        try {
            setIsSaving(true);
            const token = localStorage.getItem("token");
            const headers = { Authorization: `Bearer ${token}` };

            if (editingTestimonial) {
                await axios.patch(
                    `${API_BASE_URL}/admin/testimonials/${editingTestimonial._id}`,
                    formData,
                    { headers }
                );
                toast.success(t("testimonials.toast.updated"));
            } else {
                await axios.post(`${API_BASE_URL}/admin/testimonials`, formData, { headers });
                toast.success(t("testimonials.toast.created"));
            }

            setIsModalOpen(false);
            fetchTestimonials();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("testimonials.toast.saveFailed"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (testimonial: any) => {
        try {
            const token = localStorage.getItem("token");
            await axios.patch(
                `${API_BASE_URL}/admin/testimonials/${testimonial._id}`,
                { isActive: !testimonial.isActive },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(t("testimonials.toast.visibilityChanged", { state: !testimonial.isActive ? t("testimonials.toast.shown") : t("testimonials.toast.hiddenState") }));
            fetchTestimonials();
        } catch {
            toast.error(t("testimonials.toast.visibilityFailed"));
        }
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/admin/testimonials/${deletingId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success(t("testimonials.toast.deleted"));
            setDeletingId(null);
            fetchTestimonials();
        } catch {
            toast.error(t("testimonials.toast.deleteFailed"));
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("testimonials.title")}
                description={t("testimonials.subtitle")}
                actions={
                    <Button variant="primary" iconStart={<Plus />} onClick={openCreate}>
                        {t("testimonials.add")}
                    </Button>
                }
            />

            <AdminNav currentPath={pathname} />

            {loading ? (
                <div className="flex h-64 items-center justify-center rounded-lg bg-card">
                    <Spinner size="xl" />
                </div>
            ) : testimonials.length === 0 ? (
                <EmptyState
                    icon={<ChatText />}
                    title={t("testimonials.emptyTitle")}
                    description={t("testimonials.emptyDescription")}
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("testimonials.table.quote")}</TableHead>
                            <TableHead>{t("testimonials.table.author")}</TableHead>
                            <TableHead>{t("testimonials.table.role")}</TableHead>
                            <TableHead>{t("testimonials.table.rating")}</TableHead>
                            <TableHead>{t("testimonials.table.visible")}</TableHead>
                            <TableHead align="end">{t("testimonials.table.actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {testimonials.map((item) => (
                            <TableRow key={item._id}>
                                <TableCell className="max-w-xs">
                                    <p className="text-fg-muted italic truncate max-w-[260px]">
                                        "{item.quote}"
                                    </p>
                                </TableCell>
                                <TableCell className="font-medium">{item.author}</TableCell>
                                <TableCell className="text-fg-muted">{item.role}</TableCell>
                                <TableCell>
                                    <div className="flex gap-0.5 text-accent-ink">
                                        {Array.from({ length: item.rating || 5 }, (_, i) => (
                                            <Star key={i} className="size-4" />
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Tooltip content={item.isActive ? t("testimonials.hideTitle") : t("testimonials.showTitle")}>
                                        <label className="flex w-fit cursor-pointer items-center gap-2">
                                            <Switch
                                                size="sm"
                                                checked={!!item.isActive}
                                                onCheckedChange={() => handleToggleActive(item)}
                                            />
                                            <span className={item.isActive ? "font-medium text-success-ink" : "text-fg-muted"}>
                                                {item.isActive ? t("testimonials.visible") : t("testimonials.hidden")}
                                            </span>
                                        </label>
                                    </Tooltip>
                                </TableCell>
                                <TableCell align="end">
                                    <div className="flex items-center justify-end gap-1">
                                        <Tooltip content={t("testimonials.table.editTitle")}>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => openEdit(item)}
                                                aria-label={t("testimonials.table.editTitle")}
                                            >
                                                <PencilSimple />
                                            </Button>
                                        </Tooltip>
                                        <Tooltip content={t("testimonials.table.deleteTitle")}>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => setDeletingId(item._id)}
                                                aria-label={t("testimonials.table.deleteTitle")}
                                            >
                                                <Trash />
                                            </Button>
                                        </Tooltip>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {/* Create / Edit Dialog */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>{editingTestimonial ? t("testimonials.edit") : t("testimonials.add")}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <Field label={t("testimonials.quoteLabel")} id="t-quote">
                            <Textarea
                                placeholder={t("testimonials.quotePlaceholder")}
                                rows={3}
                                value={formData.quote}
                                onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={t("testimonials.authorLabel")} id="t-author">
                                <Input
                                    placeholder={t("testimonials.authorPlaceholder")}
                                    value={formData.author}
                                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                                />
                            </Field>
                            <Field label={t("testimonials.roleLabel")} id="t-role">
                                <Input
                                    placeholder={t("testimonials.rolePlaceholder")}
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={t("testimonials.ratingLabel")} id="t-rating">
                                <Select
                                    value={String(formData.rating)}
                                    onValueChange={(v) => setFormData({ ...formData, rating: Number(v) })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("testimonials.ratingPlaceholder")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[5, 4, 3, 2, 1].map((r) => (
                                            <SelectItem key={r} value={String(r)}>
                                                {"★".repeat(r)}{"☆".repeat(5 - r)} ({r}/5)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="t-active">{t("testimonials.showOnLanding")}</Label>
                                <div className="flex h-control-md items-center gap-2">
                                    <Switch
                                        id="t-active"
                                        checked={formData.isActive}
                                        onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
                                    />
                                    <label htmlFor="t-active" className="text-body-sm text-fg-muted cursor-pointer">
                                        {formData.isActive ? t("testimonials.visible") : t("testimonials.hidden")}
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>{c("actions.cancel")}</Button>
                        <Button variant="primary" onClick={handleSave} loading={isSaving}>
                            {editingTestimonial ? t("testimonials.saveChanges") : t("testimonials.add")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={!!deletingId}
                onOpenChange={(open) => !open && setDeletingId(null)}
                title={t("testimonials.deleteTitle")}
                description={t("testimonials.deleteDescription")}
                cancelLabel={c("actions.cancel")}
                confirmLabel={c("actions.delete")}
                tone="danger"
                onConfirm={handleDelete}
            />
        </div>
    );
}
