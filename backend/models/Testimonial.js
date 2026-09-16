const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema({
    quote: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        required: true,
        trim: true
    },
    rating: {
        type: Number,
        default: 5,
        min: 1,
        max: 5
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const Testimonial = mongoose.model('Testimonial', testimonialSchema);

module.exports = Testimonial;
