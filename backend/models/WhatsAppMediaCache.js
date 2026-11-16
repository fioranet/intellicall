const mongoose = require('mongoose');

/**
 * Meta media ids for files already uploaded from one account, by content hash.
 *
 * Sending a knowledge-base file means uploading it to /{phone_number_id}/media
 * and sending the id Meta returns. Meta keeps an upload for 30 days, so the id
 * is reused for 25 and the row then expires.
 */
const whatsappMediaCacheSchema = new mongoose.Schema({
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true },
    sha256: { type: String, required: true },
    metaMediaId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
}, { timestamps: true });

whatsappMediaCacheSchema.index({ accountId: 1, sha256: 1 }, { unique: true });
whatsappMediaCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.WhatsAppMediaCache || mongoose.model('WhatsAppMediaCache', whatsappMediaCacheSchema);
