const axios = require('axios');
const Settings = require('../models/Settings');

/**
 * N8nService delivers platform events to the user's n8n Webhook node.
 * Payload matches the generic webhook hub: { event, timestamp, data }.
 * n8n webhook URLs are unguessable, so deliveries are unsigned — users who
 * want HMAC-verified delivery can use the generic Webhooks tab instead.
 */
class N8nService {
    /**
     * Send an event to the user's n8n webhook.
     * Silently no-ops when not connected, the event is toggled off, or any error occurs.
     */
    static async trigger(userId, event, data) {
        try {
            const settings = await Settings.findOne({ userId });
            if (!settings || !settings.n8nConnected || !settings.n8nWebhookUrl) return;
            if (settings.n8nEvents && settings.n8nEvents[event] === false) return;

            const payload = {
                event,
                timestamp: new Date().toISOString(),
                data
            };

            // Fire-and-forget POST to the n8n Webhook node
            axios.post(settings.n8nWebhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'IntelliCall-AI-n8n/1.0'
                },
                timeout: 8000
            }).then(() => {
                console.log(`[n8n] '${event}' delivered`);
            }).catch((err) => {
                const msg = err.response ? `Status ${err.response.status}` : err.message;
                console.error(`[n8n] Failed to deliver '${event}': ${msg}`);
            });
        } catch (err) {
            console.error(`[n8n Service Error] ${err.message}`);
        }
    }

    /** Send a test event with sample data so users can verify wiring. */
    static async sendTest(userId, event = 'leadCreated') {
        const settings = await Settings.findOne({ userId });
        if (!settings || !settings.n8nConnected || !settings.n8nWebhookUrl) {
            const err = new Error('n8n is not connected');
            err.status = 400;
            throw err;
        }
        const sample = {
            leadCreated: { lead: { name: 'Jane Doe (test)', phone: '+15551234567' } },
            leadQualified: { lead: { name: 'Jane Doe (test)', phone: '+15551234567' }, score: 9, reason: 'Sample qualification' },
            callCompleted: { from: '+15551234567', to: '+15557654321', duration: 142, status: 'completed', provider: 'twilio' },
            appointmentBooked: { clientName: 'Jane Doe (test)', clientPhone: '+15551234567', dateTime: new Date().toISOString(), duration: 30 }
        }[event] || { sample: true };

        try {
            await axios.post(settings.n8nWebhookUrl, {
                event,
                timestamp: new Date().toISOString(),
                isTest: true,
                data: sample
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'IntelliCall-AI-n8n/1.0'
                },
                timeout: 8000
            });
            return true;
        } catch (err) {
            let message;
            if (err.response?.status === 404) {
                message = 'n8n returned 404 — make sure the workflow is Active when using the Production URL, or click "Listen for test event" in n8n when using the Test URL.';
            } else if (err.response) {
                message = `n8n responded with status ${err.response.status}`;
            } else {
                message = `Could not reach the n8n webhook URL: ${err.message}`;
            }
            const e = new Error(message);
            e.status = 502;
            throw e;
        }
    }
}

module.exports = N8nService;
