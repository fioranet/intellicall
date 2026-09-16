const Settings = require('../models/Settings');
const Appointment = require('../models/Appointment');
const AdminSettings = require('../models/AdminSettings');
const { getCalendarClient } = require('../utils/googleCalendar');

async function getAppName() {
    try {
        const adminSettings = await AdminSettings.findOne();
        return adminSettings?.branding?.appName || 'IntelliCallAI';
    } catch {
        return 'IntelliCallAI';
    }
}

async function getConnectedSettings(userId) {
    const settings = await Settings.findOne({ userId });
    if (!settings || !settings.googleCalendarConnected) return null;
    if (!settings.googleCalendarAccessToken && !settings.googleCalendarRefreshToken) return null;
    return settings;
}

function buildEventBody(appointment, timeZone, appName) {
    const start = new Date(appointment.dateTime);
    const end = new Date(start.getTime() + (appointment.duration || 30) * 60000);
    const who = appointment.clientName || appointment.clientPhone;
    const summary = `Call with ${who} (${appName})`;
    const descriptionLines = [
        `Phone: ${appointment.clientPhone}`,
        appointment.notes ? `Notes: ${appointment.notes}` : null,
        `Booked via ${appName}`
    ].filter(Boolean);
    return {
        summary,
        description: descriptionLines.join('\n'),
        start: { dateTime: start.toISOString(), timeZone: timeZone || 'UTC' },
        end: { dateTime: end.toISOString(), timeZone: timeZone || 'UTC' },
        status: appointment.status === 'canceled' ? 'cancelled' : 'confirmed'
    };
}

class GoogleCalendarService {
    static async syncCreate(userId, appointmentId) {
        try {
            const settings = await getConnectedSettings(userId);
            if (!settings) return;
            const appointment = await Appointment.findById(appointmentId);
            if (!appointment || appointment.googleCalendarEventId) return;

            const appName = await getAppName();
            const calendar = await getCalendarClient(settings.googleCalendarAccessToken, settings.googleCalendarRefreshToken);
            const resp = await calendar.events.insert({
                calendarId: settings.googleCalendarId || 'primary',
                requestBody: buildEventBody(appointment, settings.timeZone, appName)
            });
            appointment.googleCalendarEventId = resp.data.id;
            await appointment.save();
        } catch (err) {
            console.error('[GoogleCalendar] syncCreate failed:', err.message);
        }
    }

    static async syncUpdate(userId, appointmentId) {
        try {
            const settings = await getConnectedSettings(userId);
            if (!settings) return;
            const appointment = await Appointment.findById(appointmentId);
            if (!appointment) return;

            const appName = await getAppName();
            const calendar = await getCalendarClient(settings.googleCalendarAccessToken, settings.googleCalendarRefreshToken);
            const calendarId = settings.googleCalendarId || 'primary';

            if (!appointment.googleCalendarEventId) {
                if (appointment.status === 'canceled') return;
                const resp = await calendar.events.insert({
                    calendarId,
                    requestBody: buildEventBody(appointment, settings.timeZone, appName)
                });
                appointment.googleCalendarEventId = resp.data.id;
                await appointment.save();
                return;
            }

            await calendar.events.update({
                calendarId,
                eventId: appointment.googleCalendarEventId,
                requestBody: buildEventBody(appointment, settings.timeZone, appName)
            });
        } catch (err) {
            console.error('[GoogleCalendar] syncUpdate failed:', err.message);
        }
    }

    static async syncDelete(userId, appointment) {
        try {
            const settings = await getConnectedSettings(userId);
            if (!settings || !appointment?.googleCalendarEventId) return;
            const calendar = await getCalendarClient(settings.googleCalendarAccessToken, settings.googleCalendarRefreshToken);
            await calendar.events.delete({
                calendarId: settings.googleCalendarId || 'primary',
                eventId: appointment.googleCalendarEventId
            });
        } catch (err) {
            console.error('[GoogleCalendar] syncDelete failed:', err.message);
        }
    }
}

module.exports = GoogleCalendarService;
