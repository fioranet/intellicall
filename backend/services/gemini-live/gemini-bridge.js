const WebSocket = require('ws');
const { buildVoiceSystemPrompt } = require('../../utils/agent-prompt');
const { applyMergeFields } = require('../../utils/merge-fields');
const { Pcm24kToMulaw8k, Mulaw8kToPcm16k } = require('../../utils/audio-resample');
const { GEMINI_LANGUAGE_NAMES } = require('./gemini-languages');
const AppointmentService = require('../appointment-tool-service');

const LIVE_WS_HOST = 'wss://generativelanguage.googleapis.com';
const LIVE_WS_PATH = '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/**
 * Live API model. 3.1 Flash Live is the low-latency choice — thinking defaults to
 * "minimal" and it is built for audio-to-audio dialogue. Its documented limitation is
 * that function calls are synchronous (the model stays silent until the tool returns),
 * which costs nothing here: every tool below is a local Mongo lookup.
 *
 * Swap to gemini-2.5-flash-native-audio-preview-12-2025 for non-blocking tool calls,
 * affective dialog and proactive audio, at the cost of some latency.
 */
const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

/**
 * Server-side VAD tuning. Defaults aim at the standing requirement: the caller can always
 * interrupt, but noise from the caller's side must not. START_SENSITIVITY_LOW is the
 * noise-resistant setting — the model needs real speech, not a door slam, to take the
 * floor. Overridable so these can be tuned against real calls without a deploy.
 */
const VAD_START_SENSITIVITY = process.env.GEMINI_VAD_START_SENSITIVITY || 'START_SENSITIVITY_LOW';
const VAD_END_SENSITIVITY = process.env.GEMINI_VAD_END_SENSITIVITY || 'END_SENSITIVITY_HIGH';
const VAD_PREFIX_PADDING_MS = parseInt(process.env.GEMINI_VAD_PREFIX_PADDING_MS) || 120;
const VAD_SILENCE_MS = parseInt(process.env.GEMINI_VAD_SILENCE_MS) || 700;

const MAX_RECONNECT_ATTEMPTS = 3;
/** Backstop: hang up even if generationComplete never arrives after end_call. */
const END_CALL_SAFETY_MS = 15000;
/** An agent asking to hang up this early in a call is hallucinating, not deciding. */
const END_CALL_MIN_CALL_MS = 10000;
/**
 * Hang up a connected-but-silent call — caller put the phone down without hanging up,
 * went on hold, walked away. Mirrors the Deepgram engine.
 */
const IDLE_TIMEOUT_MS = parseInt(process.env.CALL_IDLE_TIMEOUT_MS) || 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30000;
const IDLE_HANGUP_MESSAGE = "I haven't heard back from you, so I'll go ahead and end the call now. Goodbye.";

/**
 * Transport-agnostic bridge to the Google Gemini Live API.
 *
 * One instance per call. The transport adapter (SIP RTP today, Twilio later) feeds caller
 * audio in via sendAudio() and receives agent audio + control signals through callbacks.
 * Speech recognition, reasoning, turn-taking, barge-in detection and speech generation all
 * happen inside one model on the far end of a single stateful WebSocket.
 *
 * The one thing this bridge does that the Deepgram one doesn't is resample. Telephony is
 * µ-law 8 kHz; Gemini wants PCM 16 kHz in and returns PCM 24 kHz. See utils/audio-resample.js.
 *
 * Callbacks (set before connect()):
 *   onAudio(Buffer)                — mulaw 8k agent audio to play to the caller
 *   onBargeIn()                    — user started speaking; clear any buffered playback
 *   onTranscript(role, content)    — conversation text (role: 'user' | 'assistant')
 *   onError(service, code, message)— surface into CallLog errors
 *   onAgentAudioDone()             — agent finished generating audio for the current turn
 *   onEndCall(reason)              — agent asked to hang up
 */
class GeminiLiveBridge {
    constructor({ callId, settings, agent, lead }) {
        this.callId = callId;
        this.settings = settings;
        this.agent = agent;
        this.lead = lead;

        this.ws = null;
        this.active = false;
        this.setupComplete = false;
        this.closing = false;
        this.reconnectAttempts = 0;
        /** Caller audio received before setupComplete is buffered here. */
        this.audioBufferQueue = [];
        /** Accumulated conversation, same shape as CallLog.transcript entries. */
        this.transcript = [];

        // Resamplers are stateful and per-call — a fresh one per chunk clicks at the seams.
        this._toTelephony = new Pcm24kToMulaw8k();
        this._toGemini = new Mulaw8kToPcm16k();

        // Transcription arrives as fragments; entries are flushed at turn boundaries.
        this._userText = '';
        this._agentText = '';

        this.onAudio = null;
        this.onBargeIn = null;
        this.onTranscript = null;
        this.onError = null;
        this.onAgentAudioDone = null;
        this.onEndCall = null;
        /**
         * Human Transfer. Set only by the SIP adapter (see setTransferHandler) because
         * only the SIP transport can dial and bridge a second leg — on Twilio and in the
         * browser test this stays null, and the capability is never offered to the model.
         */
        this.transferHandler = null;

        /** Handle from the last sessionResumptionUpdate, used to survive goAway. */
        this._resumptionHandle = null;
        this._goingAway = false;

        // end_call state — armed when the tool fires, released on generationComplete
        this._endCallRequested = false;
        this._endCallArmed = false;
        this._endCallReason = '';
        this._endCallFired = false;
        this._endCallSafetyTimer = null;
        this._connectedAt = 0;

        // Idle (connected-but-silent) detection
        this._lastActivityAt = 0;
        this._idleWatchdog = null;
    }

    // ─── Setup construction ──────────────────────────────────

    _greetingText() {
        return applyMergeFields(this.agent?.openingMessage || 'Hello', this.lead, { stripUnmatched: true }) || 'Hello';
    }

    /**
     * Native-audio models take no language parameter — they detect the caller's language
     * and may switch mid-conversation. The system instruction is the only lever, and the
     * Live API docs endorse it explicitly. 'auto' deliberately adds nothing, so the model
     * keeps its natural multilingual behaviour.
     */
    _languageInstruction() {
        const code = this.agent?.geminiLanguage || 'auto';
        if (!code || code === 'auto') return '';
        if (code === 'pt' || code === 'pt-BR') {
            return `\n\nLANGUAGE: Speak only in natural Brazilian Portuguese (Português do Brasil). Use Brazilian colloquial naturalness, vocabulary and phrasing (e.g. use "você", gerunds like "estou fazendo", and avoid European Portuguese structures like "estou a fazer" or "tu"). Every reply must be strictly in Brazilian Portuguese, regardless of which language the caller uses. Do not switch languages even if asked.`;
        }
        const name = GEMINI_LANGUAGE_NAMES[code] || GEMINI_LANGUAGE_NAMES[code.split('-')[0]];
        if (!name) return '';
        return `\n\nLANGUAGE: Speak only in ${name}. Every reply must be in ${name}, regardless of which language the caller uses. Do not switch languages even if asked.`;
    }

    /**
     * Enable Human Transfer for this call. `fn(destinationId, reason)` resolves the JSON
     * string that goes back to the model as the tool result. Must be called before
     * connect(), since the tool list is sent with the initial setup message.
     */
    setTransferHandler(fn) {
        this.transferHandler = fn;
    }

    /** Enabled transfer destinations, or [] when the transport or the agent has it off. */
    _transferDestinations() {
        if (!this.transferHandler || !this.agent?.humanTransfer?.enabled) return [];
        return (this.agent.humanTransfer.destinations || []).filter(d => d && d.enabled !== false && d.id && d.name);
    }

    _systemInstruction() {
        const prompt = buildVoiceSystemPrompt({
            agent: this.agent,
            settings: this.settings,
            kbContent: this.kbContent || '',
            commandTags: false, // native function calling — no [[..]] text protocol
            lead: this.lead,
            humanTransfer: !!this.transferHandler,
        });
        // Gemini has no greeting setting, so the opening line lives in the instruction and
        // a text nudge after setup triggers the first turn.
        const opening = `\n\nOPENING: Begin the call by saying exactly this, and nothing before it: "${this._greetingText()}"`;
        return prompt + opening + this._languageInstruction();
    }

    _functionDeclarations() {
        // end_call is available to every agent; appointment functions only when booking is
        // switched on. Schemas are shared with the Deepgram engine — only the wire format
        // differs. Functions with no arguments omit `parameters` entirely.
        const fns = [{
            name: 'end_call',
            description: "End the phone call. Use this only when the conversation is genuinely finished — the caller said goodbye, asked to hang up, or confirmed they need nothing else. Say your short closing line in the same turn; the call hangs up once you finish speaking. Never use it to avoid a difficult question.",
            parameters: {
                type: 'object',
                properties: {
                    reason: { type: 'string', description: 'Short reason, e.g. "caller said goodbye"' },
                },
            },
        }];

        const transferDestinations = this._transferDestinations();
        if (transferDestinations.length > 0) {
            fns.push({
                name: 'transfer_call',
                description: `Hand the caller over to a human. Use this when the caller asks to speak to a person, an operator or a named department, or says they do not want to talk to a machine. Briefly tell the caller you are putting them through before calling this. Never invent or say a phone number. Allowed destination IDs — ${transferDestinations.map(d => `${d.id}: ${d.name}`).join(', ')}. Omit destination_id to use the configured default. If the result is BUSY, NO_ANSWER, REJECTED, UNAVAILABLE or FAILED, apologise briefly and carry on helping the caller yourself.`,
                parameters: {
                    type: 'object',
                    properties: {
                        destination_id: { type: 'string', description: 'One of the configured destination IDs. Omit to use the default.' },
                        reason: { type: 'string', description: 'Short reason for the transfer.' },
                    },
                },
            });
        }

        if (!this.agent?.appointmentBookingEnabled) return fns;

        fns.push(
            {
                name: 'get_available_slots',
                description: 'Get available appointment time slots for the next 7 days.',
            },
            {
                name: 'list_appointments',
                description: "List the caller's currently scheduled appointments.",
            },
            {
                name: 'book_appointment',
                description: "Book an appointment at a specific date and time. Ask for the caller's name before booking if you don't have it.",
                parameters: {
                    type: 'object',
                    properties: {
                        date: { type: 'string', description: 'Appointment date as YYYY-MM-DD' },
                        time: { type: 'string', description: 'Appointment time as HH:mm (24-hour)' },
                        client_name: { type: 'string', description: "Caller's full name (optional)" },
                    },
                    required: ['date', 'time'],
                },
            },
            {
                name: 'cancel_appointment',
                description: 'Cancel an existing appointment at a specific date and time.',
                parameters: {
                    type: 'object',
                    properties: {
                        date: { type: 'string', description: 'Appointment date as YYYY-MM-DD' },
                        time: { type: 'string', description: 'Appointment time as HH:mm (24-hour)' },
                    },
                    required: ['date', 'time'],
                },
            },
        );
        return fns;
    }

    _buildSetupMessage() {
        const generationConfig = {
            responseModalities: ['AUDIO'],
            temperature: 0.7,
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: this.agent?.geminiVoice || 'Charon' },
                },
            },
        };
        // 3.x uses thinkingLevel; 2.5 uses thinkingBudget. Only set what the model understands.
        if (MODEL.startsWith('gemini-3')) {
            generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
        }

        const setup = {
            model: `models/${MODEL}`,
            generationConfig,
            systemInstruction: { parts: [{ text: this._systemInstruction() }] },
            tools: [{ functionDeclarations: this._functionDeclarations() }],
            realtimeInputConfig: {
                automaticActivityDetection: {
                    startOfSpeechSensitivity: VAD_START_SENSITIVITY,
                    endOfSpeechSensitivity: VAD_END_SENSITIVITY,
                    prefixPaddingMs: VAD_PREFIX_PADDING_MS,
                    silenceDurationMs: VAD_SILENCE_MS,
                },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            // Ask for resumption handles so a goAway (~10 min connection lifetime) can be
            // ridden out without the caller hearing a seam.
            sessionResumption: this._resumptionHandle ? { handle: this._resumptionHandle } : {},
            // Audio-only sessions otherwise stop at 15 minutes.
            contextWindowCompression: { slidingWindow: {} },
        };
        return { setup };
    }

    /** kbContent is preloaded by the adapter (one Mongo fetch per call) and passed here. */
    setKbContent(kbContent) {
        this.kbContent = kbContent || '';
    }

    // ─── Connection lifecycle ────────────────────────────────

    connect() {
        this.active = true;
        this._connectedAt = Date.now();
        this._lastActivityAt = Date.now();
        this._openSocket();
        this._startIdleWatchdog();
    }

    _touchActivity() {
        this._lastActivityAt = Date.now();
    }

    _startIdleWatchdog() {
        if (this._idleWatchdog) return;
        this._idleWatchdog = setInterval(() => {
            if (!this.active || this._endCallArmed || this._endCallFired) return;
            if (Date.now() - this._lastActivityAt < IDLE_TIMEOUT_MS) return;
            console.log(`💤 [Gemini] [${this.callId}] No activity for ${IDLE_TIMEOUT_MS}ms — ending call`);
            this._endCallReason = 'idle timeout';
            this.injectAgentMessage(IDLE_HANGUP_MESSAGE);
            this._armEndCall('idle timeout');
        }, IDLE_CHECK_INTERVAL_MS);
        if (typeof this._idleWatchdog.unref === 'function') this._idleWatchdog.unref();
    }

    _openSocket() {
        this.setupComplete = false;
        this._goingAway = false;
        const resuming = !!this._resumptionHandle;
        console.log(`🤖 [Gemini] [${this.callId}] Connecting (model=${MODEL}, resume=${resuming}, attempt=${this.reconnectAttempts})`);

        const url = `${LIVE_WS_HOST}${LIVE_WS_PATH}?key=${encodeURIComponent(this.settings.geminiKey)}`;
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            if (!this.active) { try { this.ws.terminate(); } catch (_) { } return; }
            console.log(`🟢 [Gemini] [${this.callId}] Connected — sending setup`);
            this._sendJson(this._buildSetupMessage());
        });

        this.ws.on('message', (data) => {
            if (!this.active) return;
            this._handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
            const why = reason?.toString() || 'none';
            console.log(`⚪ [Gemini] [${this.callId}] Socket closed (code=${code}, reason=${why})`);
            if (!this.active || this.closing) return;

            // A goAway close is expected — the far end recycles connections roughly every
            // 10 minutes. Reconnecting with the resumption handle is not a failure path.
            if (this._goingAway || this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                if (!this._goingAway) this.reconnectAttempts++;
                const delay = this._goingAway ? 0 : 500;
                console.log(`🔄 [Gemini] [${this.callId}] Reconnecting${this._goingAway ? ' (session resumption)' : ` (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`}...`);
                setTimeout(() => { if (this.active && !this.closing) this._openSocket(); }, delay);
            } else {
                const msg = 'Gemini Live connection lost and could not be restored.';
                console.error(`❌ [Gemini] [${this.callId}] ${msg}`);
                if (this.onError) this.onError('gemini', 'live_disconnected', msg);
            }
        });

        this.ws.on('error', (err) => {
            console.error(`🔴 [Gemini] [${this.callId}] Socket error:`, err.message);
            if (this.onError && !this.setupComplete) {
                this.onError('gemini', 'live_connect_error', `Gemini Live connection failed: ${err.message}. Verify the Gemini API key has Live API access.`);
            }
        });
    }

    _handleMessage(data) {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (_) {
            return;
        }

        if (msg.setupComplete) {
            this.setupComplete = true;
            // A resumption handle only exists once a session has been live, which means the
            // greeting already happened. Anything else — including a retry after a failed
            // first connect — is a conversation that has not started yet.
            const resumed = !!this._resumptionHandle;
            this.reconnectAttempts = 0;
            console.log(`⚙️ [Gemini] [${this.callId}] setupComplete — agent live`);
            if (this.audioBufferQueue.length > 0) {
                this.audioBufferQueue.forEach(chunk => this._sendAudioChunk(chunk));
                this.audioBufferQueue = [];
            }
            // Gemini has no greeting setting: nudge it to take the first turn. On a resumed
            // session the conversation is already underway, so stay quiet.
            if (!resumed) {
                this._sendJson({ realtimeInput: { text: '[SYSTEM] The call has connected. Greet the caller now.' } });
            }
            return;
        }

        if (msg.serverContent) this._handleServerContent(msg.serverContent);
        if (msg.toolCall) {
            this._handleToolCall(msg.toolCall).catch(e =>
                console.error(`❌ [Gemini] [${this.callId}] Tool call handling failed:`, e.message));
        }
        if (msg.toolCallCancellation) {
            console.log(`🚫 [Gemini] [${this.callId}] toolCallCancellation: ${JSON.stringify(msg.toolCallCancellation.ids || [])}`);
        }
        if (msg.sessionResumptionUpdate) {
            const update = msg.sessionResumptionUpdate;
            if (update.resumable && update.newHandle) this._resumptionHandle = update.newHandle;
        }
        if (msg.goAway) {
            // Reconnect now rather than waiting for the close, so the gap lands between
            // turns instead of mid-sentence.
            console.log(`👋 [Gemini] [${this.callId}] goAway (timeLeft=${msg.goAway.timeLeft || 'unknown'}) — rotating connection`);
            this._goingAway = true;
        }
        if (msg.usageMetadata?.totalTokenCount) {
            this._lastUsage = msg.usageMetadata.totalTokenCount;
        }
        if (msg.error) {
            const description = msg.error.message || 'Unknown Live API error';
            const code = msg.error.code || 'live_error';
            console.error(`🔴 [Gemini] [${this.callId}] Error: ${description} (code=${code})`);
            if (this.onError) {
                const friendly = /auth|permission|api key|forbidden/i.test(description)
                    ? `Gemini rejected the request: ${description}. Verify the Gemini API key has Live API access.`
                    : `Gemini Live error: ${description}`;
                this.onError('gemini', code, friendly);
            }
        }
    }

    _handleServerContent(sc) {
        // Barge-in. The model has already stopped generating; the transport must drop
        // whatever it still has queued or the caller hears the agent talk over them.
        if (sc.interrupted) {
            console.log(`🎤 [Gemini] [${this.callId}] interrupted — barge-in`);
            this._touchActivity();
            this._flushAgentText();
            this._cancelEndCall();      // caller spoke over the goodbye: they are not done
            if (this.onBargeIn) this.onBargeIn();
        }

        if (sc.inputTranscription?.text) {
            this._userText += sc.inputTranscription.text;
            this._touchActivity();
        }
        if (sc.outputTranscription?.text) {
            // The caller's turn is over the moment the model starts answering.
            this._flushUserText();
            this._agentText += sc.outputTranscription.text;
        }

        // 3.1 can pack several parts into one event — audio and transcript together — so
        // every part has to be walked, not just the first.
        const parts = sc.modelTurn?.parts || [];
        for (const part of parts) {
            const inline = part.inlineData;
            if (!inline?.data) continue;
            if (inline.mimeType && !/^audio\/pcm/i.test(inline.mimeType)) continue;
            const pcm24 = Buffer.from(inline.data, 'base64');
            const mulaw8 = this._toTelephony.process(pcm24);
            if (mulaw8.length && this.onAudio) this.onAudio(mulaw8);
        }

        if (sc.generationComplete) {
            this._flushAgentText();
            if (this.onAgentAudioDone) this.onAgentAudioDone();
            // The closing line has been generated — the transport still has it queued, so
            // it waits for its own playout before dropping the channel.
            if (this._endCallArmed) this._fireEndCall('generation complete');
        }

        if (sc.turnComplete) {
            this._flushUserText();
            this._flushAgentText();
        }
    }

    _flushUserText() {
        const text = this._userText.trim();
        this._userText = '';
        if (!text) return;
        console.log(`👤 [Gemini] [${this.callId}] user: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
        this.transcript.push({ role: 'user', content: text, timestamp: new Date() });
        if (this.onTranscript) this.onTranscript('user', text);
    }

    _flushAgentText() {
        const text = this._agentText.trim();
        this._agentText = '';
        if (!text) return;
        console.log(`🤖 [Gemini] [${this.callId}] assistant: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
        this.transcript.push({ role: 'assistant', content: text, timestamp: new Date() });
        if (this.onTranscript) this.onTranscript('assistant', text);
    }

    // ─── Function calling ────────────────────────────────────

    async _handleToolCall(toolCall) {
        const calls = Array.isArray(toolCall.functionCalls) ? toolCall.functionCalls : [];
        const responses = [];

        for (const call of calls) {
            const { id, name } = call;
            const args = call.args || {};
            console.log(`🛠️ [Gemini] [${this.callId}] toolCall: ${name}(${JSON.stringify(args).substring(0, 120)})`);

            let result;
            try {
                result = await this._executeFunction(name, args);
            } catch (e) {
                console.error(`❌ [Gemini] [${this.callId}] ${name} failed:`, e.message);
                result = `The ${name} action failed due to a system error. Apologize briefly and offer to try again.`;
            }

            this.transcript.push({ role: 'system', content: `TOOL RESULT (${name}): ${result}`, timestamp: new Date() });
            responses.push({ id, name, response: { output: String(result) } });
        }

        if (responses.length === 0) return;
        this._sendJson({ toolResponse: { functionResponses: responses } });
        console.log(`🛠️ [Gemini] [${this.callId}] toolResponse sent (${responses.map(r => r.name).join(', ')})`);

        // Arm only after the response is on the wire, so the agent still gets to speak its
        // goodbye — that closing line is the audio we then wait on.
        if (this._endCallRequested) {
            this._endCallRequested = false;
            this._armEndCall(this._endCallReason);
        }
    }

    /**
     * Guard rails shared by every engine: a model that wants to hang up in the opening
     * seconds, or before the caller has said anything, is hallucinating rather than
     * deciding. Refuse and let it keep talking.
     */
    _endCallAllowed() {
        if (this._connectedAt && Date.now() - this._connectedAt < END_CALL_MIN_CALL_MS) {
            console.warn(`⚠️ [Gemini] [${this.callId}] Ignoring end_call — call is only seconds old`);
            return false;
        }
        if (!this.transcript.some(t => t.role === 'user')) {
            console.warn(`⚠️ [Gemini] [${this.callId}] Ignoring end_call — caller has not spoken yet`);
            return false;
        }
        return true;
    }

    async _executeFunction(name, args) {
        const userId = this.settings.userId;
        const clientPhone = this.lead?.phone || '';
        switch (name) {
            case 'end_call':
                if (!this._endCallAllowed()) {
                    return 'The call cannot be ended yet. Continue the conversation normally.';
                }
                // Flagged rather than hung up here: returning content is what makes the
                // agent speak its goodbye, and that audio is what we wait on.
                this._endCallRequested = true;
                this._endCallReason = args.reason || '';
                return 'Call is ending. Say a brief goodbye now and stop.';
            case 'transfer_call': {
                if (!this.transferHandler) {
                    return 'Transferring is not available on this call. Continue helping the caller yourself.';
                }
                return this.transferHandler(args.destination_id || '', args.reason || '');
            }
            case 'get_available_slots':
                return AppointmentService.getAvailableSlots(userId);
            case 'list_appointments':
                return AppointmentService.listAppointments(userId, clientPhone);
            case 'book_appointment':
                return AppointmentService.bookAppointment(
                    userId, this.agent._id, this.lead?._id, clientPhone,
                    args.date, args.time, args.client_name || ''
                );
            case 'cancel_appointment':
                return AppointmentService.cancelAppointment(userId, clientPhone, args.date, args.time);
            default:
                return `Unknown function: ${name}`;
        }
    }

    // ─── Ending the call ─────────────────────────────────────

    _armEndCall(reason) {
        if (this._endCallArmed || this._endCallFired) return;
        this._endCallArmed = true;
        console.log(`📴 [Gemini] [${this.callId}] end_call armed (${reason || 'no reason'}) — waiting for generationComplete`);
        this._endCallSafetyTimer = setTimeout(() => this._fireEndCall('safety timeout'), END_CALL_SAFETY_MS);
    }

    _cancelEndCall() {
        if (!this._endCallArmed || this._endCallFired) return;
        this._endCallArmed = false;
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        console.log(`🙅 [Gemini] [${this.callId}] end_call cancelled — caller spoke again`);
    }

    _fireEndCall(why) {
        if (this._endCallFired || !this._endCallArmed) return;
        this._endCallFired = true;
        this._endCallArmed = false;
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        console.log(`📴 [Gemini] [${this.callId}] Ending call (${why})`);
        if (this.onEndCall) this.onEndCall(this._endCallReason);
    }

    // ─── Outbound to Gemini ──────────────────────────────────

    /** Caller audio (raw mulaw 8k Buffer) → Gemini. Buffered until setupComplete. */
    sendAudio(mulawBuf) {
        if (!this.active || !mulawBuf?.length) return;
        if (this.setupComplete && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._sendAudioChunk(mulawBuf);
        } else {
            this.audioBufferQueue.push(mulawBuf);
            if (this.audioBufferQueue.length > 2000) this.audioBufferQueue.shift(); // ~40s cap
        }
    }

    _sendAudioChunk(mulawBuf) {
        const pcm16k = this._toGemini.process(mulawBuf);
        if (!pcm16k.length) return;
        this._sendJson({
            realtimeInput: {
                audio: { mimeType: 'audio/pcm;rate=16000', data: pcm16k.toString('base64') },
            },
        });
    }

    /**
     * Make the agent speak a message (e.g. the auto-hangup warning). The Live API has no
     * verbatim-injection message, so this arrives as a directive on the text channel.
     */
    injectAgentMessage(text) {
        if (!text) return;
        console.log(`💬 [Gemini] [${this.callId}] Injecting: "${text.substring(0, 60)}"`);
        this._sendJson({
            realtimeInput: { text: `[SYSTEM] Say exactly this to the caller now, then continue: "${text}"` },
        });
    }

    _sendJson(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify(obj)); } catch (_) { }
        }
    }

    close() {
        this.closing = true;
        this.active = false;
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        if (this._idleWatchdog) { clearInterval(this._idleWatchdog); this._idleWatchdog = null; }
        this.audioBufferQueue = [];
        // Anything still buffered is real conversation — keep it for the CallLog.
        this._flushUserText();
        this._flushAgentText();
        if (this.ws) {
            try { this.ws.terminate(); } catch (_) { }
            this.ws = null;
        }
    }
}

module.exports = { GeminiLiveBridge, GEMINI_LIVE_MODEL: MODEL };
