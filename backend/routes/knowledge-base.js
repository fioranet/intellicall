const express = require('express');
const joi = require('joi');
const KnowledgeBase = require('../models/KnowledgeBase');
const Agent = require('../models/Agent');
const Settings = require('../models/Settings');
const { auth } = require('../middleware/auth');
const { buildKbDraftFromUrl, sanitizeOpenRouterApiKey } = require('../services/kb-from-website/build-kb-draft');

const router = express.Router();

// Get all knowledge bases for user
router.get('/', auth, async (req, res) => {
    try {
        const kbs = await KnowledgeBase.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
        res.status(200).json({
            status: 'success',
            results: kbs.length,
            data: { kbs }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// AI draft from public URL (must be before GET /:id)
router.post('/from-website', auth, async (req, res) => {
    const schema = joi.object({
        url: joi.string().uri({ scheme: ['http', 'https'] }).required()
    });
    try {
        const { url } = await schema.validateAsync(req.body);
        const settings = await Settings.findOne({ userId: req.user._id });
        const openRouterKey = sanitizeOpenRouterApiKey(settings.openRouterKey || '');
        if (!openRouterKey) {
            return res.status(503).json({
                status: 'error',
                message: 'Add your OpenRouter API key in Settings to import from a website.'
            });
        }
        const { draft, warnings } = await buildKbDraftFromUrl(url, openRouterKey);
        res.status(200).json({
            status: 'success',
            data: { draft, warnings }
        });
    } catch (err) {
        const status = err.status && typeof err.status === 'number' ? err.status : 400;
        if (err.isJoi) {
            return res.status(400).json({ status: 'error', message: err.message });
        }
        res.status(status >= 400 && status < 600 ? status : 500).json({
            status: 'error',
            message: err.message || 'Import failed'
        });
    }
});

// Get single knowledge base
router.get('/:id', auth, async (req, res) => {
    try {
        const kb = await KnowledgeBase.findOne({ _id: req.params.id, createdBy: req.user._id });
        if (!kb) {
            return res.status(404).json({ status: 'error', message: 'Knowledge Base not found' });
        }
        res.status(200).json({
            status: 'success',
            data: { kb }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Create knowledge base
router.post('/', auth, async (req, res) => {
    const schema = joi.object({
        name: joi.string().required(),
        description: joi.string().allow(''),
        basicInfo: joi.string().allow(''),
        faqs: joi.array().items(joi.object({
            _id: joi.string().allow('', null),
            question: joi.string().required(),
            answer: joi.string().required()
        })).default([]),
        otherInfo: joi.string().allow('')
    });

    try {
        const value = await schema.validateAsync(req.body);
        const kb = new KnowledgeBase({
            ...value,
            createdBy: req.user._id
        });
        await kb.save();

        res.status(201).json({
            status: 'success',
            data: { kb }
        });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

// Update knowledge base
router.patch('/:id', auth, async (req, res) => {
    const schema = joi.object({
        name: joi.string(),
        description: joi.string().allow(''),
        basicInfo: joi.string().allow(''),
        faqs: joi.array().items(joi.object({
            _id: joi.string().allow('', null),
            question: joi.string().required(),
            answer: joi.string().required()
        })),
        otherInfo: joi.string().allow('')
    });

    try {
        const value = await schema.validateAsync(req.body);
        const kb = await KnowledgeBase.findOneAndUpdate(
            { _id: req.params.id, createdBy: req.user._id },
            value,
            { returnDocument: 'after', runValidators: true }
        );

        if (!kb) {
            return res.status(404).json({ status: 'error', message: 'Knowledge Base not found' });
        }

        res.status(200).json({
            status: 'success',
            data: { kb }
        });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

// Delete knowledge base
router.delete('/:id', auth, async (req, res) => {
    try {
        const kb = await KnowledgeBase.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
        if (!kb) {
            return res.status(404).json({ status: 'error', message: 'Knowledge Base not found' });
        }

        // Unassign from agents
        await Agent.updateMany(
            { knowledgeBaseId: req.params.id },
            { $set: { knowledgeBaseId: null } }
        );

        res.status(200).json({
            status: 'success',
            message: 'Knowledge Base deleted and unassigned from agents'
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
