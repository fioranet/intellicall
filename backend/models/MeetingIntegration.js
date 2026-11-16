const mongoose = require('mongoose');

/**
 * A customer's own meeting-bot account, which their agents join Zoom, Google
 * Meet and Teams meetings through (meetings/attendee.js).
 *
 * Bring your own key, the way a SIP trunk is bring your own carrier. Attendee
 * (attendee.dev) is under the Elastic License 2.0, which forbids offering it to
 * third parties as a hosted service, so IntelliCall never runs one for customers: the
 * customer either uses Attendee's hosted app (app.attendee.dev), which bills
 * them directly, or runs their own and gives this install its URL.
 *
 * One per account per provider. The key and the optional webhook secret are
 * sealed with the same encryption as MCP header values (utils/credentials.js)
 * and are never returned by any endpoint; `apiKeyLast4` is what the console shows.
 */
const meetingIntegrationSchema = new mongoose.Schema({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['attendee'], required: true, default: 'attendee' },
    /** e.g. https://app.attendee.dev, or the customer's own install. No trailing slash. */
    baseUrl: { type: String, required: true },
    apiKeyEncrypted: { type: String, required: true },
    apiKeyLast4: { type: String, default: '' },
    /**
     * The Attendee project's webhook secret (Settings → Webhooks there), base64 as
     * Attendee shows it. Optional: every bot's webhook URL also carries its own
     * random token. When set, X-Webhook-Signature is checked as well.
     */
    webhookSecretEncrypted: { type: String, default: null },
    /**
     * Signed-in bots: the bot logs into an account before joining, so Meet and
     * Teams show a named account instead of an anonymous guest Meet flags as
     * "appears to be a bot". Needs bot logins set up in the customer's
     * Attendee (Settings > Bot Logins), so it is off until they say so.
     * Zoom signs in with ZAK tokens instead and is not covered.
     */
    signedInBots: {
        googleMeet: { type: Boolean, default: false },
        teams: { type: Boolean, default: false },
        /** Attendee's login group; null uses its oldest group for the platform. */
        loginGroup: { type: String, default: null },
    },
    status: { type: String, enum: ['connected', 'error'], default: 'connected' },
    lastError: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
}, { timestamps: true });

meetingIntegrationSchema.index({ createdBy: 1, provider: 1 }, { unique: true });

module.exports = mongoose.models.MeetingIntegration || mongoose.model('MeetingIntegration', meetingIntegrationSchema);
