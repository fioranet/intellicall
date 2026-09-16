"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

import { useTranslations } from "next-intl";
export interface CustomFieldRow {
    name: string;
    value: string;
}

/** Trim names, strip braces, drop empty rows, dedupe by name (last wins). */
export function sanitizeCustomFields(rows: CustomFieldRow[]) {
    const map = new Map<string, string>();
    rows.forEach((row) => {
        const name = row.name.replace(/[{}]/g, "").trim();
        if (name) map.set(name, row.value);
    });
    return Array.from(map, ([name, value]) => ({ name, value }));
}

export function CustomFieldsEditor({
    fields,
    onChange,
    idPrefix = "cf",
}: {
    fields: CustomFieldRow[];
    onChange: (fields: CustomFieldRow[]) => void;
    idPrefix?: string;
}) {
    const t = useTranslations("leads");
    const updateRow = (index: number, patch: Partial<CustomFieldRow>) => {
        onChange(fields.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between">
                <Label>{t("customFields.title")}</Label>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onChange([...fields, { name: "", value: "" }])}
                >
                    <Plus className="h-3 w-3" />
                    {t("customFields.addField")}
                </Button>
            </div>
            {fields.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                    <Input
                        id={`${idPrefix}-name-${i}`}
                        value={row.name}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        placeholder={t("customFields.namePlaceholder")}
                        className="flex-1"
                    />
                    <Input
                        id={`${idPrefix}-value-${i}`}
                        value={row.value}
                        onChange={(e) => updateRow(i, { value: e.target.value })}
                        placeholder={t("customFields.valuePlaceholder")}
                        className="flex-1"
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => onChange(fields.filter((_, idx) => idx !== i))}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ))}
            <p className="text-[11px] text-muted-foreground leading-snug">
                {"Use any field in your agent as {{field_name}} — e.g. {{appointment_date}} in the opening message or script."}
            </p>
        </div>
    );
}
