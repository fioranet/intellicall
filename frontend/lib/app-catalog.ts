/**
 * The app directory on /integrations: apps whose makers host an official
 * remote MCP server, set up so the owner does not have to find the URL, the
 * sign-in style or the tools that matter on a call.
 *
 * Nothing here is special on the server. Connecting an app creates an
 * ordinary MCP server through POST /mcp-servers with the URL, auth and
 * enabledTools below, so an app works exactly as if its URL had been pasted
 * into "Add custom MCP server". A connected server is matched back to its app
 * by URL (`match`), which is how it gets its icon.
 *
 * Checked against each vendor's docs and live OAuth metadata on 2026-10-07.
 * `oauth` means the server allows dynamic client registration, so connecting
 * is one click. `oauth-own-client` means it does not, and the owner registers
 * an app with the vendor and pastes its client id.
 *
 * `tools` are highlights for the directory page, not the full list: the real
 * list is read from the server once it is connected. `recommendedTools` are
 * switched on at creation and only given where the tool names are confirmed;
 * a name the server turns out not to have is dropped on the first read. Apps
 * without it get the default, which is the tools the server marks read-only.
 *
 * Left out on purpose:
 *  - Zendesk, Acuity: no official remote MCP server.
 *  - Square: only MCP clients on Square's allowlist may connect.
 *  - Shopify: the storefront servers need an agent profile on every request.
 *  - Mailchimp: the hosted server is built for Claude and ChatGPT only.
 *  - Microsoft Teams, Outlook: every user needs a Microsoft 365 Copilot licence.
 *  - Atlassian: each customer's admin must allowlist the redirect domain.
 *  - Vercel: reviewed clients only.
 *  - Twilio: the hosted server only searches Twilio's docs.
 *  - WhatsApp Business: a setup and admin tool.
 *
 * The words (taglines, blurbs, notes, setup steps, field labels, tool
 * summaries) are not in this file: they are messages in
 * messages/<locale>/integrations.json under `apps.<id>`, keyed by where the
 * text goes (`apps.hubspot.tagline`, `apps.hubspot.steps.1`,
 * `apps.freshdesk.fields.subdomain.hint`, `apps.exa.tools.web_search_exa`), so
 * they can be translated. An app below holds everything that is not words;
 * localizeApp() puts the words back in a language, given the `integrations`
 * translator from useTranslations. APP_CATALOG is the catalog in English, for
 * code that does not translate it (matching a URL to an app, say).
 */
import en from "@/messages/en/integrations.json";
import { APP_SITES } from "@/lib/site-icon";

export const CATEGORIES = ["CRM", "Booking", "Support", "Payments", "Marketing", "Team", "Automation", "Smart home", "Search"] as const;
export type Category = (typeof CATEGORIES)[number];

/** A next-intl translator for the `integrations` namespace, as the pages hold it. */
export type CatalogT = (key: string, values?: Record<string, string | number>) => string;

export interface InputField {
    key: string;
    label: string;
    placeholder?: string;
    hint?: string;
    secret?: boolean;
}

export type AppAuth =
    | { kind: "none" }
    | { kind: "oauth"; scope?: string }
    | { kind: "oauth-own-client"; scope?: string; consoleUrl: string; steps: string[] }
    | {
        kind: "headers";
        fields: InputField[];
        headers: (v: Record<string, string>) => { name: string; value: string }[];
        help: string;
    };

export interface AppTool {
    name: string;
    summary: string;
    /** True when the tool changes something in the app. */
    writes?: boolean;
}

export interface CatalogApp {
    id: string;
    name: string;
    category: Category;
    blurb: string;
    status?: "beta" | "preview";
    /** May hold {placeholders}, filled from urlFields. */
    url: string;
    urlFields?: InputField[];
    /** A choice of server, such as a data region. The first is the default. */
    regions?: { key: string; label: string; url: string }[];
    /** Tested against host + path of a connected server's URL. */
    match: RegExp;
    auth: AppAuth;
    tools: AppTool[];
    toolCount?: number;
    recommendedTools?: string[];
    docsUrl: string;
    note?: string;
    /** What the app is, in a few words, for the directory's one-line cards. */
    tagline: string;
}

/** An app as written below: a CatalogApp without its words. */
type RawField = Omit<InputField, "label" | "hint">;
type RawAuth =
    | { kind: "none" }
    | { kind: "oauth"; scope?: string }
    | { kind: "oauth-own-client"; scope?: string; consoleUrl: string }
    | { kind: "headers"; fields: RawField[]; headers: (v: Record<string, string>) => { name: string; value: string }[] };
export interface RawApp extends Omit<CatalogApp, "blurb" | "tagline" | "note" | "urlFields" | "regions" | "auth" | "tools"> {
    urlFields?: RawField[];
    regions?: { key: string; url: string }[];
    auth: RawAuth;
    tools: Omit<AppTool, "summary">[];
}

/** Every dotted key path in the English catalog, so optional words (a note, a hint) can be looked up before asking for them. */
const EN_KEYS = new Set<string>();
(function flatten(tree: Record<string, unknown>, prefix: string) {
    for (const [k, v] of Object.entries(tree)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") flatten(v as Record<string, unknown>, path);
        else EN_KEYS.add(path);
    }
})(en as Record<string, unknown>, "");
const has = (key: string) => EN_KEYS.has(key);

/** The English text at a dotted key, for the untranslated catalog. */
function englishAt(key: string): string {
    let node: unknown = en;
    for (const part of key.split(".")) {
        if (!node || typeof node !== "object") return key;
        node = (node as Record<string, unknown>)[part];
    }
    return typeof node === "string" ? node : key;
}

/**
 * [app] with its words in [t]'s language. Takes a CatalogApp as well, since
 * every key comes from the app's id and the shape around the text.
 */
export function localizeApp(app: RawApp, t: CatalogT): CatalogApp {
    const p = `apps.${app.id}.`;
    const field = (f: RawField): InputField => ({
        ...f,
        label: t(`${p}fields.${f.key}.label`),
        ...(has(`${p}fields.${f.key}.hint`) ? { hint: t(`${p}fields.${f.key}.hint`) } : {}),
    });
    const a = app.auth;
    let auth: AppAuth;
    if (a.kind === "headers") auth = { ...a, fields: a.fields.map(field), help: t(`${p}help`) };
    else if (a.kind === "oauth-own-client") {
        const steps: string[] = [];
        for (let n = 1; has(`${p}steps.${n}`); n++) steps.push(t(`${p}steps.${n}`));
        auth = { ...a, steps };
    } else auth = a;
    const { urlFields, regions, ...rest } = app;
    return {
        ...rest,
        tagline: t(`${p}tagline`),
        blurb: t(`${p}blurb`),
        ...(has(`${p}note`) ? { note: t(`${p}note`) } : {}),
        ...(urlFields ? { urlFields: urlFields.map(field) } : {}),
        ...(regions ? { regions: regions.map((r) => ({ key: r.key, url: r.url, label: t(`${p}regions.${r.key}`) })) } : {}),
        auth,
        tools: app.tools.map((x) => ({ ...x, summary: t(`${p}tools.${x.name}`) })),
    };
}

const CATEGORY_KEY: Record<Category, string> = {
    CRM: "catalog.category.crm", Booking: "catalog.category.booking", Support: "catalog.category.support", Payments: "catalog.category.payments",
    Marketing: "catalog.category.marketing", Team: "catalog.category.team", Automation: "catalog.category.automation", "Smart home": "catalog.category.smartHome", Search: "catalog.category.search",
};

/** A category's name in [t]'s language. */
export function categoryLabel(c: Category, t: CatalogT): string {
    return t(CATEGORY_KEY[c]);
}

/** A directory status badge, "Beta" or "Preview". */
export function statusLabel(s: NonNullable<CatalogApp["status"]>, t: CatalogT): string {
    return t(s === "beta" ? "catalog.status.beta" : "catalog.status.preview");
}

const bearer = (token: string) => ({ name: "Authorization", value: `Bearer ${token.trim()}` });

function base64(s: string): string {
    return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

const APPS: RawApp[] = [
    // CRM
    {
        id: "hubspot",
        name: "HubSpot",
        category: "CRM",
        url: "https://mcp.hubspot.com",
        match: /^mcp\.hubspot\.com/,
        auth: {
            kind: "oauth-own-client",
            consoleUrl: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server",
        },
        tools: [
            { name: "search_crm_objects" },
            { name: "get_crm_objects" },
            { name: "manage_crm_objects", writes: true },
            { name: "search_owners" },
            { name: "search_properties" },
            { name: "query_crm_data" },
            { name: "search_conversations" },
            { name: "get_user_details" },
        ],
        toolCount: 50,
        recommendedTools: ["search_crm_objects", "get_crm_objects", "manage_crm_objects", "search_owners", "search_properties", "get_user_details"],
        docsUrl: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server",
    },
    {
        id: "salesforce",
        name: "Salesforce",
        category: "CRM",
        url: "https://api.salesforce.com/platform/mcp/v1/platform/sobject-all",
        match: /^api\.salesforce\.com\/platform\/mcp\//,
        auth: {
            kind: "oauth-own-client",
            scope: "mcp_api refresh_token",
            consoleUrl: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide",
        },
        tools: [
            { name: "find" },
            { name: "soqlQuery" },
            { name: "getObjectSchema" },
            { name: "createSobjectRecord", writes: true },
            { name: "updateSobjectRecord", writes: true },
        ],
        docsUrl: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide",
    },
    {
        id: "gohighlevel",
        name: "GoHighLevel",
        category: "CRM",
        url: "https://services.leadconnectorhq.com/mcp/",
        match: /^(services\.leadconnectorhq\.com|mcp\.gohighlevel\.com)\/mcp/,
        auth: {
            kind: "headers",
            fields: [
                { key: "token", placeholder: "pit-…", secret: true },
                { key: "locationId", placeholder: "ve9EPM428h8vShlRW1KT" },
            ],
            headers: (v) => [bearer(v.token), { name: "locationId", value: v.locationId.trim() }],
        },
        tools: [
            { name: "contacts_get-contacts" },
            { name: "contacts_get-contact" },
            { name: "contacts_upsert-contact", writes: true },
            { name: "contacts_add-tags", writes: true },
            { name: "calendars_get-calendar-events" },
            { name: "opportunities_search-opportunity" },
            { name: "opportunities_update-opportunity", writes: true },
            { name: "conversations_send-a-new-message", writes: true },
        ],
        toolCount: 36,
        recommendedTools: [
            "contacts_get-contacts", "contacts_get-contact", "contacts_upsert-contact", "contacts_add-tags",
            "calendars_get-calendar-events", "opportunities_search-opportunity", "opportunities_get-pipelines",
        ],
        docsUrl: "https://marketplace.gohighlevel.com/docs/other/mcp",
    },
    {
        id: "pipedrive",
        name: "Pipedrive",
        category: "CRM",
        url: "https://mcp.pipedrive.ai/mcp",
        match: /^mcp\.pipedrive\.ai/,
        auth: { kind: "oauth" },
        tools: [
            { name: "searchPersons" },
            { name: "getPerson" },
            { name: "addPerson", writes: true },
            { name: "addLead", writes: true },
            { name: "addDeal", writes: true },
            { name: "addActivity", writes: true },
            { name: "addNote", writes: true },
            { name: "searchDeals" },
        ],
        toolCount: 34,
        recommendedTools: ["searchPersons", "getPerson", "addPerson", "addLead", "addActivity", "addNote", "searchDeals"],
        docsUrl: "https://support.pipedrive.com/en/article/mcp-tools",
    },
    {
        id: "close",
        name: "Close",
        category: "CRM",
        url: "https://mcp.close.com/mcp",
        match: /^mcp\.close\.com/,
        auth: { kind: "oauth", scope: "mcp.read mcp.write_safe offline_access" },
        tools: [
            { name: "lead_search" },
            { name: "fetch_lead" },
            { name: "fetch_contact" },
            { name: "create_lead", writes: true },
            { name: "create_note", writes: true },
            { name: "create_task", writes: true },
            { name: "create_opportunity", writes: true },
        ],
        toolCount: 121,
        recommendedTools: ["lead_search", "search", "fetch_lead", "fetch_contact", "create_lead", "create_contact", "create_note", "create_task"],
        docsUrl: "https://developer.close.com/mcp/tools.md",
    },
    {
        id: "attio",
        name: "Attio",
        category: "CRM",
        url: "https://mcp.attio.com/mcp",
        match: /^mcp\.attio\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "Records", writes: true },
            { name: "Notes", writes: true },
            { name: "Tasks", writes: true },
            { name: "Lists", writes: true },
        ],
        toolCount: 41,
        docsUrl: "https://attio.com/apps/mcp",
    },
    {
        id: "monday",
        name: "monday.com",
        category: "CRM",
        url: "https://mcp.monday.com/mcp",
        match: /^mcp\.monday\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "get_board_items_by_name" },
            { name: "get_board_schema" },
            { name: "create_item", writes: true },
            { name: "change_item_column_values", writes: true },
            { name: "create_update", writes: true },
        ],
        toolCount: 60,
        docsUrl: "https://developer.monday.com/api-reference/docs/mondaycom-mcp",
    },
    {
        id: "apollo",
        name: "Apollo",
        category: "CRM",
        url: "https://mcp.apollo.io/mcp",
        match: /^mcp\.apollo\.io/,
        auth: { kind: "oauth" },
        tools: [
            { name: "apollo_contacts_search" },
            { name: "apollo_people_match" },
            { name: "apollo_contacts_create", writes: true },
            { name: "apollo_contacts_update", writes: true },
            { name: "apollo_phone_calls_create", writes: true },
            { name: "apollo_tasks_create", writes: true },
            { name: "apollo_deals_create", writes: true },
        ],
        toolCount: 98,
        recommendedTools: ["apollo_contacts_search", "apollo_contacts_create", "apollo_contacts_update", "apollo_phone_calls_create", "apollo_tasks_create"],
        docsUrl: "https://docs.apollo.io/docs/apollo-mcp",
    },
    {
        id: "zoho",
        name: "Zoho CRM",
        category: "CRM",
        url: "{url}",
        urlFields: [{
            key: "url",
            placeholder: "https://zoho-crm-…zohomcp.com/mcp/…/message",
            secret: true,
        }],
        match: /\.zohomcp\.[a-z.]+\/mcp\//,
        auth: { kind: "none" },
        tools: [
            { name: "Data Operations", writes: true },
            { name: "Data Insights" },
        ],
        docsUrl: "https://www.zoho.com/crm/developer/docs/mcp/overview.html",
    },

    // Booking
    {
        id: "calcom",
        name: "Cal.com",
        category: "Booking",
        url: "https://mcp.cal.com/mcp",
        match: /^mcp\.cal\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "get_event_types" },
            { name: "get_availability" },
            { name: "create_booking", writes: true },
            { name: "reschedule_booking", writes: true },
            { name: "cancel_booking", writes: true },
            { name: "get_bookings" },
        ],
        toolCount: 34,
        recommendedTools: [
            "get_event_types", "get_availability", "get_busy_times", "get_bookings", "get_booking",
            "create_booking", "reschedule_booking", "cancel_booking", "get_me",
        ],
        docsUrl: "https://github.com/calcom/help/blob/main/cal-ai/mcp-server.mdx",
    },
    {
        id: "calendly",
        name: "Calendly",
        category: "Booking",
        url: "https://mcp.calendly.com",
        match: /^mcp\.calendly\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "event_types-list_event_types" },
            { name: "event_types-list_event_type_available_times" },
            { name: "meetings-create_invitee", writes: true },
            { name: "meetings-list_events" },
            { name: "meetings-cancel_event", writes: true },
            { name: "scheduling_links-create_single_use_scheduling_link", writes: true },
        ],
        toolCount: 36,
        recommendedTools: [
            "event_types-list_event_types", "event_types-list_event_type_available_times", "meetings-create_invitee",
            "meetings-list_events", "meetings-get_event", "meetings-cancel_event",
            "scheduling_links-create_single_use_scheduling_link", "users-get_current_user",
        ],
        docsUrl: "https://developer.calendly.com/docs/mcp/supported-tools",
    },
    {
        id: "google-calendar",
        name: "Google Calendar",
        category: "Booking",
        status: "preview",
        url: "https://calendarmcp.googleapis.com/mcp/v1",
        match: /^calendarmcp\.googleapis\.com/,
        auth: {
            kind: "oauth-own-client",
            scope: "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy",
            consoleUrl: "https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server",
        },
        tools: [
            { name: "list_calendars" },
            { name: "list_events" },
            { name: "suggest_time" },
            { name: "create_event", writes: true },
            { name: "update_event", writes: true },
            { name: "delete_event", writes: true },
        ],
        toolCount: 9,
        docsUrl: "https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server",
    },

    // Support
    {
        id: "intercom",
        name: "Intercom",
        category: "Support",
        url: "https://mcp.intercom.com/mcp",
        regions: [
            { key: "us", url: "https://mcp.intercom.com/mcp" },
            { key: "eu", url: "https://mcp.eu.intercom.com/mcp" },
        ],
        match: /^mcp\.(eu\.)?intercom\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "search_contacts" },
            { name: "get_contact" },
            { name: "search_conversations" },
            { name: "get_conversation" },
            { name: "search_articles" },
            { name: "add_internal_note", writes: true },
        ],
        toolCount: 14,
        recommendedTools: ["search_contacts", "get_contact", "search_conversations", "get_conversation", "search_articles", "get_article", "add_internal_note"],
        docsUrl: "https://developers.intercom.com/docs/guides/mcp",
    },
    {
        id: "freshdesk",
        name: "Freshdesk",
        category: "Support",
        url: "https://{subdomain}.freshdesk.com/mcp",
        urlFields: [{ key: "subdomain", placeholder: "acme" }],
        match: /\.freshdesk\.com\/mcp/,
        auth: {
            kind: "headers",
            fields: [{ key: "key", secret: true }],
            headers: (v) => [{ name: "Authorization", value: v.key.trim() }],
        },
        tools: [
            { name: "fetchContactAutocomplete" },
            { name: "fetchContact" },
            { name: "fetchSearchTickets" },
            { name: "fetchTicket" },
            { name: "createTicket", writes: true },
            { name: "updateTicket", writes: true },
            { name: "createTicketNote", writes: true },
        ],
        toolCount: 41,
        recommendedTools: [
            "fetchContactAutocomplete", "fetchContact", "fetchSearchTickets", "fetchTicket",
            "fetchTicketConversations", "createTicket", "createTicketNote", "fetchSolutionArticle",
        ],
        docsUrl: "https://support.freshdesk.com/support/solutions/articles/50000012670",
    },
    {
        id: "helpscout",
        name: "Help Scout",
        category: "Support",
        url: "https://mcp.helpscout.net/mcp",
        match: /^mcp\.helpscout\.net/,
        auth: { kind: "oauth" },
        tools: [
            { name: "Conversations" },
            { name: "Customers" },
            { name: "Docs" },
        ],
        toolCount: 20,
        docsUrl: "https://docs.helpscout.com/article/1779-connect-your-ai-agent-with-help-scout-to-search-conversations-and-pull-reports",
    },
    {
        id: "gorgias",
        name: "Gorgias",
        category: "Support",
        url: "https://mcp.gorgias.com/mcp",
        match: /^mcp\.gorgias\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "Tickets", writes: true },
            { name: "Customers" },
            { name: "Help center" },
        ],
        docsUrl: "https://docs.gorgias.com/en-US/connect-your-ai-assistant-to-gorgias-6310546",
    },

    // Payments
    {
        id: "stripe",
        name: "Stripe",
        category: "Payments",
        url: "https://mcp.stripe.com",
        match: /^mcp\.stripe\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "stripe_api_search" },
            { name: "stripe_api_read" },
            { name: "stripe_api_write", writes: true },
            { name: "get_stripe_account_info" },
            { name: "search_stripe_documentation" },
        ],
        toolCount: 10,
        recommendedTools: ["stripe_api_search", "stripe_api_details", "stripe_api_read", "get_stripe_account_info"],
        docsUrl: "https://docs.stripe.com/mcp",
    },
    {
        id: "paypal",
        name: "PayPal",
        category: "Payments",
        url: "https://mcp.paypal.com/http",
        regions: [
            { key: "live", url: "https://mcp.paypal.com/http" },
            { key: "sandbox", url: "https://mcp.sandbox.paypal.com/http" },
        ],
        match: /^mcp\.(sandbox\.)?paypal\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "create_invoice", writes: true },
            { name: "list_invoices" },
            { name: "create_order", writes: true },
            { name: "list_transactions" },
            { name: "list_disputes" },
        ],
        docsUrl: "https://developer.paypal.com/tools/mcp-server/",
    },
    {
        id: "razorpay",
        name: "Razorpay",
        category: "Payments",
        url: "https://mcp.razorpay.com/mcp",
        match: /^mcp\.razorpay\.com/,
        auth: {
            kind: "headers",
            fields: [
                { key: "keyId", placeholder: "rzp_live_…" },
                { key: "keySecret", secret: true },
            ],
            headers: (v) => [{ name: "Authorization", value: `Basic ${base64(`${v.keyId.trim()}:${v.keySecret.trim()}`)}` }],
        },
        tools: [
            { name: "create_payment_link", writes: true },
            { name: "create_payment_link_upi", writes: true },
            { name: "send_payment_link", writes: true },
            { name: "fetch_payment" },
            { name: "fetch_order" },
            { name: "fetch_refund" },
        ],
        toolCount: 45,
        docsUrl: "https://razorpay.com/docs/mcp-server/remote/",
    },
    {
        id: "dodopayments",
        name: "Dodo Payments",
        category: "Payments",
        url: "https://mcp.dodopayments.com/mcp",
        match: /^mcp\.dodopayments\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "search_docs" },
            { name: "execute", writes: true },
        ],
        toolCount: 2,
        docsUrl: "https://docs.dodopayments.com/developer-resources/mcp-server",
    },

    // Marketing
    {
        id: "klaviyo",
        name: "Klaviyo",
        category: "Marketing",
        url: "https://mcp.klaviyo.com/mcp",
        match: /^mcp\.klaviyo\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "get_profiles" },
            { name: "create_or_update_profile", writes: true },
            { name: "subscribe_profile_to_marketing", writes: true },
            { name: "add_profiles_to_list", writes: true },
            { name: "get_coupon_codes" },
        ],
        toolCount: 260,
        docsUrl: "https://developers.klaviyo.com/en/docs/connect_to_the_klaviyo_mcp_server",
    },

    // Team
    {
        id: "slack",
        name: "Slack",
        category: "Team",
        url: "https://mcp.slack.com/mcp",
        match: /^mcp\.slack\.com/,
        auth: {
            kind: "oauth-own-client",
            consoleUrl: "https://docs.slack.dev/ai/mcp-server/",
        },
        tools: [
            { name: "slack_send_message", writes: true },
            { name: "slack_search_public" },
            { name: "slack_search_users" },
            { name: "slack_search_channels" },
            { name: "slack_read_channel" },
        ],
        toolCount: 19,
        docsUrl: "https://docs.slack.dev/ai/mcp-server/",
    },
    {
        id: "notion",
        name: "Notion",
        category: "Team",
        url: "https://mcp.notion.com/mcp",
        match: /^mcp\.notion\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "notion-search" },
            { name: "notion-fetch" },
            { name: "notion-query-data-sources" },
            { name: "notion-create-pages", writes: true },
            { name: "notion-update-page", writes: true },
        ],
        toolCount: 42,
        recommendedTools: ["notion-search", "notion-fetch", "notion-query-data-sources"],
        docsUrl: "https://developers.notion.com/docs/mcp-supported-tools",
    },
    {
        id: "linear",
        name: "Linear",
        category: "Team",
        url: "https://mcp.linear.app/mcp",
        match: /^mcp\.linear\.app/,
        auth: { kind: "oauth" },
        tools: [
            { name: "list_issues" },
            { name: "get_issue" },
            { name: "save_issue", writes: true },
            { name: "create_comment", writes: true },
        ],
        toolCount: 20,
        docsUrl: "https://linear.app/docs/mcp",
    },
    {
        id: "clickup",
        name: "ClickUp",
        category: "Team",
        url: "https://mcp.clickup.com/mcp",
        match: /^mcp\.clickup\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "Search Workspace" },
            { name: "Create Task", writes: true },
            { name: "Update Task", writes: true },
            { name: "Create Task Comment", writes: true },
        ],
        toolCount: 48,
        docsUrl: "https://developer.clickup.com/docs/mcp-tools",
    },
    {
        id: "airtable",
        name: "Airtable",
        category: "Team",
        url: "https://mcp.airtable.com/mcp",
        match: /^mcp\.airtable\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "list_bases" },
            { name: "search_records" },
            { name: "list_records_for_table" },
            { name: "create_records_for_table", writes: true },
        ],
        docsUrl: "https://support.airtable.com/docs/using-the-airtable-mcp-server",
    },
    {
        id: "asana",
        name: "Asana",
        category: "Team",
        url: "https://mcp.asana.com/v2/mcp",
        match: /^mcp\.asana\.com/,
        auth: {
            kind: "oauth-own-client",
            consoleUrl: "https://developers.asana.com/docs/integrating-with-asanas-mcp-server",
        },
        tools: [
            { name: "search_tasks" },
            { name: "get_tasks" },
            { name: "create_tasks", writes: true },
            { name: "update_tasks", writes: true },
            { name: "add_comment", writes: true },
        ],
        toolCount: 27,
        docsUrl: "https://developers.asana.com/docs/mcp-tools-reference",
    },
    {
        id: "todoist",
        name: "Todoist",
        category: "Team",
        url: "https://ai.todoist.net/mcp",
        match: /^ai\.todoist\.net/,
        auth: { kind: "oauth" },
        tools: [
            { name: "add-tasks", writes: true },
            { name: "find-tasks" },
            { name: "find-tasks-by-date" },
            { name: "complete-tasks", writes: true },
        ],
        toolCount: 47,
        docsUrl: "https://github.com/Doist/todoist-ai",
    },

    // Automation
    {
        id: "zapier",
        name: "Zapier",
        category: "Automation",
        url: "https://mcp.zapier.com/api/v1/connect",
        match: /^mcp\.zapier\.com/,
        auth: { kind: "oauth" },
        tools: [
            { name: "Your Zapier actions", writes: true },
        ],
        docsUrl: "https://docs.zapier.com/mcp/get-started/connect",
    },
    {
        id: "make",
        name: "Make",
        category: "Automation",
        url: "https://mcp.make.com",
        match: /^mcp\.make\.com|\.make\.com\/mcp/,
        auth: { kind: "oauth" },
        tools: [
            { name: "Your scenarios", writes: true },
        ],
        docsUrl: "https://developers.make.com/mcp-server",
    },
    {
        id: "n8n",
        name: "n8n",
        category: "Automation",
        url: "{instance}/mcp-server/http",
        urlFields: [{ key: "instance", placeholder: "https://acme.app.n8n.cloud" }],
        match: /\/mcp-server\/http$/,
        auth: {
            kind: "headers",
            fields: [{ key: "token", secret: true }],
            headers: (v) => [bearer(v.token)],
        },
        tools: [
            { name: "search_workflows" },
            { name: "execute_workflow", writes: true },
            { name: "get_workflow_execution" },
            { name: "query_data_table" },
            { name: "insert_data_table_records", writes: true },
        ],
        toolCount: 34,
        recommendedTools: ["search_workflows", "get_workflow_details", "execute_workflow", "get_workflow_execution", "query_data_table"],
        docsUrl: "https://docs.n8n.io/connect/connect-to-n8n-mcp-server.md",
    },

    // Smart home
    {
        id: "home-assistant",
        name: "Home Assistant",
        category: "Smart home",
        url: "{instance}/api/mcp",
        urlFields: [{
            key: "instance",
            placeholder: "https://abc123.ui.nabu.casa",
        }],
        // Home Assistant Cloud addresses, or a host named for it; any other /api/mcp is not assumed to be one.
        match: /^([^/]*\.ui\.nabu\.casa|[^/]*(home-?assistant|hass)[^/]*)\/api\/mcp$/,
        auth: {
            kind: "headers",
            fields: [{ key: "token", secret: true }],
            headers: (v) => [bearer(v.token)],
        },
        tools: [
            { name: "GetLiveContext" },
            { name: "HassTurnOn", writes: true },
            { name: "HassTurnOff", writes: true },
            { name: "HassLightSet", writes: true },
            { name: "HassClimateSetTemperature", writes: true },
        ],
        recommendedTools: ["GetLiveContext"],
        docsUrl: "https://www.home-assistant.io/integrations/mcp_server/",
    },

    // Search
    {
        id: "exa",
        name: "Exa",
        category: "Search",
        url: "https://mcp.exa.ai/mcp",
        match: /^mcp\.exa\.ai/,
        auth: { kind: "none" },
        tools: [
            { name: "web_search_exa" },
            { name: "web_fetch_exa" },
        ],
        toolCount: 2,
        recommendedTools: ["web_search_exa", "web_fetch_exa"],
        docsUrl: "https://exa.ai/docs/reference/exa-mcp",
    },
];

/** The catalog in English. */
export const APP_CATALOG: CatalogApp[] = APPS.map((a) => localizeApp(a, englishAt));

/** The catalog without its words, for localizeApp() in a component. */
export const RAW_APPS: readonly RawApp[] = APPS;

export function appById(id: string | null): RawApp | null {
    return APPS.find((a) => a.id === id) ?? null;
}

/**
 * The address whose favicon stands for an app: its MCP server, or the brand's
 * own site where that address is a template or a shared host
 * (lib/site-icon.ts). /site-icon falls back to the main domain.
 */
export function appIconUrl(id: string): string | undefined {
    return APP_SITES[id] ?? appById(id)?.url;
}

/** The directory app a connected server's URL belongs to, if any. */
export function appForUrl(url: string): CatalogApp | null {
    let target: string;
    try {
        const u = new URL(url);
        target = `${u.host}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
        return null;
    }
    return APP_CATALOG.find((a) => a.match.test(target)) ?? null;
}

/** The app's URL with its {placeholders} filled from what the owner typed. */
export function fillUrl(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, k: string) => {
        const v = (values[k] ?? "").trim();
        // An instance address arrives with its scheme and maybe a trailing slash.
        return k === "instance" ? v.replace(/\/+$/, "") : v;
    });
}

/** How connecting works, in a word or two, in [t]'s language. */
export function authHint(app: RawApp | CatalogApp, t: CatalogT): string {
    switch (app.auth.kind) {
        case "none": return t("catalog.auth.none");
        case "oauth": return t("catalog.auth.oauth");
        case "oauth-own-client": return t("catalog.auth.ownApp");
        case "headers": return t("catalog.auth.apiKey");
    }
}

/** The host of a server's URL, for the one-line cards; the URL itself when it does not parse. */
export function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}
