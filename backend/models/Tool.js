const mongoose = require('mongoose');

/**
 * An action of the account's own that its agents can take during a call: the
 * agent's arguments go to the account's endpoint (a webhook), and the answer
 * comes back to the agent (services/tools/webhook-runner.js).
 *
 * Header values are utils/encryption ciphertext in plain String fields, because
 * reads are `.lean()`, which skips getters. They are written through
 * utils/credentials.js seal() only.
 *
 * `type` is kept so a second kind (a tool the caller's app runs) can be added
 * later without a migration; today only 'webhook' exists.
 */
const toolSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    type: { type: String, enum: ['webhook'], required: true, default: 'webhook' },
    /** A JSON Schema object, validated by routes/tools.js. */
    parameters: { type: mongoose.Schema.Types.Mixed, default: () => ({ type: 'object', properties: {} }) },
    webhook: {
        url: { type: String, default: null },
        method: { type: String, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', null], default: 'POST' },
        headers: [{
            _id: false,
            name: { type: String, required: true },
            valueEncrypted: { type: String, required: true },
        }],
        timeoutMs: { type: Number, default: 10000 },
    },
    /** The last run from the Test panel, so the list can show it worked. */
    lastTest: {
        ok: { type: Boolean, default: null },
        status: { type: Number, default: null },
        at: { type: Date, default: null },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

// A model calls tools by name, so a name means one tool within an account.
toolSchema.index({ createdBy: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Tool || mongoose.model('Tool', toolSchema);
