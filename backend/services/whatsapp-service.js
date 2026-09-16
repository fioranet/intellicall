const Settings = require('../models/Settings');
const whatsapp = require('../utils/whatsapp');
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
    leadCreated: { emoji: '👤', title: 'New lead created' },
    leadQualified: { emoji: '✅', title: 'Lead qualified' },
    inboundCall: { emoji: '📞', title: 'Inbound call' },
    outboundCall: { emoji: '📤', title: 'Outbound call started' },
    callCompleted: { emoji: '☎️', title: 'Call completed' },
    campaignCompleted: { emoji: '🏁', title: 'Campaign completed' },
    appointmentBooked: { emoji: '📅', title: 'Appointment booked' },
    appointmentCanceled: { emoji: '❌', title: 'Appointment canceled' }
};

/**
 * Build a WhatsApp text message for a given event + data payload.
 * Uses WhatsApp formatting: *bold* labels, one field per line.
 */
function buildMessage(event, data, appName = 'IntelliCallAI') {
    const meta = EVENT_META[event] || { emoji: '🔔', title: event };
    const lines = [];

    switch (event) {
        case 'leadCreated': {
            const lead = data?.lead || data || {};
            if (lead.name) lines.push(`*Name:* ${lead.name}`);
            if (lead.phone) lines.push(`*Phone:* ${fmtPhone(lead.phone)}`);
            break;
        }
        case 'leadQualified': {
            const lead = data?.lead || {};
            if (lead.name) lines.push(`*Name:* ${lead.name}`);
            if (lead.phone) lines.push(`*Phone:* ${fmtPhone(lead.phone)}`);
            if (data?.score != null) lines.push(`*Score:* ${data.score}`);
            if (data?.reason) lines.push(`*Reason:* ${data.reason}`);
            break;
        }
        case 'inboundCall':
        case 'outboundCall':
        case 'callCompleted': {
            if (data?.from) lines.push(`*From:* ${fmtPhone(data.from)}`);
            if (data?.to) lines.push(`*To:* ${fmtPhone(data.to)}`);
            if (data?.duration != null) lines.push(`*Duration:* ${data.duration}s`);
            if (data?.status) lines.push(`*Status:* ${data.status}`);
            if (data?.provider) lines.push(`*Provider:* ${data.provider}`);
            break;
        }
        case 'campaignCompleted': {
            if (data?.name) lines.push(`*Campaign:* ${data.name}`);
            if (data?.campaignId) lines.push(`*ID:* ${data.campaignId}`);
            if (data?.totalCalls != null) lines.push(`*Total calls:* ${data.totalCalls}`);
            break;
        }
        case 'appointmentBooked':
        case 'appointmentCanceled': {
            const a = data || {};
            if (a.clientName || a.clientPhone) {
                lines.push(`*Client:* ${a.clientName || fmtPhone(a.clientPhone)}`);
            }
            if (a.clientPhone) lines.push(`*Phone:* ${fmtPhone(a.clientPhone)}`);
            if (a.dateTime) lines.push(`*When:* ${fmtDateTime(a.dateTime)}`);
            if (a.duration) lines.push(`*Duration:* ${a.duration} min`);
            break;
        }
        default:
            break;
    }

    let body = `${meta.emoji} *${meta.title}*`;
    if (lines.length) body += `\n\n${lines.join('\n')}`;
    body += `\n\n_${appName}_`;
    return body;
}

class WhatsAppService {
    /**
     * Send an event notification to the user's WhatsApp number.
     * Silently no-ops when not connected, the event is toggled off, or any error occurs.
     */
    static async trigger(userId, event, data) {
        try {
            const settings = await Settings.findOne({ userId });
            if (!settings || !settings.whatsappConnected) return;
            if (!settings.whatsappAccessToken || !settings.whatsappPhoneNumberId || !settings.whatsappRecipientNumber) return;
            if (settings.whatsappEvents && settings.whatsappEvents[event] === false) return;

            const body = buildMessage(event, data, await getAppName());

            // Fire-and-forget send to the recipient number
            whatsapp.sendTextMessage(
                settings.whatsappAccessToken,
                settings.whatsappPhoneNumberId,
                settings.whatsappRecipientNumber,
                body
            ).then(() => {
                console.log(`[WhatsApp] '${event}' delivered to ${fmtPhone(settings.whatsappRecipientNumber)}`);
            }).catch((err) => {
                console.error(`[WhatsApp] Failed to deliver '${event}': ${whatsapp.describeGraphError(err)}`);
            });
        } catch (err) {
            console.error(`[WhatsApp Service Error] ${err.message}`);
        }
    }

    /** Send a test message with sample data so users can verify wiring. */
    static async sendTest(userId, event = 'leadCreated') {
        const settings = await Settings.findOne({ userId });
        if (!settings || !settings.whatsappConnected || !settings.whatsappAccessToken || !settings.whatsappPhoneNumberId || !settings.whatsappRecipientNumber) {
            const err = new Error('WhatsApp is not connected');
            err.status = 400;
            throw err;
        }
        const sample = {
            leadCreated: { lead: { name: 'Jane Doe (test)', phone: '+15551234567' } },
            leadQualified: { lead: { name: 'Jane Doe (test)', phone: '+15551234567' }, score: 9, reason: 'Sample qualification' },
            callCompleted: { from: '+15551234567', to: '+15557654321', duration: 142, status: 'completed', provider: 'twilio' },
            appointmentBooked: { clientName: 'Jane Doe (test)', clientPhone: '+15551234567', dateTime: new Date().toISOString(), duration: 30 }
        }[event] || { sample: true };
        const body = buildMessage(event, sample, await getAppName());
        try {
            await whatsapp.sendTextMessage(
                settings.whatsappAccessToken,
                settings.whatsappPhoneNumberId,
                settings.whatsappRecipientNumber,
                body
            );
            return true;
        } catch (err) {
            const e = new Error(whatsapp.describeGraphError(err));
            e.status = 502;
            throw e;
        }
    }
}

module.exports = WhatsAppService;
