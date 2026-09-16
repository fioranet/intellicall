"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
    MessageSquare,
    Plus,
    Star,
    Trash2,
    Pencil,
    Loader2,
    ToggleLeft,
    ToggleRight,
} from "lucide-react";
import { AdminNav } from "@/components/admin/nav";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import axios from "axios";
import { toast } from "sonner";

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
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground font-sora">{t("testimonials.title")}</h1>
                    <p className="text-muted-foreground">{t("testimonials.subtitle")}</p>
                </div>
                <Button onClick={openCreate} className="shadow-lg">
                    <Plus className="me-2 h-4 w-4" />
                    {t("testimonials.add")}
                </Button>
            </div>

            <AdminNav currentPath={pathname} />

            <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex h-64 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : testimonials.length === 0 ? (
                        <Empty className="py-16">
                            <EmptyHeader>
                                <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
                                <EmptyTitle>{t("testimonials.emptyTitle")}</EmptyTitle>
                                <EmptyDescription>{t("testimonials.emptyDescription")}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="font-semibold px-6">{t("testimonials.table.quote")}</TableHead>
                                    <TableHead className="font-semibold">{t("testimonials.table.author")}</TableHead>
                                    <TableHead className="font-semibold">{t("testimonials.table.role")}</TableHead>
                                    <TableHead className="font-semibold">{t("testimonials.table.rating")}</TableHead>
                                    <TableHead className="font-semibold">{t("testimonials.table.visible")}</TableHead>
                                    <TableHead className="text-end px-6 font-semibold">{t("testimonials.table.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {testimonials.map((item) => (
                                    <TableRow key={item._id} className="group hover:bg-muted/50 transition-colors">
                                        <TableCell className="px-6 py-4 max-w-xs">
                                            <p className="text-sm text-muted-foreground italic truncate max-w-[260px]">
                                                "{item.quote}"
                                            </p>
                                        </TableCell>
                                        <TableCell className="font-semibold text-foreground">{item.author}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{item.role}</TableCell>
                                        <TableCell>
                                            <div className="flex gap-0.5">
                                                {Array.from({ length: item.rating || 5 }, (_, i) => (
                                                    <Star key={i} className="h-4 w-4 fill-brand text-brand" />
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <button
                                                onClick={() => handleToggleActive(item)}
                                                className="flex items-center gap-1.5 text-sm"
                                                title={item.isActive ? t("testimonials.hideTitle") : t("testimonials.showTitle")}
                                            >
                                                {item.isActive ? (
                                                    <><ToggleRight className="h-5 w-5 text-green-500" /><span className="text-green-600 font-medium">{t("testimonials.visible")}</span></>
                                                ) : (
                                                    <><ToggleLeft className="h-5 w-5 text-muted-foreground" /><span className="text-muted-foreground">{t("testimonials.hidden")}</span></>
                                                )}
                                            </button>
                                        </TableCell>
                                        <TableCell className="text-end px-6">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEdit(item)}
                                                    title={t("testimonials.table.editTitle")}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setDeletingId(item._id)}
                                                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                    title={t("testimonials.table.deleteTitle")}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create / Edit Dialog */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{editingTestimonial ? t("testimonials.edit") : t("testimonials.add")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="t-quote">{t("testimonials.quoteLabel")}</Label>
                            <Textarea
                                id="t-quote"
                                placeholder={t("testimonials.quotePlaceholder")}
                                rows={3}
                                value={formData.quote}
                                onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="t-author">{t("testimonials.authorLabel")}</Label>
                                <Input
                                    id="t-author"
                                    placeholder={t("testimonials.authorPlaceholder")}
                                    value={formData.author}
                                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="t-role">{t("testimonials.roleLabel")}</Label>
                                <Input
                                    id="t-role"
                                    placeholder={t("testimonials.rolePlaceholder")}
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="t-rating">{t("testimonials.ratingLabel")}</Label>
                                <Select
                                    value={String(formData.rating)}
                                    onValueChange={(v) => setFormData({ ...formData, rating: Number(v) })}
                                >
                                    <SelectTrigger id="t-rating">
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
                            </div>
                            <div className="space-y-2">
                                <Label>{t("testimonials.showOnLanding")}</Label>
                                <div className="flex items-center gap-2 pt-2">
                                    <Switch
                                        id="t-active"
                                        checked={formData.isActive}
                                        onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
                                    />
                                    <label htmlFor="t-active" className="text-sm text-muted-foreground cursor-pointer">
                                        {formData.isActive ? t("testimonials.visible") : t("testimonials.hidden")}
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>{c("actions.cancel")}</Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                            {editingTestimonial ? t("testimonials.saveChanges") : t("testimonials.add")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("testimonials.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("testimonials.deleteDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{c("actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {c("actions.delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
