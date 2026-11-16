/**
 * An agent answering a WhatsApp chat, one turn at a time.
 *
 * A turn starts 1.5 seconds after the last message in a burst (people send
 * three short lines, not one long one) and answers everything not yet answered.
 * One turn per person at a time, by an in-memory lock; a message that arrives
 * mid-turn sets a flag and gets its own turn straight after.
 *
 * The turn:
 *   1. plan gate: over the month's WhatsApp message limit, and the agent stays
 *      quiet (the owner's fallback reply, if set, is sent instead, once per 6 h)
 *   2. read receipt and "typing…"
 *   3. voice notes transcribed (Deepgram, the owner's key)
 *   4. the model runs with the agent's prompt, knowledge, tools, apps and
 *      appointment functions, non-streaming, a few tool rounds at most
 *   5. the reply goes out as text, or as a voice note when the person sent one
 *
 * The model is `agent.whatsapp.chatModel`, else the account's default OpenRouter
 * model (utils/models.js). Realtime engines cannot write text, so a Gemini Live
 * or Sarvam agent chats with that text model.
 */
const axios = require('axios');
const { AgentToolSession } = require('../tools/agent-tool-session');
const { sendOutbound, tokenOf, planAllows } = require('./send');
const graph = require('./graph');
const { keepInbound, readStored } = require('./media');
const { transcribe, synthesize, canSpeak, MAX_VOICE_REPLY_CHARS } = require('./voice-notes');
const { buildChatSystemPrompt } = require('./prompt');
const { openRouterModel } = require('../../utils/models');
const { formatKnowledgeBaseContent } = require('../../utils/kb-formatter');

const WhatsAppAccount = require('../../models/WhatsAppAccount');
const WhatsAppContact = require('../../models/WhatsAppContact');
const WhatsAppConversation = require('../../models/WhatsAppConversation');
const WhatsAppMessage = require('../../models/WhatsAppMessage');
const Agent = require('../../models/Agent');
const Lead = require('../../models/Lead');
const Settings = require('../../models/Settings');
const KnowledgeBase = require('../../models/KnowledgeBase');
const AppointmentService = require('../appointment-tool-service');

const DEBOUNCE_MS = 1500;
const HISTORY = 30;
const MAX_ROUNDS = 4;
const MAX_TOKENS = 700;
const OFFLINE_REPLY_EVERY_MS = 6 * 3600_000;

/** Turns are capped per conversation per day, so a loop or a spammer cannot run up the bill. */
function maxTurnsPerDay() {
    const n = Number(process.env.WHATSAPP_MAX_TURNS_PER_DAY);
    return Number.isFinite(n) && n > 0 ? n : 200;
}

const timers = new Map();
const locks = new Set();
const again = new Set();

/** Answer this contact after the burst settles. Safe to call for every inbound message. */
function scheduleTurn(contactId, delayMs = DEBOUNCE_MS) {
    const prev = timers.get(contactId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
        timers.delete(contactId);
        runTurn(contactId).catch((err) => console.error(`[whatsapp] turn for ${contactId} failed:`, err.message));
    }, delayMs);
    if (typeof t.unref === 'function') t.unref();
    timers.set(contactId, t);
}

async function runTurn(contactId) {
    if (locks.has(contactId)) {
        // Someone is mid-turn for this person: ask them to go again when done.
        again.add(contactId);
        return;
    }
    locks.add(contactId);
    try {
        again.delete(contactId);
        await turn(contactId);
    } finally {
        locks.delete(contactId);
        if (again.has(contactId)) scheduleTurn(contactId, 50);
    }
}

/** One stored message as a line the model can read. */
function asChatLine(m) {
    const caption = (m.text || '').trim();
    if (m.direction === 'in') {
        let content;
        switch (m.type) {
            case 'text': content = m.text || ''; break;
            case 'audio': content = m.transcript ? m.transcript : '[sent a voice note that could not be understood]'; break;
            case 'image': content = `[sent a photo${caption ? `: ${caption}` : ''}]`; break;
            case 'video': content = `[sent a video${caption ? `: ${caption}` : ''}]`; break;
            case 'document': content = `[sent a file${m.media && m.media.filename ? ` named ${m.media.filename}` : ''}${caption ? `: ${caption}` : ''}]`; break;
            case 'sticker': content = '[sent a sticker]'; break;
            case 'location': content = `[shared a location: ${caption}]`; break;
            case 'contacts': content = `[shared a contact: ${caption}]`; break;
            case 'reaction': content = `[reacted ${caption || ''} to a message]`; break;
            case 'interactive':
            case 'button': content = `[tapped: ${m.transcript || caption}]`; break;
            default: content = '[sent a message type that cannot be shown]';
        }
        return content.trim() ? { role: 'user', content } : null;
    }
    if (m.origin === 'business_app') return { role: 'assistant', content: `(a person from the business wrote) ${caption}` };
    switch (m.type) {
        case 'text': return { role: 'assistant', content: m.text || '' };
        case 'audio': return m.transcript ? { role: 'assistant', content: m.transcript } : null;
        case 'template':
        case 'interactive': return { role: 'assistant', content: caption || `[sent the ${(m.template && m.template.name) || ''} template]` };
        default: return { role: 'assistant', content: `[sent a ${m.type}${m.media && m.media.filename ? `: ${m.media.filename}` : ''}]` };
    }
}

/** Which OpenRouter model this agent chats with. */
function chatModelFor(agent) {
    const ref = agent.whatsapp && agent.whatsapp.chatModel;
    if (ref && String(ref).trim()) return String(ref).trim().replace(/^openrouter\//, '');
    return openRouterModel;
}

const APPOINTMENT_TOOLS = [
    { type: 'function', function: { name: 'get_available_slots', description: 'Get free appointment slots for the next 7 days.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'list_appointments', description: "List this person's scheduled appointments.", parameters: { type: 'object', properties: {} } } },
    {
        type: 'function',
        function: {
            name: 'book_appointment',
            description: "Book an appointment. Ask for the person's name first if you do not have it.",
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: 'YYYY-MM-DD' },
                    time: { type: 'string', description: 'HH:mm, 24-hour' },
                    client_name: { type: 'string', description: "The person's full name (optional)" },
                },
                required: ['date', 'time'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'cancel_appointment',
            description: 'Cancel an appointment at a date and time.',
            parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:mm, 24-hour' } }, required: ['date', 'time'] },
        },
    },
];
const APPOINTMENT_NAMES = new Set(APPOINTMENT_TOOLS.map((t) => t.function.name));

/** Split a reply at WhatsApp's 4,096-character limit, on paragraph or sentence breaks where it can. */
function splitReply(text, max = 4096) {
    const out = [];
    let rest = text.trim();
    while (rest.length > max) {
        let cut = rest.lastIndexOf('\n\n', max);
        if (cut < max / 2) cut = rest.lastIndexOf('. ', max) + 1;
        if (cut < max / 2) cut = max;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out;
}

async function runAppointment(name, args, ctx) {
    switch (name) {
        case 'get_available_slots': return AppointmentService.getAvailableSlots(ctx.userId);
        case 'list_appointments': return AppointmentService.listAppointments(ctx.userId, ctx.phone);
        case 'book_appointment':
            return AppointmentService.bookAppointment(ctx.userId, ctx.agentId, ctx.leadId, ctx.phone, String(args.date ?? ''), String(args.time ?? ''), String(args.client_name ?? ''));
        case 'cancel_appointment': return AppointmentService.cancelAppointment(ctx.userId, ctx.phone, String(args.date ?? ''), String(args.time ?? ''));
        default: return `Unknown function: ${name}`;
    }
}

async function turn(contactId) {
    const contact = await WhatsAppContact.findById(contactId).lean();
    if (!contact || contact.optedOut) return;
    const account = await WhatsAppAccount.findById(contact.accountId).lean();
    if (!account || account.status !== 'connected' || !(account.settings && account.settings.messagingEnabled !== false)) return;
    const conversation = await WhatsAppConversation.findOne({ contactId: contact._id, status: 'open' }).sort({ lastMessageAt: -1 }).lean();
    if (!conversation) return;
    const userId = String(account.createdBy);

    const pending = await WhatsAppMessage.find({ conversationId: conversation._id, direction: 'in', handledAt: null }).sort({ createdAt: 1 }).lean();
    if (pending.length === 0) return;
    const markHandled = () => WhatsAppMessage.updateMany({ _id: { $in: pending.map((m) => m._id) } }, { $set: { handledAt: new Date() } });

    const agentId = conversation.agentId || account.inboundAgentId;
    const agent = agentId ? await Agent.findOne({ _id: agentId, createdBy: account.createdBy }).lean() : null;
    if (!agent) { await markHandled(); return; }
    if (contact.humanPausedUntil && new Date(contact.humanPausedUntil).getTime() > Date.now()) { await markHandled(); return; }

    // Only reactions: nothing to answer.
    if (pending.every((m) => m.type === 'reaction')) { await markHandled(); return; }

    const dayAgo = new Date(Date.now() - 86400_000);
    const turnsToday = await WhatsAppMessage.countDocuments({ conversationId: conversation._id, direction: 'out', origin: 'chat', createdAt: { $gt: dayAgo } });
    if (turnsToday >= maxTurnsPerDay()) { await markHandled(); return; }

    const last = pending[pending.length - 1];

    // The plan's monthly message limit: over it, the agent stays quiet and the
    // owner's fallback reply (if any) goes once per six hours.
    if (!(await planAllows(account.createdBy))) {
        await markHandled();
        const fallback = String((account.settings && account.settings.offlineReply) || '').trim();
        const lastOffline = conversation.offlineReplyAt ? new Date(conversation.offlineReplyAt).getTime() : 0;
        if (fallback && Date.now() - lastOffline > OFFLINE_REPLY_EVERY_MS) {
            await sendOutbound(account, contact, { kind: 'text', text: fallback }, { origin: 'system', conversationId: conversation._id });
            await WhatsAppConversation.updateOne({ _id: conversation._id }, { $set: { offlineReplyAt: new Date() } });
        }
        console.warn(`[whatsapp] replies paused on ${account.displayPhoneNumber}: plan limit reached`);
        return;
    }

    const settings = await Settings.findOne({ userId: account.createdBy }).lean();
    if (!settings || !settings.openRouterKey) {
        console.error('[whatsapp] OpenRouter key is not configured for this account; no reply sent');
        await markHandled();
        return;
    }

    let token;
    try { token = await tokenOf(account); } catch (err) { console.error('[whatsapp] no token:', err.message); await markHandled(); return; }
    if ((account.settings && account.settings.typingIndicator !== false) && last.wamid) {
        graph.markRead(token, account.phoneNumberId, last.wamid, true).catch(() => undefined);
    }

    // Voice notes become their transcript before the model reads them.
    for (const m of pending) {
        if (m.type !== 'audio' || m.transcript) continue;
        try {
            let bytes;
            let mime = (m.media && m.media.mimeType) || 'audio/ogg';
            if (m.media && m.media.storageKey) {
                bytes = await readStored(m.media.storageKey);
            } else if (m.media && m.media.metaMediaId) {
                const kept = await keepInbound(account, token, m.media.metaMediaId, m._id, 16 * 1024 * 1024);
                bytes = kept.data;
                mime = kept.mimeType;
                await WhatsAppMessage.updateOne({ _id: m._id }, { $set: { 'media.storageKey': kept.storageKey, 'media.mimeType': kept.mimeType, 'media.bytes': kept.bytes } });
            } else continue;
            const t = await transcribe(bytes, mime, agent, settings);
            m.transcript = t.text;
            await WhatsAppMessage.updateOne({ _id: m._id }, { $set: { transcript: t.text } });
        } catch (err) {
            console.error(`[whatsapp] voice note ${String(m._id)} not transcribed:`, err.message);
        }
    }

    const history = (await WhatsAppMessage.find({ conversationId: conversation._id, status: { $ne: 'failed' } })
        .sort({ createdAt: -1 }).limit(HISTORY).lean()).reverse();
    const byId = new Map(pending.map((m) => [String(m._id), m]));
    const lines = history.map((m) => asChatLine(byId.get(String(m._id)) || m)).filter(Boolean);

    const lead = contact.leadId ? await Lead.findById(contact.leadId).lean() : null;
    let kbContent = '';
    if (agent.knowledgeBaseId) {
        const kb = await KnowledgeBase.findById(agent.knowledgeBaseId).lean().catch(() => null);
        if (kb) kbContent = formatKnowledgeBaseContent(kb, agent.kbSettings || {});
    }

    const session = await AgentToolSession.forAgent(agent, userId, {
        whatsapp: { channel: 'chat', accountId: account._id, contactId: contact._id, conversationId: conversation._id },
    }).catch((err) => { console.error('[whatsapp] tools unavailable:', err.message); return null; });
    if (session) session.setCallId(`wa_${String(conversation._id)}`);
    const tools = [
        ...(session ? session.openAiTools() : []),
        ...(agent.appointmentBookingEnabled ? APPOINTMENT_TOOLS : []),
    ];
    const toolNames = tools.map((t) => String(t.function.name));

    const system = buildChatSystemPrompt({
        agent, settings, kbContent, lead, contactName: contact.profileName,
        connectedApps: session ? session.appNames() : [], toolNames,
    });

    const model = chatModelFor(agent);
    const extra = [];
    let reply = '';
    const clientPhone = contact.waId || '';

    try {
        for (let round = 0; ; round++) {
            const { data } = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model,
                messages: [{ role: 'system', content: system }, ...lines, ...extra],
                max_tokens: MAX_TOKENS,
                ...(tools.length ? { tools, tool_choice: round >= MAX_ROUNDS ? 'none' : 'auto' } : {}),
            }, { headers: { Authorization: `Bearer ${settings.openRouterKey}`, 'Content-Type': 'application/json' }, timeout: 60_000 });

            const msg = (data && data.choices && data.choices[0] && data.choices[0].message) || {};
            const calls = msg.tool_calls || [];
            if (msg.content) reply += (reply ? '\n\n' : '') + String(msg.content).trim();
            if (!calls.length || round >= MAX_ROUNDS) break;

            extra.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
            for (const c of calls) {
                let args = {};
                try { args = c.function.arguments ? JSON.parse(c.function.arguments) : {}; } catch { args = {}; }
                const name = c.function.name;
                let result;
                if (APPOINTMENT_NAMES.has(name)) {
                    result = await runAppointment(name, args, { userId, agentId: agent._id, leadId: contact.leadId, phone: clientPhone })
                        .catch((err) => `That could not be done right now (${err.message}).`);
                } else if (session && session.has(name)) {
                    result = await session.call(name, args);
                } else {
                    result = `There is no tool called ${name}.`;
                }
                extra.push({ role: 'tool', tool_call_id: c.id, content: String(result) });
            }
        }
    } catch (err) {
        const detail = err.response && err.response.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message;
        console.error(`[whatsapp] model call failed for ${String(conversation._id)}:`, detail);
    }

    // Reply: a voice note to a voice note, when the agent can speak and it is short enough.
    reply = reply.trim();
    if (reply) {
        const voice = last.type === 'audio' && (account.settings && account.settings.voiceNoteReplies !== false) && canSpeak(agent) && reply.length <= MAX_VOICE_REPLY_CHARS;
        let sentVoice = false;
        if (voice) {
            try {
                const spoken = await synthesize(agent, settings, reply);
                const r = await sendOutbound(account, contact, { kind: 'voice', bytes: spoken.ogg, transcript: reply }, { origin: 'chat', conversationId: conversation._id });
                if (r.ok) sentVoice = true;
            } catch (err) {
                console.warn('[whatsapp] voice reply failed, sending text:', err.message);
            }
        }
        if (!sentVoice) {
            for (const part of splitReply(reply)) {
                await sendOutbound(account, contact, { kind: 'text', text: part }, { origin: 'chat', conversationId: conversation._id });
            }
        }
    }

    await markHandled();

    const records = session ? [...session.records, ...((session.mcp && session.mcp.records) || [])] : [];
    await WhatsAppConversation.updateOne({ _id: conversation._id }, {
        $set: { lastMessageAt: new Date() },
        ...(records.length ? { $push: { toolCalls: { $each: records.map((r) => ({ ...r })) } } } : {}),
    });
    if (session && session.whatsapp && session.whatsapp.ended) {
        await WhatsAppConversation.updateOne({ _id: conversation._id, status: 'open' }, { $set: { status: 'closed', closedAt: new Date(), closedReason: 'end_conversation' } });
    }
    if (session) await session.close().catch(() => undefined);
}

module.exports = { DEBOUNCE_MS, scheduleTurn, runTurn, asChatLine, chatModelFor, splitReply };
