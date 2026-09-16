"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeftRight, Bot, Calendar, Languages, PhoneIncoming, PhoneOutgoing, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
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

const TEMPLATE_ICON_GRADIENTS = [
    "/images/gradients/grad1.png",
    "/images/gradients/grad2.png",
    "/images/gradients/grad3.png",
    "/images/gradients/grad4.png",
    "/images/gradients/grad5.png",
    "/images/gradients/grad6.png",
];

function getTemplateGradientUrl(name: string): string {
    const trimmed = name?.trim();
    if (!trimmed) return TEMPLATE_ICON_GRADIENTS[0];
    const ascii = trimmed[0].charCodeAt(0);
    return TEMPLATE_ICON_GRADIENTS[ascii % TEMPLATE_ICON_GRADIENTS.length];
}

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
    Inbound: <PhoneIncoming className="h-3 w-3 shrink-0" aria-hidden />,
    Outbound: <PhoneOutgoing className="h-3 w-3 shrink-0" aria-hidden />,
    Both: <ArrowLeftRight className="h-3 w-3 shrink-0" aria-hidden />,
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
            <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" shouldScaleBackground={false}>
                <DrawerContent
                    fullScreen
                    className="flex flex-col overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6 md:px-8"
                >
                    <DrawerHeader className="flex-shrink-0 border-b border-border/80 py-3 sm:py-4 text-start space-y-0.5 px-0">
                        <DrawerTitle className="text-lg font-semibold sm:text-xl tracking-tight">
                            {t("templates.title")}
                        </DrawerTitle>
                        <DrawerDescription className="text-xs sm:text-sm text-muted-foreground">
                            {t("templates.description")}
                        </DrawerDescription>
                    </DrawerHeader>

                    {/* Filters */}
                    <div className="flex-shrink-0 border-b border-border/60 py-3 space-y-3">
                        {/* Search + Dropdowns row */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[180px] max-w-sm">
                                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t("templates.searchPlaceholder")}
                                    className="h-8 ps-8 pe-3 text-sm rounded-md"
                                />
                            </div>

                            <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as TemplateCategory | "all")}>
                                <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs rounded-md">
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
                                <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs rounded-md">
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
                                <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs rounded-md">
                                    <SelectValue placeholder={t("templates.directionPlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t("templates.allDirections")}</SelectItem>
                                    <SelectItem value="Inbound">
                                        <span className="inline-flex items-center gap-1.5">
                                            {DIRECTION_ICONS.Inbound}
                                            {t("templates.inbound")}
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="Outbound">
                                        <span className="inline-flex items-center gap-1.5">
                                            {DIRECTION_ICONS.Outbound}
                                            {t("templates.outbound")}
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="Both">
                                        <span className="inline-flex items-center gap-1.5">
                                            {DIRECTION_ICONS.Both}
                                            {t("templates.both")}
                                        </span>
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            <div className="flex items-center gap-2 px-2 h-8">
                                <Switch
                                    id="appointments-filter"
                                    checked={appointmentsOnly}
                                    onCheckedChange={setAppointmentsOnly}
                                    className="scale-[0.85]"
                                />
                                <Label htmlFor="appointments-filter" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                                    {t("templates.appointments")}
                                </Label>
                            </div>

                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 h-8"
                                >
                                    <X className="h-3 w-3" />
                                    {t("templates.clearFilters", { count: activeFilterCount })}
                                </button>
                            )}
                        </div>

                        {/* Result count */}
                        <p className="text-[11px] text-muted-foreground">
                            {t("templates.resultCount", { count: filteredTemplates.length })}
                        </p>
                    </div>

                    {/* Template grid */}
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 sm:py-5 pe-2 -mr-2">
                        {filteredTemplates.length > 0 ? (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredTemplates.map((template) => (
                                    <button
                                        key={template.id}
                                        type="button"
                                        onClick={() => handleSelectTemplate(template)}
                                        className="group flex flex-col items-start gap-3 rounded-xl border border-border/80 bg-card p-4 text-start transition-all hover:border-primary/40 hover:bg-accent/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <div className="flex w-full items-start gap-3">
                                            <div
                                                className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center overflow-hidden bg-cover bg-center"
                                                style={{ backgroundImage: `url(${getTemplateGradientUrl(template.name)})` }}
                                            >
                                                <Bot className="h-5 w-5 text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.2)] mix-blend-overlay" strokeWidth={1.75} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors">
                                                    {template.name}
                                                </h3>
                                                <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                                    {template.description}
                                                </p>
                                                {template.recommendedFor.length > 0 && (
                                                    <p className="mt-1.5 text-[10px] text-muted-foreground/70 leading-snug">
                                                        {t("templates.bestFor", { list: template.recommendedFor.join(", ") })}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <Badge variant="outline" className="text-[10px] font-medium gap-1 px-1.5 py-0">
                                                {DIRECTION_ICONS[template.direction]}
                                                {template.direction}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px] font-medium gap-1 px-1.5 py-0">
                                                <span aria-hidden>{CATEGORY_EMOJIS[template.category]}</span>
                                                {template.category}
                                            </Badge>
                                            <Badge variant="secondary" className="text-[10px] font-medium gap-1 px-1.5 py-0">
                                                {LANGUAGE_FLAGS[template.language]
                                                    ? <span aria-hidden>{LANGUAGE_FLAGS[template.language]}</span>
                                                    : <Languages className="h-3 w-3" />}
                                                {LANGUAGE_LABELS[template.language] || template.language}
                                            </Badge>
                                            {template.appointmentBookingEnabled && (
                                                <Badge variant="secondary" className="text-[10px] font-medium gap-1 px-1.5 py-0">
                                                    <Calendar className="h-3 w-3" />
                                                    {t("templates.appointments")}
                                                </Badge>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
                                <p className="text-sm font-medium text-muted-foreground">{t("templates.noMatch")}</p>
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="mt-2 text-xs text-primary hover:underline"
                                >
                                    {t("templates.clearAll")}
                                </button>
                            </div>
                        )}
                    </div>
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
