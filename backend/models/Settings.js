const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    twilioSid: {
        type: String,
        default: ''
    },
    twilioToken: {
        type: String,
        default: ''
    },
    openRouterKey: {
        type: String,
        default: ''
    },
    elevenLabsKey: {
        type: String,
        default: ''
    },
    deepgramKey: {
        type: String,
        default: ''
    },
    sarvamKey: {
        type: String,
        default: ''
    },
    geminiKey: {
        type: String,
        default: ''
    },
    recordingEnabled: {
        type: Boolean,
        default: true
    },
    autoAnalysisEnabled: {
        type: Boolean,
        default: false
    },
    timeFormat: {
        type: String, // '12' or '24'
        default: '12',
        enum: ['12', '24']
    },
    uiLanguage: {
        // Dashboard interface language. Unrelated to an agent's voice language.
        type: String,
        default: 'en',
        enum: ['en', 'es', 'fr', 'de', 'ar', 'pt']
    },
    timeZone: {
        type: String, // IANA timezone e.g. 'America/New_York'
        default: 'America/Sao_Paulo'
    },
    googleSheetsAccessToken: {
        type: String,
        default: ''
    },
    googleSheetsRefreshToken: {
        type: String,
        default: ''
    },
    googleSheetsConnected: {
        type: Boolean,
        default: false
    },
    googleSheetsConfig: {
        spreadsheetId: String,
        sheetName: String,
        mapping: mongoose.Schema.Types.Mixed,
        lastSynced: Date
    },
    googleCalendarAccessToken: {
        type: String,
        default: ''
    },
    googleCalendarRefreshToken: {
        type: String,
        default: ''
    },
    googleCalendarConnected: {
        type: Boolean,
        default: false
    },
    googleCalendarId: {
        type: String,
        default: 'primary'
    },
    googleCalendarEmail: {
        type: String,
        default: ''
    },
    hubspotAccessToken: {
        type: String,
        default: ''
    },
    hubspotRefreshToken: {
        type: String,
        default: ''
    },
    hubspotExpiresAt: {
        type: Date,
        default: null
    },
    hubspotHubId: {
        type: Number,
        default: null
    },
    hubspotHubDomain: {
        type: String,
        default: ''
    },
    hubspotConnected: {
        type: Boolean,
        default: false
    },
    hubspotSyncLeads: {
        type: Boolean,
        default: true
    },
    // Transient: holds the PKCE code_verifier between the OAuth initiate
    // redirect and the callback exchange. Cleared once the exchange completes.
    hubspotPkceVerifier: {
        type: String,
        default: ''
    },
    // Service key (pat-*) pasted by the user from their own HubSpot account.
    // HubSpot sunset legacy public app creation on 2026-06-23, so new installs
    // cannot register an OAuth app at all — a service key is now the supported
    // path. Takes precedence over the OAuth fields above, which are kept only
    // so installs that connected before the sunset keep working.
    hubspotServiceKey: {
        type: String,
        default: ''
    },
    slackAccessToken: {
        type: String,
        default: ''
    },
    slackTeamId: {
        type: String,
        default: ''
    },
    slackTeamName: {
        type: String,
        default: ''
    },
    slackChannelId: {
        type: String,
        default: ''
    },
    slackChannelName: {
        type: String,
        default: ''
    },
    slackWebhookUrl: {
        type: String,
        default: ''
    },
    slackConnected: {
        type: Boolean,
        default: false
    },
    slackEvents: {
        inboundCall: { type: Boolean, default: false },
        outboundCall: { type: Boolean, default: false },
        callCompleted: { type: Boolean, default: true },
        leadCreated: { type: Boolean, default: true },
        leadQualified: { type: Boolean, default: true },
        campaignCompleted: { type: Boolean, default: true },
        appointmentBooked: { type: Boolean, default: true },
        appointmentCanceled: { type: Boolean, default: true },
        // Human Transfer (v11.5). SIP calls only — see services/sip/sip-manager.js.
        callTransferred: { type: Boolean, default: true },
        transferFailed: { type: Boolean, default: true }
    },
    whatsappAccessToken: {
        type: String,
        default: ''
    },
    whatsappPhoneNumberId: {
        type: String,
        default: ''
    },
    whatsappBusinessNumber: {
        type: String,
        default: ''
    },
    whatsappBusinessName: {
        type: String,
        default: ''
    },
    whatsappRecipientNumber: {
        type: String,
        default: ''
    },
    whatsappConnected: {
        type: Boolean,
        default: false
    },
    whatsappEvents: {
        inboundCall: { type: Boolean, default: false },
        outboundCall: { type: Boolean, default: false },
        callCompleted: { type: Boolean, default: true },
        leadCreated: { type: Boolean, default: true },
        leadQualified: { type: Boolean, default: true },
        campaignCompleted: { type: Boolean, default: true },
        appointmentBooked: { type: Boolean, default: true },
        appointmentCanceled: { type: Boolean, default: true },
        // Human Transfer (v11.5). SIP calls only — see services/sip/sip-manager.js.
        callTransferred: { type: Boolean, default: true },
        transferFailed: { type: Boolean, default: true }
    },
    whatsappReminders: {
        enabled: { type: Boolean, default: false },
        // Pre-approved Meta template: {{1}} client name, {{2}} date, {{3}} time
        templateName: { type: String, default: '' },
        templateLanguage: { type: String, default: 'en' },
        leadMinutes: { type: Number, default: 60 }
    },
    n8nWebhookUrl: {
        type: String,
        default: ''
    },
    n8nConnected: {
        type: Boolean,
        default: false
    },
    n8nEvents: {
        inboundCall: { type: Boolean, default: false },
        outboundCall: { type: Boolean, default: false },
        callCompleted: { type: Boolean, default: true },
        leadCreated: { type: Boolean, default: true },
        leadQualified: { type: Boolean, default: true },
        campaignCompleted: { type: Boolean, default: true },
        appointmentBooked: { type: Boolean, default: true },
        appointmentCanceled: { type: Boolean, default: true },
        // Human Transfer (v11.5). SIP calls only — see services/sip/sip-manager.js.
        callTransferred: { type: Boolean, default: true },
        transferFailed: { type: Boolean, default: true }
    },
    webhooks: {
        url: {
            type: String,
            default: ''
        },
        secret: {
            type: String,
            default: ''
        },
        enabled: {
            type: Boolean,
            default: false
        },
        events: {
            inboundCall: { type: Boolean, default: true },
            outboundCall: { type: Boolean, default: true },
            callCompleted: { type: Boolean, default: true },
            leadCreated: { type: Boolean, default: true },
            leadQualified: { type: Boolean, default: true },
            campaignCompleted: { type: Boolean, default: true },
            appointmentBooked: { type: Boolean, default: true },
            appointmentCanceled: { type: Boolean, default: true },
            // Human Transfer (v11.5). SIP calls only — see services/sip/sip-manager.js.
            callTransferred: { type: Boolean, default: true },
            transferFailed: { type: Boolean, default: true }
        }
    },
    emailNotifications: {
        enabled: {
            type: Boolean,
            default: false
        },
        brevoKey: {
            type: String,
            default: ''
        },
        senderEmail: {
            type: String,
            default: ''
        },
        senderName: {
            type: String,
            // Empty by default so the email sender name falls back to the custom
            // branding App Name (see email-service: config.senderName || appName).
            default: ''
        },
        recipientEmail: {
            type: String,
            default: ''
        },
        events: {
            inboundCall: { type: Boolean, default: true },
            outboundCall: { type: Boolean, default: true },
            callCompleted: { type: Boolean, default: true },
            leadCreated: { type: Boolean, default: true },
            leadQualified: { type: Boolean, default: true },
            campaignCompleted: { type: Boolean, default: true },
            appointmentBooked: { type: Boolean, default: true },
            appointmentCanceled: { type: Boolean, default: true }
        }
    },
    autoHangupEnabled: {
        type: Boolean,
        default: false
    },
    incomingHangupLimit: {
        type: Number,
        default: 10 // minutes
    },
    outgoingHangupLimit: {
        type: Number,
        default: 10 // minutes
    }
}, {
    timestamps: true
});

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
