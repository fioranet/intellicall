const WebSocket = require('ws');
const { buildVoiceSystemPrompt } = require('../../utils/agent-prompt');
const { applyMergeFields } = require('../../utils/merge-fields');
const AppointmentService = require('../appointment-tool-service');

const AGENT_WS_URL = 'wss://agent.deepgram.com/v1/agent/converse';
/** Deepgram-managed LLM — no endpoint/key needed. Managed catalog also includes gpt-4.1-mini etc. */
const MANAGED_THINK_MODEL = 'gpt-4o-mini';
/**
 * Deepgram closes the socket after ~10s without any client message ("We waited too long
 * for a websocket message"), so KeepAlive has to be comfortably under that — caller audio
 * can pause (SIP RTP not flowing yet, silence suppression, Twilio media gaps).
 */
const KEEPALIVE_INTERVAL_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 2;
/** Backstop: hang up even if AgentAudioDone never arrives after end_call. */
const END_CALL_SAFETY_MS = 15000;
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

/**
 * Transport-agnostic bridge to the Deepgram Voice Agent API.
 *
 * One instance per call. The transport adapter (Twilio media stream / SIP RTP) feeds
 * caller audio in via sendAudio() and receives agent audio + control signals through
 * callbacks. STT, LLM orchestration, TTS (ElevenLabs passthrough), endpointing and
 * barge-in detection all run server-side at Deepgram.
 *
 * Callbacks (set before connect()):
 *   onAudio(Buffer)                — mulaw 8k agent audio to play to the caller
 *   onBargeIn()                    — user started speaking; clear any buffered playback
 *   onTranscript(role, content)    — conversation text (role: 'user' | 'assistant')
 *   onError(service, code, message)— surface into CallLog errors
 *   onAgentAudioDone()             — agent finished sending audio for the current turn
 */
class DeepgramAgentBridge {
    constructor({ callId, settings, agent, lead }) {
        this.callId = callId;
        this.settings = settings;
        this.agent = agent;
        this.lead = lead;

        this.ws = null;
        this.active = false;
        this.settingsApplied = false;
        this.closing = false;
        this.reconnectAttempts = 0;
        this.keepAliveTimer = null;
        /** Caller audio received before SettingsApplied is buffered here. */
        this.audioBufferQueue = [];
        /** Accumulated ConversationText, same shape as CallLog.transcript entries. */
        this.transcript = [];

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

        // end_call state — armed when the tool fires, released on AgentAudioDone
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

    // ─── Settings construction ───────────────────────────────

    _greetingText() {
        return applyMergeFields(this.agent?.openingMessage || 'Hello', this.lead, { stripUnmatched: true }) || 'Hello';
    }

    _listenProvider() {
        const lang = this.agent?.language || 'en';
        if (lang === 'en') {
            // Flux is Deepgram's voice-agent STT with model-based end-of-turn detection (English)
            return { type: 'deepgram', model: 'flux-general-en', version: 'v2' };
        }
        return { type: 'deepgram', model: 'nova-3' };
    }

    _speakConfig() {
        const lang = this.agent?.language || 'en';
        const voiceId = this.agent?.voiceId || '21m00Tcm4TlvDq8ikWAM';
        // Per-agent ElevenLabs model override (Voice Quality settings). Deepgram orchestrates
        // the TTS stream itself, so the finer voice_settings only apply on the classic engines;
        // the model is the equivalent control this engine supports.
        const { resolveElevenLabsModel } = require('../../utils/voice-quality');
        const provider = {
            type: 'eleven_labs',
            model_id: resolveElevenLabsModel(this.agent),
        };
        if (lang !== 'en' && lang !== 'multi') {
            provider.language_code = lang.split('-')[0];
        }
        return {
            provider,
            endpoint: {
                url: `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/multi-stream-input`,
                headers: { 'xi-api-key': this.settings.elevenLabsKey },
            },
        };
    }

    /** Enabled transfer destinations, or [] when the transport or the agent has it off. */
    _transferDestinations() {
        if (!this.transferHandler || !this.agent?.humanTransfer?.enabled) return [];
        return (this.agent.humanTransfer.destinations || []).filter(d => d && d.enabled !== false && d.id && d.name);
    }

    _functions() {
        // Client-side functions (no endpoint) — Deepgram sends FunctionCallRequest, we execute
        // and reply with FunctionCallResponse. end_call is available to every agent; the
        // appointment functions only when booking is switched on.
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
                parameters: { type: 'object', properties: {} },
            },
            {
                name: 'list_appointments',
                description: "List the caller's currently scheduled appointments.",
                parameters: { type: 'object', properties: {} },
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

    _buildSettingsMessage({ includeGreeting }) {
        const kbContent = this.kbContent || '';
        const prompt = buildVoiceSystemPrompt({
            agent: this.agent,
            settings: this.settings,
            kbContent,
            commandTags: false, // native function calling — no [[..]] text protocol
            lead: this.lead,
            humanTransfer: !!this.transferHandler,
        });

        const think = {
            provider: { type: 'open_ai', model: MANAGED_THINK_MODEL, temperature: 0.7 },
            prompt,
        };
        const functions = this._functions();
        if (functions) think.functions = functions;

        const msg = {
            type: 'Settings',
            audio: {
                input: { encoding: 'mulaw', sample_rate: 8000 },
                output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' },
            },
            agent: {
                language: this.agent?.language === 'multi' ? 'multi' : (this.agent?.language || 'en'),
                listen: { provider: this._listenProvider() },
                think,
                speak: this._speakConfig(),
            },
        };

        if (includeGreeting) {
            msg.agent.greeting = this._greetingText();
        } else if (this.transcript.length > 0) {
            // Reconnect: replay conversation so the agent keeps its context.
            // Each entry must carry type:'History' with a user/assistant role — anything
            // else makes Deepgram reject the whole Settings message.
            const messages = this.transcript
                .filter(t => (t.role === 'user' || t.role === 'assistant') && t.content)
                .map(t => ({ type: 'History', role: t.role, content: String(t.content) }));
            if (messages.length > 0) msg.agent.context = { messages };
        }
        return msg;
    }

    /**
     * Enable Human Transfer for this call. `fn(destinationId, reason)` resolves the JSON
     * string that goes back to the model as the tool result. Must be called before
     * connect(), since the tool list is built with the initial Settings message.
     */
    setTransferHandler(fn) {
        this.transferHandler = fn;
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
        this._openSocket({ includeGreeting: true });
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
            console.log(`💤 [DG Agent] [${this.callId}] No activity for ${IDLE_TIMEOUT_MS}ms — ending call`);
            this._endCallReason = 'idle timeout';
            this.injectAgentMessage(IDLE_HANGUP_MESSAGE);
            this._armEndCall('idle timeout');
        }, IDLE_CHECK_INTERVAL_MS);
        if (typeof this._idleWatchdog.unref === 'function') this._idleWatchdog.unref();
    }

    _openSocket({ includeGreeting }) {
        this.settingsApplied = false;
        console.log(`🤖 [DG Agent] [${this.callId}] Connecting (greeting=${includeGreeting}, attempt=${this.reconnectAttempts})`);

        this.ws = new WebSocket(AGENT_WS_URL, {
            headers: { Authorization: `Token ${this.settings.deepgramKey}` },
        });

        this.ws.on('open', () => {
            if (!this.active) { try { this.ws.terminate(); } catch (_) { } return; }
            console.log(`🟢 [DG Agent] [${this.callId}] Connected — sending Settings`);
            try {
                this.ws.send(JSON.stringify(this._buildSettingsMessage({ includeGreeting })));
            } catch (e) {
                console.error(`❌ [DG Agent] [${this.callId}] Failed to send Settings:`, e.message);
            }
            this._startKeepAlive();
        });

        this.ws.on('message', (data, isBinary) => {
            if (!this.active) return;
            if (isBinary) {
                if (this.onAudio) this.onAudio(data);
                return;
            }
            this._handleEvent(data);
        });

        this.ws.on('close', (code, reason) => {
            this._stopKeepAlive();
            console.log(`⚪ [DG Agent] [${this.callId}] Socket closed (code=${code}, reason=${reason?.toString() || 'none'})`);
            if (this.active && !this.closing) {
                if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    this.reconnectAttempts++;
                    console.log(`🔄 [DG Agent] [${this.callId}] Reconnecting (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                    setTimeout(() => {
                        if (this.active && !this.closing) this._openSocket({ includeGreeting: false });
                    }, 500);
                } else {
                    const msg = 'Deepgram Voice Agent connection lost and could not be restored.';
                    console.error(`❌ [DG Agent] [${this.callId}] ${msg}`);
                    if (this.onError) this.onError('deepgram', 'agent_disconnected', msg);
                }
            }
        });

        this.ws.on('error', (err) => {
            console.error(`🔴 [DG Agent] [${this.callId}] Socket error:`, err.message);
            if (this.onError && !this.settingsApplied) {
                this.onError('deepgram', 'agent_connect_error', `Voice Agent connection failed: ${err.message}. Verify the Deepgram API key has Voice Agent access.`);
            }
        });
    }

    _handleEvent(data) {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (_) {
            return;
        }

        switch (msg.type) {
            case 'Welcome':
                console.log(`👋 [DG Agent] [${this.callId}] Welcome (request_id=${msg.request_id})`);
                break;

            case 'SettingsApplied':
                this.settingsApplied = true;
                this.reconnectAttempts = 0;
                console.log(`⚙️ [DG Agent] [${this.callId}] SettingsApplied — agent live`);
                if (this.audioBufferQueue.length > 0) {
                    this.audioBufferQueue.forEach(chunk => this._send(chunk));
                    this.audioBufferQueue = [];
                }
                break;

            case 'ConversationText': {
                const role = msg.role === 'assistant' ? 'assistant' : 'user';
                const content = msg.content || '';
                if (content) {
                    console.log(`${role === 'user' ? '👤' : '🤖'} [DG Agent] [${this.callId}] ${role}: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"`);
                    this.transcript.push({ role, content, timestamp: new Date() });
                    this._touchActivity();
                    if (this.onTranscript) this.onTranscript(role, content);
                }
                break;
            }

            case 'UserStartedSpeaking':
                console.log(`🎤 [DG Agent] [${this.callId}] UserStartedSpeaking — barge-in`);
                this._touchActivity();
                // Caller spoke over the goodbye: they are not done after all.
                this._cancelEndCall();
                if (this.onBargeIn) this.onBargeIn();
                break;

            case 'AgentStartedSpeaking': {
                this._touchActivity();
                const total = msg.total_latency != null ? Math.round(msg.total_latency * 1000) : null;
                const tts = msg.tts_latency != null ? Math.round(msg.tts_latency * 1000) : null;
                const ttt = msg.ttt_latency != null ? Math.round(msg.ttt_latency * 1000) : null;
                console.log(`⏱️ [Latency] [${this.callId}] deepgram-agent turn: total=${total ?? 'n/a'}ms think=${ttt ?? 'n/a'}ms tts=${tts ?? 'n/a'}ms`);
                break;
            }

            case 'AgentAudioDone':
                if (this.onAgentAudioDone) this.onAgentAudioDone();
                // Deepgram has finished SENDING the closing line — the transport still has
                // it buffered, so it waits for its own playout before dropping the channel.
                if (this._endCallArmed) this._fireEndCall('agent audio done');
                break;

            case 'FunctionCallRequest':
                this._handleFunctionCallRequest(msg).catch(e =>
                    console.error(`❌ [DG Agent] [${this.callId}] Function call handling failed:`, e.message));
                break;

            case 'Warning':
                console.warn(`⚠️ [DG Agent] [${this.callId}] Warning: ${msg.description || JSON.stringify(msg)}`);
                break;

            case 'Error': {
                const description = msg.description || 'Unknown Voice Agent error';
                const code = msg.code || 'agent_error';
                console.error(`🔴 [DG Agent] [${this.callId}] Error: ${description} (code=${code})`);
                if (this.onError) {
                    const friendly = /auth|forbidden|permission|access/i.test(`${code} ${description}`)
                        ? `Deepgram Voice Agent rejected the request: ${description}. Verify the Deepgram API key has Voice Agent access.`
                        : `Deepgram Voice Agent error: ${description}`;
                    this.onError('deepgram', code, friendly);
                }
                break;
            }

            default:
                // History, ListenUpdated, PromptUpdated, InjectionRefused, etc. — log compactly
                console.log(`📩 [DG Agent] [${this.callId}] ${msg.type}: ${JSON.stringify(msg).substring(0, 200)}`);
        }
    }

    // ─── Function calling ────────────────────────────────────

    async _handleFunctionCallRequest(msg) {
        const calls = Array.isArray(msg.functions) ? msg.functions : [msg];
        for (const call of calls) {
            if (call.client_side === false) continue; // server-side functions are not ours to answer
            const { id, name } = call;
            let args = call.arguments;
            if (typeof args === 'string') {
                try { args = JSON.parse(args); } catch (_) { args = {}; }
            }
            args = args || {};

            console.log(`🛠️ [DG Agent] [${this.callId}] FunctionCallRequest: ${name}(${JSON.stringify(args).substring(0, 120)})`);
            let result;
            try {
                result = await this._executeFunction(name, args);
            } catch (e) {
                console.error(`❌ [DG Agent] [${this.callId}] ${name} failed:`, e.message);
                result = `The ${name} action failed due to a system error. Apologize briefly and offer to try again.`;
            }

            this.transcript.push({ role: 'system', content: `TOOL RESULT (${name}): ${result}`, timestamp: new Date() });
            this._sendJson({ type: 'FunctionCallResponse', id, name, content: String(result) });
            console.log(`🛠️ [DG Agent] [${this.callId}] FunctionCallResponse sent for ${name}`);

            // Arm only after the response is on the wire, so the agent still gets to speak
            // its goodbye — that closing line is the audio we then wait on.
            if (name === 'end_call' && this._endCallRequested) {
                this._endCallRequested = false;
                this._armEndCall(this._endCallReason);
            }
        }
    }

    // ─── Ending the call ─────────────────────────────────────

    /**
     * The agent asked to hang up. It has not spoken its closing line yet, so wait for
     * AgentAudioDone rather than dropping the channel mid-sentence — with a safety timer
     * in case that event never arrives.
     */
    _armEndCall(reason) {
        if (this._endCallArmed || this._endCallFired) return;
        this._endCallArmed = true;
        console.log(`📴 [DG Agent] [${this.callId}] end_call armed (${reason || 'no reason'}) — waiting for AgentAudioDone`);
        this._endCallSafetyTimer = setTimeout(() => this._fireEndCall('safety timeout'), END_CALL_SAFETY_MS);
    }

    _cancelEndCall() {
        if (!this._endCallArmed || this._endCallFired) return;
        this._endCallArmed = false;
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        console.log(`🙅 [DG Agent] [${this.callId}] end_call cancelled — caller spoke again`);
    }

    _fireEndCall(why) {
        if (this._endCallFired || !this._endCallArmed) return;
        this._endCallFired = true;
        this._endCallArmed = false;
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        console.log(`📴 [DG Agent] [${this.callId}] Ending call (${why})`);
        if (this.onEndCall) this.onEndCall(this._endCallReason);
    }

    /**
     * Guard rails shared by every engine: a model that wants to hang up in the opening
     * seconds, or before the caller has said anything, is hallucinating rather than
     * deciding. Refuse and let it keep talking.
     */
    _endCallAllowed() {
        if (this._connectedAt && Date.now() - this._connectedAt < END_CALL_MIN_CALL_MS) {
            console.warn(`⚠️ [DG Agent] [${this.callId}] Ignoring end_call — call is only seconds old`);
            return false;
        }
        if (!this.transcript.some(t => t.role === 'user')) {
            console.warn(`⚠️ [DG Agent] [${this.callId}] Ignoring end_call — caller has not spoken yet`);
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

    // ─── Outbound to Deepgram ────────────────────────────────

    /** Caller audio (raw mulaw 8k Buffer) → Deepgram. Buffered until SettingsApplied. */
    sendAudio(buf) {
        if (!this.active) return;
        if (this.settingsApplied && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._send(buf);
        } else {
            this.audioBufferQueue.push(buf);
            if (this.audioBufferQueue.length > 2000) this.audioBufferQueue.shift(); // ~40s cap
        }
    }

    /** Make the agent speak a message (e.g. auto-hangup warning). */
    injectAgentMessage(text) {
        if (!text) return;
        console.log(`💬 [DG Agent] [${this.callId}] InjectAgentMessage: "${text.substring(0, 60)}"`);
        this._sendJson({ type: 'InjectAgentMessage', message: text });
    }

    _send(buf) {
        try { this.ws.send(buf); } catch (_) { }
    }

    _sendJson(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify(obj)); } catch (_) { }
        }
    }

    _startKeepAlive() {
        this._stopKeepAlive();
        this.keepAliveTimer = setInterval(() => this._sendJson({ type: 'KeepAlive' }), KEEPALIVE_INTERVAL_MS);
    }

    _stopKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }

    close() {
        this.closing = true;
        this.active = false;
        this._stopKeepAlive();
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        if (this._idleWatchdog) { clearInterval(this._idleWatchdog); this._idleWatchdog = null; }
        this.audioBufferQueue = [];
        if (this.ws) {
            try { this.ws.terminate(); } catch (_) { }
            this.ws = null;
        }
    }
}

module.exports = { DeepgramAgentBridge, MANAGED_THINK_MODEL };
