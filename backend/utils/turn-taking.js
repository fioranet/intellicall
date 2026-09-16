/**
 * Shared turn-taking policy for every voice engine.
 *
 * The classic (Deepgram STT → LLM → ElevenLabs) and Sarvam pipelines each grew their own
 * barge-in heuristics, which drifted apart and behaved differently on the same call. This
 * module is the single source of truth for the DECISIONS; each engine keeps its own
 * mechanics (timers, queues, sockets) and asks here what to do.
 *
 * The Deepgram Voice Agent engine does not use this: its endpointing and barge-in run
 * server-side at Deepgram, and the client only receives UserStartedSpeaking after the
 * decision has already been made.
 *
 * The policy:
 *   1. Never interrupt on a raw VAD signal alone. VAD cannot tell a real interruption from a
 *      cough, an "mm-hmm", line noise, or the agent's own voice echoing back off the caller's
 *      handset. Always wait for a transcript to confirm it.
 *   2. Interrupt only when the caller says MORE THAN TWO WORDS, or says an unambiguous stop
 *      command ("stop", "wait", "നിർത്തൂ", "रुको"). Everything shorter lets the agent finish.
 *   3. Never DISCARD a short utterance. "Yes" answering a yes/no question is real content, and
 *      dropping it leaves the call in dead air with both sides waiting. Hold it and answer once
 *      the agent has finished speaking.
 *   4. Ignore a transcript that is just the tail of the turn already dispatched — streaming ASR
 *      re-emits those, and treating one as new speech aborts the reply in progress.
 */

/** More than two words. One and two word utterances never interrupt. */
const MIN_INTERRUPT_WORDS = 3;

/** How long after dispatching a turn a matching tail transcript is treated as a re-emission. */
const DUPLICATE_TAIL_WINDOW_MS = 2500;

/**
 * Unambiguous "be quiet" intents, which interrupt at any length.
 *
 * Deliberately excludes yes/no/ok/hello and their translations. Those read as interruptions
 * but are almost always ANSWERS — "ശരി" is literally "okay", and cutting the agent off to
 * respond to a one-word acknowledgement is what makes an agent feel twitchy. They are queued
 * by rule 3 instead, and answered when the agent finishes.
 */
const STOP_COMMANDS = [
    // English
    'stop', 'wait', 'hold on', 'hold up', 'hang on', 'shut up', 'quiet', 'be quiet',
    'one second', 'one sec', 'one minute', 'just a minute', 'listen', 'excuse me',
    // Hindi / Marathi (native + common romanisation)
    'रुको', 'रुकिए', 'ठहरो', 'थांबा', 'सुनो', 'चुप',
    'ruko', 'rukiye', 'thehro', 'thambaa', 'suno', 'chup',
    // Malayalam
    'നിർത്തൂ', 'നിർത്ത്', 'നിൽക്ക്', 'ഒന്ന് നിൽക്ക്', 'കേൾക്ക്',
    'nirthu', 'nirth', 'nilku',
    // Tamil
    'நிறுத்து', 'இரு', 'பொறு', 'nirutthu', 'poru',
    // Telugu
    'ఆపు', 'ఆగు', 'aagu', 'aapu',
    // Kannada
    'ನಿಲ್ಲಿಸು', 'ನಿಲ್ಲು', 'nillu',
    // Bengali
    'থামো', 'দাঁড়াও', 'thamo',
    // Gujarati / Punjabi
    'ઊભા રહો', 'રોકો', 'ਰੁਕੋ', 'roko',
];

/** Strip punctuation/symbols and collapse whitespace for comparison. */
function normalize(text) {
    return (text || '').toLowerCase().replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Word count of an utterance. */
function countWords(text) {
    return ((text || '').match(/\S+/g) || []).length;
}

/** True if the utterance is an explicit request for the agent to stop talking. */
function isStopCommand(text) {
    const t = normalize(text);
    if (!t) return false;
    // Only a short utterance counts: "stop" is a command, "don't stop sending me offers" is not.
    if (countWords(t) > 3) return false;
    return STOP_COMMANDS.some(cmd => t === cmd || t.startsWith(`${cmd} `) || t.endsWith(` ${cmd}`));
}

/**
 * Should this transcript cut the agent off mid-sentence?
 * More than two words (per-agent tunable via opts.minWords — see the agent's
 * turnTaking.interruptSensitivity), or an explicit stop command.
 */
function shouldInterrupt(text, { minWords = MIN_INTERRUPT_WORDS } = {}) {
    if (!text) return false;
    return countWords(text) >= minWords || isStopCommand(text);
}

/**
 * True if `text` is a tail re-emission of an utterance already dispatched — streaming ASR
 * emits "ആറ് ഏഴ് ആറ് എട്ട്" and then a standalone "എട്ട്" for the same speech.
 */
function isDuplicateTail(text, lastText, lastAt, windowMs = DUPLICATE_TAIL_WINDOW_MS) {
    if (!lastText || !lastAt) return false;
    if (Date.now() - lastAt > windowMs) return false;
    const candidate = normalize(text).replace(/\s/g, '');
    const previous = normalize(lastText).replace(/\s/g, '');
    return candidate.length >= 2 && previous.endsWith(candidate);
}

/**
 * Acknowledgement tokens ("backchannels"). While the agent is speaking these should NOT cut it
 * off — they are the caller nodding along, not taking the turn. They are still QUEUED and
 * answered once the agent finishes (rule 3): "ശരി" really does mean "okay", and dropping it
 * leaves the call in dead air.
 *
 * Sarvam's own Pipecat guide names exactly this problem ("false interruptions from 'haan' or
 * 'achha'"), and its MinWordsUserTurnStartStrategy solves it with an asymmetric threshold —
 * see shouldInterruptWhileSpeaking below.
 */
const BACKCHANNELS = [
    // English / romanised
    'ok', 'okay', 'k', 'yeah', 'yep', 'yes', 'yup', 'right', 'sure', 'mm', 'mmm', 'hmm', 'mhm',
    'uh huh', 'huh', 'ah', 'aha', 'haan', 'haa', 'ha', 'achha', 'accha', 'theek', 'theek hai',
    'sari', 'sheri', 'athe', 'aan', 'aama', 'sare', 'hoy',
    // Hindi / Marathi
    'हाँ', 'हां', 'ठीक', 'ठीक है', 'अच्छा', 'जी', 'हो',
    // Malayalam
    'ശരി', 'അതെ', 'ഉം', 'ആം', 'ആ',
    // Tamil / Telugu / Kannada / Bengali / Gujarati / Punjabi
    'ஆம்', 'சரி', 'ஆமா', 'సరే', 'అవును', 'ಸರಿ', 'ಹೌದು', 'হ্যাঁ', 'আচ্ছা', 'હા', 'ਹਾਂ',
];

/** Shortest utterance that may be attributed to the agent's own voice echoing back. */
const ECHO_MIN_WORDS = 3;

/** How long a piece of agent speech stays "recent" for echo comparison. */
const AGENT_ECHO_WINDOW_MS = 5000;

/**
 * Words the caller must produce before they can take the turn WHILE THE AGENT IS SPEAKING.
 * 1 is Sarvam's reference value — a single real word interrupts, which is what makes "hello"
 * over a long opening message work. Raise to 2 on a line where echo or crosstalk is cutting
 * the agent off; the cost is that one-word confirmations wait for the agent to finish instead
 * of interrupting (they are still queued and answered, never dropped).
 */
const BARGE_IN_MIN_WORDS = 1;

/** True if the whole utterance is a single acknowledgement token. */
function isBackchannel(text) {
    const t = normalize(text);
    if (!t) return false;
    if (countWords(t) > 2) return false;
    return BACKCHANNELS.includes(t);
}

/**
 * Should this transcript cut the agent off WHILE IT IS SPEAKING?
 *
 * Sarvam's documented model (LiveKit + Pipecat production guides) is an asymmetric threshold:
 * a higher bar applies while the agent talks, and a single word takes the turn the moment it
 * stops. Noise is rejected upstream — at Sarvam's server-side VAD (threshold /
 * min_speech_duration_ms) and by the fact that barge-in is driven by TRANSCRIPTS, so a cough,
 * a door slam or background TV never produces one in the first place.
 *
 * So the bar here is deliberately low: two words, an explicit stop command, or any single word
 * that is not a backchannel. That is what lets a caller's "hello" over a long opening message
 * be heard immediately, while "ശരി" lets the agent finish.
 */
function shouldInterruptWhileSpeaking(text, { minWords = BARGE_IN_MIN_WORDS } = {}) {
    if (!text) return false;
    if (isStopCommand(text)) return true;
    if (countWords(text) < minWords) return false;   // too little to count as taking the turn
    return !isBackchannel(text);                     // an acknowledgement never interrupts
}

/**
 * True if `text` looks like the agent's own voice echoing back off the caller's handset.
 *
 * This is the failure the old 3-word interrupt threshold was really guarding against, and
 * handling it directly is what makes a 1-word barge-in safe. `recentAgentText` is whatever TTS
 * has spoken inside AGENT_ECHO_WINDOW_MS, concatenated.
 */
function isAgentEcho(text, recentAgentText) {
    // Never attribute a short utterance to echo. Agent opening lines routinely contain
    // "hello"/"ഹലോ"/"ठीक है", so a substring match on one or two words would silence the
    // caller saying exactly those things — the failure this guard exists to avoid causing.
    // Real echo arrives as a longer run of the agent's own sentence.
    if (countWords(text) < ECHO_MIN_WORDS) return false;
    const candidate = normalize(text).replace(/\s/g, '');
    if (candidate.length < 8) return false;
    const spoken = normalize(recentAgentText).replace(/\s/g, '');
    if (!spoken) return false;
    return spoken.includes(candidate);
}

module.exports = {
    MIN_INTERRUPT_WORDS,
    DUPLICATE_TAIL_WINDOW_MS,
    BACKCHANNELS,
    BARGE_IN_MIN_WORDS,
    ECHO_MIN_WORDS,
    AGENT_ECHO_WINDOW_MS,
    countWords,
    isStopCommand,
    shouldInterrupt,
    isDuplicateTail,
    isBackchannel,
    shouldInterruptWhileSpeaking,
    isAgentEcho,
};
