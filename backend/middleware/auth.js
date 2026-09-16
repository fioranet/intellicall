const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');

/** If the user's plan has expired, revert them to trial (plan = null). */
async function revertExpiredPlan(req) {
    try {
        if (req.user.plan && req.user.planExpiry && new Date() > new Date(req.user.planExpiry)) {
            await User.updateOne(
                { _id: req.user._id },
                { $set: { plan: null, planStatus: 'trialing' } }
            );
            req.user.plan = null;
            req.user.planStatus = 'trialing';
        }
    } catch (planErr) {
        console.error('Plan expiry update failed:', planErr.message);
    }
}

const auth = async (req, res, next) => {
    // ── Personal API key path (n8n / external automation) ──
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        try {
            if (mongoose.connection.readyState !== 1) {
                return res.status(503).json({
                    status: 'error',
                    message: 'Database unavailable. Ensure MongoDB is running and MONGODB_URI is correct.'
                });
            }

            if (typeof apiKey !== 'string' || !apiKey.startsWith('ic_')) {
                return res.status(401).json({ status: 'error', message: 'Invalid API key' });
            }

            const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
            const currentUser = await User.findOne({ apiKeyHash });
            if (!currentUser) {
                return res.status(401).json({ status: 'error', message: 'Invalid API key' });
            }

            if (currentUser.isActive === false) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Your account has been deactivated. Please contact support.'
                });
            }

            req.user = currentUser;

            // Stamp last-used without blocking the request
            User.updateOne(
                { _id: currentUser._id },
                { $set: { apiKeyLastUsedAt: new Date() } }
            ).catch(() => { /* non-critical */ });

            await revertExpiredPlan(req);
            return next();
        } catch (err) {
            console.error('API Key Auth Error:', err.message);
            const dbGone =
                err.name === 'MongooseError' ||
                (typeof err.message === 'string' && err.message.includes('buffering timed out'));
            return res.status(dbGone ? 503 : 401).json({
                status: 'error',
                message: dbGone
                    ? 'Database unavailable. Ensure MongoDB is running and MONGODB_URI is correct.'
                    : 'Invalid API key'
            });
        }
    }

    // ── JWT path (dashboard sessions) ──
    let token;

    // Get token from headers or query params
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({
            status: 'error',
            message: 'Authentication required'
        });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                status: 'error',
                message: 'Database unavailable. Ensure MongoDB is running and MONGODB_URI is correct.'
            });
        }

        // Check if user still exists
        const currentUser = await User.findById(decoded._id);
        if (!currentUser) {
            return res.status(401).json({
                status: 'error',
                message: 'User not found'
            });
        }

        if (currentUser.isActive === false) {
            return res.status(401).json({
                status: 'error',
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        // Grant access to protected route
        req.user = currentUser;

        await revertExpiredPlan(req);

        next();
    } catch (err) {
        console.error('Auth Middleware Error:', err.message);
        const dbGone =
            err.name === 'MongooseError' ||
            (typeof err.message === 'string' && err.message.includes('buffering timed out'));
        if (dbGone) {
            return res.status(503).json({
                status: 'error',
                message: 'Database unavailable. Ensure MongoDB is running and MONGODB_URI is correct.'
            });
        }
        return res.status(401).json({
            status: 'error',
            message: err.name === 'JsonWebTokenError' ? 'Invalid token' :
                err.name === 'TokenExpiredError' ? 'Token expired' :
                    'Authentication failed'
        });
    }
};

const isAdmin = async (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.isSuperAdmin)) {
        next();
    } else {
        res.status(403).json({ status: 'error', message: 'Access denied. Admin only.' });
    }
};

const requireActivePlan = async (req, res, next) => {
    if (req.user && req.user.planStatus === 'active') {
        next();
    } else {
        res.status(403).json({
            status: 'error',
            message: 'Please upgrade plan to continue.'
        });
    }
};

module.exports = { auth, requireAdmin: isAdmin, isAdmin, requireActivePlan };
