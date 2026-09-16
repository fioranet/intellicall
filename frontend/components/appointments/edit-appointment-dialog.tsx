"use client";

import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Loader2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

type Appointment = {
    _id: string;
    dateTime: string;
    duration?: number;
    clientName?: string;
    clientPhone?: string;
    notes?: string;
    status?: string;
};

function toLocalInputValue(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditAppointmentDialog({
    appointment,
    onUpdated,
    trigger
}: {
    appointment: Appointment;
    onUpdated: () => void;
    trigger?: React.ReactNode;
}) {
    const t = useTranslations("appointments");
    const c = useTranslations("common");
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const [dateTime, setDateTime] = useState("");
    const [duration, setDuration] = useState(30);
    const [clientName, setClientName] = useState("");
    const [clientPhone, setClientPhone] = useState("");
    const [notes, setNotes] = useState("");

    useEffect(() => {
        if (!open) return;
        setDateTime(toLocalInputValue(appointment.dateTime));
        setDuration(appointment.duration ?? 30);
        setClientName(appointment.clientName || "");
        setClientPhone(appointment.clientPhone || "");
        setNotes(appointment.notes || "");
    }, [open, appointment]);

    const handleSave = async () => {
        if (!dateTime) {
            toast.error(t("toast.pickDateTime"));
            return;
        }
        const iso = new Date(dateTime).toISOString();
        if (Number.isNaN(new Date(dateTime).getTime())) {
            toast.error(t("toast.invalidDateTime"));
            return;
        }
        setSaving(true);
        try {
            const token = localStorage.getItem("token");
            await axios.patch(`${API_BASE_URL}/appointments/${appointment._id}`, {
                dateTime: iso,
                duration: Number(duration) || 30,
                clientName,
                clientPhone,
                notes
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(t("toast.updated"));
            setOpen(false);
            onUpdated();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.updateFailed"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger ? (
                <span onClick={() => setOpen(true)}>{trigger}</span>
            ) : (
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={() => setOpen(true)}
                >
                    <Pencil className="h-3 w-3" /> {t("edit.trigger")}
                </Button>
            )}
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Pencil className="h-5 w-5" /> {t("edit.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("edit.description")}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="edit-datetime" className="text-xs font-bold uppercase text-muted-foreground">{t("edit.dateTimeLabel")}</Label>
                        <Input
                            id="edit-datetime"
                            type="datetime-local"
                            value={dateTime}
                            onChange={(e) => setDateTime(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-duration" className="text-xs font-bold uppercase text-muted-foreground">{t("edit.durationLabel")}</Label>
                        <Input
                            id="edit-duration"
                            type="number"
                            min={1}
                            value={duration}
                            onChange={(e) => setDuration(parseInt(e.target.value || "0", 10))}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="edit-client-name" className="text-xs font-bold uppercase text-muted-foreground">{t("edit.clientNameLabel")}</Label>
                            <Input
                                id="edit-client-name"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder={t("edit.clientNamePlaceholder")}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-client-phone" className="text-xs font-bold uppercase text-muted-foreground">{t("edit.phoneLabel")}</Label>
                            <Input
                                id="edit-client-phone"
                                value={clientPhone}
                                onChange={(e) => setClientPhone(e.target.value)}
                                placeholder="+1234567890"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-notes" className="text-xs font-bold uppercase text-muted-foreground">{t("edit.notesLabel")}</Label>
                        <Textarea
                            id="edit-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder={t("edit.notesPlaceholder")}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>{c("actions.cancel")}</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("edit.save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
