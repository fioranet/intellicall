const dgram = require('dgram');
const Settings = require('../../models/Settings');
const Agent = require('../../models/Agent');
const Lead = require('../../models/Lead');
const CallLog = require('../../models/CallLog');
const { analyzeCallLog } = require('../../utils/analyzer');
const WebhookService = require('../webhook-service');
const EmailService = require('../email-service');
const { GeminiLiveBridge } = require('../gemini-live/gemini-bridge');
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
 * Outbound playout buffer bound, in packets. Gemini Live streams audio far faster than realtime,
 * so a long reply legitimately sits here for tens of seconds — this is a playout buffer, not a
 * jitter buffer, and the old 500-packet (10s) cap was routinely exceeded by normal replies.
 * 3000 packets is 60 seconds.
 */
const MAX_RTP_QUEUE = parseInt(process.env.SIP_RTP_MAX_QUEUE) || 3000;
/** Never send more than this many packets in one catch-up tick. */
const RTP_MAX_CATCHUP_PACKETS = 10;
/** Extra silence after the RTP queue drains, so the last packet is actually heard. */
const END_CALL_DRAIN_GRACE_MS = 600;
/** Backstop: hang up even if the drain signal never arrives. */
const END_CALL_SAFETY_MS = 15000;

/**
 * SIP/Asterisk ↔ Gemini Live adapter.
 *
 * Same public contract as SipVoiceStream (start, setBridgeReady, setOnTestComplete,
 * injectAudioSpeech, cleanup, campaignId) so sip-manager only branches at construction.
 * Caller RTP (mulaw 8k) → Gemini Live; agent audio → paced 20ms RTP packets.
 * Test calls never use this class — sip-manager keeps them on classic SipVoiceStream.
 *
 * Resampling between telephony rates and the Live API's 16k/24k PCM happens inside the
 * bridge, so everything below this line is plain µ-law, exactly as the other engines.
 */
class SipGeminiLiveStream {
    constructor({ userId, agentId, leadId, campaignId, direction, callId, rtpPort }) {
        this.userId = userId;
        this.agentId = agentId;
        this.leadId = leadId;
        this.campaignId = campaignId;
        this.direction = direction || 'outbound';
        this.callId = callId;
        this.rtpPort = rtpPort;

        this.settings = null;
        this.agent = null;
        this.lead = null;
        this.bridge = null;
        this.callErrors = [];
        this.active = false;
        this.bridgeReady = false;
        this.onTestComplete = null;
        this.startedAt = null;
        /** Set when the bridge goes up — the moment the caller can actually hear us. */
        this.answeredAt = null;

        // Hangup detection / agent-initiated hangup
        this.lastRtpAt = 0;
        this._rtpWatchdog = null;
        this.onMediaTimeout = null;
        this.onEndCall = null;
        /**
         * Human Transfer. Injected by sip-manager and forwarded to the engine bridge in
         * start() — only the SIP transport can dial and bridge a second leg.
         */
        this.transferHandler = null;
        /** True once the caller has been handed to a human and this engine left the bridge. */
        this.transferred = false;
        this._endCallPending = false;
        this._endCallScheduled = false;
        this._endCallFired = false;
        this._endCallSafetyTimer = null;

        // RTP state (mirrors SipVoiceStream)
        this.udpSocket = null;
        this.remoteAddress = null;
        this.remotePort = null;
        this.rtpSeq = 0;
        this.rtpTs = 0;
        this.rtpSSRC = Math.floor(Math.random() * 0xFFFFFFFF);
        this.rtpMarker = false;
        this._rtpQueue = [];
        this._rtpTimer = null;
        this._rtpNextSendAt = 0;
        /** Leftover bytes of an incomplete 20ms frame, carried to the next chunk. */
        this._rtpPartial = null;
    }

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

            if (!this.settings || !this.agent) {
                const msg = 'Missing settings or agent configuration.';
                console.error(`❌ [SIP Gemini] ${msg}`);
                this._pushError('system', 'missing_config', msg);
                return false;
            }
            // Self-contained engine: speech recognition, reasoning and speech generation
            // all happen inside one model, so only the Gemini key is required.
            if (!this.settings.geminiKey) {
                const msg = 'Missing API keys: Gemini. Please configure it in Settings.';
                console.error(`❌ [SIP Gemini] ${msg}`);
                this._pushError('system', 'missing_keys', msg);
                return false;
            }

            this.bridge = new GeminiLiveBridge({
                callId: this.callId, settings: this.settings, agent: this.agent, lead: this.lead
            });
            if (this.transferHandler) this.bridge.setTransferHandler(this.transferHandler);
            this.bridge.onAudio = (buf) => this._sendRtp(buf);
            this.bridge.onBargeIn = () => this._clearPlayback();
            this.bridge.onError = (service, code, message) => this._pushError(service, code, message);
            this.bridge.onEndCall = (reason) => this._scheduleEndCall(reason);

            // Cache KB content once per call
            if (this.agent.knowledgeBaseId) {
                try {
                    const KnowledgeBase = require('../../models/KnowledgeBase');
                    const { formatKnowledgeBaseContent } = require('../../utils/kb-formatter');
                    const kb = await KnowledgeBase.findById(this.agent.knowledgeBaseId);
                    if (kb) this.bridge.setKbContent(formatKnowledgeBaseContent(kb, this.agent.kbSettings || {}));
                } catch (kbErr) {
                    console.error(`[SIP Gemini] [${this.callId}] KB preload failed:`, kbErr.message);
                }
            }

            this.active = true;
            await this._openRtpSocket();

            // Seed CallLog (same shape as classic SIP path)
            await CallLog.findOneAndUpdate(
                { callSid: this.callId },
                {
                    userId: this.userId, agentId: this.agentId, leadId: this.leadId,
                    campaignId: this.campaignId, callSid: this.callId,
                    direction: this.direction, provider: 'sip', voiceEngine: 'gemini_live',
                    status: 'in-progress', startTime: new Date(),
                    transcript: [
                        { role: 'system', content: this.agent.systemPrompt }
                    ]
                },
                { upsert: true }
            );

            this.startedAt = Date.now();
            console.log(`✅ [SIP Gemini] Active — call ${this.callId} on UDP :${this.rtpPort}`);

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
            console.error('❌ [SIP Gemini] Start failed:', err);
            this.cleanup();
            return false;
        }
    }

    /**
     * Called by sip-manager once the Asterisk bridge is established. Connecting here
     * (not in start()) avoids the agent socket idling while the call is still ringing.
     * The opening line is in the system instruction, and the bridge nudges the model to
     * take the first turn as soon as setup completes.
     */
    setBridgeReady() {
        this.bridgeReady = true;
        this.answeredAt = Date.now();
        console.log(`🌉 [SIP Gemini] [${this.callId}] Bridge ready — connecting Voice Agent`);
        if (this.bridge) this.bridge.connect();
    }

    setOnTestComplete(cb) {
        // Test calls route to classic SipVoiceStream; kept for contract parity.
        this.onTestComplete = cb;
    }

    setOnEndCall(cb) {
        this.onEndCall = cb;
    }

    /**
     * Enable Human Transfer for this call. `fn(destinationId, reason)` resolves the JSON
     * string that transferCall() produced. Called before start(), so the engine bridge
     * picks it up as it is constructed and offers the capability from its first turn.
     */
    setTransferHandler(fn) {
        this.transferHandler = fn;
        if (this.bridge && typeof this.bridge.setTransferHandler === 'function') {
            this.bridge.setTransferHandler(fn);
        }
    }

    /**
     * The caller has been handed to a human and this stream's ExternalMedia leg is out of
     * the bridge. Stop the watchdogs — the RTP one would read the resulting silence as a
     * hangup and end the human's call within seconds — drop any queued agent audio, and
     * close the engine socket so the provider is not billed for the rest of the call.
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
        console.log(`🔇 [SIP Gemini] [${this.callId}] Detached from the bridge — caller is with a human`);

        if (this._rtpTimer) { clearTimeout(this._rtpTimer); this._rtpTimer = null; }
        if (this._rtpWatchdog) { clearInterval(this._rtpWatchdog); this._rtpWatchdog = null; }
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        this._rtpQueue = [];
        this._rtpNextSendAt = 0;

        // close() keeps the accumulated transcript, which cleanup() still needs.
        if (this.bridge) this.bridge.close();
    }

    /**
     * The agent asked to end the call. It still has its closing line queued, so hang up
     * only once the RTP queue has drained — with a safety timer in case it never does.
     */
    _scheduleEndCall(reason) {
        if (this._endCallPending || this._endCallFired) return;
        this._endCallPending = true;
        console.log(`📴 [SIP Gemini] [${this.callId}] end_call requested (${reason || 'no reason'}) — waiting for playback to finish`);
        this._endCallSafetyTimer = setTimeout(() => this._fireEndCall('safety timeout'), END_CALL_SAFETY_MS);
    }

    /** Caller spoke over the goodbye — they are not done, so stay on the line. */
    _cancelEndCall() {
        if (!this._endCallPending || this._endCallFired) return;
        this._endCallPending = false;
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        console.log(`🙅 [SIP Gemini] [${this.callId}] End of call cancelled — caller spoke again`);
    }

    _fireEndCall(why) {
        if (this._endCallFired || !this._endCallPending) return;
        this._endCallFired = true;
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        console.log(`📴 [SIP Gemini] [${this.callId}] Ending call (${why})`);
        if (this.onEndCall) this.onEndCall();
    }

    async injectAudioSpeech(text) {
        if (!this.active || !this.bridge) return;
        console.log(`🔊 [SIP Gemini] Injecting speech: ${text}`);
        this.bridge.injectAgentMessage(text);
    }

    async cleanup() {
        if (this._cleanedUp) return;
        this._cleanedUp = true;
        this.active = false;
        const transcript = this.bridge ? this.bridge.transcript : [];
        console.log(`🧹 [SIP Gemini] [${this.callId}] cleanup | transcriptLen=${transcript.length}`);

        if (this._rtpTimer) { clearTimeout(this._rtpTimer); this._rtpTimer = null; }
        if (this._rtpWatchdog) { clearInterval(this._rtpWatchdog); this._rtpWatchdog = null; }
        if (this._endCallSafetyTimer) { clearTimeout(this._endCallSafetyTimer); this._endCallSafetyTimer = null; }
        this._rtpQueue = [];
        this._rtpNextSendAt = 0;
        if (this.bridge) this.bridge.close();
        try { if (this.udpSocket) this.udpSocket.close(); } catch (_) { }
        this.udpSocket = null;

        if (this.callId) {
            try {
                const endTime = new Date();
                // Duration must measure ANSWERED time. startedAt is stamped in start(),
                // before originateCall() — using it bills the caller for dial + ring.
                const duration = computeDuration(this.answeredAt, this.startedAt);
                // Empty transcript => call ended before any conversation; mark 'failed'
                // rather than leaving it stuck 'in-progress'.
                const hadConversation = transcript.length > 0;

                const updateData = {
                    status: hadConversation ? 'completed' : 'failed', transcript,
                    endTime, duration, provider: 'sip', voiceEngine: 'gemini_live'
                };

                const log = await CallLog.findOneAndUpdate(
                    { callSid: this.callId },
                    updateData,
                    { returnDocument: 'after' }
                );

                // recordingUrl must be built from the CallLog _id — that's what the
                // /api/call-logs/:id/recording route looks up.
                if (log && this.settings?.recordingEnabled !== false) {
                    updateData.recordingUrl = `${process.env.BASE_URL}/api/call-logs/${log._id}/recording`;
                    log.recordingUrl = updateData.recordingUrl;
                    await CallLog.updateOne({ _id: log._id }, { recordingUrl: updateData.recordingUrl });
                }

                if (log && hadConversation && this.settings?.autoAnalysisEnabled) {
                    analyzeCallLog(log._id).catch(e => console.error('[SIP Gemini] Analysis err:', e));
                }

                if (log) {
                    const completedPayload = {
                        callSid: this.callId,
                        leadId: this.leadId,
                        campaignId: this.campaignId,
                        direction: this.direction,
                        duration: duration,
                        status: updateData.status,
                        recordingUrl: log.recordingUrl,
                        provider: 'sip'
                    };
                    WebhookService.trigger(this.userId, 'callCompleted', completedPayload);
                    EmailService.trigger(this.userId, 'callCompleted', completedPayload);
                }

                // Mark campaign completed when all calls are done (same as classic SIP path)
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
                                WebhookService.trigger(this.userId, 'campaignCompleted', {
                                    campaignId: log.campaignId,
                                    name: campaign.name,
                                    status: 'completed'
                                });
                                console.log(`[SIP Gemini] Campaign ${log.campaignId} marked as completed (${finishedCalls}/${totalLeads} calls done)`);
                            }
                        }
                    } catch (campErr) {
                        console.error('[SIP Gemini] Campaign completion check err:', campErr.message);
                    }
                }
            } catch (e) { console.error('[SIP Gemini] Log save err:', e); }
        }
    }

    // ─── RTP transport (mirrors SipVoiceStream) ──────────────

    _openRtpSocket() {
        return new Promise((resolve, reject) => {
            this.udpSocket = dgram.createSocket('udp4');

            this.udpSocket.on('message', (msg, rinfo) => {
                this.lastRtpAt = Date.now();
                if (!this.remoteAddress) {
                    this.remoteAddress = rinfo.address;
                    this.remotePort = rinfo.port;
                    console.log(`📡 [SIP Gemini] [${this.callId}] RTP Source Identified: ${rinfo.address}:${rinfo.port}`);
                    this._startRtpWatchdog();
                }
                if (msg.length > RTP_HEADER_SIZE && this.bridge) {
                    this.bridge.sendAudio(msg.slice(RTP_HEADER_SIZE));
                }
            });

            this.udpSocket.on('error', (err) => {
                console.error(`❌ [SIP Gemini] UDP err port ${this.rtpPort}:`, err);
                if (!this.active) { reject(err); return; }
                console.error(`❌ [SIP Gemini] [${this.callId}] UDP socket error during active call — cleaning up`);
                this.cleanup();
            });

            this.udpSocket.bind(this.rtpPort, '0.0.0.0', () => {
                console.log(`🎧 [SIP Gemini] RTP listening on :${this.rtpPort}`);
                resolve();
            });
        });
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
                console.warn(`📵 [SIP Gemini] [${this.callId}] No caller RTP for ${gap}ms — treating as hangup`);
                clearInterval(this._rtpWatchdog);
                this._rtpWatchdog = null;
                if (this.onMediaTimeout) this.onMediaTimeout();
            }
        }, RTP_WATCHDOG_INTERVAL_MS);
        if (typeof this._rtpWatchdog.unref === 'function') this._rtpWatchdog.unref();
    }

    /** Barge-in: drop any queued agent audio immediately. */
    _clearPlayback() {
        this._cancelEndCall();
        this._rtpQueue = [];
        this._rtpNextSendAt = 0;
        this._rtpPartial = null;   // belongs to the turn the caller just talked over
        if (this._rtpTimer) {
            clearTimeout(this._rtpTimer);
            this._rtpTimer = null;
        }
        console.log(`🛑 [SIP Gemini] [${this.callId}] Playback cleared (barge-in)`);
    }

    /**
     * Queue µ-law audio for paced RTP transmission (20ms per packet). Without pacing,
     * packets blast out at once and Asterisk's jitter buffer overflows.
     *
     * Only whole 160-byte frames are queued. Resampled audio arrives in lengths that have
     * nothing to do with frame boundaries, and the drain loop advances the RTP timestamp
     * by a fixed 160 per packet — so a short packet would claim 20ms of airtime it does
     * not contain and walk the timestamp out of step with the audio.
     */
    _sendRtp(mulawBuf) {
        if (!this.udpSocket || !this.remoteAddress) return;

        if (this._rtpQueue.length === 0) {
            this.rtpMarker = true;
        }

        const pending = this._rtpPartial ? Buffer.concat([this._rtpPartial, mulawBuf]) : mulawBuf;
        const whole = pending.length - (pending.length % RTP_PACKET_BYTES);
        for (let i = 0; i < whole; i += RTP_PACKET_BYTES) {
            this._rtpQueue.push(pending.subarray(i, i + RTP_PACKET_BYTES));
        }
        this._rtpPartial = whole < pending.length ? Buffer.from(pending.subarray(whole)) : null;

        // Bound the buffer, but never throw the backlog away: clearing it deleted whole seconds
        // out of the middle of the agent's sentence, which is what the caller actually heard.
        // Past the bound, drop only the excess — and only the oldest, which has been superseded
        // by everything queued behind it. _rtpPartial is the tail of the newest audio, so it is
        // kept. Barge-in remains the one path that empties the queue.
        if (this._rtpQueue.length > MAX_RTP_QUEUE) {
            const excess = this._rtpQueue.length - MAX_RTP_QUEUE;
            this._rtpQueue.splice(0, excess);
            this.rtpMarker = true;
            if (!this._rtpOverflowLogged) {
                this._rtpOverflowLogged = true;
                console.warn(`⚠️ [SIP Gemini] [${this.callId}] RTP playout buffer at its ${MAX_RTP_QUEUE}-packet (${Math.round(MAX_RTP_QUEUE * RTP_PACKET_MS / 1000)}s) bound — dropping ${excess} oldest packet(s). The agent's reply is longer than the buffer.`);
            }
        }

        if (!this._rtpTimer) {
            this._drainRtpQueue();
        }
    }

    _drainRtpQueue() {
        if (this._rtpQueue.length === 0 || !this.udpSocket || !this.remoteAddress) {
            this._rtpTimer = null;
            this._rtpNextSendAt = 0;
            // Queue empty and the agent asked to hang up: the closing line has now been
            // sent. Re-check after a short settle so an inter-chunk gap can't cut it off.
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
        this.rtpMarker = false;

        pkt[0] = 0x80;                                     // V=2
        pkt[1] = markerBit | 0x00;                         // M + PT=0 (PCMU)
        pkt.writeUInt16BE(this.rtpSeq & 0xFFFF, 2);        // Sequence
        pkt.writeUInt32BE(this.rtpTs & 0xFFFFFFFF, 4);     // Timestamp
        pkt.writeUInt32BE(this.rtpSSRC, 8);                // SSRC
        chunk.copy(pkt, RTP_HEADER_SIZE);

        this.udpSocket.send(pkt, this.remotePort, this.remoteAddress);
        this.rtpSeq++;
        this.rtpTs += RTP_PACKET_BYTES;
    }
}

module.exports = SipGeminiLiveStream;
