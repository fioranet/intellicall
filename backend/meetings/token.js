/**
 * The token in a meeting bot's audio URL, `wss /api/meetings/stream?token=…`.
 *
 * Opaque and stored only as a SHA-256, so the logs never hold a usable one. It
 * is NOT single use: Attendee opens the socket lazily once the bot is in the
 * meeting and reconnects up to 30 times after a drop, each time with the same
 * URL. So the token is good for one meeting, for reconnects to that meeting
 * only, and is deleted when the meeting ends. Its TTL covers the join window
 * plus the longest meeting allowed.
 *
 * In memory: one backend process. A restart forgets every token, and the
 * reconnecting bot is refused and told to leave (meetings/session.js).
 */
const { createHash, randomBytes } = require('crypto');

const PREFIX = 'mt_tok_';

/**
 * @typedef {object} MeetingGrant
 * @property {string} callId CallLog.callSid, `mt-<uuid>`
 * @property {string} userId
 * @property {string} agentId
 * @property {string | null} leadId
 * @property {string} engine
 * @property {number} maxSeconds
 * @property {string} botName
 * @property {'addressed' | 'always'} respondWhen
 * @property {string[]} wakeNames
 */

/** hash → { grant, expiresAt } */
const grants = new Map();
/** callId → hash */
const byCall = new Map();

const hashOf = (token) => createHash('sha256').update(token).digest('hex');

function sweep(now = Date.now()) {
    for (const [hash, entry] of grants) {
        if (entry.expiresAt <= now) {
            grants.delete(hash);
            byCall.delete(entry.grant.callId);
        }
    }
}
const sweeper = setInterval(sweep, 60_000);
if (typeof sweeper.unref === 'function') sweeper.unref();

/**
 * @param {MeetingGrant} grant
 * @param {number} ttlSeconds
 * @returns {string}
 */
function mintMeetingToken(grant, ttlSeconds) {
    const token = PREFIX + randomBytes(32).toString('base64url');
    const hash = hashOf(token);
    const ttl = Math.max(60, Math.ceil(ttlSeconds));
    grants.set(hash, { grant, expiresAt: Date.now() + ttl * 1000 });
    byCall.set(grant.callId, hash);
    return token;
}

/** The grant while the meeting lasts; null for anything unknown, expired or ended. */
function readMeetingToken(token) {
    if (typeof token !== 'string' || !token.startsWith(PREFIX) || token.length > 128) return null;
    const entry = grants.get(hashOf(token));
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) { sweep(); return null; }
    return entry.grant;
}

/** End the token with its meeting, so a late reconnect is refused rather than admitted again. */
function burnMeetingToken(callId) {
    const hash = byCall.get(callId);
    if (hash) grants.delete(hash);
    byCall.delete(callId);
}

/** A random token for a bot's webhook URL, and the hash the CallLog keeps. */
function newWebhookToken() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashWebhookToken(token) };
}

const hashWebhookToken = (token) => createHash('sha256').update(String(token)).digest('hex');

module.exports = { mintMeetingToken, readMeetingToken, burnMeetingToken, newWebhookToken, hashWebhookToken };
