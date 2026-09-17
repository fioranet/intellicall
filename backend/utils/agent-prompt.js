const { formatInTimeZone } = require('date-fns-tz');
const { applyMergeFields } = require('./merge-fields');

const LANG_MAP = {
    'ar': 'Arabic', 'hi': 'Hindi', 'he': 'Hebrew', 'es': 'Spanish', 'fr': 'French',
    'de': 'German', 'pt': 'Brazilian Portuguese (Português do Brasil)', 'pt-BR': 'Brazilian Portuguese (Português do Brasil)', 'it': 'Italian',
    'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean', 'nl': 'Dutch', 'ur': 'Urdu', 'ta': 'Tamil'
};

/**
 * Build the full system prompt for a voice call. Shared by the classic pipeline
 * (voice-stream.js / sip-voice-stream.js) and the Deepgram Voice Agent engine.
 *
 * @param {object} opts
 * @param {object} opts.agent — Agent document (systemPrompt, language, appointmentBookingEnabled)
 * @param {object} [opts.settings] — Settings document (timeZone, timeFormat)
 * @param {string} [opts.kbContent] — pre-formatted knowledge base content (cached per call)
 * @param {boolean} [opts.commandTags=true] — include the [[LIST]]/[[SLOTS]]/[[BOOK]]/[[CANCEL]]
 *   text-command protocol (classic engine). false = native function calling (deepgram engine),
 *   which only needs date/timezone context.
 * @param {object} [opts.lead] — Lead document; substitutes {{name}}, {{phone}} and any
 *   custom lead.fields merge tags in the agent's systemPrompt. Unmatched tags are left as-is.
 * @param {boolean} [opts.humanTransfer=false] — whether this transport can actually hand the
 *   caller to a human. Only the SIP adapters pass true; on Twilio and in the browser test
 *   there is no second leg to bridge, so the capability is never described to the model.
 */
function buildVoiceSystemPrompt({ agent, settings, kbContent = '', commandTags = true, lead = null, humanTransfer = false }) {
    let systemPrompt = applyMergeFields(agent.systemPrompt, lead);

    if (kbContent) systemPrompt += kbContent;

    if (agent.language && agent.language !== 'en') {
        if (agent.language === 'multi') {
            systemPrompt += "\n\nCRITICAL: Respond in the SAME language the user is speaking.";
        } else {
            systemPrompt += `\n\nCRITICAL: Always respond in ${LANG_MAP[agent.language] || agent.language}.`;
        }
    }

    if (agent.appointmentBookingEnabled) {
        const now = new Date();
        const tz = settings?.timeZone || 'UTC';
        const nowInTz = formatInTimeZone(now, tz, "EEEE, MMMM d, yyyy 'at' h:mm a");
        const todayYYYYMMDD = formatInTimeZone(now, tz, 'yyyy-MM-dd');

        if (commandTags) {
            systemPrompt += `\n\n### Appointment Booking Capability — CRITICAL: you must output the exact command in your reply or the system cannot run it.\nCommands: [[LIST]] (list user's appointments), [[SLOTS]] (get available slots for next 7 days), [[BOOK:YYYY-MM-DD HH:mm]] or [[BOOK:YYYY-MM-DD HH:mm|ClientName]], [[CANCEL:YYYY-MM-DD HH:mm]].\nWhen the user asks for available slots, tomorrow's slots, or "what times are free", you MUST include [[SLOTS]] in your reply (e.g. "Let me check. [[SLOTS]]" or "One moment. [[SLOTS]]"). When they ask to list their appointments, include [[LIST]]. The command text is not spoken; it triggers the backend. If you only say "I'll check" without [[SLOTS]], nothing will happen.\nCurrent date and time in user's timezone: ${nowInTz}. Timezone: ${tz}. Today's date (YYYY-MM-DD): ${todayYYYYMMDD}. Use this for "today"/"tomorrow" and relative dates.\nFor [[BOOK:...]] use only numeric date and time, e.g. [[BOOK:${todayYYYYMMDD} 10:00]]. Never use words like "Thursday" or "Mar 12th" inside [[BOOK:...]].\nCommand tags [[LIST]], [[SLOTS]], [[BOOK:...]], [[CANCEL:...]] must NEVER be translated or written in another language (e.g. not Arabic, not any locale). Always output them exactly as shown, in English, regardless of the language you speak in.\nWhen booking: if the caller has given their name, use [[BOOK:YYYY-MM-DD HH:mm|FirstName LastName]]; otherwise [[BOOK:YYYY-MM-DD HH:mm]] is fine. You may briefly ask for their name before confirming if you don't have it.`;
        } else {
            systemPrompt += `\n\n### Appointment Booking Capability\nYou can list appointments, check available slots, book, and cancel appointments using the provided tools.\nCurrent date and time in user's timezone: ${nowInTz}. Timezone: ${tz}. Today's date (YYYY-MM-DD): ${todayYYYYMMDD}. Use this for "today"/"tomorrow" and relative dates.\nAlways pass dates as YYYY-MM-DD and times as HH:mm (24-hour) to the tools. Briefly tell the caller you're checking (e.g. "One moment, let me check.") before using a tool. When booking, ask for the caller's name first if you don't have it.`;
        }
    }

    // Human transfer, when the agent is configured for it AND the transport can do it.
    // The model is given destination IDs and names only — never a phone number.
    const transferDestinations = humanTransfer && agent.humanTransfer?.enabled
        ? (agent.humanTransfer.destinations || []).filter(d => d && d.enabled !== false && d.id && d.name)
        : [];
    if (transferDestinations.length > 0) {
        const list = transferDestinations.map(d => `${d.id}: ${d.name}`).join(', ');
        const invoke = commandTags
            ? 'output the exact tag [[TRANSFER:destination_id]] in your reply, e.g. [[TRANSFER:reception]]. The tag is not spoken; it starts the transfer. Say your short line in the SAME reply, before the tag. The tag must NEVER be translated or written in another language — always output it exactly as shown, in English, whatever language you are speaking'
            : 'call the transfer_call tool with the destination_id';
        const noChoice = commandTags
            ? `use the default destination ID "${agent.humanTransfer.defaultDestinationId || transferDestinations[0].id}"`
            : 'omit destination_id so the default destination is used';
        systemPrompt += `\n\n### Transferring to a human — if the caller asks to speak to a person, an operator or a named department, or says they do not want to talk to a machine, do not argue or try to keep them. Briefly say you are putting them through, then ${invoke}.\nAvailable destinations (ID: name): ${list}.\nUse ONLY these IDs. Never invent, guess, say out loud or dial a telephone number. If the caller did not name a destination, ${noChoice}.\nDo not claim the transfer succeeded until you are told TRANSFER_CONNECTED. If you are told BUSY, NO_ANSWER, REJECTED, UNAVAILABLE, FAILED, LIMIT_REACHED, TRANSFER_DISABLED or DESTINATION_NOT_FOUND, say naturally that you could not reach them and carry on helping the caller yourself.`;
    }

    // Ending the call is a capability of every agent, so this sits OUTSIDE the
    // appointmentBookingEnabled gate above.
    if (commandTags) {
        systemPrompt += "\n\n### Ending the call — output the exact tag [[END_CALL]] in your reply when the conversation is genuinely over: the caller has said goodbye, asked to hang up, or confirmed they need nothing else. Say your short closing line in the SAME reply, then the tag (e.g. \"Thanks for your time, goodbye. [[END_CALL]]\"). The tag is not spoken; it hangs up the phone once your closing line has finished playing. Never use it to escape a difficult question, and never in your first reply. The tag [[END_CALL]] must NEVER be translated or written in another language — always output it exactly as shown, in English, regardless of the language you are speaking.";
    } else {
        systemPrompt += "\n\n### Ending the call — call the end_call tool when the conversation is genuinely over: the caller has said goodbye, asked to hang up, or confirmed they need nothing else. Say your short closing line in the same turn; the call hangs up once you finish speaking. Never use it to escape a difficult question, and never in your first turn.";
    }

    systemPrompt += "\n\n### Voice / Barge-in: If the user's message is short or sounds incomplete (e.g. \"What kind of\", \"I can\"), do NOT say \"your message got cut off\" or \"could you clarify\". Answer briefly from context or ask one short follow-up (e.g. \"What would you like to know about?\").";
    const tf = settings?.timeFormat === '24' ? '24-hour' : '12-hour';
    systemPrompt += `\n\n### Voice response rules (phone/call): Keep every reply very short. Maximum 2 sentences. Maximum ~12 seconds of speech. Never list long bullet points or step-by-step instructions in one go; give a one-sentence summary and offer to continue (e.g. "Want me to go through the details?"). User time format is ${tf}. When saying times, never say raw "10:00" or "17:00" or "ten oh oh". ${tf === '12-hour' ? 'Use words like "10 in the morning", "5 in the evening", "noon".' : 'Use 24-hour style e.g. "17 hundred" for 17:00, "9 hundred" for 09:00.'}`;

    return systemPrompt;
}

module.exports = { buildVoiceSystemPrompt, LANG_MAP };
