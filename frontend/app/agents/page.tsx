"use client";

import { useEffect, useState, useCallback } from "react";
import { Robot, PencilSimple, Trash, Microphone, SquaresFour, List, Phone, Hash, Database, Plus, FileText, SlidersHorizontal, Calendar } from "@phosphor-icons/react";
import {
    Avatar,
    Badge,
    Button,
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    EmptyState,
    PageHeader,
    Separator,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsList,
    TabsTrigger,
    toast,
    useConfirm,
} from "@wixzel/react";
import { AgentDrawer } from "@/components/agents/agent-drawer";
import { AgentTestDrawer } from "@/components/agents/agent-test-drawer";
import { TemplatePickerDrawer } from "@/components/agents/template-picker-drawer";
import { SARVAM_LANGUAGES } from "@/components/agents/sarvam-options";
import { GEMINI_LANGUAGES } from "@/components/agents/gemini-options";
import { agentVoiceLabel, agentVoiceProvider } from "@/components/agents/voice-engines";
import axios from "axios";
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
    deepgramVoice?: string;
    appointmentBookingEnabled?: boolean;
    createdAt: string;
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
                    <Button variant="primary" iconStart={<Plus />}>
                        {t("create.trigger")}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setTemplatePickerOpen(true)}>
                        <FileText />
                        {t("create.fromTemplate")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScratchOpen(true)}>
                        <SlidersHorizontal />
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
    const confirm = useConfirm();
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
        const ok = await confirm({
            title: t("actions.deleteAgent"),
            description: "Are you sure you want to delete this agent?",
            confirmLabel: t("actions.delete"),
            tone: "danger",
        });
        if (!ok) return;
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
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("subtitle")}
                actions={
                    <>
                        <Tabs variant="segment" value={viewMode} onValueChange={(v) => setViewMode(v as "card" | "list")} className="hidden md:flex">
                            <TabsList>
                                <TabsTrigger value="card">
                                    <SquaresFour />
                                    {t("view.cards")}
                                </TabsTrigger>
                                <TabsTrigger value="list">
                                    <List />
                                    {t("view.list")}
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <CreateAgentButton onSuccess={fetchAgents} />
                    </>
                }
            />

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Spinner size="xl" className="text-fg-muted" />
                </div>
            ) : agents.length > 0 ? (
                (viewMode === "card" || isMobile) ? (
                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {agents.map((agent) => (
                            <Card key={agent._id} className="min-w-0 w-full overflow-hidden">
                                {/* Agent identity: avatar + name + voice pill */}
                                <CardHeader className="min-w-0 flex-row items-start gap-3 sm:gap-4">
                                    <Avatar name={agent.name} shape="square" size="xl" />
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <CardTitle className="line-clamp-2 min-w-0">{agent.name}</CardTitle>
                                        <div className="min-w-0 rounded-md bg-surface px-2.5 py-1.5">
                                            <div className="flex min-w-0 items-center gap-1.5 text-body-sm font-medium text-fg">
                                                <Microphone className="size-3.5 shrink-0 text-fg-muted" />
                                                <span className="block min-w-0 truncate">
                                                    {agentVoiceLabel(agent)}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 min-w-0 truncate text-caption text-fg-muted">
                                                {agentVoiceProvider(agent)}
                                            </p>
                                        </div>
                                    </div>
                                </CardHeader>
                                {/* Attributes: phone, language, knowledge base */}
                                <CardContent className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    {agent.outboundPhoneNumber && (
                                        <Badge className="min-w-0 max-w-full">
                                            <Phone />
                                            <span className="min-w-0 truncate ltr-data">{agent.outboundPhoneNumber.phoneNumber}</span>
                                        </Badge>
                                    )}
                                    {agentLangCode(agent) && (
                                        <Badge className="min-w-0 max-w-full">
                                            {agentLangFlag(agent) && (
                                                <span className="shrink-0 leading-none" aria-hidden>{agentLangFlag(agent)}</span>
                                            )}
                                            <span className="min-w-0 truncate">{agentLangLabel(agent)}</span>
                                        </Badge>
                                    )}
                                    {agent.knowledgeBaseId && (
                                        <Badge tone="accent" className="min-w-0 max-w-full">
                                            <Database />
                                            <span className="min-w-0 truncate">{agent.knowledgeBaseId.name}</span>
                                        </Badge>
                                    )}
                                    {agent.appointmentBookingEnabled && (
                                        <Badge tone="success" className="min-w-0 max-w-full">
                                            <Calendar />
                                            <span className="min-w-0 truncate">{t("badge.appointments")}</span>
                                        </Badge>
                                    )}
                                </CardContent>
                                {/* Actions */}
                                <CardFooter className="gap-1 px-2 py-2">
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
                                                iconStart={<Microphone />}
                                                className="min-w-0 flex-1"
                                            >
                                                <span className="truncate">{t("test.triggerShort")}</span>
                                            </Button>
                                        }
                                    />
                                    <Separator orientation="vertical" className="h-6 self-center" />
                                    <AgentDrawer
                                        agent={agent}
                                        onSuccess={fetchAgents}
                                        trigger={
                                            <Button variant="ghost" size="sm" iconStart={<PencilSimple />} className="min-w-0 flex-1">
                                                <span className="truncate">{t("actions.edit")}</span>
                                            </Button>
                                        }
                                    />
                                    <Separator orientation="vertical" className="h-6 self-center" />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        iconStart={<Trash />}
                                        className="min-w-0 flex-1"
                                        onClick={() => handleDelete(agent._id)}
                                    >
                                        <span className="truncate">{t("actions.delete")}</span>
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[200px]">{t("table.name")}</TableHead>
                                <TableHead>{t("table.voice")}</TableHead>
                                <TableHead className="max-w-[300px]">{t("table.openingMessage")}</TableHead>
                                <TableHead>{t("table.createdAt")}</TableHead>
                                <TableHead align="end">{t("table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {agents.map((agent) => (
                                <TableRow key={agent._id}>
                                    <TableCell className="font-medium">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Avatar name={agent.name} shape="square" size="md" />
                                            <span>{agent.name}</span>
                                            {agent.appointmentBookingEnabled && (
                                                <Badge tone="success" size="sm">
                                                    <Calendar />
                                                    {t("badge.appointments")}
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Microphone className="size-3 text-fg-muted" />
                                            <span className="text-caption">
                                                {agentVoiceLabel(agent)}
                                            </span>
                                            {agent.outboundPhoneNumber && (
                                                <div className="mt-1 flex items-center gap-1 font-mono text-caption text-accent-ink">
                                                    <Hash className="size-2.5" />
                                                    <span className="ltr-data">{agent.outboundPhoneNumber.phoneNumber}</span>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="max-w-[300px]">
                                        <p className="truncate text-caption italic text-fg-muted">
                                            &quot;{agent.openingMessage}&quot;
                                        </p>
                                    </TableCell>
                                    <TableCell className="text-fg-muted">
                                        {new Date(agent.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell align="end">
                                        <div className="flex items-center justify-end gap-2">
                                            <AgentTestDrawer
                                                agent={agent}
                                                engineLabel={agentVoiceProvider(agent)}
                                                voiceLabel={agentVoiceLabel(agent)}
                                                languageLabel={agentLangLabel(agent)}
                                                trigger={
                                                    <Button
                                                        variant="secondary"
                                                        size="xs"
                                                        iconStart={<Microphone />}
                                                        disabled={!agent.useCustomVoice}
                                                        title={agent.useCustomVoice ? undefined : t("test.notTestable")}
                                                    >
                                                        {t("test.trigger")}
                                                    </Button>
                                                }
                                            />
                                            <AgentDrawer
                                                agent={agent}
                                                onSuccess={fetchAgents}
                                                trigger={
                                                    <Button variant="secondary" size="xs" iconStart={<PencilSimple />}>
                                                        {t("actions.edit")}
                                                    </Button>
                                                }
                                            />
                                            <Button
                                                variant="ghost"
                                                size="xs"
                                                iconStart={<Trash />}
                                                onClick={() => handleDelete(agent._id)}
                                            >
                                                {t("actions.delete")}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )
            ) : (
                <EmptyState
                    icon={<Robot />}
                    title={t("empty.title")}
                    description={t("empty.description")}
                    actions={<CreateAgentButton onSuccess={fetchAgents} />}
                />
            )}
        </div>
    );
}
