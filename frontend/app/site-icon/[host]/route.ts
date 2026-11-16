import { iconHosts } from "@/lib/site-icon";

/**
 * A site's own favicon for the app tiles on the Integrations pages: catalog
 * apps and any MCP server the account adds. Shown unaltered, only to identify
 * the product.
 *
 * GET /site-icon/mcp.notion.com tries that host, then the site's main domain
 * (notion.com). The icon is read from Google's favicon service, so this server
 * only ever calls gstatic.com and never the address a customer typed. A site
 * with no icon is a 404, and the tile shows the name's first letter.
 *
 * Each host is rendered on its first request and kept for a week.
 */
export const dynamic = "force-static";
export const revalidate = 604800;

const SIZE = 64;

type Params = { host: string };

export function generateStaticParams(): Params[] {
    return [];
}

async function lookup(host: string): Promise<ArrayBuffer | null> {
    const res = await fetch(
        `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${host}`)}&size=${SIZE}`,
        { signal: AbortSignal.timeout(5000) },
    );
    // Google answers a site it has no icon for with a 404 and a generic globe.
    // Any other failure throws, so the week-long cache never keeps an outage.
    if (res.status === 404) return null;
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) throw new Error(`favicon service answered ${res.status}`);
    return res.arrayBuffer();
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
    const { host } = await params;
    for (const h of iconHosts(decodeURIComponent(host))) {
        const icon = await lookup(h);
        if (icon) return new Response(icon, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
    }
    return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
}
