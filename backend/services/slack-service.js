const axios = require('axios');
const Settings = require('../models/Settings');
const { getAppName } = require('../utils/app-name');

function fmtPhone(p) {
    if (!p) return '';
    const digits = String(p).replace(/\D/g, '');
    if (digits.length >= 10) return `+${digits}`;
    return p;
}

function fmtDateTime(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return String(iso);
    }
}

const EVENT_META = {
    leadCreated: { emoji: ':bust_in_silhouette:', title: 'New lead created' },
    leadQualified: { emoji: ':white_check_mark:', title: 'Lead qualified' },
    inboundCall: { emoji: ':telephone_receiver:', title: 'Inbound call' },
    outboundCall: { emoji: ':outbox_tray:', title: 'Outbound call started' },
    callCompleted: { emoji: ':phone:', title: 'Call completed' },
    campaignCompleted: { emoji: ':checkered_flag:', title: 'Campaign completed' },
    appointmentBooked: { emoji: ':date:', title: 'Appointment booked' },
    appointmentCanceled: { emoji: ':x:', title: 'Appointment canceled' },
    callTransferred: { emoji: ':twisted_rightwards_arrows:', title: 'Caller transferred to a human' },
    transferFailed: { emoji: ':warning:', title: 'Human transfer failed' }
};

/**
 * Build a Slack Block Kit message for a given event + data payload.
 * Returns { text, blocks } — text is a fallback for notifications.
 */
function buildMessage(event, data, appName = 'IntelliCallAI') {
    const meta = EVENT_META[event] || { emoji: ':bell:', title: event };
    const fields = [];

    switch (event) {
        case 'leadCreated': {
            const lead = data?.lead || data || {};
            if (lead.name) fields.push({ type: 'mrkdwn', text: `*Name:*\n${lead.name}` });
            if (lead.phone) fields.push({ type: 'mrkdwn', text: `*Phone:*\n${fmtPhone(lead.phone)}` });
            break;
        }
        case 'leadQualified': {
            const lead = data?.lead || {};
            if (lead.name) fields.push({ type: 'mrkdwn', text: `*Name:*\n${lead.name}` });
            if (lead.phone) fields.push({ type: 'mrkdwn', text: `*Phone:*\n${fmtPhone(lead.phone)}` });
            if (data?.score != null) fields.push({ type: 'mrkdwn', text: `*Score:*\n${data.score}` });
            if (data?.reason) fields.push({ type: 'mrkdwn', text: `*Reason:*\n${data.reason}` });
            break;
        }
        case 'inboundCall':
        case 'outboundCall':
        case 'callCompleted': {
            if (data?.from) fields.push({ type: 'mrkdwn', text: `*From:*\n${fmtPhone(data.from)}` });
            if (data?.to) fields.push({ type: 'mrkdwn', text: `*To:*\n${fmtPhone(data.to)}` });
            if (data?.duration != null) fields.push({ type: 'mrkdwn', text: `*Duration:*\n${data.duration}s` });
            if (data?.status) fields.push({ type: 'mrkdwn', text: `*Status:*\n${data.status}` });
            if (data?.provider) fields.push({ type: 'mrkdwn', text: `*Provider:*\n${data.provider}` });
            break;
        }
        case 'campaignCompleted': {
            if (data?.name) fields.push({ type: 'mrkdwn', text: `*Campaign:*\n${data.name}` });
            if (data?.campaignId) fields.push({ type: 'mrkdwn', text: `*ID:*\n${data.campaignId}` });
            if (data?.totalCalls != null) fields.push({ type: 'mrkdwn', text: `*Total calls:*\n${data.totalCalls}` });
            break;
        }
        case 'callTransferred':
        case 'transferFailed': {
            fields.push({ type: 'mrkdwn', text: `*Destination:*\n${data.destinationName || data.destinationId || '—'}` });
            if (data.agentName) fields.push({ type: 'mrkdwn', text: `*Agent:*\n${data.agentName}` });
            if (event === 'transferFailed') {
                fields.push({ type: 'mrkdwn', text: `*Outcome:*\n${data.result || 'FAILED'}` });
            }
            fields.push({ type: 'mrkdwn', text: `*Attempt:*\n${data.attempt || 1}` });
            break;
        }
        case 'appointmentBooked':
        case 'appointmentCanceled': {
            const a = data || {};
            if (a.clientName || a.clientPhone) {
                fields.push({ type: 'mrkdwn', text: `*Client:*\n${a.clientName || fmtPhone(a.clientPhone)}` });
            }
            if (a.clientPhone) fields.push({ type: 'mrkdwn', text: `*Phone:*\n${fmtPhone(a.clientPhone)}` });
            if (a.dateTime) fields.push({ type: 'mrkdwn', text: `*When:*\n${fmtDateTime(a.dateTime)}` });
            if (a.duration) fields.push({ type: 'mrkdwn', text: `*Duration:*\n${a.duration} min` });
            break;
        }
        default:
            break;
    }

    const blocks = [
        {
            type: 'header',
            text: { type: 'plain_text', text: `${meta.emoji} ${meta.title}` }
        }
    ];
    if (fields.length) {
        // Slack section "fields" must be at most 10 entries
        blocks.push({ type: 'section', fields: fields.slice(0, 10) });
    }
    blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: appName }]
    });

    return {
        text: `${meta.title}`, // fallback for notifications
        blocks
    };
}

class SlackService {
    /**
     * Send an event notification to the user's connected Slack channel.
     * Silently no-ops when not connected, the event is toggled off, or any error occurs.
     */
    static async trigger(userId, event, data) {
        try {
            const settings = await Settings.findOne({ userId });
            if (!settings || !settings.slackConnected || !settings.slackWebhookUrl) return;
            if (settings.slackEvents && settings.slackEvents[event] === false) return;

            const payload = buildMessage(event, data, await getAppName());

            // Fire-and-forget POST to the channel webhook
            axios.post(settings.slackWebhookUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 8000
            }).then(() => {
                console.log(`[Slack] '${event}' delivered to #${settings.slackChannelName || 'channel'}`);
            }).catch((err) => {
                const msg = err.response ? `Status ${err.response.status} ${JSON.stringify(err.response.data || '')}` : err.message;
                console.error(`[Slack] Failed to deliver '${event}': ${msg}`);
            });
        } catch (err) {
            console.error(`[Slack Service Error] ${err.message}`);
        }
    }

    /** Send a test message with sample data so users can verify wiring. */
    static async sendTest(userId, event = 'leadCreated') {
        try {
            const settings = await Settings.findOne({ userId });
            if (!settings || !settings.slackConnected || !settings.slackWebhookUrl) {
                const err = new Error('Slack is not connected');
                err.status = 400;
                throw err;
            }
            const sample = {
                leadCreated: { lead: { name: 'Jane Doe (test)', phone: '+15551234567' } },
                leadQualified: { lead: { name: 'Jane Doe (test)', phone: '+15551234567' }, score: 9, reason: 'Sample qualification' },
                callCompleted: { from: '+15551234567', to: '+15557654321', duration: 142, status: 'completed', provider: 'twilio' },
                appointmentBooked: { clientName: 'Jane Doe (test)', clientPhone: '+15551234567', dateTime: new Date().toISOString(), duration: 30 }
            }[event] || { sample: true };
            const payload = buildMessage(event, sample, await getAppName());
            await axios.post(settings.slackWebhookUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 8000
            });
            return true;
        } catch (err) {
            if (err.status) throw err;
            const e = new Error(err.response?.data || err.message || 'Failed to send test Slack message');
            e.status = 502;
            throw e;
        }
    }
}

module.exports = SlackService;
