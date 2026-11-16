import { isAxiosError } from "axios";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

/** The Bearer header every meetings request carries. Read at call time, not at render. */
export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

/** The owner's Attendee account, as GET /meetings/integration returns it. The key itself never comes back. */
export interface MeetingIntegration {
    _id: string;
    provider: "attendee";
    baseUrl: string;
    hosted: boolean;
    apiKeyLast4: string;
    webhookSecretSet: boolean;
    signedInBots: { googleMeet: boolean; teams: boolean; loginGroup: string | null };
    status: "connected" | "error";
    lastError: string | null;
    verifiedAt: string | null;
}

export type MeetingStatus = "joining" | "waiting_room" | "in_meeting" | "ended" | "failed";
export type MeetingPlatform = "zoom" | "google_meet" | "teams";
export type RespondWhen = "addressed" | "always";

/** One meeting a bot was sent to, as GET /meetings returns it. */
export interface Meeting {
    _id: string;
    callSid: string;
    status: MeetingStatus;
    callStatus: string;
    agentId: string | null;
    agentName: string | null;
    meetingUrl: string | null;
    platform: MeetingPlatform | null;
    botName: string | null;
    botId: string | null;
    botState: string | null;
    respondWhen: RespondWhen;
    signedIn: boolean;
    endReason: string | null;
    error: string | null;
    mutedReplies: number;
    durationSeconds: number;
    createdAt: string;
    joinedAt: string | null;
    endedAt: string | null;
}

export interface AgentRef {
    _id: string;
    name: string;
    voiceEngine?: string;
}

/** A bot on its way in, waiting to be let in, or in the meeting: its row changes on its own. */
export const isLive = (m: Meeting) => m.status === "joining" || m.status === "waiting_room" || m.status === "in_meeting";

/** The server's own words and code for a failed request, when it gave any. */
export function apiError(err: unknown): { message?: string; code?: string; missing?: string[] } {
    if (!isAxiosError(err)) return {};
    const data = err.response?.data as { message?: string; code?: string; missing?: string[] } | undefined;
    return { message: data?.message, code: data?.code, missing: data?.missing };
}

/** "https://app.attendee.dev/" and "https://app.attendee.dev" are the same Attendee. */
export const sameBaseUrl = (a: string, b: string) => a.trim().replace(/\/+$/, "").toLowerCase() === b.trim().replace(/\/+$/, "").toLowerCase();

/** The platform a join link belongs to, by the same rule the server applies; null when it is not one it can join. */
export function platformOf(meetingUrl: string): MeetingPlatform | null {
    let url: URL;
    try {
        url = new URL(meetingUrl.trim());
    } catch {
        return null;
    }
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "zoom.us" || host.endsWith(".zoom.us") || host === "zoomgov.com" || host.endsWith(".zoomgov.com")) return "zoom";
    if (host === "meet.google.com") return "google_meet";
    if (host === "teams.microsoft.com" || host === "teams.live.com" || host.endsWith(".teams.microsoft.com")) return "teams";
    return null;
}
