"use client";

import { useState, useEffect } from "react";
import { Badge, Button, Input, Section, Spinner, toast } from "@wixzel/react";
import { X, Plus, FloppyDisk, Calendar, Clock } from "@phosphor-icons/react";
import axios from "axios";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const DAYS = [
    { label: "Sunday", value: 0 },
    { label: "Monday", value: 1 },
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 },
    { label: "Thursday", value: 4 },
    { label: "Friday", value: 5 },
    { label: "Saturday", value: 6 },
];

interface Slot {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
}

export function AvailabilityManager() {
    const t = useTranslations("appointments");
    const [slots, setSlots] = useState<Slot[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchSlots();
    }, []);

    const fetchSlots = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/availability`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setSlots(response.data.data.slots);
            }
        } catch (err) {
            console.error("Failed to fetch slots:", err);
            toast.error(t("toast.slotsLoadFailed"));
        } finally {
            setLoading(false);
        }
    };

    const addSlot = (day: number) => {
        setSlots([...slots, { dayOfWeek: day, startTime: "09:00", endTime: "17:00" }]);
    };

    const removeSlot = (index: number) => {
        const newSlots = [...slots];
        newSlots.splice(index, 1);
        setSlots(newSlots);
    };

    const updateSlot = (index: number, field: keyof Slot, value: any) => {
        const newSlots = [...slots];
        newSlots[index] = { ...newSlots[index], [field]: value };
        setSlots(newSlots);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const token = localStorage.getItem("token");
            const cleanSlots = slots.map(({ dayOfWeek, startTime, endTime }) => ({
                dayOfWeek,
                startTime,
                endTime
            }));
            await axios.post(`${API_BASE_URL}/availability/sync`, cleanSlots, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(t("toast.availabilityUpdated"));
        } catch (err) {
            console.error("Save Error:", err);
            toast.error(t("toast.availabilityFailed"));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[400px] items-center justify-center text-fg-muted">
                <Spinner size="xl" />
            </div>
        );
    }

    return (
        <Section
            icon={<Clock />}
            title={t("availability.title")}
            description={t("availability.description")}
            actions={
                <Button variant="primary" onClick={handleSave} loading={saving} iconStart={<FloppyDisk />}>
                    {t("availability.save")}
                </Button>
            }
        >
            <div className="divide-y divide-border">
                {DAYS.map((day) => {
                    const daySlots = slots.map((s, idx) => ({ ...s, originalIndex: idx })).filter(s => s.dayOfWeek === day.value);

                    return (
                        <div key={day.value} className="grid grid-cols-1 gap-4 py-3 first:pt-0 last:pb-0 md:grid-cols-[180px_1fr]">
                            <div className="flex items-center gap-2">
                                <Calendar className="size-4 text-fg-subtle" />
                                <span className="text-body-sm font-medium">{day.label}</span>
                                {daySlots.length > 0 && <Badge size="sm">{daySlots.length}</Badge>}
                            </div>

                            <div className="flex flex-col items-start gap-3">
                                {daySlots.length > 0 ? (
                                    <div className="flex flex-wrap gap-3">
                                        {daySlots.map((slot) => (
                                            <div key={slot.originalIndex} className="flex animate-wx-fade-in items-center gap-2">
                                                <div className="grid max-w-[420px] grid-cols-2 gap-3">
                                                    <Input
                                                        type="time"
                                                        className="w-40"
                                                        leading={<Clock />}
                                                        value={slot.startTime}
                                                        onChange={(e) => updateSlot(slot.originalIndex, "startTime", e.target.value)}
                                                    />
                                                    <Input
                                                        type="time"
                                                        className="w-40"
                                                        leading={<Clock />}
                                                        value={slot.endTime}
                                                        onChange={(e) => updateSlot(slot.originalIndex, "endTime", e.target.value)}
                                                    />
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    onClick={() => removeSlot(slot.originalIndex)}
                                                >
                                                    <X />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="py-1 text-caption italic text-fg-subtle">{t("availability.noSlots")}</p>
                                )}
                                <Button
                                    size="xs"
                                    iconStart={<Plus />}
                                    onClick={() => addSlot(day.value)}
                                >
                                    {t("availability.addSlot")}
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Section>
    );
}
