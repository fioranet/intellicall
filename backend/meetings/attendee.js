/**
 * The owner's Attendee account: the meeting-bot API their agents join Zoom,
 * Google Meet and Teams meetings through.
 *
 * Bring your own key. Attendee is under the Elastic License 2.0, which forbids
 * offering it to third parties as a hosted service, so IntelliCall never runs
 * one on an owner's behalf: the key is theirs, for Attendee's hosted app (which
 * bills them for bot hours directly) or for an install of their own.
 *
 * Every request goes through utils/safe-fetch: the base URL is the owner's to
 * choose, so it is resolved once, pinned, and refused when it points inside
 * this server's network. A self-hosted Attendee on a private network needs
 * MCP_ALLOW_PRIVATE_URLS=true.
 *
 * What Attendee's source says (attendee-labs/attendee), since the docs leave it out:
 *   - Auth is `Authorization: Token <key>` (bots/authentication.py).
 *   - websocket_settings.audio.url must start with wss:// and webhook URLs must be https.
 *   - The bot opens the audio socket lazily, on its first mixed-audio chunk, so
 *     only once it is in the meeting, and reconnects up to 30 times after a drop.
 *   - Bot output plays on Zoom (Meeting SDK and web adapters), Google Meet and Teams.
 *   - There is no message that clears queued bot output, so barge-in is handled
 *     on our side by pacing what we send (meetings/attendee-link.js).
 */
const { safeFetch, UnsafeUrlError, assertSafeMcpUrl, privateUrlsAllowed } = require('../utils/safe-fetch');

const ATTENDEE_HOSTED_URL = 'https://app.attendee.dev';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ERROR_CHARS = 300;

/** A refusal or failure from the owner's Attendee, with the status it answered. */
class AttendeeError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'AttendeeError';
        this.status = status;
        this.code = code;
    }
}

/**
 * The base URL as stored: scheme and host (and a path prefix for an install
 * behind one), no trailing slash, and without the `/api/v1` a pasted URL often
 * carries. https only, except where private URLs are allowed.
 */
function normaliseBaseUrl(raw) {
    let url;
    try {
        url = new URL(String(raw).trim());
    } catch {
        throw new UnsafeUrlError('That is not a URL. Use the address of your Attendee, such as https://app.attendee.dev.');
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateUrlsAllowed())) {
        throw new UnsafeUrlError('The Attendee URL must start with https://.');
    }
    if (url.search || url.hash) throw new UnsafeUrlError('Use the Attendee address on its own, with no query or fragment.');
    const path = url.pathname.replace(/\/+$/, '').replace(/\/api(\/v1)?$/i, '');
    return `${url.origin}${path}`;
}

/** Refuse a base URL that resolves somewhere we must not connect to. */
async function assertSafeBaseUrl(baseUrl) {
    await assertSafeMcpUrl(baseUrl);
}

/** Which platform a meeting link is for, or null when Attendee cannot join it. */
function platformFor(meetingUrl) {
    let url;
    try {
        url = new URL(meetingUrl);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host === 'zoom.us' || host.endsWith('.zoom.us') || host === 'zoomgov.com' || host.endsWith('.zoomgov.com')) return 'zoom';
    if (host === 'meet.google.com') return 'google_meet';
    if (host === 'teams.microsoft.com' || host === 'teams.live.com' || host.endsWith('.teams.microsoft.com')) return 'teams';
    return null;
}

/** Attendee's error body, cut short: it is shown to the owner and stored. */
async function errorText(res) {
    const raw = await res.text().catch(() => '');
    let text = raw;
    try {
        const body = JSON.parse(raw);
        text = typeof body === 'string' ? body : (body && (body.detail ?? body.error ?? body.message)) ?? JSON.stringify(body);
        if (typeof text !== 'string') text = JSON.stringify(text);
    } catch { /* not JSON */ }
    return String(text || res.statusText || `HTTP ${res.status}`).replace(/\s+/g, ' ').slice(0, MAX_ERROR_CHARS);
}

async function call(creds, method, path, body) {
    let res;
    try {
        res = await safeFetch(`${creds.baseUrl}/api/v1${path}`, {
            method,
            headers: {
                Authorization: `Token ${creds.apiKey}`,
                Accept: 'application/json',
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (err) {
        if (err instanceof UnsafeUrlError) throw new AttendeeError(400, 'unsafe_attendee_url', err.message);
        const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
        throw new AttendeeError(502, 'attendee_unreachable', timedOut
            ? `Attendee at ${creds.baseUrl} did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds.`
            : `Could not reach Attendee at ${creds.baseUrl}.`);
    }
    if (res.status === 401 || res.status === 403) {
        throw new AttendeeError(res.status, 'attendee_key_rejected', `Attendee refused the API key: ${await errorText(res)}`);
    }
    if (!res.ok) {
        throw new AttendeeError(res.status, 'attendee_error', `Attendee answered ${res.status}: ${await errorText(res)}`);
    }
    if (res.status === 204) return undefined;
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : undefined;
    } catch {
        throw new AttendeeError(502, 'attendee_error', 'Attendee answered with something that is not JSON. Check the URL points at Attendee itself.');
    }
}

/** Check the key works: the cheapest authenticated read there is. */
async function verifyAttendeeKey(creds) {
    await call(creds, 'GET', '/bots?page_size=1');
}

/** Attendee's google_meet_settings / teams_settings for a signed-in bot. */
function loginSettings(login) {
    if (!login) return {};
    const settings = { use_login: true, login_mode: 'always', ...(login.group ? { login_group_name: login.group } : {}) };
    return login.platform === 'google_meet' ? { google_meet_settings: settings } : { teams_settings: settings };
}

/**
 * @param {{baseUrl: string, apiKey: string}} creds
 * @param {{meetingUrl: string, botName: string, audioUrl: string, sampleRate: number, webhookUrl: string | null,
 *   metadata: Record<string, string>, deduplicationKey: string, waitingRoomTimeoutSeconds: number, maxUptimeSeconds: number,
 *   login: {platform: 'google_meet' | 'teams', group: string | null} | null}} input
 * @returns {Promise<{id: string, state: string | null}>}
 */
async function createBot(creds, input) {
    const bot = await call(creds, 'POST', '/bots', {
        meeting_url: input.meetingUrl,
        bot_name: input.botName,
        metadata: input.metadata,
        deduplication_key: input.deduplicationKey,
        websocket_settings: { audio: { url: input.audioUrl, sample_rate: input.sampleRate } },
        ...loginSettings(input.login),
        ...(input.webhookUrl ? { webhooks: [{ url: input.webhookUrl, triggers: ['bot.state_change'] }] } : {}),
        automatic_leave_settings: {
            waiting_room_timeout_seconds: input.waitingRoomTimeoutSeconds,
            // A safety net if this process dies mid-meeting: the bot (and the
            // owner's Attendee bill) stops by itself.
            max_uptime_seconds: input.maxUptimeSeconds,
        },
    });
    if (!bot || typeof bot.id !== 'string') {
        throw new AttendeeError(502, 'attendee_error', 'Attendee created no bot id. Check the URL points at Attendee itself.');
    }
    return { id: bot.id, state: typeof bot.state === 'string' ? bot.state : null };
}

async function getBot(creds, botId) {
    return call(creds, 'GET', `/bots/${encodeURIComponent(botId)}`);
}

async function leaveBot(creds, botId) {
    await call(creds, 'POST', `/bots/${encodeURIComponent(botId)}/leave`, {});
}

module.exports = { ATTENDEE_HOSTED_URL, AttendeeError, normaliseBaseUrl, assertSafeBaseUrl, platformFor, verifyAttendeeKey, loginSettings, createBot, getBot, leaveBot };
