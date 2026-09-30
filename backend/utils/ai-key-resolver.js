const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const Settings = require('../models/Settings');

/**
 * Resolves AI execution mode, validates balance/permissions,
 * and supplies the appropriate API keys for calls and tests.
 *
 * @param {string|ObjectId} userId
 * @param {object} agent
 * @param {string} [provider]
 * @returns {Promise<{ allowed: boolean, operatingMode: string, billingCadence?: string, settings?: object, reason?: string, message?: string }>}
 */
async function resolveCallAiConfig(userId, agent, provider = 'sip') {
    const [user, adminSettings, userSettings] = await Promise.all([
        User.findById(userId),
        AdminSettings.findOne(),
        Settings.findOne({ userId })
    ]);

    if (!user) {
        return {
            allowed: false,
            reason: 'user_not_found',
            message: 'Usuário não encontrado.'
        };
    }

    const operatingMode = user.operatingMode || 'managed';
    const billingSettings = user.billingSettings || { type: 'prepaid', billingCadence: 'full_minute', postpaidCreditLimit: 0 };

    if (operatingMode === 'managed') {
        // In Nuvv Telecom Managed Service mode, financial authorization, rating, and call balances
        // are delegated upstream to MagnusBilling and SGP ERP.
        // Internal credit balance checks are bypassed so trunk signaling governs authorization.

        // Master keys injection
        const masterGeminiKey = adminSettings?.masterAi?.geminiKey || process.env.GEMINI_API_KEY || '';
        if (!masterGeminiKey && agent?.voiceEngine === 'gemini_live') {
            return {
                allowed: false,
                reason: 'missing_master_gemini_key',
                message: 'Chave Mestra Gemini Live não configurada no SuperAdmin.'
            };
        }

        // Return merged settings object with Master Key injected
        const resolvedSettings = {
            ...(userSettings?.toObject() || {}),
            geminiKey: masterGeminiKey || userSettings?.geminiKey || ''
        };

        return {
            allowed: true,
            operatingMode: 'managed',
            billingCadence: billingSettings.billingCadence || 'full_minute',
            settings: resolvedSettings,
            user
        };
    }

    // BYOK (Bring Your Own Key) mode
    if (operatingMode === 'byok') {
        // Strict rule: Gemini Live Speech-to-Speech is NEVER allowed for BYOK
        if (agent?.voiceEngine === 'gemini_live') {
            return {
                allowed: false,
                reason: 'gemini_live_not_allowed_in_byok',
                message: 'O motor Gemini Multimodal (Speech-to-Speech) é exclusivo da plataforma gerenciada e não é permitido no modo BYOK.'
            };
        }

        return {
            allowed: true,
            operatingMode: 'byok',
            settings: userSettings?.toObject() || {},
            user
        };
    }

    return {
        allowed: false,
        reason: 'unknown_mode',
        message: 'Modo operacional inválido.'
    };
}

/**
 * Calculates consumed credits based on duration and user billing cadence.
 *
 * @param {number} durationSeconds
 * @param {'full_minute'|'thirty_seconds'} cadence
 * @returns {number} credits
 */
function calculateCreditUsage(durationSeconds, cadence = 'full_minute') {
    if (!durationSeconds || durationSeconds <= 0) return 0;

    if (cadence === 'thirty_seconds') {
        // 30s blocks = 0.5 credits each
        const blocks = Math.ceil(durationSeconds / 30);
        return blocks * 0.5;
    }

    // Default: full minute rounded up = 1 credit per minute
    const minutes = Math.ceil(durationSeconds / 60);
    return Math.max(1, minutes);
}

module.exports = {
    resolveCallAiConfig,
    calculateCreditUsage
};
