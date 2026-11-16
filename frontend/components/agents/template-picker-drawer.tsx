"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
    Avatar,
    Badge,
    Button,
    Card,
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    EmptyState,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
} from "@wixzel/react";
import { ArrowsLeftRight, Calendar, Translate, PhoneIncoming, PhoneOutgoing, MagnifyingGlass, X } from "@phosphor-icons/react";
import { agentTemplates, type AgentTemplate, type TemplateCategory, type TemplateDirection } from "@/lib/agent-templates";
import { AgentDrawer } from "@/components/agents/agent-drawer";
import { useTranslations } from "next-intl";

const LANGUAGE_LABELS: Record<string, string> = {
    en: "English",
    ar: "Arabic",
    hi: "Hindi",
    he: "Hebrew",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
    "pt-BR": "Portuguese (BR)",
    it: "Italian",
    ru: "Russian",
    ja: "Japanese",
    ko: "Korean",
    nl: "Dutch",
    ur: "Urdu",
    ta: "Tamil",
    multi: "Multilingual",
};

const LANGUAGE_FLAGS: Record<string, string> = {
    en: "\u{1F1FA}\u{1F1F8}",
    ar: "\u{1F1F8}\u{1F1E6}",
    hi: "\u{1F1EE}\u{1F1F3}",
    he: "\u{1F1EE}\u{1F1F1}",
    es: "\u{1F1EA}\u{1F1F8}",
    fr: "\u{1F1EB}\u{1F1F7}",
    de: "\u{1F1E9}\u{1F1EA}",
    pt: "\u{1F1F5}\u{1F1F9}",
    "pt-BR": "\u{1F1E7}\u{1F1F7}",
    it: "\u{1F1EE}\u{1F1F9}",
    ru: "\u{1F1F7}\u{1F1FA}",
    ja: "\u{1F1EF}\u{1F1F5}",
    ko: "\u{1F1F0}\u{1F1F7}",
    nl: "\u{1F1F3}\u{1F1F1}",
    ur: "\u{1F1F5}\u{1F1F0}",
    ta: "\u{1F1EE}\u{1F1F3}",
    multi: "\u{1F310}",
};

const ALL_CATEGORIES: TemplateCategory[] = [
    "Support",
    "Sales",
    "Scheduling",
    "Hospitality",
    "Healthcare",
    "Real Estate",
    "Outreach",
    "Finance",
    "E-Commerce",
    "Fitness",
];

const CATEGORY_EMOJIS: Record<TemplateCategory, string> = {
    Support: "🛟",
    Sales: "💰",
    Scheduling: "📅",
    Hospitality: "🏨",
    Healthcare: "🏥",
    "Real Estate": "🏠",
    Outreach: "📣",
    Finance: "💳",
    "E-Commerce": "🛒",
    Fitness: "💪",
};

const DIRECTION_ICONS: Record<TemplateDirection, ReactNode> = {
    Inbound: <PhoneIncoming className="shrink-0" aria-hidden />,
    Outbound: <PhoneOutgoing className="shrink-0" aria-hidden />,
    Both: <ArrowsLeftRight className="shrink-0" aria-hidden />,
};

function matchesDirectionFilter(t: AgentTemplate, filter: TemplateDirection | "all"): boolean {
    if (filter === "all") return true;
    if (filter === "Inbound") return t.direction === "Inbound" || t.direction === "Both";
    if (filter === "Outbound") return t.direction === "Outbound" || t.direction === "Both";
    return t.direction === "Both";
}

interface TemplatePickerDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function TemplatePickerDrawer({ open, onOpenChange, onSuccess }: TemplatePickerDrawerProps) {
    const t = useTranslations("agents");
    const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
    const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | "all">("all");
    const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
    const [selectedDirection, setSelectedDirection] = useState<TemplateDirection | "all">("all");
    const [appointmentsOnly, setAppointmentsOnly] = useState(false);

    const availableLanguages = useMemo(() => {
        const langs = new Set(agentTemplates.map((t) => t.language));
        return Array.from(langs).sort((a, b) => (LANGUAGE_LABELS[a] || a).localeCompare(LANGUAGE_LABELS[b] || b));
    }, []);

    const availableCategories = useMemo(() => {
        const cats = new Set(agentTemplates.map((t) => t.category));
        return ALL_CATEGORIES.filter((c) => cats.has(c));
    }, []);

    const filteredTemplates = useMemo(() => {
        return agentTemplates.filter((t) => {
            if (selectedCategory !== "all" && t.category !== selectedCategory) return false;
            if (selectedLanguage !== "all" && t.language !== selectedLanguage) return false;
            if (!matchesDirectionFilter(t, selectedDirection)) return false;
            if (appointmentsOnly && !t.appointmentBookingEnabled) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return (
                    t.name.toLowerCase().includes(q) ||
                    t.description.toLowerCase().includes(q) ||
                    t.category.toLowerCase().includes(q) ||
                    t.direction.toLowerCase().includes(q) ||
                    t.recommendedFor.some((r) => r.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [selectedCategory, selectedLanguage, selectedDirection, appointmentsOnly, searchQuery]);

    const activeFilterCount =
        (selectedCategory !== "all" ? 1 : 0) +
        (selectedLanguage !== "all" ? 1 : 0) +
        (selectedDirection !== "all" ? 1 : 0) +
        (appointmentsOnly ? 1 : 0);

    const clearFilters = () => {
        setSearchQuery("");
        setSelectedCategory("all");
        setSelectedLanguage("all");
        setSelectedDirection("all");
        setAppointmentsOnly(false);
    };

    const handleSelectTemplate = (template: AgentTemplate) => {
        setSelectedTemplate(template);
        onOpenChange(false);
        setTimeout(() => setAgentDrawerOpen(true), 150);
    };

    return (
        <>
            <Drawer open={open} onOpenChange={onOpenChange}>
                <DrawerContent side="right" style={{ "--wx-drawer-size": "1120px" } as React.CSSProperties}>
                    <DrawerHeader>
                        <DrawerTitle>
                            {t("templates.title")}
                        </DrawerTitle>
                        <DrawerDescription>
                            {t("templates.description")}
                        </DrawerDescription>
                    </DrawerHeader>

                    {/* Filters */}
                    <div className="flex shrink-0 flex-col gap-3 border-b border-border px-5 py-3">
                        {/* MagnifyingGlass + Dropdowns row */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                size="sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t("templates.searchPlaceholder")}
                                leading={<MagnifyingGlass />}
                                className="min-w-[180px] max-w-sm flex-1"
                            />

                            <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as TemplateCategory | "all")}>
                                <SelectTrigger size="sm" className="w-auto min-w-[130px]">
                                    <SelectValue placeholder={t("templates.categoryPlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t("templates.allCategories")}</SelectItem>
                                    {availableCategories.map((cat) => (
                                        <SelectItem key={cat} value={cat}>
                                            <span className="inline-flex items-center gap-1.5">
                                                <span aria-hidden>{CATEGORY_EMOJIS[cat]}</span>
                                                {cat}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                                <SelectTrigger size="sm" className="w-auto min-w-[130px]">
                                    <SelectValue placeholder={t("templates.languagePlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t("templates.allLanguages")}</SelectItem>
                                    {availableLanguages.map((lang) => (
                                        <SelectItem key={lang} value={lang}>
                                            <span className="inline-flex items-center gap-1.5">
                                                {LANGUAGE_FLAGS[lang] && <span aria-hidden>{LANGUAGE_FLAGS[lang]}</span>}
                                                {LANGUAGE_LABELS[lang] || lang}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={selectedDirection} onValueChange={(v) => setSelectedDirection(v as TemplateDirection | "all")}>
                                <SelectTrigger size="sm" className="w-auto min-w-[140px]">
                                    <SelectValue placeholder={t("templates.directionPlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t("templates.allDirections")}</SelectItem>
                                    <SelectItem value="Inbound">
                                        <span className="inline-flex items-center gap-1.5 [&_svg]:size-3.5">
                                            {DIRECTION_ICONS.Inbound}
                                            {t("templates.inbound")}
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="Outbound">
                                        <span className="inline-flex items-center gap-1.5 [&_svg]:size-3.5">
                                            {DIRECTION_ICONS.Outbound}
                                            {t("templates.outbound")}
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="Both">
                                        <span className="inline-flex items-center gap-1.5 [&_svg]:size-3.5">
                                            {DIRECTION_ICONS.Both}
                                            {t("templates.both")}
                                        </span>
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            <div className="flex h-8 items-center gap-2 px-2">
                                <Switch
                                    id="appointments-filter"
                                    size="sm"
                                    checked={appointmentsOnly}
                                    onCheckedChange={setAppointmentsOnly}
                                />
                                <Label htmlFor="appointments-filter" className="cursor-pointer whitespace-nowrap">
                                    {t("templates.appointments")}
                                </Label>
                            </div>

                            {activeFilterCount > 0 && (
                                <Button variant="ghost" size="sm" iconStart={<X />} onClick={clearFilters}>
                                    {t("templates.clearFilters", { count: activeFilterCount })}
                                </Button>
                            )}
                        </div>

                        {/* Result count */}
                        <p className="text-caption tabular-nums text-fg-muted">
                            {t("templates.resultCount", { count: filteredTemplates.length })}
                        </p>
                    </div>

                    {/* Template grid */}
                    <DrawerBody>
                        {filteredTemplates.length > 0 ? (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredTemplates.map((template) => (
                                    <Card key={template.id} interactive asChild>
                                        <button
                                            type="button"
                                            onClick={() => handleSelectTemplate(template)}
                                            className="wx-focus items-start gap-3 p-4 text-start"
                                        >
                                            <div className="flex w-full items-start gap-3">
                                                <Avatar name={template.name} shape="square" size="lg" />
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="text-body-sm font-semibold">
                                                        {template.name}
                                                    </h3>
                                                    <p className="mt-1 line-clamp-2 text-caption text-fg-muted">
                                                        {template.description}
                                                    </p>
                                                    {template.recommendedFor.length > 0 && (
                                                        <p className="mt-1.5 text-caption text-fg-subtle">
                                                            {t("templates.bestFor", { list: template.recommendedFor.join(", ") })}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <Badge size="sm" appearance="outline">
                                                    {DIRECTION_ICONS[template.direction]}
                                                    {template.direction}
                                                </Badge>
                                                <Badge size="sm" appearance="outline">
                                                    <span aria-hidden>{CATEGORY_EMOJIS[template.category]}</span>
                                                    {template.category}
                                                </Badge>
                                                <Badge size="sm">
                                                    {LANGUAGE_FLAGS[template.language]
                                                        ? <span aria-hidden>{LANGUAGE_FLAGS[template.language]}</span>
                                                        : <Translate />}
                                                    {LANGUAGE_LABELS[template.language] || template.language}
                                                </Badge>
                                                {template.appointmentBookingEnabled && (
                                                    <Badge size="sm" tone="success">
                                                        <Calendar />
                                                        {t("templates.appointments")}
                                                    </Badge>
                                                )}
                                            </div>
                                        </button>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<MagnifyingGlass />}
                                title={t("templates.noMatch")}
                                actions={
                                    <Button variant="link" size="sm" onClick={clearFilters}>
                                        {t("templates.clearAll")}
                                    </Button>
                                }
                            />
                        )}
                    </DrawerBody>
                </DrawerContent>
            </Drawer>

            <AgentDrawer
                open={agentDrawerOpen}
                onOpenChange={setAgentDrawerOpen}
                templateData={selectedTemplate ?? undefined}
                onSuccess={onSuccess}
            />
        </>
    );
}
