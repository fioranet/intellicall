import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AuthProvider } from "@/components/auth/auth-provider";

// Both faces ship in app/fonts (variable woff2, latin subset, SIL OFL; the licences sit next
// to them). next/font/google fetched them from Google at build time, and on some servers
// Google answers with /l/font?kit=…&skey=… URLs that Next 16 cannot parse ("next/font/google
// queries have exactly one entry"), failing the build. Local files keep the build working
// offline and on any VPS.
//
// Manrope is Wixzel UI's one typeface; @wixzel/tokens reads it through --font-manrope.
const manrope = localFont({
  src: "./fonts/Manrope.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});

// Monospace face for keys, IDs and the landing page's numbered eyebrow labels; Wixzel's
// mono stack reads it through --font-mono-face.
const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono.woff2",
  variable: "--font-mono-face",
  weight: "100 800",
  display: "swap",
});

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Use a dedicated social-share banner when one is shipped in public/images. */
function findOgImage(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    for (const file of ["og.png", "og.jpg"]) {
      if (fs.existsSync(path.join(process.cwd(), "public", "images", file))) {
        return `/images/${file}`;
      }
    }
  } catch { }
  return null;
}

export async function generateMetadata(): Promise<Metadata> {
  let appName = "IntelliCallAI";
  let faviconUrl = "/favicon.ico";
  let logoUrl = "/images/logo_black.png";
  try {
    const res = await fetch(`${API_BASE_URL}/settings/public`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      appName = data?.data?.branding?.appName || appName;
      const dbFavicon = data?.data?.branding?.favicon;
      if (dbFavicon) {
        // /favicon.ico is blank on purpose (see logoToShow in settings-provider); saved, it means none was chosen.
        faviconUrl = dbFavicon === '/favicon.ico'
          ? '/images/originals/favicon.ico'
          : dbFavicon.startsWith('/uploads/')
            ? `${API_BASE_URL.replace(/\/api$/, '')}${dbFavicon}`
            : dbFavicon;
      }
      const dbLogo = data?.data?.branding?.logoLight;
      if (dbLogo) {
        logoUrl = dbLogo.startsWith('/uploads/')
          ? `${API_BASE_URL.replace(/\/api$/, '')}${dbLogo}`
          : dbLogo;
      }
    }
  } catch { }
  // Append cache-buster to force browser re-fetch on branding changes
  const cacheBuster = `v=${Date.now()}`;
  const finalFaviconUrl = `${faviconUrl}${faviconUrl.includes('?') ? '&' : '?'}${cacheBuster}`;

  const title = `${appName} — AI Voice Agents That Call, Qualify & Book Appointments 24/7`;
  const description = `${appName} is an AI voice calling platform: human-like agents answer and place calls around the clock, qualify leads in real time, book appointments, and send WhatsApp reminders — with campaigns, call recordings, transcripts, and CRM integrations.`;

  // Prefer a dedicated 1200×630 banner over the logo for social previews
  const ogImage = findOgImage();
  const socialImage = ogImage
    ? { url: ogImage, width: 1200, height: 630, alt: `${appName} — AI voice calling platform` }
    : { url: logoUrl, alt: `${appName} logo` };

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s | ${appName}`
    },
    description,
    keywords: [
      "AI voice agent", "AI calling platform", "AI call center software",
      "automated outbound calls", "AI appointment booking", "AI lead qualification",
      "AI phone agent", "voice AI for sales", "AI receptionist",
      "outbound call automation", "inbound call AI", "AI cold calling software"
    ],
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: appName,
      title,
      description,
      url: SITE_URL,
      images: [socialImage],
      locale: "en_US"
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage.url]
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1
      }
    },
    icons: {
      icon: [
        { url: finalFaviconUrl, sizes: 'any' },
      ],
    },
  };
}

import { ThemeProvider } from "@/components/theme-provider";
import { WixzelRoot } from "@/components/wixzel-root";
import { SettingsProvider } from "@/components/settings-provider";
import { CodeCanyonButton } from "@/components/codecanyon-button";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { dirFor } from "@/i18n/config";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved from the NEXT_LOCALE cookie in i18n/request.ts, so the first paint
  // already has the right language and direction — no post-hydration flip.
  const locale = await getLocale();
  const dir = dirFor(locale);

  return (
    // data-product washes the whole app in IntelliCall's violet before React loads; an
    // admin's own brand colour replaces it at runtime (lib/brand-colour.ts).
    <html lang={locale} dir={dir} data-product="intellicall" className={`${manrope.variable} ${jetbrainsMono.variable} scroll-smooth`} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="data-theme"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            <WixzelRoot dir={dir}>
              <AuthProvider>
                <SettingsProvider>
                  <DashboardLayout>{children}</DashboardLayout>
                  <CodeCanyonButton />
                </SettingsProvider>
              </AuthProvider>
            </WixzelRoot>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
