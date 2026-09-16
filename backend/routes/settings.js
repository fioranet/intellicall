const express = require('express');
const joi = require('joi');
const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const AdminSettings = require('../models/AdminSettings');
const { auth } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Notification event toggles for the webhook and email blocks of POST /.
//
// Every key here also exists on the Settings model, but the list is kept open
// on purpose: joi rejects unknown keys by default, so a closed list means any
// event added to the model and the settings form later — as `callTransferred`
// and `transferFailed` were in v11.5 — makes the whole settings save fail with
// `"webhooks.events.<name>" is not allowed`, blocking every unrelated field on
// the page too. Slack, n8n and WhatsApp already accept any boolean flag (see
// their handlers below); this keeps the general endpoint consistent with them.
// Mongoose still drops flags the schema does not define, so an unknown key is
// ignored rather than stored.
const EVENT_FLAGS = [
    'inboundCall',
    'outboundCall',
    'callCompleted',
    'leadCreated',
    'leadQualified',
    'campaignCompleted',
    'appointmentBooked',
    'appointmentCanceled',
    // Human Transfer (v11.5). SIP calls only.
    'callTransferred',
    'transferFailed'
];

function eventFlags() {
    const keys = Object.fromEntries(
        EVENT_FLAGS.map(name => [name, joi.boolean().default(true)])
    );
    return joi.object(keys).pattern(joi.string(), joi.boolean()).default();
}

function publicPlatformDefaults() {
    return {
        currency: 'USD',
        showCodeCanyonButton: false,
        showSelfHostingSection: false,
        supportEmail: 'support@intellicall.ai',
        privacyEmail: 'privacy@intellicall.ai',
        legalEmail: 'legal@intellicall.ai',
        contactEmail: '',
        hqAddress: '',
        socialLinks: {
            instagram: '',
            linkedin: '',
            youtube: ''
        },
        branding: {
            appName: 'IntelliCallAI',
            primaryColor: '#8078F0',
            logoLight: '/images/logo_black.png',
            logoDark: '/images/logo_white.png',
            favicon: '/favicon.ico'
        },
        gateways: {
            stripe: false,
            paypal: false,
            dodopayments: false,
            razorpay: false
        }
    };
}

// GET public platform settings (currency, enabled gateways)
router.get('/public', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(200).json({
                status: 'success',
                data: publicPlatformDefaults()
            });
        }

        const settings = await AdminSettings.findOne();
        if (!settings) {
            return res.status(200).json({
                status: 'success',
                data: publicPlatformDefaults()
            });
        }

        res.status(200).json({
            status: 'success',
            data: {
                currency: settings.currency,
                showCodeCanyonButton: settings.showCodeCanyonButton || false,
                showSelfHostingSection: settings.showSelfHostingSection || false,
                supportEmail: settings.supportEmail || 'support@intellicall.ai',
                privacyEmail: settings.privacyEmail || 'privacy@intellicall.ai',
                legalEmail: settings.legalEmail || 'legal@intellicall.ai',
                contactEmail: typeof settings.contactEmail === 'string' ? settings.contactEmail : '',
                hqAddress: settings.hqAddress || '',
                socialLinks: {
                    instagram: settings.socialLinks?.instagram || '',
                    linkedin: settings.socialLinks?.linkedin || '',
                    youtube: settings.socialLinks?.youtube || ''
                },
                branding: {
                    appName: settings.branding?.appName || 'IntelliCallAI',
                    primaryColor: settings.branding?.primaryColor || '#8078F0',
                    logoLight: settings.branding?.logoLight || '/images/logo_black.png',
                    logoDark: settings.branding?.logoDark || '/images/logo_white.png',
                    favicon: settings.branding?.favicon || '/favicon.ico'
                },
                gateways: {
                    stripe: settings.gateways?.stripe?.enabled || false,
                    stripeTestMode: settings.gateways?.stripe?.testMode ?? true,
                    paypal: settings.gateways?.paypal?.enabled || false,
                    paypalTestMode: settings.gateways?.paypal?.testMode ?? true,
                    paypalClientId: settings.gateways?.paypal?.clientId || '',
                    dodopayments: settings.gateways?.dodopayments?.enabled || false,
                    dodopaymentsTestMode: settings.gateways?.dodopayments?.testMode ?? true,
                    razorpay: settings.gateways?.razorpay?.enabled || false,
                    razorpayTestMode: settings.gateways?.razorpay?.testMode ?? true,
                    razorpayKeyId: settings.gateways?.razorpay?.keyId || ''
                }
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET configuration status for keys (Per user)
router.get('/config-status', auth, async (req, res) => {
    try {
        const PhoneNumber = require('../models/PhoneNumber');
        const SipTrunk = require('../models/SipTrunk');
        const hubspotUtil = require('../utils/hubspot');
        const slackUtil = require('../utils/slack');
        const [settings, phoneCount, sipTrunkCount, hubspotAvailable, slackAvailable] = await Promise.all([
            Settings.findOne({ userId: req.user._id }),
            PhoneNumber.countDocuments({ createdBy: req.user._id }),
            SipTrunk.countDocuments({ createdBy: req.user._id }),
            hubspotUtil.isAvailable(),
            slackUtil.isAvailable()
        ]);

        // Build SIP Origination URI from server config
        const externalIp = process.env.EXTERNAL_IP || '';
        const sipPort = parseInt(process.env.IC_SIP_PORT || '5090');
        const sipOriginationUri = externalIp ? `sip:${externalIp}:${sipPort}` : '';

        res.status(200).json({
            status: 'success',
            data: {
                isTwilioConfigured: !!(settings?.twilioSid && settings?.twilioToken),
                isSipConfigured: sipTrunkCount > 0,
                isElevenLabsConfigured: !!(settings?.elevenLabsKey),
                isDeepgramConfigured: !!(settings?.deepgramKey),
                isSarvamConfigured: !!(settings?.sarvamKey),
                isGeminiConfigured: !!(settings?.geminiKey),
                isModelConfigured: !!(settings?.openRouterKey),
                isGoogleCalendarConnected: !!settings?.googleCalendarConnected,
                isGoogleSheetsConnected: !!settings?.googleSheetsConnected,
                googleCalendarEmail: settings?.googleCalendarEmail || '',
                isHubSpotConnected: !!settings?.hubspotConnected,
                hubspotHubDomain: settings?.hubspotHubDomain || '',
                hubspotSyncLeads: settings?.hubspotSyncLeads !== false,
                // Which credential is actually live, so the UI can show the
                // service-key form as primary and the legacy OAuth button only
                // where an install still has an app registered.
                hubspotAuthMode: settings?.hubspotServiceKey
                    ? 'serviceKey'
                    : (settings?.hubspotRefreshToken ? 'oauth' : ''),
                hubspotServiceKeyLast4: settings?.hubspotServiceKey
                    ? String(settings.hubspotServiceKey).slice(-4)
                    : '',
                isHubSpotAvailable: hubspotAvailable,
                isSlackConnected: !!settings?.slackConnected,
                slackTeamName: settings?.slackTeamName || '',
                slackChannelName: settings?.slackChannelName || '',
                slackEvents: settings?.slackEvents || {},
                isSlackAvailable: slackAvailable,
                isWhatsAppConnected: !!settings?.whatsappConnected,
                whatsappBusinessNumber: settings?.whatsappBusinessNumber || '',
                whatsappBusinessName: settings?.whatsappBusinessName || '',
                whatsappRecipientNumber: settings?.whatsappRecipientNumber || '',
                whatsappEvents: settings?.whatsappEvents || {},
                whatsappReminders: {
                    enabled: settings?.whatsappReminders?.enabled || false,
                    templateName: settings?.whatsappReminders?.templateName || '',
                    templateLanguage: settings?.whatsappReminders?.templateLanguage || 'en',
                    leadMinutes: settings?.whatsappReminders?.leadMinutes ?? 60
                },
                isN8nConnected: !!settings?.n8nConnected,
                n8nWebhookUrl: settings?.n8nWebhookUrl || '',
                n8nEvents: settings?.n8nEvents || {},
                sipOriginationUri
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET current user settings
router.get('/', auth, async (req, res) => {
    try {
        let settings = await Settings.findOne({ userId: req.user._id });

        // If no settings exist yet, create default settings for this user
        if (!settings) {
            settings = await Settings.create({
                userId: req.user._id,
                webhooks: {
                    url: '',
                    secret: `whsec_${crypto.randomBytes(16).toString('hex')}`,
                    enabled: false,
                    events: {
                        inboundCall: true,
                        outboundCall: true,
                        callCompleted: true,
                        leadCreated: true,
                        appointmentBooked: true,
                        appointmentCanceled: true
                    }
                },
                emailNotifications: {
                    enabled: false,
                    brevoKey: '',
                    senderEmail: '',
                    senderName: '',
                    recipientEmail: '',
                    events: {
                        inboundCall: true,
                        outboundCall: true,
                        callCompleted: true,
                        leadCreated: true,
                        leadQualified: true,
                        campaignCompleted: true,
                        appointmentBooked: true,
                        appointmentCanceled: true
                    }
                }
            });
        } else if (!settings.webhooks || !settings.webhooks.secret || !settings.webhooks.events) {
            // Ensure webhooks object exists
            if (!settings.webhooks) {
                settings.webhooks = { url: '', secret: '', enabled: false, events: {} };
            }

            // Ensure secret exists
            if (!settings.webhooks.secret) {
                settings.webhooks.secret = `whsec_${crypto.randomBytes(16).toString('hex')}`;
            }

            // Ensure emailNotifications object exists
            if (!settings.emailNotifications) {
                settings.emailNotifications = { enabled: false, brevoKey: '', senderEmail: '', senderName: '', recipientEmail: '', events: {} };
            }

            const defaultEvents = {
                inboundCall: true,
                outboundCall: true,
                callCompleted: true,
                leadCreated: true,
                leadQualified: true,
                campaignCompleted: true,
                appointmentBooked: true,
                appointmentCanceled: true
            };

            // Merge existing events with defaults
            settings.webhooks.events = {
                ...defaultEvents,
                ...settings.webhooks.events
            };

            if (!settings.emailNotifications.events) {
                settings.emailNotifications.events = {};
            }
            settings.emailNotifications.events = {
                ...defaultEvents,
                ...settings.emailNotifications.events
            };

            // Mark modified for nested objects
            settings.markModified('webhooks');
            settings.markModified('emailNotifications');
            await settings.save();
        }

        // The HubSpot service key is written through its own endpoint and never
        // edited from this payload, so it does not need to reach the browser.
        // The other credentials stay — the settings form renders them.
        const payload = settings.toObject();
        delete payload.hubspotServiceKey;

        res.status(200).json({
            status: 'success',
            data: { settings: payload }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PATCH just the UI language. Deliberately separate from POST / — that route
// defaults every credential field, so a partial body there would blank the
// user's Twilio/OpenRouter/ElevenLabs keys.
router.patch('/ui-language', auth, async (req, res) => {
    const schema = joi.object({
        uiLanguage: joi.string().valid('en', 'es', 'fr', 'de', 'ar', 'pt').required()
    });

    try {
        const { uiLanguage } = await schema.validateAsync(req.body);
        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            { $set: { uiLanguage } },
            { upsert: true, runValidators: true }
        );
        res.status(200).json({ status: 'success', data: { uiLanguage } });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

// POST/PUT user settings (BYOK)
router.post('/', auth, async (req, res) => {
    const schema = joi.object({
        twilioSid: joi.string().allow('').default(''),
        twilioToken: joi.string().allow('').default(''),
        openRouterKey: joi.string().allow('').default(''),
        elevenLabsKey: joi.string().allow('').default(''),
        deepgramKey: joi.string().allow('').default(''),
        sarvamKey: joi.string().allow('').default(''),
        geminiKey: joi.string().allow('').default(''),
        recordingEnabled: joi.boolean().default(true),
        autoAnalysisEnabled: joi.boolean().default(false),
        timeFormat: joi.string().valid('12', '24').default('12'),
        // No .default() on purpose: every other field here defaults, and the handler
        // $sets whatever joi produced. A default would let a save from any settings
        // tab silently reset the user's language.
        uiLanguage: joi.string().valid('en', 'es', 'fr', 'de', 'ar', 'pt'),
        timeZone: joi.string().min(1).default('UTC'),
        webhooks: joi.object({
            url: joi.string().uri().allow('').default(''),
            enabled: joi.boolean().default(false),
            secret: joi.string().allow(''),
            events: eventFlags()
        }).default(),
        emailNotifications: joi.object({
            enabled: joi.boolean().default(false),
            brevoKey: joi.string().allow('').default(''),
            senderEmail: joi.string().email().allow('').default(''),
            senderName: joi.string().allow('').default(''),
            recipientEmail: joi.string().email().allow('').default(''),
            events: eventFlags()
        }).default(),
        autoHangupEnabled: joi.boolean().default(false),
        incomingHangupLimit: joi.number().min(0).default(10),
        outgoingHangupLimit: joi.number().min(0).default(10)
    });

    try {
        const data = await schema.validateAsync(req.body);

        // Normalize Brasilia aliases to official IANA America/Sao_Paulo
        const updateData = { ...data };
        if (data.timeZone) {
            const tzLower = data.timeZone.trim().toLowerCase();
            if (tzLower.includes('brasilia') || tzLower.includes('brasília')) {
                updateData.timeZone = 'America/Sao_Paulo';
            }
        }
        const webhookUpdate = {};

        if (data.webhooks) {
            if (data.webhooks.url !== undefined) webhookUpdate['webhooks.url'] = data.webhooks.url;
            if (data.webhooks.enabled !== undefined) webhookUpdate['webhooks.enabled'] = data.webhooks.enabled;
            if (data.webhooks.events) {
                Object.keys(data.webhooks.events).forEach(event => {
                    webhookUpdate[`webhooks.events.${event}`] = data.webhooks.events[event];
                });
            }
            delete updateData.webhooks;
        }

        if (data.emailNotifications) {
            if (data.emailNotifications.enabled !== undefined) webhookUpdate['emailNotifications.enabled'] = data.emailNotifications.enabled;
            if (data.emailNotifications.brevoKey !== undefined) webhookUpdate['emailNotifications.brevoKey'] = data.emailNotifications.brevoKey;
            if (data.emailNotifications.senderEmail !== undefined) webhookUpdate['emailNotifications.senderEmail'] = data.emailNotifications.senderEmail;
            if (data.emailNotifications.senderName !== undefined) webhookUpdate['emailNotifications.senderName'] = data.emailNotifications.senderName;
            if (data.emailNotifications.recipientEmail !== undefined) webhookUpdate['emailNotifications.recipientEmail'] = data.emailNotifications.recipientEmail;
            if (data.emailNotifications.events) {
                Object.keys(data.emailNotifications.events).forEach(event => {
                    webhookUpdate[`emailNotifications.events.${event}`] = data.emailNotifications.events[event];
                });
            }
            delete updateData.emailNotifications;
        }

        const settings = await Settings.findOneAndUpdate(
            { userId: req.user._id },
            {
                $set: {
                    ...updateData,
                    ...webhookUpdate
                }
            },
            { returnDocument: 'after', upsert: true, runValidators: true }
        );

        // Same reasoning as GET /: the service key has its own endpoint and is
        // never edited through this payload, so it does not go back out.
        const payload = settings.toObject();
        delete payload.hubspotServiceKey;

        res.status(200).json({
            status: 'success',
            data: { settings: payload }
        });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

// Regenerate webhook secret
router.post('/webhooks/regenerate-secret', auth, async (req, res) => {
    try {
        const newSecret = `whsec_${crypto.randomBytes(16).toString('hex')}`;
        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            { $set: { 'webhooks.secret': newSecret } },
            { returnDocument: 'after', upsert: true }
        );

        res.status(200).json({
            status: 'success',
            data: { secret: newSecret }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Send test webhook event
router.post('/webhooks/test', auth, async (req, res) => {
    const { event } = req.body;
    if (!event) {
        return res.status(400).json({ status: 'error', message: 'Event type is required' });
    }

    try {
        const settings = await Settings.findOne({ userId: req.user._id });
        if (!settings || !settings.webhooks?.url) {
            return res.status(400).json({ status: 'error', message: 'Webhook URL not configured' });
        }

        // Generate sample data based on event type
        let sampleData = {};
        switch (event) {
            case 'leadCreated':
                sampleData = {
                    lead: {
                        _id: '507f1f77bcf86cd799439011',
                        name: 'John Doe (Test)',
                        phone: '1234567890',
                        tags: ['test', 'webhook-check'],
                        createdAt: new Date().toISOString()
                    }
                };
                break;
            case 'leadQualified':
                sampleData = {
                    leadId: '507f1f77bcf86cd799439011',
                    name: 'John Doe (Test)',
                    status: 'qualified',
                    score: 85,
                    reason: 'Strong interest in product during test call'
                };
                break;
            case 'outboundCall':
            case 'inboundCall':
                sampleData = {
                    callSid: 'CA' + crypto.randomBytes(16).toString('hex'),
                    leadId: '507f1f77bcf86cd799439011',
                    phoneNumber: '+1234567890',
                    direction: event === 'inboundCall' ? 'inbound' : 'outbound',
                    provider: 'twilio'
                };
                break;
            case 'callCompleted':
                sampleData = {
                    callSid: 'CA' + crypto.randomBytes(16).toString('hex'),
                    leadId: '507f1f77bcf86cd799439011',
                    duration: 45,
                    status: 'completed',
                    recordingUrl: 'https://api.twilio.com/mock-recording.wav'
                };
                break;
            case 'campaignCompleted':
                sampleData = {
                    campaignId: '607f1f77bcf86cd799439011',
                    name: 'Test Holiday Campaign',
                    status: 'completed',
                    stats: {
                        totalLeads: 5,
                        successfulCalls: 3,
                        failedCalls: 2
                    }
                };
                break;
            case 'appointmentBooked':
                sampleData = {
                    appointmentId: '707f1f77bcf86cd799439011',
                    leadId: '507f1f77bcf86cd799439011',
                    clientName: 'John Doe (Test)',
                    clientPhone: '+1234567890',
                    dateTime: new Date(Date.now() + 86400000).toISOString(),
                    status: 'scheduled',
                    agentName: 'Appointment Assistant'
                };
                break;
            case 'appointmentCanceled':
                sampleData = {
                    appointmentId: '707f1f77bcf86cd799439011',
                    leadId: '507f1f77bcf86cd799439011',
                    clientName: 'John Doe (Test)',
                    clientPhone: '+1234567890',
                    dateTime: new Date(Date.now() + 86400000).toISOString(),
                    status: 'canceled'
                };
                break;
            default:
                sampleData = { message: 'This is a custom test event payload' };
        }

        const WebhookService = require('../services/webhook-service');
        // We bypass the enabled/event check for manual tests to ensure debugging works
        // But we still sign it and send it to their URL.
        const payload = {
            event,
            timestamp: new Date().toISOString(),
            isTest: true,
            data: sampleData
        };

        const payloadString = JSON.stringify(payload);
        const secret = settings.webhooks.secret || '';
        const signature = crypto
            .createHmac('sha256', secret)
            .update(payloadString)
            .digest('hex');

        require('axios').post(settings.webhooks.url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-IntelliCall-Signature': signature,
                'User-Agent': 'IntelliCall-AI-Webhook-Tester/1.0'
            },
            timeout: 5000
        }).then(response => {
            console.log(`[Webhook Test] Delivered '${event}' (Status: ${response.status})`);
        }).catch(err => {
            console.error(`[Webhook Test Error] Failed: ${err.message}`);
        });

        res.status(200).json({
            status: 'success',
            message: `Test event '${event}' dispatched to ${settings.webhooks.url}`,
            data: { payload }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Send test email
router.post('/email/test', auth, async (req, res) => {
    const { event } = req.body;
    if (!event) {
        return res.status(400).json({ status: 'error', message: 'Event type is required' });
    }

    try {
        const settings = await Settings.findOne({ userId: req.user._id });
        if (!settings || !settings.emailNotifications?.enabled || !settings.emailNotifications?.brevoKey) {
            return res.status(400).json({ status: 'error', message: 'Email notifications or Brevo API Key not configured' });
        }

        // Generate sample data
        let sampleData = {};
        switch (event) {
            case 'appointmentBooked':
                sampleData = {
                    appointmentId: '707f1f77bcf86cd799439011',
                    clientName: 'John Doe (Test)',
                    clientPhone: '+1234567890',
                    dateTime: new Date(Date.now() + 86400000).toISOString(),
                    status: 'scheduled',
                    agentName: 'Appointment Assistant'
                };
                break;
            case 'appointmentCanceled':
                sampleData = {
                    appointmentId: '707f1f77bcf86cd799439011',
                    clientName: 'John Doe (Test)',
                    clientPhone: '+1234567890',
                    dateTime: new Date(Date.now() + 86400000).toISOString(),
                    status: 'canceled'
                };
                break;
            case 'leadCreated':
                sampleData = {
                    lead: {
                        name: 'John Doe (Test)',
                        phone: '1234567890',
                        email: 'john@example.com'
                    }
                };
                break;
            case 'leadQualified':
                sampleData = {
                    name: 'John Doe (Test)',
                    status: 'qualified',
                    score: 85
                };
                break;
            case 'inboundCall':
            case 'outboundCall':
                sampleData = {
                    phoneNumber: '+1234567890',
                    direction: event === 'inboundCall' ? 'inbound' : 'outbound'
                };
                break;
            case 'callCompleted':
                sampleData = {
                    duration: 45,
                    status: 'completed',
                    summary: 'Customer interested in follow-up next week.'
                };
                break;
            default:
                sampleData = { message: 'This is a test notification' };
        }

        const EmailService = require('../services/email-service');
        // We pass true for throwOnError so manual tests show exact errors in UI
        await EmailService.trigger(req.user._id, event, sampleData, true);

        res.status(200).json({
            status: 'success',
            message: `Test email for '${event}' dispatched to ${settings.emailNotifications.recipientEmail}`
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Verify ElevenLabs API key
router.post('/elevenlabs/verify', auth, async (req, res) => {
    const { elevenLabsKey } = req.body;
    if (!elevenLabsKey) {
        return res.status(400).json({ status: 'error', message: 'API key is required' });
    }

    try {
        const axios = require('axios');
        await axios.get('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': elevenLabsKey }
        });

        res.status(200).json({
            status: 'success',
            message: 'API key is valid'
        });
    } catch (err) {
        const status = err.response?.status || 500;
        const message = status === 401 ? 'Incorrect API Key' : 'Failed to verify API key';
        res.status(status).json({
            status: 'error',
            message
        });
    }
});

// POST /api/settings/hubspot/service-key
// The supported way to connect HubSpot: the user pastes a service key created
// in their own portal. Replaces the legacy OAuth app flow, which HubSpot closed
// to new apps on 2026-06-23.
router.post('/hubspot/service-key', auth, async (req, res) => {
    try {
        const { looksLikeServiceKey, validateServiceKey } = require('../utils/hubspot');
        const serviceKey = String(req.body?.serviceKey || '').trim();

        if (!serviceKey) {
            return res.status(400).json({ status: 'error', message: 'Service key is required' });
        }
        if (!looksLikeServiceKey(serviceKey)) {
            return res.status(400).json({
                status: 'error',
                message: 'That does not look like a HubSpot service key. Keys start with "pat-".'
            });
        }

        let hubInfo;
        try {
            hubInfo = await validateServiceKey(serviceKey);
        } catch (err) {
            return res.status(400).json({ status: 'error', message: err.message });
        }

        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            {
                hubspotServiceKey: serviceKey,
                hubspotHubId: hubInfo.hubId || null,
                hubspotHubDomain: hubInfo.hubDomain || '',
                hubspotConnected: true
            },
            { upsert: true }
        );

        res.status(200).json({
            status: 'success',
            message: 'HubSpot connected',
            data: { hubspotHubDomain: hubInfo.hubDomain || '', hubspotAuthMode: 'serviceKey' }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/hubspot/disconnect
router.post('/hubspot/disconnect', auth, async (req, res) => {
    try {
        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            {
                hubspotConnected: false,
                hubspotAccessToken: '',
                hubspotRefreshToken: '',
                hubspotExpiresAt: null,
                hubspotHubId: null,
                hubspotHubDomain: '',
                hubspotServiceKey: '',
                hubspotPkceVerifier: ''
            }
        );
        res.status(200).json({ status: 'success', message: 'HubSpot disconnected' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PATCH /api/settings/hubspot/preferences
router.patch('/hubspot/preferences', auth, async (req, res) => {
    try {
        const update = {};
        if (typeof req.body.hubspotSyncLeads === 'boolean') update.hubspotSyncLeads = req.body.hubspotSyncLeads;
        if (!Object.keys(update).length) {
            return res.status(400).json({ status: 'error', message: 'No valid preferences provided' });
        }
        await Settings.findOneAndUpdate({ userId: req.user._id }, update, { upsert: true });
        res.status(200).json({ status: 'success', data: update });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/slack/disconnect
router.post('/slack/disconnect', auth, async (req, res) => {
    try {
        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            {
                slackConnected: false,
                slackAccessToken: '',
                slackTeamId: '',
                slackTeamName: '',
                slackChannelId: '',
                slackChannelName: '',
                slackWebhookUrl: ''
            }
        );
        res.status(200).json({ status: 'success', message: 'Slack disconnected' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PATCH /api/settings/slack/preferences  { events: { leadCreated: true, ... } }
router.patch('/slack/preferences', auth, async (req, res) => {
    try {
        const events = req.body?.events;
        if (!events || typeof events !== 'object') {
            return res.status(400).json({ status: 'error', message: 'events object required' });
        }
        const update = {};
        for (const [k, v] of Object.entries(events)) {
            if (typeof v === 'boolean') update[`slackEvents.${k}`] = v;
        }
        if (!Object.keys(update).length) {
            return res.status(400).json({ status: 'error', message: 'No valid events provided' });
        }
        await Settings.findOneAndUpdate({ userId: req.user._id }, { $set: update }, { upsert: true });
        res.status(200).json({ status: 'success', data: update });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/slack/test  { event?: string }
router.post('/slack/test', auth, async (req, res) => {
    try {
        const SlackService = require('../services/slack-service');
        await SlackService.sendTest(req.user._id, req.body?.event || 'leadCreated');
        res.status(200).json({ status: 'success', message: 'Test message sent' });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/whatsapp/connect  { accessToken, phoneNumberId, recipientNumber }
router.post('/whatsapp/connect', auth, async (req, res) => {
    const schema = joi.object({
        accessToken: joi.string().trim().required(),
        phoneNumberId: joi.string().trim().required(),
        recipientNumber: joi.string().trim().required()
    });

    try {
        const data = await schema.validateAsync(req.body);
        const whatsappUtil = require('../utils/whatsapp');

        const recipient = whatsappUtil.normalizeNumber(data.recipientNumber);
        if (recipient.length < 8) {
            return res.status(400).json({ status: 'error', message: 'Recipient number must include the country code, e.g. +15551234567' });
        }

        // Verify the credentials against the Graph API before saving
        let info;
        try {
            info = await whatsappUtil.getPhoneNumberInfo(data.accessToken, data.phoneNumberId);
        } catch (err) {
            return res.status(400).json({ status: 'error', message: whatsappUtil.describeGraphError(err) });
        }

        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            {
                whatsappAccessToken: data.accessToken,
                whatsappPhoneNumberId: data.phoneNumberId,
                whatsappBusinessNumber: info.displayPhoneNumber,
                whatsappBusinessName: info.verifiedName,
                whatsappRecipientNumber: recipient,
                whatsappConnected: true
            },
            { upsert: true }
        );

        res.status(200).json({
            status: 'success',
            message: 'WhatsApp connected',
            data: {
                businessNumber: info.displayPhoneNumber,
                businessName: info.verifiedName,
                recipientNumber: recipient
            }
        });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/whatsapp/disconnect
router.post('/whatsapp/disconnect', auth, async (req, res) => {
    try {
        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            {
                whatsappConnected: false,
                whatsappAccessToken: '',
                whatsappPhoneNumberId: '',
                whatsappBusinessNumber: '',
                whatsappBusinessName: '',
                whatsappRecipientNumber: ''
            }
        );
        res.status(200).json({ status: 'success', message: 'WhatsApp disconnected' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PATCH /api/settings/whatsapp/preferences  { events?: { leadCreated: true, ... }, recipientNumber?: string }
router.patch('/whatsapp/preferences', auth, async (req, res) => {
    try {
        const update = {};
        const events = req.body?.events;
        if (events && typeof events === 'object') {
            for (const [k, v] of Object.entries(events)) {
                if (typeof v === 'boolean') update[`whatsappEvents.${k}`] = v;
            }
        }
        if (typeof req.body?.recipientNumber === 'string') {
            const whatsappUtil = require('../utils/whatsapp');
            const recipient = whatsappUtil.normalizeNumber(req.body.recipientNumber);
            if (recipient.length < 8) {
                return res.status(400).json({ status: 'error', message: 'Recipient number must include the country code, e.g. +15551234567' });
            }
            update.whatsappRecipientNumber = recipient;
        }
        if (!Object.keys(update).length) {
            return res.status(400).json({ status: 'error', message: 'No valid preferences provided' });
        }
        await Settings.findOneAndUpdate({ userId: req.user._id }, { $set: update }, { upsert: true });
        res.status(200).json({ status: 'success', data: update });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/whatsapp/test  { event?: string }
router.post('/whatsapp/test', auth, async (req, res) => {
    try {
        const WhatsAppService = require('../services/whatsapp-service');
        await WhatsAppService.sendTest(req.user._id, req.body?.event || 'leadCreated');
        res.status(200).json({ status: 'success', message: 'Test message sent' });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
});

// PATCH /api/settings/whatsapp/reminders  { enabled?, templateName?, templateLanguage?, leadMinutes? }
router.patch('/whatsapp/reminders', auth, async (req, res) => {
    const schema = joi.object({
        enabled: joi.boolean(),
        templateName: joi.string().trim().allow(''),
        templateLanguage: joi.string().trim().max(15),
        leadMinutes: joi.number().integer().min(5).max(7 * 24 * 60)
    }).min(1);

    try {
        const data = await schema.validateAsync(req.body);
        const update = {};
        if (data.enabled !== undefined) update['whatsappReminders.enabled'] = data.enabled;
        if (data.templateName !== undefined) update['whatsappReminders.templateName'] = data.templateName;
        if (data.templateLanguage !== undefined) update['whatsappReminders.templateLanguage'] = data.templateLanguage;
        if (data.leadMinutes !== undefined) update['whatsappReminders.leadMinutes'] = data.leadMinutes;

        await Settings.findOneAndUpdate({ userId: req.user._id }, { $set: update }, { upsert: true });
        res.status(200).json({ status: 'success', data: update });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/whatsapp/reminders/test — sends the template to the owner's own number
router.post('/whatsapp/reminders/test', auth, async (req, res) => {
    try {
        const reminderService = require('../services/appointment-reminder-service');
        await reminderService.sendTest(req.user._id);
        res.status(200).json({ status: 'success', message: 'Test reminder sent' });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/n8n/connect  { url }
router.post('/n8n/connect', auth, async (req, res) => {
    const schema = joi.object({
        url: joi.string().trim().uri({ scheme: ['http', 'https'] }).required()
    });

    try {
        const data = await schema.validateAsync(req.body);

        // No connect-time ping: n8n production webhook URLs return 404 until
        // the workflow is activated — the Send-test button is the delivery check.
        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            { n8nWebhookUrl: data.url, n8nConnected: true },
            { upsert: true }
        );

        res.status(200).json({
            status: 'success',
            message: 'n8n connected',
            data: { url: data.url }
        });
    } catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/n8n/disconnect
router.post('/n8n/disconnect', auth, async (req, res) => {
    try {
        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            { n8nConnected: false, n8nWebhookUrl: '' }
        );
        res.status(200).json({ status: 'success', message: 'n8n disconnected' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PATCH /api/settings/n8n/preferences  { events: { leadCreated: true, ... } }
router.patch('/n8n/preferences', auth, async (req, res) => {
    try {
        const events = req.body?.events;
        if (!events || typeof events !== 'object') {
            return res.status(400).json({ status: 'error', message: 'events object required' });
        }
        const update = {};
        for (const [k, v] of Object.entries(events)) {
            if (typeof v === 'boolean') update[`n8nEvents.${k}`] = v;
        }
        if (!Object.keys(update).length) {
            return res.status(400).json({ status: 'error', message: 'No valid events provided' });
        }
        await Settings.findOneAndUpdate({ userId: req.user._id }, { $set: update }, { upsert: true });
        res.status(200).json({ status: 'success', data: update });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/n8n/test  { event?: string }
router.post('/n8n/test', auth, async (req, res) => {
    try {
        const N8nService = require('../services/n8n-service');
        await N8nService.sendTest(req.user._id, req.body?.event || 'leadCreated');
        res.status(200).json({ status: 'success', message: 'Test event sent' });
    } catch (err) {
        res.status(err.status || 500).json({ status: 'error', message: err.message });
    }
});

// POST /api/settings/google-calendar/disconnect
router.post('/google-calendar/disconnect', auth, async (req, res) => {
    try {
        await Settings.findOneAndUpdate(
            { userId: req.user._id },
            {
                googleCalendarConnected: false,
                googleCalendarAccessToken: '',
                googleCalendarRefreshToken: '',
                googleCalendarEmail: ''
            }
        );
        res.status(200).json({ status: 'success', message: 'Google Calendar disconnected' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
