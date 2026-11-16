"use client";

import { Button, Input, Label } from "@wixzel/react";
import { Plus, X } from "@phosphor-icons/react";

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
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
                <Label>{t("customFields.title")}</Label>
                <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    iconStart={<Plus />}
                    onClick={() => onChange([...fields, { name: "", value: "" }])}
                >
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
                        size="icon-sm"
                        className="shrink-0"
                        onClick={() => onChange(fields.filter((_, idx) => idx !== i))}
                    >
                        <X />
                    </Button>
                </div>
            ))}
            <p className="text-caption text-fg-muted">
                {"Use any field in your agent as {{field_name}} — e.g. {{appointment_date}} in the opening message or script."}
            </p>
        </div>
    );
}
