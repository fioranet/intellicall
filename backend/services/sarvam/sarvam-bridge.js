const WebSocket = require('ws');
const axios = require('axios');
const { buildVoiceSystemPrompt } = require('../../utils/agent-prompt');
const { applyMergeFields } = require('../../utils/merge-fields');
const { mulawToPcm16 } = require('../../utils/audio-codec');
const AppointmentService = require('../appointment-tool-service');
const { narrateAppointmentResult } = require('../appointment-result-narration');
const { parseTransferTag, transferFailureSentence } = require('../../utils/human-transfer');
const {
    shouldInterruptWhileSpeaking, isDuplicateTail, isAgentEcho, AGENT_ECHO_WINDOW_MS,
} = require('../../utils/turn-taking');

// ─── Sarvam AI endpoints ─────────────────────────────────────
// Model ids and the speaker roster live in utils/sarvam-voices so the live call and
// the voice preview never drift apart. See that file for the deprecation history.
const {
    SARVAM_STT_REALTIME_MODEL: STT_RT_MODEL,   // Saaras realtime ASR (partials, µ-law 8 kHz)
    SARVAM_STT_MODEL: STT_MODEL,               // legacy fallback only
    SARVAM_TTS_MODEL: TTS_MODEL,               // Bulbul streaming TTS (emits 8 kHz µ-law directly)
    SARVAM_LLM_MODEL: LLM_MODEL,               // Sarvam chat model, OpenAI-style SSE
    resolveSarvamSpeaker,
} = require('../../utils/sarvam-voices');

// Realtime STT is the current endpoint: it emits true `transcript.partial` events (the legacy
// socket emits none at all — only one final per utterance), takes µ-law 8 kHz natively so
// telephony audio needs no transcoding, and exposes millisecond VAD tuning. Barge-in here is
// driven by partials, which is why the legacy socket could never interrupt before the caller
// had already stopped talking.
const STT_RT_WS_URL = 'wss://api.sarvam.ai/speech-to-text-realtime/ws';
// Legacy fallback, used only if the account is not enabled for the realtime endpoint.
const STT_WS_URL = 'wss://api.sarvam.ai/speech-to-text/ws';
const TTS_WS_URL = 'wss://api.sarvam.ai/text-to-speech/ws';
const LLM_URL = 'https://api.sarvam.ai/v1/chat/completions';

// ─── Sarvam server-side VAD (telephony preset) ───────────────────────────────
// Noise rejection belongs HERE, not in application word counts: Sarvam's own guidance is to
// raise `threshold` against TV/crosstalk/ambient speech and `min_speech_duration_ms` against
// clicks, coughs and DTMF ("the main dial against false barge-in").
const VAD_THRESHOLD = process.env.SARVAM_VAD_THRESHOLD || '0.7';
const VAD_MIN_SPEECH_MS = process.env.SARVAM_VAD_MIN_SPEECH_MS || '200';
const VAD_SILENCE_MS = process.env.SARVAM_VAD_SILENCE_MS || '500';
const VAD_PREFIX_PADDING_MS = '300';   // keeps the first syllable from being clipped
/**
 * Words the caller needs to cut the agent off mid-sentence. 1 (the default) is what lets a
 * single "hello" over a long opening message be heard. Raise to 2 if line echo or crosstalk is
 * observed interrupting the agent — a shorter utterance is then queued and answered when the
 * agent finishes rather than interrupting it.
 */
const BARGE_IN_MIN_WORDS = parseInt(process.env.SARVAM_BARGE_IN_MIN_WORDS) || 1;

/** Caller audio is batched to ~100ms per websocket frame (µ-law 8k = 8 bytes/ms). */
const STT_SEND_CHUNK_BYTES = 800;
const KEEPALIVE_MS = 20000;      // beat the 60s TTS idle timeout (persistent socket → must ping)
const MAX_STT_RECONNECT_ATTEMPTS = 3; // then surface a terminal error instead of looping forever
// Endpointing hold after end-of-speech, before the turn is committed to the LLM. Sarvam's VAD
// has ALREADY confirmed silence server-side (silence_duration_ms), so anything much above this
// is margin stacked on margin — the docs put the useful range at 200-300ms.
const TURN_COMMIT_DELAY_MS = 250;
// Backstop only: commit the last partial if the final transcript never lands.
const FINAL_FALLBACK_MS = 2000;
// The legacy socket has no partials and re-emits utterance tails, so it keeps the slower
// endpointing it was tuned for.
const LEGACY_END_SPEECH_DEBOUNCE_MS = 150;
const LEGACY_SILENCE_FINALIZE_MS = 900;
const MAX_LLM_HISTORY = 20;
// Barge-in and duplicate-tail policy live in utils/turn-taking.js. Sarvam uses the asymmetric
// rule its own voice-agent guides recommend (a low bar while the agent speaks, none at all once
// it stops); the classic engine keeps the stricter shared rule it was tuned for.
//
// Sarvam's raw VAD speech-start signal is never acted on directly — it fires on a cough, an
// "mm", line noise or the agent's own echo. Barge-in is driven by TRANSCRIPTS instead, which is
// what makes noise rejection work: none of those produce one.
// How often to re-check whether the agent has finished talking so a held short reply
// (a "yes" to a yes/no question) can be answered.
const PENDING_DISPATCH_POLL_MS = 150;
// Never hold a caller's reply longer than this, whatever the speaking state says. Past the cap
// the agent is cut off rather than talked over — after this long, answering the caller matters
// more than finishing the sentence.
const MAX_TURN_HOLD_MS = 8000;
/** An agent asking to hang up this early in a call is hallucinating, not deciding. */
const END_CALL_MIN_CALL_MS = 10000;
/**
 * Hang up a connected-but-silent call — caller put the phone down without hanging up,
 * went on hold, walked away. Independent of RTP/media watchdogs, which only detect the
 * channel going away entirely; audio keeps flowing (silence) for as long as the bridge
 * exists, so this is the only thing that notices nobody is actually talking.
 */
const IDLE_TIMEOUT_MS = parseInt(process.env.CALL_IDLE_TIMEOUT_MS) || 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30000;
const IDLE_HANGUP_MESSAGE = "I haven't heard back from you, so I'll go ahead and end the call now. Goodbye.";
// Don't cut a clause at a comma until it has some substance — tiny fragments ("ശരി,") hurt
// prosody and multiply the number of TTS frames per reply.
const MIN_COMMA_CHUNK_CHARS = 12;

// Emoji / pictographs. Bulbul cannot speak them, and a chunk containing ONLY these makes the
// TTS socket 400 (code=422, "Text must contain at least one character from the allowed
// languages") and close — discarding audio still being generated for earlier chunks.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{E0020}-\u{E007F}]/gu;

/** Drop characters Bulbul cannot voice and normalize whitespace. */
function sanitizeForTts(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(EMOJI_RE, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.!?;:।])/g, '$1')  // close the gap a removed emoji leaves before punctuation
        .trim();
}

/** True if the text has at least one letter — what Sarvam's language check actually requires. */
function hasSpeakableLetters(text) {
    return /\p{L}/u.test(text || '');
}


/** Strip appointment command placeholders so they are never spoken (mirrors sip-voice-stream). */
function stripAppointmentCommands(text) {
    if (!text || typeof text !== 'string') return text;
    return text
        .replace(/\[\[LIST\]\]/g, '')
        .replace(/\[\[SLOTS\]\]/g, '')
        .replace(/\[\[BOOK:[^\]]*\]\]/g, '')
        .replace(/\[\[CANCEL:[^\]]*\]\]/g, '')
        .replace(/\[\[END_CALL\]\]/g, '')
        .replace(/\[\[TRANSFER:[^\]]*\]\]/g, '')
        .replace(/\s*\[\[(?:LIST|SLOTS|BOOK:|CANCEL:|END_CALL|TRANSFER:).*$/g, '')
        // Trailing incomplete cut mid-keyword e.g. " [[END_C" — the tag is emitted at the
        // very end of a reply, which is exactly where a stream chunk tends to split.
        .replace(/\s*\[\[[^\]]*$/g, '')
        .replace(/^[^\[\]]*\]\]\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Parse [[BOOK:...]] content → { date, time, clientName } (mirrors sip-voice-stream). */
function parseBookDateTime(content) {
    if (!content || typeof content !== 'string') return null;
    const trimmed = content.trim();
    const pipeIdx = trimmed.indexOf('|');
    const dateTimePart = pipeIdx >= 0 ? trimmed.slice(0, pipeIdx).trim() : trimmed;
    const clientName = pipeIdx >= 0 ? trimmed.slice(pipeIdx + 1).trim() : '';
    const isoMatch = dateTimePart.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (isoMatch) {
        const [, date, h, m] = isoMatch;
        return { date, time: `${h.padStart(2, '0')}:${m.padStart(2, '0')}`, clientName };
    }
    const { parse: parseDate, format: formatDate, isValid } = require('date-fns');
    const year = new Date().getFullYear();
    const normalized = dateTimePart.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
    const withYear = normalized.includes(String(year)) ? normalized : `${normalized} ${year}`;
    const formats = [
        'EEEE, MMM d, HH:mm yyyy', 'MMMM d yyyy HH:mm', 'MMM d yyyy HH:mm', 'EEEE, MMM d, HH:mm',
        'EEEE, MMM d yyyy HH:mm', 'd MMM yyyy HH:mm', 'd MMM HH:mm', 'MMM d HH:mm', 'MMMM d HH:mm'
    ];
    for (const fmt of formats) {
        try {
            const dt = parseDate(withYear, fmt, new Date());
            if (isValid(dt)) return { date: formatDate(dt, 'yyyy-MM-dd'), time: formatDate(dt, 'HH:mm'), clientName };
        } catch (_) { }
    }
    return null;
}

/**
 * Transport-agnostic bridge to the Sarvam AI voice pipeline (self-orchestrated).
 *
 * One instance per call. The transport adapter (Twilio media stream / SIP RTP) feeds
 * caller audio in via sendAudio() and receives agent audio + control signals through
 * callbacks. Unlike the Deepgram Voice Agent (one managed socket), Sarvam is three
 * separate pieces we orchestrate here: Saaras realtime STT, Sarvam-105B streaming LLM, and
 * Bulbul streaming TTS, with the turn-taking and barge-in policy Sarvam's own voice-agent
 * guides prescribe.
 *
 * Audio contract: 8 kHz G.711 µ-law end to end. The realtime STT endpoint accepts µ-law
 * directly, so caller audio is passed through untouched (the legacy fallback still decodes it
 * to PCM16); TTS audio is emitted as 8 kHz µ-law and passed straight through.
 *
 * Callbacks (set before connect()):
 *   onAudio(Buffer)                — µ-law 8k agent audio to play to the caller
 *   onBargeIn()                    — user started speaking; clear any buffered playback
 *   onTranscript(role, content)    — conversation text (role: 'user' | 'assistant')
 *   onError(service, code, message)— surface into CallLog errors
 */
class SarvamBridge {
    constructor({ callId, settings, agent, lead, testCall = false, testPhrase = '' }) {
        this.callId = callId;
        this.settings = settings;
        this.agent = agent;
        this.lead = lead;
        this.kbContent = '';
        this.testCall = !!testCall;   // test calls only speak a phrase (no STT/LLM)
        this.testPhrase = testPhrase || '';

        this.active = false;
        this.closing = false;

        // Connections
        this.sttWs = null;
        this.ttsWs = null;
        // 'realtime' (saaras:v3-realtime) or 'legacy' — set on the first connect attempt and
        // switched to 'legacy' only if the realtime endpoint never accepted a connection.
        this.sttFlavor = 'realtime';
        this.sttEverConnected = false;
        this.sttLastCloseReason = '';
        this.sttReady = false;
        this.ttsReady = false;
        this.ttsConfigured = false;
        this.keepAliveTimer = null;
        this.sttReconnectAttempts = 0; // capped so a bad key/plan can't reconnect-storm the call

        // Caller audio received before STT is ready is buffered here (base64 strings).
        this.audioBufferQueue = [];
        // Realtime path only: raw µ-law slices accumulated up to STT_SEND_CHUNK_BYTES.
        this._sttAudioParts = [];
        this._sttAudioBytes = 0;

        // Turn-taking / barge-in state
        this.greetingSent = false;
        this.isProcessing = false;
        this.isAISpeaking = false;
        this.interrupted = false;
        this.partialTranscript = '';
        this.commitTimer = null;        // endpointing hold before a turn is committed
        this.finalFallbackTimer = null; // backstop if transcript.final never arrives
        this.abortController = null;
        // Rolling window of what TTS has recently been told to speak, so a transcript that is
        // just the agent's own voice echoing off the caller's handset can be discarded. This is
        // the failure the old 3-word interrupt threshold was standing in for.
        this._recentAgentSpeech = [];
        // A caller turn that finalizes while the previous turn is still being processed is
        // held here and dispatched when processing completes (so no utterance is dropped).
        this.pendingTurn = '';
        this.pendingDispatchTimer = null;
        // Last dispatched final + when, used to discard Saaras tail re-emissions.
        this.lastFinalText = '';
        this.lastFinalAt = 0;

        // TTS send state. Text is queued through a promise chain so clauses can never be
        // delivered out of order when one of them has to wait on a socket reconnect, and
        // letterless fragments are carried forward instead of being sent (and rejected) alone.
        this.ttsCarry = '';
        this._ttsChain = Promise.resolve();
        this.turnEpoch = 0;

        // Conversation history for the LLM ({ role, content }) and the CallLog transcript.
        this.llmMessages = [];
        this.transcript = [];

        this.onAudio = null;
        this.onBargeIn = null;
        this.onTranscript = null;
        this.onError = null;
        // Set by the transport: the agent asked to end the call. The transport owns the
        // drain detection and hangs up once its playout queue is empty.
        this.onEndCall = null;
        /**
         * Human Transfer. Set only by the SIP adapter (setTransferHandler) — the Twilio
         * transport has no second leg to bridge, so the capability is never offered there.
         */
        this.transferHandler = null;
        /** True once the caller has been handed to a human and this engine is out of the bridge. */
        this.transferred = false;
        this._endCallRequested = false;
        this._connectedAt = 0;

        // Idle (connected-but-silent) detection
        this._lastActivityAt = 0;
        this._idleWatchdog = null;
        // Per-turn latency instrumentation (committed → LLM first token → TTS first audio).
        this._turn = null;
        this._loggedAudioFormat = false;

        // Optional, set by the transport: true while agent audio is still draining to the caller.
        // Sarvam's end-of-generation event fires when the LAST audio frame is produced, seconds
        // before a paced RTP queue has actually played it out, so without this the agent counts
        // as "done speaking" while the caller can still hear it.
        this.isPlaybackActive = null;
    }

    /** True while the caller can actually hear the agent (generating or still playing out). */
    _agentIsAudible() {
        if (this.isAISpeaking) return true;
        try { return !!(this.isPlaybackActive && this.isPlaybackActive()); } catch (_) { return false; }
    }

    /** True if the agent is audible or still composing a reply. */
    _agentIsTalking() {
        return this.isProcessing || this._agentIsAudible();
    }

    setKbContent(kbContent) {
        this.kbContent = kbContent || '';
    }

    _key() {
        return this.settings.sarvamKey;
    }

    _language() {
        return this.agent?.sarvamLanguage || 'hi-IN';
    }

    /**
     * Language code for the realtime STT endpoint, which renamed Odia: the legacy socket and
     * Bulbul use `od-IN`, realtime uses `or-IN`.
     */
    _realtimeLanguage() {
        const lang = this._language();
        return lang === 'od-IN' ? 'or-IN' : lang;
    }

    _speaker() {
        // Coerced because agents saved before the bulbul:v3 migration hold v2-only
        // speakers (e.g. 'anushka'), which v3 will not serve.
        return resolveSarvamSpeaker(this.agent?.sarvamSpeaker);
    }

    _greetingText() {
        return applyMergeFields(this.agent?.openingMessage || 'Hello', this.lead, { stripUnmatched: true }) || 'Hello';
    }

    // ─── Lifecycle ───────────────────────────────────────────

    connect() {
        this.active = true;
        this._connectedAt = Date.now();
        this._lastActivityAt = Date.now();
        if (!this.testCall) this._openStt(); // test calls just play a phrase
        this._openTts();
        this._startKeepAlive();
        // Test calls play one phrase and hang up on their own within seconds —
        // idle detection has no useful role there.
        if (!this.testCall) this._startIdleWatchdog();
    }

    _touchActivity() {
        this._lastActivityAt = Date.now();
    }

    _startIdleWatchdog() {
        if (this._idleWatchdog) return;
        this._idleWatchdog = setInterval(() => {
            if (!this.active || this._endCallRequested) return;
            if (Date.now() - this._lastActivityAt < IDLE_TIMEOUT_MS) return;
            console.log(`💤 [Sarvam] [${this.callId}] No activity for ${IDLE_TIMEOUT_MS}ms — ending call`);
            this._pushTranscript('assistant', IDLE_HANGUP_MESSAGE);
            this._sendToTts(IDLE_HANGUP_MESSAGE, true);
            this._endCallRequested = true;
            if (this.onEndCall) this.onEndCall();
        }, IDLE_CHECK_INTERVAL_MS);
        if (typeof this._idleWatchdog.unref === 'function') this._idleWatchdog.unref();
    }

    close() {
        this.closing = true;
        this.active = false;
        this._stopKeepAlive();
        if (this._idleWatchdog) { clearInterval(this._idleWatchdog); this._idleWatchdog = null; }
        this._clearTurnTimers();
        if (this.abortController) { try { this.abortController.abort(); } catch (_) { } this.abortController = null; }
        if (this.pendingDispatchTimer) { clearInterval(this.pendingDispatchTimer); this.pendingDispatchTimer = null; }
        this.pendingTurn = '';
        this.ttsCarry = '';
        this.turnEpoch++;
        this.audioBufferQueue = [];
        this._sttAudioParts = [];
        this._sttAudioBytes = 0;
        try { if (this.sttWs) this.sttWs.terminate(); } catch (_) { }
        try { if (this.ttsWs) this.ttsWs.terminate(); } catch (_) { }
        this.sttWs = null;
        this.ttsWs = null;
        this.sttReady = false;
        this.ttsReady = false;
    }

    // ─── STT (Saaras) ───────────────────────────────

    _openStt() {
        if (!this.active) return;
        if (this.sttFlavor === 'realtime') this._openSttRealtime();
        else this._openSttLegacy();
    }

    /**
     * saaras:v3-realtime. Emits real partial transcripts (which is what makes fast barge-in
     * possible at all), takes µ-law 8 kHz natively, and tunes its VAD in milliseconds.
     */
    _openSttRealtime() {
        const params = new URLSearchParams({
            model: STT_RT_MODEL,
            language_code: this._realtimeLanguage(),
            stream_type: 'fast',            // biggest latency knob; 'balanced' adds up to 1s/turn
            mode: 'transcribe',
            endpointing: 'vad',             // Sarvam's server-side VAD drives turn boundaries
            encoding: 'mulaw',              // telephony codec end to end — no transcode
            sample_rate: '8000',
            threshold: String(VAD_THRESHOLD),
            min_speech_duration_ms: String(VAD_MIN_SPEECH_MS),
            silence_duration_ms: String(VAD_SILENCE_MS),
            prefix_padding_ms: VAD_PREFIX_PADDING_MS,
        });
        const url = `${STT_RT_WS_URL}?${params.toString()}`;
        console.log(`🎧 [Sarvam STT] [${this.callId}] Connecting realtime (${STT_RT_MODEL}, lang=${this._realtimeLanguage()}, mulaw@8k)`);
        this._attachSttSocket(new WebSocket(url, { headers: { 'api-subscription-key': this._key() } }));
    }

    /**
     * Legacy /speech-to-text/ws. Only reached when the account is not enabled for the realtime
     * endpoint. No interim transcripts here, so barge-in can only fire once the caller has
     * already stopped speaking — correctness, not responsiveness.
     */
    _openSttLegacy() {
        const params = new URLSearchParams({
            model: STT_MODEL,
            'language-code': this._language(),
            sample_rate: '8000',
            input_audio_codec: 'pcm_s16le',
            vad_signals: 'true',
            high_vad_sensitivity: 'true',
        });
        const url = `${STT_WS_URL}?${params.toString()}`;
        console.log(`🎧 [Sarvam STT] [${this.callId}] Connecting legacy (${STT_MODEL}, lang=${this._language()})`);
        this._attachSttSocket(new WebSocket(url, { headers: { 'Api-Subscription-Key': this._key() } }));
    }

    /** Shared socket lifecycle for both STT flavours. */
    _attachSttSocket(ws) {
        this.sttWs = ws;

        ws.on('open', () => {
            if (!this.active) { try { ws.terminate(); } catch (_) { } return; }
            this.sttReady = true;
            this.sttEverConnected = true;
            this.sttReconnectAttempts = 0; // a clean connection resets the reconnect budget
            console.log(`🟢 [Sarvam STT] [${this.callId}] Connected (${this.sttFlavor})`);
            if (this.audioBufferQueue.length > 0) {
                this.audioBufferQueue.forEach(b64 => this._sendSttAudio(b64));
                this.audioBufferQueue = [];
            }
        });

        ws.on('message', (data) => {
            if (this.sttFlavor === 'realtime') this._handleRealtimeSttMessage(data);
            else this._handleLegacySttMessage(data);
        });

        // A rejected handshake surfaces here (and as an HTTP status below) rather than as a
        // websocket close code, so both paths have to feed the fallback decision.
        ws.on('unexpected-response', (_req, res) => {
            this.sttLastCloseReason = `HTTP ${res.statusCode}`;
            console.error(`🔴 [Sarvam STT] [${this.callId}] Handshake rejected: HTTP ${res.statusCode}`);
        });

        ws.on('error', (err) => {
            if (!this.sttLastCloseReason) this.sttLastCloseReason = err.message;
            console.error(`🔴 [Sarvam STT] [${this.callId}] Error:`, err.message);
        });

        ws.on('close', (code, reason) => {
            this.sttReady = false;
            const why = (reason && reason.toString()) || this.sttLastCloseReason || '';
            console.log(`⚪ [Sarvam STT] [${this.callId}] Closed (code=${code}${why ? `, ${why}` : ''})`);
            if (!this.active || this.closing) return;

            // The realtime endpoint never accepted a single connection — this account is not
            // enabled for it (docs: close 4000 "account not enabled", 1003 auth/quota). Drop to
            // the legacy socket rather than failing the call.
            if (this.sttFlavor === 'realtime' && !this.sttEverConnected) {
                console.warn(`⬇️  [Sarvam STT] [${this.callId}] Realtime endpoint unavailable (code=${code}${why ? `, ${why}` : ''}) — falling back to legacy ${STT_MODEL}`);
                this.sttFlavor = 'legacy';
                this.sttReconnectAttempts = 0;
                this.sttLastCloseReason = '';
                this._sttAudioParts = [];
                this._sttAudioBytes = 0;
                this.audioBufferQueue = [];   // buffered µ-law is the wrong format for legacy
                setTimeout(() => { if (this.active && !this.closing) this._openStt(); }, 200);
                return;
            }

            // Auth / quota / bad parameters are not transient — retrying just burns the call.
            if (code === 1003 || code === 4000) {
                const msg = `Sarvam speech recognition rejected the connection (code=${code}${why ? `: ${why}` : ''}). Check the Sarvam API key, its plan and concurrency limits.`;
                console.error(`❌ [Sarvam STT] [${this.callId}] ${msg}`);
                if (this.onError) this.onError('sarvam', String(code), msg);
                return;
            }

            if (this.sttReconnectAttempts >= MAX_STT_RECONNECT_ATTEMPTS) {
                const msg = 'Sarvam speech recognition connection lost and could not be restored. Verify the Sarvam API key has streaming ASR access.';
                console.error(`❌ [Sarvam STT] [${this.callId}] ${msg}`);
                if (this.onError) this.onError('sarvam', 'stt_disconnected', msg);
                return;
            }
            // Exponential backoff with jitter, per Sarvam's reconnect guidance.
            this.sttReconnectAttempts++;
            const delay = Math.min(500 * Math.pow(2, this.sttReconnectAttempts - 1), 4000) + Math.floor(Math.random() * 150);
            console.log(`🔄 [Sarvam STT] [${this.callId}] Reconnecting (${this.sttReconnectAttempts}/${MAX_STT_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
            setTimeout(() => { if (this.active && !this.closing) this._openStt(); }, delay);
        });
    }

    /** Realtime event protocol: session.begin / vad.* / transcript.* / error / session.end. */
    _handleRealtimeSttMessage(data) {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch (_) { return; }

        switch (msg.event) {
            case 'session.begin':
                // Sarvam support resolves issues fastest against a request_id — log it once.
                console.log(`🪧 [Sarvam STT] [${this.callId}] Session begin (request_id=${msg.request_id || 'n/a'})`);
                return;
            case 'vad.speech_start':
                this._onSpeechStart();
                return;
            case 'transcript.partial':
                if (msg.text) this._onPartialTranscript(String(msg.text).trim());
                return;
            case 'vad.speech_end':
                this._onUserSpeechEnd();
                return;
            case 'transcript.final':
                if (msg.text) this._onFinalTranscript(String(msg.text).trim());
                return;
            case 'error': {
                const m = msg.message || 'Sarvam STT error';
                const code = msg.code || 'stt_error';
                console.error(`🔴 [Sarvam STT] [${this.callId}] ${m} (code=${code}, fatal=${!!msg.is_fatal})`);
                // Non-fatal errors are a degradation signal, not a call-ending one — don't
                // surface them into the CallLog or the caller sees an error for a hiccup.
                if (msg.is_fatal && this.onError) this.onError('sarvam', String(code), `Sarvam speech recognition error: ${m}`);
                return;
            }
            default:
                return; // config.updated / pong / session.end need no action
        }
    }

    /** Legacy envelope: { type: 'data'|'events'|'error', data: {...} }. */
    _handleLegacySttMessage(data) {
        const raw = data.toString();
        let msg;
        try { msg = JSON.parse(raw); } catch (_) { return; }

        if (msg.type === 'error' || msg.error) {
            const m = msg.data?.error || msg.data?.message || msg.error?.message || msg.message || 'Sarvam STT error';
            const code = msg.data?.code || msg.code || 'stt_error';
            console.error(`🔴 [Sarvam STT] [${this.callId}] ${m} (code=${code})`);
            if (this.onError) this.onError('sarvam', String(code), `Sarvam speech recognition error: ${m}`);
            return;
        }

        // No interim transcripts on this endpoint, so every transcript is effectively a final.
        const transcript = (msg.data?.transcript ?? msg.transcript ?? '').toString().trim();
        if (transcript) this._onFinalTranscript(transcript);
        // START_SPEECH is deliberately not acted on: raw VAD alone can't tell a real
        // interruption from a cough or the agent's own echo. Barge-in is decided from the
        // transcript instead.
        if (raw.includes('END_SPEECH')) this._onUserSpeechEnd();
    }

    _sendSttAudio(b64) {
        if (this.sttWs && this.sttWs.readyState === WebSocket.OPEN) {
            try {
                if (this.sttFlavor === 'realtime') {
                    this.sttWs.send(JSON.stringify({ event: 'audio_input', audio: b64 }));
                } else {
                    // Legacy requires sample_rate + encoding on EVERY audio message; the codec
                    // itself is declared once on the connection (input_audio_codec=pcm_s16le).
                    this.sttWs.send(JSON.stringify({ audio: { data: b64, sample_rate: '8000', encoding: 'audio/wav' } }));
                }
            } catch (_) { }
        }
    }

    /**
     * Caller audio (raw µ-law 8k Buffer) → Sarvam STT. Buffered until the socket is ready.
     *
     * Realtime takes µ-law directly, so the whole µ-law→PCM16 decode disappears and each frame
     * carries half the bytes. Frames are batched to ~100ms (Sarvam's own SDK cadence) so a call
     * sends ~10 websocket messages a second instead of 50.
     */
    sendAudio(mulawBuf) {
        if (!this.active) return;

        if (this.sttFlavor === 'realtime') {
            this._sttAudioParts.push(mulawBuf);
            this._sttAudioBytes += mulawBuf.length;
            if (this._sttAudioBytes < STT_SEND_CHUNK_BYTES) return;
            const chunk = Buffer.concat(this._sttAudioParts, this._sttAudioBytes);
            this._sttAudioParts = [];
            this._sttAudioBytes = 0;
            this._queueOrSendStt(chunk.toString('base64'));
            return;
        }

        this._queueOrSendStt(mulawToPcm16(mulawBuf).toString('base64'));
    }

    _queueOrSendStt(b64) {
        if (this.sttReady) {
            this._sendSttAudio(b64);
        } else {
            this.audioBufferQueue.push(b64);
            // ~40s either way: realtime frames carry ~100ms each, legacy frames ~20ms.
            const cap = this.sttFlavor === 'realtime' ? 400 : 2000;
            if (this.audioBufferQueue.length > cap) this.audioBufferQueue.shift();
        }
    }

    // ─── Turn-taking / barge-in ──────────────────────────────

    /** Saaras sometimes re-emits the tail of an utterance we already dispatched — ignore it. */
    _isDuplicateTail(text) {
        return isDuplicateTail(text, this.lastFinalText, this.lastFinalAt);
    }

    _clearTurnTimers() {
        if (this.commitTimer) { clearTimeout(this.commitTimer); this.commitTimer = null; }
        if (this.finalFallbackTimer) { clearTimeout(this.finalFallbackTimer); this.finalFallbackTimer = null; }
    }

    /** Remember what TTS was told to speak, so the same words coming back can be recognised. */
    _noteAgentSpeech(text) {
        if (!text) return;
        const now = Date.now();
        this._recentAgentSpeech.push({ text, at: now });
        // Keep a generous window: TTS generates well ahead of playout, so text handed over
        // several seconds ago may only be reaching the caller's ear now.
        const cutoff = now - (AGENT_ECHO_WINDOW_MS * 3);
        while (this._recentAgentSpeech.length && this._recentAgentSpeech[0].at < cutoff) this._recentAgentSpeech.shift();
        if (this._recentAgentSpeech.length > 12) this._recentAgentSpeech.shift();
    }

    /**
     * True if this transcript is the agent's own voice echoing back off the caller's handset.
     * Only meaningful while the agent is actually audible — once it has gone quiet, matching
     * words are the caller genuinely repeating something.
     */
    _isAgentEcho(text) {
        if (!this._agentIsAudible()) return false;
        return isAgentEcho(text, this._recentAgentSpeech.map(e => e.text).join(' '));
    }

    /** The caller started speaking — cancel a pending commit so their turn isn't cut in half. */
    _onSpeechStart() {
        if (this.commitTimer) { clearTimeout(this.commitTimer); this.commitTimer = null; }
    }

    /**
     * An interim transcript. This is where barge-in is decided: only real speech reaches this
     * point, so a cough, a door slam or background TV can never interrupt the agent — none of
     * them produce a transcript. Noise rejection lives upstream in Sarvam's VAD.
     */
    _onPartialTranscript(text) {
        if (!text) return;
        if (this._isAgentEcho(text)) return;
        // A tail re-emission of the turn just dispatched is not new speech: acting on it aborts
        // the reply that is streaming and queues a duplicate turn.
        if (this._isDuplicateTail(text)) return;

        this.partialTranscript = text;
        this._maybeBargeIn(text);
        // Backstop only — a final normally follows and commits the turn.
        if (this.finalFallbackTimer) clearTimeout(this.finalFallbackTimer);
        this.finalFallbackTimer = setTimeout(() => { this.finalFallbackTimer = null; this._finalizeTurn(); }, FINAL_FALLBACK_MS);
    }

    /** A committed transcript for the utterance. */
    _onFinalTranscript(text) {
        if (!text) return;
        if (this._isAgentEcho(text)) return;
        if (this._isDuplicateTail(text)) return;
        this.partialTranscript = text;
        this._maybeBargeIn(text);
        // Legacy emits no interim results, so a transcript arriving without an END_SPEECH is
        // all we get; wait long enough for a re-emitted tail rather than committing on the
        // first fragment.
        this._scheduleCommit(this.sttFlavor === 'realtime' ? TURN_COMMIT_DELAY_MS : LEGACY_SILENCE_FINALIZE_MS);
    }

    /**
     * Barge-in policy. Asymmetric by design: while the agent is speaking a caller needs two
     * words, an explicit stop command, or any single word that is not a backchannel — so
     * "hello" cuts in immediately while "ശരി" lets the agent finish and is answered after.
     * While the agent is silent there is no gate at all; the turn is simply taken.
     */
    _maybeBargeIn(text) {
        if (!this._agentIsTalking()) return;
        if (!shouldInterruptWhileSpeaking(text, { minWords: BARGE_IN_MIN_WORDS })) return;
        console.log(`🎤 [Sarvam] [${this.callId}] Barge-in: "${text.substring(0, 40)}"`);
        this._stopSpeaking();
        if (this.onBargeIn) this.onBargeIn();
    }

    /** End of speech (server VAD). On the realtime socket this arrives BEFORE the final. */
    _onUserSpeechEnd() {
        // The legacy socket's END_SPEECH is followed by the transcript, so hold only long
        // enough for it to land; realtime has already delivered partials by this point.
        this._scheduleCommit(this.sttFlavor === 'realtime' ? TURN_COMMIT_DELAY_MS : LEGACY_END_SPEECH_DEBOUNCE_MS);
    }

    /**
     * Endpointing hold. Sarvam's VAD has already confirmed silence server-side, so this is a
     * short grace period rather than a second silence detector — and a new speech_start during
     * the hold cancels it.
     */
    _scheduleCommit(delayMs = TURN_COMMIT_DELAY_MS) {
        if (this.commitTimer) clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => { this.commitTimer = null; this._finalizeTurn(); }, delayMs);
    }

    _finalizeTurn() {
        this._clearTurnTimers();
        const finalText = this.partialTranscript.trim();
        if (!this.active || finalText.length < 2) return;
        if (this._isDuplicateTail(finalText)) {
            this.partialTranscript = '';
            return;
        }
        this.partialTranscript = '';
        this.lastFinalText = finalText;
        this.lastFinalAt = Date.now();

        // The agent has gone quiet: take the turn immediately, whatever its length. A one-word
        // "yes"/"അതെ"/"ഇല്ല" answering a yes/no question is real content, and there is nothing
        // left to talk over.
        if (!this.isProcessing && !this._agentIsAudible()) {
            console.log(`👤 [Sarvam] [${this.callId}] Final: "${finalText.substring(0, 80)}"`);
            this._processTurn(finalText);
            return;
        }
        // Still speaking, and this utterance wasn't emphatic enough to interrupt (a
        // backchannel). Hold it — never discard it — and answer once the agent finishes.
        this._queueTurn(finalText);
    }

    /** Hold an utterance until the agent has stopped talking, then dispatch it. */
    _queueTurn(text) {
        // Append rather than replace: a caller spelling out a number in short bursts would
        // otherwise lose every fragment but the last.
        if (!this.pendingTurn) this.pendingTurnAt = Date.now();
        this.pendingTurn = this.pendingTurn ? `${this.pendingTurn} ${text}` : text;
        if (this.pendingTurn.length > 500) this.pendingTurn = this.pendingTurn.slice(-500);
        console.log(`📥 [Sarvam] [${this.callId}] Turn queued (agent talking): "${text.substring(0, 60)}"`);
        this._watchForDispatch();
    }

    /**
     * Poll until the agent is neither composing nor audible, then speak the held turn. Dispatch
     * has to wait for playout, not just for generation: the RTP queue can still hold seconds of
     * speech after Sarvam has emitted its last audio frame.
     */
    _watchForDispatch() {
        // Try straight away — after a barge-in the agent is already silent, so the held turn
        // shouldn't sit out a poll interval.
        if (this._tryDispatchPending()) return;
        if (this.pendingDispatchTimer) return;
        this.pendingDispatchTimer = setInterval(() => this._tryDispatchPending(), PENDING_DISPATCH_POLL_MS);
    }

    /** Speak the held turn if the agent has gone quiet. Returns true once it is handled. */
    _tryDispatchPending() {
        const stop = () => {
            if (this.pendingDispatchTimer) { clearInterval(this.pendingDispatchTimer); this.pendingDispatchTimer = null; }
        };
        if (!this.active || !this.pendingTurn) { stop(); return true; }
        // Safety valve: if "still speaking" ever sticks — a TTS socket dying before its
        // end-of-generation event, say — the caller must not be left holding an unanswered
        // reply for the rest of the call. Speak it anyway past the cap.
        const heldFor = Date.now() - (this.pendingTurnAt || 0);
        const stillTalking = this.isProcessing || this._agentIsAudible();
        if (heldFor < MAX_TURN_HOLD_MS && stillTalking) return false;
        if (heldFor >= MAX_TURN_HOLD_MS && stillTalking) {
            // Past the cap, answering beats finishing the sentence — so cut the agent off
            // instead of starting a second reply over the top of the first.
            console.warn(`⏰ [Sarvam] [${this.callId}] Held turn exceeded ${MAX_TURN_HOLD_MS}ms — interrupting the agent to answer it`);
            this._stopSpeaking();
            if (this.onBargeIn) this.onBargeIn();
        }
        stop();
        const next = this.pendingTurn;
        this.pendingTurn = '';
        console.log(`📤 [Sarvam] [${this.callId}] Dispatching queued turn: "${next.substring(0, 60)}"`);
        this._processTurn(next);
        return true;
    }

    _stopSpeaking() {
        this._touchActivity();
        this._cancelEndCall();
        this.isAISpeaking = false;
        this.interrupted = true;
        // Invalidate anything still queued on the TTS send chain so a clause from the aborted
        // turn can't land on the socket the next turn opens.
        this.turnEpoch++;
        this.ttsCarry = '';
        if (this.abortController) {
            try { this.abortController.abort(); } catch (_) { }
            this.abortController = null;
        }
        // Bulbul has no in-band cancel, so the only reliable way to truly stop pending audio on
        // barge-in is to drop the socket; it re-opens cleanly on the next reply. (A persistent
        // socket that keeps generating after an aborted turn was observed to go silent.)
        if (this.ttsWs) {
            try { this.ttsWs.terminate(); } catch (_) { }
            this.ttsWs = null;
            this.ttsReady = false;
            this.ttsConfigured = false;
            // Reopen straight away rather than lazily in _ensureTts: otherwise the next reply
            // pays a full TLS handshake to Sarvam on its critical path, right when the caller
            // is waiting for an answer.
            setImmediate(() => { if (this.active && !this.closing && !this.ttsWs) this._openTts(); });
        }
        this._recentAgentSpeech = [];
    }

    // ─── LLM (Sarvam SSE) → TTS ──────────────────────────────

    async _processTurn(userText) {
        this.isProcessing = true;
        this.interrupted = false;
        this._turn = { at: Date.now(), llmAt: 0, ttsAt: 0, logged: false };
        this._pushTranscript('user', userText);
        this.llmMessages.push({ role: 'user', content: userText });

        this.abortController = new AbortController();
        const systemPrompt = buildVoiceSystemPrompt({
            agent: this.agent, settings: this.settings, kbContent: this.kbContent,
            commandTags: true, lead: this.lead,
            humanTransfer: !!this.transferHandler,
        });
        const recent = this.llmMessages.slice(-MAX_LLM_HISTORY);

        let fullReply = '';
        try {
            const response = await axios({
                method: 'post',
                url: LLM_URL,
                // reasoning_effort:null DISABLES Sarvam's hybrid reasoning — otherwise it streams
                // thinking tokens (delta.reasoning_content) BEFORE any spoken content, adding seconds
                // to time-to-first-token. temperature 0.2 is the docs' recommended value with reasoning
                // off; max_tokens caps replies short (safe only because reasoning is disabled).
                data: {
                    model: LLM_MODEL,
                    messages: [{ role: 'system', content: systemPrompt }, ...recent],
                    stream: true,
                    reasoning_effort: null,
                    temperature: 0.2,
                    max_tokens: 300,
                },
                headers: { 'Authorization': `Bearer ${this._key()}`, 'Content-Type': 'application/json' },
                responseType: 'stream',
                signal: this.abortController.signal,
            });

            let chunkBuffer = '';
            for await (const chunk of response.data) {
                if (this.interrupted) break;
                const lines = chunk.toString().split('\n').filter(l => l.trim() !== '');
                for (const line of lines) {
                    if (line.includes('[DONE]')) break;
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const json = JSON.parse(line.slice(6));
                        const delta = json.choices?.[0]?.delta || {};
                        // Reasoning is disabled, but never speak a thinking token if one slips through.
                        if (delta.reasoning_content && !delta.content) continue;
                        const content = delta.content || '';
                        if (!content) continue;
                        if (this._turn && !this._turn.llmAt) this._turn.llmAt = Date.now();
                        fullReply += content;
                        chunkBuffer += content;
                        // Buffer clause text as it streams; the trailing flush below speaks the reply.
                        const sentenceEnd = /[.!?\n।]/.test(content);
                        const clauseEnd = /[,;:]/.test(content) && chunkBuffer.trim().length >= MIN_COMMA_CHUNK_CHARS;
                        // "4,999" / "4.5": a separator inside a number is not a clause boundary —
                        // breaking there makes TTS read the halves as two separate numbers.
                        const midNumber = /\d[.,]$/.test(chunkBuffer.trimEnd());
                        if ((sentenceEnd || clauseEnd) && !midNumber) {
                            this._speakChunk(chunkBuffer, false);
                            chunkBuffer = '';
                        }
                    } catch (_) { }
                }
            }
            if (!this.interrupted) this._speakChunk(chunkBuffer, true);

            if (fullReply && !this.interrupted) {
                console.log(`🤖 [Sarvam LLM] [${this.callId}] Reply: "${fullReply.substring(0, 100)}"`);
                this._pushTranscript('assistant', fullReply);
                this.llmMessages.push({ role: 'assistant', content: fullReply });
                this._handleEndCallCommand(fullReply);
                // Human Transfer first: if the caller is handed to a person, nothing else
                // in this turn is worth doing.
                const transferred = await this._handleTransferCommand(fullReply, userText);
                if (!transferred) await this._handleAppointmentCommands(fullReply, userText);
            }
        } catch (err) {
            if (axios.isCancel(err) || err.name === 'CanceledError' || err.message === 'canceled') {
                console.log(`[Sarvam] [${this.callId}] LLM aborted (barge-in)`);
            } else {
                // The response is a stream, so the error body (the real 400 reason) isn't on
                // err.response.data directly — collect it so failures are diagnosable.
                let detail = err.message;
                try {
                    const body = err.response?.data;
                    if (body && typeof body.on === 'function') {
                        const chunks = [];
                        for await (const c of body) chunks.push(c);
                        const text = Buffer.concat(chunks).toString();
                        if (text) detail = text.slice(0, 400);
                    } else if (body) {
                        detail = (typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 400);
                    }
                } catch (_) { }
                const status = err.response?.status || 'llm_error';
                console.error(`🔴 [Sarvam LLM] [${this.callId}] Error (${status}): ${detail}`);
                if (this.onError) this.onError('sarvam', String(status), `Sarvam AI response failed: ${detail}`);
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
            // A turn that arrived while we were busy is never dropped — but this reply is now
            // playing out, so let the watcher speak it once the caller has actually heard it
            // rather than starting a second reply over the top of the first.
            if (this.active && this.pendingTurn) this._watchForDispatch();
        }
    }

    /**
     * [[END_CALL]] is a capability of every agent, so it is parsed here rather than inside
     * _handleAppointmentCommands, which returns early when booking is switched off.
     *
     * Only the intent is recorded — the transport owns drain detection and hangs up once
     * its playout queue is empty, so the closing line is never cut off.
     */
    _handleEndCallCommand(fullReply) {
        if (this._endCallRequested || this.interrupted) return;
        if (!/\[\[END_CALL\]\]/.test(fullReply)) return;

        // A model that wants to hang up in the opening seconds, or before the caller has
        // said anything, is hallucinating rather than deciding.
        if (this._connectedAt && Date.now() - this._connectedAt < END_CALL_MIN_CALL_MS) {
            console.warn(`⚠️ [Sarvam] [${this.callId}] Ignoring [[END_CALL]] — call is only seconds old`);
            return;
        }
        if (!this.transcript.some(t => t.role === 'user')) {
            console.warn(`⚠️ [Sarvam] [${this.callId}] Ignoring [[END_CALL]] — caller has not spoken yet`);
            return;
        }

        this._endCallRequested = true;
        console.log(`📴 [Sarvam] [${this.callId}] Agent requested end of call`);
        if (this.onEndCall) this.onEndCall();
    }

    /**
     * Caller spoke over the goodbye — they are not done, so stay on the line. Resets the
     * request flag (not just the transport's drain state) so a later idle period or a
     * genuine [[END_CALL]] can still end the call; without this, one cancelled attempt
     * would silently disable end-of-call detection for the rest of the conversation.
     */
    _cancelEndCall() {
        if (!this._endCallRequested) return;
        this._endCallRequested = false;
        console.log(`🙅 [Sarvam] [${this.callId}] End of call cancelled — caller spoke again`);
    }

    /**
     * Enable Human Transfer for this call. `fn(destinationId, reason)` resolves the JSON
     * string that transferCall() produced.
     */
    setTransferHandler(fn) {
        this.transferHandler = fn;
    }

    /**
     * The agent emitted [[TRANSFER:destination_id]]. Dial the human and wait for the
     * outcome — the caller stays bridged to this agent the whole time, so a destination
     * that is busy or does not answer lands back in this same conversation.
     *
     * Returns true when a transfer was attempted (handled this turn), false otherwise.
     */
    async _handleTransferCommand(fullReply, userInput) {
        if (!this.transferHandler || this.interrupted) return false;
        const destinationId = parseTransferTag(fullReply);
        if (destinationId === null) return false;

        console.log(`↪️  [Sarvam] [${this.callId}] Agent requested transfer to "${destinationId || '(default)'}"`);
        let rawResult;
        try {
            rawResult = await this.transferHandler(destinationId, userInput || '');
        } catch (e) {
            console.error(`[Sarvam] [${this.callId}] Transfer failed:`, e.message);
            rawResult = JSON.stringify({ ok: false, code: 'FAILED' });
        }

        this.llmMessages.push({ role: 'system', content: `COMMAND RESULT: ${rawResult}` });

        const sentence = transferFailureSentence(rawResult);
        // Empty means the handover succeeded: the caller is with a human and this engine
        // has already been detached from the bridge, so it must stay silent.
        if (!sentence || this.interrupted || this.transferred) return true;

        const toSpeak = await narrateAppointmentResult({
            rawResult: sentence,
            agentLanguage: this._language(),
            lastUserUtterance: userInput,
            isListOrSlots: false,
            openRouterKey: this.settings.openRouterKey,
            sarvamKey: this._key(),
            domain: 'transfer',
        }).catch(() => sentence);

        if (toSpeak && !this.interrupted && !this.transferred) {
            this._sendToTts(toSpeak, true);
            this._pushTranscript('assistant', toSpeak);
            this.llmMessages.push({ role: 'assistant', content: toSpeak });
        }
        return true;
    }

    /**
     * The caller has been handed to a human and this engine's ExternalMedia leg is out of
     * the bridge. Stop everything that would read the resulting silence as a hangup, and
     * close the provider sockets. The CallLog is left to the adapter's cleanup(), which
     * still runs when the whole call ends.
     */
    detachForTransfer() {
        if (this.transferred) return;
        this.transferred = true;
        this.onEndCall = null;
        console.log(`🔇 [Sarvam] [${this.callId}] Detached from the bridge — caller is with a human`);
        if (this.abortController) { try { this.abortController.abort(); } catch (_) { } this.abortController = null; }
        this.close();
    }

    /** Parse and execute [[SLOTS]]/[[LIST]]/[[BOOK]]/[[CANCEL]] commands, then narrate the result. */
    async _handleAppointmentCommands(fullReply, userInput) {
        if (!this.agent?.appointmentBookingEnabled || this.interrupted) return;
        const listMatch = fullReply.match(/\[\[LIST\]\]/);
        const slotsMatch = fullReply.match(/\[\[SLOTS\]\]/);
        const bookMatch = fullReply.match(/\[\[BOOK:(.*?)\]\]/);
        const cancelMatch = fullReply.match(/\[\[CANCEL:(.*?)\]\]/);

        let result = '';
        try {
            if (listMatch) {
                result = await AppointmentService.listAppointments(this.settings.userId, this.lead?.phone);
            } else if (slotsMatch) {
                result = await AppointmentService.getAvailableSlots(this.settings.userId);
            } else if (bookMatch) {
                const parsed = parseBookDateTime(bookMatch[1].trim());
                if (parsed) {
                    result = await AppointmentService.bookAppointment(
                        this.settings.userId, this.agent._id, this.lead?._id, this.lead?.phone,
                        parsed.date, parsed.time, parsed.clientName || '');
                }
            } else if (cancelMatch) {
                const parts = cancelMatch[1].trim().split(' ');
                if (parts.length >= 2) {
                    result = await AppointmentService.cancelAppointment(this.settings.userId, this.lead?.phone, parts[0], parts[1]);
                }
            }
        } catch (e) {
            console.error(`[Sarvam] [${this.callId}] Appointment command failed:`, e.message);
        }

        if (result && !this.interrupted) {
            console.log(`🛠️ [Sarvam] [${this.callId}] Command result: ${String(result).substring(0, 80)}`);
            this.llmMessages.push({ role: 'system', content: `COMMAND RESULT: ${result}` });
            const toSpeak = await narrateAppointmentResult({
                rawResult: result,
                agentLanguage: this._language(),
                lastUserUtterance: userInput,
                isListOrSlots: !!(slotsMatch || listMatch),
                openRouterKey: this.settings.openRouterKey,
                sarvamKey: this._key(),
            }).catch(() => '');
            if (toSpeak && !this.interrupted) {
                this._sendToTts(toSpeak, true);
                this._pushTranscript('assistant', toSpeak);
                this.llmMessages.push({ role: 'assistant', content: toSpeak });
            }
        }
    }

    // ─── TTS (Bulbul streaming) ──────────────────────────────

    _openTts() {
        if (!this.active) return;
        const url = `${TTS_WS_URL}?model=${TTS_MODEL}&send_completion_event=true`;
        console.log(`🔊 [Sarvam TTS] [${this.callId}] Connecting (speaker=${this._speaker()})`);
        this.ttsConfigured = false;
        this.ttsWs = new WebSocket(url, { headers: { 'Api-Subscription-Key': this._key() } });

        this.ttsWs.on('open', () => {
            if (!this.active) { try { this.ttsWs.terminate(); } catch (_) { } return; }
            this.ttsReady = true;
            console.log(`🟢 [Sarvam TTS] [${this.callId}] Connected`);
            this._sendTtsConfig();
            // Speak the opening message (or the test phrase) once, as soon as TTS is live.
            if (!this.greetingSent) {
                this.greetingSent = true;
                const greeting = this.testCall ? (this.testPhrase || 'This is a test call.') : this._greetingText();
                this._pushTranscript('assistant', greeting);
                if (!this.testCall) this.llmMessages.push({ role: 'assistant', content: greeting });
                this.interrupted = false;
                this._sendToTts(greeting, true);
            }
        });

        this.ttsWs.on('message', (data) => {
            let msg;
            try { msg = JSON.parse(data.toString()); } catch (_) { return; }
            if (msg.type === 'audio' && msg.data?.audio) {
                if (this.interrupted) return;
                // Bulbul v3 defaults to 24 kHz. If speech_sample_rate were ever ignored we would
                // be playing 24 kHz audio out an 8 kHz RTP leg — three times too slow, and
                // completely silent as a failure. Say what we actually got, once per call.
                if (!this._loggedAudioFormat) {
                    this._loggedAudioFormat = true;
                    console.log(`🎚️ [Sarvam TTS] [${this.callId}] Audio format: ${msg.data.content_type || 'unspecified'} (expected µ-law 8000)`);
                }
                this.isAISpeaking = true;
                if (this._turn && !this._turn.ttsAt) { this._turn.ttsAt = Date.now(); this._logTurnTimings(); }
                if (this.onAudio) this.onAudio(Buffer.from(msg.data.audio, 'base64'));
            } else if (msg.type === 'event') {
                // Sarvam signals end-of-generation for a flushed turn (send_completion_event
                // defaults on). Disarm the barge-in guard so a stray VAD hit while the agent is
                // idle doesn't tear down TTS and truncate the next reply.
                this.isAISpeaking = false;
            } else if (msg.type === 'error' || msg.error) {
                const m = msg.data?.error || msg.data?.message || msg.error?.message || msg.message || 'Sarvam TTS error';
                const code = msg.data?.code || msg.code || 'tts_error';
                console.error(`🔴 [Sarvam TTS] [${this.callId}] ${m} (code=${code})`);
                if (this.onError) this.onError('sarvam', String(code), `Sarvam text-to-speech error: ${m}`);
            }
        });

        this.ttsWs.on('error', (err) => {
            console.error(`🔴 [Sarvam TTS] [${this.callId}] Error:`, err.message);
            if (this.onError) this.onError('sarvam', 'tts_error', `Sarvam text-to-speech error: ${err.message}. Verify the Sarvam API key.`);
        });

        this.ttsWs.on('close', (code) => {
            this.ttsReady = false;
            this.ttsConfigured = false;
            // No socket, no generation. Without this the end-of-generation event never arrives
            // on an abnormal close and the agent counts as speaking for the rest of the call,
            // holding every queued caller turn behind it.
            this.isAISpeaking = false;
            console.log(`⚪ [Sarvam TTS] [${this.callId}] Closed (code=${code})`);
        });
    }

    _sendTtsConfig() {
        if (!this.ttsWs || this.ttsWs.readyState !== WebSocket.OPEN) return;
        this.ttsWs.send(JSON.stringify({
            type: 'config',
            data: {
                // `language_code` is the field the current config schema requires;
                // `target_language_code` is the older alias, kept alongside it so a server
                // still expecting the old name keeps working.
                language_code: this._language(),
                target_language_code: this._language(),
                speaker: this._speaker(),
                model: TTS_MODEL,
                speech_sample_rate: '8000',
                output_audio_codec: 'mulaw',
                // Sarvam withholds the first audio byte until this many characters have
                // accumulated server-side. 30 is the minimum and the single biggest lever on
                // time-to-first-audio; the default 50 stalls every short reply.
                min_buffer_size: 30,
                max_chunk_length: 150,
                pace: 1.0,
                temperature: 0.4,   // IVR/telephony preset: controlled, consistent delivery
            },
        }));
        this.ttsConfigured = true;
    }

    async _ensureTts() {
        if (this.ttsWs && this.ttsWs.readyState === WebSocket.OPEN && this.ttsConfigured) return;
        if (!this.ttsWs || this.ttsWs.readyState === WebSocket.CLOSED || this.ttsWs.readyState === WebSocket.CLOSING) {
            this._openTts();
        }
        // Only reached on a genuine cold (re)connect now that the socket is persistent — poll
        // finely so the first turn after a reconnect isn't stalled in 100ms steps.
        let attempts = 0;
        while ((!this.ttsReady || !this.ttsConfigured) && attempts < 100 && this.active) {
            await new Promise(r => setTimeout(r, 20));
            attempts++;
        }
    }

    /**
     * Accumulate a streamed clause and hand it to TTS once it is actually speakable.
     *
     * A frame with no letters (emoji, a lone "🌼", stray punctuation) makes Sarvam reply
     * 400/422 and CLOSE the socket, which throws away the audio it was still generating for
     * everything sent before it — the caller hears the reply stop mid-word. So a letterless
     * fragment is carried into the next clause instead of being sent on its own.
     */
    _speakChunk(text, flush) {
        const cleaned = sanitizeForTts(stripAppointmentCommands(text || ''));
        if (cleaned) this.ttsCarry = this.ttsCarry ? `${this.ttsCarry} ${cleaned}` : cleaned;
        if (!flush && !hasSpeakableLetters(this.ttsCarry)) return;

        const payload = this.ttsCarry;
        this.ttsCarry = '';
        if (!flush) { this._sendToTts(payload, false); return; }
        // End of reply: a letterless remainder has nothing to voice — drop the text but still
        // flush, so the audio queued for the rest of the reply is generated and delivered.
        if (payload && !hasSpeakableLetters(payload)) {
            console.log(`⏭️ [Sarvam TTS] [${this.callId}] Skipped unspeakable tail: ${JSON.stringify(payload.substring(0, 20))}`);
            this._sendToTts('', true);
            return;
        }
        this._sendToTts(payload, true);
    }

    /**
     * Queue a TTS frame. Serialized through a promise chain: _deliverToTts awaits a socket
     * reconnect, so unserialized calls could deliver a later clause before an earlier one and
     * scramble the sentence.
     */
    _sendToTts(text, flush) {
        const epoch = this.turnEpoch;
        this._ttsChain = this._ttsChain
            .then(() => this._deliverToTts(text, flush, epoch))
            .catch(() => { });
        return this._ttsChain;
    }

    async _deliverToTts(text, flush, epoch) {
        if (!this.active) return;
        // Barge-in (or an injected message) happened after this frame was queued — drop it
        // rather than speaking a dead turn's text over the new one.
        if (epoch !== undefined && epoch !== this.turnEpoch) return;
        if (this.interrupted) return;
        let clean = sanitizeForTts(stripAppointmentCommands(text || ''));
        if (clean && !hasSpeakableLetters(clean)) clean = '';
        if (!clean && !flush) return;
        await this._ensureTts();
        if (epoch !== undefined && epoch !== this.turnEpoch) return;
        if (!this.ttsWs || this.ttsWs.readyState !== WebSocket.OPEN) return;
        try {
            if (clean) {
                this.isAISpeaking = true;
                this._noteAgentSpeech(clean);
                this.ttsWs.send(JSON.stringify({ type: 'text', data: { text: clean } }));
            }
            if (flush) this.ttsWs.send(JSON.stringify({ type: 'flush' }));
        } catch (_) { }
    }

    /** Make the agent speak an out-of-band message (e.g. an auto-hangup warning). */
    injectAgentMessage(text) {
        if (!text || !this.active) return;
        // Preempts whatever was queued: invalidate the old epoch before clearing `interrupted`.
        this.turnEpoch++;
        this.ttsCarry = '';
        this.interrupted = false;
        this._sendToTts(text, true);
    }

    // ─── Helpers ─────────────────────────────────────────────

    /**
     * One line per turn: where the time actually went. Sarvam's tuning playbook starts with
     * "instrument first" — without this, every latency change is guesswork.
     */
    _logTurnTimings() {
        const t = this._turn;
        if (!t || t.logged || !t.ttsAt) return;
        t.logged = true;
        const ttft = t.llmAt ? t.llmAt - t.at : 0;
        const ttfa = t.llmAt ? t.ttsAt - t.llmAt : 0;
        console.log(`⏱️ [Sarvam] [${this.callId}] llm_ttft ${ttft}ms | tts_ttfa ${ttfa}ms | turn→audio ${t.ttsAt - t.at}ms`);
    }

    _pushTranscript(role, content) {
        this.transcript.push({ role, content, timestamp: new Date() });
        this._touchActivity();
        if (this.onTranscript) this.onTranscript(role, content);
    }

    _startKeepAlive() {
        this._stopKeepAlive();
        this.keepAliveTimer = setInterval(() => {
            if (this.ttsWs && this.ttsWs.readyState === WebSocket.OPEN) {
                try { this.ttsWs.send(JSON.stringify({ type: 'ping' })); } catch (_) { }
            }
            // The realtime STT socket closes with 1008 on inactivity. Caller audio normally
            // keeps it alive on its own, but a muted or on-hold caller sends nothing.
            if (this.sttFlavor === 'realtime' && this.sttWs && this.sttWs.readyState === WebSocket.OPEN) {
                try { this.sttWs.send(JSON.stringify({ event: 'ping' })); } catch (_) { }
            }
        }, KEEPALIVE_MS);
    }

    _stopKeepAlive() {
        if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }
    }
}

module.exports = { SarvamBridge };
