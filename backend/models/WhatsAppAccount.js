const mongoose = require('mongoose');

/**
 * A WhatsApp business phone number connected to IntelliCall through Meta's
 * Cloud API. See services/whatsapp/.
 *
 * Two ways in. Embedded Signup (`tokenSource: 'embedded_signup'`) runs in the
 * console as Meta's popup: IntelliCall is the Tech Provider, the code it returns is
 * exchanged for a 60-day business token, which is used once to give IntelliCall's
 * permanent system user the WABA (`tokenKind: 'partner'`), and webhooks reach
 * IntelliCall's own Meta app.
 * Manual (`'manual'`) takes a token, a phone number ID and a WABA ID from the
 * customer's own Meta app, so it also carries that app's secret and a verify
 * token, and its webhooks arrive at their own path, /webhooks/whatsapp/a/:hookId.
 *
 * Every secret is sealed (utils/credentials.js) and never returned by
 * any endpoint, except the verify token once, when a manual account is created.
 *
 * `inboundAgentId` answers the number's chats, like PhoneNumber.inboundAgentId.
 * With none, inbound messages are stored and not answered.
 */
const whatsappAccountSchema = new mongoose.Schema({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, trim: true, default: '' },
    wabaId: { type: String, required: true, trim: true },
    /** Meta's id for the number. One IntelliCall account per number, across all owners. */
    phoneNumberId: { type: String, required: true, trim: true, unique: true },
    displayPhoneNumber: { type: String, default: '' },
    verifiedName: { type: String, default: '' },
    /** GREEN, YELLOW, RED or UNKNOWN, as Meta reports it. */
    qualityRating: { type: String, default: 'UNKNOWN' },
    /** How many people the number may start conversations with per day, e.g. TIER_1K. */
    messagingLimitTier: { type: String, default: null },
    nameStatus: { type: String, default: null },

    tokenSource: { type: String, enum: ['embedded_signup', 'manual'], required: true },
    /**
     * Whose token sends for the number. `business`: the sealed token below
     * (a manual account's own, or the 60-day one Embedded Signup returns).
     * `partner`: IntelliCall's permanent system user, META_SYSTEM_USER_TOKEN, which
     * Embedded Signup assigns to the WABA so the number never expires.
     */
    tokenKind: { type: String, enum: ['business', 'partner'], default: 'business' },
    tokenEncrypted: { type: String, default: null },
    /** When a `business` token from Embedded Signup stops working. Null for one that does not expire. */
    tokenExpiresAt: { type: Date, default: null },
    /** Last daily check that Meta still answers for the number. */
    healthCheckedAt: { type: Date, default: null },
    appSecretEncrypted: { type: String, default: null },
    verifyTokenEncrypted: { type: String, default: null },
    /** The path segment a manual account's webhooks arrive on. Unguessable. */
    hookId: { type: String, default: null },
    /** The two-step verification PIN set when the number was registered. */
    pinEncrypted: { type: String, default: null },
    /** Onboarded from the WhatsApp Business app, which keeps working on the same number. */
    coexistence: { type: Boolean, default: false },

    webhookStatus: { type: String, enum: ['pending', 'ok', 'error'], default: 'pending' },
    lastWebhookAt: { type: Date, default: null },
    status: { type: String, enum: ['connected', 'error', 'disconnected'], default: 'connected' },
    lastError: { type: String, default: null },

    inboundAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
    settings: {
        /** Off leaves the number connected for sending while something else answers it. */
        messagingEnabled: { type: Boolean, default: true },
        /** Answer a voice note with a voice note, in the agent's voice, when its engine can speak one. */
        voiceNoteReplies: { type: Boolean, default: true },
        /** Mark messages read and show "typing…" while the agent works. */
        typingIndicator: { type: Boolean, default: true },
        /** A chat with no message for this long is closed; the next message starts a new one. */
        inactivityMinutes: { type: Number, min: 1, max: 1440, default: 15 },
        /** Sent instead of an AI reply when the plan's monthly WhatsApp message limit is reached. Empty sends nothing. */
        offlineReply: { type: String, default: '', maxlength: 1000 },
        /** After a person replies from the WhatsApp Business app, the agent stays quiet this long. */
        humanPauseMinutes: { type: Number, min: 0, max: 1440, default: 30 },
    },
    /** Phase 2: WhatsApp voice calls over SIP. Nothing reads this yet. */
    calling: {
        enabled: { type: Boolean, default: false },
    },
    /** The last day the owner was told replies were paused (plan limit) or the number lost its connection. */
    lowBalanceAlertedAt: { type: Date, default: null },
    disconnectAlertedAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });

whatsappAccountSchema.index({ hookId: 1 }, { unique: true, partialFilterExpression: { hookId: { $type: 'string' } } });

module.exports = mongoose.models.WhatsAppAccount || mongoose.model('WhatsAppAccount', whatsappAccountSchema);
