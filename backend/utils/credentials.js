/**
 * Sealing and opening the secrets stored as ciphertext in plain String fields
 * (tool header values, MCP server tokens, WhatsApp tokens, Attendee keys).
 *
 * One place where a secret crosses between ciphertext and plaintext. The
 * fields are plain Strings rather than encrypted getters because every reader
 * uses `.lean()`, which skips Mongoose getters. Built on utils/encryption.js,
 * whose key derives from JWT_SECRET: a changed JWT_SECRET makes every sealed
 * value unreadable, and `open()` then returns '' (logged once per label) so the
 * credential reads as "not configured" instead of crashing a call.
 */
const { encrypt, decrypt } = require('./encryption');

const warned = new Set();

/** @param {string} value */
function seal(value) {
    return encrypt(String(value));
}

/**
 * @param {string | null | undefined} value
 * @param {string} label what the value is, for the log line
 * @returns {string} the plaintext, or '' when unset or unreadable
 */
function open(value, label) {
    if (!value) return '';
    const out = decrypt(value);
    if (!out && !warned.has(label)) {
        warned.add(label);
        console.warn(`[credentials] ${label} could not be decrypted (JWT_SECRET changed?). Treating it as unset — re-enter the credential.`);
    }
    return out || '';
}

/** @param {unknown} value */
function sealJson(value) {
    return encrypt(JSON.stringify(value));
}

/**
 * @template T
 * @param {string | null | undefined} value
 * @param {string} label
 * @returns {T | undefined}
 */
function openJson(value, label) {
    const raw = open(value, label);
    if (!raw) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

module.exports = { seal, open, sealJson, openJson };
