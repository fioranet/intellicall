const mongoose = require('mongoose');

/**
 * A message template, copied from Meta's /{waba_id}/message_templates.
 *
 * Templates are written and approved in WhatsApp Manager, not here; this is a
 * cache so the console can list them and agent tools can check a template's
 * category and body parameter count before sending. Refreshed by a sync and by
 * Meta's message_template_status_update webhook.
 */
const whatsappTemplateSchema = new mongoose.Schema({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true },
    wabaId: { type: String, required: true },
    metaId: { type: String, default: null },
    name: { type: String, required: true },
    language: { type: String, required: true },
    /** MARKETING, UTILITY or AUTHENTICATION. */
    category: { type: String, default: null },
    /** APPROVED, PENDING, REJECTED, PAUSED, DISABLED… */
    status: { type: String, default: null },
    components: { type: mongoose.Schema.Types.Mixed, default: [] },
    /** The body text, with its {{1}} or {{name}} placeholders. */
    bodyText: { type: String, default: '' },
    /** How many body placeholders the template has. */
    bodyParamCount: { type: Number, default: 0 },
    /** Named placeholders, in order, when the template uses named parameters. */
    bodyParamNames: { type: [String], default: [] },
    /** TEXT, IMAGE, VIDEO, DOCUMENT or LOCATION when the header takes a parameter. */
    headerFormat: { type: String, default: null },
    syncedAt: { type: Date, default: Date.now },
}, { timestamps: true, minimize: false });

whatsappTemplateSchema.index({ accountId: 1, name: 1, language: 1 }, { unique: true });

module.exports = mongoose.models.WhatsAppTemplate || mongoose.model('WhatsAppTemplate', whatsappTemplateSchema);
