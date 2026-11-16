/**
 * Campaign runner: starts a campaign by ID (used by POST /start and by the scheduler).
 * Validates config, sets status to running, then runs the background call loop.
 * @param {string} campaignId - Campaign _id
 * @param {object} options - { userId, origin } optional; userId defaults to campaign.createdBy,
 *   origin (the webhook origin of the request that started it) defaults to BASE_URL
 * @returns {Promise<{ campaign, provider }>} - Resolves when campaign is set to running and background work is queued
 * @throws Error on validation or not found
 */
const Campaign = require('../models/Campaign');
const WebhookService = require('./webhook-service');
const { missingEngineKeys } = require('../utils/engine-keys');
const { webhookOrigin } = require('../utils/public-url');
const { resolveDialNumber } = require('../utils/dial-number');

async function runCampaign(campaignId, options = {}) {
    const campaign = await Campaign.findById(campaignId).populate('leadIds');
    if (!campaign) {
        const err = new Error('Campaign not found');
        err.status = 404;
        throw err;
    }

    const userId = options.userId || campaign.createdBy?.toString?.() || campaign.createdBy;
    if (!userId) {
        const err = new Error('Campaign has no owner');
        err.status = 400;
        throw err;
    }

    if (campaign.status === 'running') {
        const err = new Error('Campaign is already running');
        err.status = 400;
        throw err;
    }

    const Agent = require('../models/Agent');
    const PhoneNumber = require('../models/PhoneNumber');
    const agent = await Agent.findById(campaign.agentId).populate('outboundPhoneNumber');
    const outboundNumber = agent?.outboundPhoneNumber
        ? await PhoneNumber.findById(agent.outboundPhoneNumber._id || agent.outboundPhoneNumber).populate('sipTrunkId')
        : null;
    const provider = outboundNumber?.provider || 'twilio';

    const settings = await require('../models/Settings').findOne({ userId });
    // Key requirements depend on the agent's voice engine: deepgram_agent skips OpenRouter,
    // and sarvam is self-contained (only a Sarvam key). See utils/engine-keys.
    const missing = missingEngineKeys(settings, agent, provider);
    if (missing.length > 0) {
        const err = new Error(`Missing AI Configuration: ${missing.join(', ')}. Please configure these in Settings before starting a campaign.`);
        err.status = 400;
        throw err;
    }

    if (provider === 'twilio') {
        if (!settings.twilioSid || !settings.twilioToken) {
            const err = new Error('Twilio SID or Token not configured. Required for Twilio-based campaigns.');
            err.status = 400;
            throw err;
        }
        if (!outboundNumber?.phoneNumber) {
            const err = new Error('No outbound phone number configured for this agent. Please assign a Twilio number in Agent settings.');
            err.status = 400;
            throw err;
        }
    } else if (provider === 'sip') {
        const ariService = require('./sip/ari-service');
        if (!ariService.isConnected()) {
            const err = new Error('Asterisk Voice Engine not connected. Ensure the server is running and ARI is configured.');
            err.status = 400;
            throw err;
        }
    }

    campaign.status = 'running';
    if (campaign.scheduledAt) {
        campaign.scheduledAt = null;
    }
    await campaign.save();

    const baseUrl = options.origin || webhookOrigin(null);
    if (provider === 'twilio' && /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseUrl)) {
        console.warn(`[Campaign Engine] Twilio webhooks point at ${baseUrl}, which Twilio cannot reach — set BASE_URL in backend/.env to this server's public https URL.`);
    }

    setImmediate(async () => {
        console.log(`[Campaign Engine] Executing: ${campaign.name} (provider: ${provider})`);

        if (provider === 'sip') {
            const sipManager = require('./sip/sip-manager');
            for (const lead of campaign.leadIds) {
                console.log(`[Campaign Engine] [SIP] Calling: ${lead.name} (${lead.phone})`);
                try {
                    await sipManager.placeCall({
                        phoneNumber: outboundNumber, agent, lead,
                        campaign, userId
                    });
                    WebhookService.trigger(userId, 'outboundCall', {
                        campaignId: campaign._id, leadId: lead._id,
                        phoneNumber: outboundNumber?.phoneNumber, direction: 'outbound', provider: 'sip'
                    });
                } catch (callError) {
                    console.error(`[Campaign Engine] [SIP] Failed ${lead.phone}:`, callError.message);
                    // A call refused before dialling (bad number, trunk pointing at this
                    // server) carries its reason, so Call Logs says why.
                    await require('../models/CallLog').create({
                        campaignId: campaign._id, leadId: lead._id,
                        agentId: campaign.agentId._id || campaign.agentId,
                        userId, callSid: `failed-${Date.now()}-${lead._id}`,
                        status: 'failed', provider: 'sip', startTime: new Date(),
                        ...(callError.callError ? { errors: [callError.callError] } : {})
                    });
                }
            }
        } else {
            const twilio = require('twilio');
            const client = twilio(settings.twilioSid, settings.twilioToken);
            for (const lead of campaign.leadIds) {
                console.log(`[Campaign Engine] Calling: ${lead.name} (${lead.phone})`);
                // Leads are stored as bare digits, which Twilio would read as US numbers.
                const dial = resolveDialNumber(lead.phone, outboundNumber.phoneNumber);
                if (dial.error) {
                    console.error(`[Campaign Engine] Not calling ${lead.phone}: ${dial.error}`);
                    await require('../models/CallLog').create({
                        campaignId: campaign._id, leadId: lead._id,
                        agentId: campaign.agentId._id || campaign.agentId,
                        userId, callSid: `failed-${Date.now()}-${lead._id}`,
                        status: 'failed', startTime: new Date(),
                        errors: [{ service: 'twilio', code: 'invalid_number', message: dial.error }]
                    }).catch(err => console.error('[Campaign Engine] Could not log the refused call:', err.message));
                    continue;
                }
                try {
                    const call = await client.calls.create({
                        url: `${baseUrl}/api/twilio/voice?userId=${userId}&agentId=${campaign.agentId._id || campaign.agentId}&leadId=${lead._id}&campaignId=${campaign._id}`,
                        to: dial.number,
                        from: outboundNumber.phoneNumber,
                        record: settings.recordingEnabled ?? true,
                        statusCallback: `${baseUrl}/api/twilio/status`,
                        statusCallbackMethod: 'POST',
                        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
                    });
                    // $setOnInsert: if the callee already answered, the voice webhook has
                    // written this row first, and its live status must not go back to 'queued'.
                    await require('../models/CallLog').updateOne({ callSid: call.sid }, {
                        $setOnInsert: {
                            campaignId: campaign._id, leadId: lead._id,
                            agentId: campaign.agentId._id || campaign.agentId,
                            userId, callSid: call.sid, status: 'queued', startTime: new Date()
                        }
                    }, { upsert: true }).catch(err => {
                        if (err?.code !== 11000) throw err;
                    });
                    WebhookService.trigger(userId, 'outboundCall', {
                        campaignId: campaign._id, leadId: lead._id, callSid: call.sid,
                        phoneNumber: outboundNumber.phoneNumber, direction: 'outbound', provider: 'twilio'
                    });
                } catch (callError) {
                    console.error(`[Campaign Engine] Failed to call ${lead.phone}:`, callError.message);
                    await require('../models/CallLog').create({
                        campaignId: campaign._id, leadId: lead._id,
                        agentId: campaign.agentId._id || campaign.agentId,
                        userId, callSid: `failed-${Date.now()}-${lead._id}`,
                        status: 'failed', startTime: new Date()
                    });
                }
            }
        }

        WebhookService.trigger(userId, 'campaignCompleted', {
            campaignId: campaign._id, name: campaign.name, status: 'completed'
        });
        console.log(`[Campaign Engine] All calls triggered for: ${campaign.name}`);
    });

    return { campaign, provider };
}

module.exports = { runCampaign };
