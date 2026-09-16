const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    purchaseType: {
        type: String,
        enum: ['plan', 'credits'],
        default: 'plan'
    },
    creditsAmount: {
        type: Number,
        default: 0
    },
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        required: false
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD'
    },
    paymentGateway: {
        type: String,
        required: true,
        enum: ['stripe', 'paypal', 'razorpay', 'dodopayments', 'manual']
    },
    paymentId: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    }
}, {
    timestamps: true
});

const Purchase = mongoose.model('Purchase', purchaseSchema);

module.exports = Purchase;
