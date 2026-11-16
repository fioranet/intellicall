/**
 * Platform events that send WhatsApp messages on their own, without the agent
 * deciding to: a booking confirmation when an agent books an appointment, and a
 * reminder before it. Called from WebhookService.trigger for every event.
 *
 * Both are approved templates, chosen per agent in its WhatsApp settings, so
 * they arrive outside the 24-hour window too. Their parameters are filled from
 * the appointment, by how many the template has:
 *
 *   3  name, date, time      2  date, time      1  "date at time"      0  none
 *
 * The date and time are written in the owner's time zone. Cancelling the
 * appointment cancels its pending reminder.
 */
const { formatInTimeZone } = require('date-fns-tz');

const Agent = require('../../models/Agent');
const Settings = require('../../models/Settings');
const WhatsAppAccount = require('../../models/WhatsAppAccount');
const WhatsAppContact = require('../../models/WhatsAppContact');
const WhatsAppTemplate = require('../../models/WhatsAppTemplate');
const ScheduledWhatsAppMessage = require('../../models/ScheduledWhatsAppMessage');

/** The template's parameters for this appointment. */
function appointmentParams(count, { name, dateTime, timeZone }) {
    const date = formatInTimeZone(dateTime, timeZone, 'EEEE, MMMM d');
    const time = formatInTimeZone(dateTime, timeZone, 'h:mm a');
    if (count >= 3) return [name || 'there', date, time, ...Array(count - 3).fill('-')];
    if (count === 2) return [date, time];
    if (count === 1) return [`${date} at ${time}`];
    return [];
}

async function context(userId, appt) {
    if (!appt || !appt.agentId || !appt.clientPhone) return null;
    const agent = await Agent.findOne({ _id: appt.agentId, createdBy: userId }).select('whatsapp').lean();
    const wa = agent && agent.whatsapp;
    if (!wa || !wa.accountId) return null;
    const account = await WhatsAppAccount.findOne({ _id: wa.accountId, createdBy: userId, status: 'connected' }).lean();
    if (!account) return null;
    const waId = String(appt.clientPhone).replace(/\D/g, '');
    if (waId.length < 8) return null;
    const contact = await WhatsAppContact.findOneAndUpdate(
        { accountId: account._id, waId },
        { $setOnInsert: { createdBy: account.createdBy, accountId: account._id, waId } },
        { upsert: true, returnDocument: 'after' },
    ).lean();
    const settings = await Settings.findOne({ userId }).select('timeZone').lean();
    return { agent, wa, account, contact, timeZone: (settings && settings.timeZone) || 'UTC' };
}

async function templateFor(accountId, ref) {
    if (!ref || !ref.name) return null;
    const q = { accountId, name: ref.name, status: 'APPROVED' };
    if (ref.language) q.language = ref.language;
    return WhatsAppTemplate.findOne(q).lean();
}

async function onBooked(userId, appt) {
    const ctx = await context(userId, appt);
    if (!ctx) return;
    const { wa, account, contact, timeZone } = ctx;
    const when = new Date(appt.dateTime);
    const name = appt.clientName || contact.profileName || '';

    if (wa.autoBookingConfirmation) {
        const t = await templateFor(account._id, wa.templates && wa.templates.booking_confirmation);
        if (t) {
            const { sendOutbound } = require('./send');
            const r = await sendOutbound(account, contact, {
                kind: 'template', name: t.name, language: t.language,
                parameters: appointmentParams(t.bodyParamCount, { name, dateTime: when, timeZone }),
            }, { origin: 'agent_tool', allowMarketing: Boolean(wa.allowMarketing) });
            if (!r.ok) console.warn(`[whatsapp] booking confirmation not sent: ${r.reason}`);
        }
    }

    const minutes = Number(wa.autoReminderMinutes) || 0;
    const sendAt = new Date(when.getTime() - minutes * 60_000);
    if (minutes > 0 && sendAt.getTime() > Date.now() + 60_000) {
        const t = await templateFor(account._id, wa.templates && wa.templates.reminder);
        if (t) {
            await ScheduledWhatsAppMessage.create({
                createdBy: account.createdBy, accountId: account._id, contactId: contact._id, agentId: appt.agentId,
                purpose: 'reminder', sendAt,
                payload: { template: { name: t.name, language: t.language, parameters: appointmentParams(t.bodyParamCount, { name, dateTime: when, timeZone }) } },
                source: { appointmentId: appt._id },
            });
        }
    }
}

async function onCanceled(userId, appt) {
    if (!appt || !appt._id) return;
    await ScheduledWhatsAppMessage.updateMany(
        { createdBy: userId, 'source.appointmentId': appt._id, status: 'pending' },
        { $set: { status: 'canceled', lastError: 'The appointment was canceled.' } },
    );
}

function trigger(userId, event, data) {
    const run = event === 'appointmentBooked' ? onBooked : event === 'appointmentCanceled' ? onCanceled : null;
    if (!run) return;
    run(userId, data).catch((err) => console.error(`[whatsapp] ${event} handling failed:`, err.message));
}

module.exports = { trigger, appointmentParams };
