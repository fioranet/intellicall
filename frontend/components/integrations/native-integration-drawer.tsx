"use client";

import { type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Key } from "@phosphor-icons/react";
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@wixzel/react";
import { N8nIntegration } from "@/components/settings/n8n-integration";
import { ApiAccessCard } from "@/components/settings/api-access";
import { WhatsAppIntegration } from "@/components/settings/whatsapp-integration";
import { SlackIntegration } from "@/components/settings/slack-integration";
import { HubSpotIntegration } from "@/components/settings/hubspot-integration";
import { GoogleCalendarIntegration } from "@/components/settings/google-calendar-integration";
import { GoogleSheetsIntegration } from "@/components/settings/google-sheets-integration";

/**
 * The account's own integrations: the alerts, exports and syncs that used to
 * live under Settings. Each is still its own component; this file only lists
 * them and opens one in a drawer from the Integrations page.
 */
export interface NativeIntegration {
    id: NativeIntegrationId;
    logo?: string;
    /** The key in GET /settings/config-status that marks it connected. API Access reads GET /users/api-key instead. */
    statusKey?: string;
}

export type NativeIntegrationId = "n8n" | "api-access" | "whatsapp" | "slack" | "hubspot" | "google-calendar" | "google-sheets";

export const NATIVE_INTEGRATIONS: NativeIntegration[] = [
    { id: "n8n", logo: "/images/integrations/n8n.png", statusKey: "isN8nConnected" },
    { id: "api-access" },
    { id: "whatsapp", logo: "/images/integrations/whatsapp.png", statusKey: "isWhatsAppConnected" },
    { id: "slack", logo: "/images/integrations/slack.png", statusKey: "isSlackConnected" },
    { id: "hubspot", logo: "/images/integrations/hubspot.png", statusKey: "isHubSpotConnected" },
    { id: "google-calendar", logo: "/images/integrations/calendar.png", statusKey: "isGoogleCalendarConnected" },
    { id: "google-sheets", logo: "/images/integrations/sheets.png", statusKey: "isGoogleSheetsConnected" },
];

/** OAuth callbacks land on /integrations?<param>=connected|error: the card to open for each. */
export const PARAM_TO_ID: Record<string, NativeIntegrationId> = {
    slack: "slack",
    hubspot: "hubspot",
    google_calendar: "google-calendar",
    google_sheets: "google-sheets",
    whatsapp: "whatsapp",
    n8n: "n8n",
};

export function isNativeIntegrationId(id: string | null): id is NativeIntegrationId {
    return NATIVE_INTEGRATIONS.some((x) => x.id === id);
}

/** The integration's logo on a light tile, or a key for API Access. */
export function NativeIntegrationLogo({ item, size = 40 }: { item: NativeIntegration; size?: number }) {
    const t = useTranslations("integrations");
    const inner = Math.round(size * 0.5);
    return (
        <span className="grid shrink-0 place-items-center rounded-md bg-surface text-accent-ink" style={{ width: size, height: size }}>
            {item.logo ? (
                <Image src={item.logo} alt={t(`native.items.${item.id}.name`)} width={inner} height={inner} className="object-contain" style={{ width: inner, height: inner }} />
            ) : (
                <Key style={{ width: inner, height: inner }} aria-hidden />
            )}
        </span>
    );
}

function NativeCard({ id }: { id: NativeIntegrationId }) {
    switch (id) {
        case "n8n": return <N8nIntegration />;
        case "api-access": return <ApiAccessCard />;
        case "whatsapp": return <WhatsAppIntegration />;
        case "slack": return <SlackIntegration />;
        case "hubspot": return <HubSpotIntegration />;
        case "google-calendar": return <GoogleCalendarIntegration />;
        case "google-sheets": return <GoogleSheetsIntegration />;
    }
}

/** One native integration's own card, in a drawer. The card is the component from Settings, unchanged. */
export function NativeIntegrationDrawer({ id, onOpenChange }: { id: NativeIntegrationId | null; onOpenChange: (open: boolean) => void }) {
    const t = useTranslations("integrations");
    const item = NATIVE_INTEGRATIONS.find((x) => x.id === id);
    return (
        <Drawer open={Boolean(id)} onOpenChange={onOpenChange}>
            <DrawerContent side="right" style={{ "--wx-drawer-size": "760px" } as CSSProperties}>
                {item && (
                    <>
                        <DrawerHeader>
                            <DrawerTitle className="flex items-center gap-2">
                                <NativeIntegrationLogo item={item} size={28} />
                                {t(`native.items.${item.id}.name`)}
                            </DrawerTitle>
                            <DrawerDescription>{t(`native.items.${item.id}.description`)}</DrawerDescription>
                        </DrawerHeader>
                        <DrawerBody className="flex flex-col gap-4">
                            <NativeCard id={item.id} />
                        </DrawerBody>
                    </>
                )}
            </DrawerContent>
        </Drawer>
    );
}
