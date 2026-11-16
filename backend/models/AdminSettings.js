const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema({
    branding: {
        appName: { type: String, default: 'Nuvv Flow' },
        primaryColor: { type: String, default: '#8078F0' },
        logoLight: { type: String, default: '/images/logo_black.png' },
        logoDark: { type: String, default: '/images/logo_white.png' },
        favicon: { type: String, default: '/favicon.ico' }
    },
    currency: {
        type: String,
        default: 'BRL'
    },
    showCodeCanyonButton: {
        type: Boolean,
        default: false
    },
    /** Controls visibility of the self-hosting section on the public landing page */
    showSelfHostingSection: {
        type: Boolean,
        default: false
    },
    supportEmail: {
        type: String,
        default: 'contato@nuvv.com.br'
    },
    /** Shown on Privacy Policy (data protection contact) */
    privacyEmail: {
        type: String,
        default: 'privacy@intellicall.ai'
    },
    /** Shown on Terms of Service (legal inquiries) */
    legalEmail: {
        type: String,
        default: 'legal@intellicall.ai'
    },
    /** Shown on /contact; if empty, UI falls back to supportEmail */
    contactEmail: {
        type: String,
        default: ''
    },
    /** Physical HQ address shown on /contact page */
    hqAddress: {
        type: String,
        default: ''
    },
    socialLinks: {
        instagram: { type: String, default: '' },
        linkedin: { type: String, default: '' },
        youtube: { type: String, default: '' }
    },
    gateways: {
        stripe: {
            enabled: { type: Boolean, default: false },
            testMode: { type: Boolean, default: true },
            publishableKey: { type: String, default: '' },
            secretKey: { type: String, default: '' }
        },
        paypal: {
            enabled: { type: Boolean, default: false },
            testMode: { type: Boolean, default: true },
            clientId: { type: String, default: '' },
            secretKey: { type: String, default: '' }
        },
        dodopayments: {
            enabled: { type: Boolean, default: false },
            testMode: { type: Boolean, default: true },
            apiKey: { type: String, default: '' }
        },
        razorpay: {
            enabled: { type: Boolean, default: false },
            testMode: { type: Boolean, default: true },
            keyId: { type: String, default: '' },
            keySecret: { type: String, default: '' }
        }
    },
    trialLimits: {
        agents: { type: Number, default: 1 },
        campaigns: { type: Number, default: 1 },
        leads: { type: Number, default: 10 },
        callsPerMonth: { type: Number, default: 5 },
        tools: { type: Number, default: 2 },
        mcpServers: { type: Number, default: 1 },
        whatsappAccounts: { type: Number, default: 1 },
        whatsappMessagesPerMonth: { type: Number, default: 50 }
    },
    /** Features a trial account (no plan) may use. */
    trialFeatures: {
        meetings: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true }
    },
    integrations: {
        // Google Calendar and Google Sheets share one OAuth client.
        // No callbackUrl here: the two flows have separate redirect URIs, both
        // derived per-request (see utils/public-url.js) and overridable with
        // GOOGLE_CALENDAR_CALLBACK_URL / GOOGLE_SHEETS_CALLBACK_URL.
        google: {
            clientId: { type: String, default: '' },
            clientSecret: { type: String, default: '' }
        },
        hubspot: {
            clientId: { type: String, default: '' },
            clientSecret: { type: String, default: '' },
            callbackUrl: { type: String, default: '' }
        },
        slack: {
            clientId: { type: String, default: '' },
            clientSecret: { type: String, default: '' },
            callbackUrl: { type: String, default: '' }
        },
        /**
         * The platform's Meta app, for WhatsApp Embedded Signup (the "Connect with
         * Meta" popup) and the shared webhook door. Env vars META_APP_ID,
         * META_APP_SECRET, META_ES_CONFIG_ID, META_WEBHOOK_VERIFY_TOKEN,
         * META_SYSTEM_USER_TOKEN and META_SYSTEM_USER_ID are the fallback. Without
         * either, users connect numbers manually with their own Meta app.
         */
        meta: {
            appId: { type: String, default: '' },
            appSecret: { type: String, default: '' },
            esConfigId: { type: String, default: '' },
            webhookVerifyToken: { type: String, default: '' },
            systemUserToken: { type: String, default: '' },
            systemUserId: { type: String, default: '' }
        }
    }
}, {
    timestamps: true
});

const AdminSettings = mongoose.model('AdminSettings', adminSettingsSchema);

module.exports = AdminSettings;
