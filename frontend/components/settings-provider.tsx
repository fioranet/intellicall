"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { setLocaleCookie, applyDocumentDir } from "@/lib/locale-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface BrandingConfig {
    appName: string;
    primaryColor: string;
    logoLight: string;
    logoDark: string;
    favicon: string;
}

export interface PublicSiteConfig {
    supportEmail: string;
    privacyEmail: string;
    legalEmail: string;
    contactEmail: string;
    hqAddress: string;
    socialLinks: {
        instagram: string;
        linkedin: string;
        youtube: string;
    };
}

const DEFAULT_BRANDING: BrandingConfig = {
    appName: 'IntelliCallAI',
    primaryColor: '#8078F0',
    logoLight: '/images/logo_black.png',
    logoDark: '/images/logo_white.png',
    favicon: '/favicon.ico'
};

const DEFAULT_PUBLIC_SITE: PublicSiteConfig = {
    supportEmail: 'support@intellicall.ai',
    privacyEmail: 'privacy@intellicall.ai',
    legalEmail: 'legal@intellicall.ai',
    contactEmail: '',
    hqAddress: '',
    socialLinks: { instagram: '', linkedin: '', youtube: '' },
};

const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

/** Email shown on /contact: dedicated contact email, or support email if contact is empty */
export function getContactDisplayEmail(publicSite: PublicSiteConfig): string {
    const c = publicSite.contactEmail?.trim();
    if (c) return c;
    return publicSite.supportEmail?.trim() || DEFAULT_PUBLIC_SITE.supportEmail;
}

/** Normalize user-entered URL for href (add https if missing) */
export function toExternalHref(url: string): string {
    const t = url.trim();
    if (!t) return "#";
    if (/^https?:\/\//i.test(t)) return t;
    return `https://${t}`;
}

// Resolve branding URLs: uploaded files are served from the backend, defaults from frontend
function resolveBrandingUrl(path: string): string {
    if (path.startsWith("/uploads/")) {
        return `${BACKEND_BASE_URL}${path}`;
    }
    return path;
}

interface SettingsContextType {
    timeFormat: "12" | "24";
    uiLanguage: string;
    googleSheetsConnected: boolean;
    googleSheetsConfig: any;
    branding: BrandingConfig;
    publicSite: PublicSiteConfig;
    showCodeCanyonButton: boolean;
    showSelfHostingSection: boolean;
    resolveBrandingUrl: (path: string) => string;
    refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
    timeFormat: "12",
    uiLanguage: "en",
    googleSheetsConnected: false,
    googleSheetsConfig: null,
    branding: DEFAULT_BRANDING,
    publicSite: DEFAULT_PUBLIC_SITE,
    showCodeCanyonButton: false,
    showSelfHostingSection: false,
    resolveBrandingUrl: (path: string) => path,
    refreshSettings: async () => { },
});

export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const currentLocale = useLocale();
    const router = useRouter();
    const [timeFormat, setTimeFormat] = useState<"12" | "24">("12");
    const [uiLanguage, setUiLanguage] = useState<string>(currentLocale);
    const [googleSheetsConnected, setGoogleSheetsConnected] = useState(false);
    const [googleSheetsConfig, setGoogleSheetsConfig] = useState<any>(null);
    const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
    const [publicSite, setPublicSite] = useState<PublicSiteConfig>(DEFAULT_PUBLIC_SITE);
    const [showCodeCanyonButton, setShowCodeCanyonButton] = useState(false);
    const [showSelfHostingSection, setShowSelfHostingSection] = useState(false);

    // Fetch public settings (branding, public emails, social) — no auth required
    useEffect(() => {
        const fetchPublicSettings = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/settings/public`);
                if (response.data?.status === "success" && response.data.data) {
                    const d = response.data.data;
                    if (d.branding) {
                        const b = d.branding;
                        const newBranding: BrandingConfig = {
                            appName: b.appName || DEFAULT_BRANDING.appName,
                            primaryColor: b.primaryColor || DEFAULT_BRANDING.primaryColor,
                            logoLight: b.logoLight || DEFAULT_BRANDING.logoLight,
                            logoDark: b.logoDark || DEFAULT_BRANDING.logoDark,
                            favicon: b.favicon || DEFAULT_BRANDING.favicon,
                        };
                        setBranding(newBranding);
                        document.documentElement.style.setProperty('--brand-primary', newBranding.primaryColor);
                    }
                    setShowCodeCanyonButton(Boolean(d.showCodeCanyonButton));
                    setShowSelfHostingSection(Boolean(d.showSelfHostingSection));
                    setPublicSite({
                        supportEmail: d.supportEmail || DEFAULT_PUBLIC_SITE.supportEmail,
                        privacyEmail: d.privacyEmail || DEFAULT_PUBLIC_SITE.privacyEmail,
                        legalEmail: d.legalEmail || DEFAULT_PUBLIC_SITE.legalEmail,
                        contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : "",
                        hqAddress: typeof d.hqAddress === "string" ? d.hqAddress : "",
                        socialLinks: {
                            instagram: d.socialLinks?.instagram || "",
                            linkedin: d.socialLinks?.linkedin || "",
                            youtube: d.socialLinks?.youtube || "",
                        },
                    });
                }
            } catch (err) {
                console.error("Failed to load public settings", err);
            }
        };
        fetchPublicSettings();
    }, []);

    const fetchSettings = React.useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            const response = await axios.get(`${API_BASE_URL}/settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                const settings = response.data.data.settings;
                setTimeFormat(settings.timeFormat || "12");
                setGoogleSheetsConnected(settings.googleSheetsConnected || false);
                setGoogleSheetsConfig(settings.googleSheetsConfig || null);

                // The saved preference wins over the cookie: it is the user's
                // deliberate choice and follows them across devices, whereas the
                // cookie is device-local and a browser can drop it at any time.
                const saved = settings.uiLanguage;
                if (isLocale(saved)) {
                    setUiLanguage(saved);
                    if (saved !== currentLocale) {
                        setLocaleCookie(saved);
                        applyDocumentDir(saved);
                        router.refresh();
                    }
                }
            }
        } catch (err) {
            console.error("Failed to load settings in provider", err);
        }
    }, [currentLocale, router]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    return (
        <SettingsContext.Provider value={{
            timeFormat,
            uiLanguage,
            googleSheetsConnected,
            googleSheetsConfig,
            branding,
            publicSite,
            showCodeCanyonButton,
            showSelfHostingSection,
            resolveBrandingUrl,
            refreshSettings: fetchSettings
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function formatTime(dateInput: string | Date | undefined, format: "12" | "24") {
    if (!dateInput) return "";
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: format === "12"
    });
}
