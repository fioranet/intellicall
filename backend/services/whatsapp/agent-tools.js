/**
 * The built-in WhatsApp tools an agent can use, on a phone call or in a
 * WhatsApp chat. AgentToolSession declares and runs them, so every engine gets
 * them without knowing they exist.
 *
 *   whatsapp_send_message      call   free text, only inside the 24-hour window
 *   whatsapp_send_template     both   an approved template the owner allowed
 *   whatsapp_schedule_message  both   a reminder or follow-up template, later
 *   whatsapp_send_buttons      chat   one to three reply buttons
 *   whatsapp_send_list         chat   a list of up to ten options
 *   end_conversation           chat   close the chat
 *
 * The recipient is never an argument. On a call it is the caller's number; in
 * a chat it is the person chatting. Every tool is off until the owner turns it
 * on in the agent's WhatsApp settings, and one call or chat turn may send at
 * most `maxSendsPerCall` messages through them.
 */
const { sendOutbound, windowOpen, renderTemplate } = require('./send');

const WhatsAppAccount = require('../../models/WhatsAppAccount');
const WhatsAppContact = require('../../models/WhatsAppContact');
const WhatsAppTemplate = require('../../models/WhatsAppTemplate');
const ScheduledWhatsAppMessage = require('../../models/ScheduledWhatsAppMessage');
const Settings = require('../../models/Settings');

const WHATSAPP_TOOL_NAMES = [
    'whatsapp_send_message', 'whatsapp_send_template', 'whatsapp_schedule_message',
    'whatsapp_send_buttons', 'whatsapp_send_list', 'end_conversation',
];

const MAX_TEMPLATES = 20;
const MAX_SCHEDULE_DAYS = 30;

/** Whether the agent has any WhatsApp tool turned on. Cheap: reads only the agent. */
function wantsWhatsAppTools(agent) {
    const t = agent && agent.whatsapp && agent.whatsapp.tools;
    return Boolean(t && (t.messages || t.templates || t.schedule || t.interactive));
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);

class WhatsAppToolkit {
    /**
     * @param {'call' | 'chat'} channel
     * @param {object} account
     * @param {object | null} contact
     * @param {string} recipient digits
     * @param {object} agent
     * @param {Array<object>} templates approved templates the agent may use
     * @param {{callSid?: string | null, conversationId?: unknown, timeZone: string}} opts
     */
    constructor(channel, account, contact, recipient, agent, templates, opts) {
        this.channel = channel;
        this.account = account;
        this.contact = contact;
        this.recipient = recipient;
        this.agent = agent;
        this.templates = templates;
        this.opts = opts;
        this.sends = 0;
        /** Set when the agent called end_conversation. The chat runner closes the chat after replying. */
        this.ended = false;
    }

    get wa() { return this.agent.whatsapp || {}; }

    purposeTemplate(purpose) {
        const t = this.wa.templates && this.wa.templates[purpose];
        if (!t || !t.name) return null;
        return this.templates.find((x) => x.name === t.name && (!t.language || x.language === t.language)) || null;
    }

    /** The names this toolkit answers to (what AgentToolSession treats as built-ins). */
    names() { return WHATSAPP_TOOL_NAMES; }

    /** The tools this agent has here, with their schemas. */
    docs() {
        const t = this.wa.tools || {};
        const out = [];
        const them = this.channel === 'call' ? 'the caller' : 'this person';

        if (this.channel === 'call' && t.messages) {
            out.push({
                name: 'whatsapp_send_message',
                description:
                    'Send the caller a WhatsApp message from the business, during this call: details they asked for, an address, a link, a summary. ' +
                    'It goes to the number they are calling from. Only works if they have messaged this business on WhatsApp in the last 24 hours; ' +
                    'if not, use whatsapp_send_template. Tell the caller you are sending it.',
                parameters: { type: 'object', properties: { text: { type: 'string', description: 'The message, plain and short. Up to 1000 characters.' } }, required: ['text'] },
            });
        }

        if (t.templates && this.templates.length) {
            const lines = this.templates.map((x) => `- ${x.name}: "${x.bodyText.slice(0, 200)}" (${x.bodyParamCount} parameter${x.bodyParamCount === 1 ? '' : 's'})`);
            out.push({
                name: 'whatsapp_send_template',
                description:
                    `Send ${them} one of the business's approved WhatsApp templates, for example a booking confirmation or the details they asked for. Works at any time. ` +
                    'Pass the values for the {{…}} placeholders in order. Templates:\n' + lines.join('\n'),
                parameters: {
                    type: 'object',
                    properties: {
                        template: { type: 'string', enum: this.templates.map((x) => x.name), description: 'Which template' },
                        parameters: { type: 'array', items: { type: 'string' }, description: 'One value per placeholder, in order' },
                    },
                    required: ['template'],
                },
            });
        }

        const purposes = ['reminder', 'follow_up'].filter((p) => this.purposeTemplate(p));
        if (t.schedule && purposes.length) {
            const lines = purposes.map((p) => {
                const x = this.purposeTemplate(p);
                return `- ${p}: "${x.bodyText.slice(0, 200)}" (${x.bodyParamCount} parameter${x.bodyParamCount === 1 ? '' : 's'})`;
            });
            out.push({
                name: 'whatsapp_schedule_message',
                description:
                    `Schedule a WhatsApp ${purposes.join(' or ').replace('_', '-')} to ${them} at a later time, up to ${MAX_SCHEDULE_DAYS} days ahead. ` +
                    `Use it when they ask to be reminded, or agree to a follow-up. Now is ${new Date().toISOString()} (the business's time zone is ${this.opts.timeZone}). ` +
                    'Templates:\n' + lines.join('\n'),
                parameters: {
                    type: 'object',
                    properties: {
                        send_at: { type: 'string', description: 'When to send, as an ISO 8601 date-time with its UTC offset, e.g. 2026-11-02T09:00:00+05:30' },
                        purpose: { type: 'string', enum: purposes, description: 'Which kind of message' },
                        parameters: { type: 'array', items: { type: 'string' }, description: 'One value per placeholder in that template, in order' },
                    },
                    required: ['send_at', 'purpose'],
                },
            });
        }

        if (this.channel === 'chat' && t.interactive) {
            out.push({
                name: 'whatsapp_send_buttons',
                description:
                    'Offer one to three tappable reply buttons, when the person must pick from a few fixed options (a time slot, yes or no, a product size). ' +
                    'Their tap comes back as their next message. Do not use it for open questions.',
                parameters: {
                    type: 'object',
                    properties: {
                        body: { type: 'string', description: 'The question, up to 1024 characters' },
                        buttons: {
                            type: 'array',
                            items: { type: 'object', properties: { id: { type: 'string', description: 'A short id for the choice' }, title: { type: 'string', description: 'Label, up to 20 characters' } }, required: ['id', 'title'] },
                            description: 'One to three buttons with different titles',
                        },
                        footer: { type: 'string', description: 'Small print under the buttons, up to 60 characters (optional)' },
                    },
                    required: ['body', 'buttons'],
                },
            });
            out.push({
                name: 'whatsapp_send_list',
                description: 'Offer a list of four to ten options the person can pick one from. Their choice comes back as their next message.',
                parameters: {
                    type: 'object',
                    properties: {
                        body: { type: 'string', description: 'The question' },
                        button_text: { type: 'string', description: 'Label of the button that opens the list, up to 20 characters' },
                        sections: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    title: { type: 'string', description: 'Section heading, up to 24 characters' },
                                    rows: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: { id: { type: 'string' }, title: { type: 'string', description: 'Up to 24 characters' }, description: { type: 'string', description: 'Up to 72 characters (optional)' } },
                                            required: ['id', 'title'],
                                        },
                                    },
                                },
                                required: ['title', 'rows'],
                            },
                            description: 'Groups of options; at most 10 options in all',
                        },
                    },
                    required: ['body', 'button_text', 'sections'],
                },
            });
        }

        if (this.channel === 'chat') {
            out.push({
                name: 'end_conversation',
                description: 'Close this WhatsApp conversation when it is finished: the person said goodbye or needs nothing else. Write your closing message as usual; the chat closes after it.',
                parameters: { type: 'object', properties: { reason: { type: 'string', description: 'Short reason' } } },
            });
        }
        return out;
    }

    has(name) {
        return this.docs().some((d) => d.name === name);
    }

    async contactForSend() {
        if (this.contact) return this.contact;
        // A caller who has never written on WhatsApp gets a contact on first send.
        const c = await WhatsAppContact.findOneAndUpdate(
            { accountId: this.account._id, waId: this.recipient },
            { $setOnInsert: { createdBy: this.account.createdBy, accountId: this.account._id, waId: this.recipient } },
            { upsert: true, returnDocument: 'after' },
        ).lean();
        this.contact = c;
        return c;
    }

    async send(payload) {
        const cap = Math.max(1, Math.min(10, Number(this.wa.maxSendsPerCall) || 3));
        if (this.sends >= cap) {
            return { ok: false, error: 'send cap', output: `No more WhatsApp messages can be sent ${this.channel === 'call' ? 'on this call' : 'right now'}. Carry on without it.` };
        }
        const contact = await this.contactForSend();
        const r = await sendOutbound(this.account, contact, payload, {
            origin: this.channel === 'chat' ? 'chat' : 'agent_tool',
            conversationId: this.opts.conversationId || null,
            callSid: this.opts.callSid || null,
            allowMarketing: Boolean(this.wa.allowMarketing),
        });
        if (!r.ok) return { ok: false, error: r.code, output: `Not sent: ${r.reason} Tell them briefly and carry on.` };
        this.sends += 1;
        return { ok: true, error: null, output: 'Sent on WhatsApp.' };
    }

    /** Run one tool. Never throws; always returns text for the model. */
    async run(name, raw) {
        const args = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        try {
            switch (name) {
                case 'whatsapp_send_message': {
                    const text = str(args.text, 1000);
                    if (!text) return { ok: false, error: 'empty', output: 'Say what to send.' };
                    const c = await this.contactForSend();
                    if (!windowOpen(c)) {
                        return { ok: false, error: 'window_closed', output: 'This person has not written to the business on WhatsApp in the last 24 hours, so only a template can be sent. Use whatsapp_send_template if one fits.' };
                    }
                    return this.send({ kind: 'text', text });
                }
                case 'whatsapp_send_template': {
                    const t = this.templates.find((x) => x.name === str(args.template, 512));
                    if (!t) return { ok: false, error: 'unknown template', output: 'That template is not available. Pick one from the list.' };
                    const params = Array.isArray(args.parameters) ? args.parameters.map((p) => str(p, 1024)) : [];
                    if (params.length !== t.bodyParamCount) {
                        return { ok: false, error: 'params', output: `${t.name} needs exactly ${t.bodyParamCount} value${t.bodyParamCount === 1 ? '' : 's'}: "${t.bodyText.slice(0, 200)}". Try again.` };
                    }
                    return this.send({ kind: 'template', name: t.name, language: t.language, parameters: params });
                }
                case 'whatsapp_schedule_message': return this.schedule(args);
                case 'whatsapp_send_buttons': {
                    const body = str(args.body, 1024);
                    const buttons = (Array.isArray(args.buttons) ? args.buttons : []).map((b, i) => ({
                        id: str(b && b.id, 256) || `opt_${i + 1}`,
                        title: str(b && b.title, 1000),
                    }));
                    if (!body || buttons.length < 1 || buttons.length > 3) return { ok: false, error: 'shape', output: 'Send a question and one to three buttons.' };
                    if (buttons.some((b) => !b.title || b.title.length > 20)) return { ok: false, error: 'title', output: 'Every button title must be 1 to 20 characters. Shorten them and try again.' };
                    if (new Set(buttons.map((b) => b.title)).size !== buttons.length) return { ok: false, error: 'dupes', output: 'Button titles must all be different.' };
                    return this.send({ kind: 'buttons', body, buttons, footer: str(args.footer, 60) || null });
                }
                case 'whatsapp_send_list': {
                    const body = str(args.body, 4096);
                    const buttonText = str(args.button_text, 1000);
                    const sections = (Array.isArray(args.sections) ? args.sections : []).slice(0, 10).map((s) => {
                        const sec = s || {};
                        return {
                            title: str(sec.title, 1000),
                            rows: (Array.isArray(sec.rows) ? sec.rows : []).map((r, i) => {
                                const row = r || {};
                                return { id: str(row.id, 200) || `row_${i + 1}`, title: str(row.title, 1000), description: str(row.description, 1000) || null };
                            }),
                        };
                    });
                    const rows = sections.flatMap((s) => s.rows);
                    if (!body || !buttonText || buttonText.length > 20) return { ok: false, error: 'shape', output: 'Send a question and a button label of up to 20 characters.' };
                    if (rows.length < 1 || rows.length > 10) return { ok: false, error: 'rows', output: 'A list holds 1 to 10 options in all.' };
                    if (sections.some((s) => !s.title || s.title.length > 24)) return { ok: false, error: 'section', output: 'Every section needs a title of up to 24 characters.' };
                    if (rows.some((r) => !r.title || r.title.length > 24 || ((r.description && r.description.length) || 0) > 72)) {
                        return { ok: false, error: 'row', output: 'Option titles are up to 24 characters and descriptions up to 72. Shorten them and try again.' };
                    }
                    return this.send({ kind: 'list', body, buttonText, sections });
                }
                case 'end_conversation':
                    this.ended = true;
                    return { ok: true, error: null, output: 'The conversation will close after your reply. Write your short closing message now.' };
                default:
                    return { ok: false, error: 'unknown', output: `There is no tool called ${name}.` };
            }
        } catch (err) {
            const msg = String(err.message || err).slice(0, 300);
            console.error(`[whatsapp] tool ${name} failed:`, msg);
            return { ok: false, error: msg, output: 'WhatsApp could not be reached just now. Tell them briefly and carry on.' };
        }
    }

    async schedule(args) {
        const purpose = str(args.purpose, 20);
        const t = this.purposeTemplate(purpose);
        if (!t) return { ok: false, error: 'purpose', output: 'That kind of message is not set up for this agent.' };
        const at = new Date(str(args.send_at, 64));
        const now = Date.now();
        if (Number.isNaN(at.getTime())) return { ok: false, error: 'time', output: 'Give send_at as an ISO date-time with its offset.' };
        if (at.getTime() < now + 60_000) return { ok: false, error: 'past', output: 'That time has passed. Pick a time in the future.' };
        if (at.getTime() > now + MAX_SCHEDULE_DAYS * 86400_000) return { ok: false, error: 'far', output: `Messages can be scheduled up to ${MAX_SCHEDULE_DAYS} days ahead.` };
        const params = Array.isArray(args.parameters) ? args.parameters.map((p) => str(p, 1024)) : [];
        if (params.length !== t.bodyParamCount) {
            return { ok: false, error: 'params', output: `That template needs exactly ${t.bodyParamCount} value${t.bodyParamCount === 1 ? '' : 's'}: "${t.bodyText.slice(0, 200)}". Try again.` };
        }
        const pending = await ScheduledWhatsAppMessage.countDocuments({
            accountId: this.account._id,
            status: 'pending',
            ...(this.opts.callSid ? { 'source.callSid': this.opts.callSid } : { 'source.conversationId': this.opts.conversationId }),
        });
        if (pending >= 3) return { ok: false, error: 'cap', output: 'Three messages are already scheduled from this conversation. No more can be added.' };
        const contact = await this.contactForSend();
        await ScheduledWhatsAppMessage.create({
            createdBy: this.account.createdBy,
            accountId: this.account._id,
            contactId: contact._id,
            agentId: this.agent._id || null,
            purpose,
            sendAt: at,
            payload: { template: { name: t.name, language: t.language, parameters: params } },
            source: { callSid: this.opts.callSid || null, conversationId: this.opts.conversationId || null },
        });
        return { ok: true, error: null, output: `Scheduled for ${at.toISOString()}. Tell them when it will arrive, in their own time.` };
    }

    static render(t, params) { return renderTemplate(t, params); }
}

/**
 * The toolkit for this agent here, or null when it has none: no tool turned
 * on, no connected number, or (on a call) no caller number to send to.
 * @param {object} agent
 * @param {string} userId
 * @param {{channel: 'call', phone: string | null, callSid?: string | null, leadId?: unknown} | {channel: 'chat', accountId: unknown, contactId: unknown, conversationId: unknown}} ctx
 */
async function buildWhatsAppToolkit(agent, userId, ctx) {
    const wa = agent && agent.whatsapp;
    const chat = ctx.channel === 'chat';
    if (!chat && !wantsWhatsAppTools(agent)) return null;

    let account;
    let contact = null;
    let recipient;
    if (chat) {
        account = await WhatsAppAccount.findOne({ _id: ctx.accountId, createdBy: userId }).lean();
        contact = await WhatsAppContact.findOne({ _id: ctx.contactId, accountId: ctx.accountId }).lean();
        if (!contact) return null;
        recipient = contact.waId;
    } else {
        if (!wa || !wa.accountId) return null;
        recipient = String(ctx.phone ?? '').replace(/\D/g, '');
        if (recipient.length < 8) return null;
        account = await WhatsAppAccount.findOne({ _id: wa.accountId, createdBy: userId, status: 'connected' }).lean();
        if (account) contact = await WhatsAppContact.findOne({ accountId: account._id, waId: recipient }).lean();
    }
    if (!account || account.status !== 'connected') return null;

    const allowed = new Set([
        ...((wa && wa.allowedTemplates) || []),
        ...Object.values((wa && wa.templates) || {}).map((t) => t && t.name).filter(Boolean),
    ]);
    const templates = allowed.size
        ? (await WhatsAppTemplate.find({ accountId: account._id, name: { $in: [...allowed] }, status: 'APPROVED' }).lean())
            .filter((t) => (wa && wa.allowMarketing) || String(t.category).toUpperCase() !== 'MARKETING')
            .slice(0, MAX_TEMPLATES)
        : [];
    const settings = await Settings.findOne({ userId }).select('timeZone').lean().catch(() => null);

    const kit = new WhatsAppToolkit(ctx.channel, account, contact, recipient, agent, templates, {
        callSid: ctx.channel === 'call' ? ctx.callSid || null : null,
        conversationId: ctx.channel === 'chat' ? ctx.conversationId : null,
        timeZone: (settings && settings.timeZone) || 'UTC',
    });
    return kit.docs().length ? kit : null;
}

module.exports = { WHATSAPP_TOOL_NAMES, WhatsAppToolkit, wantsWhatsAppTools, buildWhatsAppToolkit };
