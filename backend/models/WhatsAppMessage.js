const mongoose = require('mongoose');

/**
 * One WhatsApp message, in or out, with Meta's delivery status and pricing.
 *
 * `wamid` is Meta's id and is unique, which is how a webhook Meta delivers
 * twice is processed once. An outbound message that Meta refused has no wamid;
 * it is stored with status `failed` and the error.
 *
 */
const whatsappMessageSchema = new mongoose.Schema({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppConversation', default: null },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppContact', required: true },
    wamid: { type: String, default: null },
    direction: { type: String, enum: ['in', 'out'], required: true },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'document', 'sticker', 'template', 'interactive',
            'button', 'reaction', 'location', 'contacts', 'unsupported'],
        required: true,
    },
    text: { type: String, default: '' },
    /** A voice note's transcript, or what an interactive reply chose. */
    transcript: { type: String, default: null },
    /** Whether an inbound audio was a voice note rather than an audio file. */
    voice: { type: Boolean, default: false },
    media: {
        storageKey: { type: String, default: null },
        mimeType: { type: String, default: null },
        bytes: { type: Number, default: null },
        filename: { type: String, default: null },
        metaMediaId: { type: String, default: null },
    },
    template: {
        name: { type: String, default: null },
        language: { type: String, default: null },
        category: { type: String, default: null },
    },
    /** The message this one replies to (a quoted reply, a reaction, a button tap). */
    contextWamid: { type: String, default: null },
    /**
     * Who sent it: the contact; the agent replying in a chat; an agent's tool
     * (often during a phone call); the API; the scheduler; IntelliCall itself (an
     * opt-out confirmation); or a person on the WhatsApp Business app, on a
     * number connected with coexistence.
     */
    origin: { type: String, enum: ['contact', 'chat', 'agent_tool', 'api', 'scheduled', 'system', 'business_app'], required: true },
    /** For an inbound message: when the agent's turn that answered it finished. */
    handledAt: { type: Date, default: null },
    /** The phone call that sent it, when a call's tool did. */
    callSid: { type: String, default: null },
    status: { type: String, enum: ['received', 'accepted', 'sent', 'delivered', 'read', 'failed'], required: true },
    statusAt: {
        sent: { type: Date, default: null },
        delivered: { type: Date, default: null },
        read: { type: Date, default: null },
        failed: { type: Date, default: null },
    },
    error: {
        code: { type: Number, default: null },
        title: { type: String, default: null },
        detail: { type: String, default: null },
    },
    pricing: {
        billable: { type: Boolean, default: null },
        pricingModel: { type: String, default: null },
        category: { type: String, default: null },
        type: { type: String, default: null },
    },
    market: { type: String, default: null },
    /** Meta's list-rate cost for this message, when a status webhook reported pricing. Informational. */
    metaCostMicros: { type: Number, default: 0 },
}, { timestamps: true });

whatsappMessageSchema.index({ wamid: 1 }, { unique: true, partialFilterExpression: { wamid: { $type: 'string' } } });
whatsappMessageSchema.index({ conversationId: 1, createdAt: 1 });
whatsappMessageSchema.index({ accountId: 1, createdAt: -1 });
whatsappMessageSchema.index({ contactId: 1, createdAt: -1 });

// Optional retention. Off unless the env sets a number of days.
const retention = Number(process.env.WHATSAPP_MESSAGE_RETENTION_DAYS);
if (Number.isFinite(retention) && retention > 0) {
    whatsappMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: Math.floor(retention * 86400) });
}

module.exports = mongoose.models.WhatsAppMessage || mongoose.model('WhatsAppMessage', whatsappMessageSchema);
