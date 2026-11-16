/**
 * Favicons for the app tiles on the Integrations pages. IntelliCall ships no
 * brand-kit files, so an app's own site icon, unaltered, stands for it: shown
 * only to identify the product (nominative use). app/site-icon/[host]/route.ts
 * serves them, and a site with none falls back to the app's first letter.
 */

/** Second-level suffixes under which the registrable domain has three labels (example.co.uk). */
const TWO_PART_SUFFIXES = /\.(co|com|net|org|gov|ac|edu|ne|or)\.[a-z]{2}$/;

/**
 * The hosts to try for a URL's icon, best first: the host itself, then the
 * site's main domain (mcp.notion.com, then notion.com). Empty for anything
 * that is not a public hostname, so an IP, localhost or a template like
 * `{instance}` never reaches the lookup.
 */
export function iconHosts(input: string): string[] {
    let host: string;
    try {
        host = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).hostname.toLowerCase();
    } catch {
        return [];
    }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^[\d.]+$/.test(host) || /\.(local|internal|localhost|lan|home|test)$/.test(host)) return [];
    const labels = host.split(".");
    const keep = TWO_PART_SUFFIXES.test(host) ? 3 : 2;
    const main = labels.slice(-keep).join(".");
    return main === host ? [host] : [host, main];
}

/** The /site-icon address for a URL or host, or undefined when it has no public host. */
export function siteIconSrc(url: string | undefined): string | undefined {
    const host = url ? iconHosts(url)[0] : undefined;
    return host ? `/site-icon/${host}` : undefined;
}

/**
 * Catalog apps whose MCP address is a template or a shared host that is not
 * the brand's (`{instance}/api/mcp`, services.leadconnectorhq.com): the
 * brand's own site instead. Every other app uses its MCP address.
 */
export const APP_SITES: Record<string, string> = {
    gohighlevel: "gohighlevel.com",
    salesforce: "salesforce.com",
    zoho: "zoho.com",
    "google-calendar": "calendar.google.com",
    freshdesk: "freshdesk.com",
    n8n: "n8n.io",
    "home-assistant": "home-assistant.io",
    attendee: "attendee.dev",
};
