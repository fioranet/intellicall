/**
 * Connecting, refreshing and disconnecting WhatsApp numbers, and keeping their
 * templates in step with WhatsApp Manager.
 *
 * Embedded Signup (the platform's Meta app as Tech Provider), in Meta's order:
 * exchange the code within its 30 seconds, subscribe the app to the WABA's
 * webhooks, register the number with a fresh two-step PIN (skipped for a number
 * that stays on the WhatsApp Business app), read the number, save, sync
 * templates. The exchanged token lasts 60 days, so with a system user token
 * configured the WABA is also assigned to the platform's permanent system user
 * and the number sends with that from then on.
 *
 * Manual: the user's own token and IDs are checked against Meta, the app is
 * subscribed with that token, and the account gets its own webhook path and
 * verify token, shown once.
 *
 * A number belongs to one account. Connecting it again from the same owner
 * refreshes the row; from anyone else it is refused.
 */
const crypto = require('crypto');
const graph = require('./graph');
const { tokenOf } = require('./send');
const { metaConfig, embeddedSignupConfig } = require('./config');
const { removeAccountMedia } = require('./media');
const { seal } = require('../../utils/credentials');
const { externalOrigin } = require('../../utils/public-url');

const WhatsAppAccount = require('../../models/WhatsAppAccount');
const WhatsAppTemplate = require('../../models/WhatsAppTemplate');
const ScheduledWhatsAppMessage = require('../../models/ScheduledWhatsAppMessage');
const WhatsAppConversation = require('../../models/WhatsAppConversation');
const WhatsAppMessage = require('../../models/WhatsAppMessage');
const WhatsAppContact = require('../../models/WhatsAppContact');
const WhatsAppMediaCache = require('../../models/WhatsAppMediaCache');
const Agent = require('../../models/Agent');

class AccountError extends Error {
    constructor(status, code, message, param) {
        super(message);
        this.status = status;
        this.code = code;
        this.param = param;
    }
}

/** The public base URL webhooks are given. */
function webhookBase(req) {
    return externalOrigin(req);
}

function webhookUrlFor(account, req) {
    return account.tokenSource === 'manual' && account.hookId
        ? `${webhookBase(req)}/api/webhooks/whatsapp/a/${account.hookId}`
        : `${webhookBase(req)}/api/webhooks/whatsapp`;
}

function fromGraph(err, param) {
    const info = graph.describeGraphError(err);
    return new AccountError(400, 'whatsapp_rejected', info.message, param);
}

/** How long the business token from Embedded Signup lasts (Meta's template). */
const SIGNUP_TOKEN_DAYS = 60;

let partnerIdLookup = null;

/** The platform's system user id: configured, else asked of Meta once. */
async function partnerUserId(token) {
    const { systemUserId } = await metaConfig();
    if (systemUserId) return systemUserId;
    partnerIdLookup ??= graph.tokenOwnerId(token).catch((err) => { partnerIdLookup = null; throw err; });
    return partnerIdLookup;
}

/**
 * Give the platform's permanent system user the WABA, so the number stops
 * depending on the 60-day signup token. False when the system user is not
 * configured or Meta refuses; the caller keeps the signup token then.
 */
async function adoptWaba(wabaId) {
    const { systemUserToken } = await metaConfig();
    if (!systemUserToken) return false;
    try {
        await graph.assignWabaUser(systemUserToken, wabaId, await partnerUserId(systemUserToken));
        return true;
    } catch (err) {
        console.warn(`[whatsapp] system user not assigned to WABA ${wabaId}:`, graph.describeGraphError(err).message);
        return false;
    }
}

async function signupTokenFields(wabaId, signupToken, now = Date.now()) {
    return await adoptWaba(wabaId)
        ? { tokenKind: 'partner', tokenEncrypted: null, tokenExpiresAt: null }
        : { tokenKind: 'business', tokenEncrypted: seal(signupToken), tokenExpiresAt: new Date(now + SIGNUP_TOKEN_DAYS * 86_400_000) };
}

async function assertNumberFree(userId, phoneNumberId) {
    const existing = await WhatsAppAccount.findOne({ phoneNumberId }).lean();
    if (existing && String(existing.createdBy) !== String(userId)) {
        throw new AccountError(409, 'number_in_use', 'This WhatsApp number is already connected to another account on this platform.', 'phoneNumberId');
    }
    return existing;
}

/** Whether a manual connection's app secret is the platform's own app's, compared in constant time. */
async function isPlatformAppSecret(appSecret) {
    const { appSecret: ours } = await metaConfig();
    if (!ours) return false;
    const a = Buffer.from(appSecret);
    const b = Buffer.from(ours);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {unknown} userId
 * @param {{accessToken: string, phoneNumberId: string, wabaId: string, appSecret: string, name?: string | null, inboundAgentId?: unknown}} input
 */
async function connectManual(userId, input) {
    const existing = await assertNumberFree(userId, input.phoneNumberId);
    let info;
    try {
        info = await graph.getPhoneNumberInfo(input.accessToken, input.phoneNumberId);
    } catch (err) {
        throw fromGraph(err, 'accessToken');
    }
    try {
        await graph.subscribeApp(input.accessToken, input.wabaId);
    } catch (err) {
        throw fromGraph(err, 'wabaId');
    }

    // A number in the platform's own Meta app already reaches the shared webhook,
    // so it gets no door of its own and nothing to paste into Meta.
    const ownApp = await isPlatformAppSecret(input.appSecret);
    const verifyToken = ownApp ? null : crypto.randomBytes(24).toString('base64url');
    const hookId = ownApp ? null : (existing && existing.hookId) || crypto.randomBytes(18).toString('base64url');
    const fields = {
        createdBy: userId,
        name: input.name ?? (existing && existing.name) ?? '',
        wabaId: input.wabaId,
        phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: info.displayPhoneNumber,
        verifiedName: info.verifiedName,
        qualityRating: info.qualityRating,
        messagingLimitTier: info.messagingLimitTier,
        nameStatus: info.nameStatus,
        tokenSource: 'manual',
        tokenKind: 'business',
        tokenEncrypted: seal(input.accessToken),
        tokenExpiresAt: null,
        appSecretEncrypted: seal(input.appSecret),
        verifyTokenEncrypted: verifyToken ? seal(verifyToken) : null,
        hookId,
        status: 'connected',
        lastError: null,
        webhookStatus: existing && existing.webhookStatus === 'ok' ? 'ok' : 'pending',
        ...(input.inboundAgentId !== undefined ? { inboundAgentId: input.inboundAgentId } : {}),
    };
    const doc = existing
        ? await WhatsAppAccount.findOneAndUpdate({ _id: existing._id }, { $set: fields }, { returnDocument: 'after' }).lean()
        : (await WhatsAppAccount.create(fields)).toObject();
    await syncTemplates(doc).catch((err) => console.warn('[whatsapp] first template sync failed:', err.message));
    return { account: doc, verifyToken, created: !existing };
}

/**
 * @param {unknown} userId
 * @param {{code: string, wabaId: string, phoneNumberId: string, coexistence?: boolean, inboundAgentId?: unknown}} input
 */
async function connectEmbeddedSignup(userId, input) {
    const cfg = await embeddedSignupConfig();
    const meta = await metaConfig();
    if (!cfg.enabled) throw new AccountError(503, 'embedded_signup_unavailable', 'Connecting with Meta is not set up on this server. Use Connect manually.');
    const existing = await assertNumberFree(userId, input.phoneNumberId);

    let token;
    try {
        token = await graph.exchangeCode(input.code, cfg.appId, meta.appSecret);
    } catch (err) {
        throw new AccountError(400, 'signup_code_rejected', `Meta did not accept the sign-up: ${graph.describeGraphError(err).message} Try connecting again.`, 'code');
    }
    try {
        await graph.subscribeApp(token, input.wabaId);
    } catch (err) {
        throw fromGraph(err, 'wabaId');
    }
    let pin = null;
    if (!input.coexistence) {
        pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        try {
            await graph.registerNumber(token, input.phoneNumberId, pin);
        } catch (err) {
            const info = graph.describeGraphError(err);
            if (!existing) throw new AccountError(400, 'register_failed', `The number could not be registered: ${info.message}`, 'phoneNumberId');
            pin = null;
        }
    }
    let info;
    try {
        info = await graph.getPhoneNumberInfo(token, input.phoneNumberId);
    } catch (err) {
        throw fromGraph(err, 'phoneNumberId');
    }

    const fields = {
        createdBy: userId,
        wabaId: input.wabaId,
        phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: info.displayPhoneNumber,
        verifiedName: info.verifiedName,
        qualityRating: info.qualityRating,
        messagingLimitTier: info.messagingLimitTier,
        nameStatus: info.nameStatus,
        tokenSource: 'embedded_signup',
        ...(await signupTokenFields(input.wabaId, token)),
        appSecretEncrypted: null,
        verifyTokenEncrypted: null,
        hookId: null,
        ...(pin ? { pinEncrypted: seal(pin) } : {}),
        coexistence: Boolean(input.coexistence),
        status: 'connected',
        lastError: null,
        ...(input.inboundAgentId !== undefined ? { inboundAgentId: input.inboundAgentId } : {}),
    };
    const doc = existing
        ? await WhatsAppAccount.findOneAndUpdate({ _id: existing._id }, { $set: fields }, { returnDocument: 'after' }).lean()
        : (await WhatsAppAccount.create(fields)).toObject();
    await syncTemplates(doc).catch((err) => console.warn('[whatsapp] first template sync failed:', err.message));
    return { account: doc, created: !existing };
}

/** Re-read the number from Meta, and subscribe the app again in case it was dropped. */
async function refreshAccount(account) {
    const checked = { healthCheckedAt: new Date() };
    let token;
    try {
        token = await tokenOf(account);
    } catch (err) {
        return WhatsAppAccount.findOneAndUpdate({ _id: account._id }, { $set: { ...checked, status: 'error', lastError: err.message } }, { returnDocument: 'after' }).lean();
    }
    try {
        const info = await graph.getPhoneNumberInfo(token, account.phoneNumberId);
        await graph.subscribeApp(token, account.wabaId).catch(() => undefined);
        return WhatsAppAccount.findOneAndUpdate({ _id: account._id }, {
            $set: { ...info, ...checked, status: 'connected', lastError: null },
        }, { returnDocument: 'after' }).lean();
    } catch (err) {
        const info = graph.describeGraphError(err);
        // 190: token expired or revoked. 10 and 200: access to the number was taken away.
        const status = info.code === 190 || info.code === 10 || info.code === 200 ? 'error' : account.status;
        return WhatsAppAccount.findOneAndUpdate({ _id: account._id }, { $set: { ...checked, status, lastError: info.message } }, { returnDocument: 'after' }).lean();
    }
}

/** Tell the owner, by email, that a number stopped working. At most once a day per number. */
async function notifyDisconnected(account) {
    const dayAgo = new Date(Date.now() - 86_400_000);
    const claimed = await WhatsAppAccount.updateOne(
        { _id: account._id, $or: [{ disconnectAlertedAt: null }, { disconnectAlertedAt: { $lt: dayAgo } }] },
        { $set: { disconnectAlertedAt: new Date() } },
    );
    if (claimed.modifiedCount !== 1) return;
    try {
        const EmailService = require('../email-service');
        await EmailService.trigger(String(account.createdBy), 'whatsappDisconnected', {
            number: account.displayPhoneNumber || account.verifiedName || '',
            reason: account.lastError || 'The number no longer answers.',
        });
    } catch (err) {
        console.warn('[whatsapp] disconnect alert not sent:', err.message);
    }
}

const HEALTH_EVERY_MS = 24 * 3_600_000;
const HEALTH_BATCH = 100;

/**
 * Once a day per number: move Embedded Signup numbers still on their 60-day
 * token onto the system user, then ask Meta whether each number still answers.
 * A number that stops working is marked and its owner told once.
 */
async function checkAccountHealth(now = new Date()) {
    const due = await WhatsAppAccount.find({
        status: { $in: ['connected', 'error'] },
        $or: [{ healthCheckedAt: null }, { healthCheckedAt: { $lt: new Date(now.getTime() - HEALTH_EVERY_MS) } }],
    }).sort({ healthCheckedAt: 1 }).limit(HEALTH_BATCH).lean();
    let adopted = 0;
    let lost = 0;
    for (const account of due) {
        let current = account;
        if (account.tokenSource === 'embedded_signup' && account.tokenKind !== 'partner' && await adoptWaba(account.wabaId)) {
            current = await WhatsAppAccount.findOneAndUpdate(
                { _id: account._id },
                { $set: { tokenKind: 'partner', tokenEncrypted: null, tokenExpiresAt: null } },
                { returnDocument: 'after' },
            ).lean();
            adopted++;
        }
        const after = await refreshAccount(current);
        if (account.status === 'connected' && after && after.status !== 'connected') {
            lost++;
            await notifyDisconnected(after).catch(() => undefined);
        }
    }
    return { checked: due.length, adopted, lost };
}

/** A template's body text and its placeholders, from Meta's components. */
function bodyOf(components) {
    const body = components.find((c) => String(c.type).toUpperCase() === 'BODY');
    const text = String((body && body.text) ?? '');
    const keys = [...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
    const named = keys.filter((k) => !/^\d+$/.test(k));
    const header = components.find((c) => String(c.type).toUpperCase() === 'HEADER');
    const headerFormat = header && String(header.format ?? '').toUpperCase() !== 'TEXT'
        ? String(header.format ?? '').toUpperCase() || null
        : (header && /\{\{/.test(String(header.text ?? '')) ? 'TEXT' : null);
    return { text, count: keys.length, names: named.length === keys.length ? named : [], headerFormat };
}

/** Copy the WABA's templates. Removed templates are removed here too. */
async function syncTemplates(account) {
    let rows;
    try {
        rows = await graph.listTemplates(await tokenOf(account), account.wabaId);
    } catch (err) {
        throw new AccountError(400, 'whatsapp_rejected', graph.describeGraphError(err).message);
    }
    const now = new Date();
    for (const t of rows) {
        const b = bodyOf(t.components || []);
        await WhatsAppTemplate.updateOne(
            { accountId: account._id, name: t.name, language: t.language },
            {
                $set: {
                    createdBy: account.createdBy, wabaId: account.wabaId, metaId: t.id, category: t.category, status: t.status,
                    components: t.components || [], bodyText: b.text, bodyParamCount: b.count, bodyParamNames: b.names,
                    headerFormat: b.headerFormat, syncedAt: now,
                },
            },
            { upsert: true },
        );
    }
    await WhatsAppTemplate.deleteMany({ accountId: account._id, syncedAt: { $lt: now } });
    return rows.length;
}

/** Submit a new template to Meta for review and keep it here at once, PENDING. */
async function createTemplate(account, draft) {
    if (await WhatsAppTemplate.exists({ accountId: account._id, name: draft.name, language: draft.language })) {
        throw new AccountError(409, 'template_exists', `This number already has a ${draft.language} template called ${draft.name}.`, 'name');
    }
    let made;
    try {
        made = await graph.createTemplate(await tokenOf(account), account.wabaId, draft);
    } catch (err) {
        throw fromGraph(err, 'body');
    }
    const components = graph.templateComponents(draft);
    const b = bodyOf(components);
    return WhatsAppTemplate.findOneAndUpdate(
        { accountId: account._id, name: draft.name, language: draft.language },
        {
            $set: {
                createdBy: account.createdBy, wabaId: account.wabaId, metaId: made.id, category: made.category, status: made.status,
                components, bodyText: b.text, bodyParamCount: b.count, bodyParamNames: b.names, headerFormat: b.headerFormat, syncedAt: new Date(),
            },
        },
        { upsert: true, returnDocument: 'after' },
    ).lean();
}

/** Delete one template from Meta and from here. Agents that name it simply stop finding it. */
async function deleteTemplate(account, template) {
    try {
        await graph.deleteTemplate(await tokenOf(account), account.wabaId, template.name, template.metaId);
    } catch (err) {
        const info = graph.describeGraphError(err);
        // Already gone from WhatsApp Manager: remove our copy too.
        if (info.code !== 100) throw new AccountError(400, 'whatsapp_rejected', info.message);
    }
    await WhatsAppTemplate.deleteOne({ _id: template._id });
}

/**
 * Stop using a number: unsubscribe from its webhooks, clear the agents that send
 * from it, and delete what was kept for it (chats, contacts, scheduled sends,
 * templates, stored media). The number itself, and its chats on people's
 * phones, stay with the business in WhatsApp Manager.
 */
async function disconnectAccount(account) {
    await tokenOf(account).then((token) => graph.unsubscribeApp(token, account.wabaId)).catch((err) => {
        console.warn('[whatsapp] unsubscribe failed (continuing):', graph.describeGraphError(err).message);
    });
    const id = account._id;
    await Promise.all([
        Agent.updateMany({ 'whatsapp.accountId': id, createdBy: account.createdBy }, { $set: { 'whatsapp.accountId': null } }),
        ScheduledWhatsAppMessage.deleteMany({ accountId: id }),
        WhatsAppConversation.deleteMany({ accountId: id }),
        WhatsAppMessage.deleteMany({ accountId: id }),
        WhatsAppContact.deleteMany({ accountId: id }),
        WhatsAppTemplate.deleteMany({ accountId: id }),
        WhatsAppMediaCache.deleteMany({ accountId: id }),
    ]);
    await removeAccountMedia(id).catch((err) => console.warn('[whatsapp] stored media not removed:', err.message));
    await WhatsAppAccount.deleteOne({ _id: id });
}

module.exports = {
    AccountError, webhookBase, webhookUrlFor, adoptWaba, connectManual, connectEmbeddedSignup, refreshAccount,
    notifyDisconnected, checkAccountHealth, bodyOf, syncTemplates, createTemplate, deleteTemplate, disconnectAccount,
};
