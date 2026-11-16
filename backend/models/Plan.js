const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        default: 0
    },
    interval: {
        type: String,
        enum: ['monthly', 'yearly', 'one-time'],
        default: 'monthly'
    },
    limits: {
        agents: { type: Number, default: 1 },
        campaigns: { type: Number, default: 1 },
        leads: { type: Number, default: 100 },
        callsPerMonth: { type: Number, default: 100 },
        /** Webhook tools the account may define. 0 or less is unlimited. */
        tools: { type: Number, default: 10 },
        /** Connected MCP servers (Integrations). 0 or less is unlimited. */
        mcpServers: { type: Number, default: 5 },
        /** WhatsApp numbers connected. 0 or less is unlimited. */
        whatsappAccounts: { type: Number, default: 1 },
        /** WhatsApp messages sent and received per calendar month. 0 or less is unlimited. */
        whatsappMessagesPerMonth: { type: Number, default: 1000 }
    },
    /** Features the plan switches on. Meetings count as calls in callsPerMonth. */
    features: {
        meetings: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    dodoProductId: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;
