/**
 * WhatsApp appointment reminder scheduler: runs every minute and sends a
 * template message to the client of every scheduled appointment entering the
 * user's reminder window (e.g. 60 minutes before start).
 *
 * Reminders are business-initiated messages, so they must use a pre-approved
 * Meta template ({{1}} client name, {{2}} date, {{3}} time) — plain text only
 * delivers inside a 24-hour session window the client almost never has open.
 */
const Appointment = require('../models/Appointment');
const Settings = require('../models/Settings');
const whatsapp = require('../utils/whatsapp');
const { formatInTimeZone } = require('date-fns-tz');

const INTERVAL_MS = 60 * 1000; // 1 minute

let intervalId = null;
let ticking = false;

function fmtPhone(p) {
    const digits = String(p || '').replace(/\D/g, '');
    return digits ? `+${digits}` : String(p || '');
}

/** Format appointment date + time in the owner's timezone and clock format. */
function formatForUser(dateTime, settings) {
    const tz = (settings.timeZone && settings.timeZone.trim()) || 'UTC';
    const dateStr = formatInTimeZone(dateTime, tz, 'PPPP'); // e.g. Wednesday, June 10th, 2026
    const timeStr = formatInTimeZone(dateTime, tz, settings.timeFormat === '24' ? 'HH:mm' : 'p');
    return { dateStr, timeStr };
}

async function sendReminder(appointment, settings) {
    const { dateStr, timeStr } = formatForUser(appointment.dateTime, settings);
    return whatsapp.sendTemplateMessage(
        settings.whatsappAccessToken,
        settings.whatsappPhoneNumberId,
        appointment.clientPhone,
        settings.whatsappReminders.templateName,
        settings.whatsappReminders.templateLanguage || 'en',
        [appointment.clientName || 'there', dateStr, timeStr]
    );
}

async function tick() {
    if (ticking) return; // never overlap slow ticks
    ticking = true;
    try {
        const now = new Date();
        const configs = await Settings.find({
            whatsappConnected: true,
            'whatsappReminders.enabled': true,
            'whatsappReminders.templateName': { $nin: ['', null] }
        });

        for (const settings of configs) {
            try {
                const leadMinutes = Math.max(5, settings.whatsappReminders.leadMinutes || 60);
                const windowEnd = new Date(now.getTime() + leadMinutes * 60 * 1000);

                const due = await Appointment.find({
                    userId: settings.userId,
                    status: 'scheduled',
                    dateTime: { $gt: now, $lte: windowEnd },
                    // not yet sent for the current dateTime — rescheduling re-arms
                    $expr: { $ne: ['$whatsappReminderSentFor', '$dateTime'] }
                });

                for (const appt of due) {
                    // Atomic claim before sending: a duplicate reminder to a client is
                    // worse than a missed one, so we never retry a claimed appointment.
                    const claimed = await Appointment.findOneAndUpdate(
                        {
                            _id: appt._id,
                            status: 'scheduled',
                            $expr: { $ne: ['$whatsappReminderSentFor', '$dateTime'] }
                        },
                        { $set: { whatsappReminderSentAt: now, whatsappReminderSentFor: appt.dateTime } }
                    );
                    if (!claimed) continue;

                    try {
                        await sendReminder(appt, settings);
                        console.log(`[WhatsApp Reminder] Sent to ${fmtPhone(appt.clientPhone)} for appointment at ${appt.dateTime.toISOString()}`);
                    } catch (err) {
                        console.error(`[WhatsApp Reminder] Failed for ${fmtPhone(appt.clientPhone)}: ${whatsapp.describeGraphError(err)}`);
                    }
                }
            } catch (err) {
                console.error(`[WhatsApp Reminder] Error for user ${settings.userId}: ${err.message}`);
            }
        }
    } catch (err) {
        console.error('[WhatsApp Reminder] Scheduler error:', err.message);
    } finally {
        ticking = false;
    }
}

function start() {
    if (intervalId) return;
    intervalId = setInterval(tick, INTERVAL_MS);
    console.log('[WhatsApp Reminder] Scheduler started (checking every 1 minute)');
}

function stop() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('[WhatsApp Reminder] Scheduler stopped');
    }
}

/**
 * Send the configured reminder template with sample data to the OWNER's own
 * WhatsApp number, so template name/language/approval can be verified safely.
 */
async function sendTest(userId) {
    const settings = await Settings.findOne({ userId });
    if (!settings || !settings.whatsappConnected || !settings.whatsappAccessToken || !settings.whatsappPhoneNumberId) {
        const err = new Error('WhatsApp is not connected');
        err.status = 400;
        throw err;
    }
    if (!settings.whatsappReminders?.templateName) {
        const err = new Error('Set a template name first');
        err.status = 400;
        throw err;
    }
    if (!settings.whatsappRecipientNumber) {
        const err = new Error('No notification number configured to send the test to');
        err.status = 400;
        throw err;
    }
    const sampleDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { dateStr, timeStr } = formatForUser(sampleDate, settings);
    try {
        await whatsapp.sendTemplateMessage(
            settings.whatsappAccessToken,
            settings.whatsappPhoneNumberId,
            settings.whatsappRecipientNumber,
            settings.whatsappReminders.templateName,
            settings.whatsappReminders.templateLanguage || 'en',
            ['Jane Doe (test)', dateStr, timeStr]
        );
        return true;
    } catch (err) {
        const e = new Error(whatsapp.describeGraphError(err));
        e.status = 502;
        throw e;
    }
}

module.exports = { start, stop, tick, sendTest };
