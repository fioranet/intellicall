export interface Faq {
    question: string;
    answer: string;
}

/**
 * Answer-shaped FAQ content, rendered in the FAQ section AND mirrored into FAQPage JSON-LD.
 * Single source of truth (imported by both) so the two never drift. `appName` is interpolated.
 */
export function buildFaqs(appName: string): Faq[] {
    return [
        {
            question: `What is ${appName}?`,
            answer: `${appName} is an AI voice calling platform. Human-like AI agents answer inbound calls and place outbound calls 24/7 — they qualify leads in real time, answer questions from your business knowledge base, book appointments during the call, and follow up with WhatsApp reminders.`,
        },
        {
            question: "How do AI voice agents actually work on a call?",
            answer: "Each call runs a real-time pipeline: speech-to-text transcribes the caller, a large language model decides what to say next based on your agent's instructions and knowledge base, and lifelike text-to-speech responds — fast enough for natural back-and-forth, including interruptions.",
        },
        {
            question: "Which voice engines and languages are supported?",
            answer: "Pick a voice engine per agent: a Classic pipeline (Deepgram + OpenRouter + ElevenLabs), the low-latency Deepgram Voice Agent, Gemini Live — one Google model that hears, thinks and speaks in 97 languages (SIP numbers) — or Sarvam AI for native Indian languages like Hindi, Tamil, Telugu, Bengali, Kannada, Malayalam, Marathi, Gujarati, Punjabi and Odia. Agents also converse in English, Spanish, French, German, Arabic, Portuguese, Japanese and more, with automatic language detection on the call.",
        },
        {
            question: "Can the AI book appointments during a call?",
            answer: "Yes. The agent checks your availability, books a slot mid-conversation, syncs it to Google Calendar, and the client automatically receives a WhatsApp reminder before the meeting. Rescheduling and cancellations are handled too.",
        },
        {
            question: "Does it handle both inbound and outbound calls?",
            answer: "Both. The same agents can answer incoming calls like a receptionist and run outbound campaigns — import leads from CSV or Google Sheets and the platform dials them automatically on your schedule.",
        },
        {
            question: "Can I connect my existing tools?",
            answer: "Yes — native integrations for n8n, HubSpot CRM, Slack, WhatsApp, Google Calendar, and Google Sheets, plus signed webhooks and a documented REST API with personal API keys for anything custom.",
        },
        {
            question: "How fast can the AI call a new lead?",
            answer: "Within seconds. Connect a form or CRM through n8n or the REST API and the AI dials the prospect the moment they submit — speed-to-lead without a human in the loop.",
        },
    ];
}
