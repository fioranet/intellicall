const mongoose = require('mongoose');

/**
 * A person who has messaged, or been messaged by, one WhatsApp account.
 *
 * `lastInboundAt` decides the 24-hour customer service window: inside it the
 * business may send anything; outside it only an approved template. Meta is
 * moving to business-scoped user ids (`bsuid`), which can arrive without a
 * phone number, so either identifies the contact.
 */
const whatsappContactSchema = new mongoose.Schema({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true },
    /** Digits only, country code first. Empty when Meta sent only a bsuid. */
    waId: { type: String, default: '' },
    bsuid: { type: String, default: null },
    profileName: { type: String, default: '' },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    lastInboundAt: { type: Date, default: null },
    /** Sent STOP. Nothing but the confirmation is sent after this. */
    optedOut: { type: Boolean, default: false },
    optedOutAt: { type: Date, default: null },
    /** A person answered from the WhatsApp Business app; the agent waits until this time. */
    humanPausedUntil: { type: Date, default: null },
}, { timestamps: true });

whatsappContactSchema.index({ accountId: 1, waId: 1 }, { unique: true, partialFilterExpression: { waId: { $gt: '' } } });
whatsappContactSchema.index({ accountId: 1, bsuid: 1 }, { unique: true, partialFilterExpression: { bsuid: { $type: 'string' } } });

module.exports = mongoose.models.WhatsAppContact || mongoose.model('WhatsAppContact', whatsappContactSchema);
