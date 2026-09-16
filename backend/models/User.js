const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        minlength: 6,
        select: false
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    },
    isSuperAdmin: {
        type: Boolean,
        default: false
    },
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan'
    },
    planStatus: {
        type: String,
        enum: ['active', 'inactive', 'canceled', 'trialing'],
        default: 'active'
    },
    planExpiry: {
        type: Date
    },
    sharedTags: [{
        type: String
    }],
    sharedAgents: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    }],
    sharedCampaigns: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign'
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    // Personal API key (for n8n / external automation). Only the sha256 hash
    // is stored; the plaintext key is shown once at generation time.
    apiKeyHash: {
        type: String,
        select: false,
        index: true,
        sparse: true
    },
    apiKeyPrefix: {
        type: String,
        default: ''
    },
    apiKeyCreatedAt: {
        type: Date,
        default: null
    },
    apiKeyLastUsedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);

module.exports = User;
