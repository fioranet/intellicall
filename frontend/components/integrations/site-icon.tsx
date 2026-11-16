"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { siteIconSrc } from "@/lib/site-icon";
import { cn } from "@/lib/utils";

/**
 * A site's own favicon, unaltered (lib/site-icon.ts). It sits on a small white
 * square so a dark icon still shows on the dark theme; the icon itself is
 * never recoloured or cropped. Until it loads, and when the site has none,
 * `fallback` holds the slot.
 */
export function SiteIcon({ url, name, size, fallback, className }: {
    /** A URL or host: the icon is the host's, else its main domain's. */
    url: string | undefined;
    name: string;
    size: number;
    fallback: ReactNode;
    className?: string;
}) {
    const src = siteIconSrc(url);
    // The address whose image failed, so a new address gets a fresh try.
    const [failedSrc, setFailedSrc] = useState<string | undefined>();
    const failed = Boolean(src) && failedSrc === src;
    const img = useRef<HTMLImageElement>(null);
    // A server-rendered image can fail before React attaches onError. Not
    // lazy-loaded: a deferred image also reads as complete with no width.
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const el = img.current;
            if (el?.complete && el.naturalWidth === 0) setFailedSrc(src);
        });
        return () => cancelAnimationFrame(frame);
    }, [src]);
    if (!src || failed) return <>{fallback}</>;
    const pad = Math.max(1, Math.round(size * 0.08));
    return (
        <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[22%] bg-white", className)} style={{ width: size, height: size, padding: pad }}>
            {/* A third party's favicon by host: not an asset next/image could optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={img} src={src} alt={name} title={name} width={size - 2 * pad} height={size - 2 * pad} decoding="async" onError={() => setFailedSrc(src)} className="h-full w-full object-contain" />
        </span>
    );
}
