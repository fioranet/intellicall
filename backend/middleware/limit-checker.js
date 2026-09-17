const Agent = require('../models/Agent');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

const AdminSettings = require('../models/AdminSettings');

const checkLimit = (type) => async (req, res, next) => {
    try {
        // If superadmin, bypass limits
        if (req.user.isSuperAdmin) return next();

        const user = await req.user.populate('plan');
        let limits;

        let settings;

        if (!user.plan) {
            // Fallback to trial limits from AdminSettings
            settings = await AdminSettings.findOne() || await AdminSettings.create({});
            limits = settings.trialLimits;
        } else {
            limits = user.plan.limits;
        }

        const userId = user._id;

        if (type === 'agents') {
            if (limits.agents === null || limits.agents === undefined || limits.agents <= 0 || limits.agents === -1) {
                return next();
            }
            const currentAgents = await Agent.countDocuments({ createdBy: userId });
            if (currentAgents >= limits.agents) {
                return res.status(403).json({
                    status: 'error',
                    message: `You have reached your limit of ${limits.agents} agents. Please upgrade your plan for more.`
                });
            }
        }

        if (type === 'campaigns') {
            if (limits.campaigns === null || limits.campaigns === undefined || limits.campaigns <= 0 || limits.campaigns === -1) {
                return next();
            }
            const currentCampaigns = await Campaign.countDocuments({ createdBy: userId });
            if (currentCampaigns >= limits.campaigns) {
                return res.status(403).json({
                    status: 'error',
                    message: `You have reached your limit of ${limits.campaigns} campaigns. Please upgrade your plan for more.`
                });
            }
        }

        if (type === 'leads') {
            if (limits.leads === null || limits.leads === undefined || limits.leads <= 0 || limits.leads === -1) {
                return next();
            }
            const currentLeads = await Lead.countDocuments({ createdBy: userId });
            if (currentLeads >= limits.leads) {
                return res.status(403).json({
                    status: 'error',
                    message: `You have reached your limit of ${limits.leads} leads. Please upgrade your plan to add more.`
                });
            }
        }

        if (type === 'calls') {
            // Determine allowed calls based purely on per-plan or trial limits
            const allowedCalls = typeof limits.callsPerMonth === 'number' ? limits.callsPerMonth : null;

            // <= 0 or null means unlimited calls for this plan/trial
            if (allowedCalls === null || allowedCalls <= 0) {
                return next();
            }

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const currentCalls = await CallLog.countDocuments({
                userId: userId,
                createdAt: { $gte: startOfMonth }
            });

            if (currentCalls >= allowedCalls) {
                return res.status(403).json({
                    status: 'error',
                    message: `You have reached your monthly call limit of ${allowedCalls} calls. Please upgrade your plan or wait until the next billing cycle.`
                });
            }
        }

        next();
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

module.exports = checkLimit;
