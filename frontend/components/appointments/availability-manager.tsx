"use client";

import { useState, useEffect, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { X, Plus, Loader2, Save, Calendar, Clock, Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import axios from "axios";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
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
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">{t("availability.title")}</h3>
                    <p className="text-sm text-muted-foreground">{t("availability.description")}</p>
                </div>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t("availability.save")}
                </Button>
            </div>

            <div className="space-y-0">
                {DAYS.map((day, index) => {
                    const daySlots = slots.map((s, idx) => ({ ...s, originalIndex: idx })).filter(s => s.dayOfWeek === day.value);

                    return (
                        <Fragment key={day.value}>
                            <div className="grid grid-cols-1 md:grid-cols-[180px,1fr] gap-4 py-3 transition-colors">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-primary" />
                                    <span className="font-bold text-sm">{day.label}</span>
                                    {daySlots.length > 0 && <Badge variant="secondary" className="text-[10px] px-1 h-4">{daySlots.length}</Badge>}
                                </div>

                                <div className="space-y-3">
                                    {daySlots.length > 0 ? (
                                        <div className="flex flex-wrap gap-3">
                                            {daySlots.map((slot) => (
                                                <div key={slot.originalIndex} className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                                                    <div className="grid grid-cols-2 gap-3 max-w-[420px]">
                                                        <div className="relative">
                                                            <Clock className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                                                            <Input
                                                                type="time"
                                                                className="ps-9 h-10 text-sm w-40"
                                                                value={slot.startTime}
                                                                onChange={(e) => updateSlot(slot.originalIndex, "startTime", e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="relative">
                                                            <Clock className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                                                            <Input
                                                                type="time"
                                                                className="ps-9 h-10 text-sm w-40"
                                                                value={slot.endTime}
                                                                onChange={(e) => updateSlot(slot.originalIndex, "endTime", e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                                        onClick={() => removeSlot(slot.originalIndex)}
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-muted-foreground italic py-1">{t("availability.noSlots")}</p>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[11px] gap-1 border-dashed hover:border-primary hover:text-primary transition-all px-2"
                                        onClick={() => addSlot(day.value)}
                                    >
                                        <Plus className="h-3 w-3" /> {t("availability.addSlot")}
                                    </Button>
                                </div>
                            </div>
                            {index < DAYS.length - 1 && <Separator />}
                        </Fragment>
                    );
                })}
            </div>
        </div>
    );
}
