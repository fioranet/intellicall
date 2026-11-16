/**
 * One-time: a number connected the old way (Settings → Integrations → WhatsApp,
 * a token and phone number id used for owner alerts and appointment reminders)
 * is shown on the new WhatsApp page too, as a manual account.
 *
 * Only the token and ids are known: no WABA id, no app secret, so webhooks from
 * Meta cannot be verified for it and the agent cannot answer chats until the
 * owner reconnects it with the full set. The card says so. Runs once per
 * account (skipped when a WhatsAppAccount with that phoneNumberId exists).
 */
const Settings = require('../../models/Settings');
const WhatsAppAccount = require('../../models/WhatsAppAccount');
const { seal } = require('../../utils/credentials');

async function migrateLegacyWhatsApp() {
    const rows = await Settings.find({
        whatsappConnected: true,
        whatsappAccessToken: { $nin: ['', null] },
        whatsappPhoneNumberId: { $nin: ['', null] },
    }).select('userId whatsappAccessToken whatsappPhoneNumberId whatsappBusinessNumber whatsappBusinessName').lean();
    let made = 0;
    for (const s of rows) {
        const exists = await WhatsAppAccount.exists({ phoneNumberId: s.whatsappPhoneNumberId });
        if (exists) continue;
        try {
            await WhatsAppAccount.create({
                createdBy: s.userId,
                name: s.whatsappBusinessName || '',
                wabaId: 'unknown',
                phoneNumberId: s.whatsappPhoneNumberId,
                displayPhoneNumber: s.whatsappBusinessNumber || '',
                verifiedName: s.whatsappBusinessName || '',
                tokenSource: 'manual',
                tokenKind: 'business',
                tokenEncrypted: seal(s.whatsappAccessToken),
                status: 'error',
                lastError: 'Connected from the old Settings page. Reconnect it here with your Meta app secret and WhatsApp Business Account ID so the agent can answer its chats.',
                webhookStatus: 'pending',
            });
            made++;
        } catch (err) {
            console.warn(`[whatsapp] legacy number for user ${s.userId} not migrated:`, err.message);
        }
    }
    if (made) console.log(`[WhatsApp] Imported ${made} number(s) from the old Settings page`);
}

module.exports = { migrateLegacyWhatsApp };
