const express = require('express');
const twilio = require('twilio');
const { auth, requireActivePlan } = require('../middleware/auth');
const checkLimit = require('../middleware/limit-checker');
const Settings = require('../models/Settings');
const Agent = require('../models/Agent');
const Lead = require('../models/Lead');
const PhoneNumber = require('../models/PhoneNumber');
const joi = require('joi');
const WebhookService = require('../services/webhook-service');
const AdminSettings = require('../models/AdminSettings');
const { missingEngineKeys } = require('../utils/engine-keys');

const router = express.Router();

// Request timeout for test call. SIP/Asterisk + trunk can be slow to originate; use 55s default so setup can complete.
// Set TEST_CALL_TIMEOUT_MS (e.g. 90000) if your proxy allows and trunks are very slow.
const TEST_CALL_TIMEOUT_MS = parseInt(process.env.TEST_CALL_TIMEOUT_MS, 10) || 55000;

// POST /api/calls/test
// Trigger a test call using stored Twilio credentials
router.post('/test', auth, async (req, res) => {
    const schema = joi.object({
        to: joi.string().required().description('Destination phone number in E.164 format'),
        fromNumberId: joi.string().optional().description('Optional: ID of the phone number to call from')
    });

    let timeoutId = null;
    let responseSent = false;
    const send = (status, body) => {
        if (responseSent) return;
        responseSent = true;
        if (timeoutId) clearTimeout(timeoutId);
        res.status(status).json(body);
    };

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error('Test call request timed out. Check Asterisk/SIP connectivity or increase proxy timeout.'));
        }, TEST_CALL_TIMEOUT_MS);
    });

    const run = async () => {
        const { to, fromNumberId } = await schema.validateAsync(req.body);

        // Fetch global settings
        const settings = await Settings.findOne({ userId: req.user._id });

        // Use specific number if provided, otherwise use default
        // Populate sipTrunkId so SIP path can resolve trunk without re-fetching
        const fromNumber = fromNumberId
            ? await PhoneNumber.findOne({ _id: fromNumberId, createdBy: req.user._id }).populate('sipTrunkId')
            : await PhoneNumber.findOne({ createdBy: req.user._id }).populate('sipTrunkId');

        if (!fromNumber) {
            return send(404, { status: 'error', message: 'Phone number configuration not found.' });
        }

        // --- BRANCH FOR SIP TRUNKS ---
        if (fromNumber.provider === 'sip') {
            const ariService = require('../services/sip/ari-service');
            if (!ariService.isConnected()) {
                return send(400, { status: 'error', message: 'Asterisk not connected. Ensure the Voice Engine is running.' });
            }

            // Need an agent for voice (voiceId / Sarvam speaker); use any agent for test
            let agent = await Agent.findOne({ _id: fromNumber.inboundAgentId, createdBy: req.user._id }).populate('outboundPhoneNumber');
            if (!agent) {
                agent = await Agent.findOne({ createdBy: req.user._id }).populate('outboundPhoneNumber');
            }
            if (!agent) {
                return send(400, {
                    status: 'error',
                    message: 'Create at least one Agent (used for voice on test call).'
                });
            }

            // The test call only speaks a phrase via TTS. Sarvam agents use Bulbul TTS (Sarvam key);
            // every other engine uses ElevenLabs for the test phrase.
            if (agent.voiceEngine === 'sarvam') {
                if (!settings || !settings.sarvamKey) {
                    return send(400, { status: 'error', message: 'SIP test call for a Sarvam agent requires a Sarvam API key. Configure it in Settings.' });
                }
            } else if (!settings || !settings.elevenLabsKey) {
                return send(400, {
                    status: 'error',
                    message: 'SIP test call requires ElevenLabs API key. Configure it in Settings.'
                });
            }

            // Find or create a temporary lead for the test
            let lead = await Lead.findOne({ phone: to.replace(/\D/g, ''), createdBy: req.user._id });
            if (!lead) {
                lead = new Lead({
                    name: `SIP Test (${to})`,
                    phone: to.replace(/\D/g, ''),
                    createdBy: req.user._id,
                    tags: ['test']
                });
                await lead.save();
            }

            const sipManager = require('../services/sip/sip-manager');
            const adminSettings = await AdminSettings.findOne({});
            let appName = 'IntelliCall AI';
            if (adminSettings && adminSettings.branding && adminSettings.branding.appName) {
                appName = adminSettings.branding.appName;
            }

            const testPhrase = `Hello from ${appName}. This is a test call to verify your SIP integration. Your settings are configured correctly. Goodbye!`;
            const result = await sipManager.placeCall({
                phoneNumber: fromNumber,
                agent,
                lead,
                campaign: null,
                userId: req.user._id,
                testCall: true,
                testPhrase
            });

            // Trigger Outbound Call Webhook
            WebhookService.trigger(req.user._id, 'outboundCall', {
                leadId: lead._id,
                phoneNumber: fromNumber.phoneNumber,
                direction: 'outbound',
                provider: 'sip'
            });

            return send(200, {
                status: 'success',
                message: 'SIP test call initiated via Asterisk',
                data: result
            });
        }

        // --- BRANCH FOR TWILIO ---
        if (!settings || !settings.twilioSid || !settings.twilioToken) {
            return send(400, {
                status: 'error',
                message: 'Twilio credentials not configured. Please check your settings.'
            });
        }

        const client = twilio(settings.twilioSid, settings.twilioToken);

        const adminSettings = await AdminSettings.findOne({});
        let appName = 'IntelliCall AI';
        if (adminSettings && adminSettings.branding && adminSettings.branding.appName) {
            appName = adminSettings.branding.appName;
        }

        // Simple TwiML for the test call
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say(`Hello from ${appName}. This is a test call to verify your Twilio integration. Your settings are configured correctly. Goodbye!`);

        const call = await client.calls.create({
            twiml: twiml.toString(),
            to: to,
            from: fromNumber.phoneNumber
        });

        send(200, {
            status: 'success',
            message: 'Test call initiated',
            data: {
                callSid: call.sid,
                status: call.status
            }
        });
    };

    try {
        await Promise.race([run(), timeoutPromise]);
    } catch (err) {
        console.error('Test Call Error:', err);
        if (!responseSent) {
            const status = err.message && err.message.includes('timed out') ? 503 : (err.status || 500);
            send(status, { status: 'error', message: err.message || 'Failed to initiate test call' });
        }
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
});

// POST /api/calls/ai-test
// Trigger a full AI conversation test call using webhooks
router.post('/ai-test', auth, async (req, res) => {
    const schema = joi.object({
        to: joi.string().required()
    });

    try {
        const { to } = await schema.validateAsync(req.body);

        const settings = await Settings.findOne({ userId: req.user._id });

        const [agent, lead] = await Promise.all([
            Agent.findOne({ createdBy: req.user._id }).populate('outboundPhoneNumber'),
            Lead.findOne({ createdBy: req.user._id })
        ]);

        if (!agent || !agent.outboundPhoneNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'Need an Agent (with outbound phone number) to run AI test'
            });
        }

        const provider = agent.outboundPhoneNumber.provider || 'twilio';

        // --- AI INFRASTRUCTURE VALIDATION (keys required depend on the agent's voice engine) ---
        const missing = missingEngineKeys(settings, agent, provider);
        if (missing.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: `Missing AI Configuration: ${missing.join(', ')}. Please configure these in Settings first.`
            });
        }

        // --- BRANCH FOR SIP ---
        if (provider === 'sip') {
            const ariService = require('../services/sip/ari-service');
            if (!ariService.isConnected()) {
                return res.status(400).json({ status: 'error', message: 'Asterisk not connected. Ensure Voice Engine is running.' });
            }

            // Find or create lead
            let testLead = lead;
            if (!testLead) {
                testLead = new Lead({
                    name: `AI Test (${to})`,
                    phone: to.replace(/\D/g, ''),
                    createdBy: req.user._id,
                    tags: ['test']
                });
                await testLead.save();
            }

            const sipManager = require('../services/sip/sip-manager');
            const result = await sipManager.placeCall({
                phoneNumber: agent.outboundPhoneNumber,
                agent,
                lead: testLead,
                campaign: null,
                userId: req.user._id
            });

            return res.status(200).json({
                status: 'success',
                message: 'AI SIP test call initiated via Asterisk',
                data: result
            });
        }

        // --- BRANCH FOR TWILIO ---
        if (!settings || !settings.twilioSid || !settings.twilioToken) {
            return res.status(400).json({
                status: 'error',
                message: 'Twilio credentials not configured'
            });
        }

        const twilio = require('twilio');
        const client = twilio(settings.twilioSid, settings.twilioToken);
        const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;

        // Find or create a lead for Twilio test if none exists
        let twilioLead = lead;
        if (!twilioLead) {
            twilioLead = new Lead({ name: 'Twilio Test User', phone: to.replace(/\D/g, ''), createdBy: req.user._id });
            await twilioLead.save();
        }

        const call = await client.calls.create({
            url: `${baseUrl}/api/twilio/voice?userId=${req.user._id}&agentId=${agent._id}&leadId=${twilioLead._id}`,
            to: to,
            from: agent.outboundPhoneNumber.phoneNumber,
            record: settings.recordingEnabled ?? true,
            statusCallback: `${baseUrl}/api/twilio/status`,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        });

        // Trigger Outbound Call Webhook
        WebhookService.trigger(req.user._id, 'outboundCall', {
            callSid: call.sid,
            leadId: twilioLead._id,
            phoneNumber: agent.outboundPhoneNumber.phoneNumber,
            direction: 'outbound',
            provider: 'twilio'
        });

        res.status(200).json({
            status: 'success',
            message: 'AI Conversation test initiated',
            data: { callSid: call.sid }
        });
    } catch (err) {
        console.error('AI Test Error:', err);
        res.status(err.status || 500).json({
            status: 'error',
            message: err.message || 'Failed to initiate AI test call'
        });
    }
});

// POST /api/calls/dial
// Dial one lead with a chosen agent right now — no campaign needed.
// Designed for automation (n8n, Zapier, curl) via the personal API key,
// but works with a dashboard JWT too. Counts toward the monthly call limit.
router.post('/dial', auth, requireActivePlan, checkLimit('calls'), async (req, res) => {
    const schema = joi.object({
        to: joi.string().trim().required().description('Destination phone number'),
        agentId: joi.string().trim().required().description('Agent to run the call'),
        name: joi.string().trim().allow('').description('Lead name when a new lead is created'),
        fromNumberId: joi.string().trim().description('Override the agent\'s outbound phone number'),
        tags: joi.array().items(joi.string().trim()).description('Extra tags for a newly created lead')
    });

    try {
        const data = await schema.validateAsync(req.body);
        const { to, agentId, fromNumberId } = data;

        // 1. AI infrastructure is validated per-agent below (keys depend on the voice engine).
        const settings = await Settings.findOne({ userId: req.user._id });

        // 2. Agent must exist and belong to this user
        const agent = await Agent.findOne({ _id: agentId, createdBy: req.user._id })
            .populate('outboundPhoneNumber');
        if (!agent) {
            return res.status(404).json({ status: 'error', message: 'Agent not found' });
        }

        // 3. Resolve the outbound number
        let fromNumber = agent.outboundPhoneNumber;
        if (fromNumberId) {
            fromNumber = await PhoneNumber.findOne({ _id: fromNumberId, createdBy: req.user._id });
            if (!fromNumber) {
                return res.status(404).json({ status: 'error', message: 'Phone number not found' });
            }
        }
        if (!fromNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'Agent has no outbound phone number — assign one to the agent or pass fromNumberId'
            });
        }

        // 4. Get or create the lead by normalized phone
        const normalizedPhone = to.replace(/\D/g, '');
        let lead = await Lead.findOne({ phone: normalizedPhone, createdBy: req.user._id });
        let leadCreated = false;
        if (!lead) {
            const tags = Array.from(new Set([...(data.tags || []), 'api']));
            lead = new Lead({
                name: data.name || `Lead ${to}`,
                phone: normalizedPhone,
                createdBy: req.user._id,
                tags
            });
            await lead.save();
            leadCreated = true;
        }

        const provider = fromNumber.provider || 'twilio';

        const missing = missingEngineKeys(settings, agent, provider);
        if (missing.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: `Missing AI Configuration: ${missing.join(', ')}. Please configure these in Settings first.`
            });
        }

        // 5a. SIP branch
        if (provider === 'sip') {
            const ariService = require('../services/sip/ari-service');
            if (!ariService.isConnected()) {
                return res.status(400).json({ status: 'error', message: 'Asterisk not connected. Ensure Voice Engine is running.' });
            }

            const sipManager = require('../services/sip/sip-manager');
            const result = await sipManager.placeCall({
                phoneNumber: fromNumber,
                agent,
                lead,
                campaign: null,
                userId: req.user._id
            });

            WebhookService.trigger(req.user._id, 'outboundCall', {
                leadId: lead._id,
                agentId: agent._id,
                phoneNumber: fromNumber.phoneNumber,
                direction: 'outbound',
                provider: 'sip'
            });

            return res.status(200).json({
                status: 'success',
                message: 'Call initiated',
                data: { ...result, leadId: lead._id, leadCreated, agentId: agent._id, from: fromNumber.phoneNumber, provider: 'sip' }
            });
        }

        // 5b. Twilio branch
        if (!settings.twilioSid || !settings.twilioToken) {
            return res.status(400).json({ status: 'error', message: 'Twilio credentials not configured' });
        }

        const client = twilio(settings.twilioSid, settings.twilioToken);
        const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;

        const call = await client.calls.create({
            url: `${baseUrl}/api/twilio/voice?userId=${req.user._id}&agentId=${agent._id}&leadId=${lead._id}`,
            to: to,
            from: fromNumber.phoneNumber,
            record: settings.recordingEnabled ?? true,
            statusCallback: `${baseUrl}/api/twilio/status`,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        });

        WebhookService.trigger(req.user._id, 'outboundCall', {
            callSid: call.sid,
            leadId: lead._id,
            agentId: agent._id,
            phoneNumber: fromNumber.phoneNumber,
            direction: 'outbound',
            provider: 'twilio'
        });

        res.status(200).json({
            status: 'success',
            message: 'Call initiated',
            data: { callSid: call.sid, leadId: lead._id, leadCreated, agentId: agent._id, from: fromNumber.phoneNumber, provider: 'twilio' }
        });
    } catch (err) {
        console.error('Dial Error:', err);
        // Don't let an upstream Twilio 401 read like an IntelliCall auth failure
        const isTwilioAuth = err.code === 20003 || (err.status === 401 && err.moreInfo);
        res.status(isTwilioAuth ? 502 : (err.status || 500)).json({
            status: 'error',
            message: isTwilioAuth
                ? 'Twilio rejected the configured credentials — check the Twilio SID and token in Settings.'
                : (err.message || 'Failed to initiate call')
        });
    }
});

// POST /api/calls/sip-test
// Trigger a test call via SIP trunk (Asterisk)
router.post('/sip-test', auth, async (req, res) => {
    const schema = joi.object({
        to: joi.string().required().description('Destination phone number'),
        agentId: joi.string().required().description('Agent ID to use for the call')
    });

    try {
        const { to, agentId } = await schema.validateAsync(req.body);

        const ariService = require('../services/sip/ari-service');
        if (!ariService.isConnected()) {
            return res.status(400).json({
                status: 'error',
                message: 'Asterisk not connected. Ensure Asterisk is running and ARI is configured.'
            });
        }

        const agent = await Agent.findOne({ _id: agentId, createdBy: req.user._id }).populate('outboundPhoneNumber');
        if (!agent || !agent.outboundPhoneNumber) {
            return res.status(400).json({ status: 'error', message: 'Agent with outbound phone number required' });
        }

        // Find or create a temporary lead for the test
        let lead = await Lead.findOne({ phone: to.replace(/\D/g, ''), createdBy: req.user._id });
        if (!lead) {
            lead = new Lead({ name: `SIP Test (${to})`, phone: to.replace(/\D/g, ''), createdBy: req.user._id, tags: ['test'] });
            await lead.save();
        }

        const sipManager = require('../services/sip/sip-manager');
        const result = await sipManager.placeCall({
            phoneNumber: agent.outboundPhoneNumber,
            agent, lead, campaign: null, userId: req.user._id
        });

        res.status(200).json({
            status: 'success',
            message: 'SIP test call initiated via Asterisk',
            data: result
        });
    } catch (err) {
        console.error('SIP Test Call Error:', err);
        res.status(err.status || 500).json({
            status: 'error',
            message: err.message || 'Failed to initiate SIP test call'
        });
    }
});

module.exports = router;
