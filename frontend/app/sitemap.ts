import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();
    return [
        { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
        { url: `${SITE_URL}/about`, lastModified, changeFrequency: "monthly", priority: 0.7 },
        { url: `${SITE_URL}/contact`, lastModified, changeFrequency: "monthly", priority: 0.6 },
        { url: `${SITE_URL}/signup`, lastModified, changeFrequency: "monthly", priority: 0.8 },
        { url: `${SITE_URL}/login`, lastModified, changeFrequency: "monthly", priority: 0.5 },
        { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
        { url: `${SITE_URL}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 }
    ];
}
