"use client";

import { useEffect, useState, useCallback } from "react";
import { Bot, Loader2, MoreHorizontal, Pencil, Trash2, Mic, LayoutGrid, List, Phone, Hash, Database, Plus, FileText, SlidersHorizontal, Calendar } from "lucide-react";
import { AgentDrawer } from "@/components/agents/agent-drawer";
import { AgentTestDrawer } from "@/components/agents/agent-test-drawer";
import { TemplatePickerDrawer } from "@/components/agents/template-picker-drawer";
import { SARVAM_LANGUAGES } from "@/components/agents/sarvam-options";
import { GEMINI_LANGUAGES } from "@/components/agents/gemini-options";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import axios from "axios";
import { toast } from "sonner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const LANGUAGE_LABELS: Record<string, string> = {
    en: "English (US)",
    ar: "Arabic",
    hi: "Hindi",
    he: "Hebrew",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
    "pt-BR": "Portuguese (Brazil)",
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
    en: "🇺🇸",
    ar: "🇸🇦",
    hi: "🇮🇳",
    he: "🇮🇱",
    es: "🇪🇸",
    fr: "🇫🇷",
    de: "🇩🇪",
    pt: "🇵🇹",
    "pt-BR": "🇧🇷",
    it: "🇮🇹",
    ru: "🇷🇺",
    ja: "🇯🇵",
    ko: "🇰🇷",
    nl: "🇳🇱",
    ur: "🇵🇰",
    ta: "🇮🇳",
};

const AGENT_ICON_GRADIENTS = [
    "/images/gradients/grad1.png",
    "/images/gradients/grad2.png",
    "/images/gradients/grad3.png",
    "/images/gradients/grad4.png",
    "/images/gradients/grad5.png",
    "/images/gradients/grad6.png",
];

function getAgentGradientUrl(agentName: string): string {
    const trimmed = agentName?.trim();
    if (!trimmed) return AGENT_ICON_GRADIENTS[0];
    const ascii = trimmed[0].charCodeAt(0);
    return AGENT_ICON_GRADIENTS[ascii % AGENT_ICON_GRADIENTS.length];
}

interface Agent {
    _id: string;
    name: string;
    systemPrompt: string;
    openingMessage: string;
    voice?: string;
    voiceId?: string;
    voiceName?: string;
    useCustomVoice: boolean;
    outboundPhoneNumber?: { _id: string; phoneNumber: string; name: string };
    knowledgeBaseId?: { _id: string; name: string };
    kbSettings?: {
        useBasicInfo: boolean;
        useFaqs: boolean;
        useOtherInfo: boolean;
    };
    language?: string;
    voiceEngine?: string;
    sarvamSpeaker?: string;
    sarvamLanguage?: string;
    geminiVoice?: string;
    geminiLanguage?: string;
    appointmentBookingEnabled?: boolean;
    createdAt: string;
}

// The agent card shows the voice + language that actually drive the call. The Sarvam and
// Gemini engines store these on their own fields (sarvamSpeaker / sarvamLanguage,
// geminiVoice / geminiLanguage), not voiceName / language.
function agentVoiceLabel(a: Agent): string {
    if (a.voiceEngine === "sarvam") {
        return a.sarvamSpeaker ? a.sarvamSpeaker.charAt(0).toUpperCase() + a.sarvamSpeaker.slice(1) : "Sarvam Voice";
    }
    if (a.voiceEngine === "gemini_live") return a.geminiVoice || "Gemini Voice";
    return a.useCustomVoice ? (a.voiceName || "Premium Voice") : (a.voice || "Standard Voice");
}
function agentVoiceProvider(a: Agent): string {
    if (a.voiceEngine === "sarvam") return "Sarvam AI";
    if (a.voiceEngine === "gemini_live") return "Gemini Live";
    if (a.voiceEngine === "deepgram_agent") return "Deepgram Voice Agent";
    return a.useCustomVoice ? "ElevenLabs" : "Twilio";
}
function agentLangCode(a: Agent): string | undefined {
    if (a.voiceEngine === "sarvam") return a.sarvamLanguage;
    if (a.voiceEngine === "gemini_live") return a.geminiLanguage;
    return a.language;
}
function agentLangFlag(a: Agent): string | undefined {
    if (a.voiceEngine === "sarvam") return SARVAM_LANGUAGES.find(l => l.code === a.sarvamLanguage)?.flag;
    if (a.voiceEngine === "gemini_live") return "🌐";
    return a.language ? LANGUAGE_FLAGS[a.language] : undefined;
}
function agentLangLabel(a: Agent): string | undefined {
    if (a.voiceEngine === "sarvam") return SARVAM_LANGUAGES.find(l => l.code === a.sarvamLanguage)?.label || a.sarvamLanguage;
    if (a.voiceEngine === "gemini_live") {
        return GEMINI_LANGUAGES.find(l => l.code === a.geminiLanguage)?.label || a.geminiLanguage || "Auto-detect";
    }
    return a.language ? (LANGUAGE_LABELS[a.language] || a.language) : undefined;
}

function CreateAgentButton({ onSuccess }: { onSuccess?: () => void }) {
    const t = useTranslations("agents");
    const [scratchOpen, setScratchOpen] = useState(false);
    const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button>
                        <Plus className="h-4 w-4" />
                        {t("create.trigger")}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                    <DropdownMenuItem onClick={() => setTemplatePickerOpen(true)} className="gap-2 cursor-pointer">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {t("create.fromTemplate")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScratchOpen(true)} className="gap-2 cursor-pointer">
                        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                        {t("create.fromScratch")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AgentDrawer
                open={scratchOpen}
                onOpenChange={setScratchOpen}
                onSuccess={onSuccess}
            />

            <TemplatePickerDrawer
                open={templatePickerOpen}
                onOpenChange={setTemplatePickerOpen}
                onSuccess={onSuccess}
            />
        </>
    );
}

export default function AgentsPage() {
    const t = useTranslations("agents");
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"card" | "list">("card");
    const [isMobile, setIsMobile] = useState(false);
    const [hasHydrated, setHasHydrated] = useState(false);

    // Initial load from localStorage and mobile check
    useEffect(() => {
        const savedView = localStorage.getItem("agents_view_mode");
        if (savedView === "list" || savedView === "card") {
            setViewMode(savedView);
        }

        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        setHasHydrated(true);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Save to localStorage when viewMode changes
    useEffect(() => {
        if (hasHydrated) {
            localStorage.setItem("agents_view_mode", viewMode);
        }
    }, [viewMode, hasHydrated]);

    const fetchAgents = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/agents`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setAgents(response.data.data.agents);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this agent?")) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/agents/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.deleted"));
            fetchAgents();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.deleteFailed"));
        }
    };

    useEffect(() => {
        fetchAgents();
    }, [fetchAgents]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{t("title")}</h1>
                    <p className="text-muted-foreground">{t("subtitle")}</p>
                </div>
                <div className="flex items-center gap-4">
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "card" | "list")} className="hidden md:block">
                        <TabsList className="bg-muted">
                            <TabsTrigger value="card" className="data-[state=active]:bg-background">
                                <LayoutGrid className="h-4 w-4 me-2" />
                                {t("view.cards")}
                            </TabsTrigger>
                            <TabsTrigger value="list" className="data-[state=active]:bg-background">
                                <List className="h-4 w-4 me-2" />
                                {t("view.list")}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <CreateAgentButton onSuccess={fetchAgents} />
                </div>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : agents.length > 0 ? (
                (viewMode === "card" || isMobile) ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6 min-w-0">
                        {agents.map((agent) => (
                            <Card key={agent._id} className="flex flex-col overflow-hidden border border-0 rounded-xl bg-card shadow-sm transition-shadow hover:shadow-md !pb-0 min-w-0 w-full">
                                {/* Agent identity: icon + name + voice pill */}
                                <CardHeader className="pb-3 px-4 sm:px-5 lg:px-6 min-w-0 overflow-hidden">
                                    <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                                        <div
                                            className="h-12 w-12 shrink-0 rounded-lg sm:h-14 sm:w-14 sm:rounded-xl lg:h-[72px] lg:w-[72px] flex items-center justify-center overflow-hidden bg-cover bg-center flex-shrink-0"
                                            style={{ backgroundImage: `url(${getAgentGradientUrl(agent.name)})` }}
                                        >
                                            <span className="flex items-center justify-center text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.2)] mix-blend-overlay">
                                                <Bot className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8" strokeWidth={1.75} />
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1 overflow-hidden space-y-1.5 sm:space-y-2">
                                            <CardTitle className="text-sm font-bold leading-tight sm:text-base line-clamp-2 min-w-0">{agent.name}</CardTitle>
                                            <div className="rounded-lg bg-muted/60 border border-border/80 px-2 py-1 sm:px-2.5 sm:py-1.5 min-w-0 overflow-hidden">
                                                <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-medium text-foreground leading-tight sm:text-sm min-w-0">
                                                    <Mic className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-muted-foreground flex-shrink-0" />
                                                    <span className="truncate block min-w-0">
                                                        {agentVoiceLabel(agent)}
                                                    </span>
                                                </div>
                                                <p className="mt-0.5 text-[10px] sm:text-[11px] text-muted-foreground leading-tight truncate min-w-0">
                                                    {agentVoiceProvider(agent)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                {/* Attributes: phone, language, knowledge base */}
                                <CardContent className="pt-0 pb-3 sm:pb-4 px-4 sm:px-5 lg:px-6 min-w-0 overflow-hidden">
                                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                        {agent.outboundPhoneNumber && (
                                            <span className="inline-flex items-center gap-1.5 sm:gap-2 rounded-md sm:rounded-lg bg-muted/50 border border-border/60 px-2 py-1.5 sm:px-3 sm:py-2 text-xs font-medium text-foreground sm:text-sm min-w-0 max-w-full overflow-hidden">
                                                <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                                                <span className="truncate min-w-0 ltr-data">{agent.outboundPhoneNumber.phoneNumber}</span>
                                            </span>
                                        )}
                                        {agentLangCode(agent) && (
                                            <Badge variant="outline" className="rounded-md sm:rounded-lg border-border bg-muted/50 px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium h-auto min-w-0 max-w-full overflow-hidden">
                                                {agentLangFlag(agent) && (
                                                    <span className="me-1.5 sm:me-2 text-sm sm:text-base leading-none shrink-0" aria-hidden>{agentLangFlag(agent)}</span>
                                                )}
                                                <span className="truncate min-w-0">{agentLangLabel(agent)}</span>
                                            </Badge>
                                        )}
                                        {agent.knowledgeBaseId && (
                                            <Badge className="rounded-md sm:rounded-lg bg-purple-100 text-purple-800 border border-purple-200/60 dark:bg-purple-900/25 dark:text-purple-200 dark:border-purple-800/40 px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium h-auto min-w-0 max-w-full overflow-hidden hover:bg-purple-100 dark:hover:bg-purple-900/25">
                                                <Database className="me-1.5 h-3.5 w-3.5 sm:me-2 sm:h-4 sm:w-4 shrink-0 text-purple-600 dark:text-purple-300" />
                                                <span className="truncate min-w-0">{agent.knowledgeBaseId.name}</span>
                                            </Badge>
                                        )}
                                        {agent.appointmentBookingEnabled && (
                                            <Badge className="rounded-md sm:rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200/60 dark:bg-emerald-900/25 dark:text-emerald-200 dark:border-emerald-800/40 px-2 py-1 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium h-auto min-w-0 max-w-full overflow-hidden hover:bg-emerald-100 dark:hover:bg-emerald-900/25">
                                                <Calendar className="me-1.5 h-3.5 w-3.5 sm:me-2 sm:h-4 sm:w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                                                <span className="truncate min-w-0">{t("badge.appointments")}</span>
                                            </Badge>
                                        )}
                                    </div>
                                </CardContent>
                                {/* Actions */}
                                <div className="mt-auto border-t border-border/80 px-3 pt-2 pb-2 sm:px-4 sm:pt-2.5 sm:pb-2.5 flex items-center gap-0 min-h-[44px] sm:min-h-[48px]">
                                    <AgentTestDrawer
                                        agent={agent}
                                        engineLabel={agentVoiceProvider(agent)}
                                        voiceLabel={agentVoiceLabel(agent)}
                                        languageLabel={agentLangLabel(agent)}
                                        trigger={
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={!agent.useCustomVoice}
                                                title={agent.useCustomVoice ? undefined : t("test.notTestable")}
                                                className="h-9 sm:h-10 flex-1 justify-center gap-1 sm:gap-1.5 px-1 sm:px-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted rounded-md min-w-0"
                                            >
                                                <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">{t("test.triggerShort")}</span>
                                            </Button>
                                        }
                                    />
                                    <div className="h-6 w-px sm:h-8 bg-border shrink-0" aria-hidden />
                                    <AgentDrawer
                                        agent={agent}
                                        onSuccess={fetchAgents}
                                        trigger={
                                            <Button variant="ghost" size="sm" className="h-9 sm:h-10 flex-1 justify-center gap-1 sm:gap-1.5 px-1 sm:px-2 text-xs sm:text-sm font-medium text-foreground hover:bg-muted rounded-md min-w-0">
                                                <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">{t("actions.edit")}</span>
                                            </Button>
                                        }
                                    />
                                    <div className="h-6 w-px sm:h-8 bg-border shrink-0" aria-hidden />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 sm:h-10 flex-1 justify-center gap-1 sm:gap-1.5 px-1 sm:px-2 text-xs sm:text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive rounded-md min-w-0"
                                        onClick={() => handleDelete(agent._id)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                                        <span className="truncate">{t("actions.delete")}</span>
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Card className="overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[200px]">{t("table.name")}</TableHead>
                                    <TableHead>{t("table.voice")}</TableHead>
                                    <TableHead className="max-w-[300px]">{t("table.openingMessage")}</TableHead>
                                    <TableHead>{t("table.createdAt")}</TableHead>
                                    <TableHead className="text-end">{t("table.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {agents.map((agent) => (
                                    <TableRow key={agent._id}>
                                        <TableCell className="font-medium">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div
                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded overflow-hidden bg-cover bg-center"
                                                    style={{ backgroundImage: `url(${getAgentGradientUrl(agent.name)})` }}
                                                >
                                                    <span className="flex items-center justify-center text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.2)] mix-blend-overlay">
                                                        <Bot className="h-4 w-4" strokeWidth={1.75} />
                                                    </span>
                                                </div>
                                                <span>{agent.name}</span>
                                                {agent.appointmentBookingEnabled && (
                                                    <Badge className="text-[10px] font-medium h-6 gap-1 px-2 py-0 bg-emerald-100 text-emerald-800 border border-emerald-200/60 dark:bg-emerald-900/25 dark:text-emerald-200 dark:border-emerald-800/40">
                                                        <Calendar className="h-3 w-3 shrink-0" />
                                                        {t("badge.appointments")}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Mic className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-xs">
                                                    {agentVoiceLabel(agent)}
                                                </span>
                                                {agent.outboundPhoneNumber && (
                                                    <div className="flex items-center gap-1 mt-1 font-mono text-[10px] text-primary">
                                                        <Hash className="h-2.5 w-2.5" />
                                                        <span className="ltr-data">{agent.outboundPhoneNumber.phoneNumber}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[300px]">
                                            <p className="text-xs text-muted-foreground truncate italic">
                                                &quot;{agent.openingMessage}&quot;
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {new Date(agent.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-end">
                                            <div className="flex items-center justify-end gap-2">
                                                <AgentTestDrawer
                                                    agent={agent}
                                                    engineLabel={agentVoiceProvider(agent)}
                                                    voiceLabel={agentVoiceLabel(agent)}
                                                    languageLabel={agentLangLabel(agent)}
                                                    trigger={
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-xs"
                                                            disabled={!agent.useCustomVoice}
                                                            title={agent.useCustomVoice ? undefined : t("test.notTestable")}
                                                        >
                                                            <Mic className="me-1.5 h-3 w-3" />
                                                            {t("test.trigger")}
                                                        </Button>
                                                    }
                                                />
                                                <AgentDrawer
                                                    agent={agent}
                                                    onSuccess={fetchAgents}
                                                    trigger={
                                                        <Button variant="outline" size="sm" className="h-7 text-xs">
                                                            <Pencil className="me-1.5 h-3 w-3" />
                                                            {t("actions.edit")}
                                                        </Button>
                                                    }
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    onClick={() => handleDelete(agent._id)}
                                                >
                                                    <Trash2 className="me-1.5 h-3 w-3" />
                                                    {t("actions.delete")}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>
                )
            ) : (
                <Empty className="border border-dashed">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Bot />
                        </EmptyMedia>
                        <EmptyTitle>{t("empty.title")}</EmptyTitle>
                        <EmptyDescription>
                            {t("empty.description")}
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <CreateAgentButton onSuccess={fetchAgents} />
                    </EmptyContent>
                </Empty>
            )}
        </div>
    );
}
