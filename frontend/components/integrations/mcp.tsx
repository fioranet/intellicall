"use client";

import { useLocale, useTranslations } from "next-intl";
import axios, { isAxiosError, type AxiosRequestConfig } from "axios";
import { Badge } from "@wixzel/react";

/**
 * What the Integrations pages share: the shape of an MCP server as the API
 * returns it, one authenticated request helper, and the small badges that say
 * what state a server is in and what a tool may do.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

export type McpTransport = "auto" | "streamable_http" | "sse";
export type McpAuthType = "none" | "headers" | "oauth";
export type McpStatus = "pending" | "ready" | "needs_auth" | "error";

export interface McpTool {
    name: string;
    title?: string | null;
    description?: string | null;
    inputSchema?: unknown;
    readOnly?: boolean;
    destructive?: boolean;
    enabled: boolean;
}

export interface McpServer {
    _id: string;
    name: string;
    url: string;
    transport: McpTransport;
    auth: {
        type: McpAuthType;
        headerNames: string[];
        oauth: { clientId?: string | null; scope?: string | null; connected: boolean; connectedAt?: string | null } | null;
    };
    status: McpStatus;
    lastError?: string | null;
    serverInfo?: { name?: string | null; version?: string | null } | null;
    tools: McpTool[];
    toolsRefreshedAt?: string | null;
    createdAt?: string;
}

/** POST /mcp-servers/discover: a server's tools, read without saving anything. */
export interface McpToolDiscovery {
    status: "ready" | "needs_auth" | "error";
    lastError?: string | null;
    serverInfo: { name?: string | null; version?: string | null } | null;
    tools: Omit<McpTool, "enabled">[];
}

/** The body POST and PATCH /mcp-servers take. */
export interface McpServerBody {
    name?: string;
    url?: string;
    transport?: McpTransport;
    auth?: McpAuthBody;
    enabledTools?: string[];
}

export type McpAuthBody =
    | { type: "none" }
    | { type: "headers"; headers: { name: string; value?: string }[] }
    | { type: "oauth"; oauth?: { clientId?: string; clientSecret?: string; scope?: string } };

/** An agent as GET /agents lists it, as far as these pages need. */
export interface AgentRef {
    _id: string;
    name: string;
    mcpServerIds?: string[];
}

/** The server's own words for a failed request, when it gave any. */
export const apiMessage = (err: unknown): string | undefined =>
    isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined;

/** One request to the API with the signed-in user's token; the `data` of a success envelope. */
export async function api<T>(method: "get" | "post" | "patch" | "delete", path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const res = await axios.request<{ status: string; data: T; message?: string }>({
        method,
        url: `${API_BASE_URL}${path}`,
        data: body,
        headers: { Authorization: `Bearer ${token}` },
        ...config,
    });
    if (res.data?.status && res.data.status !== "success") throw new Error(res.data.message || "Request failed");
    return res.data?.data;
}

/** The server's state as a badge: Ready in green, a sign-in in amber, an error in red. */
export function StatusBadge({ status, className }: { status: McpStatus; className?: string }) {
    const t = useTranslations("integrations");
    const tone = status === "ready" ? "success" : status === "error" ? "danger" : status === "needs_auth" ? "warning" : "neutral";
    return <Badge tone={tone} dot size="sm" className={className}>{t(`status.${status}`)}</Badge>;
}

/**
 * What a tool may do, as the MCP server annotates it. An unmarked tool is
 * treated as writing, as the MCP spec says to.
 */
export function ToolRisk({ readOnly, destructive, className }: { readOnly?: boolean | null; destructive?: boolean | null; className?: string }) {
    const t = useTranslations("integrations");
    if (readOnly) return <Badge size="sm" className={className}>{t("risk.readOnly")}</Badge>;
    if (destructive) return <Badge tone="danger" size="sm" className={className}>{t("risk.destructive")}</Badge>;
    return <Badge tone="warning" size="sm" className={className}>{t("risk.writes")}</Badge>;
}

/** "3 minutes ago", in the reader's language. */
export function useAgo(): (date: string | Date) => string {
    const locale = useLocale();
    return (date) => {
        const ms = new Date(date).getTime() - Date.now();
        if (Number.isNaN(ms)) return "";
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
        const abs = Math.abs(ms);
        if (abs < 60_000) return rtf.format(Math.round(ms / 1000), "second");
        if (abs < 3_600_000) return rtf.format(Math.round(ms / 60_000), "minute");
        if (abs < 86_400_000) return rtf.format(Math.round(ms / 3_600_000), "hour");
        if (abs < 30 * 86_400_000) return rtf.format(Math.round(ms / 86_400_000), "day");
        return rtf.format(Math.round(ms / (30 * 86_400_000)), "month");
    };
}
