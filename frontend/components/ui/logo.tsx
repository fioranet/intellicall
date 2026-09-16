"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useSettings } from "@/components/settings-provider";

interface LogoProps {
    className?: string;
    width?: number;
    height?: number;
    variant?: "auto" | "black" | "white";
}

export function Logo({ className, width = 140, height = 40, variant = "auto" }: LogoProps) {
    const { branding, resolveBrandingUrl } = useSettings();
    const lightSrc = resolveBrandingUrl(branding.logoLight);
    const darkSrc = resolveBrandingUrl(branding.logoDark);

    // Fixed box: inline width/height beat the global `img { height: auto }` reset,
    // so the layout never shifts while the logo loads or when branding swaps in.
    // object-fit keeps any logo aspect ratio inside the box without distortion.
    const imgStyle: React.CSSProperties = {
        width,
        height,
        objectFit: "contain",
        objectPosition: "left center",
    };

    if (variant === "black") {
        return (
            <div className={cn("relative", className)}>
                <img
                    src={lightSrc}
                    alt={`${branding.appName} Logo`}
                    width={width}
                    height={height}
                    style={imgStyle}
                />
            </div>
        );
    }

    if (variant === "white") {
        return (
            <div className={cn("relative", className)}>
                <img
                    src={darkSrc}
                    alt={`${branding.appName} Logo`}
                    width={width}
                    height={height}
                    style={imgStyle}
                />
            </div>
        );
    }

    return (
        <div className={cn("relative", className)}>
            <img
                src={lightSrc}
                alt={`${branding.appName} Logo`}
                width={width}
                height={height}
                style={imgStyle}
                className="dark:hidden block"
            />
            <img
                src={darkSrc}
                alt={`${branding.appName} Logo`}
                width={width}
                height={height}
                style={imgStyle}
                className="hidden dark:block"
            />
        </div>
    );
}
