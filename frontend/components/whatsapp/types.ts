import { isAxiosError } from "axios";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

/** The Bearer header every WhatsApp request carries. Read at call time, not at render. */
export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

/** A connected WhatsApp number, as GET /whatsapp/accounts returns it (accountJson in routes/whatsapp.js). */
export interface WhatsAppAccount {
    _id: string;
    name: string;
    displayPhoneNumber: string;
    verifiedName: string;
    phoneNumberId: string;
    wabaId: string;
    qualityRating: string;
    messagingLimitTier: string | null;
    connection: "embedded_signup" | "manual";
    coexistence: boolean;
    status: "connected" | "error" | "disconnected";
    lastError: string | null;
    tokenExpiresAt: string | null;
    webhook: { status: "pending" | "ok" | "error"; lastReceivedAt: string | null; url: string; ownDoor: boolean };
    inboundAgentId: string | null;
    settings: WhatsAppAccountSettings;
    createdAt: string;
    updatedAt: string;
}

export interface WhatsAppAccountSettings {
    messagingEnabled: boolean;
    voiceNoteReplies: boolean;
    typingIndicator: boolean;
    inactivityMinutes: number;
    fallbackReply: string;
    humanPauseMinutes: number;
}

/** What "Connect with Meta" needs: GET /whatsapp/config. */
export interface WhatsAppConfig {
    embeddedSignup: { enabled: boolean; appId: string | null; configId: string | null; graphVersion: string };
    webhookBase: string;
}

export interface WhatsAppTemplate {
    _id: string;
    accountId: string;
    name: string;
    language: string;
    category: string | null;
    status: string | null;
    body: string;
    parameterCount: number;
    parameterNames: string[];
    headerFormat: string | null;
    syncedAt: string | null;
}

export interface WhatsAppMessage {
    _id: string;
    accountId: string;
    conversationId: string | null;
    wamid: string | null;
    direction: "in" | "out";
    type: string;
    text: string;
    transcript: string | null;
    voice: boolean;
    hasMedia: boolean;
    mediaMimeType: string | null;
    mediaFilename: string | null;
    origin: string;
    status: "received" | "accepted" | "sent" | "delivered" | "read" | "failed";
    error: { code: number | null; message: string | null } | null;
    template: { name: string; language: string | null; category: string | null } | null;
    pricing: { category: string | null; billable: boolean | null; type: string | null } | null;
    metaCostMicros: number;
    createdAt: string;
}

/** One tool the agent used during a chat, the same shape as CallLog.toolCalls. */
export interface WhatsAppToolCall {
    type?: "integration" | "webhook" | "whatsapp";
    serverName?: string;
    tool?: string;
    ok?: boolean;
    error?: string | null;
    createdAt?: string;
}

export interface WhatsAppConversation {
    _id: string;
    accountId: string;
    agentId: string | null;
    contact: { waId: string; name: string; leadId: string | null; optedOut: boolean };
    status: "open" | "closed";
    startedAt: string;
    lastMessageAt: string;
    closedReason: string | null;
    messageCount: number;
    metaCostMicros: number;
    toolCalls: WhatsAppToolCall[];
    messages?: WhatsAppMessage[];
}

export interface AgentWhatsAppTemplateRef { name: string | null; language: string | null }

/** An agent's WhatsApp block: the number it sends from on calls, and its WhatsApp tools. */
export interface AgentWhatsApp {
    accountId: string | null;
    tools: { messages: boolean; templates: boolean; schedule: boolean; interactive: boolean };
    templates: {
        follow_up: AgentWhatsAppTemplateRef | null;
        reminder: AgentWhatsAppTemplateRef | null;
        booking_confirmation: AgentWhatsAppTemplateRef | null;
    };
    allowedTemplates: string[];
    autoBookingConfirmation: boolean;
    autoReminderMinutes: number;
    chatModel: string | null;
    maxSendsPerCall: number;
    allowMarketing: boolean;
}

export const DEFAULT_AGENT_WHATSAPP: AgentWhatsApp = {
    accountId: null,
    tools: { messages: false, templates: false, schedule: false, interactive: false },
    templates: { follow_up: null, reminder: null, booking_confirmation: null },
    allowedTemplates: [],
    autoBookingConfirmation: false,
    autoReminderMinutes: 0,
    chatModel: null,
    maxSendsPerCall: 3,
    allowMarketing: false,
};

/** The agent's WhatsApp block with every field present, whatever the API sent (older agents have none). */
export function agentWhatsAppOf(raw: Partial<AgentWhatsApp> | null | undefined): AgentWhatsApp {
    const ref = (r: AgentWhatsAppTemplateRef | null | undefined): AgentWhatsAppTemplateRef | null =>
        r && r.name ? { name: r.name, language: r.language ?? null } : null;
    const accountId = raw?.accountId as unknown;
    return {
        accountId: typeof accountId === "string" && accountId ? accountId : accountId && typeof accountId === "object" ? String((accountId as { _id?: string })._id ?? "") || null : null,
        tools: { ...DEFAULT_AGENT_WHATSAPP.tools, ...(raw?.tools ?? {}) },
        templates: {
            follow_up: ref(raw?.templates?.follow_up),
            reminder: ref(raw?.templates?.reminder),
            booking_confirmation: ref(raw?.templates?.booking_confirmation),
        },
        allowedTemplates: Array.isArray(raw?.allowedTemplates) ? raw.allowedTemplates : [],
        autoBookingConfirmation: Boolean(raw?.autoBookingConfirmation),
        autoReminderMinutes: typeof raw?.autoReminderMinutes === "number" ? raw.autoReminderMinutes : 0,
        chatModel: raw?.chatModel ?? null,
        maxSendsPerCall: typeof raw?.maxSendsPerCall === "number" ? raw.maxSendsPerCall : 3,
        allowMarketing: Boolean(raw?.allowMarketing),
    };
}

export interface AgentRef { _id: string; name: string }

/** The server's own words and code for a failed request, when it gave any. */
export function apiError(err: unknown): { message?: string; code?: string; status?: number } {
    if (!isAxiosError(err)) return {};
    const data = err.response?.data as { message?: string; code?: string } | undefined;
    return { message: data?.message, code: data?.code, status: err.response?.status };
}

/** The plan does not include WhatsApp: the API answered 403 with this code. */
export const isPlanGate = (err: unknown) => apiError(err).code === "feature_not_in_plan";
