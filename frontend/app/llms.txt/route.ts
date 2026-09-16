// /llms.txt — a plain-text summary of this site for AI assistants and
// answer engines (AEO). Generated per install so white-label branding,
// contact details, and URLs are always correct.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function GET() {
    let appName = "IntelliCallAI";
    let supportEmail = "";
    try {
        const res = await fetch(`${API_BASE_URL}/settings/public`, { cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            appName = data?.data?.branding?.appName || appName;
            supportEmail = data?.data?.supportEmail || "";
        }
    } catch { }

    const body = `# ${appName}

> ${appName} is an AI voice calling platform. Human-like AI agents answer inbound calls and place outbound calls 24/7 — they qualify leads in real time, answer questions from a business knowledge base, book appointments during the call, and follow up with WhatsApp reminders.

## What ${appName} does

- AI voice agents make and receive phone calls with natural, human-like speech in many languages
- Outbound campaigns: import leads (CSV or Google Sheets) and the AI dials them automatically on schedule
- Real-time lead qualification with scoring, AI call summaries, full transcripts, and call recordings
- AI appointment booking during live calls, synced to Google Calendar
- Automatic WhatsApp appointment reminders sent to clients before every meeting
- Integrations: n8n, HubSpot CRM, Slack, WhatsApp, Google Calendar, Google Sheets, signed webhooks, and a REST API with personal API keys
- Instant AI callbacks: an API call makes the AI phone a prospect within seconds of a form submission

## Key pages

- [Home](${SITE_URL}/): product overview, features, integrations, pricing plans
- [Sign up](${SITE_URL}/signup): create an account
- [Contact](${SITE_URL}/contact): get in touch${supportEmail ? ` (support: ${supportEmail})` : ""}
- [Privacy](${SITE_URL}/privacy) and [Terms](${SITE_URL}/terms)

## Common questions

- What is ${appName}? An AI voice calling platform where AI agents handle sales and support calls end to end: dialing, conversation, qualification, and appointment booking.
- Can the AI book appointments? Yes — during the call, with calendar sync and automatic WhatsApp reminders to the client.
- Does it handle inbound and outbound? Both: inbound receptionist-style answering and outbound campaign dialing with the same agents.
- Can it integrate with my tools? Yes — n8n, HubSpot, Slack, WhatsApp, Google Calendar, Google Sheets, webhooks, and a documented REST API.
`;

    return new Response(body, {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
}
