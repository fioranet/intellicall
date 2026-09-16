/**
 * In-memory ring buffer of recent SIP/Asterisk events.
 * Lets users debug SIP problems from the dashboard without SSH access to the server.
 * Entries tagged with a userId are only shown to that user (or superadmins).
 */

const MAX_ENTRIES = parseInt(process.env.SIP_LOG_MAX_ENTRIES, 10) || 500;

const entries = [];
let nextId = 1;

/**
 * Add a log entry.
 * @param {'info'|'warn'|'error'|'success'} level
 * @param {string} message - human-readable, safe to show to end users (no secrets)
 * @param {object} [meta] - { userId, callId, trunkId, ... } extra context
 */
function sipLog(level, message, meta = {}) {
    const entry = {
        id: nextId++,
        ts: new Date().toISOString(),
        level,
        message,
        ...(meta.userId ? { userId: meta.userId.toString() } : {}),
        ...(meta.callId ? { callId: meta.callId } : {}),
        ...(meta.trunkId ? { trunkId: meta.trunkId.toString() } : {}),
        ...(meta.detail ? { detail: meta.detail } : {})
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    return entry;
}

/**
 * Get recent log entries visible to a user.
 * System-level entries (no userId) are visible to everyone; user-tagged entries
 * only to their owner or superadmins.
 * @param {object} opts - { userId, isSuperAdmin, sinceId, limit }
 */
function getLogs({ userId, isSuperAdmin = false, sinceId = 0, limit = 200 } = {}) {
    const uid = userId ? userId.toString() : null;
    const visible = entries.filter(e =>
        e.id > sinceId && (isSuperAdmin || !e.userId || e.userId === uid)
    );
    return visible.slice(-limit);
}

module.exports = { sipLog, getLogs };
