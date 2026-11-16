/**
 * The one way a WhatsApp message leaves this server.
 *
 * Agent tools, chat replies, the scheduler and the console all come through
 * sendOutbound, so the rules are kept in one place and in this order:
 *
 *   1. the account is connected
 *   2. the person has not opted out (only our own confirmation may follow STOP)
 *   3. free-form messages only inside the 24-hour window; outside it, a template
 *   4. a template must be approved, have the right parameter count, and not be
 *      marketing unless the sender allowed it
 *   5. the account's per-minute rate and the per-person hourly cap
 *   6. the plan's monthly WhatsApp message limit
 *
 * Then it is sent and stored. Nothing here throws for a refusal: it returns a
 * code and a sentence, which a tool hands to the model and the console to the owner.
 */
const graph = require('./graph');
const { mediaIdFor, MediaError } = require('./media');
const { open } = require('../../utils/credentials');
const { metaConfig } = require('./config');

const WhatsAppMessage = require('../../models/WhatsAppMessage');
const WhatsAppTemplate = require('../../models/WhatsAppTemplate');
const WhatsAppConversation = require('../../models/WhatsAppConversation');

const WINDOW_MS = 24 * 3600_000;

/**
 * The token that acts for a number: the platform's permanent system user for
 * one connected through Embedded Signup, else the number's own sealed token.
 * @returns {Promise<string>}
 */
async function tokenOf(account) {
    if (account.tokenKind === 'partner') {
        const { systemUserToken } = await metaConfig();
        if (!systemUserToken) throw new Error('The Meta system user token is not set on this server (Admin → Integrations → Meta).');
        return systemUserToken;
    }
    if (!account.tokenEncrypted) throw new Error('This WhatsApp number has no access token. Connect it again.');
    const token = open(account.tokenEncrypted, 'WhatsApp access token');
    if (!token) throw new Error('This WhatsApp number\'s access token could not be read. Connect it again.');
    return token;
}

/** Whether the 24-hour customer service window with this person is open. */
function windowOpen(contact, now = Date.now()) {
    const at = contact.lastInboundAt ? new Date(contact.lastInboundAt).getTime() : 0;
    return at > 0 && now - at < WINDOW_MS;
}

const refuse = (code, reason) => ({ ok: false, code, reason });

function envInt(name, fallback) {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** In-memory counters: per account per minute, per contact per hour. One process. */
const counters = new Map();
function bump(key, ttlMs) {
    const now = Date.now();
    for (const [k, v] of counters) if (v.expiresAt <= now) counters.delete(k);
    const cur = counters.get(key) || { n: 0, expiresAt: now + ttlMs };
    cur.n += 1;
    counters.set(key, cur);
    return cur.n;
}

/** True when the send fits the account's per-minute and the person's hourly budget. */
function underRateLimits(accountId, contactId) {
    const minute = Math.floor(Date.now() / 60_000);
    const hour = Math.floor(Date.now() / 3600_000);
    const a = bump(`a:${accountId}:${minute}`, 120_000);
    const c = bump(`c:${contactId}:${hour}`, 7_200_000);
    return a <= envInt('WHATSAPP_SENDS_PER_MINUTE', 80) && c <= envInt('WHATSAPP_SENDS_PER_CONTACT_HOUR', 30);
}

/** The approved template by name, in the requested language or the only one there is. */
async function findTemplate(accountId, name, language) {
    const q = { accountId, name };
    if (language) q.language = language;
    const rows = await WhatsAppTemplate.find(q).lean();
    return rows.find((t) => t.status === 'APPROVED') || rows[0] || null;
}

/** The template body with its parameters filled in, for the inbox and the model's history. */
function renderTemplate(t, params) {
    let i = 0;
    return String(t.bodyText || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key) => {
        const named = t.bodyParamNames ? t.bodyParamNames.indexOf(key) : -1;
        const v = named >= 0 ? params[named] : /^\d+$/.test(key) ? params[Number(key) - 1] : params[i];
        i += 1;
        return v ?? `{{${key}}}`;
    });
}

/** Whether the account may send or receive another message this month, under its plan. */
async function planAllows(userId) {
    try {
        const User = require('../../models/User');
        const { whatsappMessagesAllowed } = require('../../middleware/limit-checker');
        const user = await User.findById(userId);
        if (!user) return false;
        return whatsappMessagesAllowed(user);
    } catch (err) {
        console.error('[whatsapp] plan check failed:', err.message);
        return true;
    }
}

/**
 * @param {object} account a WhatsAppAccount (`.lean()`)
 * @param {object} contact a WhatsAppContact (`.lean()`)
 * @param {{kind: 'text', text: string, contextWamid?: string | null}
 *   | {kind: 'template', name: string, language?: string | null, parameters?: string[]}
 *   | {kind: 'voice', bytes: Buffer, transcript: string}
 *   | {kind: 'buttons', body: string, footer?: string | null, buttons: Array<{id: string, title: string}>}
 *   | {kind: 'list', body: string, buttonText: string, header?: string | null, footer?: string | null, sections: Array<{title: string, rows: Array<{id: string, title: string, description?: string | null}>}>}} payload
 * @param {{origin: 'chat' | 'agent_tool' | 'api' | 'scheduled' | 'system', conversationId?: unknown, callSid?: string | null, allowMarketing?: boolean}} opts
 * @returns {Promise<{ok: true, messageId: string, wamid: string} | {ok: false, code: string, reason: string, messageId?: string}>}
 */
async function sendOutbound(account, contact, payload, opts) {
    if (account.status !== 'connected') return refuse('account_disconnected', 'This WhatsApp number is not connected. Connect it again.');
    if (!contact.waId) return refuse('no_number', 'This person has no WhatsApp number on record.');
    if (contact.optedOut && opts.origin !== 'system') return refuse('opted_out', 'This person asked not to get WhatsApp messages (they sent STOP).');

    const freeForm = payload.kind !== 'template';
    if (freeForm && !windowOpen(contact)) {
        return refuse('window_closed', 'More than 24 hours have passed since this person last wrote, so only an approved template can be sent.');
    }

    let template = null;
    if (payload.kind === 'template') {
        template = await findTemplate(account._id, payload.name, payload.language);
        if (!template) return refuse('template_not_found', `There is no template called ${payload.name} on this number. Sync templates first.`);
        if (template.status !== 'APPROVED') return refuse('template_not_approved', `The template ${payload.name} is ${String(template.status || 'not approved').toLowerCase()} in WhatsApp Manager.`);
        if (String(template.category).toUpperCase() === 'MARKETING' && !opts.allowMarketing) {
            return refuse('marketing_not_allowed', `${payload.name} is a marketing template, which this sender may not use.`);
        }
        const params = payload.parameters || [];
        if (params.length !== template.bodyParamCount) {
            return refuse('template_params', `${payload.name} takes ${template.bodyParamCount} parameter${template.bodyParamCount === 1 ? '' : 's'}, not ${params.length}.`);
        }
        if (params.some((p) => !String(p).trim())) return refuse('template_params', 'A template parameter is empty.');
    }

    if (!underRateLimits(String(account._id), String(contact._id))) {
        return refuse('rate_limited', 'Too many WhatsApp messages in a short time. Try again in a minute.');
    }
    if (opts.origin !== 'system' && !(await planAllows(account.createdBy))) {
        return refuse('plan_limit', 'This account has reached its monthly WhatsApp message limit.');
    }

    let token;
    try {
        token = await tokenOf(account);
    } catch (err) {
        return refuse('account_disconnected', err.message);
    }
    const base = {
        createdBy: account.createdBy,
        accountId: account._id,
        conversationId: opts.conversationId || null,
        contactId: contact._id,
        direction: 'out',
        origin: opts.origin,
        callSid: opts.callSid || null,
    };

    let sent;
    let doc;
    try {
        switch (payload.kind) {
            case 'text': {
                const text = payload.text.slice(0, 4096);
                sent = await graph.sendText(token, account.phoneNumberId, contact.waId, text, payload.contextWamid);
                doc = { type: 'text', text };
                break;
            }
            case 'template': {
                const params = (payload.parameters || []).map((p) => String(p).slice(0, 1024));
                const named = template.bodyParamNames.length === template.bodyParamCount ? template.bodyParamNames : undefined;
                sent = await graph.sendTemplate(token, account.phoneNumberId, contact.waId, {
                    name: template.name, language: template.language, parameters: params, ...(named ? { paramNames: named } : {}),
                });
                doc = {
                    type: 'template', text: renderTemplate(template, params),
                    template: { name: template.name, language: template.language, category: template.category },
                };
                break;
            }
            case 'voice': {
                const mediaId = await mediaIdFor(account, token, payload.bytes, 'audio/ogg', 'reply.ogg');
                sent = await graph.sendMedia(token, account.phoneNumberId, contact.waId, 'audio', mediaId, { voice: true });
                doc = { type: 'audio', voice: true, transcript: payload.transcript, media: { metaMediaId: mediaId, mimeType: 'audio/ogg', bytes: payload.bytes.length } };
                break;
            }
            case 'buttons': {
                sent = await graph.sendButtons(token, account.phoneNumberId, contact.waId, payload);
                doc = { type: 'interactive', text: `${payload.body}\n${payload.buttons.map((b) => `[${b.title}]`).join(' ')}` };
                break;
            }
            case 'list': {
                sent = await graph.sendList(token, account.phoneNumberId, contact.waId, payload);
                const rows = payload.sections.flatMap((s) => s.rows.map((r) => r.title));
                doc = { type: 'interactive', text: `${payload.body}\n${rows.map((t) => `• ${t}`).join('\n')}` };
                break;
            }
            default:
                return refuse('unsupported', 'This kind of message cannot be sent.');
        }
    } catch (err) {
        const info = err instanceof MediaError ? { code: null, message: err.message, raw: err.message } : graph.describeGraphError(err);
        const failed = await WhatsAppMessage.create({
            ...base,
            type: payload.kind === 'template' ? 'template' : payload.kind === 'text' ? 'text' : payload.kind === 'voice' ? 'audio' : 'interactive',
            text: payload.kind === 'text' ? payload.text.slice(0, 4096) : '',
            status: 'failed',
            statusAt: { failed: new Date() },
            error: { code: info.code ?? null, title: info.message, detail: info.raw },
        }).catch(() => null);
        return { ok: false, code: err instanceof MediaError ? err.code : 'meta_error', reason: info.message, ...(failed ? { messageId: String(failed._id) } : {}) };
    }

    const message = await WhatsAppMessage.create({ ...base, ...doc, wamid: sent.wamid, status: 'accepted' });
    if (opts.conversationId) {
        await WhatsAppConversation.updateOne(
            { _id: opts.conversationId },
            { $set: { lastMessageAt: new Date() }, $inc: { messageCount: 1 } },
        ).catch(() => undefined);
    }
    return { ok: true, messageId: String(message._id), wamid: sent.wamid };
}

module.exports = { WINDOW_MS, tokenOf, windowOpen, findTemplate, renderTemplate, sendOutbound, planAllows };
