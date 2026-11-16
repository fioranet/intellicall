"use client";

import { useState, useEffect } from "react";
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
    Textarea,
    toast,
} from "@wixzel/react";
import { PencilSimple } from "@phosphor-icons/react";
import axios from "axios";
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
                    iconStart={<PencilSimple />}
                    onClick={() => setOpen(true)}
                >
                    {t("edit.trigger")}
                </Button>
            )}
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <PencilSimple className="size-5" /> {t("edit.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("edit.description")}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <Field id="edit-datetime" label={t("edit.dateTimeLabel")}>
                        <Input
                            type="datetime-local"
                            value={dateTime}
                            onChange={(e) => setDateTime(e.target.value)}
                        />
                    </Field>

                    <Field id="edit-duration" label={t("edit.durationLabel")}>
                        <Input
                            type="number"
                            min={1}
                            value={duration}
                            onChange={(e) => setDuration(parseInt(e.target.value || "0", 10))}
                        />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="edit-client-name" label={t("edit.clientNameLabel")}>
                            <Input
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder={t("edit.clientNamePlaceholder")}
                            />
                        </Field>
                        <Field id="edit-client-phone" label={t("edit.phoneLabel")}>
                            <Input
                                value={clientPhone}
                                onChange={(e) => setClientPhone(e.target.value)}
                                placeholder="+1234567890"
                            />
                        </Field>
                    </div>

                    <Field id="edit-notes" label={t("edit.notesLabel")}>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder={t("edit.notesPlaceholder")}
                        />
                    </Field>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>{c("actions.cancel")}</Button>
                    <Button variant="primary" onClick={handleSave} loading={saving}>
                        {t("edit.save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
