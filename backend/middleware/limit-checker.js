const Agent = require('../models/Agent');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

const AdminSettings = require('../models/AdminSettings');

/** The start of the current calendar month, for per-month counts. */
function startOfMonth() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * The limits and features that apply to this user: their plan's, or the
 * trial values from AdminSettings when they have no plan.
 * @returns {Promise<{limits: Record<string, number>, features: Record<string, boolean>}>}
 */
async function resolveEntitlements(user) {
    const populated = user.plan && typeof user.plan === 'object' && user.plan.limits ? user : await user.populate('plan');
    if (!populated.plan) {
        const settings = await AdminSettings.findOne() || await AdminSettings.create({});
        return {
            limits: settings.trialLimits || {},
            features: settings.trialFeatures || { meetings: true, whatsapp: true },
        };
    }
    return {
        limits: populated.plan.limits || {},
        features: populated.plan.features || { meetings: true, whatsapp: true },
    };
}

/** A limit that is unset, 0 or negative means unlimited. */
function cap(limits, key) {
    const n = limits ? limits[key] : null;
    return typeof n === 'number' && n > 0 ? n : null;
}

const checkLimit = (type) => async (req, res, next) => {
    try {
        // If superadmin, bypass limits
        if (req.user.isSuperAdmin) return next();

        const { limits } = await resolveEntitlements(req.user);
        const userId = req.user._id;

        if (type === 'agents') {
            const currentAgents = await Agent.countDocuments({ createdBy: userId });
            if (currentAgents >= limits.agents) {
                return res.status(403).json({
                    status: 'error',
                    message: `You have reached your limit of ${limits.agents} agents. Please upgrade your plan for more.`
                });
            }
        }

        if (type === 'campaigns') {
            const currentCampaigns = await Campaign.countDocuments({ createdBy: userId });
            if (currentCampaigns >= limits.campaigns) {
                return res.status(403).json({
                    status: 'error',
                    message: `You have reached your limit of ${limits.campaigns} campaigns. Please upgrade your plan for more.`
                });
            }
        }

        if (type === 'leads') {
            // This checks if the user can add AT LEAST ONE more lead.
            // For bulk uploads, we might need a different check in the route itself.
            const currentLeads = await Lead.countDocuments({ createdBy: userId });
            if (currentLeads >= limits.leads) {
                return res.status(403).json({
                    status: 'error',
                    message: `You have reached your limit of ${limits.leads} leads. Please upgrade your plan to add more.`
                });
            }
        }

        if (type === 'calls') {
            // <= 0 or null means unlimited calls for this plan/trial. Meetings are
            // CallLogs too, so they count here.
            const allowedCalls = cap(limits, 'callsPerMonth');
            if (allowedCalls === null) return next();

            const currentCalls = await CallLog.countDocuments({
                userId: userId,
                createdAt: { $gte: startOfMonth() }
            });

            if (currentCalls >= allowedCalls) {
                return res.status(403).json({
                    status: 'error',
                    message: `You have reached your monthly call limit of ${allowedCalls} calls. Please upgrade your plan or wait until the next billing cycle.`
                });
            }
        }

        if (type === 'tools') {
            const allowed = cap(limits, 'tools');
            if (allowed !== null) {
                const Tool = require('../models/Tool');
                const current = await Tool.countDocuments({ createdBy: userId });
                if (current >= allowed) {
                    return res.status(403).json({
                        status: 'error',
                        message: `You have reached your limit of ${allowed} tools. Please upgrade your plan for more.`
                    });
                }
            }
        }

        if (type === 'mcpServers') {
            const allowed = cap(limits, 'mcpServers');
            if (allowed !== null) {
                const McpServer = require('../models/McpServer');
                const current = await McpServer.countDocuments({ createdBy: userId });
                if (current >= allowed) {
                    return res.status(403).json({
                        status: 'error',
                        message: `You have reached your limit of ${allowed} connected apps. Please upgrade your plan for more.`
                    });
                }
            }
        }

        if (type === 'whatsappAccounts') {
            const allowed = cap(limits, 'whatsappAccounts');
            if (allowed !== null) {
                const WhatsAppAccount = require('../models/WhatsAppAccount');
                const current = await WhatsAppAccount.countDocuments({ createdBy: userId });
                if (current >= allowed) {
                    return res.status(403).json({
                        status: 'error',
                        message: `You have reached your limit of ${allowed} WhatsApp numbers. Please upgrade your plan for more.`
                    });
                }
            }
        }

        if (type === 'whatsappMessages') {
            if (!(await whatsappMessagesAllowed(req.user))) {
                return res.status(403).json({
                    status: 'error',
                    message: 'You have reached your monthly WhatsApp message limit. Please upgrade your plan or wait until the next billing cycle.'
                });
            }
        }

        next();
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

/**
 * Whether the account may send or receive one more WhatsApp message this
 * month. Used by the middleware and by the chat runner, which has no request.
 * @param {import('mongoose').Document & {isSuperAdmin?: boolean, _id: unknown}} user
 */
async function whatsappMessagesAllowed(user) {
    if (user.isSuperAdmin) return true;
    const { limits } = await resolveEntitlements(user);
    const allowed = cap(limits, 'whatsappMessagesPerMonth');
    if (allowed === null) return true;
    const WhatsAppMessage = require('../models/WhatsAppMessage');
    const current = await WhatsAppMessage.countDocuments({ userId: user._id, createdAt: { $gte: startOfMonth() } });
    return current < allowed;
}

/**
 * Refuse the request when the user's plan does not include a feature.
 * @param {'meetings' | 'whatsapp'} feature
 */
const requireFeature = (feature) => async (req, res, next) => {
    try {
        if (req.user.isSuperAdmin) return next();
        const { features } = await resolveEntitlements(req.user);
        if (features && features[feature] === false) {
            const label = feature === 'meetings' ? 'Meetings' : 'WhatsApp';
            return res.status(403).json({
                status: 'error',
                code: 'feature_not_in_plan',
                message: `${label} is not included in your plan. Please upgrade your plan to use it.`
            });
        }
        next();
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

/** Whether a user's plan has a feature, for code paths with no request (webhooks, chat turns). */
async function hasFeature(user, feature) {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    const { features } = await resolveEntitlements(user);
    return !(features && features[feature] === false);
}

module.exports = checkLimit;
module.exports.checkLimit = checkLimit;
module.exports.requireFeature = requireFeature;
module.exports.hasFeature = hasFeature;
module.exports.whatsappMessagesAllowed = whatsappMessagesAllowed;
module.exports.resolveEntitlements = resolveEntitlements;
