/**
 * Shared Human Transfer helpers for the command-tag voice engines (classic ElevenLabs
 * and Sarvam). The native-function engines (Deepgram Voice Agent, Gemini Live) hand the
 * raw JSON result straight back to the model instead and need none of this.
 */

/** [[TRANSFER:destination_id]] — the tag the tag-protocol engines emit. */
const TRANSFER_TAG_RE = /\[\[TRANSFER:([^\]]*)\]\]/;

/** The requested destination id, or null when the reply carries no transfer tag. */
function parseTransferTag(text) {
    const match = String(text || '').match(TRANSFER_TAG_RE);
    if (!match) return null;
    // Models occasionally wrap the id in quotes or add stray spacing.
    return match[1].trim().replace(/^["']|["']$/g, '').toLowerCase();
}

/** Why the handover did not happen, in words a caller can be told. */
const FAILURE_REASONS = {
    BUSY: 'the line was busy',
    NO_ANSWER: 'there was no answer',
    REJECTED: 'the call was declined',
    UNAVAILABLE: 'they were unavailable',
    FAILED: 'the call could not be connected',
    LIMIT_REACHED: 'this call has already tried transferring too many times',
    TRANSFER_DISABLED: 'transferring is not switched on',
    DESTINATION_NOT_FOUND: 'that person or department is not set up'
};

/**
 * Turn a transferCall() result into one short English sentence for the agent to speak.
 * Returns '' on success — the caller is with a human by then and the AI says nothing.
 *
 * Non-English agents run this sentence through the narration helper, which is why it is
 * a plain statement and carries no instructions to the model.
 */
function transferFailureSentence(rawResult, destinationName = '') {
    let parsed;
    try {
        parsed = JSON.parse(rawResult);
    } catch (_) {
        parsed = { ok: false, code: 'FAILED' };
    }
    if (parsed.ok) return '';

    const who = parsed.destination_name || destinationName;
    const reason = FAILURE_REASONS[parsed.code] || FAILURE_REASONS.FAILED;
    const target = who ? `to ${who}` : 'to a colleague';
    return `Sorry, I could not put you through ${target} — ${reason}. I can carry on helping you myself.`;
}

module.exports = { TRANSFER_TAG_RE, parseTransferTag, transferFailureSentence };
