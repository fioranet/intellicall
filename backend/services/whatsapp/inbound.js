/**
 * A message someone sent to a connected number.
 *
 *   1. stored once: Meta's message id is unique, so a redelivery stops here
 *   2. the contact's 24-hour window reopens, and their profile name is kept
 *   3. the open chat continues, or a new one starts after the inactivity timeout
 *   4. STOP opts them out (one confirmation, then silence); START opts back in
 *   5. no agent, messaging off, or a person replying from the Business app: stored, not answered
 *   6. otherwise a turn is scheduled (chat-runner.js)
 *
 * Media is fetched into uploads/wa in the background, so the inbox can show it;
 * a voice note is fetched by the turn itself if it is not there yet.
 */
const { sendOutbound, tokenOf } = require('./send');
const { keepInbound } = require('./media');

const WhatsAppContact = require('../../models/WhatsAppContact');
const WhatsAppConversation = require('../../models/WhatsAppConversation');
const WhatsAppMessage = require('../../models/WhatsAppMessage');
const Lead = require('../../models/Lead');

const STOP_WORDS = new Set(['STOP', 'UNSUBSCRIBE', 'STOP ALL', 'STOPALL', 'OPT OUT', 'OPTOUT', 'END']);
const START_WORDS = new Set(['START', 'UNSTOP', 'SUBSCRIBE']);

/** Meta's message object as one row's fields. */
function parseInbound(m) {
    const media = (x) => (x ? { metaMediaId: x.id ?? null, mimeType: x.mime_type ?? null, filename: x.filename ?? null } : null);
    const base = { transcript: null, voice: false, media: null, contextWamid: (m.context && m.context.id) || null };
    switch (m.type) {
        case 'text': return { ...base, type: 'text', text: String((m.text && m.text.body) ?? '') };
        case 'image': return { ...base, type: 'image', text: String((m.image && m.image.caption) ?? ''), media: media(m.image) };
        case 'video': return { ...base, type: 'video', text: String((m.video && m.video.caption) ?? ''), media: media(m.video) };
        case 'document': return { ...base, type: 'document', text: String((m.document && m.document.caption) ?? ''), media: media(m.document) };
        case 'sticker': return { ...base, type: 'sticker', text: '', media: media(m.sticker) };
        case 'audio': return { ...base, type: 'audio', text: '', voice: Boolean((m.audio && m.audio.voice) ?? true), media: media(m.audio) };
        case 'location': {
            const l = m.location || {};
            const label = [l.name, l.address].filter(Boolean).join(', ');
            return { ...base, type: 'location', text: `${label ? `${label} ` : ''}(${l.latitude}, ${l.longitude})` };
        }
        case 'contacts': {
            const c = (m.contacts || [])[0] || {};
            return { ...base, type: 'contacts', text: [c.name && c.name.formatted_name, c.phones && c.phones[0] && c.phones[0].phone].filter(Boolean).join(', ') };
        }
        case 'interactive': {
            const r = (m.interactive && (m.interactive.button_reply || m.interactive.list_reply)) || {};
            return { ...base, type: 'interactive', text: String(r.title ?? ''), transcript: [r.title, r.description].filter(Boolean).join(' — ') || String(r.id ?? '') };
        }
        case 'button': return { ...base, type: 'button', text: String((m.button && m.button.text) ?? ''), transcript: String((m.button && (m.button.text || m.button.payload)) ?? '') };
        case 'reaction': return { ...base, type: 'reaction', text: String((m.reaction && m.reaction.emoji) ?? ''), contextWamid: (m.reaction && m.reaction.message_id) || null };
        default: return { ...base, type: 'unsupported', text: '' };
    }
}

const isDuplicate = (err) => err && err.code === 11000;

/** The contact for this sender, created on first contact, with the window reopened. */
async function upsertContact(account, waId, bsuid, profileName) {
    const set = { lastInboundAt: new Date() };
    if (profileName) set.profileName = profileName.slice(0, 120);
    if (bsuid) set.bsuid = bsuid;
    const filter = waId ? { accountId: account._id, waId } : { accountId: account._id, bsuid };
    try {
        return await WhatsAppContact.findOneAndUpdate(filter, {
            $set: set,
            $setOnInsert: { createdBy: account.createdBy, accountId: account._id, ...(waId ? { waId } : {}) },
        }, { upsert: true, returnDocument: 'after' }).lean();
    } catch (err) {
        if (!isDuplicate(err)) throw err;
        return WhatsAppContact.findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after' }).lean();
    }
}

/** The chat this message belongs to: the open one, unless it has gone quiet past the timeout. */
async function conversationFor(account, contactId) {
    const idleMs = Math.max(1, Number(account.settings && account.settings.inactivityMinutes) || 15) * 60_000;
    const open = await WhatsAppConversation.findOne({ contactId, status: 'open' }).sort({ lastMessageAt: -1 }).lean();
    if (open && Date.now() - new Date(open.lastMessageAt).getTime() < idleMs) return open;
    if (open) {
        await WhatsAppConversation.updateOne({ _id: open._id, status: 'open' }, { $set: { status: 'closed', closedAt: new Date(), closedReason: 'inactivity' } });
    }
    return WhatsAppConversation.create({
        createdBy: account.createdBy, accountId: account._id, contactId, agentId: account.inboundAgentId || null,
    });
}

/** The CRM lead for this number, made on first contact as an inbound call would. */
async function leadFor(account, waId, name) {
    if (!waId) return null;
    const existing = await Lead.findOne({ phone: waId, createdBy: account.createdBy }).select('_id').lean();
    if (existing) return existing._id;
    try {
        const lead = await Lead.create({ name: name || `WhatsApp (+${waId})`, phone: waId, createdBy: account.createdBy, tags: ['inbound', 'whatsapp'] });
        require('../webhook-service').trigger(account.createdBy, 'leadCreated', { lead });
        return lead._id;
    } catch (err) {
        console.error('[whatsapp] lead not created:', err.message);
        return null;
    }
}

async function handleInbound(account, m, contacts = []) {
    const waId = String(m.from ?? '').replace(/\D/g, '');
    const profile = contacts.find((c) => String(c.wa_id ?? '') === waId) || contacts[0] || {};
    const bsuid = m.from_user_id || profile.user_id || null;
    if (!waId && !bsuid) return;
    if (!m.id) return;

    const contact = await upsertContact(account, waId, bsuid, String((profile.profile && profile.profile.name) || ''));
    const parsed = parseInbound(m);

    let message;
    try {
        message = await WhatsAppMessage.create({
            createdBy: account.createdBy, accountId: account._id, contactId: contact._id,
            wamid: String(m.id), direction: 'in', origin: 'contact', status: 'received',
            type: parsed.type, text: parsed.text.slice(0, 4096), transcript: parsed.transcript, voice: parsed.voice,
            contextWamid: parsed.contextWamid,
            ...(parsed.media ? { media: parsed.media } : {}),
        });
    } catch (err) {
        if (isDuplicate(err)) return; // Meta delivered it twice
        throw err;
    }

    const conversation = await conversationFor(account, contact._id);
    await Promise.all([
        WhatsAppMessage.updateOne({ _id: message._id }, { $set: { conversationId: conversation._id } }),
        WhatsAppConversation.updateOne({ _id: conversation._id }, { $set: { lastMessageAt: new Date() }, $inc: { messageCount: 1 } }),
    ]);

    // STOP and START, matched as the whole message so "stop by at 5" is not an opt-out.
    const word = parsed.type === 'text' ? parsed.text.trim().toUpperCase().replace(/[.!]+$/, '') : '';
    if (STOP_WORDS.has(word)) {
        await WhatsAppContact.updateOne({ _id: contact._id }, { $set: { optedOut: true, optedOutAt: new Date() } });
        await WhatsAppMessage.updateOne({ _id: message._id }, { $set: { handledAt: new Date() } });
        await sendOutbound(account, { ...contact, optedOut: true }, { kind: 'text', text: 'You will not get more messages from us here. Send START if you change your mind.' },
            { origin: 'system', conversationId: conversation._id });
        await WhatsAppConversation.updateOne({ _id: conversation._id }, { $set: { status: 'closed', closedAt: new Date(), closedReason: 'opt_out' } });
        return;
    }
    if (START_WORDS.has(word) && contact.optedOut) {
        await WhatsAppContact.updateOne({ _id: contact._id }, { $set: { optedOut: false, optedOutAt: null } });
        contact.optedOut = false;
    }
    if (contact.optedOut) return;

    if (parsed.media && parsed.media.metaMediaId && parsed.type !== 'audio') {
        // For the inbox. Not awaited: the reply does not wait on a photo download.
        tokenOf(account)
            .then((token) => keepInbound(account, token, parsed.media.metaMediaId, message._id))
            .then((k) => WhatsAppMessage.updateOne({ _id: message._id }, { $set: { 'media.storageKey': k.storageKey, 'media.mimeType': k.mimeType, 'media.bytes': k.bytes } }))
            .catch((err) => console.warn(`[whatsapp] media for ${String(message._id)} not kept:`, err.message));
    }

    if (!contact.leadId) {
        const leadId = await leadFor(account, waId, String((profile.profile && profile.profile.name) || ''));
        if (leadId) await WhatsAppContact.updateOne({ _id: contact._id }, { $set: { leadId } });
    }

    const agentId = conversation.agentId || account.inboundAgentId;
    if (!agentId || (account.settings && account.settings.messagingEnabled === false)) return;
    if (contact.humanPausedUntil && new Date(contact.humanPausedUntil).getTime() > Date.now()) return;

    require('./chat-runner').scheduleTurn(String(contact._id));
}

/**
 * A message a person sent from the WhatsApp Business app, on a number connected
 * with coexistence. Stored in the chat, and the agent steps back for the
 * account's human pause so the two do not talk over each other.
 */
async function handleEcho(account, e) {
    const waId = String(e.to ?? '').replace(/\D/g, '');
    if (!waId || !e.id) return;
    const contact = await WhatsAppContact.findOneAndUpdate(
        { accountId: account._id, waId },
        { $setOnInsert: { createdBy: account.createdBy, accountId: account._id, waId } },
        { upsert: true, returnDocument: 'after' },
    ).lean();
    const pauseMin = Math.max(0, Number((account.settings && account.settings.humanPauseMinutes) ?? 30));
    if (pauseMin > 0) {
        await WhatsAppContact.updateOne({ _id: contact._id }, { $set: { humanPausedUntil: new Date(Date.now() + pauseMin * 60_000) } });
    }
    const open = await WhatsAppConversation.findOne({ contactId: contact._id, status: 'open' }).sort({ lastMessageAt: -1 }).lean();
    const parsed = parseInbound(e);
    await WhatsAppMessage.create({
        createdBy: account.createdBy, accountId: account._id, contactId: contact._id, conversationId: open ? open._id : null,
        wamid: String(e.id), direction: 'out', origin: 'business_app', status: 'sent', type: parsed.type === 'unsupported' ? 'text' : parsed.type,
        text: parsed.text.slice(0, 4096),
    }).catch((err) => { if (!isDuplicate(err)) throw err; });
}

module.exports = { parseInbound, handleInbound, handleEcho };
