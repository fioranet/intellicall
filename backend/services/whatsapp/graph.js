/**
 * Meta's WhatsApp Cloud API (the Graph API).
 *
 * Every call takes the account's access token explicitly. Nothing here reads a
 * database or decides policy; send.js decides whether a message may be sent,
 * and this file only sends it. Errors keep axios's shape, so describeGraphError
 * can turn Meta's codes into sentences a business owner can act on.
 */
const axios = require('axios');

/** Graph API version. Meta's docs were on v26.0 when this was written. */
function graphVersion() {
    return process.env.META_GRAPH_VERSION || 'v26.0';
}

/** Overridable for tests (META_GRAPH_BASE pointing at a stub). */
function graphBase() {
    return process.env.META_GRAPH_BASE || `https://graph.facebook.com/${graphVersion()}`;
}

const TIMEOUT_MS = 15_000;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** Digits only, country code first: what Meta's `to` and `wa_id` hold. */
function normalizeNumber(input) {
    return String(input ?? '').replace(/\D/g, '');
}

/** Meta's error, in words a business owner can act on. */
function describeGraphError(err) {
    const g = err && err.response && err.response.data && err.response.data.error;
    if (!g) {
        const m = (err && err.message) || 'WhatsApp request failed';
        return { code: null, subcode: null, message: m, raw: m };
    }
    const code = g.code ?? null;
    const sub = g.error_subcode ?? null;
    const raw = g.error_user_msg || g.message || 'WhatsApp request failed';
    const say = (message) => ({ code, subcode: sub, message, raw });

    if (code === 190) return say('The WhatsApp access token is invalid or expired. Connect the number again.');
    if (code === 100 && /phone number/i.test(g.message || '')) return say('Phone number ID not found. Copy it from WhatsApp > API Setup in your Meta app.');
    if (code === 10 || code === 200 || code === 299) return say('The access token is missing WhatsApp permissions (whatsapp_business_messaging and whatsapp_business_management).');
    if (code === 131030 || sub === 131030) return say('This recipient is not on the test number\'s allowed list. Add it under WhatsApp > API Setup in your Meta app.');
    if (code === 131047 || code === 131026) return say('The 24-hour window with this person has closed. Only an approved template can be sent until they message again.');
    if (code === 131042) return say('Meta refused the message because of a payment problem. Add or fix the payment method in WhatsApp Manager.');
    if (code === 131049) return say('Meta did not deliver this marketing message, to protect the person from too many. Try a utility template, or later.');
    if (code === 131056) return say('Too many messages to this person in a short time. Try again in a moment.');
    if (code === 130497) return say('Meta does not allow this business to message people in that country.');
    if (code === 131037) return say('The number\'s display name is not approved yet. Finish it in WhatsApp Manager.');
    if (code === 133010) return say('The number is not registered with the Cloud API yet.');
    if (code === 132001) return say('Template not found. Check its name and language, and that it is approved in WhatsApp Manager.');
    if (code === 132000) return say('The template was sent with the wrong number of parameters.');
    if (code === 132012) return say('A template parameter is in the wrong format.');
    if (code === 132015 || code === 132016) return say('The template is paused or disabled for low quality. Check it in WhatsApp Manager.');
    if (code === 131051) return say('WhatsApp does not support this message type.');
    if (code === 131052 || code === 131053) return say('The media could not be downloaded or uploaded. Check its type and size.');
    if (code === 100) return say(`Meta rejected the request: ${raw}`);
    return say(raw);
}

// ─── Phone numbers and accounts ──────────────────────────────────────────────

async function getPhoneNumberInfo(token, phoneNumberId) {
    const { data } = await axios.get(`${graphBase()}/${encodeURIComponent(phoneNumberId)}`, {
        params: { fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status' },
        headers: auth(token),
        timeout: TIMEOUT_MS,
    });
    return {
        displayPhoneNumber: data.display_phone_number || '',
        verifiedName: data.verified_name || '',
        qualityRating: data.quality_rating || 'UNKNOWN',
        messagingLimitTier: data.messaging_limit_tier || null,
        nameStatus: data.name_status || null,
    };
}

/** Exchange Embedded Signup's code (it lives 30 seconds) for the business token. */
async function exchangeCode(code, appId, appSecret) {
    const { data } = await axios.get(`${graphBase()}/oauth/access_token`, {
        params: { client_id: appId, client_secret: appSecret, code },
        timeout: TIMEOUT_MS,
    });
    const token = typeof data === 'string' ? data : data && data.access_token;
    if (!token) throw new Error('Meta returned no access token for the signup code.');
    return String(token);
}

/** Send this WABA's webhooks to the app that owns the token. */
async function subscribeApp(token, wabaId) {
    await axios.post(`${graphBase()}/${encodeURIComponent(wabaId)}/subscribed_apps`, null, { headers: auth(token), timeout: TIMEOUT_MS });
}

async function unsubscribeApp(token, wabaId) {
    await axios.delete(`${graphBase()}/${encodeURIComponent(wabaId)}/subscribed_apps`, { headers: auth(token), timeout: TIMEOUT_MS });
}

/** Register the number for the Cloud API, setting its two-step verification PIN. */
async function registerNumber(token, phoneNumberId, pin) {
    await axios.post(`${graphBase()}/${encodeURIComponent(phoneNumberId)}/register`, { messaging_product: 'whatsapp', pin }, { headers: auth(token), timeout: TIMEOUT_MS });
}

/** The id of the user or system user a token belongs to. */
async function tokenOwnerId(token) {
    const { data } = await axios.get(`${graphBase()}/me`, { params: { fields: 'id' }, headers: auth(token), timeout: TIMEOUT_MS });
    if (!data || !data.id) throw new Error('Meta did not say whose token this is.');
    return String(data.id);
}

/** Give a user (the platform's system user) full control of a WABA shared with its business. */
async function assignWabaUser(token, wabaId, userId, tasks = ['MANAGE']) {
    await axios.post(`${graphBase()}/${encodeURIComponent(wabaId)}/assigned_users`, null, {
        params: { user: userId, tasks: JSON.stringify(tasks) },
        headers: auth(token),
        timeout: TIMEOUT_MS,
    });
}

// ─── Templates ───────────────────────────────────────────────────────────────

async function listTemplates(token, wabaId) {
    const out = [];
    let url = `${graphBase()}/${encodeURIComponent(wabaId)}/message_templates`;
    let params = { fields: 'id,name,language,category,status,components', limit: 100 };
    for (let page = 0; url && page < 20; page++) {
        const res = await axios.get(url, { params, headers: auth(token), timeout: TIMEOUT_MS });
        out.push(...((res.data && res.data.data) || []));
        url = (res.data && res.data.paging && res.data.paging.next) || null;
        params = undefined; // the next link carries them
    }
    return out;
}

/** Meta's components for a draft: optional text header, body with sample values, optional footer. */
function templateComponents(d) {
    const out = [];
    if (d.header) out.push({ type: 'HEADER', format: 'TEXT', text: d.header });
    out.push({ type: 'BODY', text: d.body, ...(d.examples && d.examples.length ? { example: { body_text: [d.examples] } } : {}) });
    if (d.footer) out.push({ type: 'FOOTER', text: d.footer });
    return out;
}

/** Submit a template for Meta's review. It starts PENDING; the verdict arrives by webhook. */
async function createTemplate(token, wabaId, d) {
    const { data } = await axios.post(`${graphBase()}/${encodeURIComponent(wabaId)}/message_templates`, {
        name: d.name, language: d.language, category: d.category, components: templateComponents(d),
    }, { headers: auth(token), timeout: TIMEOUT_MS });
    return { id: String(data.id), status: String(data.status || 'PENDING'), category: String(data.category || d.category) };
}

/** Delete one template (one language of a name, by its id) from the WABA. */
async function deleteTemplate(token, wabaId, name, metaId) {
    await axios.delete(`${graphBase()}/${encodeURIComponent(wabaId)}/message_templates`, {
        params: { name, ...(metaId ? { hsm_id: metaId } : {}) },
        headers: auth(token),
        timeout: TIMEOUT_MS,
    });
}

// ─── Sending ─────────────────────────────────────────────────────────────────

async function postMessage(token, phoneNumberId, body) {
    const { data } = await axios.post(
        `${graphBase()}/${encodeURIComponent(phoneNumberId)}/messages`,
        { messaging_product: 'whatsapp', recipient_type: 'individual', ...body },
        { headers: { ...auth(token), 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS },
    );
    const wamid = data && data.messages && data.messages[0] && data.messages[0].id;
    if (!wamid) throw new Error('Meta accepted the message but returned no id.');
    return { wamid: String(wamid), waId: (data.contacts && data.contacts[0] && data.contacts[0].wa_id) || null };
}

function sendText(token, phoneNumberId, to, body, contextWamid) {
    return postMessage(token, phoneNumberId, {
        to: normalizeNumber(to),
        type: 'text',
        text: { preview_url: true, body },
        ...(contextWamid ? { context: { message_id: contextWamid } } : {}),
    });
}

function sendTemplate(token, phoneNumberId, to, t) {
    const params = t.parameters || [];
    const template = { name: t.name, language: { code: t.language } };
    if (params.length) {
        template.components = [{
            type: 'body',
            parameters: params.map((text, i) => ({
                type: 'text',
                text: String(text),
                ...(t.paramNames && t.paramNames[i] ? { parameter_name: t.paramNames[i] } : {}),
            })),
        }];
    }
    return postMessage(token, phoneNumberId, { to: normalizeNumber(to), type: 'template', template });
}

/** @param {'image' | 'video' | 'document' | 'audio'} kind */
function sendMedia(token, phoneNumberId, to, kind, mediaId, opts = {}) {
    const media = { id: mediaId };
    if (opts.caption && kind !== 'audio') media.caption = opts.caption.slice(0, 1024);
    if (opts.filename && kind === 'document') media.filename = opts.filename;
    if (kind === 'audio' && opts.voice) media.voice = true;
    return postMessage(token, phoneNumberId, { to: normalizeNumber(to), type: kind, [kind]: media });
}

function sendButtons(token, phoneNumberId, to, b) {
    return postMessage(token, phoneNumberId, {
        to: normalizeNumber(to),
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: b.body },
            ...(b.footer ? { footer: { text: b.footer } } : {}),
            action: { buttons: b.buttons.map((x) => ({ type: 'reply', reply: { id: x.id, title: x.title } })) },
        },
    });
}

function sendList(token, phoneNumberId, to, l) {
    return postMessage(token, phoneNumberId, {
        to: normalizeNumber(to),
        type: 'interactive',
        interactive: {
            type: 'list',
            ...(l.header ? { header: { type: 'text', text: l.header } } : {}),
            body: { text: l.body },
            ...(l.footer ? { footer: { text: l.footer } } : {}),
            action: {
                button: l.buttonText,
                sections: l.sections.map((s) => ({
                    title: s.title,
                    rows: s.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })),
                })),
            },
        },
    });
}

/** Mark an inbound message read and, optionally, show "typing…" for up to 25 seconds. */
async function markRead(token, phoneNumberId, wamid, typing) {
    await axios.post(
        `${graphBase()}/${encodeURIComponent(phoneNumberId)}/messages`,
        { messaging_product: 'whatsapp', status: 'read', message_id: wamid, ...(typing ? { typing_indicator: { type: 'text' } } : {}) },
        { headers: { ...auth(token), 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS },
    );
}

// ─── Media ───────────────────────────────────────────────────────────────────

/** Upload bytes to Meta for this number; returns the media id to send. Meta keeps it 30 days. */
async function uploadMedia(token, phoneNumberId, bytes, mimeType, filename) {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
    const { data } = await axios.post(`${graphBase()}/${encodeURIComponent(phoneNumberId)}/media`, form, {
        headers: auth(token),
        timeout: 60_000,
        maxBodyLength: 110 * 1024 * 1024,
    });
    if (!data || !data.id) throw new Error('Meta accepted the upload but returned no media id.');
    return String(data.id);
}

/** Download a media file someone sent: Graph gives a short-lived URL that also needs the token. */
async function downloadMedia(token, mediaId, maxBytes) {
    const { data: meta } = await axios.get(`${graphBase()}/${encodeURIComponent(mediaId)}`, { headers: auth(token), timeout: TIMEOUT_MS });
    if (!meta || !meta.url) throw new Error('Meta returned no URL for the media.');
    if (Number(meta.file_size) > maxBytes) throw new Error(`The file is larger than ${Math.round(maxBytes / 1048576)} MB.`);
    const res = await axios.get(meta.url, { headers: auth(token), responseType: 'arraybuffer', timeout: 60_000, maxContentLength: maxBytes });
    return { bytes: Buffer.from(res.data), mimeType: String(meta.mime_type || res.headers['content-type'] || 'application/octet-stream') };
}

module.exports = {
    graphVersion, graphBase, normalizeNumber, describeGraphError,
    getPhoneNumberInfo, exchangeCode, subscribeApp, unsubscribeApp, registerNumber, tokenOwnerId, assignWabaUser,
    listTemplates, templateComponents, createTemplate, deleteTemplate,
    sendText, sendTemplate, sendMedia, sendButtons, sendList, markRead, uploadMedia, downloadMedia,
};
