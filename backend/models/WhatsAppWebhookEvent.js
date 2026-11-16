const mongoose = require('mongoose');

/**
 * A verified webhook body from Meta, kept until it has been processed.
 *
 * Meta wants a 200 within seconds and retries for days otherwise, so the
 * receiver saves the body, answers, and processes it next. A restart in between
 * loses nothing: the boot sweep picks up rows still `received`. Rows expire
 * after a week either way.
 */
const whatsappWebhookEventSchema = new mongoose.Schema({
    /** The manual account's hook the event arrived on; null for the platform's own Meta app. */
    hookId: { type: String, default: null },
    body: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['received', 'processing', 'processed', 'failed'], default: 'received' },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
    receivedAt: { type: Date, default: Date.now },
}, { timestamps: false, minimize: false });

whatsappWebhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 7 * 86400 });
whatsappWebhookEventSchema.index({ status: 1, receivedAt: 1 });

module.exports = mongoose.models.WhatsAppWebhookEvent || mongoose.model('WhatsAppWebhookEvent', whatsappWebhookEventSchema);
