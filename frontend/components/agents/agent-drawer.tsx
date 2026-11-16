"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
    Alert,
    Avatar,
    Badge,
    Button,
    Checkbox,
    Combobox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
    Field,
    Input,
    Label,
    RadioCard,
    RadioCards,
    Section,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Spinner,
    Switch,
    Textarea,
    toast,
    type ComboboxItem,
} from "@wixzel/react";
import axios from "axios";
import { Plus, Pause, SpeakerHigh, Hash, Database, Calendar, Microphone, Robot, Sparkle, Timer, PhoneTransfer, Trash, PuzzlePiece, Wrench, Plugs } from "@phosphor-icons/react";
import type { AgentTemplate } from "@/lib/agent-templates";
import { ToolForm, MAX_TOOLS_PER_AGENT, hostOf, type Tool } from "@/components/tools/tool-form";
import type { McpServer } from "@/components/integrations/mcp";
import { AgentWhatsAppCard } from "@/components/whatsapp/agent-whatsapp-card";
import { agentWhatsAppOf, type AgentWhatsApp, type WhatsAppAccount } from "@/components/whatsapp/types";
import { AppIcon } from "@/components/integrations/app-icon";
import { appForUrl, hostOf as mcpHostOf } from "@/lib/app-catalog";
import { SARVAM_SPEAKERS, SARVAM_LANGUAGES, SARVAM_DEFAULT_SPEAKER, resolveSarvamSpeaker } from "./sarvam-options";
import { GEMINI_VOICES, GEMINI_LANGUAGES, GEMINI_DEFAULT_VOICE, GEMINI_AUTO_LANGUAGE } from "./gemini-options";
import { missingKeysForEngine as engineMissingKeys, usableEngines, deepgramVoiceName, type EngineId, type EngineConfigStatus } from "./voice-engines";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface ConfigStatus {
    isTwilioConfigured: boolean;
    isElevenLabsConfigured: boolean;
    isDeepgramConfigured: boolean;
    isModelConfigured: boolean;
    isSarvamConfigured?: boolean;
    isGeminiConfigured?: boolean;
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
    voiceEngine?: string;
    voiceQualityPreset?: string;
    elevenLabsVoiceSettings?: {
        stability?: number | null;
        similarityBoost?: number | null;
        style?: number | null;
        useSpeakerBoost?: boolean | null;
        speed?: number | null;
        model?: string;
        latencyProfile?: string;
    };
    turnTaking?: {
        endpointingMs?: number | null;
        silenceWaitMs?: number | null;
        interruptSensitivity?: string;
    };
    sarvamSpeaker?: string;
    sarvamLanguage?: string;
    geminiVoice?: string;
    geminiLanguage?: string;
    deepgramVoice?: string;
    outboundPhoneNumber?: any;
    knowledgeBaseId?: any;
    kbSettings?: {
        useBasicInfo: boolean;
        useFaqs: boolean;
        useOtherInfo: boolean;
    };
    language?: string;
    appointmentBookingEnabled?: boolean;
    appointmentDescription?: string;
    humanTransfer?: Partial<HumanTransferConfig>;
    /** Tools this agent may call, as ids (or populated tools) from GET /agents. */
    toolIds?: (string | { _id: string })[];
    /** MCP servers (Integrations) whose tools this agent may call. */
    mcpServerIds?: string[];
    /** WhatsApp: the number it sends from on calls, and its WhatsApp tools. */
    whatsapp?: Partial<AgentWhatsApp>;
}

/** The agent's tool ids as strings, whether the API sent ids or populated tools. */
function toolIdsOf(agent?: Agent): string[] {
    return (agent?.toolIds ?? []).map((x) => (typeof x === "string" ? x : String(x?._id ?? ""))).filter(Boolean);
}

/** The most MCP servers one agent may carry; the API enforces the same cap. */
const MAX_MCP_SERVERS_PER_AGENT = 5;

/** The agent's MCP server ids as strings, whether the API sent ids or populated servers. */
function mcpServerIdsOf(agent?: Agent): string[] {
    return (agent?.mcpServerIds ?? []).map((x) => (typeof x === "string" ? x : String((x as { _id?: string })?._id ?? ""))).filter(Boolean);
}

/** One authorised human the agent may hand the caller to. */
interface TransferDestination {
    id: string;
    name: string;
    type: "phone";
    value: string;
    enabled: boolean;
    /** null = inherit the agent-wide ring time. */
    timeoutSeconds: number | null;
}

interface HumanTransferConfig {
    enabled: boolean;
    mode: "blind";
    defaultDestinationId: string;
    ringTimeoutSeconds: number;
    maxTransfersPerCall: number;
    returnToAgentOnFailure: boolean;
    destinations: TransferDestination[];
}

interface Voice {
    voice_id: string;
    name: string;
    preview_url: string;
    category: string;
    labels?: Record<string, string>;
    /** Set on ElevenLabs Voice Library voices, which must be added to the account before use. */
    public_owner_id?: string;
}

/** A Deepgram Aura text-to-speech voice, as returned by GET /agents/deepgram-voices. */
interface DeepgramVoice {
    model: string;
    name: string;
    accent: string;
    tags: string[];
    preview_url: string | null;
}

/** Aura voice a Deepgram Voice Agent falls back to until the language's list has loaded. */
const DEFAULT_DEEPGRAM_VOICE = "aura-2-thalia-en";

/**
 * Voice Quality & Conversation form state derived from an agent (or defaults for a
 * new one). Numbers are concrete (never null) so the sliders always have a value;
 * saving them is harmless because they equal the backend defaults.
 */
/** Destination IDs the backend accepts — kept in step with routes/agents.js. */
const TRANSFER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TRANSFER_PHONE_RE = /^\+?[1-9]\d{6,14}$/;

/**
 * Human Transfer form state derived from an agent (or defaults for a new one). Agents
 * saved before v11.5 have no humanTransfer at all, so every field falls back to the same
 * default the Mongoose schema applies — saving them changes nothing.
 */
function humanTransferFormState(agent?: Agent) {
    const h = agent?.humanTransfer || {};
    return {
        humanTransfer: {
            enabled: Boolean(h.enabled),
            mode: "blind" as const,
            defaultDestinationId: String(h.defaultDestinationId || ""),
            ringTimeoutSeconds: Math.max(5, Math.min(60, Number(h.ringTimeoutSeconds) || 20)),
            maxTransfersPerCall: Math.max(1, Math.min(10, Number(h.maxTransfersPerCall) || 3)),
            returnToAgentOnFailure: h.returnToAgentOnFailure !== false,
            destinations: (Array.isArray(h.destinations) ? h.destinations : []).map((d: any) => ({
                id: String(d?.id || ""),
                name: String(d?.name || ""),
                type: "phone" as const,
                value: String(d?.value || ""),
                enabled: d?.enabled !== false,
                timeoutSeconds:
                    d?.timeoutSeconds === null || d?.timeoutSeconds === undefined || d?.timeoutSeconds === ""
                        ? null
                        : Math.max(5, Math.min(60, Number(d.timeoutSeconds) || 20)),
            })),
        } as HumanTransferConfig,
    };
}

function voiceQualityFormState(agent?: Agent) {
    return {
        voiceQualityPreset: agent?.voiceQualityPreset || "default",
        elevenLabsVoiceSettings: {
            stability: agent?.elevenLabsVoiceSettings?.stability ?? 0.5,
            similarityBoost: agent?.elevenLabsVoiceSettings?.similarityBoost ?? 0.75,
            style: agent?.elevenLabsVoiceSettings?.style ?? 0,
            useSpeakerBoost: agent?.elevenLabsVoiceSettings?.useSpeakerBoost ?? true,
            speed: agent?.elevenLabsVoiceSettings?.speed ?? 1.0,
            model: agent?.elevenLabsVoiceSettings?.model || "auto",
            latencyProfile: agent?.elevenLabsVoiceSettings?.latencyProfile || "auto",
        },
        turnTaking: {
            endpointingMs: agent?.turnTaking?.endpointingMs ?? 300,
            silenceWaitMs: agent?.turnTaking?.silenceWaitMs ?? 500,
            interruptSensitivity: agent?.turnTaking?.interruptSensitivity || "normal",
        },
    };
}

interface AgentDrawerProps {
    agent?: Agent;
    trigger?: React.ReactNode;
    onSuccess?: () => void;
    templateData?: AgentTemplate;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function AgentDrawer({ agent, trigger, onSuccess, templateData, open: controlledOpen, onOpenChange }: AgentDrawerProps) {
    const t = useTranslations("agents");
    const c = useTranslations("common");
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = (value: boolean) => {
        if (isControlled) {
            onOpenChange?.(value);
        } else {
            setInternalOpen(value);
        }
    };
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: agent?.name || "",
        systemPrompt: agent?.systemPrompt || "",
        openingMessage: agent?.openingMessage || "",
        voice: agent?.voice || "Polly.Amy",
        voiceId: agent?.voiceId || "",
        voiceName: agent?.voiceName || "Rachel",
        useCustomVoice: agent?.useCustomVoice || false,
        voiceEngine: agent?.voiceEngine || "classic",
        sarvamSpeaker: resolveSarvamSpeaker(agent?.sarvamSpeaker),
        sarvamLanguage: agent?.sarvamLanguage || "hi-IN",
        geminiVoice: agent?.geminiVoice || GEMINI_DEFAULT_VOICE,
        deepgramVoice: agent?.deepgramVoice || "",
        geminiLanguage: agent?.geminiLanguage || GEMINI_AUTO_LANGUAGE,
        outboundPhoneNumber: agent?.outboundPhoneNumber?._id || agent?.outboundPhoneNumber || "none",
        knowledgeBaseId: agent?.knowledgeBaseId?._id || agent?.knowledgeBaseId || "none",
        language: agent?.language || "en",
        appointmentBookingEnabled: agent?.appointmentBookingEnabled || false,
        appointmentDescription: agent?.appointmentDescription || "",
        kbSettings: {
            useBasicInfo: agent?.kbSettings?.useBasicInfo ?? true,
            useFaqs: agent?.kbSettings?.useFaqs ?? true,
            useOtherInfo: agent?.kbSettings?.useOtherInfo ?? true,
        },
        toolIds: toolIdsOf(agent),
        mcpServerIds: mcpServerIdsOf(agent),
        whatsapp: agentWhatsAppOf(agent?.whatsapp),
        ...voiceQualityFormState(agent),
        ...humanTransferFormState(agent)
    });
    const [voices, setVoices] = useState<Voice[]>([]);
    const [tools, setTools] = useState<Tool[]>([]);
    const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
    // The account's WhatsApp numbers, for the WhatsApp card; null until they load.
    const [waAccounts, setWaAccounts] = useState<WhatsAppAccount[] | null>(null);
    const [newToolOpen, setNewToolOpen] = useState(false);
    const [sharedVoices, setSharedVoices] = useState<Voice[]>([]);
    const [addingVoiceId, setAddingVoiceId] = useState<string | null>(null);
    const [deepgramVoices, setDeepgramVoices] = useState<DeepgramVoice[]>([]);
    const [fetchingDeepgramVoices, setFetchingDeepgramVoices] = useState(false);
    const [deepgramVoicesError, setDeepgramVoicesError] = useState<string | null>(null);
    // True once deepgramVoices holds Deepgram's answer for the current language — an empty
    // list before the first response must not read as "no voices for this language".
    const [deepgramVoicesLoaded, setDeepgramVoicesLoaded] = useState(false);
    // Drop responses that arrive after a newer request (the language changed mid-flight).
    const voicesRequestRef = useRef(0);
    const deepgramVoicesRequestRef = useRef(0);
    const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
    const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
    const [fetchingVoices, setFetchingVoices] = useState(false);
    const [fetchVoicesError, setFetchVoicesError] = useState<string | null>(null);
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const [sarvamPreviewLoading, setSarvamPreviewLoading] = useState(false);
    const [sarvamPreviewPlaying, setSarvamPreviewPlaying] = useState(false);
    const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const prevOpenRef = useRef(false);

    /**
     * Which provider keys a given streaming engine is missing.
     *
     * Availability is per-engine, not global: Sarvam and Gemini Live are fully
     * self-contained, so having only that one key must still leave the engine
     * selectable. The math lives in ./voice-engines (mirroring
     * backend/utils/engine-keys.js); this wrapper just binds the fetched status.
     * Returns [] while configStatus is still loading, so nothing is blocked prematurely.
     */
    const missingKeysForEngine = (engine: string, deepgramVoice?: string | null): string[] =>
        engineMissingKeys(engine as EngineId, (configStatus ?? null) as EngineConfigStatus | null, deepgramVoice);

    useEffect(() => {
        if (open) {
            fetchPhoneNumbers();
            fetchConfigStatus();
            fetchKnowledgeBases();
            fetchTools();
            fetchMcpServers();
            fetchWhatsAppAccounts();
            if (prevOpenRef.current === false) {
                if (agent) {
                    setFormData({
                        name: agent.name,
                        systemPrompt: agent.systemPrompt,
                        openingMessage: agent.openingMessage,
                        voice: agent.voice || "Polly.Amy",
                        voiceId: agent.voiceId || "",
                        voiceName: agent.voiceName || "Rachel",
                        useCustomVoice: agent.useCustomVoice ?? false,
                        voiceEngine: agent.voiceEngine || "classic",
                        sarvamSpeaker: resolveSarvamSpeaker(agent.sarvamSpeaker),
                        sarvamLanguage: agent.sarvamLanguage || "hi-IN",
                        geminiVoice: agent.geminiVoice || GEMINI_DEFAULT_VOICE,
                        deepgramVoice: agent.deepgramVoice || "",
                        geminiLanguage: agent.geminiLanguage || GEMINI_AUTO_LANGUAGE,
                        outboundPhoneNumber: agent.outboundPhoneNumber?._id || agent.outboundPhoneNumber || "none",
                        knowledgeBaseId: agent.knowledgeBaseId?._id || agent.knowledgeBaseId || "none",
                        language: agent.language || "en",
                        appointmentBookingEnabled: agent.appointmentBookingEnabled ?? false,
                        appointmentDescription: agent.appointmentDescription || "",
                        kbSettings: {
                            useBasicInfo: agent.kbSettings?.useBasicInfo ?? true,
                            useFaqs: agent.kbSettings?.useFaqs ?? true,
                            useOtherInfo: agent.kbSettings?.useOtherInfo ?? true,
                        },
                        toolIds: toolIdsOf(agent),
                        mcpServerIds: mcpServerIdsOf(agent),
                        whatsapp: agentWhatsAppOf(agent.whatsapp),
                        ...voiceQualityFormState(agent),
                        ...humanTransferFormState(agent),
                    });
                } else if (templateData) {
                    setFormData({
                        name: templateData.name,
                        systemPrompt: templateData.systemPrompt,
                        openingMessage: templateData.openingMessage,
                        voice: "Polly.Amy",
                        voiceId: templateData.voiceId || "",
                        voiceName: templateData.voiceName || "Rachel",
                        useCustomVoice: templateData.useCustomVoice ?? false,
                        voiceEngine: "classic",
                        sarvamSpeaker: SARVAM_DEFAULT_SPEAKER,
                        sarvamLanguage: "hi-IN",
                        geminiVoice: GEMINI_DEFAULT_VOICE,
                        deepgramVoice: "",
                        geminiLanguage: GEMINI_AUTO_LANGUAGE,
                        outboundPhoneNumber: "none",
                        knowledgeBaseId: "none",
                        language: templateData.language || "en",
                        appointmentBookingEnabled: templateData.appointmentBookingEnabled ?? false,
                        appointmentDescription: templateData.appointmentDescription || "",
                        kbSettings: { useBasicInfo: true, useFaqs: true, useOtherInfo: true },
                        toolIds: [],
                        mcpServerIds: [],
                        whatsapp: agentWhatsAppOf(null),
                        ...voiceQualityFormState(),
                        ...humanTransferFormState(),
                    });
                } else {
                    setFormData({
                        name: "",
                        systemPrompt: "",
                        openingMessage: "",
                        voice: "Polly.Amy",
                        voiceId: "",
                        voiceName: "Rachel",
                        useCustomVoice: false,
                        voiceEngine: "classic",
                        sarvamSpeaker: SARVAM_DEFAULT_SPEAKER,
                        sarvamLanguage: "hi-IN",
                        geminiVoice: GEMINI_DEFAULT_VOICE,
                        deepgramVoice: "",
                        geminiLanguage: GEMINI_AUTO_LANGUAGE,
                        outboundPhoneNumber: "none",
                        knowledgeBaseId: "none",
                        language: "en",
                        appointmentBookingEnabled: false,
                        appointmentDescription: "",
                        kbSettings: { useBasicInfo: true, useFaqs: true, useOtherInfo: true },
                        toolIds: [],
                        mcpServerIds: [],
                        whatsapp: agentWhatsAppOf(null),
                        ...voiceQualityFormState(),
                        ...humanTransferFormState(),
                    });
                }
            }
        }
        prevOpenRef.current = open;
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [open, agent, templateData]);

    const fetchConfigStatus = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/settings/config-status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                const status = response.data.data;
                setConfigStatus(status);
                setFormData(prev => {
                    const next = { ...prev };
                    if (!status.isTwilioConfigured) next.useCustomVoice = true;
                    // For a NEW agent, fall to the first engine the user can actually run, so
                    // configuring only Sarvam (or Gemini) lands there instead of a disabled
                    // "classic". Never re-point an existing agent — that would silently change
                    // its engine. Computed off the freshly fetched status, not component state.
                    if (!agent && engineMissingKeys((next.voiceEngine || "classic") as EngineId, status).length) {
                        const usable = usableEngines(status, false)[0];
                        if (usable) next.voiceEngine = usable;
                    }
                    // A new Deepgram Voice Agent without an ElevenLabs key speaks with Aura.
                    if (!agent && next.voiceEngine === "deepgram_agent" && !status.isElevenLabsConfigured && !next.deepgramVoice) {
                        next.deepgramVoice = DEFAULT_DEEPGRAM_VOICE;
                    }
                    return next;
                });
            }
        } catch (err) {
            console.error("Failed to fetch config status:", err);
        }
    };

    // ElevenLabs voices follow the agent's language: the account's own voices plus the
    // Voice Library's native voices for that language, which "My Voices" alone never has.
    const fetchVoices = async (language: string) => {
        const requestId = ++voicesRequestRef.current;
        try {
            setFetchingVoices(true);
            setFetchVoicesError(null);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/agents/voices`, {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { language },
            });
            if (requestId !== voicesRequestRef.current) return;
            if (response.data?.status === "success") {
                setVoices(response.data.data.voices);
                setSharedVoices(response.data.data.sharedVoices || []);
            }
        } catch (err: any) {
            if (requestId !== voicesRequestRef.current) return;
            console.error("Failed to fetch voices:", err);
            setFetchVoicesError("Please check your ElevenLabs API key in settings.");
        } finally {
            if (requestId === voicesRequestRef.current) setFetchingVoices(false);
        }
    };

    useEffect(() => {
        if (open) fetchVoices(formData.language);
    }, [open, formData.language]);

    // Deepgram Aura voices are language-specific (aura-2-livia-it speaks Italian), so the list
    // is fetched per language, and a voice that doesn't speak the new language is replaced.
    const fetchDeepgramVoices = async (language: string) => {
        const requestId = ++deepgramVoicesRequestRef.current;
        try {
            setFetchingDeepgramVoices(true);
            setDeepgramVoicesLoaded(false);
            setDeepgramVoicesError(null);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/agents/deepgram-voices`, {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { language },
            });
            if (requestId !== deepgramVoicesRequestRef.current) return;
            const list: DeepgramVoice[] = response.data?.data?.voices || [];
            setDeepgramVoices(list);
            setDeepgramVoicesLoaded(true);
            if (list.length) {
                setFormData(prev => (prev.deepgramVoice && !list.some(v => v.model === prev.deepgramVoice))
                    ? { ...prev, deepgramVoice: list[0].model }
                    : prev);
            }
        } catch (err: any) {
            if (requestId !== deepgramVoicesRequestRef.current) return;
            console.error("Failed to fetch Deepgram voices:", err);
            setDeepgramVoices([]);
            setDeepgramVoicesError(err.response?.data?.message || "Failed to fetch voices from Deepgram");
        } finally {
            if (requestId === deepgramVoicesRequestRef.current) setFetchingDeepgramVoices(false);
        }
    };

    const usesDeepgramVoice = formData.voiceEngine === "deepgram_agent" && !!formData.deepgramVoice;
    useEffect(() => {
        if (open && usesDeepgramVoice) fetchDeepgramVoices(formData.language);
    }, [open, usesDeepgramVoice, formData.language]);

    /**
     * ElevenLabs only speaks voices that are in the account's "My Voices", so picking a
     * Voice Library voice adds it there first and stores the id ElevenLabs returns.
     */
    const addLibraryVoice = async (voice: Voice) => {
        if (!voice.public_owner_id) return;
        setAddingVoiceId(voice.voice_id);
        try {
            const token = localStorage.getItem("token");
            const response = await axios.post(`${API_BASE_URL}/agents/voices/library`, {
                publicOwnerId: voice.public_owner_id,
                voiceId: voice.voice_id,
                name: voice.name,
            }, { headers: { 'Authorization': `Bearer ${token}` } });
            const voiceId: string = response.data?.data?.voice_id || voice.voice_id;
            const owned: Voice = { ...voice, voice_id: voiceId, public_owner_id: undefined };
            setVoices(prev => [...prev.filter(v => v.voice_id !== voiceId), owned]);
            setSharedVoices(prev => prev.filter(v => v.voice_id !== voice.voice_id));
            setFormData(prev => ({ ...prev, voiceId, voiceName: voice.name }));
            toast.success(t("drawer.libraryVoiceAdded", { name: voice.name }));
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("drawer.libraryVoiceFailed"));
        } finally {
            setAddingVoiceId(null);
        }
    };

    const fetchPhoneNumbers = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/numbers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setPhoneNumbers(response.data.data.numbers);
            }
        } catch (err) {
            console.error("Failed to fetch phone numbers:", err);
        }
    };

    const fetchKnowledgeBases = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/knowledge-base`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setKnowledgeBases(response.data.data.kbs);
            }
        } catch (err) {
            console.error("Failed to fetch knowledge bases:", err);
        }
    };

    const fetchTools = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/tools`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setTools(response.data.data.tools as Tool[]);
            }
        } catch (err) {
            console.error("Failed to fetch tools:", err);
        }
    };

    const fetchMcpServers = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/mcp-servers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setMcpServers((response.data.data.servers ?? []) as McpServer[]);
            }
        } catch (err) {
            console.error("Failed to fetch MCP servers:", err);
        }
    };

    const fetchWhatsAppAccounts = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/whatsapp/accounts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setWaAccounts(response.data?.status === "success" ? ((response.data.data.accounts ?? []) as WhatsAppAccount[]) : []);
        } catch {
            // No numbers to pick from (the plan may not include WhatsApp); the card says so.
            setWaAccounts([]);
        }
    };

    const toggleMcpServer = (id: string, checked: boolean) => {
        setFormData((prev) => {
            const has = prev.mcpServerIds.includes(id);
            if (checked && !has) {
                if (prev.mcpServerIds.length >= MAX_MCP_SERVERS_PER_AGENT) return prev;
                return { ...prev, mcpServerIds: [...prev.mcpServerIds, id] };
            }
            if (!checked && has) return { ...prev, mcpServerIds: prev.mcpServerIds.filter((x) => x !== id) };
            return prev;
        });
    };

    const toggleTool = (id: string, checked: boolean) => {
        setFormData((prev) => {
            const has = prev.toolIds.includes(id);
            if (checked && !has) {
                if (prev.toolIds.length >= MAX_TOOLS_PER_AGENT) return prev;
                return { ...prev, toolIds: [...prev.toolIds, id] };
            }
            if (!checked && has) return { ...prev, toolIds: prev.toolIds.filter((x) => x !== id) };
            return prev;
        });
    };

    const togglePreview = (e: React.MouseEvent, voice: Voice) => {
        e.preventDefault();
        e.stopPropagation();

        if (previewingId === voice.voice_id) {
            audioRef.current?.pause();
            setPreviewingId(null);
            return;
        }

        if (audioRef.current) {
            audioRef.current.pause();
        }

        const audio = new Audio(voice.preview_url);
        audioRef.current = audio;
        setPreviewingId(voice.voice_id);

        audio.play().catch(console.error);
        audio.onended = () => setPreviewingId(null);
    };

    // Sarvam voices have no pre-hosted preview clips, so we synthesize a short sample on demand
    // (backend POST /agents/sarvam/preview) and play the returned audio.
    const playSarvamPreview = async () => {
        if (sarvamPreviewPlaying) {
            audioRef.current?.pause();
            setSarvamPreviewPlaying(false);
            return;
        }
        if (audioRef.current) audioRef.current.pause();
        setPreviewingId(null);
        try {
            setSarvamPreviewLoading(true);
            const token = localStorage.getItem("token");
            const res = await axios.post(
                `${API_BASE_URL}/agents/sarvam/preview`,
                { speaker: formData.sarvamSpeaker, language: formData.sarvamLanguage },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const b64 = res.data?.data?.audio;
            const contentType = res.data?.data?.contentType || "audio/wav";
            if (!b64) throw new Error("No audio returned");
            const audio = new Audio(`data:${contentType};base64,${b64}`);
            audioRef.current = audio;
            audio.onended = () => setSarvamPreviewPlaying(false);
            audio.onpause = () => setSarvamPreviewPlaying(false);
            setSarvamPreviewPlaying(true);
            await audio.play();
        } catch (err: any) {
            setSarvamPreviewPlaying(false);
            toast.error(err.response?.data?.message || t("toast.sarvamPreviewFailed"));
        } finally {
            setSarvamPreviewLoading(false);
        }
    };

    const isEditing = !!agent;

    // ── Voice Quality & Conversation helpers ──
    const setElSetting = (key: string, value: any) =>
        setFormData({ ...formData, elevenLabsVoiceSettings: { ...formData.elevenLabsVoiceSettings, [key]: value } });
    const setTurnTaking = (key: string, value: any) =>
        setFormData({ ...formData, turnTaking: { ...formData.turnTaking, [key]: value } });

    /** Labeled range slider (no Slider primitive in Wixzel — native range, themed). */
    const vqSlider = (id: string, label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, hint?: string) => (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id}>{label}</Label>
                <span className="font-mono text-caption tabular-nums text-fg-muted">{value.toFixed(2)}</span>
            </div>
            <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                disabled={loading}
                className="h-1.5 w-full cursor-pointer accent-accent"
            />
            {hint && <p className="text-caption text-fg-muted">{hint}</p>}
        </div>
    );

    /** Returns a translated error message, or null when the transfer config is valid. */
    const validateHumanTransfer = (): string | null => {
        const ht = formData.humanTransfer;
        const seen = new Set<string>();
        for (const d of ht.destinations) {
            const id = d.id.trim();
            if (!TRANSFER_ID_RE.test(id)) return t("drawer.errorDestinationId", { id: d.id || "—" });
            if (seen.has(id)) return t("drawer.errorDuplicateId", { id });
            seen.add(id);
            if (!d.name.trim()) return t("drawer.errorDestinationName", { id });
            if (!TRANSFER_PHONE_RE.test(d.value.trim())) {
                return t("drawer.errorDestinationPhone", { name: d.name.trim() || id });
            }
        }
        const enabled = ht.destinations.filter((d) => d.enabled);
        if (ht.enabled && enabled.length === 0) return t("drawer.errorNoDestinations");
        if (ht.defaultDestinationId && !enabled.some((d) => d.id.trim() === ht.defaultDestinationId)) {
            return t("drawer.errorDefaultDestination");
        }
        return null;
    };

    const updateTransfer = (patch: Partial<HumanTransferConfig>) =>
        setFormData((prev) => ({ ...prev, humanTransfer: { ...prev.humanTransfer, ...patch } }));

    const updateDestination = (index: number, patch: Partial<TransferDestination>) =>
        updateTransfer({
            destinations: formData.humanTransfer.destinations.map((d, i) => (i === index ? { ...d, ...patch } : d)),
        });

    const addDestination = () => {
        const used = new Set(formData.humanTransfer.destinations.map((d) => d.id));
        let n = 1;
        while (used.has(`destination_${n}`)) n++;
        updateTransfer({
            destinations: [
                ...formData.humanTransfer.destinations,
                { id: `destination_${n}`, name: "", type: "phone", value: "", enabled: true, timeoutSeconds: null },
            ],
        });
    };

    const removeDestination = (index: number) => {
        const removed = formData.humanTransfer.destinations[index];
        updateTransfer({
            destinations: formData.humanTransfer.destinations.filter((_, i) => i !== index),
            // Never leave the default pointing at a destination that no longer exists.
            ...(formData.humanTransfer.defaultDestinationId === removed?.id ? { defaultDestinationId: "" } : {}),
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // A streaming engine can't run without its own keys — block saving and point to Settings.
        if (formData.useCustomVoice) {
            const missing = missingKeysForEngine(formData.voiceEngine || "classic", formData.deepgramVoice);
            if (missing.length) {
                toast.error(t("toast.keysNotConfigured", { count: missing.length, keys: missing.join(" and ") }));
                return;
            }
        }
        // An Aura voice only speaks its own language. If Deepgram has none for the agent's
        // language, the stored voice is an English fallback that would garble every reply.
        if (formData.useCustomVoice && usesDeepgramVoice && deepgramVoicesLoaded && deepgramVoices.length === 0) {
            toast.error(t("drawer.noDeepgramVoices"));
            return;
        }
        // Human Transfer: mirror the backend's Joi + cross-field rules so a bad destination
        // is caught with a readable message instead of a 400.
        const transferError = validateHumanTransfer();
        if (transferError) {
            toast.error(transferError);
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem("token");

            // Resolve the voice engine from the SAME derivation the dropdown displays,
            // so the payload always matches what the user sees and is always a valid
            // backend enum value. "twilio_standard" is a UI-only pseudo-option: it maps
            // to useCustomVoice=false + a valid engine ('classic'), never sent as-is.
            const selectedNumber = phoneNumbers.find((n) => n._id === formData.outboundPhoneNumber);
            const showTwilioVoices = configStatus?.isTwilioConfigured && selectedNumber?.provider !== "sip";
            const effectiveEngine = (!formData.useCustomVoice && showTwilioVoices)
                ? "twilio_standard"
                : (formData.voiceEngine || "classic");
            const isStandard = effectiveEngine === "twilio_standard";
            const resolvedVoiceEngine = isStandard ? "classic" : effectiveEngine;
            const resolvedUseCustomVoice = !isStandard;

            // Gemini Live only runs on the SIP transport — block saving it against a
            // Twilio number rather than shipping an agent whose calls connect silent.
            // No outbound number is fine: inbound SIP calls pick the agent via the
            // Phone Numbers page assignment, not this field.
            if (effectiveEngine === "gemini_live" && selectedNumber && selectedNumber.provider !== "sip") {
                toast.error(t("toast.geminiSipOnlySave"));
                return;
            }

            const submissionData = {
                ...formData,
                humanTransfer: {
                    ...formData.humanTransfer,
                    destinations: formData.humanTransfer.destinations.map((d) => ({
                        ...d,
                        id: d.id.trim().toLowerCase(),
                        name: d.name.trim(),
                        value: d.value.trim(),
                    })),
                },
                voiceEngine: resolvedVoiceEngine,
                useCustomVoice: resolvedUseCustomVoice,
                outboundPhoneNumber: formData.outboundPhoneNumber === "none" ? null : formData.outboundPhoneNumber,
                knowledgeBaseId: formData.knowledgeBaseId === "none" ? null : formData.knowledgeBaseId,
                toolIds: formData.toolIds.slice(0, MAX_TOOLS_PER_AGENT),
                mcpServerIds: formData.mcpServerIds.slice(0, MAX_MCP_SERVERS_PER_AGENT),
                whatsapp: formData.whatsapp,
            };
            if (isEditing) {
                await axios.patch(`${API_BASE_URL}/agents/${agent._id}`, submissionData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success(t("toast.updated"));
            } else {
                await axios.post(`${API_BASE_URL}/agents`, submissionData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success(t("toast.created"));
            }
            setOpen(false);
            onSuccess?.();
            if (!isEditing) {
                setFormData({
                    name: "",
                    systemPrompt: "",
                    openingMessage: "",
                    voice: "Polly.Amy",
                    voiceId: "",
                    voiceName: "Rachel",
                    useCustomVoice: false,
                    voiceEngine: "classic",
                    sarvamSpeaker: SARVAM_DEFAULT_SPEAKER,
                    sarvamLanguage: "hi-IN",
                    geminiVoice: GEMINI_DEFAULT_VOICE,
                    deepgramVoice: "",
                    geminiLanguage: GEMINI_AUTO_LANGUAGE,
                    outboundPhoneNumber: "none",
                    knowledgeBaseId: "none",
                    language: "en",
                    appointmentBookingEnabled: false,
                    appointmentDescription: "",
                    kbSettings: { useBasicInfo: true, useFaqs: true, useOtherInfo: true },
                    toolIds: [],
                    mcpServerIds: [],
                    whatsapp: agentWhatsAppOf(null),
                    ...voiceQualityFormState(),
                    ...humanTransferFormState()
                });
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.generic"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer open={open} onOpenChange={setOpen}>
            {!isControlled && (
                <DrawerTrigger asChild>
                    {trigger || <Button variant="primary" iconStart={<Plus />}>{t("create.trigger")}</Button>}
                </DrawerTrigger>
            )}
            <DrawerContent side="right" style={{ "--wx-drawer-size": "1180px" } as React.CSSProperties}>
                <DrawerHeader>
                    <DrawerTitle>
                        {isEditing ? t("drawer.editTitle") : t("drawer.createTitle")}
                    </DrawerTitle>
                    <DrawerDescription>
                        {t("drawer.description", { vars: "{{name}}, {{phone}}", custom: "{{appointment_date}}" })}
                    </DrawerDescription>
                </DrawerHeader>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <DrawerBody className="flex flex-col gap-4 overflow-x-hidden">
                        {/* Only warn about keys the SELECTED engine actually needs — an agent on the
                            self-contained Sarvam engine has no use for Deepgram or OpenRouter. */}
                        {(() => {
                            const missing = formData.useCustomVoice ? missingKeysForEngine(formData.voiceEngine || "classic", formData.deepgramVoice) : [];
                            if (!missing.length) return null;
                            return (
                                <Alert
                                    tone="danger"
                                    action={
                                        <Button asChild variant="link" size="sm">
                                            <Link href="/settings">{t("drawer.configure")}</Link>
                                        </Button>
                                    }
                                >
                                    {t("drawer.missingKeysAlert", { count: missing.length, keys: missing.join(" and ") })}
                                </Alert>
                            );
                        })()}

                        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                            {/* LEFT: Prompts & main content */}
                            <Section icon={<Robot />} title={t("drawer.sectionContent")} className="min-w-0">
                                <div className="flex items-start gap-4">
                                    <Avatar name={formData.name} shape="square" size="xl" />
                                    <Field id="agent-name" label={t("drawer.nameLabel")} className="min-w-0 flex-1">
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder={t("drawer.namePlaceholder")}
                                            required
                                            disabled={loading}
                                        />
                                    </Field>
                                </div>

                                <Field
                                    id="system-prompt"
                                    label={t("drawer.systemPromptLabel")}
                                    hint={t("drawer.variableHint", { vars: "{{name}}, {{phone}}", custom: "{{appointment_date}}" })}
                                >
                                    <Textarea
                                        value={formData.systemPrompt}
                                        onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                                        placeholder={t("drawer.systemPromptPlaceholder")}
                                        required
                                        disabled={loading}
                                        className="min-h-[140px] md:min-h-[200px]"
                                    />
                                </Field>

                                <Field
                                    id="opening-message"
                                    label={t("drawer.firstMessageLabel")}
                                    hint={t("drawer.variableHint", { vars: "{{name}}, {{phone}}", custom: "{{appointment_date}}" })}
                                >
                                    <p className="text-caption text-fg-muted">{t("drawer.firstMessageHint")}</p>
                                    <Textarea
                                        value={formData.openingMessage}
                                        onChange={(e) => setFormData({ ...formData, openingMessage: e.target.value })}
                                        placeholder={t("drawer.firstMessagePlaceholder")}
                                        required
                                        disabled={loading}
                                        className="min-h-[88px]"
                                    />
                                </Field>
                            </Section>

                            {/* RIGHT: Voice, language, settings */}
                            <div className="flex min-w-0 flex-col gap-4">
                                <Section icon={<Microphone />} title={t("drawer.sectionVoice")} className="min-w-0">
                                    <Field id="outbound-number" label={t("drawer.outboundNumberLabel")} hint={t("drawer.callerIdHint")}>
                                        <Select
                                            value={formData.outboundPhoneNumber}
                                            onValueChange={(value) => setFormData({ ...formData, outboundPhoneNumber: value })}
                                            disabled={loading}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder={t("drawer.selectNumber")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">{t("drawer.noOutboundNumber")}</SelectItem>
                                                {phoneNumbers.map((num: any) => (
                                                    <SelectItem key={num._id} value={num._id}>
                                                        <span className="inline-flex items-center gap-2">
                                                            <Hash className="size-3.5 text-fg-muted" />
                                                            <span>{num.name} <span className="ltr-data">({num.phoneNumber})</span></span>
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                                {phoneNumbers.length === 0 && (
                                                    <div className="px-2 py-2 text-center text-caption text-fg-muted">
                                                        {t("drawer.noNumbersFound")} <Link href="/phone-numbers" className="font-semibold text-accent-ink underline">{t("drawer.addOne")}</Link>
                                                    </div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </Field>

                                    {(() => {
                                        const selectedNumber = phoneNumbers.find(n => n._id === formData.outboundPhoneNumber);
                                        const isSipNumber = selectedNumber?.provider === 'sip';
                                        // Gemini Live is blocked only by an actual non-SIP (Twilio) outbound number.
                                        // "No outbound number" is fine: inbound SIP calls reach the agent through the
                                        // Phone Numbers page assignment, not through this field.
                                        const isNonSipNumber = !!selectedNumber && selectedNumber.provider !== 'sip';
                                        const showTwilioVoices = configStatus?.isTwilioConfigured && !isSipNumber;

                                        // Unified, engine-first voice model. "Standard (Twilio)" maps to the basic Twilio
                                        // TwiML voice (useCustomVoice=false); the three streaming engines set useCustomVoice=true.
                                        // The engine is chosen first, then the language + voice options below adapt to it.
                                        const engineValue = (!formData.useCustomVoice && showTwilioVoices) ? "twilio_standard" : (formData.voiceEngine || "classic");

                                        const classicMissing = missingKeysForEngine("classic");
                                        const dgAgentMissing = missingKeysForEngine("deepgram_agent");
                                        const sarvamMissing = missingKeysForEngine("sarvam");
                                        const geminiMissing = missingKeysForEngine("gemini_live");
                                        const selectedEngineMissing = missingKeysForEngine(engineValue, formData.deepgramVoice);
                                        const missingLabel = (keys: string[]) => t("engines.missingKeysOption", { count: keys.length, keys: keys.join(" + ") });

                                        const handleEngineChange = (value: string) => {
                                            if (value === "gemini_live" && isNonSipNumber) {
                                                toast.error(t("toast.geminiSipOnly"));
                                                return;
                                            }
                                            const missing = value === "twilio_standard" ? [] : missingKeysForEngine(value);
                                            if (missing.length) {
                                                toast.error(t("toast.addKeysForEngine", { count: missing.length, keys: missing.join(" and ") }));
                                                return;
                                            }
                                            if (value === "twilio_standard") {
                                                // Standard (Twilio) is not a streaming engine — keep voiceEngine
                                                // at a valid enum so form state never drifts out of sync.
                                                setFormData({ ...formData, useCustomVoice: false, voiceEngine: "classic" });
                                            } else if (value === "deepgram_agent" && !configStatus?.isElevenLabsConfigured && !formData.deepgramVoice) {
                                                // Without an ElevenLabs key, the only voice this engine can use is Aura.
                                                setFormData({ ...formData, useCustomVoice: true, voiceEngine: value, deepgramVoice: DEFAULT_DEEPGRAM_VOICE });
                                            } else {
                                                setFormData({ ...formData, useCustomVoice: true, voiceEngine: value });
                                            }
                                        };

                                        // Languages a classic / Deepgram agent can speak, with their flags.
                                        const generalLanguages: [string, string, string?][] = [
                                            ["en", "en", "🇺🇸"],
                                            ["ar", "ar", "🇸🇦"],
                                            ["hi", "hi", "🇮🇳"],
                                            ["he", "he", "🇮🇱"],
                                            ["es", "es", "🇪🇸"],
                                            ["fr", "fr", "🇫🇷"],
                                            ["de", "de", "🇩🇪"],
                                            ["pt", "pt", "🇵🇹"],
                                            ["pt-BR", "ptBR", "🇧🇷"],
                                            ["it", "it", "🇮🇹"],
                                            ["ru", "ru", "🇷🇺"],
                                            ["ja", "ja", "🇯🇵"],
                                            ["ko", "ko", "🇰🇷"],
                                            ["nl", "nl", "🇳🇱"],
                                            ["ur", "ur", "🇵🇰"],
                                            ["ta", "ta", "🇮🇳"],
                                            ["multi", "multi"],
                                        ];
                                        const generalLanguageSelect = (
                                            <Field id="language-select" label={t("voiceLanguage.label")}>
                                                <Combobox
                                                    value={formData.language}
                                                    onValueChange={(value) => setFormData({ ...formData, language: value })}
                                                    disabled={loading}
                                                    placeholder={t("voiceLanguage.placeholder")}
                                                    options={generalLanguages.map(([code, key, flag]) => ({
                                                        value: code,
                                                        label: t(`voiceLanguage.${key}`),
                                                        icon: flag ? <span aria-hidden>{flag}</span> : undefined,
                                                    }))}
                                                />
                                                {formData.language === 'multi' && (
                                                    <Alert tone="warning" icon={false}>
                                                        {t("voiceLanguage.multiHint")}
                                                    </Alert>
                                                )}
                                            </Field>
                                        );

                                        const elevenLabsVoiceOptions: ComboboxItem[] = [
                                            ...voices.map((v) => ({
                                                value: v.voice_id,
                                                label: v.name,
                                                description: `${v.category} ${v.labels?.gender ? `· ${v.labels.gender}` : ''}`,
                                            })),
                                            ...(sharedVoices.length > 0 ? [{
                                                label: t("drawer.voiceLibraryGroup", { language: t(`voiceLanguage.${formData.language === "pt-BR" ? "ptBR" : formData.language}`) }),
                                                options: sharedVoices.map((v) => ({
                                                    value: v.voice_id,
                                                    label: v.name,
                                                    description: [v.labels?.gender, v.labels?.accent].filter(Boolean).join(" · "),
                                                })),
                                            }] : []),
                                        ];
                                        const elevenLabsVoiceSelect = (
                                            <Field
                                                id="voice-id"
                                                label={t("drawer.voiceLabel")}
                                                labelAside={isSipNumber ? <Badge tone="accent" size="sm">SIP</Badge> : undefined}
                                            >
                                                <div className="flex gap-2">
                                                    <Combobox
                                                        value={formData.voiceId}
                                                        onValueChange={(value) => {
                                                            const shared = sharedVoices.find(x => x.voice_id === value);
                                                            if (shared) { addLibraryVoice(shared); return; }
                                                            const v = voices.find(x => x.voice_id === value);
                                                            setFormData({ ...formData, voiceId: value, voiceName: v?.name || "Rachel" });
                                                        }}
                                                        disabled={loading || fetchingVoices || !!addingVoiceId}
                                                        placeholder={fetchingVoices ? "Loading..." : "Select voice"}
                                                        emptyText={voices.length === 0 && sharedVoices.length === 0 && !fetchingVoices ? t("drawer.noVoices") : undefined}
                                                        options={elevenLabsVoiceOptions}
                                                        className="min-w-0 flex-1"
                                                    />
                                                    {formData.voiceId && (
                                                        <Button type="button" variant="secondary" size="icon" className="shrink-0"
                                                            onClick={(e) => { const voice = voices.find(v => v.voice_id === formData.voiceId); if (voice) togglePreview(e, voice); }}
                                                            disabled={!voices.find(v => v.voice_id === formData.voiceId)?.preview_url}>
                                                            {previewingId === formData.voiceId ? <Pause /> : <SpeakerHigh />}
                                                        </Button>
                                                    )}
                                                </div>
                                                {addingVoiceId && <p className="inline-flex items-center gap-1.5 text-caption text-fg-muted"><Spinner size="sm" />{t("drawer.libraryVoiceAdding")}</p>}
                                                {sharedVoices.length > 0 && !addingVoiceId && <p className="text-caption text-fg-muted">{t("drawer.voiceLibraryHint")}</p>}
                                                {fetchVoicesError && <p className="text-caption font-medium text-danger-ink">{fetchVoicesError} <Link href="/settings" className="underline">{t("drawer.settingsLink")}</Link></p>}
                                                {!configStatus?.isElevenLabsConfigured && <p className="text-caption font-medium text-danger-ink">{t("drawer.elevenLabsNotConfigured")} <Link href="/settings" className="underline">{t("drawer.settingsLink")}</Link></p>}
                                            </Field>
                                        );

                                        const deepgramVoiceProviderSelect = (
                                            <div className="flex flex-col gap-1.5">
                                                <Label id="dg-voice-provider-label">{t("drawer.voiceProviderLabel")}</Label>
                                                <RadioCards
                                                    aria-labelledby="dg-voice-provider-label"
                                                    columns={2}
                                                    value={formData.deepgramVoice ? "deepgram" : "elevenlabs"}
                                                    onValueChange={(value) => setFormData({ ...formData, deepgramVoice: value === "deepgram" ? (deepgramVoices[0]?.model || DEFAULT_DEEPGRAM_VOICE) : "" })}
                                                    disabled={loading}
                                                >
                                                    <RadioCard
                                                        value="deepgram"
                                                        title={t("drawer.voiceProviderDeepgram")}
                                                        description={t("drawer.voiceProviderDeepgramHint")}
                                                    />
                                                    <RadioCard
                                                        value="elevenlabs"
                                                        disabled={!!configStatus && !configStatus.isElevenLabsConfigured}
                                                        title="ElevenLabs"
                                                        description={configStatus && !configStatus.isElevenLabsConfigured ? t("drawer.elevenLabsNotConfigured") : t("drawer.voiceProviderElevenLabsHint")}
                                                    />
                                                </RadioCards>
                                            </div>
                                        );

                                        const selectedDeepgramVoice = deepgramVoices.find(v => v.model === formData.deepgramVoice);
                                        const deepgramVoiceSelect = (
                                            <Field id="dg-voice" label={t("drawer.voiceLabel")}>
                                                <div className="flex gap-2">
                                                    <Combobox
                                                        value={formData.deepgramVoice}
                                                        onValueChange={(value) => setFormData({ ...formData, deepgramVoice: value })}
                                                        disabled={loading || fetchingDeepgramVoices}
                                                        placeholder={fetchingDeepgramVoices
                                                            ? "Loading..."
                                                            : (selectedDeepgramVoice?.name || (formData.deepgramVoice ? deepgramVoiceName(formData.deepgramVoice) : t("drawer.selectVoice")))}
                                                        emptyText={t("drawer.noDeepgramVoices")}
                                                        options={deepgramVoices.map((v) => ({
                                                            value: v.model,
                                                            label: v.name,
                                                            description: [v.accent, ...v.tags.slice(0, 2)].filter(Boolean).join(" · "),
                                                        }))}
                                                        className="min-w-0 flex-1"
                                                    />
                                                    <Button type="button" variant="secondary" size="icon" className="shrink-0"
                                                        onClick={(e) => { if (selectedDeepgramVoice?.preview_url) togglePreview(e, { voice_id: selectedDeepgramVoice.model, name: selectedDeepgramVoice.name, preview_url: selectedDeepgramVoice.preview_url, category: "" }); }}
                                                        disabled={!selectedDeepgramVoice?.preview_url}>
                                                        {previewingId === formData.deepgramVoice ? <Pause /> : <SpeakerHigh />}
                                                    </Button>
                                                </div>
                                                {deepgramVoicesLoaded && deepgramVoices.length === 0 && <p className="text-caption font-medium text-danger-ink">{t("drawer.noDeepgramVoices")}</p>}
                                                {deepgramVoicesError && <p className="text-caption font-medium text-danger-ink">{deepgramVoicesError} <Link href="/settings" className="underline">{t("drawer.settingsLink")}</Link></p>}
                                            </Field>
                                        );

                                        const engineBadge =
                                            engineValue === "deepgram_agent" || engineValue === "gemini_live"
                                                ? t("drawer.badgeLowLatency")
                                                : engineValue === "sarvam"
                                                    ? t("drawer.badgeIndianLanguages")
                                                    : null;

                                        return (
                                            <>
                                                {/* 1. Voice Engine — always shown first; language & voice below adapt to it */}
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <Label id="voice-engine-label">{t("drawer.voiceEngineLabel")}</Label>
                                                        {engineBadge && <Badge tone="accent" size="sm">{engineBadge}</Badge>}
                                                    </div>
                                                    <RadioCards
                                                        aria-labelledby="voice-engine-label"
                                                        columns={2}
                                                        value={engineValue}
                                                        onValueChange={handleEngineChange}
                                                        disabled={loading}
                                                    >
                                                        {showTwilioVoices && (
                                                            <RadioCard
                                                                value="twilio_standard"
                                                                title={t("engines.twilioStandard")}
                                                                description={t("engines.twilioStandardHint")}
                                                            />
                                                        )}
                                                        <RadioCard
                                                            value="classic"
                                                            disabled={classicMissing.length > 0}
                                                            title={t("engines.classic")}
                                                            description={classicMissing.length ? missingLabel(classicMissing) : t("engines.classicHint")}
                                                        />
                                                        <RadioCard
                                                            value="deepgram_agent"
                                                            disabled={dgAgentMissing.length > 0}
                                                            title={t("engines.deepgramAgent")}
                                                            description={dgAgentMissing.length ? missingLabel(dgAgentMissing) : t("engines.deepgramAgentHint")}
                                                        />
                                                        {/* Gemini Live is SIP-only — the Twilio media path has no branch for
                                                            its 16k/24k PCM audio. Shown always so it stays discoverable, but
                                                            disabled against a real Twilio outbound number. */}
                                                        <RadioCard
                                                            value="gemini_live"
                                                            disabled={isNonSipNumber || geminiMissing.length > 0}
                                                            title={t("engines.gemini")}
                                                            description={isNonSipNumber
                                                                ? t("engines.geminiSipOnlyOption")
                                                                : geminiMissing.length
                                                                    ? missingLabel(geminiMissing)
                                                                    : t("engines.geminiHint")}
                                                        />
                                                        <RadioCard
                                                            value="sarvam"
                                                            disabled={sarvamMissing.length > 0}
                                                            title={t("engines.sarvam")}
                                                            description={sarvamMissing.length ? missingLabel(sarvamMissing) : t("engines.sarvamHint")}
                                                        />
                                                    </RadioCards>
                                                    {/* Warn about the SELECTED engine's own missing keys — an agent already
                                                        saved on an engine whose keys were later removed still lands here. */}
                                                    {engineValue !== "twilio_standard" && selectedEngineMissing.length > 0 && (
                                                        <p className="text-caption font-medium text-danger-ink">
                                                            {t("engines.notConfiguredWarning", { count: selectedEngineMissing.length, keys: selectedEngineMissing.join(" and ") })} <Link href="/settings" className="underline">{t("engines.addInSettings", { count: selectedEngineMissing.length })}</Link>.
                                                        </p>
                                                    )}
                                                    {engineValue === "deepgram_agent" && dgAgentMissing.length === 0 && (
                                                        <p className="text-caption text-fg-muted">{t("engines.deepgramAgentNote")}</p>
                                                    )}
                                                    {engineValue === "gemini_live" && geminiMissing.length === 0 && (
                                                        <p className="text-caption text-fg-muted">{t("engines.geminiNote")}</p>
                                                    )}
                                                    {engineValue === "sarvam" && sarvamMissing.length === 0 && (
                                                        <p className="text-caption text-fg-muted">{t("engines.sarvamNote")}</p>
                                                    )}
                                                    {engineValue === "twilio_standard" && (
                                                        <p className="text-caption text-fg-muted">{t("engines.twilioStandardNote")}</p>
                                                    )}
                                                </div>

                                                {/* 2. Language — the available languages depend on the engine */}
                                                {engineValue === "gemini_live" ? (
                                                    <Field
                                                        id="gemini-language"
                                                        label={t("voiceLanguage.label")}
                                                        hint={formData.geminiLanguage === GEMINI_AUTO_LANGUAGE ? t("drawer.geminiAutoLanguageHint") : undefined}
                                                    >
                                                        <Combobox
                                                            value={formData.geminiLanguage}
                                                            onValueChange={(value) => setFormData({ ...formData, geminiLanguage: value })}
                                                            disabled={loading}
                                                            placeholder={t("voiceLanguage.selectLanguage")}
                                                            options={GEMINI_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                                                        />
                                                    </Field>
                                                ) : engineValue === "sarvam" ? (
                                                    <Field id="sarvam-language" label={t("voiceLanguage.label")}>
                                                        <Select value={formData.sarvamLanguage} onValueChange={(value) => setFormData({ ...formData, sarvamLanguage: value })} disabled={loading}>
                                                            <SelectTrigger className="w-full">
                                                                <SelectValue placeholder={t("voiceLanguage.selectLanguage")} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {SARVAM_LANGUAGES.map((l) => (
                                                                    <SelectItem key={l.code} value={l.code}>
                                                                        <span className="inline-flex items-center gap-2"><span aria-hidden>{l.flag}</span> {l.label}</span>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </Field>
                                                ) : generalLanguageSelect}

                                                {/* 3. Voice — Twilio standard, Sarvam speaker, or ElevenLabs voice */}
                                                {engineValue === "twilio_standard" ? (
                                                    <Field id="twilio-voice" label={t("drawer.voiceLabel")}>
                                                        <Select value={formData.voice} onValueChange={(v) => setFormData({ ...formData, voice: v })} disabled={loading}>
                                                            <SelectTrigger className="w-full">
                                                                <SelectValue placeholder={t("drawer.selectVoice")} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Polly.Amy">{t("twilioVoices.amy")}</SelectItem>
                                                                <SelectItem value="Polly.Joey">{t("twilioVoices.joey")}</SelectItem>
                                                                <SelectItem value="Polly.Joanna">{t("twilioVoices.joanna")}</SelectItem>
                                                                <SelectItem value="Polly.Brian">{t("twilioVoices.brian")}</SelectItem>
                                                                <SelectItem value="Polly.Geraint">{t("twilioVoices.geraint")}</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </Field>
                                                ) : engineValue === "gemini_live" ? (
                                                    <Field id="gemini-voice" label={t("drawer.voiceLabel")}>
                                                        <Combobox
                                                            value={formData.geminiVoice}
                                                            onValueChange={(value) => setFormData({ ...formData, geminiVoice: value })}
                                                            disabled={loading}
                                                            placeholder={t("drawer.selectVoice")}
                                                            options={GEMINI_VOICES.map((v) => ({ value: v.name, label: v.name, description: v.description }))}
                                                        />
                                                    </Field>
                                                ) : engineValue === "sarvam" ? (
                                                    <Field id="sarvam-speaker" label={t("drawer.voiceLabel")} hint={t("drawer.sarvamPreviewHint")}>
                                                        <div className="flex gap-2">
                                                            <Combobox
                                                                value={formData.sarvamSpeaker}
                                                                onValueChange={(value) => setFormData({ ...formData, sarvamSpeaker: value })}
                                                                disabled={loading}
                                                                placeholder={t("drawer.selectVoice")}
                                                                options={SARVAM_SPEAKERS.map((s) => ({ value: s, label: <span className="capitalize">{s}</span>, keywords: [s] }))}
                                                                className="min-w-0 flex-1"
                                                            />
                                                            <Button type="button" variant="secondary" size="icon" className="shrink-0"
                                                                onClick={playSarvamPreview}
                                                                disabled={sarvamPreviewLoading || loading || !formData.sarvamSpeaker}
                                                                title={t("drawer.sarvamPreviewTitle")}>
                                                                {sarvamPreviewLoading ? <Spinner size="sm" /> : sarvamPreviewPlaying ? <Pause /> : <SpeakerHigh />}
                                                            </Button>
                                                        </div>
                                                    </Field>
                                                ) : engineValue === "deepgram_agent" ? (
                                                    <>
                                                        {deepgramVoiceProviderSelect}
                                                        {formData.deepgramVoice ? deepgramVoiceSelect : elevenLabsVoiceSelect}
                                                    </>
                                                ) : elevenLabsVoiceSelect}

                                                {/* 4. Voice Quality & Conversation — classic engines get the full set;
                                                    the Deepgram Voice Agent engine supports the ElevenLabs model only
                                                    (its turn-taking and TTS streaming run server-side at Deepgram). */}
                                                {(engineValue === "classic" || (engineValue === "deepgram_agent" && !formData.deepgramVoice)) && (
                                                    <div className="flex flex-col gap-4 border-t border-border pt-4">
                                                        <div className="flex items-center gap-2">
                                                            <Sparkle className="size-4 shrink-0 text-accent-ink" />
                                                            <span className="text-overline text-fg-muted">{t("voiceQuality.section")}</span>
                                                        </div>

                                                        {engineValue === "classic" && (
                                                            <div className="flex flex-col gap-1.5">
                                                                <Label id="vq-preset-label">{t("voiceQuality.presetLabel")}</Label>
                                                                <RadioCards
                                                                    aria-labelledby="vq-preset-label"
                                                                    columns={2}
                                                                    value={formData.voiceQualityPreset}
                                                                    onValueChange={(v) => setFormData({ ...formData, voiceQualityPreset: v })}
                                                                    disabled={loading}
                                                                >
                                                                    {([
                                                                        ["default", t("voiceQuality.presetDefault"), t("voiceQuality.presetDefaultHint")],
                                                                        ["fast", t("voiceQuality.presetFast"), t("voiceQuality.presetFastHint")],
                                                                        ["balanced", t("voiceQuality.presetBalanced"), t("voiceQuality.presetBalancedHint")],
                                                                        ["natural", t("voiceQuality.presetNatural"), t("voiceQuality.presetNaturalHint")],
                                                                        ["expressive", t("voiceQuality.presetExpressive"), t("voiceQuality.presetExpressiveHint")],
                                                                        ["custom", t("voiceQuality.presetCustom"), t("voiceQuality.presetCustomHint")],
                                                                    ] as [string, string, string][]).map(([value, label, hint]) => (
                                                                        <RadioCard key={value} value={value} title={label} description={hint} />
                                                                    ))}
                                                                </RadioCards>
                                                                <p className="text-caption text-fg-muted">{t("voiceQuality.presetHint")}</p>
                                                            </div>
                                                        )}

                                                        {/* Model — applies to classic AND Deepgram Voice Agent */}
                                                        <Field
                                                            id="vq-model"
                                                            label={t("voiceQuality.modelLabel")}
                                                            hint={formData.elevenLabsVoiceSettings.model === "auto" ? t("voiceQuality.modelAutoHint") : undefined}
                                                        >
                                                            <Select
                                                                value={formData.elevenLabsVoiceSettings.model}
                                                                onValueChange={(v) => setElSetting("model", v)}
                                                                disabled={loading}
                                                            >
                                                                <SelectTrigger className="w-full">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="auto">{t("voiceQuality.modelAuto")}</SelectItem>
                                                                    <SelectItem value="eleven_turbo_v2_5">{t("voiceQuality.modelTurbo")}</SelectItem>
                                                                    <SelectItem value="eleven_flash_v2_5">{t("voiceQuality.modelFlash")}</SelectItem>
                                                                    <SelectItem value="eleven_multilingual_v2">{t("voiceQuality.modelMultilingual")}</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </Field>

                                                        {engineValue === "deepgram_agent" && (
                                                            <p className="text-caption text-fg-muted">{t("voiceQuality.dgAgentNote")}</p>
                                                        )}

                                                        {engineValue === "classic" && (
                                                            <>
                                                                <Field id="vq-latency" label={t("voiceQuality.latencyLabel")}>
                                                                    <Select
                                                                        value={formData.elevenLabsVoiceSettings.latencyProfile}
                                                                        onValueChange={(v) => setElSetting("latencyProfile", v)}
                                                                        disabled={loading}
                                                                    >
                                                                        <SelectTrigger className="w-full">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="auto">{t("voiceQuality.latencyAuto")}</SelectItem>
                                                                            <SelectItem value="fast">{t("voiceQuality.latencyFast")}</SelectItem>
                                                                            <SelectItem value="balanced">{t("voiceQuality.latencyBalanced")}</SelectItem>
                                                                            <SelectItem value="quality">{t("voiceQuality.latencyQuality")}</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </Field>

                                                                {formData.voiceQualityPreset === "custom" && (
                                                                    <div className="flex flex-col gap-3 rounded-md bg-surface p-3">
                                                                        {vqSlider("vq-stability", t("voiceQuality.stability"), formData.elevenLabsVoiceSettings.stability, 0, 1, 0.05, (v) => setElSetting("stability", v), t("voiceQuality.stabilityHint"))}
                                                                        {vqSlider("vq-similarity", t("voiceQuality.similarityBoost"), formData.elevenLabsVoiceSettings.similarityBoost, 0, 1, 0.05, (v) => setElSetting("similarityBoost", v))}
                                                                        {vqSlider("vq-style", t("voiceQuality.style"), formData.elevenLabsVoiceSettings.style, 0, 1, 0.05, (v) => setElSetting("style", v))}
                                                                        {vqSlider("vq-speed", t("voiceQuality.speed"), formData.elevenLabsVoiceSettings.speed, 0.7, 1.2, 0.05, (v) => setElSetting("speed", v))}
                                                                        <div className="flex items-center justify-between gap-2 pt-1">
                                                                            <Label htmlFor="vq-speaker-boost">{t("voiceQuality.speakerBoost")}</Label>
                                                                            <Switch
                                                                                id="vq-speaker-boost"
                                                                                checked={formData.elevenLabsVoiceSettings.useSpeakerBoost}
                                                                                onCheckedChange={(c) => setElSetting("useSpeakerBoost", c)}
                                                                                disabled={loading}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                <div className="flex flex-col gap-3 border-t border-border pt-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <Timer className="size-4 shrink-0 text-fg-muted" />
                                                                        <span className="text-overline text-fg-muted">{t("voiceQuality.turnTakingTitle")}</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-3">
                                                                        <Field id="vq-endpointing" label={t("voiceQuality.endpointingLabel")}>
                                                                            <Input
                                                                                type="number"
                                                                                min={100}
                                                                                max={2000}
                                                                                step={50}
                                                                                value={formData.turnTaking.endpointingMs}
                                                                                onChange={(e) => setTurnTaking("endpointingMs", e.target.value === "" ? "" : parseInt(e.target.value))}
                                                                                disabled={loading}
                                                                                className="tabular-nums"
                                                                            />
                                                                        </Field>
                                                                        <Field id="vq-silence" label={t("voiceQuality.silenceWaitLabel")}>
                                                                            <Input
                                                                                type="number"
                                                                                min={200}
                                                                                max={3000}
                                                                                step={100}
                                                                                value={formData.turnTaking.silenceWaitMs}
                                                                                onChange={(e) => setTurnTaking("silenceWaitMs", e.target.value === "" ? "" : parseInt(e.target.value))}
                                                                                disabled={loading}
                                                                                className="tabular-nums"
                                                                            />
                                                                        </Field>
                                                                    </div>
                                                                    <p className="text-caption text-fg-muted">{t("voiceQuality.endpointingHint")} {t("voiceQuality.silenceWaitHint")}</p>
                                                                    <Field id="vq-interrupt" label={t("voiceQuality.interruptLabel")}>
                                                                        <Select
                                                                            value={formData.turnTaking.interruptSensitivity}
                                                                            onValueChange={(v) => setTurnTaking("interruptSensitivity", v)}
                                                                            disabled={loading}
                                                                        >
                                                                            <SelectTrigger className="w-full">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="low">{t("voiceQuality.interruptLow")}</SelectItem>
                                                                                <SelectItem value="normal">{t("voiceQuality.interruptNormal")}</SelectItem>
                                                                                <SelectItem value="high">{t("voiceQuality.interruptHigh")}</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </Field>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </Section>

                                <Section icon={<PuzzlePiece />} title={t("drawer.sectionCapabilities")} className="min-w-0">
                                    <Field id="kb-select" label={t("drawer.knowledgeBaseLabel")}>
                                        <Select
                                            value={formData.knowledgeBaseId}
                                            onValueChange={(value) => setFormData({ ...formData, knowledgeBaseId: value })}
                                            disabled={loading}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder={t("drawer.noKnowledgeBase")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">{t("drawer.noKnowledgeBase")}</SelectItem>
                                                {knowledgeBases.map((kb) => (
                                                    <SelectItem key={kb._id} value={kb._id}>
                                                        <span className="inline-flex items-center gap-2">
                                                            <Database className="size-3.5 text-fg-muted" />
                                                            {kb.name}
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                                {knowledgeBases.length === 0 && (
                                                    <div className="px-2 py-2 text-center text-caption text-fg-muted">
                                                        {t("drawer.noKnowledgeBases")} <Link href="/knowledge-base" className="font-semibold text-accent-ink underline">{t("drawer.createOne")}</Link>
                                                    </div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        {formData.knowledgeBaseId !== "none" && (
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-surface p-3">
                                                <div className="flex items-center gap-2">
                                                    <Switch id="use-basic-info" checked={formData.kbSettings.useBasicInfo} onCheckedChange={(c) => setFormData({ ...formData, kbSettings: { ...formData.kbSettings, useBasicInfo: c } })} />
                                                    <Label htmlFor="use-basic-info">{t("drawer.kbBasicInfo")}</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch id="use-faqs" checked={formData.kbSettings.useFaqs} onCheckedChange={(c) => setFormData({ ...formData, kbSettings: { ...formData.kbSettings, useFaqs: c } })} />
                                                    <Label htmlFor="use-faqs">{t("drawer.kbFaqs")}</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch id="use-other-info" checked={formData.kbSettings.useOtherInfo} onCheckedChange={(c) => setFormData({ ...formData, kbSettings: { ...formData.kbSettings, useOtherInfo: c } })} />
                                                    <Label htmlFor="use-other-info">{t("drawer.kbOtherInfo")}</Label>
                                                </div>
                                            </div>
                                        )}
                                    </Field>

                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => !loading && setFormData({ ...formData, appointmentBookingEnabled: !formData.appointmentBookingEnabled })}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); !loading && setFormData({ ...formData, appointmentBookingEnabled: !formData.appointmentBookingEnabled }); } }}
                                        className="wx-focus flex cursor-pointer items-center justify-between gap-3 rounded-md bg-surface p-3 transition-colors hover:bg-[color-mix(in_oklab,var(--wx-color-surface),var(--wx-color-fg)_4%)]"
                                        aria-pressed={formData.appointmentBookingEnabled}
                                        aria-label={t("drawer.toggleAppointments")}
                                    >
                                        <div className="pointer-events-none flex min-w-0 items-start gap-2.5">
                                            <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-bg-muted text-fg-muted [&_svg]:size-4">
                                                <Calendar />
                                            </span>
                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                <span className="text-body-sm font-semibold">{t("drawer.appointmentBooking")}</span>
                                                <p className="text-caption text-fg-muted">{t("drawer.appointmentBookingHint")}</p>
                                            </div>
                                        </div>
                                        <div onClick={(e) => e.stopPropagation()} className="pointer-events-auto">
                                            <Switch
                                                id="appointment-booking"
                                                checked={formData.appointmentBookingEnabled}
                                                onCheckedChange={(checked) => setFormData({ ...formData, appointmentBookingEnabled: checked })}
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>
                                    {formData.appointmentBookingEnabled && (
                                        <Field id="appointment-desc" label={t("drawer.appointmentDescriptionLabel")}>
                                            <Textarea
                                                value={formData.appointmentDescription}
                                                onChange={(e) => setFormData({ ...formData, appointmentDescription: e.target.value })}
                                                placeholder={t("drawer.appointmentDescriptionPlaceholder")}
                                                rows={2}
                                                disabled={loading}
                                            />
                                        </Field>
                                    )}

                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => !loading && updateTransfer({ enabled: !formData.humanTransfer.enabled })}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); !loading && updateTransfer({ enabled: !formData.humanTransfer.enabled }); } }}
                                        className="wx-focus flex cursor-pointer items-center justify-between gap-3 rounded-md bg-surface p-3 transition-colors hover:bg-[color-mix(in_oklab,var(--wx-color-surface),var(--wx-color-fg)_4%)]"
                                        aria-pressed={formData.humanTransfer.enabled}
                                        aria-label={t("drawer.toggleHumanTransfer")}
                                    >
                                        <div className="pointer-events-none flex min-w-0 items-start gap-2.5">
                                            <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-bg-muted text-fg-muted [&_svg]:size-4">
                                                <PhoneTransfer />
                                            </span>
                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                <span className="text-body-sm font-semibold">{t("drawer.humanTransfer")}</span>
                                                <p className="text-caption text-fg-muted">{t("drawer.humanTransferHint")}</p>
                                            </div>
                                        </div>
                                        <div onClick={(e) => e.stopPropagation()} className="pointer-events-auto">
                                            <Switch
                                                id="human-transfer"
                                                checked={formData.humanTransfer.enabled}
                                                onCheckedChange={(checked) => updateTransfer({ enabled: checked })}
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>

                                    {formData.humanTransfer.enabled && (
                                        <div className="flex flex-col gap-4">
                                            <p className="text-caption text-fg-muted">{t("drawer.humanTransferSipNote")}</p>

                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-body-sm font-medium">{t("drawer.destinations")}</span>
                                                    <Button type="button" variant="secondary" size="xs" iconStart={<Plus />} onClick={addDestination} disabled={loading}>
                                                        {t("drawer.addDestination")}
                                                    </Button>
                                                </div>
                                                <p className="text-caption text-fg-muted">{t("drawer.destinationsHint")}</p>
                                            </div>

                                            {formData.humanTransfer.destinations.length === 0 ? (
                                                <p className="rounded-md bg-surface p-4 text-center text-caption text-fg-muted">
                                                    {t("drawer.noDestinations")}
                                                </p>
                                            ) : (
                                                <div className="flex flex-col gap-3">
                                                    {formData.humanTransfer.destinations.map((d, index) => (
                                                        <div key={index} className="flex flex-col gap-2 rounded-md bg-surface p-3">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <Field id={`transfer-id-${index}`} label={t("drawer.destinationId")}>
                                                                    <Input
                                                                        size="sm"
                                                                        value={d.id}
                                                                        placeholder={t("drawer.destinationIdPlaceholder")}
                                                                        disabled={loading}
                                                                        onChange={(e) => updateDestination(index, { id: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                                                                        className="ltr-data"
                                                                    />
                                                                </Field>
                                                                <Field id={`transfer-name-${index}`} label={t("drawer.destinationName")}>
                                                                    <Input
                                                                        size="sm"
                                                                        value={d.name}
                                                                        placeholder={t("drawer.destinationNamePlaceholder")}
                                                                        disabled={loading}
                                                                        onChange={(e) => updateDestination(index, { name: e.target.value })}
                                                                    />
                                                                </Field>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <Field id={`transfer-phone-${index}`} label={t("drawer.destinationPhone")}>
                                                                    <Input
                                                                        size="sm"
                                                                        value={d.value}
                                                                        placeholder={t("drawer.destinationPhonePlaceholder")}
                                                                        disabled={loading}
                                                                        onChange={(e) => updateDestination(index, { value: e.target.value })}
                                                                        className="ltr-data"
                                                                    />
                                                                </Field>
                                                                <Field id={`transfer-timeout-${index}`} label={<>{t("drawer.destinationTimeout")} ({t("drawer.seconds")})</>}>
                                                                    <Input
                                                                        size="sm"
                                                                        type="number"
                                                                        min={5}
                                                                        max={60}
                                                                        value={d.timeoutSeconds ?? ""}
                                                                        placeholder={`${formData.humanTransfer.ringTimeoutSeconds}`}
                                                                        disabled={loading}
                                                                        onChange={(e) => updateDestination(index, {
                                                                            timeoutSeconds: e.target.value
                                                                                ? Math.max(5, Math.min(60, Number(e.target.value) || 20))
                                                                                : null,
                                                                        })}
                                                                        className="tabular-nums"
                                                                    />
                                                                </Field>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-2 pt-1">
                                                                <div className="flex items-center gap-2">
                                                                    <Switch
                                                                        id={`transfer-enabled-${index}`}
                                                                        checked={d.enabled}
                                                                        onCheckedChange={(checked) => updateDestination(index, { enabled: checked })}
                                                                        disabled={loading}
                                                                    />
                                                                    <Label htmlFor={`transfer-enabled-${index}`}>{t("drawer.destinationEnabled")}</Label>
                                                                </div>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon-sm"
                                                                    onClick={() => removeDestination(index)}
                                                                    disabled={loading}
                                                                    aria-label={t("drawer.removeDestination")}
                                                                >
                                                                    <Trash />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <Field id="transfer-default" label={t("drawer.defaultDestination")} hint={t("drawer.defaultDestinationHint")}>
                                                <Select
                                                    value={formData.humanTransfer.defaultDestinationId || "none"}
                                                    onValueChange={(value) => updateTransfer({ defaultDestinationId: value === "none" ? "" : value })}
                                                    disabled={loading}
                                                >
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">{t("drawer.noDefaultDestination")}</SelectItem>
                                                        {formData.humanTransfer.destinations
                                                            .filter((d) => d.enabled && d.id.trim())
                                                            .map((d) => (
                                                                <SelectItem key={d.id} value={d.id}>{d.name.trim() || d.id}</SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </Field>

                                            <div className="grid grid-cols-2 gap-3">
                                                <Field
                                                    id="transfer-ring-timeout"
                                                    label={<>{t("drawer.ringTimeout")} ({t("drawer.seconds")})</>}
                                                    hint={t("drawer.ringTimeoutHint")}
                                                >
                                                    <Input
                                                        type="number"
                                                        min={5}
                                                        max={60}
                                                        value={formData.humanTransfer.ringTimeoutSeconds}
                                                        disabled={loading}
                                                        onChange={(e) => updateTransfer({ ringTimeoutSeconds: Math.max(5, Math.min(60, Number(e.target.value) || 20)) })}
                                                        className="tabular-nums"
                                                    />
                                                </Field>
                                                <Field id="transfer-max" label={t("drawer.maxTransfers")} hint={t("drawer.maxTransfersHint")}>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={10}
                                                        value={formData.humanTransfer.maxTransfersPerCall}
                                                        disabled={loading}
                                                        onChange={(e) => updateTransfer({ maxTransfersPerCall: Math.max(1, Math.min(10, Number(e.target.value) || 3)) })}
                                                        className="tabular-nums"
                                                    />
                                                </Field>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tools: the account's webhooks this agent may call mid-conversation. */}
                                    <div className="flex flex-col gap-3 rounded-md bg-surface p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-start gap-2.5">
                                                <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-bg-muted text-fg-muted [&_svg]:size-4">
                                                    <Wrench />
                                                </span>
                                                <div className="flex min-w-0 flex-col gap-0.5">
                                                    <span className="text-body-sm font-semibold">{t("drawer.tools")}</span>
                                                    <p className="text-caption text-fg-muted">{t("drawer.toolsHint")}</p>
                                                </div>
                                            </div>
                                            <Button type="button" variant="secondary" size="xs" iconStart={<Plus />} onClick={() => setNewToolOpen(true)} disabled={loading}>
                                                {t("drawer.newTool")}
                                            </Button>
                                        </div>
                                        {tools.length === 0 ? (
                                            <p className="text-caption text-fg-muted">
                                                {t("drawer.noTools")}{" "}
                                                <Link href="/tools" className="font-semibold text-accent-ink underline">{t("drawer.noToolsLink")}</Link>
                                            </p>
                                        ) : (
                                            <ul className="flex flex-col gap-1">
                                                {tools.map((tool) => {
                                                    const checked = formData.toolIds.includes(tool._id);
                                                    const full = !checked && formData.toolIds.length >= MAX_TOOLS_PER_AGENT;
                                                    return (
                                                        <li key={tool._id} className="flex items-start gap-2.5 rounded-sm px-1.5 py-1.5 transition-colors hover:bg-bg-muted">
                                                            <Checkbox
                                                                id={`agent-tool-${tool._id}`}
                                                                checked={checked}
                                                                onCheckedChange={(v) => toggleTool(tool._id, v === true)}
                                                                disabled={loading || full}
                                                                className="mt-0.5"
                                                            />
                                                            <Label htmlFor={`agent-tool-${tool._id}`} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 font-normal">
                                                                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                                                                    <span className="ltr-data truncate font-mono text-body-sm font-medium text-fg">{tool.name}</span>
                                                                    <span className="ltr-data truncate text-caption text-fg-subtle">{tool.webhook?.method} · {hostOf(tool.webhook?.url) ?? "—"}</span>
                                                                </span>
                                                                <span className="line-clamp-1 text-caption text-fg-muted">{tool.description}</span>
                                                            </Label>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                        {tools.length > 0 && (
                                            <p className="text-caption text-fg-subtle">
                                                {t("drawer.toolsSelected", { count: formData.toolIds.length, max: MAX_TOOLS_PER_AGENT })}
                                            </p>
                                        )}
                                    </div>

                                    {/* Connected apps: MCP servers from Integrations whose switched-on tools this agent may call. */}
                                    <div className="flex flex-col gap-3 rounded-md bg-surface p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-start gap-2.5">
                                                <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-bg-muted text-fg-muted [&_svg]:size-4">
                                                    <Plugs />
                                                </span>
                                                <div className="flex min-w-0 flex-col gap-0.5">
                                                    <span className="text-body-sm font-semibold">{t("drawer.connectedApps")}</span>
                                                    <p className="text-caption text-fg-muted">{t("drawer.connectedAppsHint")}</p>
                                                </div>
                                            </div>
                                            <Button type="button" variant="secondary" size="xs" asChild>
                                                <Link href="/integrations"><Plus aria-hidden /> {t("drawer.connectApp")}</Link>
                                            </Button>
                                        </div>
                                        {mcpServers.filter((s) => s.status === "ready").length === 0 ? (
                                            <p className="text-caption text-fg-muted">
                                                {t("drawer.noConnectedApps")}{" "}
                                                <Link href="/integrations" className="font-semibold text-accent-ink underline">{t("drawer.noConnectedAppsLink")}</Link>
                                            </p>
                                        ) : (
                                            <ul className="flex flex-col gap-1">
                                                {mcpServers.filter((s) => s.status === "ready").map((server) => {
                                                    const checked = formData.mcpServerIds.includes(server._id);
                                                    const full = !checked && formData.mcpServerIds.length >= MAX_MCP_SERVERS_PER_AGENT;
                                                    const enabledCount = server.tools.filter((x) => x.enabled).length;
                                                    return (
                                                        <li key={server._id} className="flex items-start gap-2.5 rounded-sm px-1.5 py-1.5 transition-colors hover:bg-bg-muted">
                                                            <Checkbox
                                                                id={`agent-mcp-${server._id}`}
                                                                checked={checked}
                                                                onCheckedChange={(v) => toggleMcpServer(server._id, v === true)}
                                                                disabled={loading || full}
                                                                className="mt-0.5"
                                                            />
                                                            <Label htmlFor={`agent-mcp-${server._id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 font-normal">
                                                                <AppIcon appId={appForUrl(server.url)?.id} url={server.url} name={server.name} size={24} />
                                                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                                                                        <span className="truncate text-body-sm font-medium text-fg">{server.name}</span>
                                                                        <span className="ltr-data truncate text-caption text-fg-subtle">{mcpHostOf(server.url)}</span>
                                                                    </span>
                                                                    <span className="text-caption text-fg-muted">{t("drawer.connectedAppToolsOn", { count: enabledCount })}</span>
                                                                </span>
                                                            </Label>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                        {mcpServers.some((s) => s.status === "ready") && (
                                            <p className="text-caption text-fg-subtle">
                                                {t("drawer.connectedAppsSelected", { count: formData.mcpServerIds.length, max: MAX_MCP_SERVERS_PER_AGENT })}
                                            </p>
                                        )}
                                    </div>

                                    {/* WhatsApp: the number this agent sends from on calls, and its WhatsApp tools. */}
                                    <AgentWhatsAppCard
                                        value={formData.whatsapp}
                                        onChange={(v) => setFormData({ ...formData, whatsapp: v })}
                                        accounts={waAccounts}
                                        agentId={agent?._id}
                                        disabled={loading}
                                    />
                                </Section>
                            </div>
                        </div>
                    </DrawerBody>

                    <DrawerFooter>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setOpen(false)}
                            disabled={loading}
                        >
                            {c("actions.cancel")}
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={loading}
                        >
                            {loading
                                ? (isEditing ? t("drawer.updating") : t("drawer.creating"))
                                : (isEditing ? t("drawer.updateAgent") : t("drawer.createAgent"))}
                        </Button>
                    </DrawerFooter>
                </form>

                {/* A tool made from here is ticked for this agent as soon as it is saved. */}
                <Dialog open={newToolOpen} onOpenChange={setNewToolOpen}>
                    <DialogContent size="xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Wrench className="size-5 text-accent-ink" />
                                {t("drawer.newToolTitle")}
                            </DialogTitle>
                            <DialogDescription>{t("drawer.newToolDescription")}</DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[70vh] overflow-y-auto">
                            <ToolForm
                                idPrefix="agent-new-tool"
                                onCancel={() => setNewToolOpen(false)}
                                onSaved={(saved) => {
                                    setTools((prev) => [saved, ...prev.filter((x) => x._id !== saved._id)]);
                                    toggleTool(saved._id, true);
                                    setNewToolOpen(false);
                                    toast.success(t("toast.toolCreated", { name: saved.name }));
                                }}
                            />
                        </div>
                    </DialogContent>
                </Dialog>
            </DrawerContent>
        </Drawer>
    );
}
