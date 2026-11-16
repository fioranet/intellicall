const mongoose = require('mongoose');

/**
 * One stretch of chat between a contact and the agent on a WhatsApp number.
 *
 * Opened by an inbound message and closed after the account's inactivity
 * timeout, when the agent calls end_conversation, or when the contact opts out.
 * The next message opens a new one. Kept apart from CallLog: a chat has
 * per-message delivery, per-message pricing and can run for days.
 */
/** The same shape as CallLog.toolCalls, so one renderer reads both. */
const toolCallSchema = new mongoose.Schema({
    type: { type: String, enum: ['integration', 'webhook', 'whatsapp'], default: 'integration' },
    toolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', default: null },
    mcpServerId: { type: mongoose.Schema.Types.ObjectId, ref: 'McpServer', default: null },
    serverName: String,
    tool: String,
    arguments: { type: mongoose.Schema.Types.Mixed, default: null },
    ok: Boolean,
    error: { type: String, default: null },
    durationMs: Number,
    at: Date,
}, { _id: false });

const whatsappConversationSchema = new mongoose.Schema({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAccount', required: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppContact', required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    startedAt: { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    closedReason: { type: String, enum: [null, 'inactivity', 'end_conversation', 'opt_out', 'disconnected'], default: null },
    messageCount: { type: Number, default: 0 },
    /** Meta's list-rate estimate for what it billed the business, in micro-USD. Informational. */
    metaCostMicros: { type: Number, default: 0 },
    toolCalls: { type: [toolCallSchema], default: [] },
    /** When the account's fallback reply (plan limit reached) was last sent in this chat, so it is sent once, not per message. */
    offlineReplyAt: { type: Date, default: null },
}, { timestamps: true });

whatsappConversationSchema.index({ accountId: 1, contactId: 1, status: 1 });
whatsappConversationSchema.index({ createdBy: 1, lastMessageAt: -1 });
whatsappConversationSchema.index({ status: 1, lastMessageAt: 1 });

module.exports = mongoose.models.WhatsAppConversation || mongoose.model('WhatsAppConversation', whatsappConversationSchema);
