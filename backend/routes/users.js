const express = require('express');
const joi = require('joi');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Agent = require('../models/Agent');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', async (req, res) => {
    const schema = joi.object({
        name: joi.string().min(2).max(50).required(),
        email: joi.string().email().required(),
        password: joi.string().min(8).required(),
        role: joi.string().valid('admin', 'user').default('user')
    });

    try {
        const data = await schema.validateAsync(req.body);

        // Check if user exists
        let user = await User.findOne({ email: data.email });
        if (user) {
            return res.status(400).json({
                status: 'error',
                message: 'User already exists'
            });
        }

        const hashedPassword = await bcrypt.hash(data.password, 12);

        const userCount = await User.countDocuments();
        const role = userCount === 0 ? 'admin' : 'user';
        const isSuperAdmin = userCount === 0;

        user = new User({
            name: data.name,
            email: data.email,
            password: hashedPassword,
            role: role,
            isSuperAdmin: isSuperAdmin
        });

        await user.save();

        // Create default settings for new user
        const Settings = require('../models/Settings');
        const defaultSettings = new Settings({ userId: user._id });
        await defaultSettings.save();

        const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);

        res.status(201).json({
            status: 'success',
            token,
            data: { user }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

router.post('/login', async (req, res) => {
    const schema = joi.object({
        email: joi.string().email().required(),
        password: joi.string().required()
    });

    try {
        const data = await schema.validateAsync(req.body);

        const user = await User.findOne({ email: data.email }).select('+password').populate('plan');
        if (!user || !(await bcrypt.compare(data.password, user.password))) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid email or password'
            });
        }

        if (user.isActive === false) {
            return res.status(401).json({
                status: 'error',
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);

        user.password = undefined;

        res.status(200).json({
            status: 'success',
            token,
            data: { user }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

router.get('/', auth, requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password')
            .populate('sharedAgents', 'name')
            .populate('sharedCampaigns', 'name');

        res.status(200).json({
            status: 'success',
            data: { users }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password').populate('plan');
        res.status(200).json({
            status: 'success',
            data: { user }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

router.patch('/:id', auth, requireAdmin, async (req, res) => {
    const schema = joi.object({
        role: joi.string().valid('admin', 'user'),
        sharedTags: joi.array().items(joi.string()),
        sharedAgents: joi.array().items(joi.string()),
        sharedCampaigns: joi.array().items(joi.string())
    });

    try {
        const data = await schema.validateAsync(req.body);

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: data },
            { returnDocument: 'after', runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: { user }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

const AdminSettings = require('../models/AdminSettings');

// GET current plan usage
router.get('/usage', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('plan');
        const userId = user._id;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        let limits;
        const settings = await AdminSettings.findOne() || await AdminSettings.create({});
        if (!user.plan) {
            limits = settings.trialLimits;
        } else {
            limits = user.plan.limits;
        }

        const [agents, campaigns, leads, calls] = await Promise.all([
            Agent.countDocuments({ createdBy: userId }),
            Campaign.countDocuments({ createdBy: userId }),
            Lead.countDocuments({ createdBy: userId }),
            CallLog.countDocuments({
                userId: userId,
                createdAt: { $gte: startOfMonth }
            })
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                limits: limits,
                usage: {
                    agents,
                    campaigns,
                    leads,
                    calls
                },
                isTrial: !user.plan
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ── Personal API key (n8n / external automation) ──

// GET /api/users/api-key — status only, never the key itself
router.get('/api-key', auth, async (req, res) => {
    try {
        res.status(200).json({
            status: 'success',
            data: {
                hasKey: !!req.user.apiKeyPrefix,
                prefix: req.user.apiKeyPrefix || '',
                createdAt: req.user.apiKeyCreatedAt || null,
                lastUsedAt: req.user.apiKeyLastUsedAt || null
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/users/api-key — generate (replaces any existing key).
// The plaintext key is returned ONCE here; only its hash is stored.
router.post('/api-key', auth, async (req, res) => {
    try {
        const crypto = require('crypto');
        const apiKey = `ic_${crypto.randomBytes(24).toString('hex')}`;
        const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const apiKeyPrefix = apiKey.slice(0, 11);
        const apiKeyCreatedAt = new Date();

        await User.updateOne(
            { _id: req.user._id },
            { $set: { apiKeyHash, apiKeyPrefix, apiKeyCreatedAt, apiKeyLastUsedAt: null } }
        );

        res.status(200).json({
            status: 'success',
            message: 'API key generated',
            data: { apiKey, prefix: apiKeyPrefix, createdAt: apiKeyCreatedAt }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// DELETE /api/users/api-key — revoke
router.delete('/api-key', auth, async (req, res) => {
    try {
        await User.updateOne(
            { _id: req.user._id },
            { $unset: { apiKeyHash: '', apiKeyPrefix: '', apiKeyCreatedAt: '', apiKeyLastUsedAt: '' } }
        );
        res.status(200).json({ status: 'success', message: 'API key revoked' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
