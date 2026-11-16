"use client";

import { SiteIcon } from "@/components/integrations/site-icon";
import { appIconUrl } from "@/lib/app-catalog";
import { cn } from "@/lib/utils";

/**
 * An app's tile on the Integrations pages: the favicon of the server's address
 * (a catalog app's MCP server, or whatever URL a customer added), shown only
 * to identify it, and the first letter of its name when there is none.
 */
export function AppIcon({ appId, url, name, size = 32, className }: {
    /** The catalog app's id, when the tile stands for one. */
    appId?: string;
    /** The server's address, for a server that is not a catalog app. */
    url?: string;
    name: string;
    size?: number;
    className?: string;
}) {
    const letter = name.trim().charAt(0).toUpperCase() || "?";
    return (
        <span
            aria-hidden
            style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
            className={cn(
                // A light tile, as EmptyState and Tile draw their icons: a tonal face, no border.
                "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface font-semibold text-fg-muted",
                className,
            )}
        >
            <SiteIcon url={(appId && appIconUrl(appId)) || url} name={name} size={Math.round(size * 0.72)} fallback={letter} />
        </span>
    );
}
