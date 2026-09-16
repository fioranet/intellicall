const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const axios = require('axios');
const Settings = require('../models/Settings');
const Agent = require('../models/Agent');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const { deepgramModel, openRouterModel } = require('../utils/models');
const { buildVoiceSystemPrompt } = require('../utils/agent-prompt');
const { applyMergeFields } = require('../utils/merge-fields');
const { analyzeCallLog } = require('../utils/analyzer');
const { computeDuration, persistDurationIfUnset } = require('../utils/call-duration');
const { missingEngineKeys } = require('../utils/engine-keys');
const { shouldInterrupt } = require('../utils/turn-taking');
const { resolveVoiceQuality, buildElevenLabsStreamUrl, buildElevenLabsBOS } = require('../utils/voice-quality');
const { TtsChunkBuffer } = require('../utils/tts-chunker');
const WebhookService = require('./webhook-service');
const EmailService = require('./email-service');
const AppointmentService = require('./appointment-tool-service');
const { narrateAppointmentResult } = require('./appointment-result-narration');
const { parse: parseDate, format: formatDate, isValid } = require('date-fns');
const { formatInTimeZone } = require('date-fns-tz');

/** Parse [[BOOK:...]] content to { date: 'YYYY-MM-DD', time: 'HH:mm', clientName: string } or null */
function parseBookDateTime(content) {
    if (!content || typeof content !== 'string') return null;
    const trimmed = content.trim();
    const pipeIdx = trimmed.indexOf('|');
    const dateTimePart = pipeIdx >= 0 ? trimmed.slice(0, pipeIdx).trim() : trimmed;
    const clientName = pipeIdx >= 0 ? trimmed.slice(pipeIdx + 1).trim() : '';
    const year = new Date().getFullYear();
    // Already YYYY-MM-DD and HH:mm (or HH:mm with optional :ss)
    const isoMatch = dateTimePart.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (isoMatch) {
        const [, date, h, m] = isoMatch;
        return { date, time: `${h.padStart(2, '0')}:${m.padStart(2, '0')}`, clientName };
    }
    // Normalize "12th" -> "12", then try natural language with current year
    const normalized = dateTimePart.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
    const withYear = normalized.includes(String(year)) ? normalized : `${normalized} ${year}`;
    const formats = [
        'EEEE, MMM d, HH:mm yyyy', 'MMMM d yyyy HH:mm', 'MMM d yyyy HH:mm', 'MMMM d, yyyy HH:mm', 'MMM d, yyyy HH:mm',
        'EEEE, MMM d, HH:mm', 'EEEE, MMM d yyyy HH:mm', 'd MMM yyyy HH:mm', 'd MMM HH:mm',
        'MMM d HH:mm', 'MMMM d HH:mm'
    ];
    for (const fmt of formats) {
        try {
            const dt = parseDate(withYear, fmt, new Date());
            if (isValid(dt)) return { date: formatDate(dt, 'yyyy-MM-dd'), time: formatDate(dt, 'HH:mm'), clientName };
        } catch (_) { /* try next */ }
    }
    return null;
}

/** Convert time strings to spoken words. timeFormat: '12' (morning/afternoon/evening/night) or '24' (e.g. 17 hundred). */
function timesToSpokenWords(text, timeFormat = '12') {
    if (!text || typeof text !== 'string') return text;
    const use24 = String(timeFormat) === '24';
    const period = (hour24) => {
        if (hour24 === 0) return 'in the morning';
        if (hour24 === 12) return 'noon';
        if (hour24 >= 1 && hour24 <= 11) return 'in the morning';
        if (hour24 >= 13 && hour24 <= 16) return 'in the afternoon';
        if (hour24 >= 17 && hour24 <= 19) return 'in the evening';
        return 'at night';
    };
    const to12 = (hour24) => {
        if (hour24 === 0 || hour24 === 12) return 12;
        if (hour24 <= 12) return hour24;
        return hour24 - 12;
    };
    const speak12 = (hour24, mins) => {
        const h12 = to12(hour24);
        const p = period(hour24);
        if (hour24 === 12 && mins === 0) return 'noon';
        if (hour24 === 0 && mins === 0) return 'midnight';
        if (mins === 0) return `${h12} ${p}`;
        if (mins < 10) return `${h12} oh ${mins} ${p}`;
        return `${h12} ${mins} ${p}`;
    };
    const speak24 = (hour24, mins) => {
        if (hour24 === 0 && mins === 0) return 'midnight';
        if (hour24 === 12 && mins === 0) return 'noon';
        if (mins === 0) return `${hour24} hundred`;
        return `${hour24} ${mins}`;
    };
    const speak = use24 ? speak24 : speak12;
    return text.replace(/\b(\d{1,2}):(\d{2})\s*([AP]M)?/gi, (_, h, m, ampm) => {
        let hour24 = parseInt(h, 10);
        const mins = parseInt(m, 10);
        if (ampm) {
            if (/PM/i.test(ampm) && hour24 < 12) hour24 += 12;
            if (/AM/i.test(ampm) && hour24 === 12) hour24 = 0;
        }
        if (hour24 > 23) hour24 = 23;
        return speak(hour24, mins);
    });
}

/** Strip appointment command placeholders so they are never sent to TTS (including partial chunks) */
function stripAppointmentCommands(text) {
    if (!text || typeof text !== 'string') return text;
    let s = text
        .replace(/\[\[LIST\]\]/g, '')
        .replace(/\[\[SLOTS\]\]/g, '')
        .replace(/\[\[BOOK:[^\]]*\]\]/g, '')
        .replace(/\[\[CANCEL:[^\]]*\]\]/g, '')
        .replace(/\[\[END_CALL\]\]/g, '')
        // Human Transfer is SIP-only, so this tag can never do anything here — but a model
        // that emits it anyway must not have it read out to the caller.
        .replace(/\[\[TRANSFER:[^\]]*\]\]/g, '')
        // Trailing incomplete e.g. " [[BOOK:Thursday," (no closing ]])
        .replace(/\s*\[\[(?:LIST|SLOTS|BOOK:|CANCEL:|END_CALL|TRANSFER:).*$/g, '')
        // Trailing incomplete cut mid-keyword e.g. " [[END_C" — the tag is emitted at the
        // very end of a reply, which is exactly where a stream chunk tends to split.
        .replace(/\s*\[\[[^\]]*$/g, '')
        // Leading incomplete e.g. "10:00]] " from previous chunk
        .replace(/^[^\[\]]*\]\]\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return s;
}

/** Convert ElevenLabs error codes to user-friendly messages */
function humanizeElevenLabsError(code, rawMessage) {
    const map = {
        'quota_exceeded': 'ElevenLabs character quota exceeded. Please upgrade your plan or wait for quota reset.',
        'invalid_api_key': 'ElevenLabs API key is invalid. Please check your key in Settings.',
        'voice_not_found': 'The selected ElevenLabs voice was not found. Please choose a different voice.',
        'model_not_found': 'The selected ElevenLabs model is unavailable. Please try a different voice model.',
        'rate_limit_exceeded': 'ElevenLabs rate limit exceeded. Too many concurrent requests.',
        'invalid_text': 'ElevenLabs rejected the text input.',
        'unauthorized': 'ElevenLabs API key is unauthorized. Please verify your key in Settings.',
    };
    return map[code] || rawMessage || `ElevenLabs error: ${code}`;
}

/**
 * Turn-taking timing (ms). Deepgram endpointing detects end-of-speech silence; the waits
 * below are our own dispatch debounce on top of it. Every Final goes through this window,
 * and the window is EXTENDED whenever new speech (interim/final) arrives — so a lower
 * endpointing never causes the AI to answer while the user is still talking.
 * Effective silence before dispatch: complete-sounding ≈ 300+200=500ms, unfinished ≈ 300+500=800ms.
 */
const DG_ENDPOINTING_MS = 300;
const FINAL_COMPLETE_WAIT_MS = 200;   // final ends with .?! — short guard so a follow-up final can still merge
const FINAL_INCOMPLETE_WAIT_MS = 500; // final sounds unfinished — wait longer for the user to continue

/** Extra silence after the agent's closing line before the leg is dropped. */
const END_CALL_DRAIN_GRACE_MS = 600;
/** Backstop: hang up even if the playout estimate never resolves. */
const END_CALL_SAFETY_MS = 15000;
/** An agent asking to hang up this early in a call is hallucinating, not deciding. */
const END_CALL_MIN_CALL_MS = 10000;

/**
 * Hang up a connected-but-silent call — caller put the phone down without hanging up,
 * went on hold, walked away. Independent of the media watchdog, which only detects the
 * stream stopping entirely; Twilio keeps sending audio (silence) for as long as the call
 * is up, so this is the only thing that notices nobody is actually talking.
 */
const IDLE_TIMEOUT_MS = parseInt(process.env.CALL_IDLE_TIMEOUT_MS) || 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30000;
const IDLE_HANGUP_MESSAGE = "I haven't heard back from you, so I'll go ahead and end the call now. Goodbye.";

/**
 * callSids with a live Twilio media stream. Populated on 'start', cleared in cleanup(),
 * and read by the stale-call reconcile sweep so it never closes a call that is still up.
 */
const activeTwilioCallSids = new Set();

/**
 * Handle a Media Streams connection to the AI bridge.
 *
 * Two kinds of client speak this same frame protocol:
 *   - Twilio Media Streams (the default, unchanged)
 *   - the in-browser agent test, which sends the same start/media/stop frames
 *     over an authenticated socket. `opts.transport === 'browser'` marks it.
 *
 * A browser session differs only in that it has no phone leg: identity comes from
 * a verified ticket rather than the client's own start frame, hangups close the
 * socket instead of calling the Twilio REST API, and nothing is logged or billed.
 *
 * @param {object} [opts]
 * @param {'twilio'|'browser'} [opts.transport='twilio']
 * @param {string} [opts.userId]  browser only — authoritative, from the ticket
 * @param {string} [opts.agentId] browser only — authoritative, from the ticket
 */
const handleVoiceStream = async (ws, req, opts = {}) => {
    const isBrowserTest = opts.transport === 'browser';
    let browserCapTimer = null;

    /**
     * Control frames for the in-browser test UI. A phone call has no use for these
     * (Twilio would ignore an unknown event), so they are only sent to a browser.
     * The `ic.` prefix keeps them clear of Twilio's own event vocabulary.
     */
    const ctl = (type, data = {}) => {
        if (!isBrowserTest || ws.readyState !== WebSocket.OPEN) return;
        try { ws.send(JSON.stringify({ event: `ic.${type}`, ...data })); } catch (_) { }
    };
    let streamSid = null;
    let callSid = null;
    let dgConnection = null;
    let elConnection = null;
    let settings = null;
    let agent = null;
    let lead = null;

    let transcript = [];
    let isProcessing = false;
    let dgReady = false;
    let elReady = false;
    let greetingSent = false;
    let isAISpeaking = false;
    let interrupted = false;
    let abortController = null;
    let isInitializingDg = false;
    let isInitializingEl = false;
    let processingStartedAt = 0;
    let audioBufferQueue = [];
    let transcriptQueue = [];
    let callErrors = [];
    let lastProcessedTranscript = "";
    let lastProcessedAt = 0;
    let lastSameTurnLogAt = 0;
    let lastSameTurnText = '';
    let audioEndTime = 0;
    let speakingTimer = null;
    let lastInterimTranscript = '';
    let lastInterimAt = 0;
    let pendingPostInterruptUtterance = false;
    /** Debounce: wait for Final or longer interim before committing post-interrupt utterance (avoids "What kind of" → "It seems your message got cut off" then "What kind of tasks?"). */
    let pendingPostInterruptTranscript = '';
    let pendingPostInterruptTimer = null;
    /** When we sent the first TTS chunk for the current response; used to avoid aborting on brief sounds ("Yes", "Yeah") right after the bot starts speaking. */
    let firstChunkSentAt = 0;
    let lastVadAt = 0;
    /** VAD fired but no transcript yet: wait for transcript before stopping (avoids false VAD cutting off the bot). */
    let pendingVadInterrupt = false;
    let pendingVadInterruptTimer = null;
    /** Pending Final held in a short window before dispatch (see FINAL_*_WAIT_MS); new speech extends or merges into it. */
    let pendingIncompleteFinal = '';
    let pendingIncompleteTimer = null;
    /** Debounce: wait after last queued transcript before sending to LLM (reduces aborts when user keeps speaking). */
    let processDebounceTimer = null;
    /** Knowledge base content cached once at call start (avoids a Mongo roundtrip per turn). */
    let kbSystemContent = '';
    /** Per-turn latency markers, logged when the first TTS audio chunk goes out. */
    let turnTimings = null;
    let lastQueuedAt = 0;
    /** Per-agent Voice Quality & Conversation config (resolved once the agent is loaded). */
    let voiceQuality = null;
    /** Voice Quality diagnostics — accumulated per call, written to CallLog at cleanup. */
    const vqMetrics = {
        turns: 0, interruptions: 0, falseVadEvents: 0, rtpQueueDrops: 0, ttsChunksSent: 0,
        llmFirstTokenSum: 0, ttsFirstTextSum: 0, firstAudioSum: 0, latencyCount: 0, maxFirstAudioMs: 0
    };
    /** Per-agent turn-taking config, with the hardcoded legacy values as the safety net. */
    const tt = () => voiceQuality?.turnTaking || {
        endpointingMs: DG_ENDPOINTING_MS,
        finalCompleteWaitMs: FINAL_COMPLETE_WAIT_MS,
        finalIncompleteWaitMs: FINAL_INCOMPLETE_WAIT_MS,
        minInterruptWords: 3, stabilizationMs: 2500, vadConfirmMs: 1200
    };
    /** shouldInterrupt with this agent's sensitivity applied. */
    const agentShouldInterrupt = (text) => shouldInterrupt(text, { minWords: tt().minInterruptWords });
    /** Set when agent.voiceEngine === 'deepgram_agent' — all media/cleanup routes there instead. */
    let dgAgentSession = null;
    /** Guards cleanup(): Twilio fires both 'stop' and ws 'close' for the same call. */
    let cleanedUp = false;
    /** Twilio opens the media stream only after the callee answers — so this is answered time. */
    let streamStartedAt = 0;
    /** Agent asked to hang up ([[END_CALL]]); fires once its closing line has played out. */
    let endCallPending = false;
    let endCallTimer = null;
    let endCallSafetyTimer = null;
    /** Idle (connected-but-silent) detection. */
    let lastActivityAt = 0;
    let idleHangupTriggered = false;
    let idleWatchdog = null;

    // Metadata
    let userId, agentId, leadId, campaignId, direction;

    /** Push a structured error for surfacing in frontend */
    function pushError(service, code, message) {
        callErrors.push({ service, code: String(code || ''), message, timestamp: new Date() });
        if (isBrowserTest) {
            // No CallLog to annotate — surface it in the test UI instead.
            ctl('error', { service, message });
            return;
        }
        // Persist immediately if callSid is available
        if (callSid) {
            CallLog.findOneAndUpdate({ callSid }, { $push: { errors: { service, code: String(code || ''), message } } }).catch(() => { });
        }
    }

    ws.on('message', async (message) => {
        try {
            const msg = JSON.parse(message);

            switch (msg.event) {
                case 'start':
                    const params = (msg.start && msg.start.customParameters) || {};
                    if (isBrowserTest) {
                        // The client is the user's own browser, so nothing it sends about
                        // WHO it is may be trusted — those values come from the verified
                        // ticket. The ids below are synthetic: there is no phone call.
                        userId = opts.userId;
                        agentId = opts.agentId;
                        leadId = opts.leadId;
                        campaignId = null;
                        direction = 'outbound';
                        streamSid = `web-${uuidv4()}`;
                        callSid = streamSid;
                    } else {
                        userId = params.userId;
                        agentId = params.agentId;
                        leadId = params.leadId;
                        campaignId = params.campaignId === "" ? null : params.campaignId;
                        direction = params.direction || 'outbound';
                        streamSid = msg.start.streamSid;
                        callSid = msg.start.callSid;
                    }

                    console.log(`🎙️ [VoiceStream] Start Event - Agent: ${agentId}, Lead: ${leadId}`);

                    streamStartedAt = Date.now();
                    // Only real Twilio calls belong in the reconcile sweeper's active set;
                    // a browser test writes no CallLog for it to reconcile against.
                    if (callSid && !isBrowserTest) activeTwilioCallSids.add(callSid);

                    try {
                        settings = await Settings.findOne({ userId });
                        agent = await Agent.findOne({ _id: agentId, createdBy: userId });
                        // Browser tests reuse a single per-user test lead minted by the
                        // session route, so merge fields and appointment booking behave
                        // exactly as they do on a real call.
                        lead = await Lead.findOne({ _id: leadId, createdBy: userId });
                        if (agent) voiceQuality = resolveVoiceQuality(agent);

                        // Per-engine key requirements (deepgram_agent skips OpenRouter; sarvam
                        // is self-contained and needs only a Sarvam key).
                        const engineProvider = isBrowserTest
                            ? 'browser'
                            : (callSid?.startsWith('CA') ? 'twilio' : 'sip');
                        // A browser test always runs the streaming engine — there is no
                        // TwiML gather loop to fall back to — so the engine applies even
                        // when the agent is not flagged for custom voice.
                        const engineApplies = isBrowserTest || agent?.useCustomVoice;
                        const isDgAgentEngine = engineApplies && agent?.voiceEngine === 'deepgram_agent';
                        const isSarvamEngine = engineApplies && agent?.voiceEngine === 'sarvam';
                        const isGeminiEngine = engineApplies && agent?.voiceEngine === 'gemini_live';

                        // Gemini Live speaks 16k/24k PCM, and only the SIP and browser
                        // transports resample for it — the Twilio media path has no Gemini
                        // branch below. Fail loudly rather than falling through to the
                        // classic path and reporting missing Deepgram keys.
                        if (agent?.voiceEngine === 'gemini_live' && !isBrowserTest) {
                            const msg = 'The Gemini Live engine is only available on SIP numbers. Switch this agent to another voice engine to call over Twilio.';
                            console.error(`❌ [VoiceStream] ${msg}`);
                            pushError('system', 'engine_unsupported_transport', msg);
                            ws.close();
                            return;
                        }

                        const missing = missingEngineKeys(settings, agent, engineProvider);
                        if (missing.length > 0) {
                            const msg = `Missing API keys: ${missing.join(', ')}. Please configure them in Settings.`;
                            console.error(`❌ [VoiceStream] ${msg}`);
                            pushError('system', 'missing_keys', msg);
                            ws.close();
                            return;
                        }

                        // A browser test has no phone leg and consumes no plan minutes, so
                        // the user's auto-hangup preference does not apply. It still gets a
                        // hard wall-clock cap, because a forgotten tab would otherwise keep
                        // burning provider API spend.
                        if (isBrowserTest) {
                            const capMs = parseInt(process.env.AGENT_TEST_MAX_MS || String(5 * 60 * 1000), 10);
                            console.log(`⏳ [AgentTest] Session capped at ${Math.round(capMs / 1000)}s`);
                            browserCapTimer = setTimeout(() => {
                                ctl('end', { reason: 'cap' });
                                if (ws.readyState === WebSocket.OPEN) ws.close();
                            }, capMs);
                        } else if (settings.autoHangupEnabled) {
                            const limit = direction === 'inbound' ? (settings.incomingHangupLimit ?? 10) : (settings.outgoingHangupLimit ?? 10);
                            const hangupMs = limit * 60 * 1000;
                            console.log(`⏳ [VoiceStream] Auto-hangup (${direction}) scheduled in ${limit} minutes`);

                            // 1-minute warning for inbound
                            if (direction === 'inbound' && limit > 1) {
                                const warningMs = (limit - 1) * 60 * 1000;
                                setTimeout(() => {
                                    if (callSid) {
                                        console.log(`🔔 [VoiceStream] Playing 1-minute warning for ${callSid}`);
                                        if (dgAgentSession) {
                                            dgAgentSession.injectWarning("This phone call will end in 1 minute.");
                                        } else if (elConnection && elReady) {
                                            elConnection.send(JSON.stringify({ text: "This phone call will end in 1 minute. ", try_trigger_generation: true }));
                                            elConnection.send(JSON.stringify({ text: "" }));
                                        }
                                    }
                                }, warningMs);
                            }

                            setTimeout(async () => {
                                if (callSid) {
                                    console.log(`⏰ [VoiceStream] Auto-hangup triggered for ${callSid}`);
                                    const twilio = require('twilio');
                                    const client = twilio(settings.twilioSid, settings.twilioToken);
                                    try {
                                        await client.calls(callSid).update({ status: 'completed' });
                                    } catch (err) {
                                        console.error('[VoiceStream] Auto-hangup failed:', err.message);
                                    }
                                }
                            }, hangupMs);
                        }

                        // Trigger Inbound Webhook + Email if direction is inbound
                        if (direction === 'inbound') {
                            const inboundPayload = {
                                callSid,
                                leadId,
                                direction: 'inbound',
                                provider: callSid?.startsWith('CA') ? 'twilio' : 'sip'
                            };
                            WebhookService.trigger(userId, 'inboundCall', inboundPayload);
                            EmailService.trigger(userId, 'inboundCall', inboundPayload);
                        }

                        // Deepgram Voice Agent engine: one websocket does STT + LLM + TTS with
                        // server-side turn-taking — delegate and skip the classic pipeline entirely.
                        if (isDgAgentEngine) {
                            const { TwilioDeepgramAgentSession } = require('./deepgram-agent/twilio-adapter');
                            dgAgentSession = new TwilioDeepgramAgentSession({
                                ws, streamSid, callSid, userId, agentId, leadId, campaignId, direction,
                                settings, agent, lead, transport: opts.transport || 'twilio'
                            });
                            await dgAgentSession.start();
                        } else if (isSarvamEngine) {
                            // Sarvam AI engine: self-contained Saaras STT → Sarvam-105B LLM → Bulbul TTS.
                            // Same adapter contract as the Deepgram Voice Agent session (start/onMedia/
                            // injectWarning/cleanup), so it reuses the delegated-session handle below.
                            const { TwilioSarvamSession } = require('./sarvam/twilio-adapter');
                            dgAgentSession = new TwilioSarvamSession({
                                ws, streamSid, callSid, userId, agentId, leadId, campaignId, direction,
                                settings, agent, lead, transport: opts.transport || 'twilio'
                            });
                            await dgAgentSession.start();
                        } else if (isGeminiEngine) {
                            // Gemini Live: one Google model hears, thinks and speaks. Same adapter
                            // contract again. Only reachable on the browser transport today — the
                            // Twilio path refuses this engine above.
                            const { TwilioGeminiLiveSession } = require('./gemini-live/twilio-adapter');
                            dgAgentSession = new TwilioGeminiLiveSession({
                                ws, streamSid, callSid, userId, agentId, leadId, campaignId, direction,
                                settings, agent, lead, transport: opts.transport || 'twilio'
                            });
                            await dgAgentSession.start();
                        } else if (engineApplies) {
                            // Idle detection is specific to this classic pipeline — the delegated
                            // engines (dgAgentSession) run their own, inside their own bridge.
                            touchActivity();
                            startIdleWatchdog();

                            // Cache KB content once per call — it's static for the call's duration
                            if (agent.knowledgeBaseId) {
                                try {
                                    const KnowledgeBase = require('../models/KnowledgeBase');
                                    const { formatKnowledgeBaseContent } = require('../utils/kb-formatter');
                                    const kb = await KnowledgeBase.findById(agent.knowledgeBaseId);
                                    if (kb) kbSystemContent = formatKnowledgeBaseContent(kb, agent.kbSettings || {});
                                } catch (kbErr) {
                                    console.error(`[VoiceStream] [${callSid}] KB preload failed:`, kbErr.message);
                                }
                            }

                            // 1. Initialize Deepgram ( ears )
                            const deepgram = createClient(settings.deepgramKey);
                            const dgLanguage = agent.language === 'multi' ? 'multi' : (agent.language || 'en-US');

                            // Use specialized phonecall models for English, fallback to nova-3 for ALL other languages.
                            // Nova-2-phonecall is optimized for telephony but lacks support for many global languages correctly in streaming.
                            // Nova-3 is superior for multilingual/global language support and real-time performance.
                            const phoneSupported = ['en', 'en-US', 'en-GB', 'en-AU', 'en-IN'];
                            const selectedModel = phoneSupported.includes(dgLanguage) ? 'nova-2-phonecall' : 'nova-3';

                            // Log the selected model for debugging
                            console.log(`🔌 [VoiceStream] Deepgram Model: ${selectedModel}, Language: ${dgLanguage}`);

                            if (isInitializingDg) return;
                            isInitializingDg = true;

                            dgConnection = deepgram.listen.live({
                                model: selectedModel,
                                language: dgLanguage,
                                smart_format: true,
                                encoding: 'mulaw',
                                sample_rate: 8000,
                                endpointing: tt().endpointingMs,
                                interim_results: true,
                                vad_events: true, // Enable instant voice activity detection
                            });

                            dgConnection.on(LiveTranscriptionEvents.Open, () => {
                                isInitializingDg = false;
                                console.log(`🟢 [Deepgram] [${callSid}] Connection Opened`);
                                dgReady = true;
                                if (audioBufferQueue.length > 0) {
                                    audioBufferQueue.forEach(chunk => dgConnection.send(chunk));
                                    audioBufferQueue = [];
                                }
                                checkReady();
                            });

                            /** Trigger interruption when user speech is detected (AI speaking or LLM processing). */
                            function maybeInterrupt(source, currentInterim) {
                                if (source === 'vad') {
                                    const now = Date.now();
                                    if (now - lastVadAt < 200) return;
                                    lastVadAt = now;
                                }
                                const aiSpeaking = isAISpeaking || Date.now() < audioEndTime;
                                const timeSinceProcessingStart = Date.now() - processingStartedAt;
                                const isGracePeriodEffect = isProcessing && !aiSpeaking && timeSinceProcessingStart < 300;
                                let wouldInterrupt = (aiSpeaking || isProcessing) && !isGracePeriodEffect;

                                // Stabilization: after first chunk of response, ignore brief utterances so "Certainly! Here's..." isn't killed by "Yes" or a short sound
                                const STABILIZATION_MS = tt().stabilizationMs;
                                const sinceFirstChunk = firstChunkSentAt ? Date.now() - firstChunkSentAt : 0;
                                const inStabilization = firstChunkSentAt && sinceFirstChunk < STABILIZATION_MS;
                                const currentText = (currentInterim || '').trim();
                                const lastText = (lastInterimTranscript || '').trim();
                                const recentLast = lastText && (Date.now() - lastInterimAt < 2000) ? lastText : '';
                                // Shared policy (utils/turn-taking.js): more than the agent's word threshold,
                                // or an explicit stop command. "yes"/"ok"/"hello" no longer force an interrupt —
                                // they are answers, and the Final path queues them so the agent gets to finish.
                                const hasSubstantialUtterance = agentShouldInterrupt(currentText) || agentShouldInterrupt(recentLast);
                                if (wouldInterrupt && inStabilization && !hasSubstantialUtterance) {
                                    console.log(`🔇 [VoiceStream] [${callSid}] Interrupt skipped (${source}): stabilization window (${sinceFirstChunk}ms < ${STABILIZATION_MS}ms), utterance too short to interrupt`);
                                    return;
                                }

                                if (!wouldInterrupt) {
                                    if (aiSpeaking || isProcessing) {
                                        console.log(`🔇 [VoiceStream] [${callSid}] Interrupt skipped (${source}): gracePeriod=${isGracePeriodEffect}, timeSinceStart=${timeSinceProcessingStart}ms`);
                                    }
                                    return;
                                }
                                const toQueue = (currentInterim && currentInterim.trim().length >= 2)
                                    ? currentInterim.trim()
                                    : (lastInterimTranscript && (Date.now() - lastInterimAt < 2000) ? lastInterimTranscript.trim() : '');
                                const MIN_INTERRUPT_CHARS = 3;
                                const meetsMinToInterrupt = toQueue.length >= MIN_INTERRUPT_CHARS && agentShouldInterrupt(toQueue);
                                // Don't interrupt when the "new" utterance is the same as the one we're already answering (avoids stop + no queue = silence)
                                if (toQueue.length >= 2 && toQueue === lastProcessedTranscript && (Date.now() - lastProcessedAt < 3000)) {
                                    const now = Date.now();
                                    if (toQueue !== lastSameTurnText || now - lastSameTurnLogAt > 2000) {
                                        console.log(`🔇 [VoiceStream] [${callSid}] Interrupt skipped (${source}): same as current turn, keeping response`);
                                        lastSameTurnLogAt = now;
                                        lastSameTurnText = toQueue;
                                    }
                                    return;
                                }
                                console.log(`🔇 [VoiceStream] [${callSid}] Interruption (${source}): aiSpeaking=${aiSpeaking}, isProcessing=${isProcessing}, audioEndIn=${Math.max(0, Math.round(audioEndTime - Date.now()))}ms`);
                                if (meetsMinToInterrupt) {
                                    stopAISpeaking();
                                    if (pendingPostInterruptTimer) { clearTimeout(pendingPostInterruptTimer); pendingPostInterruptTimer = null; }
                                    pendingPostInterruptTranscript = '';
                                    pendingPostInterruptUtterance = true;
                                    const recentlyProcessed = toQueue === lastProcessedTranscript && (Date.now() - lastProcessedAt < 3000);
                                    const alreadyQueued = transcriptQueue.length > 0 && transcriptQueue[transcriptQueue.length - 1] === toQueue;
                                    if (!recentlyProcessed && !alreadyQueued) {
                                        console.log(`📥 [VoiceStream] [${callSid}] Queuing interrupted utterance: "${toQueue.substring(0, 50)}${toQueue.length > 50 ? '...' : ''}" (queueLen=${transcriptQueue.length})`);
                                        lastInterimTranscript = '';
                                        pendingPostInterruptUtterance = false;
                                        queueTranscript(toQueue);
                                    } else {
                                        console.log(`📥 [VoiceStream] [${callSid}] Interrupt utterance not queued: recentlyProcessed=${recentlyProcessed}, alreadyQueued=${alreadyQueued}`);
                                        if (recentlyProcessed) pendingPostInterruptUtterance = false;
                                    }
                                } else {
                                    if (source === 'vad') {
                                        // Defer stop until we get a transcript; avoids false VAD (echo/noise) cutting off the bot
                                        const VAD_CONFIRM_MS = tt().vadConfirmMs;
                                        if (pendingVadInterruptTimer) { clearTimeout(pendingVadInterruptTimer); pendingVadInterruptTimer = null; }
                                        pendingVadInterrupt = true;
                                        pendingVadInterruptTimer = setTimeout(() => {
                                            pendingVadInterruptTimer = null;
                                            if (ws.readyState !== WebSocket.OPEN) return;
                                            pendingVadInterrupt = false;
                                            vqMetrics.falseVadEvents++;
                                            console.log(`🔇 [VoiceStream] [${callSid}] VAD deferred: no transcript in ${VAD_CONFIRM_MS}ms, ignoring (false VAD)`);
                                        }, VAD_CONFIRM_MS);
                                        console.log(`📥 [VoiceStream] [${callSid}] VAD deferred: waiting ${VAD_CONFIRM_MS}ms for transcript before stopping`);
                                    } else if (toQueue.length > 0) {
                                        // Under the interrupt bar (a one or two word answer like "yes").
                                        // Leave the agent speaking — the Final path queues this and it is
                                        // answered once the agent has finished.
                                        console.log(`🔇 [VoiceStream] [${callSid}] Interrupt skipped (${source}): "${toQueue.substring(0, 30)}" is under the interrupt bar, letting agent finish`);
                                    } else {
                                        stopAISpeaking();
                                        if (pendingPostInterruptTimer) { clearTimeout(pendingPostInterruptTimer); pendingPostInterruptTimer = null; }
                                        pendingPostInterruptTranscript = '';
                                        pendingPostInterruptUtterance = true;
                                        console.log(`📥 [VoiceStream] [${callSid}] Interrupt: no text to queue (toQueue.len=${toQueue.length}), pendingPostInterruptUtterance=true`);
                                    }
                                }
                            }

                            const handleTranscript = (data) => {
                                if (data && data.type === 'SpeechStarted') {
                                    console.log(`🎤 [VoiceStream] [${callSid}] Deepgram SpeechStarted (VAD)`);
                                    maybeInterrupt('vad');
                                    return;
                                }

                                const interimTranscript = (data.channel?.alternatives?.[0]?.transcript || '').trim();
                                const rec = data.channel?.alternatives?.[0]?.transcript;
                                if (pendingVadInterrupt && rec) {
                                    // Only a transcript that clears the interrupt bar confirms the VAD hit;
                                    // otherwise it fired on a backchannel, noise, or the agent's own echo.
                                    if (agentShouldInterrupt(rec)) {
                                        if (pendingVadInterruptTimer) { clearTimeout(pendingVadInterruptTimer); pendingVadInterruptTimer = null; }
                                        pendingVadInterrupt = false;
                                        stopAISpeaking();
                                        console.log(`📥 [VoiceStream] [${callSid}] VAD confirmed by transcript, stopping AI`);
                                    }
                                }
                                if (rec && !data.is_final) {
                                    lastInterimTranscript = rec;
                                    lastInterimAt = Date.now();
                                }
                                if (interimTranscript.length > 3) {
                                    maybeInterrupt('interim', interimTranscript);
                                }

                                if (rec) {
                                    if (data.is_final) {
                                        console.log(`👤 [Deepgram] [${callSid}] Final Transcript: "${rec}"`);
                                        if (pendingPostInterruptTimer) { clearTimeout(pendingPostInterruptTimer); pendingPostInterruptTimer = null; }
                                        pendingPostInterruptTranscript = '';
                                        pendingPostInterruptUtterance = false;
                                        const trimmed = rec.trim();
                                        if (pendingIncompleteFinal && trimmed === pendingIncompleteFinal) {
                                            console.log(`♻️ [VoiceStream] [${callSid}] Ignoring duplicate Final: "${trimmed.substring(0, 40)}..."`);
                                            return;
                                        }
                                        const hadPending = !!pendingIncompleteFinal;
                                        const merged = hadPending ? (pendingIncompleteFinal + ' ' + trimmed).trim() : trimmed;
                                        if (merged) {
                                            const looksComplete = /[.?!]$/.test(merged);
                                            const newWordCount = (trimmed.match(/\S+/g) || []).length;
                                            const isShortContinuation = newWordCount <= 3 && trimmed.length <= 40;
                                            // Complete sentence, or a long continuation after an earlier wait → short guard window;
                                            // otherwise wait longer in case the user is mid-thought. Both windows are extended by new speech.
                                            const waitMs = (looksComplete || (hadPending && !isShortContinuation))
                                                ? tt().finalCompleteWaitMs
                                                : tt().finalIncompleteWaitMs;
                                            schedulePendingFinal(merged, waitMs);
                                        }
                                        lastInterimTranscript = '';
                                    } else {
                                        if (rec.length > 3) console.log(`👤 [Deepgram] [${callSid}] Interim: "${rec}"`);
                                        // User is still speaking — push back any pending final dispatch so we never answer mid-utterance
                                        if (pendingIncompleteTimer && rec.trim().length >= 2) {
                                            schedulePendingFinal(pendingIncompleteFinal, tt().finalIncompleteWaitMs);
                                        }
                                        // Debounce: wait for Final or longer interim so we don't process "What kind of" then get "What kind of tasks?" after
                                        if (pendingPostInterruptUtterance && rec.trim().length >= 2 && !isProcessing) {
                                            const trimmed = rec.trim();
                                            if (trimmed.length > (pendingPostInterruptTranscript || '').length) {
                                                pendingPostInterruptTranscript = trimmed;
                                            }
                                            if (!pendingPostInterruptTimer) {
                                                const POST_INTERRUPT_DEBOUNCE_MS = 800;
                                                pendingPostInterruptTimer = setTimeout(() => {
                                                    pendingPostInterruptTimer = null;
                                                    if (ws.readyState !== WebSocket.OPEN) return;
                                                    if (pendingPostInterruptTranscript.length >= 2) {
                                                        console.log(`📥 [VoiceStream] [${callSid}] Queuing post-interrupt (debounced): "${pendingPostInterruptTranscript.substring(0, 50)}${pendingPostInterruptTranscript.length > 50 ? '...' : ''}"`);
                                                        pendingPostInterruptUtterance = false;
                                                        queueTranscript(pendingPostInterruptTranscript);
                                                    }
                                                    pendingPostInterruptTranscript = '';
                                                }, POST_INTERRUPT_DEBOUNCE_MS);
                                            }
                                        } else if (pendingPostInterruptUtterance && rec.trim().length >= 2 && isProcessing) {
                                            console.log(`📥 [VoiceStream] [${callSid}] Post-interrupt interim deferred (isProcessing=true)`);
                                        }
                                    }
                                }
                            };

                            /** Hold a Final in a short cancellable window before dispatch; new speech extends or merges into it. */
                            function schedulePendingFinal(text, waitMs) {
                                pendingIncompleteFinal = text;
                                if (pendingIncompleteTimer) clearTimeout(pendingIncompleteTimer);
                                pendingIncompleteTimer = setTimeout(() => {
                                    pendingIncompleteTimer = null;
                                    if (ws.readyState !== WebSocket.OPEN) return;
                                    if (pendingIncompleteFinal) {
                                        console.log(`📥 [VoiceStream] [${callSid}] Queuing after ${waitMs}ms final debounce: "${pendingIncompleteFinal.substring(0, 40)}..."`);
                                        queueTranscript(pendingIncompleteFinal);
                                        pendingIncompleteFinal = '';
                                    }
                                }, waitMs);
                            }

                            function queueTranscript(text) {
                                const now = Date.now();
                                if (text === lastProcessedTranscript && (now - lastProcessedAt < 3000)) {
                                    console.log(`♻️ [VoiceStream] [${callSid}] Ignoring duplicate transcript (recent): "${text.substring(0, 40)}..." (lastProcessedAt ${now - lastProcessedAt}ms ago)`);
                                    return;
                                }
                                if (transcriptQueue.length > 0 && transcriptQueue[transcriptQueue.length - 1] === text) {
                                    console.log(`♻️ [VoiceStream] [${callSid}] Ignoring duplicate in queue (same as tail): "${text.substring(0, 40)}..."`);
                                    return;
                                }

                                if (transcriptQueue.length >= 10) {
                                    const dropped = transcriptQueue.shift();
                                    console.warn(`⚠️ [VoiceStream] [${callSid}] Queue full, dropping oldest: "${dropped.substring(0, 30)}..."`);
                                }
                                lastQueuedAt = now;
                                transcriptQueue.push(text);
                                const queueLen = transcriptQueue.length;
                                if (!isProcessing) {
                                    processNextInQueue();
                                } else {
                                    console.log(`📥 [VoiceStream] [${callSid}] AI busy, transcript queued (queueLen=${queueLen}): "${text.substring(0, 30)}..."`);
                                }
                            }

                            function stopAISpeaking() {
                                console.log(`🛑 [VoiceStream] [${callSid}] stopAISpeaking: isAISpeaking=${isAISpeaking}, hadAbort=${!!abortController}, hadEL=${!!elConnection}`);
                                if (isAISpeaking || isProcessing || Date.now() < audioEndTime) vqMetrics.interruptions++;
                                touchActivity();
                                cancelEndCall();
                                isAISpeaking = false;
                                audioEndTime = 0;
                                interrupted = true;
                                if (speakingTimer) {
                                    clearTimeout(speakingTimer);
                                    speakingTimer = null;
                                }

                                if (ws.readyState === WebSocket.OPEN) {
                                    ws.send(JSON.stringify({ event: 'clear', streamSid: streamSid }));
                                    console.log(`🛑 [VoiceStream] [${callSid}] Twilio clear sent`);
                                }

                                if (abortController) {
                                    console.log(`🛑 [VoiceStream] [${callSid}] Aborting LLM stream`);
                                    abortController.abort();
                                    abortController = null;
                                }

                                if (elConnection) {
                                    try {
                                        elConnection.send(JSON.stringify({ text: "" }));
                                        elConnection.terminate();
                                    } catch (_) { }
                                    elReady = false;
                                    console.log(`🛑 [VoiceStream] [${callSid}] ElevenLabs connection terminated`);
                                }
                            }

                            // NOTE: LiveTranscriptionEvents.Transcript === 'Results' — registering both would run the handler twice per event
                            dgConnection.on(LiveTranscriptionEvents.Transcript, handleTranscript);
                            // VAD: interrupt on speech start even when no transcript (e.g. echo / poor recognition)
                            dgConnection.on('SpeechStarted', () => maybeInterrupt('vad'));
                            dgConnection.on(LiveTranscriptionEvents.Error, (err) => {
                                isInitializingDg = false;
                                console.error(`🔴 [Deepgram] [${callSid}] Error:`, err);
                                pushError('deepgram', 'connection_error', `Speech recognition error: ${err?.message || 'Connection failed'}`);
                            });
                            function handleDgClose() {
                                isInitializingDg = false;
                                dgReady = false;
                                console.log(`⚪ [Deepgram] [${callSid}] Connection Closed`);
                                if (ws.readyState === WebSocket.OPEN && agent.useCustomVoice) {
                                    console.log(`🔄 [Deepgram] [${callSid}] Reconnecting (call still active)...`);
                                    setTimeout(() => {
                                        if (ws.readyState !== WebSocket.OPEN || isInitializingDg) return;
                                        isInitializingDg = true;
                                        dgConnection = deepgram.listen.live({
                                            model: selectedModel, language: dgLanguage, smart_format: true,
                                            encoding: 'mulaw', sample_rate: 8000, endpointing: tt().endpointingMs,
                                            interim_results: true, vad_events: true,
                                        });
                                        dgConnection.on(LiveTranscriptionEvents.Open, () => {
                                            isInitializingDg = false;
                                            dgReady = true;
                                            console.log(`🟢 [Deepgram] [${callSid}] Reconnected`);
                                        });
                                        dgConnection.on(LiveTranscriptionEvents.Transcript, handleTranscript);
                                        dgConnection.on('SpeechStarted', () => maybeInterrupt('vad'));
                                        dgConnection.on(LiveTranscriptionEvents.Error, (err) => {
                                            isInitializingDg = false;
                                            console.error(`🔴 [Deepgram] [${callSid}] Reconnect Error:`, err);
                                        });
                                        dgConnection.on(LiveTranscriptionEvents.Close, handleDgClose);
                                    }, 500);
                                }
                            }
                            dgConnection.on(LiveTranscriptionEvents.Close, handleDgClose);

                            // 2. Initialize ElevenLabs ( voice )
                            await initializeElevenLabs();
                        }

                    } catch (err) {
                        console.error('❌ Setup Crash:', err);
                    }
                    break;

                case 'media':
                    if (msg.media.track !== 'inbound') break;

                    if (dgAgentSession) {
                        dgAgentSession.onMedia(msg.media.payload);
                        break;
                    }

                    const audioBuffer = Buffer.from(msg.media.payload, 'base64');
                    // CRITICAL: Always send to Deepgram to prevent timeout, even if AI is speaking
                    if (dgReady && dgConnection) {
                        dgConnection.send(audioBuffer);
                    } else {
                        audioBufferQueue.push(audioBuffer);
                    }
                    break;

                case 'stop':
                    console.log(`🛑 [VoiceStream] [${callSid}] Twilio stop event — cleanup`);
                    cleanup();
                    break;
            }
        } catch (err) {
            console.error('🔥 WS Error:', err);
        }
    });

    async function initializeElevenLabs() {
        if (isInitializingEl) return;
        if (elConnection && elConnection.readyState === WebSocket.OPEN) return;

        isInitializingEl = true;
        if (elConnection) elConnection.terminate();

        const voiceId = agent?.voiceId || '21m00Tcm4TlvDq8ikWAM';
        // Per-agent model + voice_settings (utils/voice-quality.js). 'auto' keeps the legacy
        // rule: Flash v2.5 (~75ms, 32 languages) for non-English, Turbo v2.5 for English.
        const vq = voiceQuality || resolveVoiceQuality(agent);
        const elModel = vq.model;
        // optimize_streaming_latency is deprecated at ElevenLabs — latency is now driven by
        // the chunk_length_schedule sent in the BOS message below.
        const elUrl = buildElevenLabsStreamUrl({ voiceId, model: elModel });

        console.log(`🎤 [ElevenLabs] [${callSid}] Connecting — Voice: ${voiceId}, Model: ${elModel}, Preset: ${vq.preset}, Latency: ${vq.latencyProfile}`);
        elConnection = new WebSocket(elUrl);

        elConnection.on('open', () => {
            isInitializingEl = false;
            console.log(`🟢 [ElevenLabs] [${callSid}] Connection Opened`);
            elReady = true;
            elConnection.send(JSON.stringify(buildElevenLabsBOS({ apiKey: settings.elevenLabsKey, voiceQuality: vq })));
            checkReady();
        });

        let audioChunkCount = 0;
        elConnection.on('message', (data) => {
            try {
                const response = JSON.parse(data);

                if (!response.audio) {
                    console.log(`📩 [ElevenLabs] [${callSid}] Message: ${JSON.stringify(response).substring(0, 300)}`);
                }

                // Check for error responses
                if (response.error || response.message) {
                    isInitializingEl = false;
                    console.error(`❌ [ElevenLabs] Error response: ${response.error || response.message}`);
                    const friendlyMsg = humanizeElevenLabsError(response.error, response.message);
                    pushError('elevenlabs', response.error || response.code || 'error', friendlyMsg);
                }

                if (response.audio) {
                    if (interrupted || !isAISpeaking) {
                        return;
                    }
                    console.log(`🔊 [ElevenLabs] [${callSid}] Audio chunk received (${response.audio.length} chars)`);
                    const audio = Buffer.from(response.audio, 'base64');

                    if (!streamSid) {
                        console.warn('⚠️ [VoiceStream] Audio received but streamSid is not set!');
                        return;
                    }

                    if (ws.bufferedAmount > 1024 * 1024) {
                        console.warn(`⚠️ [VoiceStream] [${callSid}] Dropping audio chunk — ws backpressure (buffered=${ws.bufferedAmount})`);
                        return;
                    }
                    ws.send(JSON.stringify({
                        event: 'media',
                        streamSid: streamSid,
                        media: { payload: audio.toString('base64') }
                    }));

                    const durationMs = (audio.length / 8000) * 1000;
                    const now = Date.now();
                    audioEndTime = (audioEndTime > now) ? audioEndTime + durationMs : now + durationMs;
                    isAISpeaking = true;

                    if (speakingTimer) clearTimeout(speakingTimer);
                    const remaining = Math.max(0, audioEndTime - Date.now());
                    speakingTimer = setTimeout(() => {
                        isAISpeaking = false;
                        speakingTimer = null;
                    }, remaining + 200);

                    audioChunkCount++;
                    if (audioChunkCount === 1) {
                        if (!firstChunkSentAt) firstChunkSentAt = Date.now();
                        console.log(`🔊 [VoiceStream] First audio chunk sent to Twilio (${audio.length} bytes)`);
                    }
                    if (turnTimings && !turnTimings.firstAudioAt) {
                        turnTimings.firstAudioAt = Date.now();
                        const d = turnTimings.dispatchedAt;
                        const rel = (t) => t ? `${t - d}ms` : 'n/a';
                        console.log(`⏱️ [Latency] [${callSid}] queueWait=${turnTimings.queueWaitMs}ms llmRequest=${rel(turnTimings.llmRequestAt)} llmFirstToken=${rel(turnTimings.llmFirstTokenAt)} ttsFirstText=${rel(turnTimings.ttsFirstTextAt)} firstAudio=${turnTimings.firstAudioAt - d}ms (from dispatch)`);
                        // Voice Quality metrics — one sample per turn
                        const firstAudioMs = turnTimings.firstAudioAt - d;
                        if (turnTimings.llmFirstTokenAt) vqMetrics.llmFirstTokenSum += turnTimings.llmFirstTokenAt - d;
                        if (turnTimings.ttsFirstTextAt) vqMetrics.ttsFirstTextSum += turnTimings.ttsFirstTextAt - d;
                        vqMetrics.firstAudioSum += firstAudioMs;
                        vqMetrics.latencyCount++;
                        if (firstAudioMs > vqMetrics.maxFirstAudioMs) vqMetrics.maxFirstAudioMs = firstAudioMs;
                    }
                }
                if (response.isFinal) {
                    console.log(`🔊 [VoiceStream] [${callSid}] ElevenLabs Generation Complete.`);
                    audioChunkCount = 0;
                }
            } catch (e) {
                console.error('❌ [VoiceStream] Error processing ElevenLabs message:', e.message);
            }
        });

        elConnection.on('close', (code, reason) => {
            isInitializingEl = false;
            elReady = false;
            console.log(`⚪ [ElevenLabs] [${callSid}] Connection Closed (Code: ${code}, Reason: ${reason?.toString() || 'none'})`);
        });
        elConnection.on('error', (err) => {
            isInitializingEl = false;
            console.error(`🔴 [ElevenLabs] [${callSid}] Error:`, err.message);
        });
    }



    const LLM_DEBOUNCE_MS = 200;
    /** Never hold a caller's queued utterance longer than this, whatever the speaking flags say. */
    const MAX_QUEUE_HOLD_MS = 15000;
    let queueHeldSince = 0;

    /**
     * A queued turn waits for the agent to stop TALKING, not just to stop thinking. isProcessing
     * clears when the LLM stream ends, but audioEndTime marks when Twilio actually finishes
     * playing the reply — answering before then talks over the agent. Anything that cleared the
     * interrupt bar already stopped playback, so this only holds the short utterances we
     * deliberately let the agent talk through.
     */
    function busyTalking() {
        if (!(isProcessing || isAISpeaking || Date.now() < audioEndTime)) {
            queueHeldSince = 0;
            return false;
        }
        if (!queueHeldSince) queueHeldSince = Date.now();
        if (Date.now() - queueHeldSince > MAX_QUEUE_HOLD_MS) {
            console.warn(`⏰ [VoiceStream] [${callSid}] Held turn exceeded ${MAX_QUEUE_HOLD_MS}ms — dispatching anyway`);
            queueHeldSince = 0;
            return false;
        }
        return true;
    }

    function processNextInQueue() {
        if (processDebounceTimer) { clearTimeout(processDebounceTimer); processDebounceTimer = null; }
        if (ws.readyState !== WebSocket.OPEN) return;
        if (transcriptQueue.length === 0) return;
        if (busyTalking()) { scheduleProcessNext(); return; }
        const next = transcriptQueue.shift();
        lastProcessedTranscript = next;
        lastProcessedAt = Date.now();
        console.log(`📤 [VoiceStream] [${callSid}] Processing immediately: "${next.substring(0, 40)}..."`);
        processConversation(next);
    }
    function scheduleProcessNext() {
        if (processDebounceTimer) { clearTimeout(processDebounceTimer); processDebounceTimer = null; }
        if (transcriptQueue.length === 0) return;
        processDebounceTimer = setTimeout(() => {
            processDebounceTimer = null;
            if (ws.readyState !== WebSocket.OPEN) return;
            if (transcriptQueue.length === 0) return;
            // Still talking — re-arm rather than answer over the agent.
            if (busyTalking()) { scheduleProcessNext(); return; }
            const next = transcriptQueue.shift();
            lastProcessedTranscript = next;
            lastProcessedAt = Date.now();
            console.log(`📤 [VoiceStream] [${callSid}] Processing (debounced ${LLM_DEBOUNCE_MS}ms): "${next.substring(0, 40)}..."`);
            processConversation(next);
        }, LLM_DEBOUNCE_MS);
    }

    async function processConversation(userInput) {
        if (userInput.trim().length < 2) return;
        if (ws.readyState !== WebSocket.OPEN) return;

        console.log(`🧠 [LLM] [${callSid}] processConversation start | userInput="${userInput.substring(0, 60)}${userInput.length > 60 ? '...' : ''}" | queueLen=${transcriptQueue.length}`);
        vqMetrics.turns++;
        isProcessing = true;
        processingStartedAt = Date.now();
        interrupted = false;
        firstChunkSentAt = 0; // reset so first TTS chunk of this response sets it
        turnTimings = {
            dispatchedAt: processingStartedAt,
            queueWaitMs: lastQueuedAt ? processingStartedAt - lastQueuedAt : 0,
            llmRequestAt: 0, llmFirstTokenAt: 0, ttsFirstTextAt: 0, firstAudioAt: 0
        };
        transcript.push({ role: 'user', content: userInput });
        ctl('transcript', { role: 'user', content: userInput });
        touchActivity();

        abortController = new AbortController();

        if (!elConnection || elConnection.readyState !== WebSocket.OPEN) {
            await initializeElevenLabs();
            let elAttempts = 0;
            while (!elReady && elAttempts < 15) {
                await new Promise(r => setTimeout(r, 100));
                elAttempts++;
            }
        }

        try {
            const systemPrompt = buildVoiceSystemPrompt({ agent, settings, kbContent: kbSystemContent, commandTags: true, lead });

            const MAX_HISTORY = 20;
            const recentTranscript = transcript.length > MAX_HISTORY
                ? transcript.slice(-MAX_HISTORY)
                : transcript;

            if (turnTimings) turnTimings.llmRequestAt = Date.now();
            const response = await axios({
                method: 'post',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                data: {
                    model: openRouterModel,
                    messages: [{ role: 'system', content: systemPrompt }, ...recentTranscript],
                    stream: true
                },
                headers: { 'Authorization': `Bearer ${settings.openRouterKey}`, 'Content-Type': 'application/json' },
                responseType: 'stream',
                signal: abortController.signal
            });

            let fullReply = "";
            let firstContentReceived = false;
            // Prosody-aware (or legacy, per the agent's preset) TTS text chunking —
            // sends linguistically complete clauses instead of flushing on every comma.
            const chunker = new TtsChunkBuffer((voiceQuality || resolveVoiceQuality(agent)).chunking);

            for await (const chunk of response.data) {
                if (interrupted) {
                    console.log(`🧠 [VoiceStream] [${callSid}] LLM stream broke early (interrupted=true)`);
                    break;
                }

                const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                for (const line of lines) {
                    if (line.includes('[DONE]')) break;
                    if (!line.startsWith('data: ')) continue;

                    try {
                        const json = JSON.parse(line.slice(6));
                        const content = json.choices?.[0]?.delta?.content || "";
                        if (content) {
                            if (!firstContentReceived) {
                                firstContentReceived = true;
                                isAISpeaking = true;
                                if (turnTimings && !turnTimings.llmFirstTokenAt) turnTimings.llmFirstTokenAt = Date.now();
                            }
                            fullReply += content;
                            for (const piece of chunker.push(content)) {
                                const toSend = stripAppointmentCommands(piece);
                                if (toSend) sendToTTS(toSend, false);
                            }
                        }
                    } catch (e) { }
                }
            }

            // Final flush (strip appointment commands so [[SLOTS]] etc. are never spoken)
            const remainder = chunker.drain();
            if (remainder && !interrupted) {
                const toSend = stripAppointmentCommands(remainder);
                if (toSend) sendToTTS(toSend, true);
                else sendToTTS("", true);
            } else if (!interrupted) {
                sendToTTS("", true); // Ensure generation trigger
            }

            if (fullReply && !interrupted) {
                console.log(`🤖 [LLM] [${callSid}] Reply: "${fullReply.substring(0, 100)}..."`);
                transcript.push({ role: 'assistant', content: fullReply });
                ctl('transcript', { role: 'assistant', content: fullReply });
                touchActivity();

                // --- TOOL PARSING & EXECUTION ---
                // Ending the call is a capability of every agent, so it is parsed outside
                // the appointment-booking gate the other tags sit behind.
                if (/\[\[END_CALL\]\]/.test(fullReply)) scheduleEndCall();

                if (agent.appointmentBookingEnabled) {
                    const listMatch = fullReply.match(/\[\[LIST\]\]/);
                    const slotsMatch = fullReply.match(/\[\[SLOTS\]\]/);
                    const bookMatch = fullReply.match(/\[\[BOOK:(.*?)\]\]/);
                    const cancelMatch = fullReply.match(/\[\[CANCEL:(.*?)\]\]/);

                    let result = "";
                    if (listMatch) {
                        result = await AppointmentService.listAppointments(userId, lead.phone);
                    } else if (slotsMatch) {
                        result = await AppointmentService.getAvailableSlots(userId);
                    } else if (bookMatch) {
                        const content = bookMatch[1].trim();
                        const parsed = parseBookDateTime(content);
                        if (parsed) {
                            result = await AppointmentService.bookAppointment(userId, agent._id, lead._id, lead.phone, parsed.date, parsed.time, parsed.clientName || '');
                        } else {
                            const [dateTimePart, clientName] = content.split('|').map(s => s.trim());
                            const parts = dateTimePart.split(' ');
                            if (parts.length >= 2) result = await AppointmentService.bookAppointment(userId, agent._id, lead._id, lead.phone, parts[0], parts[1], clientName || '');
                        }
                    } else if (cancelMatch) {
                        const parts = cancelMatch[1].trim().split(' ');
                        if (parts.length >= 2) {
                            result = await AppointmentService.cancelAppointment(userId, lead.phone, parts[0], parts[1]);
                        }
                    }

                    if (result && !interrupted) {
                        console.log(`🛠️ Command Executed: ${result}`);
                        // Always pass tool output to LLM so it knows what happened (next turn has full context, won't get stuck)
                        transcript.push({ role: 'system', content: `COMMAND RESULT: ${result}` });

                        const toSpeak = await narrateAppointmentResult({
                            rawResult: result,
                            agentLanguage: agent.language,
                            lastUserUtterance: userInput,
                            isListOrSlots: !!(slotsMatch || listMatch),
                            openRouterKey: settings.openRouterKey,
                            model: openRouterModel,
                            speakTimeFn: (t) => timesToSpokenWords(t, settings?.timeFormat || '12'),
                        });
                        if (toSpeak && !interrupted) {
                            if (elConnection) {
                                try { elConnection.terminate(); } catch (_) { }
                                elConnection = null;
                            }
                            elReady = false;
                            await initializeElevenLabs();
                            let elAttempts = 0;
                            while (!elReady && elAttempts < 15) {
                                await new Promise(r => setTimeout(r, 100));
                                elAttempts++;
                            }
                            if (elReady && !interrupted) {
                                sendToTTS(toSpeak, true);
                                transcript.push({ role: 'assistant', content: toSpeak });
                                ctl('transcript', { role: 'assistant', content: toSpeak });
                                touchActivity();
                            }
                        }
                    }
                }
            }

        } catch (err) {
            if (axios.isCancel(err)) {
                console.log(`[VoiceStream] [${callSid}] LLM aborted (axios cancel)`);
            } else {
                console.error(`[VoiceStream] [${callSid}] LLM Error:`, err.message);
                pushError('openrouter', err.response?.status || 'error', `AI response failed: ${err.message}`);
            }
        } finally {
            isProcessing = false;
            abortController = null;
            const queueLen = transcriptQueue.length;
            console.log(`🧠 [VoiceStream] [${callSid}] processConversation done | queueLen=${queueLen} | lastProcessed="${(lastProcessedTranscript || '').substring(0, 30)}..."`);
            while (transcriptQueue.length > 0) {
                const next = transcriptQueue[0];
                const isDuplicate = next === lastProcessedTranscript && (Date.now() - lastProcessedAt < 3000);
                if (!isDuplicate) {
                    scheduleProcessNext();
                    break;
                }
                transcriptQueue.shift();
                console.log(`♻️ [VoiceStream] [${callSid}] Skipping duplicate in queue: "${next.substring(0, 40)}..." (same as lastProcessed, ${Date.now() - lastProcessedAt}ms ago)`);
            }
        }
    }

    async function sendToTTS(text, flush = true) {
        if (!text && !flush) return;
        if (interrupted) {
            console.log(`🔇 [TTS] [${callSid}] Skipping send (interrupted=true): "${(text || '').substring(0, 30)}..."`);
            return;
        }
        isAISpeaking = true;

        const stripped = text ? stripAppointmentCommands(text) : '';
        if (text && !stripped && !flush) return; // nothing to speak after strip
        const toSend = stripped || (flush ? '' : null);
        if (toSend === null) return;
        console.log(`📤 [TTS] [${callSid}] Sending: "${(toSend || '').substring(0, 30)}..." (Flush: ${flush})`);

        if (!elConnection || elConnection.readyState !== WebSocket.OPEN) {
            await initializeElevenLabs();
            let attempts = 0;
            while (!elReady && attempts < 10) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }
        }

        if (elConnection && elConnection.readyState === WebSocket.OPEN) {
            if (toSend) {
                if (turnTimings && !turnTimings.ttsFirstTextAt) turnTimings.ttsFirstTextAt = Date.now();
                vqMetrics.ttsChunksSent++;
                elConnection.send(JSON.stringify({ text: toSend + " ", try_trigger_generation: true }));
            }
            if (flush) {
                elConnection.send(JSON.stringify({ text: "" }));
            }
        }
    }

    function checkReady() {
        if (dgReady && elReady && !greetingSent) {
            greetingSent = true;
            const greeting = applyMergeFields(agent?.openingMessage || "Hello", lead, { stripUnmatched: true }) || "Hello";

            console.log(`⚡ Launching Greeting...`);
            touchActivity();
            ctl('transcript', { role: 'assistant', content: greeting });
            setTimeout(() => sendToTTS(greeting), 1000);
        }
    }

    /**
     * The agent emitted [[END_CALL]]. Refuse if the model looks like it's hallucinating
     * (opening seconds, or before the caller has said anything) — the idle-timeout and
     * safety-timer paths bypass these guards since they aren't model-decided.
     */
    function scheduleEndCall() {
        if (endCallPending) return;
        if (!streamStartedAt || Date.now() - streamStartedAt < END_CALL_MIN_CALL_MS) {
            console.warn(`⚠️ [VoiceStream] [${callSid}] Ignoring [[END_CALL]] — call is only seconds old`);
            return;
        }
        if (!transcript.some(t => t.role === 'user')) {
            console.warn(`⚠️ [VoiceStream] [${callSid}] Ignoring [[END_CALL]] — caller has not spoken yet`);
            return;
        }
        armEndCall('agent requested');
    }

    /**
     * Its closing line is still streaming to Twilio, so poll the playout estimate
     * (audioEndTime, maintained as chunks go out) and only drop the leg once the caller
     * has actually heard it.
     */
    function armEndCall(reason) {
        if (endCallPending) return;
        endCallPending = true;
        console.log(`📴 [VoiceStream] [${callSid}] Ending call armed (${reason}) — waiting for playback to finish`);
        endCallSafetyTimer = setTimeout(() => hangupNow('safety timeout'), END_CALL_SAFETY_MS);
        endCallTimer = setInterval(() => {
            if (!endCallPending) return;
            // audioEndTime stays 0 until the first chunk goes out; the safety timer covers
            // the case where the agent never actually speaks.
            if (audioEndTime > 0 && Date.now() >= audioEndTime + END_CALL_DRAIN_GRACE_MS) {
                hangupNow('playback finished');
            }
        }, 250);
    }

    /** Caller spoke over the goodbye — they are not done, so stay on the line. */
    function cancelEndCall() {
        if (!endCallPending) return;
        endCallPending = false;
        if (endCallTimer) { clearInterval(endCallTimer); endCallTimer = null; }
        if (endCallSafetyTimer) { clearTimeout(endCallSafetyTimer); endCallSafetyTimer = null; }
        console.log(`🙅 [VoiceStream] [${callSid}] End of call cancelled — caller spoke again`);
    }

    async function hangupNow(why) {
        if (!endCallPending) return;
        endCallPending = false;
        if (endCallTimer) { clearInterval(endCallTimer); endCallTimer = null; }
        if (endCallSafetyTimer) { clearTimeout(endCallSafetyTimer); endCallSafetyTimer = null; }
        if (!callSid) return;

        console.log(`📴 [VoiceStream] [${callSid}] Ending call (${why})`);
        if (isBrowserTest) {
            // No phone leg to drop — closing the socket is the hangup. The close
            // handler drives the same cleanup path a Twilio 'stop' would.
            ctl('end', { reason: 'agent' });
            if (ws.readyState === WebSocket.OPEN) ws.close();
            return;
        }
        try {
            const twilio = require('twilio');
            const client = twilio(settings.twilioSid, settings.twilioToken);
            // Twilio then sends 'stop', which drives the normal cleanup path.
            await client.calls(callSid).update({ status: 'completed' });
        } catch (err) {
            console.error(`❌ [VoiceStream] [${callSid}] Hangup failed:`, err.message);
        }
    }

    /** Any real speech, either side — resets the idle clock and re-arms future detection. */
    function touchActivity() {
        lastActivityAt = Date.now();
        idleHangupTriggered = false;
    }

    function startIdleWatchdog() {
        if (idleWatchdog) return;
        idleWatchdog = setInterval(() => {
            if (!callSid || idleHangupTriggered || endCallPending) return;
            if (Date.now() - lastActivityAt < IDLE_TIMEOUT_MS) return;
            idleHangupTriggered = true;
            console.log(`💤 [VoiceStream] [${callSid}] No activity for ${IDLE_TIMEOUT_MS}ms — ending call`);
            transcript.push({ role: 'assistant', content: IDLE_HANGUP_MESSAGE });
            sendToTTS(IDLE_HANGUP_MESSAGE);
            armEndCall('idle timeout');
        }, IDLE_CHECK_INTERVAL_MS);
    }

    function cleanup() {
        // Twilio fires both 'stop' and ws 'close', so this runs twice. Without the guard the
        // second pass would fall through to the classic body — where transcript is empty for
        // a delegated engine — and overwrite the adapter's row with an empty failed one.
        if (cleanedUp) return;
        cleanedUp = true;
        if (callSid) activeTwilioCallSids.delete(callSid);
        if (idleWatchdog) { clearInterval(idleWatchdog); idleWatchdog = null; }

        if (dgAgentSession) {
            dgAgentSession.cleanup();
            dgAgentSession = null;
            return;
        }
        console.log(`🧹 [VoiceStream] [${callSid}] cleanup | transcriptLen=${transcript.length} queueLen=${transcriptQueue.length}`);
        if (pendingPostInterruptTimer) { clearTimeout(pendingPostInterruptTimer); pendingPostInterruptTimer = null; }
        if (pendingVadInterruptTimer) { clearTimeout(pendingVadInterruptTimer); pendingVadInterruptTimer = null; }
        if (pendingIncompleteTimer) { clearTimeout(pendingIncompleteTimer); pendingIncompleteTimer = null; }
        if (processDebounceTimer) { clearTimeout(processDebounceTimer); processDebounceTimer = null; }
        pendingVadInterrupt = false;
        pendingIncompleteFinal = '';
        if (speakingTimer) { clearTimeout(speakingTimer); speakingTimer = null; }
        if (endCallTimer) { clearInterval(endCallTimer); endCallTimer = null; }
        if (endCallSafetyTimer) { clearTimeout(endCallSafetyTimer); endCallSafetyTimer = null; }
        endCallPending = false;
        audioEndTime = 0;
        isAISpeaking = false;
        if (abortController) { try { abortController.abort(); } catch (_) { } abortController = null; }
        if (dgConnection) try { dgConnection.finish(); } catch (_) { }
        dgConnection = null;
        if (elConnection) try { elConnection.terminate(); } catch (_) { }
        elConnection = null;
        if (browserCapTimer) { clearTimeout(browserCapTimer); browserCapTimer = null; }
        // A browser test is not a call: nothing is logged, analyzed, or billed.
        if (isBrowserTest) return;

        // A call that ended before any conversation happened still has to reach a terminal
        // status, or the row stays "in conversation" in the UI forever.
        if (callSid) {
            const hadConversation = transcript.length > 0;
            const vqAvg = (sum) => vqMetrics.latencyCount ? Math.round(sum / vqMetrics.latencyCount) : 0;
            const updateData = {
                userId, agentId, leadId, campaignId, callSid,
                direction,
                status: hadConversation ? 'completed' : 'failed', endTime: new Date(),
                voiceMetrics: {
                    turns: vqMetrics.turns,
                    interruptions: vqMetrics.interruptions,
                    falseVadEvents: vqMetrics.falseVadEvents,
                    rtpQueueDrops: 0, // RTP playout buffering is SIP-only
                    ttsChunksSent: vqMetrics.ttsChunksSent,
                    avgLlmFirstTokenMs: vqAvg(vqMetrics.llmFirstTokenSum),
                    avgTtsFirstTextMs: vqAvg(vqMetrics.ttsFirstTextSum),
                    avgFirstAudioMs: vqAvg(vqMetrics.firstAudioSum),
                    maxFirstAudioMs: vqMetrics.maxFirstAudioMs
                }
            };
            if (hadConversation) updateData.transcript = transcript;
            // Only include errors if there are any
            if (callErrors.length > 0) {
                updateData.$push = { errors: { $each: callErrors } };
            }
            CallLog.findOneAndUpdate({ callSid }, updateData, { upsert: true, returnDocument: 'after' }).then(async (updatedLog) => {
                // Twilio's own CallDuration from POST /api/twilio/status is authoritative;
                // this only fills the gap when that callback never lands.
                await persistDurationIfUnset(callSid, computeDuration(streamStartedAt));

                // Trigger Auto-Analysis for Custom Voice calls
                if (hadConversation && settings?.autoAnalysisEnabled) {
                    console.log(`[VoiceStream] Auto-analysis triggered for call ${callSid}`);
                    analyzeCallLog(updatedLog._id).catch(e => console.error('[VoiceStream] Analysis Error:', e));
                }

                // Trigger Call Completed Webhook + Email
                const completedPayload = {
                    callSid,
                    leadId,
                    campaignId,
                    direction,
                    status: updateData.status,
                    duration: updatedLog.duration,
                    provider: callSid?.startsWith('CA') ? 'twilio' : 'sip'
                };
                WebhookService.trigger(userId, 'callCompleted', completedPayload);
                EmailService.trigger(userId, 'callCompleted', completedPayload);
            }).catch(e => console.error('Log Error:', e));
        }
    }

    ws.on('close', cleanup);
}

/**
 * callSids with a live media stream right now. The stale-call sweep checks this before
 * marking a Twilio row terminal, mirroring sipManager.getActiveCallIds() for SIP.
 */
function getActiveCallSids() {
    return Array.from(activeTwilioCallSids);
}

module.exports = { handleVoiceStream, getActiveCallSids };
