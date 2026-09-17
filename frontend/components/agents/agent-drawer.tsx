"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import axios from "axios";
import { Plus, Play, Pause, Volume2, Loader2, AlertCircle, Hash, Database, Phone, Calendar, Mic, Bot, Languages, Zap, Sparkles, Timer, PhoneForwarded, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AgentTemplate } from "@/lib/agent-templates";
import { SARVAM_SPEAKERS, SARVAM_LANGUAGES, SARVAM_DEFAULT_SPEAKER, resolveSarvamSpeaker } from "./sarvam-options";
import { GEMINI_VOICES, GEMINI_LANGUAGES, GEMINI_DEFAULT_VOICE, GEMINI_AUTO_LANGUAGE, GEMINI_DEFAULT_LANGUAGE, getGeminiVoiceLabel } from "./gemini-options";
import { missingKeysForEngine as engineMissingKeys, usableEngines, type EngineId, type EngineConfigStatus } from "./voice-engines";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

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
}

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
    const [user, setUser] = useState<any>(() => {
        if (typeof window !== "undefined") {
            try {
                const stored = localStorage.getItem("user");
                return stored ? JSON.parse(stored) : null;
            } catch {
                return null;
            }
        }
        return null;
    });
    const isByok = user?.operatingMode === "byok";

    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: agent?.name || "",
        systemPrompt: agent?.systemPrompt || "",
        openingMessage: agent?.openingMessage || "",
        voice: agent?.voice || "Polly.Amy",
        voiceId: agent?.voiceId || "",
        voiceName: agent?.voiceName || "Rachel",
        useCustomVoice: agent?.useCustomVoice ?? (!isByok ? true : false),
        voiceEngine: agent?.voiceEngine || (!isByok ? "gemini_live" : "classic"),
        sarvamSpeaker: resolveSarvamSpeaker(agent?.sarvamSpeaker),
        sarvamLanguage: agent?.sarvamLanguage || "hi-IN",
        geminiVoice: agent?.geminiVoice || GEMINI_DEFAULT_VOICE,
        geminiLanguage: agent?.geminiLanguage || GEMINI_DEFAULT_LANGUAGE,
        outboundPhoneNumber: agent?.outboundPhoneNumber?._id || agent?.outboundPhoneNumber || "none",
        knowledgeBaseId: agent?.knowledgeBaseId?._id || agent?.knowledgeBaseId || "none",
        language: agent?.language || "pt-BR",
        appointmentBookingEnabled: agent?.appointmentBookingEnabled || false,
        appointmentDescription: agent?.appointmentDescription || "",
        kbSettings: {
            useBasicInfo: agent?.kbSettings?.useBasicInfo ?? true,
            useFaqs: agent?.kbSettings?.useFaqs ?? true,
            useOtherInfo: agent?.kbSettings?.useOtherInfo ?? true,
        },
        ...voiceQualityFormState(agent),
        ...humanTransferFormState(agent)
    });
    const [voices, setVoices] = useState<Voice[]>([]);
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
    const missingKeysForEngine = (engine: string): string[] => {
        if (!isByok && engine === "gemini_live") return [];
        return engineMissingKeys(engine as EngineId, (configStatus ?? null) as EngineConfigStatus | null);
    };

    useEffect(() => {
        if (open) {
            fetchVoices();
            fetchPhoneNumbers();
            fetchConfigStatus();
            fetchKnowledgeBases();
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
                        geminiLanguage: agent.geminiLanguage || GEMINI_DEFAULT_LANGUAGE,
                        outboundPhoneNumber: agent.outboundPhoneNumber?._id || agent.outboundPhoneNumber || "none",
                        knowledgeBaseId: agent.knowledgeBaseId?._id || agent.knowledgeBaseId || "none",
                        language: agent.language || "pt-BR",
                        appointmentBookingEnabled: agent.appointmentBookingEnabled ?? false,
                        appointmentDescription: agent.appointmentDescription || "",
                        kbSettings: {
                            useBasicInfo: agent.kbSettings?.useBasicInfo ?? true,
                            useFaqs: agent.kbSettings?.useFaqs ?? true,
                            useOtherInfo: agent.kbSettings?.useOtherInfo ?? true,
                        },
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
                        useCustomVoice: templateData.useCustomVoice ?? (!isByok ? true : false),
                        voiceEngine: !isByok ? "gemini_live" : "classic",
                        sarvamSpeaker: SARVAM_DEFAULT_SPEAKER,
                        sarvamLanguage: "hi-IN",
                        geminiVoice: GEMINI_DEFAULT_VOICE,
                        geminiLanguage: GEMINI_DEFAULT_LANGUAGE,
                        outboundPhoneNumber: "none",
                        knowledgeBaseId: "none",
                        language: templateData.language || "pt-BR",
                        appointmentBookingEnabled: templateData.appointmentBookingEnabled ?? false,
                        appointmentDescription: templateData.appointmentDescription || "",
                        kbSettings: { useBasicInfo: true, useFaqs: true, useOtherInfo: true },
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
                        useCustomVoice: !isByok ? true : false,
                        voiceEngine: !isByok ? "gemini_live" : "classic",
                        sarvamSpeaker: SARVAM_DEFAULT_SPEAKER,
                        sarvamLanguage: "hi-IN",
                        geminiVoice: GEMINI_DEFAULT_VOICE,
                        geminiLanguage: GEMINI_DEFAULT_LANGUAGE,
                        outboundPhoneNumber: "none",
                        knowledgeBaseId: "none",
                        language: "pt-BR",
                        appointmentBookingEnabled: false,
                        appointmentDescription: "",
                        kbSettings: { useBasicInfo: true, useFaqs: true, useOtherInfo: true },
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
                    // For a NEW agent, default to gemini_live in managed mode, or the first usable engine in BYOK.
                    if (!agent) {
                        if (!isByok) {
                            next.voiceEngine = "gemini_live";
                            next.useCustomVoice = true;
                        } else if (engineMissingKeys((next.voiceEngine || "classic") as EngineId, status).length) {
                            const usable = usableEngines(status, false).filter(e => e !== "gemini_live")[0];
                            if (usable) next.voiceEngine = usable;
                        }
                    }
                    return next;
                });
            }
        } catch (err) {
            console.error("Failed to fetch config status:", err);
        }
    };

    const fetchVoices = async () => {
        try {
            setFetchingVoices(true);
            setFetchVoicesError(null);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/agents/voices`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setVoices(response.data.data.voices);
            }
        } catch (err: any) {
            console.error("Failed to fetch voices:", err);
            setFetchVoicesError("Please check your ElevenLabs API key in settings.");
        } finally {
            setFetchingVoices(false);
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

    /** Labeled range slider (no Slider primitive in the ui kit — native range, themed). */
    const vqSlider = (id: string, label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, hint?: string) => (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
                <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{value.toFixed(2)}</span>
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
                className="w-full h-1.5 cursor-pointer accent-primary"
            />
            {hint && <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>}
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
            const missing = missingKeysForEngine(formData.voiceEngine || "classic");
            if (missing.length) {
                toast.error(t("toast.keysNotConfigured", { count: missing.length, keys: missing.join(" and ") }));
                return;
            }
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
            const effectiveEngine = !isByok
                ? "gemini_live"
                : ((!formData.useCustomVoice && showTwilioVoices)
                    ? "twilio_standard"
                    : (formData.voiceEngine || "classic"));
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
                knowledgeBaseId: formData.knowledgeBaseId === "none" ? null : formData.knowledgeBaseId
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
                    useCustomVoice: !isByok ? true : false,
                    voiceEngine: !isByok ? "gemini_live" : "classic",
                    sarvamSpeaker: SARVAM_DEFAULT_SPEAKER,
                    sarvamLanguage: "hi-IN",
                    geminiVoice: GEMINI_DEFAULT_VOICE,
                    geminiLanguage: GEMINI_AUTO_LANGUAGE,
                    outboundPhoneNumber: "none",
                    knowledgeBaseId: "none",
                    language: "en",
                    appointmentBookingEnabled: false,
                    appointmentDescription: "",
                    kbSettings: { useBasicInfo: true, useFaqs: true, useOtherInfo: true },
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
        <Drawer open={open} onOpenChange={setOpen} direction="bottom" shouldScaleBackground={false}>
            {!isControlled && (
                <DrawerTrigger asChild>
                    {trigger || <Button><Plus className="h-4 w-4" />{t("create.trigger")}</Button>}
                </DrawerTrigger>
            )}
            <DrawerContent
                fullScreen
                className="flex flex-col overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6 md:px-8"
            >
                <DrawerHeader className="flex-shrink-0 border-b border-border/80 py-3 sm:py-4 text-start space-y-0.5 px-0">
                    <DrawerTitle className="text-lg font-semibold sm:text-xl tracking-tight">
                        {isEditing ? t("drawer.editTitle") : t("drawer.createTitle")}
                    </DrawerTitle>
                    <DrawerDescription className="text-xs sm:text-sm text-muted-foreground">
                        {t("drawer.description", { vars: "{{name}}, {{phone}}", custom: "{{appointment_date}}" })}
                    </DrawerDescription>
                </DrawerHeader>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 sm:py-5 pe-2 -mr-2">
                        {/* Only warn about keys the SELECTED engine actually needs — an agent on the
                            self-contained Sarvam engine has no use for Deepgram or OpenRouter. */}
                        {(() => {
                            const missing = formData.useCustomVoice ? missingKeysForEngine(formData.voiceEngine || "classic") : [];
                            if (!missing.length) return null;
                            return (
                                <Alert variant="destructive" className="mb-4 rounded-lg">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <AlertDescription className="text-sm flex items-center justify-between w-full gap-2 flex-wrap">
                                        <span>{t("drawer.missingKeysAlert", { count: missing.length, keys: missing.join(" and ") })}</span>
                                        <Link href="/settings" className="shrink-0 font-bold underline hover:text-red-800">{t("drawer.configure")}</Link>
                                    </AlertDescription>
                                </Alert>
                            );
                        })()}

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
                            {/* LEFT: Prompts & main content */}
                            <div className="flex min-w-0 flex-col gap-5">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5 border-b border-border/60">{t("drawer.sectionContent")}</p>
                                <div className="flex items-start gap-4">
                                    <div
                                        className="h-14 w-14 shrink-0 rounded-xl flex items-center justify-center overflow-hidden bg-cover bg-center"
                                        style={{ backgroundImage: `url(${getAgentGradientUrl(formData.name)})` }}
                                    >
                                        <span className="flex items-center justify-center text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.2)] mix-blend-overlay">
                                            <Bot className="h-7 w-7" strokeWidth={1.75} />
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                        <Label htmlFor="agent-name" className="text-sm font-medium">
                                            {t("drawer.nameLabel")}
                                        </Label>
                                        <Input
                                            id="agent-name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder={t("drawer.namePlaceholder")}
                                            required
                                            disabled={loading}
                                            className="h-9 w-full rounded-md"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="system-prompt" className="text-sm font-medium">{t("drawer.systemPromptLabel")}</Label>
                                    <Textarea
                                        id="system-prompt"
                                        value={formData.systemPrompt}
                                        onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                                        placeholder={t("drawer.systemPromptPlaceholder")}
                                        required
                                        disabled={loading}
                                        className="min-h-[140px] w-full resize-y rounded-md md:min-h-[200px]"
                                    />
                                    <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.variableHint", { vars: "{{name}}, {{phone}}", custom: "{{appointment_date}}" })}</p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="opening-message" className="text-sm font-medium">{t("drawer.firstMessageLabel")}</Label>
                                    <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.firstMessageHint")}</p>
                                    <Textarea
                                        id="opening-message"
                                        value={formData.openingMessage}
                                        onChange={(e) => setFormData({ ...formData, openingMessage: e.target.value })}
                                        placeholder={t("drawer.firstMessagePlaceholder")}
                                        required
                                        disabled={loading}
                                        className="min-h-[88px] w-full resize-y rounded-md"
                                    />
                                    <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.variableHint", { vars: "{{name}}, {{phone}}", custom: "{{appointment_date}}" })}</p>
                                </div>
                            </div>

                            {/* RIGHT: Voice, language, settings */}
                            <div className="flex min-w-0 flex-col gap-5 border-t border-border pt-5 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5 border-b border-border/60">{t("drawer.sectionVoice")}</p>
                                <div className="space-y-1.5">
                                    <Label htmlFor="outbound-number" className="flex items-center gap-2 text-sm font-medium">
                                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        {t("drawer.outboundNumberLabel")}
                                    </Label>
                                    <Select
                                        value={formData.outboundPhoneNumber}
                                        onValueChange={(value) => setFormData({ ...formData, outboundPhoneNumber: value })}
                                        disabled={loading}
                                    >
                                        <SelectTrigger id="outbound-number" className="h-9 w-full rounded-md">
                                            <SelectValue placeholder={t("drawer.selectNumber")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">{t("drawer.noOutboundNumber")}</SelectItem>
                                            {phoneNumbers.map((num: any) => (
                                                <SelectItem key={num._id} value={num._id}>
                                                    <div className="flex items-center gap-2">
                                                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                                                        <span>{num.name} <span className="ltr-data">({num.phoneNumber})</span></span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                            {phoneNumbers.length === 0 && (
                                                <div className="p-2 text-xs text-muted-foreground text-center">
                                                    {t("drawer.noNumbersFound")} <Link href="/phone-numbers" className="underline font-bold">{t("drawer.addOne")}</Link>
                                                </div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.callerIdHint")}</p>
                                </div>

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
                                        } else {
                                            setFormData({ ...formData, useCustomVoice: true, voiceEngine: value });
                                        }
                                    };

                                    const generalLanguageSelect = (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="language-select" className="flex items-center gap-2 text-sm font-medium">
                                                <Languages className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                {t("voiceLanguage.label")}
                                            </Label>
                                            <Select
                                                value={formData.language}
                                                onValueChange={(value) => setFormData({ ...formData, language: value })}
                                                disabled={loading}
                                            >
                                                <SelectTrigger id="language-select" className="h-9 w-full rounded-md">
                                                    <SelectValue placeholder={t("voiceLanguage.placeholder")} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="en"><span className="inline-flex items-center gap-2"><span aria-hidden>🇺🇸</span> {t("voiceLanguage.en")}</span></SelectItem>
                                                    <SelectItem value="ar"><span className="inline-flex items-center gap-2"><span aria-hidden>🇸🇦</span> {t("voiceLanguage.ar")}</span></SelectItem>
                                                    <SelectItem value="hi"><span className="inline-flex items-center gap-2"><span aria-hidden>🇮🇳</span> {t("voiceLanguage.hi")}</span></SelectItem>
                                                    <SelectItem value="he"><span className="inline-flex items-center gap-2"><span aria-hidden>🇮🇱</span> {t("voiceLanguage.he")}</span></SelectItem>
                                                    <SelectItem value="es"><span className="inline-flex items-center gap-2"><span aria-hidden>🇪🇸</span> {t("voiceLanguage.es")}</span></SelectItem>
                                                    <SelectItem value="fr"><span className="inline-flex items-center gap-2"><span aria-hidden>🇫🇷</span> {t("voiceLanguage.fr")}</span></SelectItem>
                                                    <SelectItem value="de"><span className="inline-flex items-center gap-2"><span aria-hidden>🇩🇪</span> {t("voiceLanguage.de")}</span></SelectItem>
                                                    <SelectItem value="pt"><span className="inline-flex items-center gap-2"><span aria-hidden>🇵🇹</span> {t("voiceLanguage.pt")}</span></SelectItem>
                                                    <SelectItem value="pt-BR"><span className="inline-flex items-center gap-2"><span aria-hidden>🇧🇷</span> {t("voiceLanguage.ptBR")}</span></SelectItem>
                                                    <SelectItem value="it"><span className="inline-flex items-center gap-2"><span aria-hidden>🇮🇹</span> {t("voiceLanguage.it")}</span></SelectItem>
                                                    <SelectItem value="ru"><span className="inline-flex items-center gap-2"><span aria-hidden>🇷🇺</span> {t("voiceLanguage.ru")}</span></SelectItem>
                                                    <SelectItem value="ja"><span className="inline-flex items-center gap-2"><span aria-hidden>🇯🇵</span> {t("voiceLanguage.ja")}</span></SelectItem>
                                                    <SelectItem value="ko"><span className="inline-flex items-center gap-2"><span aria-hidden>🇰🇷</span> {t("voiceLanguage.ko")}</span></SelectItem>
                                                    <SelectItem value="nl"><span className="inline-flex items-center gap-2"><span aria-hidden>🇳🇱</span> {t("voiceLanguage.nl")}</span></SelectItem>
                                                    <SelectItem value="ur"><span className="inline-flex items-center gap-2"><span aria-hidden>🇵🇰</span> {t("voiceLanguage.ur")}</span></SelectItem>
                                                    <SelectItem value="ta"><span className="inline-flex items-center gap-2"><span aria-hidden>🇮🇳</span> {t("voiceLanguage.ta")}</span></SelectItem>
                                                    <SelectItem value="multi">{t("voiceLanguage.multi")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {formData.language === 'multi' && (
                                                <p className="text-[11px] text-amber-600 bg-amber-500/10 p-2 rounded-md border border-amber-500/20 leading-snug">
                                                    {t("voiceLanguage.multiHint")}
                                                </p>
                                            )}
                                        </div>
                                    );

                                    const elevenLabsVoiceSelect = (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                <Label htmlFor="voice-id" className="text-sm font-medium">{t("drawer.voiceLabel")}</Label>
                                                {isSipNumber && <Badge variant="outline" className="text-[10px] font-medium border-primary/20 text-primary bg-primary/5">SIP</Badge>}
                                            </div>
                                            <div className="flex gap-2">
                                                <Select
                                                    value={formData.voiceId}
                                                    onValueChange={(value) => {
                                                        const v = voices.find(x => x.voice_id === value);
                                                        setFormData({ ...formData, voiceId: value, voiceName: v?.name || "Rachel" });
                                                    }}
                                                    disabled={loading || fetchingVoices}
                                                >
                                                    <SelectTrigger id="voice-id" className="h-9 flex-1 min-w-0 rounded-md [&_[data-slot=select-value]]:items-start [&_[data-slot=select-value]]:text-start">
                                                        <SelectValue placeholder={fetchingVoices ? "Loading..." : "Select voice"} />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-[280px]">
                                                        {voices.map((v) => (
                                                            <SelectItem key={v.voice_id} value={v.voice_id}>
                                                                <div className="flex flex-col items-start text-start">
                                                                    <span className="font-medium">{v.name}</span>
                                                                    <span className="text-xs text-muted-foreground">{v.category} {v.labels?.gender ? `· ${v.labels.gender}` : ''}</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                        {voices.length === 0 && !fetchingVoices && <div className="p-2 text-xs text-muted-foreground text-center">{t("drawer.noVoices")}</div>}
                                                    </SelectContent>
                                                </Select>
                                                {formData.voiceId && (
                                                    <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9 rounded-md"
                                                        onClick={(e) => { const voice = voices.find(v => v.voice_id === formData.voiceId); if (voice) togglePreview(e, voice); }}
                                                        disabled={!voices.find(v => v.voice_id === formData.voiceId)?.preview_url}>
                                                        {previewingId === formData.voiceId ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
                                                    </Button>
                                                )}
                                            </div>
                                            {fetchVoicesError && <p className="text-[11px] text-destructive font-medium leading-snug">{fetchVoicesError} <Link href="/settings" className="underline">{t("drawer.settingsLink")}</Link></p>}
                                            {!configStatus?.isElevenLabsConfigured && <p className="text-[11px] text-destructive font-medium italic leading-snug">{t("drawer.elevenLabsNotConfigured")} <Link href="/settings" className="underline">{t("drawer.settingsLink")}</Link></p>}
                                        </div>
                                    );

                                    return (
                                        <div className="space-y-4">
                                            {/* 1. Voice Engine — only visible in BYOK Mode. In Managed Mode, the platform-managed Gemini Live engine is used automatically and this section is hidden. */}
                                            {isByok && (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        <Label htmlFor="voice-engine" className="text-sm font-medium">{t("drawer.voiceEngineLabel")}</Label>
                                                        <Badge variant="outline" className="text-[10px] font-medium border-primary/20 text-primary bg-primary/5">{t("drawer.badgeLowLatency")}</Badge>
                                                    </div>
                                                    <Select value={engineValue} onValueChange={handleEngineChange} disabled={loading}>
                                                        <SelectTrigger id="voice-engine" className="h-9 w-full rounded-md [&_[data-slot=select-value]]:items-start [&_[data-slot=select-value]]:text-start">
                                                            <SelectValue placeholder={t("drawer.selectEngine")} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {showTwilioVoices && (
                                                                <SelectItem value="twilio_standard">
                                                                    <div className="flex flex-col items-start text-start">
                                                                        <span className="font-medium">{t("engines.twilioStandard")}</span>
                                                                        <span className="text-xs text-muted-foreground">{t("engines.twilioStandardHint")}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            )}
                                                            <SelectItem value="classic" disabled={classicMissing.length > 0}>
                                                                <div className="flex flex-col items-start text-start">
                                                                    <span className="font-medium">{t("engines.classic")}</span>
                                                                    <span className="text-xs text-muted-foreground">{classicMissing.length ? missingLabel(classicMissing) : t("engines.classicHint")}</span>
                                                                </div>
                                                            </SelectItem>
                                                            <SelectItem value="deepgram_agent" disabled={dgAgentMissing.length > 0}>
                                                                <div className="flex flex-col items-start text-start">
                                                                    <span className="font-medium">{t("engines.deepgramAgent")}</span>
                                                                    <span className="text-xs text-muted-foreground">{dgAgentMissing.length ? missingLabel(dgAgentMissing) : t("engines.deepgramAgentHint")}</span>
                                                                </div>
                                                            </SelectItem>
                                                            <SelectItem value="sarvam" disabled={sarvamMissing.length > 0}>
                                                                <div className="flex flex-col items-start text-start">
                                                                    <span className="font-medium">{t("engines.sarvam")}</span>
                                                                    <span className="text-xs text-muted-foreground">{sarvamMissing.length ? missingLabel(sarvamMissing) : t("engines.sarvamHint")}</span>
                                                                </div>
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    {/* Warn about the SELECTED engine's own missing keys in BYOK mode */}
                                                    {engineValue !== "twilio_standard" && missingKeysForEngine(engineValue).length > 0 && (
                                                        <p className="text-[11px] text-destructive font-medium leading-snug">
                                                            {t("engines.notConfiguredWarning", { count: missingKeysForEngine(engineValue).length, keys: missingKeysForEngine(engineValue).join(" and ") })} <Link href="/settings" className="underline">{t("engines.addInSettings", { count: missingKeysForEngine(engineValue).length })}</Link>.
                                                        </p>
                                                    )}
                                                    {engineValue === "deepgram_agent" && dgAgentMissing.length === 0 && (
                                                        <p className="text-[11px] text-muted-foreground leading-snug">{t("engines.deepgramAgentNote")}</p>
                                                    )}
                                                    {engineValue === "gemini_live" && geminiMissing.length === 0 && (
                                                        <p className="text-[11px] text-muted-foreground leading-snug">{t("engines.geminiNote")}</p>
                                                    )}
                                                    {engineValue === "sarvam" && sarvamMissing.length === 0 && (
                                                        <p className="text-[11px] text-muted-foreground leading-snug">{t("engines.sarvamNote")}</p>
                                                    )}
                                                    {engineValue === "twilio_standard" && (
                                                        <p className="text-[11px] text-muted-foreground leading-snug">{t("engines.twilioStandardNote")}</p>
                                                    )}
                                                </div>
                                            )}

                                            {/* 2. Language — the available languages depend on the engine */}
                                            {engineValue === "gemini_live" ? (
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="gemini-language" className="flex items-center gap-2 text-sm font-medium">
                                                        <Languages className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        {t("voiceLanguage.label")}
                                                    </Label>
                                                    <Select value={formData.geminiLanguage} onValueChange={(value) => setFormData({ ...formData, geminiLanguage: value })} disabled={loading}>
                                                        <SelectTrigger id="gemini-language" className="h-9 w-full rounded-md">
                                                            <SelectValue placeholder={t("voiceLanguage.selectLanguage")} />
                                                        </SelectTrigger>
                                                        <SelectContent className="max-h-[280px]">
                                                            {GEMINI_LANGUAGES.map((l) => (
                                                                <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {formData.geminiLanguage === GEMINI_AUTO_LANGUAGE && (
                                                        <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.geminiAutoLanguageHint")}</p>
                                                    )}
                                                </div>
                                            ) : engineValue === "sarvam" ? (
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="sarvam-language" className="flex items-center gap-2 text-sm font-medium">
                                                        <Languages className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        {t("voiceLanguage.label")}
                                                    </Label>
                                                    <Select value={formData.sarvamLanguage} onValueChange={(value) => setFormData({ ...formData, sarvamLanguage: value })} disabled={loading}>
                                                        <SelectTrigger id="sarvam-language" className="h-9 w-full rounded-md">
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
                                                </div>
                                            ) : generalLanguageSelect}

                                            {/* 3. Voice — Twilio standard, Sarvam speaker, or ElevenLabs voice */}
                                            {engineValue === "twilio_standard" ? (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        <Label htmlFor="twilio-voice" className="text-sm font-medium">{t("drawer.voiceLabel")}</Label>
                                                    </div>
                                                    <Select value={formData.voice} onValueChange={(v) => setFormData({ ...formData, voice: v })} disabled={loading}>
                                                        <SelectTrigger id="twilio-voice" className="h-9 w-full rounded-md">
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
                                                </div>
                                            ) : engineValue === "gemini_live" ? (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        <Label htmlFor="gemini-voice" className="text-sm font-medium">{t("drawer.voiceLabel")}</Label>
                                                    </div>
                                                    <Select value={formData.geminiVoice} onValueChange={(value) => setFormData({ ...formData, geminiVoice: value })} disabled={loading}>
                                                        <SelectTrigger id="gemini-voice" className="h-9 w-full rounded-md [&_[data-slot=select-value]]:items-start [&_[data-slot=select-value]]:text-start">
                                                            <SelectValue placeholder={t("drawer.selectVoice")} />
                                                        </SelectTrigger>
                                                        <SelectContent className="max-h-[280px]">
                                                            {GEMINI_VOICES.map((v) => (
                                                                <SelectItem key={v.name} value={v.name} textValue={`${v.label} (${v.description})`}>
                                                                    <div className="flex flex-col items-start text-start">
                                                                        <span className="font-medium">{v.label}</span>
                                                                        <span className="text-xs text-muted-foreground">{v.description}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            ) : engineValue === "sarvam" ? (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        <Label htmlFor="sarvam-speaker" className="text-sm font-medium">{t("drawer.voiceLabel")}</Label>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Select value={formData.sarvamSpeaker} onValueChange={(value) => setFormData({ ...formData, sarvamSpeaker: value })} disabled={loading}>
                                                            <SelectTrigger id="sarvam-speaker" className="h-9 flex-1 min-w-0 rounded-md capitalize">
                                                                <SelectValue placeholder={t("drawer.selectVoice")} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {SARVAM_SPEAKERS.map((s) => (
                                                                    <SelectItem key={s} value={s}><span className="capitalize">{s}</span></SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9 rounded-md"
                                                            onClick={playSarvamPreview}
                                                            disabled={sarvamPreviewLoading || loading || !formData.sarvamSpeaker}
                                                            title={t("drawer.sarvamPreviewTitle")}>
                                                            {sarvamPreviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : sarvamPreviewPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.sarvamPreviewHint")}</p>
                                                </div>
                                            ) : elevenLabsVoiceSelect}

                                            {/* 4. Voice Quality & Conversation — classic engines get the full set;
                                                the Deepgram Voice Agent engine supports the ElevenLabs model only
                                                (its turn-taking and TTS streaming run server-side at Deepgram). */}
                                            {(engineValue === "classic" || engineValue === "deepgram_agent") && (
                                                <div className="space-y-4 rounded-lg border border-border/80 bg-muted/20 p-3">
                                                    <div className="flex items-center gap-2">
                                                        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("voiceQuality.section")}</span>
                                                    </div>

                                                    {engineValue === "classic" && (
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="vq-preset" className="text-xs font-medium">{t("voiceQuality.presetLabel")}</Label>
                                                            <Select
                                                                value={formData.voiceQualityPreset}
                                                                onValueChange={(v) => setFormData({ ...formData, voiceQualityPreset: v })}
                                                                disabled={loading}
                                                            >
                                                                <SelectTrigger id="vq-preset" className="h-9 w-full rounded-md [&_[data-slot=select-value]]:items-start [&_[data-slot=select-value]]:text-start">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {([
                                                                        ["default", t("voiceQuality.presetDefault"), t("voiceQuality.presetDefaultHint")],
                                                                        ["fast", t("voiceQuality.presetFast"), t("voiceQuality.presetFastHint")],
                                                                        ["balanced", t("voiceQuality.presetBalanced"), t("voiceQuality.presetBalancedHint")],
                                                                        ["natural", t("voiceQuality.presetNatural"), t("voiceQuality.presetNaturalHint")],
                                                                        ["expressive", t("voiceQuality.presetExpressive"), t("voiceQuality.presetExpressiveHint")],
                                                                        ["custom", t("voiceQuality.presetCustom"), t("voiceQuality.presetCustomHint")],
                                                                    ] as [string, string, string][]).map(([value, label, hint]) => (
                                                                        <SelectItem key={value} value={value}>
                                                                            <div className="flex flex-col items-start text-start">
                                                                                <span className="font-medium">{label}</span>
                                                                                <span className="text-xs text-muted-foreground">{hint}</span>
                                                                            </div>
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <p className="text-[10px] text-muted-foreground leading-snug">{t("voiceQuality.presetHint")}</p>
                                                        </div>
                                                    )}

                                                    {/* Model — applies to classic AND Deepgram Voice Agent */}
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="vq-model" className="text-xs font-medium">{t("voiceQuality.modelLabel")}</Label>
                                                        <Select
                                                            value={formData.elevenLabsVoiceSettings.model}
                                                            onValueChange={(v) => setElSetting("model", v)}
                                                            disabled={loading}
                                                        >
                                                            <SelectTrigger id="vq-model" className="h-9 w-full rounded-md">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="auto">{t("voiceQuality.modelAuto")}</SelectItem>
                                                                <SelectItem value="eleven_turbo_v2_5">{t("voiceQuality.modelTurbo")}</SelectItem>
                                                                <SelectItem value="eleven_flash_v2_5">{t("voiceQuality.modelFlash")}</SelectItem>
                                                                <SelectItem value="eleven_multilingual_v2">{t("voiceQuality.modelMultilingual")}</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        {formData.elevenLabsVoiceSettings.model === "auto" && (
                                                            <p className="text-[10px] text-muted-foreground leading-snug">{t("voiceQuality.modelAutoHint")}</p>
                                                        )}
                                                    </div>

                                                    {engineValue === "deepgram_agent" && (
                                                        <p className="text-[10px] text-muted-foreground leading-snug">{t("voiceQuality.dgAgentNote")}</p>
                                                    )}

                                                    {engineValue === "classic" && (
                                                        <>
                                                            <div className="space-y-1.5">
                                                                <Label htmlFor="vq-latency" className="text-xs font-medium">{t("voiceQuality.latencyLabel")}</Label>
                                                                <Select
                                                                    value={formData.elevenLabsVoiceSettings.latencyProfile}
                                                                    onValueChange={(v) => setElSetting("latencyProfile", v)}
                                                                    disabled={loading}
                                                                >
                                                                    <SelectTrigger id="vq-latency" className="h-9 w-full rounded-md">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="auto">{t("voiceQuality.latencyAuto")}</SelectItem>
                                                                        <SelectItem value="fast">{t("voiceQuality.latencyFast")}</SelectItem>
                                                                        <SelectItem value="balanced">{t("voiceQuality.latencyBalanced")}</SelectItem>
                                                                        <SelectItem value="quality">{t("voiceQuality.latencyQuality")}</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            {formData.voiceQualityPreset === "custom" && (
                                                                <div className="space-y-3 rounded-md border border-border/60 bg-background/60 p-3">
                                                                    {vqSlider("vq-stability", t("voiceQuality.stability"), formData.elevenLabsVoiceSettings.stability, 0, 1, 0.05, (v) => setElSetting("stability", v), t("voiceQuality.stabilityHint"))}
                                                                    {vqSlider("vq-similarity", t("voiceQuality.similarityBoost"), formData.elevenLabsVoiceSettings.similarityBoost, 0, 1, 0.05, (v) => setElSetting("similarityBoost", v))}
                                                                    {vqSlider("vq-style", t("voiceQuality.style"), formData.elevenLabsVoiceSettings.style, 0, 1, 0.05, (v) => setElSetting("style", v))}
                                                                    {vqSlider("vq-speed", t("voiceQuality.speed"), formData.elevenLabsVoiceSettings.speed, 0.7, 1.2, 0.05, (v) => setElSetting("speed", v))}
                                                                    <div className="flex items-center justify-between gap-2 pt-1">
                                                                        <Label htmlFor="vq-speaker-boost" className="text-xs font-medium">{t("voiceQuality.speakerBoost")}</Label>
                                                                        <Switch
                                                                            id="vq-speaker-boost"
                                                                            checked={formData.elevenLabsVoiceSettings.useSpeakerBoost}
                                                                            onCheckedChange={(c) => setElSetting("useSpeakerBoost", c)}
                                                                            disabled={loading}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="space-y-3 pt-1">
                                                                <div className="flex items-center gap-2">
                                                                    <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("voiceQuality.turnTakingTitle")}</span>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div className="space-y-1">
                                                                        <Label htmlFor="vq-endpointing" className="text-xs font-medium">{t("voiceQuality.endpointingLabel")}</Label>
                                                                        <Input
                                                                            id="vq-endpointing"
                                                                            type="number"
                                                                            min={100}
                                                                            max={2000}
                                                                            step={50}
                                                                            value={formData.turnTaking.endpointingMs}
                                                                            onChange={(e) => setTurnTaking("endpointingMs", e.target.value === "" ? "" : parseInt(e.target.value))}
                                                                            disabled={loading}
                                                                            className="h-9 w-full rounded-md"
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <Label htmlFor="vq-silence" className="text-xs font-medium">{t("voiceQuality.silenceWaitLabel")}</Label>
                                                                        <Input
                                                                            id="vq-silence"
                                                                            type="number"
                                                                            min={200}
                                                                            max={3000}
                                                                            step={100}
                                                                            value={formData.turnTaking.silenceWaitMs}
                                                                            onChange={(e) => setTurnTaking("silenceWaitMs", e.target.value === "" ? "" : parseInt(e.target.value))}
                                                                            disabled={loading}
                                                                            className="h-9 w-full rounded-md"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <p className="text-[10px] text-muted-foreground leading-snug">{t("voiceQuality.endpointingHint")} {t("voiceQuality.silenceWaitHint")}</p>
                                                                <div className="space-y-1">
                                                                    <Label htmlFor="vq-interrupt" className="text-xs font-medium">{t("voiceQuality.interruptLabel")}</Label>
                                                                    <Select
                                                                        value={formData.turnTaking.interruptSensitivity}
                                                                        onValueChange={(v) => setTurnTaking("interruptSensitivity", v)}
                                                                        disabled={loading}
                                                                    >
                                                                        <SelectTrigger id="vq-interrupt" className="h-9 w-full rounded-md">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="low">{t("voiceQuality.interruptLow")}</SelectItem>
                                                                            <SelectItem value="normal">{t("voiceQuality.interruptNormal")}</SelectItem>
                                                                            <SelectItem value="high">{t("voiceQuality.interruptHigh")}</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5 border-b border-border/60">{t("drawer.sectionCapabilities")}</p>
                                <div className="space-y-5">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <Database className="h-3.5 w-3.5 text-primary shrink-0" />
                                            <Label className="text-sm font-medium">{t("drawer.knowledgeBaseLabel")}</Label>
                                        </div>
                                        <Select
                                            value={formData.knowledgeBaseId}
                                            onValueChange={(value) => setFormData({ ...formData, knowledgeBaseId: value })}
                                            disabled={loading}
                                        >
                                            <SelectTrigger id="kb-select" className="h-9 w-full rounded-md">
                                                <SelectValue placeholder={t("drawer.noKnowledgeBase")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">{t("drawer.noKnowledgeBase")}</SelectItem>
                                                {knowledgeBases.map((kb) => (
                                                    <SelectItem key={kb._id} value={kb._id}>
                                                        {kb.name}
                                                    </SelectItem>
                                                ))}
                                                {knowledgeBases.length === 0 && (
                                                    <div className="p-2 text-xs text-muted-foreground text-center">
                                                        {t("drawer.noKnowledgeBases")} <Link href="/knowledge-base" className="underline font-bold">{t("drawer.createOne")}</Link>
                                                    </div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        {formData.knowledgeBaseId !== "none" && (
                                            <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-md border border-border/80 bg-muted/20">
                                                <div className="flex items-center gap-2">
                                                    <Switch id="use-basic-info" checked={formData.kbSettings.useBasicInfo} onCheckedChange={(c) => setFormData({ ...formData, kbSettings: { ...formData.kbSettings, useBasicInfo: c } })} />
                                                    <Label htmlFor="use-basic-info" className="text-sm">{t("drawer.kbBasicInfo")}</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch id="use-faqs" checked={formData.kbSettings.useFaqs} onCheckedChange={(c) => setFormData({ ...formData, kbSettings: { ...formData.kbSettings, useFaqs: c } })} />
                                                    <Label htmlFor="use-faqs" className="text-sm">{t("drawer.kbFaqs")}</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch id="use-other-info" checked={formData.kbSettings.useOtherInfo} onCheckedChange={(c) => setFormData({ ...formData, kbSettings: { ...formData.kbSettings, useOtherInfo: c } })} />
                                                    <Label htmlFor="use-other-info" className="text-sm">{t("drawer.kbOtherInfo")}</Label>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => !loading && setFormData({ ...formData, appointmentBookingEnabled: !formData.appointmentBookingEnabled })}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); !loading && setFormData({ ...formData, appointmentBookingEnabled: !formData.appointmentBookingEnabled }); } }}
                                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/80 p-3 transition-colors bg-muted/20 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-pressed={formData.appointmentBookingEnabled}
                                        aria-label={t("drawer.toggleAppointments")}
                                    >
                                        <div className="space-y-0.5 min-w-0 pointer-events-none">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                <span className="text-sm font-semibold">{t("drawer.appointmentBooking")}</span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.appointmentBookingHint")}</p>
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
                                        <div className="space-y-1.5">
                                            <Label htmlFor="appointment-desc" className="text-sm font-medium">{t("drawer.appointmentDescriptionLabel")}</Label>
                                            <Textarea
                                                id="appointment-desc"
                                                value={formData.appointmentDescription}
                                                onChange={(e) => setFormData({ ...formData, appointmentDescription: e.target.value })}
                                                placeholder={t("drawer.appointmentDescriptionPlaceholder")}
                                                rows={2}
                                                disabled={loading}
                                                className="w-full resize-y rounded-md text-sm"
                                            />
                                        </div>
                                    )}

                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => !loading && updateTransfer({ enabled: !formData.humanTransfer.enabled })}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); !loading && updateTransfer({ enabled: !formData.humanTransfer.enabled }); } }}
                                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/80 p-3 transition-colors bg-muted/20 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-pressed={formData.humanTransfer.enabled}
                                        aria-label={t("drawer.toggleHumanTransfer")}
                                    >
                                        <div className="space-y-0.5 min-w-0 pointer-events-none">
                                            <div className="flex items-center gap-2">
                                                <PhoneForwarded className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                <span className="text-sm font-semibold">{t("drawer.humanTransfer")}</span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.humanTransferHint")}</p>
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
                                        <div className="space-y-4 rounded-lg border border-border/80 p-3">
                                            <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.humanTransferSipNote")}</p>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <Label className="text-sm font-medium">{t("drawer.destinations")}</Label>
                                                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-md text-xs" onClick={addDestination} disabled={loading}>
                                                        <Plus className="me-1 h-3.5 w-3.5" />
                                                        {t("drawer.addDestination")}
                                                    </Button>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.destinationsHint")}</p>
                                            </div>

                                            {formData.humanTransfer.destinations.length === 0 ? (
                                                <p className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                                                    {t("drawer.noDestinations")}
                                                </p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {formData.humanTransfer.destinations.map((d, index) => (
                                                        <div key={index} className="space-y-2 rounded-md border border-border/80 p-3">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="space-y-1">
                                                                    <Label htmlFor={`transfer-id-${index}`} className="text-[11px] text-muted-foreground">{t("drawer.destinationId")}</Label>
                                                                    <Input
                                                                        id={`transfer-id-${index}`}
                                                                        value={d.id}
                                                                        placeholder={t("drawer.destinationIdPlaceholder")}
                                                                        disabled={loading}
                                                                        onChange={(e) => updateDestination(index, { id: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                                                                        className="h-8 rounded-md text-sm ltr-data"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <Label htmlFor={`transfer-name-${index}`} className="text-[11px] text-muted-foreground">{t("drawer.destinationName")}</Label>
                                                                    <Input
                                                                        id={`transfer-name-${index}`}
                                                                        value={d.name}
                                                                        placeholder={t("drawer.destinationNamePlaceholder")}
                                                                        disabled={loading}
                                                                        onChange={(e) => updateDestination(index, { name: e.target.value })}
                                                                        className="h-8 rounded-md text-sm"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="space-y-1">
                                                                    <Label htmlFor={`transfer-phone-${index}`} className="text-[11px] text-muted-foreground">{t("drawer.destinationPhone")}</Label>
                                                                    <Input
                                                                        id={`transfer-phone-${index}`}
                                                                        value={d.value}
                                                                        placeholder={t("drawer.destinationPhonePlaceholder")}
                                                                        disabled={loading}
                                                                        onChange={(e) => updateDestination(index, { value: e.target.value })}
                                                                        className="h-8 rounded-md text-sm ltr-data"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <Label htmlFor={`transfer-timeout-${index}`} className="text-[11px] text-muted-foreground">
                                                                        {t("drawer.destinationTimeout")} ({t("drawer.seconds")})
                                                                    </Label>
                                                                    <Input
                                                                        id={`transfer-timeout-${index}`}
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
                                                                        className="h-8 rounded-md text-sm"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-2 pt-1">
                                                                <div className="flex items-center gap-2">
                                                                    <Switch
                                                                        id={`transfer-enabled-${index}`}
                                                                        checked={d.enabled}
                                                                        onCheckedChange={(checked) => updateDestination(index, { enabled: checked })}
                                                                        disabled={loading}
                                                                    />
                                                                    <Label htmlFor={`transfer-enabled-${index}`} className="text-xs">{t("drawer.destinationEnabled")}</Label>
                                                                </div>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 rounded-md px-2 text-muted-foreground hover:text-destructive"
                                                                    onClick={() => removeDestination(index)}
                                                                    disabled={loading}
                                                                    aria-label={t("drawer.removeDestination")}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="space-y-1.5">
                                                <Label htmlFor="transfer-default" className="text-sm font-medium">{t("drawer.defaultDestination")}</Label>
                                                <Select
                                                    value={formData.humanTransfer.defaultDestinationId || "none"}
                                                    onValueChange={(value) => updateTransfer({ defaultDestinationId: value === "none" ? "" : value })}
                                                    disabled={loading}
                                                >
                                                    <SelectTrigger id="transfer-default" className="h-9 w-full rounded-md">
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
                                                <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.defaultDestinationHint")}</p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="transfer-ring-timeout" className="text-sm font-medium">
                                                        {t("drawer.ringTimeout")} ({t("drawer.seconds")})
                                                    </Label>
                                                    <Input
                                                        id="transfer-ring-timeout"
                                                        type="number"
                                                        min={5}
                                                        max={60}
                                                        value={formData.humanTransfer.ringTimeoutSeconds}
                                                        disabled={loading}
                                                        onChange={(e) => updateTransfer({ ringTimeoutSeconds: Math.max(5, Math.min(60, Number(e.target.value) || 20)) })}
                                                        className="h-9 rounded-md"
                                                    />
                                                    <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.ringTimeoutHint")}</p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="transfer-max" className="text-sm font-medium">{t("drawer.maxTransfers")}</Label>
                                                    <Input
                                                        id="transfer-max"
                                                        type="number"
                                                        min={1}
                                                        max={10}
                                                        value={formData.humanTransfer.maxTransfersPerCall}
                                                        disabled={loading}
                                                        onChange={(e) => updateTransfer({ maxTransfersPerCall: Math.max(1, Math.min(10, Number(e.target.value) || 3)) })}
                                                        className="h-9 rounded-md"
                                                    />
                                                    <p className="text-[11px] text-muted-foreground leading-snug">{t("drawer.maxTransfersHint")}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <DrawerFooter className="flex-shrink-0 border-t border-border bg-background py-4 px-4 sm:px-6 md:px-8 gap-3 w-full flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={loading}
                            className="w-full sm:w-auto min-w-0 h-10 rounded-md border-border bg-background text-foreground hover:bg-muted"
                        >
                            {c("actions.cancel")}
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full sm:w-auto min-w-0 h-10 rounded-md font-medium"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="me-2 h-4 w-4 animate-spin shrink-0" />
                                    {isEditing ? t("drawer.updating") : t("drawer.creating")}
                                </>
                            ) : (
                                isEditing ? t("drawer.updateAgent") : t("drawer.createAgent")
                            )}
                        </Button>
                    </DrawerFooter>
                </form>
            </DrawerContent>
        </Drawer>
    );
}
