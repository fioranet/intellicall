import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/auth-provider";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["300", "400", "500", "600", "700"],
});

// Monospace face for the editorial numbered eyebrow labels on the landing page.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600"],
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
        faviconUrl = dbFavicon.startsWith('/uploads/')
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
import { SettingsProvider } from "@/components/settings-provider";
import { CodeCanyonButton } from "@/components/codecanyon-button";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { DirectionProvider } from "@/components/direction-provider";
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
    <html lang={locale} dir={dir} className={`${sora.variable} ${jetbrainsMono.variable} scroll-smooth`} suppressHydrationWarning>
      <body className={`${sora.className} antialiased`}>
        <NextIntlClientProvider>
          <DirectionProvider dir={dir}>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              disableTransitionOnChange
            >
              <AuthProvider>
                <SettingsProvider>
                  <DashboardLayout>{children}</DashboardLayout>
                  <Toaster dir={dir} />
                  <CodeCanyonButton />
                </SettingsProvider>
              </AuthProvider>
            </ThemeProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
