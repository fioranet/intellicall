import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                // Keep crawlers out of the authenticated app — only the public
                // marketing/legal pages should be indexed.
                disallow: [
                    "/dashboard",
                    "/admin",
                    "/settings",
                    "/leads",
                    "/agents",
                    "/campaigns",
                    "/call-logs",
                    "/appointments",
                    "/knowledge-base",
                    "/phone-numbers",
                    "/sip-trunks",
                    "/users",
                    "/support",
                    "/auth",
                    "/deactivated"
                ]
            }
        ],
        sitemap: `${SITE_URL}/sitemap.xml`
    };
}
