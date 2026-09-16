const dgram = require('dgram');
const WebSocket = require('ws');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const axios = require('axios');
const Settings = require('../../models/Settings');
const Agent = require('../../models/Agent');
const Lead = require('../../models/Lead');
const CallLog = require('../../models/CallLog');
const { deepgramModel, openRouterModel } = require('../../utils/models');
const { buildVoiceSystemPrompt } = require('../../utils/agent-prompt');
const { applyMergeFields } = require('../../utils/merge-fields');
const { analyzeCallLog } = require('../../utils/analyzer');
const { shouldInterrupt } = require('../../utils/turn-taking');
const { resolveVoiceQuality, buildElevenLabsStreamUrl, buildElevenLabsBOS } = require('../../utils/voice-quality');
const { TtsChunkBuffer } = require('../../utils/tts-chunker');
const WebhookService = require('../webhook-service');
const EmailService = require('../email-service');

const { computeDuration } = require('../../utils/call-duration');

const RTP_HEADER_SIZE = 12;
/**
 * Asterisk feeds the ExternalMedia leg continuous 20ms frames for as long as the bridge
 * lives, so a gap this long means the call is gone — a hangup ARI never told us about.
 * Generous enough that a silent caller is never mistaken for a dead one.
 */
const RTP_SILENCE_TIMEOUT_MS = parseInt(process.env.SIP_RTP_SILENCE_TIMEOUT_MS) || 15000;
const RTP_WATCHDOG_INTERVAL_MS = 5000;
/** One RTP packet = 160 bytes of µ-law = 20ms of 8 kHz audio. */
const RTP_PACKET_BYTES = 160;
const RTP_PACKET_MS = 20;
/**
 * Outbound playout buffer bound, in packets. ElevenLabs synthesises far faster than realtime, so a
 * long reply legitimately sits here for tens of seconds — this is a playout buffer, not a jitter
 * buffer, and the old 500-packet (10s) cap was routinely exceeded by normal replies.
 * 3000 packets is 60 seconds.
 */
const MAX_RTP_QUEUE = parseInt(process.env.SIP_RTP_MAX_QUEUE) || 3000;
/** Never send more than this many packets in one catch-up tick. */
const RTP_MAX_CATCHUP_PACKETS = 10;
/** Extra silence after the RTP queue drains, so the last packet is actually heard. */
const END_CALL_DRAIN_GRACE_MS = 600;
/** Backstop: hang up even if the drain signal never arrives. */
const END_CALL_SAFETY_MS = 15000;
/** An agent asking to hang up this early in a call is hallucinating, not deciding. */
const END_CALL_MIN_CALL_MS = 10000;
/** Never hold a caller's queued utterance longer than this, whatever the speaking flags say. */
const MAX_QUEUE_HOLD_MS = 15000;
/**
 * Hang up a connected-but-silent call — caller put the phone down without hanging up,
 * went on hold, walked away. Independent of the RTP-silence watchdog above, which only
 * detects the media stopping entirely; Asterisk keeps sending RTP (silence) for as long
 * as the bridge exists, so this is the only thing that notices nobody is actually talking.
 */
const IDLE_TIMEOUT_MS = parseInt(process.env.CALL_IDLE_TIMEOUT_MS) || 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30000;
const IDLE_HANGUP_MESSAGE = "I haven't heard back from you, so I'll go ahead and end the call now. Goodbye.";

/**
 * SIP Voice Stream — Audio bridge between Asterisk ExternalMedia RTP and AI pipeline.
 *
 * This is the SIP equivalent of voice-stream.js (Twilio).
 * Audio format is identical: G.711 µ-law at 8000Hz.
 * Only the transport differs: raw RTP/UDP instead of Twilio WebSocket JSON.
 */
const AppointmentService = require('../appointment-tool-service');
const { narrateAppointmentResult } = require('../appointment-result-narration');
const { parseTransferTag, transferFailureSentence } = require('../../utils/human-transfer');
const { formatInTimeZone } = require('date-fns-tz');
const AdminSettings = require('../../models/AdminSettings');

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

/** Parse [[BOOK:...]] content to { date: 'YYYY-MM-DD', time: 'HH:mm', clientName: string } or null */
function parseBookDateTime(content) {
    if (!content || typeof content !== 'string') return null;
    const trimmed = content.trim();
    const pipeIdx = trimmed.indexOf('|');
    const dateTimePart = pipeIdx >= 0 ? trimmed.slice(0, pipeIdx).trim() : trimmed;
    const clientName = pipeIdx >= 0 ? trimmed.slice(pipeIdx + 1).trim() : '';
    const year = new Date().getFullYear();
    const isoMatch = dateTimePart.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (isoMatch) {
        const [, date, h, m] = isoMatch;
        return { date, time: `${h.padStart(2, '0')}:${m.padStart(2, '0')}`, clientName };
    }
    const { parse: parseDate, format: formatDate, isValid } = require('date-fns');
    const normalized = dateTimePart.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
    const withYear = normalized.includes(String(year)) ? normalized : `${normalized} ${year}`;
    const formats = [
        'EEEE, MMM d, HH:mm yyyy', 'MMMM d yyyy HH:mm', 'MMM d yyyy HH:mm', 'EEEE, MMM d, HH:mm', 'EEEE, MMM d yyyy HH:mm',
        'd MMM yyyy HH:mm', 'd MMM HH:mm', 'MMM d HH:mm', 'MMMM d HH:mm'
    ];
    for (const fmt of formats) {
        try {
            const dt = parseDate(withYear, fmt, new Date());
            if (isValid(dt)) return { date: formatDate(dt, 'yyyy-MM-dd'), time: formatDate(dt, 'HH:mm'), clientName };
        } catch (_) { }
    }
    return null;
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
        .replace(/\[\[TRANSFER:[^\]]*\]\]/g, '')
        .replace(/\s*\[\[(?:LIST|SLOTS|BOOK:|CANCEL:|END_CALL|TRANSFER:).*$/g, '')
        // Trailing incomplete cut mid-keyword e.g. " [[END_C" — the tag is emitted at the
        // very end of a reply, which is exactly where a stream chunk tends to split.
        .replace(/\s*\[\[[^\]]*$/g, '')
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

class SipVoiceStream {
    constructor({ userId, agentId, leadId, campaignId, direction, callId, rtpPort, testCall = false, testPhrase = '' }) {
        this.userId = userId;
        this.agentId = agentId;
        this.leadId = leadId;
        this.campaignId = campaignId;
        this.direction = direction || 'outbound';
        this.callId = callId;
        this.rtpPort = rtpPort;
        this.testCall = !!testCall;
        this.testPhrase = testPhrase || '';
        this.onTestComplete = null;

        // State
        this.settings = null;
        this.agent = null;
        this.lead = null;
        this.transcript = [];
        this.callErrors = [];
        this.isProcessing = false;
        this.greetingSent = false;
        this.isAISpeaking = false;
        this.interrupted = false;
        this.processingStartedAt = 0;
        this.active = false;
        this.bridgeReady = false;
        this.transcriptQueue = [];
        this.queueHeldSince = 0;   // when a queued turn started waiting for the agent to stop talking
        this.lastProcessedTranscript = "";
        this.lastProcessedAt = 0;
        this.lastSameTurnLogAt = 0;
        this.lastSameTurnText = '';
        this.lastInterimTranscript = "";
        this.lastInterimAt = 0;
        this.pendingPostInterruptUtterance = false;
        this.pendingPostInterruptTranscript = '';
        this.pendingPostInterruptTimer = null;
        this.firstChunkSentAt = 0;
        this.pendingVadInterrupt = false;
        this.pendingVadInterruptTimer = null;
        this.pendingIncompleteFinal = '';
        this.pendingIncompleteTimer = null;
        this.processDebounceTimer = null;
        this.lastVadAt = 0;
        this.kbSystemContent = '';
        this.turnTimings = null;
        this.lastQueuedAt = 0;

        // Per-agent Voice Quality & Conversation config (resolved in start())
        this.voiceQuality = null;

        // Voice Quality diagnostics — accumulated per call, written to CallLog at cleanup
        this._metrics = {
            turns: 0, interruptions: 0, falseVadEvents: 0, rtpQueueDrops: 0, ttsChunksSent: 0,
            llmFirstTokenSum: 0, ttsFirstTextSum: 0, firstAudioSum: 0, latencyCount: 0, maxFirstAudioMs: 0
        };

        // Connections
        this.udpSocket = null;
        this.dgConnection = null;
        this.elConnection = null;
        this.dgReady = false;
        this.elReady = false;
        this.isInitializingDg = false;
        this.isInitializingEl = false;
        this._dgHadConnection = false;
        this._elHadConnection = false;

        // RTP outbound state
        this.remoteAddress = null;
        this.remotePort = null;
        this.rtpSeq = 0;
        this.rtpTs = 0;
        this.rtpSSRC = Math.floor(Math.random() * 0xFFFFFFFF);
        this.rtpMarker = false;

        // RTP pacing queue (20ms per packet)
        this._rtpQueue = [];
        this._rtpTimer = null;
        this._rtpNextSendAt = 0;

        /** Set when the bridge goes up — the moment the caller can actually hear us. */
        this.answeredAt = null;

        // Hangup detection / agent-initiated hangup
        this.lastRtpAt = 0;
        this._rtpWatchdog = null;
        this.onMediaTimeout = null;
        this.onEndCall = null;
        /** Human Transfer — set by sip-manager once the call is tracked. See setTransferHandler. */
        this.transferHandler = null;
        /** True once the caller has been handed to a human and this engine is out of the bridge. */
        this.transferred = false;
        this._endCallPending = false;
        this._endCallScheduled = false;
        this._endCallFired = false;
        this._endCallSafetyTimer = null;

        // Idle (connected-but-silent) detection
        this.lastActivityAt = 0;
        this._idleHangupTriggered = false;
        this._idleWatchdog = null;
    }
    /** Per-agent turn-taking config, with hardcoded legacy values as the safety net. */
    _tt() {
        return this.voiceQuality?.turnTaking || {
            endpointingMs: DG_ENDPOINTING_MS,
            finalCompleteWaitMs: FINAL_COMPLETE_WAIT_MS,
            finalIncompleteWaitMs: FINAL_INCOMPLETE_WAIT_MS,
            minInterruptWords: 3, stabilizationMs: 2500, vadConfirmMs: 1200
        };
    }

    /** shouldInterrupt with this agent's sensitivity applied. */
    _shouldInterrupt(text) {
        return shouldInterrupt(text, { minWords: this._tt().minInterruptWords });
    }

    // ─── Error Tracking ───────────────────────────────────────

    _pushError(service, code, message) {
        this.callErrors.push({ service, code: String(code || ''), message, timestamp: new Date() });
        if (this.callId) {
            CallLog.findOneAndUpdate({ callSid: this.callId }, { $push: { errors: { service, code: String(code || ''), message } } }).catch(() => { });
        }
    }

    // ─── Lifecycle ───────────────────────────────────────────

    async start() {
        try {
            [this.settings, this.agent, this.lead] = await Promise.all([
                Settings.findOne({ userId: this.userId }),
                Agent.findOne({ _id: this.agentId, createdBy: this.userId }),
                Lead.findOne({ _id: this.leadId, createdBy: this.userId })
            ]);

            if (this.agent) this.voiceQuality = resolveVoiceQuality(this.agent);

            if (!this.settings || !this.agent) {
                const msg = 'Missing settings or agent configuration.';
                console.error(`❌ [SIP Stream] ${msg}`);
                this._pushError('system', 'missing_config', msg);
                return false;
            }
            if (!this.settings.elevenLabsKey) {
                const msg = 'Missing ElevenLabs API key. Please configure it in Settings.';
                console.error(`❌ [SIP Stream] ${msg}`);
                this._pushError('system', 'missing_keys', msg);
                return false;
            }
            if (!this.testCall && (!this.settings.deepgramKey || !this.settings.openRouterKey)) {
                const missing = [];
                if (!this.settings.deepgramKey) missing.push('Deepgram');
                if (!this.settings.openRouterKey) missing.push('OpenRouter');
                const msg = `Missing API keys: ${missing.join(', ')}. Please configure them in Settings.`;
                console.error(`❌ [SIP Stream] ${msg}`);
                this._pushError('system', 'missing_keys', msg);
                return false;
            }

            // Cache KB content once per call — avoids a Mongo roundtrip on every turn
            if (!this.testCall && this.agent.knowledgeBaseId) {
                try {
                    const KnowledgeBase = require('../../models/KnowledgeBase');
                    const { formatKnowledgeBaseContent } = require('../../utils/kb-formatter');
                    const kb = await KnowledgeBase.findById(this.agent.knowledgeBaseId);
                    if (kb) this.kbSystemContent = formatKnowledgeBaseContent(kb, this.agent.kbSettings || {});
                } catch (kbErr) {
                    console.error(`[SIP Stream] [${this.callId}] KB preload failed:`, kbErr.message);
                }
            }

            this.active = true;
            await this._openRtpSocket();
            // Defer Deepgram/ElevenLabs until bridge is ready (setBridgeReady). Opening them
            // while the call is still ringing causes idle timeouts and "WebSocket closed" before answer.
            // this._initDeepgram(); this._initElevenLabs(); — moved to setBridgeReady()

            // Seed CallLog
            await CallLog.findOneAndUpdate(
                { callSid: this.callId },
                {
                    userId: this.userId, agentId: this.agentId, leadId: this.leadId,
                    campaignId: this.campaignId, callSid: this.callId,
                    direction: this.direction, provider: 'sip',
                    status: 'in-progress', startTime: new Date(),
                    transcript: [
                        { role: 'system', content: this.agent.systemPrompt }
                    ]
                },
                { upsert: true }
            );

            this.startedAt = Date.now();
            console.log(`✅ [SIP Stream] Active — call ${this.callId} on UDP :${this.rtpPort}`);

            // Trigger Inbound Webhook + Email
            if (this.direction === 'inbound') {
                const inboundPayload = {
                    callSid: this.callId,
                    leadId: this.leadId,
                    direction: 'inbound',
                    provider: 'sip'
                };
                WebhookService.trigger(this.userId, 'inboundCall', inboundPayload);
                EmailService.trigger(this.userId, 'inboundCall', inboundPayload);
            }

            return true;
        } catch (err) {
            console.error('❌ [SIP Stream] Start failed:', err);
            this.cleanup();
            return false;
        }
    }

    async cleanup() {
        if (this._cleanedUp) return;
        this._cleanedUp = true;
        this.active = false;
        console.log(`🧹 [SIP] [${this.callId}] cleanup | transcriptLen=${this.transcript.length} queueLen=${this.transcriptQueue.length}`);
        if (this.pendingPostInterruptTimer) { clearTimeout(this.pendingPostInterruptTimer); this.pendingPostInterruptTimer = null; }
        if (this.pendingVadInterruptTimer) { clearTimeout(this.pendingVadInterruptTimer); this.pendingVadInterruptTimer = null; }
        if (this.pendingIncompleteTimer) { clearTimeout(this.pendingIncompleteTimer); this.pendingIncompleteTimer = null; }
        if (this.processDebounceTimer) { clearTimeout(this.processDebounceTimer); this.processDebounceTimer = null; }
        this.pendingVadInterrupt = false;
        this.pendingIncompleteFinal = '';
        if (this.abortController) { try { this.abortController.abort(); } catch (_) { } this.abortController = null; }

        // Stop RTP pacing timer and clear queue
        if (this._rtpTimer) { clearTimeout(this._rtpTimer); this._rtpTimer = null; }
        if (this._rtpWatchdog) { clearInterval(this._rtpWatchdog); this._rtpWatchdog = null; }
        if (this._idleWatchdog) { clearInterval(this._idleWatchdog); this._idleWatchdog = null; }
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        this._rtpQueue = [];
        this._rtpNextSendAt = 0;

        try { if (this.dgConnection) this.dgConnection.finish(); } catch (_) { }
        try {
            if (this.elConnection) {
                // terminate() works in ANY state (including CONNECTING), close() throws on CONNECTING
                this.elConnection.terminate();
            }
        } catch (_) { }
        this.dgConnection = null;
        this.elConnection = null;
        this.dgReady = false;
        this.elReady = false;
        try { if (this.udpSocket) this.udpSocket.close(); } catch (_) { }
        this.udpSocket = null;

        if (this.callId) {
            try {
                const endTime = new Date();
                // Step 3.2: Calculate duration in seconds. This must measure ANSWERED time —
                // startedAt is stamped in start(), before originateCall(), so using it would
                // bill the caller for dial + ring.
                const duration = computeDuration(this.answeredAt, this.startedAt);
                // A call that ended before any conversation happened (caller hung up
                // right after bridge, or TTS/STT never became ready) has an empty
                // transcript — mark it 'failed' rather than leaving it stuck 'in-progress'.
                const hadConversation = this.transcript.length > 0;

                const m = this._metrics;
                const avg = (sum) => m.latencyCount ? Math.round(sum / m.latencyCount) : 0;
                const updateData = {
                    status: hadConversation ? 'completed' : 'failed', transcript: this.transcript,
                    endTime, duration, provider: 'sip',
                    voiceMetrics: {
                        turns: m.turns,
                        interruptions: m.interruptions,
                        falseVadEvents: m.falseVadEvents,
                        rtpQueueDrops: m.rtpQueueDrops,
                        ttsChunksSent: m.ttsChunksSent,
                        avgLlmFirstTokenMs: avg(m.llmFirstTokenSum),
                        avgTtsFirstTextMs: avg(m.ttsFirstTextSum),
                        avgFirstAudioMs: avg(m.firstAudioSum),
                        maxFirstAudioMs: m.maxFirstAudioMs
                    }
                };

                // Only add recordingUrl if enabled in settings
                if (this.settings?.recordingEnabled !== false) {
                    updateData.recordingUrl = `${process.env.BASE_URL}/api/call-logs/${this.callId}/recording`;
                }

                const log = await CallLog.findOneAndUpdate(
                    { callSid: this.callId },
                    updateData,
                    { returnDocument: 'after' }
                );
                if (log && hadConversation && this.settings?.autoAnalysisEnabled) {
                    analyzeCallLog(log._id).catch(e => console.error('[SIP] Analysis err:', e));
                }

                // Trigger Call Completed Webhook + Email
                if (log) {
                    const completedPayload = {
                        callSid: this.callId,
                        leadId: this.leadId,
                        campaignId: this.campaignId,
                        direction: this.direction,
                        duration: duration,
                        status: updateData.status,
                        provider: 'sip'
                    };
                    WebhookService.trigger(this.userId, 'callCompleted', completedPayload);
                    EmailService.trigger(this.userId, 'callCompleted', completedPayload);
                }

                // Check if all calls in the campaign are done → mark campaign completed
                if (log && log.campaignId) {
                    try {
                        const Campaign = require('../../models/Campaign');
                        const campaign = await Campaign.findById(log.campaignId);
                        if (campaign && campaign.status === 'running') {
                            const totalLeads = campaign.leadIds.length;
                            const finishedCalls = await CallLog.countDocuments({
                                campaignId: log.campaignId,
                                status: { $in: ['completed', 'failed', 'busy', 'no-answer', 'canceled'] }
                            });
                            if (finishedCalls >= totalLeads) {
                                await Campaign.findByIdAndUpdate(log.campaignId, { status: 'completed' });

                                // Trigger Campaign Completed Webhook
                                WebhookService.trigger(this.userId, 'campaignCompleted', {
                                    campaignId: log.campaignId,
                                    name: campaign.name,
                                    status: 'completed'
                                });

                                console.log(`[SIP] Campaign ${log.campaignId} marked as completed (${finishedCalls}/${totalLeads} calls done)`);
                            }
                        }
                    } catch (campErr) {
                        console.error('[SIP] Campaign completion check err:', campErr.message);
                    }
                }
            } catch (e) { console.error('[SIP] Log save err:', e); }
        }
    }

    // ─── RTP Socket ──────────────────────────────────────────

    _openRtpSocket() {
        return new Promise((resolve, reject) => {
            this.udpSocket = dgram.createSocket('udp4');

            this.udpSocket.on('message', (msg, rinfo) => {
                this.lastRtpAt = Date.now();
                if (!this.remoteAddress) {
                    this.remoteAddress = rinfo.address;
                    this.remotePort = rinfo.port;
                    console.log(`📡 [SIP Stream] [${this.callId}] RTP Source Identified: ${rinfo.address}:${rinfo.port}`);
                    this._startRtpWatchdog();
                }
                if (msg.length > RTP_HEADER_SIZE) {
                    const payload = msg.slice(RTP_HEADER_SIZE);
                    if (this.dgReady && this.dgConnection) this.dgConnection.send(payload);
                }
            });

            this.udpSocket.on('error', (err) => {
                console.error(`❌ [SIP Stream] UDP err port ${this.rtpPort}:`, err);
                if (!this.active) { reject(err); return; }
                console.error(`❌ [SIP] [${this.callId}] UDP socket error during active call — cleaning up`);
                this.cleanup();
            });

            this.udpSocket.bind(this.rtpPort, '0.0.0.0', () => {
                console.log(`🎧 [SIP Stream] RTP listening on :${this.rtpPort}`);
                resolve();
            });
        });
    }

    /**
     * Queue µ-law audio for paced RTP transmission (20ms per packet).
     * Without pacing, all packets blast out at once and Asterisk's jitter
     * buffer overflows — the callee hears only the first few milliseconds.
     */
    _sendRtp(mulawBuf) {
        if (!this.udpSocket || !this.remoteAddress) return;

        // If queue is empty, this is the start of a talkspurt
        if (this._rtpQueue.length === 0) {
            this.rtpMarker = true;
        }

        for (let i = 0; i < mulawBuf.length; i += RTP_PACKET_BYTES) {
            this._rtpQueue.push(mulawBuf.slice(i, Math.min(i + RTP_PACKET_BYTES, mulawBuf.length)));
        }

        // Bound the buffer, but never throw the backlog away: clearing it deleted whole seconds
        // out of the middle of the agent's sentence, which is what the caller actually heard.
        // Past the bound, drop only the excess — and only the oldest, which has been superseded
        // by everything queued behind it. Barge-in remains the one path that empties the queue.
        if (this._rtpQueue.length > MAX_RTP_QUEUE) {
            const excess = this._rtpQueue.length - MAX_RTP_QUEUE;
            this._rtpQueue.splice(0, excess);
            this._metrics.rtpQueueDrops += excess;
            this.rtpMarker = true;
            if (!this._rtpOverflowLogged) {
                this._rtpOverflowLogged = true;
                console.warn(`⚠️ [SIP] [${this.callId}] RTP playout buffer at its ${MAX_RTP_QUEUE}-packet (${Math.round(MAX_RTP_QUEUE * RTP_PACKET_MS / 1000)}s) bound — dropping ${excess} oldest packet(s). The agent's reply is longer than the buffer.`);
            }
        }

        // Start draining if not already running
        if (!this._rtpTimer) {
            this._drainRtpQueue();
        }
    }

    _drainRtpQueue() {
        if (this._rtpQueue.length === 0 || !this.udpSocket || !this.remoteAddress) {
            this._rtpTimer = null;
            this._rtpNextSendAt = 0;
            // Queue fully drained — AI finished speaking
            if (this.isAISpeaking) {
                const wasTestCall = this.testCall;
                const onDone = this.onTestComplete;
                setTimeout(() => {
                    this.isAISpeaking = false;
                    if (wasTestCall && typeof onDone === 'function') {
                        this.onTestComplete = null;
                        onDone();
                    }
                }, 300);
            }
            // The agent asked to hang up and its closing line has now been sent. Re-check
            // after a short settle so an inter-chunk gap can't cut the goodbye off.
            if (this._endCallPending && !this._endCallScheduled && !this._endCallFired) {
                this._endCallScheduled = true;
                setTimeout(() => {
                    this._endCallScheduled = false;
                    if (this._rtpQueue.length > 0) return; // more audio arrived — wait for the next drain
                    this._fireEndCall('playback finished');
                }, END_CALL_DRAIN_GRACE_MS);
            }
            return;
        }

        // Paced against a wall-clock deadline rather than a fixed 20ms sleep. setTimeout never
        // fires early and always adds a little scheduling overhead, so a self-rescheduling
        // `setTimeout(..., 20)` runs slower than realtime and the queue creeps upward for the
        // whole call — which is what pushed a normal reply past the old cap in the first place.
        const now = Date.now();
        if (!this._rtpNextSendAt || this._rtpNextSendAt < now - 1000) this._rtpNextSendAt = now;

        let sent = 0;
        while (this._rtpQueue.length > 0 && this._rtpNextSendAt <= Date.now() && sent < RTP_MAX_CATCHUP_PACKETS) {
            this._sendRtpPacket(this._rtpQueue.shift());
            this._rtpNextSendAt += RTP_PACKET_MS;
            sent++;
        }

        if (this._rtpQueue.length === 0) { this._drainRtpQueue(); return; }
        this._rtpTimer = setTimeout(() => this._drainRtpQueue(), Math.max(0, this._rtpNextSendAt - Date.now()));
    }

    /** Packetize one 20ms µ-law chunk and put it on the wire. */
    _sendRtpPacket(chunk) {
        const pkt = Buffer.alloc(RTP_HEADER_SIZE + chunk.length);

        const markerBit = this.rtpMarker ? 0x80 : 0x00;
        this.rtpMarker = false; // Reset for next packets in this burst

        pkt[0] = 0x80;                                     // V=2
        pkt[1] = markerBit | 0x00;                         // M + PT=0 (PCMU)
        pkt.writeUInt16BE(this.rtpSeq & 0xFFFF, 2);        // Sequence
        pkt.writeUInt32BE(this.rtpTs & 0xFFFFFFFF, 4);     // Timestamp
        pkt.writeUInt32BE(this.rtpSSRC, 8);                 // SSRC
        chunk.copy(pkt, RTP_HEADER_SIZE);

        this.udpSocket.send(pkt, this.remotePort, this.remoteAddress);
        this.rtpSeq++;
        this.rtpTs += RTP_PACKET_BYTES;
    }

    /**
     * Armed once the first RTP packet arrives — never before, so a call that never gets
     * media is left to the setup-race handling in sip-manager instead of being killed here.
     */
    _startRtpWatchdog() {
        if (this._rtpWatchdog) return;
        this._rtpWatchdog = setInterval(() => {
            if (!this.active || !this.lastRtpAt) return;
            const gap = Date.now() - this.lastRtpAt;
            if (gap > RTP_SILENCE_TIMEOUT_MS) {
                console.warn(`📵 [SIP Stream] [${this.callId}] No caller RTP for ${gap}ms — treating as hangup`);
                clearInterval(this._rtpWatchdog);
                this._rtpWatchdog = null;
                if (this.onMediaTimeout) this.onMediaTimeout();
            }
        }, RTP_WATCHDOG_INTERVAL_MS);
        if (typeof this._rtpWatchdog.unref === 'function') this._rtpWatchdog.unref();
    }

    /**
     * The agent emitted [[TRANSFER:destination_id]]. Dial the human and wait for the
     * outcome — the caller stays bridged to this agent the whole time, so a destination
     * that is busy or does not answer simply lands back in this same conversation.
     *
     * Returns true when a transfer was attempted (handled this turn), false otherwise.
     */
    async _handleTransferCommand(fullReply, userInput) {
        if (!this.transferHandler || this.interrupted) return false;
        const destinationId = parseTransferTag(fullReply);
        if (destinationId === null) return false;

        console.log(`↪️  [SIP] [${this.callId}] Agent requested transfer to "${destinationId || '(default)'}"`);
        let rawResult;
        try {
            rawResult = await this.transferHandler(destinationId, userInput || '');
        } catch (e) {
            console.error(`[SIP] [${this.callId}] Transfer failed:`, e.message);
            rawResult = JSON.stringify({ ok: false, code: 'FAILED' });
        }

        this.transcript.push({ role: 'system', content: `COMMAND RESULT: ${rawResult}` });

        const sentence = transferFailureSentence(rawResult);
        // Empty means the handover succeeded: the caller is with a human and this engine
        // has already been detached from the bridge, so it must stay silent.
        if (!sentence || this.interrupted || this.transferred) return true;

        const toSpeak = await narrateAppointmentResult({
            rawResult: sentence,
            agentLanguage: this.agent.language,
            lastUserUtterance: userInput,
            isListOrSlots: false,
            openRouterKey: this.settings.openRouterKey,
            model: openRouterModel,
            domain: 'transfer',
        }).catch(() => sentence);

        if (!toSpeak || this.interrupted) return true;

        // Same socket refresh the appointment path uses — the previous TTS stream was
        // closed out when the agent's "putting you through" line finished.
        if (this.elConnection) {
            try { this.elConnection.terminate(); } catch (_) { }
            this.elConnection = null;
        }
        this.elReady = false;
        await this._initElevenLabs();
        let attempts = 0;
        while (!this.elReady && attempts < 15) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        if (this.elReady && !this.interrupted) {
            this._sendToTTS(toSpeak, true);
            this.transcript.push({ role: 'assistant', content: toSpeak });
            this._touchActivity();
        }
        return true;
    }

    setOnEndCall(cb) {
        this.onEndCall = cb;
    }

    /**
     * Enable Human Transfer for this call. `fn(destinationId, reason)` resolves the JSON
     * string that transferCall() produced.
     */
    setTransferHandler(fn) {
        this.transferHandler = fn;
    }

    /**
     * The caller has been handed to a human and this engine's ExternalMedia leg is out of
     * the bridge. Stop everything that reads the resulting silence as a hangup — the RTP
     * and idle watchdogs would otherwise kill the human's call within seconds — and close
     * the provider sockets so they are not billed for the rest of the conversation.
     *
     * The CallLog is deliberately NOT written here: the call is still up, and cleanup()
     * still runs on endCall() with the full duration and the transcript intact.
     */
    detachForTransfer() {
        if (this.transferred) return;
        this.transferred = true;
        this.active = false;
        this.onMediaTimeout = null;
        this.onEndCall = null;
        console.log(`🔇 [SIP] [${this.callId}] Detached from the bridge — caller is with a human`);

        if (this.abortController) { try { this.abortController.abort(); } catch (_) { } this.abortController = null; }
        if (this._rtpTimer) { clearTimeout(this._rtpTimer); this._rtpTimer = null; }
        if (this._rtpWatchdog) { clearInterval(this._rtpWatchdog); this._rtpWatchdog = null; }
        if (this._idleWatchdog) { clearInterval(this._idleWatchdog); this._idleWatchdog = null; }
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        this._rtpQueue = [];
        this._rtpNextSendAt = 0;

        try { if (this.dgConnection) this.dgConnection.finish(); } catch (_) { }
        try { if (this.elConnection) this.elConnection.terminate(); } catch (_) { }
        this.dgConnection = null;
        this.elConnection = null;
        this.dgReady = false;
        this.elReady = false;
    }

    /**
     * The agent emitted [[END_CALL]]. Refuse if the model looks like it's hallucinating
     * (opening seconds, or before the caller has said anything) — the idle-timeout and
     * safety-timer paths bypass these guards since they aren't model-decided.
     */
    _scheduleEndCall() {
        if (this._endCallPending || this._endCallFired) return;
        if (!this.answeredAt || Date.now() - this.answeredAt < END_CALL_MIN_CALL_MS) {
            console.warn(`⚠️ [SIP Stream] [${this.callId}] Ignoring [[END_CALL]] — call is only seconds old`);
            return;
        }
        if (!this.transcript.some(t => t.role === 'user')) {
            console.warn(`⚠️ [SIP Stream] [${this.callId}] Ignoring [[END_CALL]] — caller has not spoken yet`);
            return;
        }
        this._armEndCall('agent requested');
    }

    /**
     * Its closing line is still queued for TTS, so arm the hangup and let the RTP drain
     * fire it — with a safety timer in case it never drains.
     */
    _armEndCall(reason) {
        if (this._endCallPending || this._endCallFired) return;
        this._endCallPending = true;
        console.log(`📴 [SIP Stream] [${this.callId}] Ending call armed (${reason}) — waiting for playback to finish`);
        this._endCallSafetyTimer = setTimeout(() => this._fireEndCall('safety timeout'), END_CALL_SAFETY_MS);
    }

    /** Any real speech, either side — resets the idle clock and re-arms future detection. */
    _touchActivity() {
        this.lastActivityAt = Date.now();
        this._idleHangupTriggered = false;
    }

    _startIdleWatchdog() {
        if (this._idleWatchdog || this.testCall) return; // test calls end themselves within seconds
        this._idleWatchdog = setInterval(() => {
            if (!this.active || this._idleHangupTriggered || this._endCallPending || this._endCallFired) return;
            if (Date.now() - this.lastActivityAt < IDLE_TIMEOUT_MS) return;
            this._idleHangupTriggered = true;
            console.log(`💤 [SIP Stream] [${this.callId}] No activity for ${IDLE_TIMEOUT_MS}ms — ending call`);
            this.transcript.push({ role: 'assistant', content: IDLE_HANGUP_MESSAGE });
            this._sendToTTS(IDLE_HANGUP_MESSAGE, true);
            this._armEndCall('idle timeout');
        }, IDLE_CHECK_INTERVAL_MS);
        if (typeof this._idleWatchdog.unref === 'function') this._idleWatchdog.unref();
    }

    /** Caller spoke over the goodbye — they are not done, so stay on the line. */
    _cancelEndCall() {
        if (!this._endCallPending || this._endCallFired) return;
        this._endCallPending = false;
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        console.log(`🙅 [SIP Stream] [${this.callId}] End of call cancelled — caller spoke again`);
    }

    _fireEndCall(why) {
        if (this._endCallFired || !this._endCallPending) return;
        this._endCallFired = true;
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        console.log(`📴 [SIP Stream] [${this.callId}] Ending call (${why})`);
        if (this.onEndCall) this.onEndCall();
    }

    _maybeInterrupt(source, currentInterim) {
        if (!this.active) return;
        if (source === 'vad') {
            const now = Date.now();
            if (now - this.lastVadAt < 200) return;
            this.lastVadAt = now;
        }
        const timeSinceProcessingStart = Date.now() - this.processingStartedAt;
        const isGracePeriodEffect = this.isProcessing && !this.isAISpeaking && timeSinceProcessingStart < 300;
        let wouldInterrupt = (this.isAISpeaking || this.isProcessing) && !isGracePeriodEffect;

        const STABILIZATION_MS = this._tt().stabilizationMs;
        const sinceFirstChunk = this.firstChunkSentAt ? Date.now() - this.firstChunkSentAt : 0;
        const inStabilization = this.firstChunkSentAt && sinceFirstChunk < STABILIZATION_MS;
        const currentText = (currentInterim || '').trim();
        const lastText = (this.lastInterimTranscript || '').trim();
        const recentLast = lastText && (Date.now() - this.lastInterimAt < 2000) ? lastText : '';
        // Shared policy (utils/turn-taking.js): more than the agent's word threshold, or an
        // explicit stop command. "yes"/"ok"/"hello" used to force an interrupt here; they are
        // answers, not interruptions, and are queued by the normal Final path instead.
        const hasSubstantialUtterance = this._shouldInterrupt(currentText) || this._shouldInterrupt(recentLast);
        if (wouldInterrupt && inStabilization && !hasSubstantialUtterance) {
            console.log(`🔇 [SIP] [${this.callId}] Interrupt skipped (${source}): stabilization window (${sinceFirstChunk}ms < ${STABILIZATION_MS}ms), utterance too short`);
            return;
        }

        if (!wouldInterrupt) {
            if (this.isAISpeaking || this.isProcessing) {
                console.log(`🔇 [SIP] [${this.callId}] Interrupt skipped (${source}): gracePeriod=${isGracePeriodEffect}, timeSinceStart=${timeSinceProcessingStart}ms`);
            }
            return;
        }
        const toQueue = (currentInterim && currentInterim.trim().length >= 2)
            ? currentInterim.trim()
            : (this.lastInterimTranscript && (Date.now() - this.lastInterimAt < 2000) ? this.lastInterimTranscript.trim() : '');
        const MIN_INTERRUPT_CHARS = 3;
        const meetsMinToInterrupt = toQueue.length >= MIN_INTERRUPT_CHARS && this._shouldInterrupt(toQueue);
        if (toQueue.length >= 2 && toQueue === this.lastProcessedTranscript && (Date.now() - this.lastProcessedAt < 3000)) {
            const now = Date.now();
            if (toQueue !== this.lastSameTurnText || now - this.lastSameTurnLogAt > 2000) {
                console.log(`🔇 [SIP] [${this.callId}] Interrupt skipped (${source}): same as current turn, keeping response`);
                this.lastSameTurnLogAt = now;
                this.lastSameTurnText = toQueue;
            }
            return;
        }
        console.log(`🔇 [SIP] [${this.callId}] Interruption (${source}): isAISpeaking=${this.isAISpeaking}, isProcessing=${this.isProcessing}, timeSinceStart=${timeSinceProcessingStart}ms`);
        if (meetsMinToInterrupt) {
            this._stopAISpeaking();
            if (this.pendingPostInterruptTimer) { clearTimeout(this.pendingPostInterruptTimer); this.pendingPostInterruptTimer = null; }
            this.pendingPostInterruptTranscript = '';
            this.pendingPostInterruptUtterance = true;
            const recentlyProcessed = toQueue === this.lastProcessedTranscript && (Date.now() - this.lastProcessedAt < 3000);
            const alreadyQueued = this.transcriptQueue.length > 0 && this.transcriptQueue[this.transcriptQueue.length - 1] === toQueue;
            if (!recentlyProcessed && !alreadyQueued) {
                console.log(`📥 [SIP] [${this.callId}] Queuing interrupted utterance: "${toQueue.substring(0, 50)}${toQueue.length > 50 ? '...' : ''}" (queueLen=${this.transcriptQueue.length})`);
                this.lastInterimTranscript = '';
                this.pendingPostInterruptUtterance = false;
                this._queueTranscript(toQueue);
            } else {
                console.log(`📥 [SIP] [${this.callId}] Interrupt utterance not queued: recentlyProcessed=${recentlyProcessed}, alreadyQueued=${alreadyQueued}`);
                if (recentlyProcessed) this.pendingPostInterruptUtterance = false;
            }
        } else {
            if (source === 'vad') {
                const VAD_CONFIRM_MS = this._tt().vadConfirmMs;
                if (this.pendingVadInterruptTimer) { clearTimeout(this.pendingVadInterruptTimer); this.pendingVadInterruptTimer = null; }
                this.pendingVadInterrupt = true;
                this.pendingVadInterruptTimer = setTimeout(() => {
                    this.pendingVadInterruptTimer = null;
                    if (!this.active) return;
                    this.pendingVadInterrupt = false;
                    this._metrics.falseVadEvents++;
                    console.log(`🔇 [SIP] [${this.callId}] VAD deferred: no transcript in ${VAD_CONFIRM_MS}ms, ignoring (false VAD)`);
                }, VAD_CONFIRM_MS);
                console.log(`📥 [SIP] [${this.callId}] VAD deferred: waiting ${VAD_CONFIRM_MS}ms for transcript before stopping`);
            } else if (toQueue.length > 0) {
                // We have the caller's words and they are under the interrupt bar (a one or two
                // word answer like "yes"). Leave the agent speaking — the Final path queues this
                // and answers it once the agent has finished.
                console.log(`🔇 [SIP] [${this.callId}] Interrupt skipped (${source}): "${toQueue.substring(0, 30)}" is under the interrupt bar, letting agent finish`);
            } else {
                this._stopAISpeaking();
                if (this.pendingPostInterruptTimer) { clearTimeout(this.pendingPostInterruptTimer); this.pendingPostInterruptTimer = null; }
                this.pendingPostInterruptTranscript = '';
                this.pendingPostInterruptUtterance = true;
                console.log(`📥 [SIP] [${this.callId}] Interrupt: no text to queue (toQueue.len=${toQueue.length}), pendingPostInterruptUtterance=true`);
            }
        }
    }

    // ─── Deepgram (STT) ─────────────────────────────────────

    _initDeepgram() {
        if (this.isInitializingDg) return;
        if (this.dgConnection && (this.dgConnection.readyState === 1 || this.dgConnection.readyState === 0)) return;

        this.isInitializingDg = true;
        const dg = createClient(this.settings.deepgramKey);
        const dgLanguage = this.agent.language === 'multi' ? 'multi' : (this.agent.language || 'en-US');

        // Use specialized phonecall models for English, fallback to nova-3 for ALL other languages.
        // Nova-2-phonecall is optimized for telephony but lacks support for many global languages.
        // Nova-3 is superior for multilingual/global language support and real-time performance.
        const phoneSupported = ['en', 'en-US', 'en-GB', 'en-AU', 'en-IN'];
        const selectedModel = phoneSupported.includes(dgLanguage) ? 'nova-2-phonecall' : 'nova-3';
        console.log(`🔌 [SIP] Deepgram Model: ${selectedModel}, Language: ${dgLanguage}`);

        this.dgConnection = dg.listen.live({
            model: selectedModel, language: dgLanguage, smart_format: true,
            encoding: 'mulaw', sample_rate: 8000, endpointing: this._tt().endpointingMs,
            interim_results: true,
            vad_events: true, // Enable Voice Activity Detection events
            keepAlive: true,
        });

        this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
            this.isInitializingDg = false;
            if (!this.active) { try { this.dgConnection.finish(); } catch (_) { } return; }
            this.dgReady = true;
            console.log(`🟢 [Deepgram] [${this.callId}] Connection Opened`);
            this._checkReady();
        });

        const onTranscript = (data) => {
            if (!this.active) return;

            if (data && data.type === 'SpeechStarted') {
                console.log(`🎤 [SIP] [${this.callId}] Deepgram SpeechStarted (VAD)`);
                this._maybeInterrupt('vad');
                return;
            }

            const interimTranscript = (data.channel?.alternatives?.[0]?.transcript || "").trim();
            const rec = data.channel?.alternatives?.[0]?.transcript;
            if (this.pendingVadInterrupt && rec) {
                // A transcript arrived to confirm the VAD hit, but it only stops the agent if it
                // clears the interrupt bar — otherwise the VAD fired on a backchannel or an echo.
                if (this._shouldInterrupt(rec)) {
                    if (this.pendingVadInterruptTimer) { clearTimeout(this.pendingVadInterruptTimer); this.pendingVadInterruptTimer = null; }
                    this.pendingVadInterrupt = false;
                    this._stopAISpeaking();
                    console.log(`📥 [SIP] [${this.callId}] VAD confirmed by transcript, stopping AI`);
                }
            }
            if (rec && !data.is_final) {
                this.lastInterimTranscript = rec;
                this.lastInterimAt = Date.now();
            }
            if (interimTranscript.length > 3) {
                this._maybeInterrupt('interim', interimTranscript);
            }

            if (!rec) return;

            if (data.is_final) {
                console.log(`👤 [Deepgram] [${this.callId}] Final Transcript: "${rec}"`);
                if (this.pendingPostInterruptTimer) { clearTimeout(this.pendingPostInterruptTimer); this.pendingPostInterruptTimer = null; }
                this.pendingPostInterruptTranscript = '';
                this.pendingPostInterruptUtterance = false;
                const trimmed = rec.trim();
                if (this.pendingIncompleteFinal && trimmed === this.pendingIncompleteFinal) {
                    console.log(`♻️ [SIP] [${this.callId}] Ignoring duplicate Final: "${trimmed.substring(0, 40)}..."`);
                    return;
                }
                const hadPending = !!this.pendingIncompleteFinal;
                const merged = hadPending ? (this.pendingIncompleteFinal + ' ' + trimmed).trim() : trimmed;
                if (merged) {
                    const looksComplete = /[.?!]$/.test(merged);
                    const newWordCount = (trimmed.match(/\S+/g) || []).length;
                    const isShortContinuation = newWordCount <= 3 && trimmed.length <= 40;
                    // Complete sentence, or a long continuation after an earlier wait → short guard window;
                    // otherwise wait longer in case the user is mid-thought. Both windows are extended by new speech.
                    const waitMs = (looksComplete || (hadPending && !isShortContinuation))
                        ? this._tt().finalCompleteWaitMs
                        : this._tt().finalIncompleteWaitMs;
                    this._schedulePendingFinal(merged, waitMs);
                }
                this.lastInterimTranscript = '';
            } else {
                if (rec.length > 3) console.log(`👤 [Deepgram] [${this.callId}] Interim: "${rec}"`);
                // User is still speaking — push back any pending final dispatch so we never answer mid-utterance
                if (this.pendingIncompleteTimer && rec.trim().length >= 2) {
                    this._schedulePendingFinal(this.pendingIncompleteFinal, this._tt().finalIncompleteWaitMs);
                }
                if (this.pendingPostInterruptUtterance && rec.trim().length >= 2 && !this.isProcessing) {
                    const trimmed = rec.trim();
                    if (trimmed.length > (this.pendingPostInterruptTranscript || '').length) {
                        this.pendingPostInterruptTranscript = trimmed;
                    }
                    if (!this.pendingPostInterruptTimer) {
                        const POST_INTERRUPT_DEBOUNCE_MS = 800;
                        this.pendingPostInterruptTimer = setTimeout(() => {
                            this.pendingPostInterruptTimer = null;
                            if (!this.active) return;
                            if (this.pendingPostInterruptTranscript.length >= 2) {
                                console.log(`📥 [SIP] [${this.callId}] Queuing post-interrupt (debounced): "${this.pendingPostInterruptTranscript.substring(0, 50)}${this.pendingPostInterruptTranscript.length > 50 ? '...' : ''}"`);
                                this.pendingPostInterruptUtterance = false;
                                this._queueTranscript(this.pendingPostInterruptTranscript);
                            }
                            this.pendingPostInterruptTranscript = '';
                        }, POST_INTERRUPT_DEBOUNCE_MS);
                    }
                } else if (this.pendingPostInterruptUtterance && rec.trim().length >= 2 && this.isProcessing) {
                    console.log(`📥 [SIP] [${this.callId}] Post-interrupt interim deferred (isProcessing=true)`);
                }
            }
        };

        // NOTE: LiveTranscriptionEvents.Transcript === 'Results' — registering both would run the handler twice per event
        this.dgConnection.on(LiveTranscriptionEvents.Transcript, onTranscript);
        this.dgConnection.on('SpeechStarted', () => this._maybeInterrupt('vad'));
        this.dgConnection.on(LiveTranscriptionEvents.Error, (e) => {
            this.isInitializingDg = false;
            console.error(`🔴 [Deepgram] [${this.callId}] Error:`, e);
            this._pushError('deepgram', 'connection_error', `Speech recognition error: ${e?.message || 'Connection failed'}`);
        });
        this.dgConnection.on(LiveTranscriptionEvents.Close, () => {
            console.log(`⚪ [Deepgram] [${this.callId}] Connection Closed`);
            this.dgReady = false;
            this._dgHadConnection = true;
            if (this.active && !this.isInitializingDg) {
                console.log(`🔄 [Deepgram] [${this.callId}] Reconnecting (call still active)...`);
                setTimeout(() => {
                    if (!this.active || this.isInitializingDg) return;
                    this._initDeepgram();
                }, 500);
            }
        });
    }

    static LLM_DEBOUNCE_MS = 200;

    /**
     * A queued turn must wait for the agent to stop TALKING, not just to stop thinking.
     * isProcessing clears when the LLM stream ends, but the RTP queue still holds every
     * remaining word — dispatching then makes the agent answer over its own voice. An
     * utterance that cleared the interrupt bar already stopped playback, so this only ever
     * holds the short ones we deliberately let the agent talk through.
     */
    _busyTalking() {
        if (!(this.isProcessing || this.isAISpeaking || this._rtpQueue.length > 0)) {
            this.queueHeldSince = 0;
            return false;
        }
        // Safety valve: never hold the caller's words indefinitely if a speaking flag sticks.
        if (!this.queueHeldSince) this.queueHeldSince = Date.now();
        if (Date.now() - this.queueHeldSince > MAX_QUEUE_HOLD_MS) {
            console.warn(`⏰ [SIP] [${this.callId}] Held turn exceeded ${MAX_QUEUE_HOLD_MS}ms — dispatching anyway`);
            this.queueHeldSince = 0;
            return false;
        }
        return true;
    }

    _processNextInQueue() {
        if (this.processDebounceTimer) { clearTimeout(this.processDebounceTimer); this.processDebounceTimer = null; }
        if (!this.active || this.transcriptQueue.length === 0) return;
        if (this._busyTalking()) { this._scheduleProcessNext(); return; }
        const next = this.transcriptQueue.shift();
        this.lastProcessedTranscript = next;
        this.lastProcessedAt = Date.now();
        console.log(`📤 [SIP] [${this.callId}] Processing immediately: "${next.substring(0, 40)}..."`);
        this._processConversation(next);
    }

    _scheduleProcessNext() {
        if (!this.active) return;
        if (this.processDebounceTimer) { clearTimeout(this.processDebounceTimer); this.processDebounceTimer = null; }
        if (this.transcriptQueue.length === 0) return;
        const debounceMs = SipVoiceStream.LLM_DEBOUNCE_MS;
        this.processDebounceTimer = setTimeout(() => {
            this.processDebounceTimer = null;
            if (!this.active || this.transcriptQueue.length === 0) return;
            // Still talking — re-arm rather than answer over the agent.
            if (this._busyTalking()) { this._scheduleProcessNext(); return; }
            const next = this.transcriptQueue.shift();
            this.lastProcessedTranscript = next;
            this.lastProcessedAt = Date.now();
            console.log(`📤 [SIP] [${this.callId}] Processing (debounced ${debounceMs}ms): "${next.substring(0, 40)}..."`);
            this._processConversation(next);
        }, debounceMs);
    }

    /** Hold a Final in a short cancellable window before dispatch; new speech extends or merges into it. */
    _schedulePendingFinal(text, waitMs) {
        this.pendingIncompleteFinal = text;
        if (this.pendingIncompleteTimer) clearTimeout(this.pendingIncompleteTimer);
        this.pendingIncompleteTimer = setTimeout(() => {
            this.pendingIncompleteTimer = null;
            if (!this.active) return;
            if (this.pendingIncompleteFinal) {
                console.log(`📥 [SIP] [${this.callId}] Queuing after ${waitMs}ms final debounce: "${this.pendingIncompleteFinal.substring(0, 40)}..."`);
                this._queueTranscript(this.pendingIncompleteFinal);
                this.pendingIncompleteFinal = '';
            }
        }, waitMs);
    }

    _queueTranscript(text) {
        const now = Date.now();
        if (text === this.lastProcessedTranscript && (now - this.lastProcessedAt < 3000)) {
            console.log(`♻️ [SIP] [${this.callId}] Ignoring duplicate transcript (recent): "${text.substring(0, 40)}..." (${now - this.lastProcessedAt}ms ago)`);
            return;
        }
        if (this.transcriptQueue.length > 0 && this.transcriptQueue[this.transcriptQueue.length - 1] === text) {
            console.log(`♻️ [SIP] [${this.callId}] Ignoring duplicate in queue (same as tail): "${text.substring(0, 40)}..."`);
            return;
        }

        if (this.transcriptQueue.length >= 10) {
            const dropped = this.transcriptQueue.shift();
            console.warn(`⚠️ [SIP] [${this.callId}] Queue full, dropping oldest: "${dropped.substring(0, 30)}..."`);
        }
        this.lastQueuedAt = now;
        this.transcriptQueue.push(text);
        const queueLen = this.transcriptQueue.length;
        if (!this.isProcessing) {
            this._processNextInQueue();
        } else {
            console.log(`📥 [SIP] [${this.callId}] AI busy, transcript queued (queueLen=${queueLen}): "${text.substring(0, 30)}..."`);
        }
    }

    _stopAISpeaking() {
        console.log(`🛑 [SIP] [${this.callId}] stopAISpeaking: isAISpeaking=${this.isAISpeaking}, hadAbort=${!!this.abortController}, hadEL=${!!this.elConnection}`);
        if (this.isAISpeaking || this.isProcessing) this._metrics.interruptions++;
        this._touchActivity();
        this._cancelEndCall();
        this.isAISpeaking = false;
        this.interrupted = true;
        this._rtpQueue = [];
        this._rtpNextSendAt = 0;
        if (this._rtpTimer) {
            clearTimeout(this._rtpTimer);
            this._rtpTimer = null;
        }

        // 2. Instant LLM & TTS Brake (Cost Savings)
        if (this.abortController) {
            console.log(`🛑 [SIP] [${this.callId}] Aborting LLM stream...`);
            this.abortController.abort();
            this.abortController = null;
        }

        if (this.elConnection) {
            try {
                this.elConnection.send(JSON.stringify({ text: "" }));
                this.elConnection.terminate();
            } catch (_) { }
            this.elReady = false;
            console.log(`🛑 [SIP] [${this.callId}] ElevenLabs connection terminated`);
        }
    }

    // ─── ElevenLabs (TTS) ────────────────────────────────────

    async _initElevenLabs() {
        if (this.isInitializingEl) return;
        if (this.elConnection && (this.elConnection.readyState === WebSocket.OPEN || this.elConnection.readyState === WebSocket.CONNECTING)) return;

        this.isInitializingEl = true;
        try {
            if (this.elConnection) {
                this.elConnection.terminate();
                this.elConnection = null;
            }

            const vid = this.agent?.voiceId || '21m00Tcm4TlvDq8ikWAM';
            // Per-agent model + voice_settings (utils/voice-quality.js). 'auto' keeps the
            // legacy rule: Flash v2.5 (~75ms, 32 languages) for non-English, Turbo v2.5 for English.
            const vq = this.voiceQuality || resolveVoiceQuality(this.agent);
            const elModel = vq.model;
            // optimize_streaming_latency is deprecated at ElevenLabs — latency is now driven by
            // the chunk_length_schedule sent in the BOS message below.
            const url = buildElevenLabsStreamUrl({ voiceId: vid, model: elModel });

            console.log(`[SIP] Connecting to ElevenLabs: ${vid} (${elModel}, preset=${vq.preset}, latency=${vq.latencyProfile})`);
            this.elConnection = new WebSocket(url);

            this.elConnection.on('open', () => {
                this.isInitializingEl = false;
                if (!this.active) { try { this.elConnection.terminate(); } catch (_) { } return; }
                this.elReady = true;
                const keyPresent = !!this.settings?.elevenLabsKey;
                console.log(`🟢 [ElevenLabs] [${this.callId}] Connection Opened (Key present: ${keyPresent})`);
                this.elConnection.send(JSON.stringify(buildElevenLabsBOS({
                    apiKey: this.settings.elevenLabsKey,
                    voiceQuality: this.voiceQuality
                })));
                this._checkReady();
            });

            this.elConnection.on('message', (data) => {
                try {
                    const res = JSON.parse(data);
                    if (res.audio) {
                        if (this.interrupted) {
                            console.log(`🔇 [ElevenLabs] [${this.callId}] Interrupted — Dropping Audio chunk`);
                            return;
                        }
                        if (!this.firstChunkSentAt) this.firstChunkSentAt = Date.now();
                        if (this.turnTimings && !this.turnTimings.firstAudioAt) {
                            this.turnTimings.firstAudioAt = Date.now();
                            const d = this.turnTimings.dispatchedAt;
                            const rel = (t) => t ? `${t - d}ms` : 'n/a';
                            console.log(`⏱️ [Latency] [${this.callId}] queueWait=${this.turnTimings.queueWaitMs}ms llmRequest=${rel(this.turnTimings.llmRequestAt)} llmFirstToken=${rel(this.turnTimings.llmFirstTokenAt)} ttsFirstText=${rel(this.turnTimings.ttsFirstTextAt)} firstAudio=${this.turnTimings.firstAudioAt - d}ms (from dispatch)`);
                            // Voice Quality metrics — one sample per turn
                            const firstAudioMs = this.turnTimings.firstAudioAt - d;
                            if (this.turnTimings.llmFirstTokenAt) this._metrics.llmFirstTokenSum += this.turnTimings.llmFirstTokenAt - d;
                            if (this.turnTimings.ttsFirstTextAt) this._metrics.ttsFirstTextSum += this.turnTimings.ttsFirstTextAt - d;
                            this._metrics.firstAudioSum += firstAudioMs;
                            this._metrics.latencyCount++;
                            if (firstAudioMs > this._metrics.maxFirstAudioMs) this._metrics.maxFirstAudioMs = firstAudioMs;
                        }
                        this.isAISpeaking = true;
                        this._sendRtp(Buffer.from(res.audio, 'base64'));
                    } else {
                        console.log(`📩 [ElevenLabs] [${this.callId}] Message: ${JSON.stringify(res)}`);
                        // Track errors
                        if (res.error || res.message) {
                            const friendlyMsg = humanizeElevenLabsError(res.error, res.message);
                            this._pushError('elevenlabs', res.error || res.code || 'error', friendlyMsg);
                        }
                    }
                } catch (err) {
                    console.error(`[SIP] ElevenLabs Parse Error: ${err.message}`);
                }
            });

            this.elConnection.on('close', (code, reason) => {
                this.isInitializingEl = false;
                console.log(`⚪ [ElevenLabs] [${this.callId}] Connection Closed (Code: ${code}, Reason: ${reason || 'none'})`);
                this.elReady = false;
                this._elHadConnection = true;
            });

            this.elConnection.on('error', (e) => {
                this.isInitializingEl = false;
                console.error(`🔴 [ElevenLabs] [${this.callId}] Error:`, e);
            });
        } catch (initErr) {
            this.isInitializingEl = false;
            console.error('❌ [SIP] EL init exception:', initErr);
        }
    }

    // ─── AI Pipeline ─────────────────────────────────────────

    async _processConversation(userInput) {
        if (userInput.trim().length < 2) return;
        if (!this.active) return;

        console.log(`🧠 [SIP] [${this.callId}] processConversation start | userInput="${userInput.substring(0, 60)}${userInput.length > 60 ? '...' : ''}" | queueLen=${this.transcriptQueue.length}`);
        this._metrics.turns++;
        this.isProcessing = true;
        this.processingStartedAt = Date.now();
        this.interrupted = false;
        this.firstChunkSentAt = 0;
        this.turnTimings = {
            dispatchedAt: this.processingStartedAt,
            queueWaitMs: this.lastQueuedAt ? this.processingStartedAt - this.lastQueuedAt : 0,
            llmRequestAt: 0, llmFirstTokenAt: 0, ttsFirstTextAt: 0, firstAudioAt: 0
        };
        this.transcript.push({ role: 'user', content: userInput });
        this._touchActivity();

        this.abortController = new AbortController();

        if (!this.elConnection || this.elConnection.readyState !== WebSocket.OPEN) {
            await this._initElevenLabs();
            let elAttempts = 0;
            while (!this.elReady && elAttempts < 15) {
                await new Promise(r => setTimeout(r, 100));
                elAttempts++;
            }
        }

        try {
            const systemPrompt = buildVoiceSystemPrompt({
                agent: this.agent, settings: this.settings, kbContent: this.kbSystemContent,
                commandTags: true, lead: this.lead,
                humanTransfer: !!this.transferHandler,
            });

            console.log(`🧠 [SIP] AI Streaming...`);
            if (this.turnTimings) this.turnTimings.llmRequestAt = Date.now();

            const MAX_HISTORY = 20;
            const recentTranscript = this.transcript.length > MAX_HISTORY
                ? this.transcript.slice(-MAX_HISTORY)
                : this.transcript;

            const response = await axios({
                method: 'post',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                data: {
                    model: openRouterModel,
                    messages: [{ role: 'system', content: systemPrompt }, ...recentTranscript],
                    stream: true
                },
                headers: {
                    'Authorization': `Bearer ${this.settings.openRouterKey}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'stream',
                signal: this.abortController.signal
            });

            let fullReply = "";
            let firstContentReceived = false;
            // Prosody-aware (or legacy, per the agent's preset) TTS text chunking —
            // sends linguistically complete clauses instead of flushing on every comma.
            const chunker = new TtsChunkBuffer((this.voiceQuality || resolveVoiceQuality(this.agent)).chunking);

            for await (const chunk of response.data) {
                if (this.interrupted) break;

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
                                this.isAISpeaking = true;
                                if (this.turnTimings && !this.turnTimings.llmFirstTokenAt) this.turnTimings.llmFirstTokenAt = Date.now();
                            }
                            fullReply += content;
                            for (const piece of chunker.push(content)) {
                                const toSend = stripAppointmentCommands(piece);
                                if (toSend) this._sendToTTS(toSend, false);
                            }
                        }
                    } catch (e) { }
                }
            }

            // Final flush (strip appointment commands so [[SLOTS]] etc. are never spoken)
            const remainder = chunker.drain();
            if (remainder && !this.interrupted) {
                const toSend = stripAppointmentCommands(remainder);
                if (toSend) this._sendToTTS(toSend, true);
                else this._sendToTTS("", true);
            } else if (!this.interrupted) {
                this._sendToTTS("", true);
            }

            if (fullReply && !this.interrupted) {
                console.log(`🤖 [LLM] [${this.callId}] Reply: "${fullReply.substring(0, 100)}..."`);
                this.transcript.push({ role: 'assistant', content: fullReply });
                this._touchActivity();

                // --- TOOL PARSING & EXECUTION ---
                // Ending the call is a capability of every agent, so it is parsed outside
                // the appointment-booking gate the other tags sit behind.
                if (/\[\[END_CALL\]\]/.test(fullReply)) this._scheduleEndCall();

                // Human Transfer runs before the appointment tags: if the caller is handed
                // to a person, nothing else in this turn is worth doing.
                const transferred = await this._handleTransferCommand(fullReply, userInput);

                if (!transferred && this.agent.appointmentBookingEnabled) {
                    const listMatch = fullReply.match(/\[\[LIST\]\]/);
                    const slotsMatch = fullReply.match(/\[\[SLOTS\]\]/);
                    const bookMatch = fullReply.match(/\[\[BOOK:(.*?)\]\]/);
                    const cancelMatch = fullReply.match(/\[\[CANCEL:(.*?)\]\]/);

                    let result = "";
                    if (listMatch) {
                        result = await AppointmentService.listAppointments(this.userId, this.lead.phone);
                    } else if (slotsMatch) {
                        result = await AppointmentService.getAvailableSlots(this.userId);
                    } else if (bookMatch) {
                        const content = bookMatch[1].trim();
                        const parsed = parseBookDateTime(content);
                        if (parsed) {
                            result = await AppointmentService.bookAppointment(this.userId, this.agent._id, this.lead._id, this.lead.phone, parsed.date, parsed.time, parsed.clientName || '');
                        } else {
                            const [dateTimePart, clientName] = content.split('|').map(s => s.trim());
                            const parts = dateTimePart.split(' ');
                            if (parts.length >= 2) result = await AppointmentService.bookAppointment(this.userId, this.agent._id, this.lead._id, this.lead.phone, parts[0], parts[1], clientName || '');
                        }
                    } else if (cancelMatch) {
                        const parts = cancelMatch[1].trim().split(' ');
                        if (parts.length >= 2) {
                            result = await AppointmentService.cancelAppointment(this.userId, this.lead.phone, parts[0], parts[1]);
                        }
                    }

                    if (result && !this.interrupted) {
                        console.log(`🛠️ [SIP] Command Executed: ${result}`);
                        // Always pass tool output to LLM so it knows what happened (next turn has full context, won't get stuck)
                        this.transcript.push({ role: 'system', content: `COMMAND RESULT: ${result}` });

                        const toSpeak = await narrateAppointmentResult({
                            rawResult: result,
                            agentLanguage: this.agent.language,
                            lastUserUtterance: userInput,
                            isListOrSlots: !!(slotsMatch || listMatch),
                            openRouterKey: this.settings.openRouterKey,
                            model: openRouterModel,
                            speakTimeFn: (t) => timesToSpokenWords(t, this.settings?.timeFormat || '12'),
                        });
                        if (toSpeak && !this.interrupted) {
                            if (this.elConnection) {
                                try { this.elConnection.terminate(); } catch (_) { }
                                this.elConnection = null;
                            }
                            this.elReady = false;
                            await this._initElevenLabs();
                            let elAttempts = 0;
                            while (!this.elReady && elAttempts < 15) {
                                await new Promise(r => setTimeout(r, 100));
                                elAttempts++;
                            }
                            if (this.elReady && !this.interrupted) {
                                this._sendToTTS(toSpeak, true);
                                this.transcript.push({ role: 'assistant', content: toSpeak });
                                this._touchActivity();
                            }
                        }
                    }
                }
            }

        } catch (err) {
            if (axios.isCancel(err)) {
                console.log(`[SIP] [${this.callId}] LLM aborted (axios cancel)`);
            } else {
                console.error(`[SIP] [${this.callId}] LLM Error:`, err.message);
                this._pushError('openrouter', err.response?.status || 'error', `AI response failed: ${err.message}`);
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
            const queueLen = this.transcriptQueue.length;
            console.log(`🧠 [SIP] [${this.callId}] processConversation done | queueLen=${queueLen} | lastProcessed="${(this.lastProcessedTranscript || '').substring(0, 30)}..."`);
            while (this.transcriptQueue.length > 0) {
                const next = this.transcriptQueue[0];
                const isDuplicate = next === this.lastProcessedTranscript && (Date.now() - this.lastProcessedAt < 3000);
                if (!isDuplicate) {
                    this._scheduleProcessNext();
                    break;
                }
                this.transcriptQueue.shift();
                console.log(`♻️ [SIP] [${this.callId}] Skipping duplicate in queue: "${next.substring(0, 40)}..." (${Date.now() - this.lastProcessedAt}ms ago)`);
            }
        }
    }

    async injectAudioSpeech(text) {
        if (!this.active) return;
        console.log(`🔊 [SIP] Injecting speech: ${text}`);
        await this._sendToTTS(text);
    }

    async _sendToTTS(text, flush = true) {
        if (!text && !flush) return;
        if (this.interrupted) {
            console.log(`🔇 [TTS] [${this.callId}] Interrupted — Skipping Send: "${text?.substring(0, 30)}"`);
            return;
        }
        this.isAISpeaking = true;

        const stripped = text ? stripAppointmentCommands(text) : '';
        if (text && !stripped && !flush) return;
        const toSend = stripped || (flush ? '' : null);
        if (toSend === null) return;
        console.log(`📤 [TTS] [${this.callId}] Sending: "${(toSend || '').substring(0, 30)}..." (Flush: ${flush})`);

        // Ensure ElevenLabs is ready
        if (!this.elConnection || this.elConnection.readyState !== WebSocket.OPEN) {
            await this._initElevenLabs();
            let attempts = 0;
            while (!this.elReady && attempts < 10) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }
        }

        if (this.elConnection?.readyState === WebSocket.OPEN) {
            if (toSend) {
                if (this.turnTimings && !this.turnTimings.ttsFirstTextAt) this.turnTimings.ttsFirstTextAt = Date.now();
                this._metrics.ttsChunksSent++;
                this.elConnection.send(JSON.stringify({ text: toSend + ' ', try_trigger_generation: true }));
            }
            if (flush) {
                this.elConnection.send(JSON.stringify({ text: '' }));
            }
        }
    }

    setOnTestComplete(cb) {
        this.onTestComplete = cb;
    }

    /**
     * Called by sip-manager once the Asterisk bridge is established.
     * We open Deepgram and ElevenLabs here (not in start()) so they don't idle-timeout
     * while the call is still ringing. Greeting is sent after AI services connect.
     * For test calls we only use ElevenLabs and play testPhrase then hang up.
     */
    setBridgeReady() {
        this.bridgeReady = true;
        this.answeredAt = Date.now();
        this._touchActivity();
        this._startIdleWatchdog();
        console.log('🌉 [SIP Stream] Bridge ready');
        if (this.testCall) {
            this._initElevenLabs().catch(e => console.error('[SIP] EL init err:', e));
        } else {
            this._initDeepgram();
            this._initElevenLabs().catch(e => console.error('[SIP] EL init err:', e));
        }
        this._checkReady();
    }

    async _checkReady() {
        if (!this.active) return;
        console.log(`[SIP Stream] _checkReady: dg=${this.dgReady} el=${this.elReady} bridge=${this.bridgeReady} greetingSent=${this.greetingSent}`);

        // If bridge is ready but AI services dropped (had connection then closed), reconnect them (full conversation only)
        if (!this.testCall && this.bridgeReady && !this.greetingSent) {
            if (!this.dgReady && this._dgHadConnection) {
                console.log('🔄 [SIP] Deepgram not ready — reconnecting...');
                this._initDeepgram();
                return;
            }
            if (!this.elReady && this._elHadConnection) {
                console.log('🔄 [SIP] ElevenLabs not ready — reconnecting...');
                this._initElevenLabs().catch(e => console.error('[SIP] EL reconnect err:', e));
                return;
            }
        }

        const adminSettings = await AdminSettings.findOne({});
        let appName = 'IntelliCall AI';
        if (adminSettings && adminSettings.branding && adminSettings.branding.appName) {
            appName = adminSettings.branding.appName;
        }

        // Test call: only need ElevenLabs + bridge; play test phrase then onTestComplete will hang up
        if (this.testCall && this.elReady && this.bridgeReady && !this.greetingSent) {
            this.greetingSent = true;
            const greeting = this.testPhrase || `Hello from ${appName}. This is a test call. Goodbye!`;
            this.transcript.push({ role: 'assistant', content: greeting });
            console.log('⚡ [SIP] Sending test phrase...');
            setTimeout(() => { if (this.active) this._sendToTTS(greeting); }, 500);
            return;
        }

        if (this.dgReady && this.elReady && this.bridgeReady && !this.greetingSent) {
            this.greetingSent = true;
            const greeting = applyMergeFields(this.agent?.openingMessage || 'Hello', this.lead, { stripUnmatched: true }) || 'Hello';
            this.transcript.push({ role: 'assistant', content: greeting });
            this._touchActivity();
            console.log('⚡ [SIP] Sending greeting...');
            setTimeout(() => { if (this.active) this._sendToTTS(greeting); }, 1000);
        }
    }
}

module.exports = SipVoiceStream;
