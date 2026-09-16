const jwt = require('jsonwebtoken');

/**
 * Short-lived, single-agent tickets for the in-browser agent test.
 *
 * A browser WebSocket cannot send an Authorization header, so the ticket rides
 * in the query string. That rules out the user's session JWT: it is long-lived,
 * grants the whole API, and lands in nginx access logs and browser history.
 *
 * These name one agent, expire in two minutes, and grant exactly one thing —
 * opening a test conversation with that agent. Leaking one costs a short voice
 * session, not the account.
 *
 * The ticket is also the ONLY source of identity for a browser session. The
 * client's own `start` frame is never trusted for userId/agentId, because a
 * browser (unlike Twilio) is under the caller's control.
 */

const TTL_SECONDS = 2 * 60;

function signVoiceTestToken(userId, agentId, leadId) {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required to sign voice test tickets');
    return jwt.sign(
        { uid: String(userId), sub: String(agentId), lid: String(leadId), kind: 'voice-test' },
        process.env.JWT_SECRET,
        { expiresIn: TTL_SECONDS }
    );
}

/** @returns {{ userId, agentId, leadId }|null} null if invalid, expired, or not a voice-test ticket. */
function verifyVoiceTestToken(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.kind !== 'voice-test') return null;
        if (!payload.uid || !payload.sub) return null;
        return {
            userId: String(payload.uid),
            agentId: String(payload.sub),
            leadId: payload.lid ? String(payload.lid) : null,
        };
    } catch {
        return null;
    }
}

module.exports = { signVoiceTestToken, verifyVoiceTestToken, VOICE_TEST_TTL_SECONDS: TTL_SECONDS };
