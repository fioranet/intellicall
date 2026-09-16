const AdminSettings = require('../models/AdminSettings');

/**
 * Resolve the platform's display name from admin branding (white-label aware).
 * Falls back to the stock name only when no custom branding is configured.
 * @returns {Promise<string>}
 */
async function getAppName() {
    try {
        const adminSettings = await AdminSettings.findOne();
        return adminSettings?.branding?.appName || 'IntelliCallAI';
    } catch {
        return 'IntelliCallAI';
    }
}

module.exports = { getAppName };
