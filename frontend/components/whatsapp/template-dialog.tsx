"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import axios from "axios";
import { Plus } from "@phosphor-icons/react";
import {
    Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
    Field, Input, Message, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from "@wixzel/react";
import { useApiMessage } from "./parts";
import { API_BASE_URL, authHeaders, type WhatsAppTemplate } from "./types";

/** The languages most numbers write in; Meta accepts many more through the API. Labels are messages, `template.lang.<code>`. */
const LANGUAGES = ["en_US", "en_GB", "en", "hi", "ml", "ta", "te", "kn", "mr", "bn", "gu", "ar", "es", "pt_BR", "fr", "de", "id"] as const;

/** The highest {{n}} in the body, which is how many example values Meta wants. */
function placeholderCount(body: string): number {
    const n = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
    return n.length ? Math.max(...n) : 0;
}

/**
 * A new message template, submitted to Meta for review: name, category,
 * language, header, body with {{n}} placeholders and an example for each, and
 * a footer, with the bubble the customer would get shown as it is typed.
 */
export function TemplateDialog({ open, onOpenChange, accountId, onCreated }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accountId: string;
    onCreated: (t: WhatsAppTemplate) => void;
}) {
    const t = useTranslations("whatsapp");
    const c = useTranslations("common");
    const message = useApiMessage();
    const blank = { name: "", category: "UTILITY", language: "en_US", header: "", body: "", footer: "" };
    const [form, setForm] = useState(blank);
    const [examples, setExamples] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const count = placeholderCount(form.body);
    const values = useMemo(() => Array.from({ length: count }, (_, i) => examples[i] ?? ""), [count, examples]);
    const preview = useMemo(
        () => form.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (all, n) => values[Number(n) - 1] || all),
        [form.body, values],
    );

    function close(o: boolean) {
        if (!o) { setForm(blank); setExamples([]); setError(null); }
        onOpenChange(o);
    }

    function addValue() {
        setForm({ ...form, body: `${form.body}${form.body && !form.body.endsWith(" ") ? " " : ""}{{${count + 1}}}` });
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await axios.post(`${API_BASE_URL}/whatsapp/templates`, {
                accountId,
                name: form.name.trim(),
                category: form.category,
                language: form.language,
                body: form.body.trim(),
                examples: values.map((v) => v.trim()),
                ...(form.header.trim() ? { header: form.header.trim() } : {}),
                ...(form.footer.trim() ? { footer: form.footer.trim() } : {}),
            }, { headers: authHeaders() });
            onCreated(res.data.data.template as WhatsAppTemplate);
            close(false);
        } catch (err) {
            setError(message(err, t("template.submitFailed")));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent size="xl">
                <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{t("template.title")}</DialogTitle>
                        <DialogDescription>{t("template.description")}</DialogDescription>
                    </DialogHeader>

                    <div className="grid min-w-0 gap-5 md:grid-cols-[1fr_260px]">
                        <div className="flex min-w-0 flex-col gap-4">
                            <Field label={t("template.name")} hint={t("template.nameHint")} required>
                                <Input required value={form.name} placeholder="visit_reminder" dir="ltr" className="font-mono" maxLength={512}
                                    onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
                            </Field>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={t("template.category")} hint={form.category === "UTILITY" ? t("template.utilityHint") : t("template.marketingHint")}>
                                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="UTILITY">{t("template.utility")}</SelectItem>
                                            <SelectItem value="MARKETING">{t("template.marketing")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field label={t("template.language")}>
                                    <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {LANGUAGES.map((code) => <SelectItem key={code} value={code}>{t(`template.lang.${code}`)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </div>
                            <Field label={t("template.header")}>
                                <Input maxLength={60} value={form.header} onChange={(e) => setForm({ ...form, header: e.target.value })} />
                            </Field>
                            <Field label={t("template.message")} required>
                                <Textarea required rows={4} maxLength={1024} value={form.body} placeholder={t("template.messagePlaceholder")}
                                    onChange={(e) => setForm({ ...form, body: e.target.value })} />
                            </Field>
                            <Button type="button" variant="ghost" size="xs" onClick={addValue} iconStart={<Plus aria-hidden />} className="-mt-2 w-fit">
                                {t("template.addValue", { value: `{{${count + 1}}}` })}
                            </Button>
                            {count > 0 && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {values.map((v, i) => (
                                        <Field key={i} label={t("template.exampleFor", { value: `{{${i + 1}}}` })} required>
                                            <Input required maxLength={200} value={v}
                                                onChange={(e) => { const next = [...values]; next[i] = e.target.value; setExamples(next); }} />
                                        </Field>
                                    ))}
                                </div>
                            )}
                            <Field label={t("template.footer")}>
                                <Input maxLength={60} value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} />
                            </Field>
                            {error && <Alert tone="danger">{error}</Alert>}
                        </div>

                        <div className="flex min-w-0 flex-col gap-2">
                            <span className="text-body-sm font-medium text-fg">{t("template.preview")}</span>
                            {/* The message as the customer gets it: one chat bubble on a tinted panel. */}
                            <div className="flex flex-col rounded-lg bg-bg-muted p-3">
                                <Message from="agent" className="max-w-full">
                                    {form.header && <p className="mb-1 font-semibold break-words">{form.header}</p>}
                                    <p className="whitespace-pre-wrap break-words">{preview || t("template.previewEmpty")}</p>
                                    {form.footer && <p className="mt-1 text-caption break-words text-fg-subtle">{form.footer}</p>}
                                </Message>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => close(false)}>{c("actions.cancel")}</Button>
                        <Button type="submit" variant="primary" loading={busy}>{t("template.submit")}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
