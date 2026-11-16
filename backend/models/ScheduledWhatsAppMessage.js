const mongoose = require('mongoose');

/**
 * A WhatsApp message to send later: a reminder, a follow-up after a call, a
 * booking confirmation, or a send the API asked to schedule.
 *
 * Claimed by services/whatsapp/scheduler.js once `sendAt` passes, atomically, so
 * two ticks never send one twice. When the payload is free text and the 24-hour
 * window has closed by then, the account's template for that purpose is used
 * instead, or the send fails with a reason.
 */
const scheduledWhatsAppMessageSchema = new mongoose.Schema({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppContact', required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
    purpose: { type: String, enum: ['reminder', 'follow_up', 'booking_confirmation', 'api'], required: true },
    sendAt: { type: Date, required: true },
    payload: {
        text: { type: String, default: null },
        template: {
            name: { type: String, default: null },
            language: { type: String, default: null },
            parameters: { type: [String], default: [] },
        },
    },
    status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'canceled'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    claimedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppMessage', default: null },
    source: {
        callSid: { type: String, default: null },
        conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppConversation', default: null },
        appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    },
}, { timestamps: true, minimize: false });

scheduledWhatsAppMessageSchema.index({ status: 1, sendAt: 1 });
scheduledWhatsAppMessageSchema.index({ 'source.appointmentId': 1 }, { sparse: true });

module.exports = mongoose.models.ScheduledWhatsAppMessage
    || mongoose.model('ScheduledWhatsAppMessage', scheduledWhatsAppMessageSchema);
