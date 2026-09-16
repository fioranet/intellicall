"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import axios from "axios";
import { KeyRound } from "lucide-react";
import { N8nIntegration } from "@/components/settings/n8n-integration";
import { ApiAccessCard } from "@/components/settings/api-access";
import { WhatsAppIntegration } from "@/components/settings/whatsapp-integration";
import { SlackIntegration } from "@/components/settings/slack-integration";
import { HubSpotIntegration } from "@/components/settings/hubspot-integration";
import { GoogleCalendarIntegration } from "@/components/settings/google-calendar-integration";
import { GoogleSheetsIntegration } from "@/components/settings/google-sheets-integration";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

type IntegrationDef = {
    id: string;
    name: string;
    description: string;
    logo?: string;
    statusKey?: string; // key in /settings/config-status marking it connected
};

const INTEGRATIONS: IntegrationDef[] = [
    { id: "n8n", name: "n8n", description: "Workflow automation", logo: "/images/integrations/n8n.png", statusKey: "isN8nConnected" },
    { id: "api-access", name: "API Access", description: "Personal API key" },
    { id: "whatsapp", name: "WhatsApp", description: "Alerts & client reminders", logo: "/images/integrations/whatsapp.png", statusKey: "isWhatsAppConnected" },
    { id: "slack", name: "Slack", description: "Channel notifications", logo: "/images/integrations/slack.png", statusKey: "isSlackConnected" },
    { id: "hubspot", name: "HubSpot CRM", description: "Lead contact sync", logo: "/images/integrations/hubspot.png", statusKey: "isHubSpotConnected" },
    { id: "google-calendar", name: "Google Calendar", description: "Appointment sync", logo: "/images/integrations/calendar.png", statusKey: "isGoogleCalendarConnected" },
    { id: "google-sheets", name: "Google Sheets", description: "Lead import & sync", logo: "/images/integrations/sheets.png", statusKey: "isGoogleSheetsConnected" }
];

// OAuth callbacks land on /settings?<param>=connected|error — open that integration
const PARAM_TO_ID: Record<string, string> = {
    slack: "slack",
    hubspot: "hubspot",
    google_calendar: "google-calendar",
    google_sheets: "google-sheets",
    whatsapp: "whatsapp",
    n8n: "n8n"
};

export function IntegrationsPanel() {
    const searchParams = useSearchParams();
    const [selected, setSelected] = useState<string>(() => {
        for (const [param, id] of Object.entries(PARAM_TO_ID)) {
            if (searchParams.get(param)) return id;
        }
        return INTEGRATIONS[0].id;
    });
    const [connected, setConnected] = useState<Record<string, boolean>>({});
    const [hasApiKey, setHasApiKey] = useState(false);

    // Refetch when switching items so dots reflect connects/disconnects
    // made inside the previously open card.
    useEffect(() => {
        let cancelled = false;
        const fetchStatuses = async () => {
            const token = localStorage.getItem("token");
            if (!token) return;
            try {
                const resp = await axios.get(`${API_BASE_URL}/settings/config-status`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!cancelled && resp.data?.status === "success") {
                    const d = resp.data.data;
                    const map: Record<string, boolean> = {};
                    for (const item of INTEGRATIONS) {
                        if (item.statusKey) map[item.id] = !!d[item.statusKey];
                    }
                    setConnected(map);
                }
            } catch {
                // silent
            }
            try {
                const resp = await axios.get(`${API_BASE_URL}/users/api-key`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!cancelled) setHasApiKey(!!resp.data?.data?.hasKey);
            } catch {
                // silent
            }
        };
        fetchStatuses();
        return () => { cancelled = true; };
    }, [selected]);

    const renderCard = () => {
        switch (selected) {
            case "n8n": return <N8nIntegration />;
            case "api-access": return <ApiAccessCard />;
            case "whatsapp": return <WhatsAppIntegration />;
            case "slack": return <SlackIntegration />;
            case "hubspot": return <HubSpotIntegration />;
            case "google-calendar": return <GoogleCalendarIntegration />;
            case "google-sheets": return <GoogleSheetsIntegration />;
            default: return null;
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 max-w-5xl">
            <aside className="lg:w-64 shrink-0">
                <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                    {INTEGRATIONS.map((item) => {
                        const isSelected = selected === item.id;
                        const isConnected = item.id === "api-access" ? hasApiKey : !!connected[item.id];
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelected(item.id)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-start transition-colors shrink-0 lg:shrink lg:w-full ${
                                    isSelected
                                        ? "bg-primary/5 border border-primary/20"
                                        : "border border-transparent hover:bg-muted"
                                }`}
                            >
                                {item.logo ? (
                                    <Image src={item.logo} alt={item.name} width={20} height={20} className="shrink-0 h-5 w-5 object-contain" />
                                ) : (
                                    <KeyRound className="h-5 w-5 text-primary shrink-0" />
                                )}
                                <span className="min-w-0">
                                    <span className={`block text-sm leading-tight ${isSelected ? "font-bold text-primary" : "font-medium"}`}>
                                        {item.name}
                                    </span>
                                    <span className="hidden lg:block text-[11px] text-muted-foreground leading-tight truncate">
                                        {item.description}
                                    </span>
                                </span>
                                {isConnected && (
                                    <span
                                        className="ms-auto h-2 w-2 rounded-full bg-green-500 shrink-0"
                                        title={item.id === "api-access" ? "Active" : "Connected"}
                                    />
                                )}
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <div className="flex-1 min-w-0">
                {renderCard()}
            </div>
        </div>
    );
}
