const WebSocket = require('ws');
const { SarvamBridge } = require('./sarvam-bridge');
const CallLog = require('../../models/CallLog');
const WebhookService = require('../webhook-service');
const EmailService = require('../email-service');
const { analyzeCallLog } = require('../../utils/analyzer');
const { computeDuration, persistDurationIfUnset } = require('../../utils/call-duration');

/** Extra silence after the estimated playout, so the last word is actually heard. */
const END_CALL_DRAIN_GRACE_MS = 600;

/**
 * Media Streams ↔ Sarvam AI adapter.
 *
 * voice-stream.js delegates here when agent.voiceEngine === 'sarvam':
 * inbound media frames → bridge; agent audio → media frames; barge-in → 'clear';
 * stop/close → CallLog + webhooks. Same public contract as
 * TwilioDeepgramAgentSession (start / onMedia / injectWarning / cleanup).
 *
 * `transport` is 'twilio' for a real call and 'browser' for the in-browser agent
 * test, which speaks the same frame protocol over its own socket. A browser session
 * has no phone leg to drop and is not a real call, so it closes the socket instead
 * of calling the Twilio REST API and writes nothing to CallLog.
 */
class TwilioSarvamSession {
    constructor({ ws, streamSid, callSid, userId, agentId, leadId, campaignId, direction, settings, agent, lead, transport = 'twilio' }) {
        this.ws = ws;
        this.transport = transport;
        this.isBrowser = transport === 'browser';
        this.streamSid = streamSid;
        this.callSid = callSid;
        this.userId = userId;
        this.agentId = agentId;
        this.leadId = leadId;
        this.campaignId = campaignId;
        this.direction = direction;
        this.settings = settings;
        this.agent = agent;
        this.lead = lead;
        this.callErrors = [];
        this.cleaned = false;
        /** Twilio opens the media stream only after the callee answers — so this is answered time. */
        this.startedAt = 0;
        this._endCallTimer = null;

        this.bridge = new SarvamBridge({ callId: callSid, settings, agent, lead });

        // Twilio buffers and paces the audio on its side, so there is no local queue to measure.
        // Estimate instead: µ-law 8k is 8 bytes per millisecond of speech. The bridge uses this
        // to hold a short caller reply (a "yes") until the caller has actually heard the agent
        // out, rather than answering over audio Twilio is still playing.
        this._playoutUntil = 0;

        this.bridge.onAudio = (buf) => {
            if (this.ws.readyState !== WebSocket.OPEN || !this.streamSid) return;
            if (this.ws.bufferedAmount > 1024 * 1024) {
                console.warn(`⚠️ [Sarvam] [${this.callSid}] Dropping audio chunk — ws backpressure (buffered=${this.ws.bufferedAmount})`);
                return;
            }
            this._playoutUntil = Math.max(this._playoutUntil, Date.now()) + (buf.length / 8);
            this.ws.send(JSON.stringify({
                event: 'media',
                streamSid: this.streamSid,
                media: { payload: buf.toString('base64') },
            }));
        };

        this.bridge.isPlaybackActive = () => Date.now() < this._playoutUntil;

        this.bridge.onBargeIn = () => {
            this._playoutUntil = 0;
            // Without this, a hangup already scheduled by _hangupAfterPlayout (agent
            // end_call, or the idle-timeout goodbye) would still fire later even though
            // the caller just started talking again.
            if (this._endCallTimer) {
                clearTimeout(this._endCallTimer);
                this._endCallTimer = null;
                console.log(`🙅 [Sarvam] [${this.callSid}] Scheduled hangup cancelled — caller spoke again`);
            }
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
                console.log(`🛑 [Sarvam] [${this.callSid}] Twilio clear sent (barge-in)`);
            }
        };

        // The test UI renders the conversation live; a phone call has no use for
        // this, so it is only wired for the browser transport.
        if (this.isBrowser) {
            this.bridge.onTranscript = (role, content) => {
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ event: 'ic.transcript', role, content }));
                }
            };
        }

        this.bridge.onError = (service, code, message) => this._pushError(service, code, message);
        this.bridge.onEndCall = () => this._hangupAfterPlayout();
    }

    /**
     * The agent decided the conversation is over. Twilio still has the closing line
     * buffered, so wait out the estimated playout before dropping the leg — hanging up
     * on AgentAudioDone alone cuts the goodbye off mid-word.
     */
    _hangupAfterPlayout() {
        if (this._endCallTimer || !this.callSid) return;
        const waitMs = Math.max(0, this._playoutUntil - Date.now()) + END_CALL_DRAIN_GRACE_MS;
        console.log(`📴 [Sarvam] [${this.callSid}] Agent ended the call — hanging up in ${waitMs}ms`);
        this._endCallTimer = setTimeout(async () => {
            this._endCallTimer = null;
            if (this.isBrowser) {
                // No phone leg to drop: tell the page the agent ended it, then close.
                // The socket's own close handler drives the single cleanup path.
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ event: 'ic.end', reason: 'agent' }));
                    this.ws.close();
                }
                return;
            }
            try {
                const twilio = require('twilio');
                const client = twilio(this.settings.twilioSid, this.settings.twilioToken);
                await client.calls(this.callSid).update({ status: 'completed' });
                // Twilio now sends 'stop', which drives the normal cleanup path — there is
                // deliberately only one closure sequence.
            } catch (err) {
                console.error(`❌ [Sarvam] [${this.callSid}] Hangup failed:`, err.message);
            }
        }, waitMs);
    }

    async start() {
        this.startedAt = Date.now();
        // Cache KB content once per call (same as classic path)
        if (this.agent.knowledgeBaseId) {
            try {
                const KnowledgeBase = require('../../models/KnowledgeBase');
                const { formatKnowledgeBaseContent } = require('../../utils/kb-formatter');
                const kb = await KnowledgeBase.findById(this.agent.knowledgeBaseId);
                if (kb) this.bridge.setKbContent(formatKnowledgeBaseContent(kb, this.agent.kbSettings || {}));
            } catch (kbErr) {
                console.error(`[Sarvam] [${this.callSid}] KB preload failed:`, kbErr.message);
            }
        }
        this.bridge.connect();
    }

    /** Twilio inbound media payload (base64 µ-law 8k) → Sarvam. */
    onMedia(base64Payload) {
        this.bridge.sendAudio(Buffer.from(base64Payload, 'base64'));
    }

    /** Auto-hangup 1-minute warning etc. */
    injectWarning(text) {
        this.bridge.injectAgentMessage(text);
    }

    _pushError(service, code, message) {
        this.callErrors.push({ service, code: String(code || ''), message, timestamp: new Date() });
        if (this.isBrowser) {
            // No CallLog to annotate — surface it in the test UI instead.
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ event: 'ic.error', service, message }));
            }
            return;
        }
        if (this.callSid) {
            CallLog.findOneAndUpdate({ callSid: this.callSid }, { $push: { errors: { service, code: String(code || ''), message } } }).catch(() => { });
        }
    }

    cleanup() {
        if (this.cleaned) return;
        this.cleaned = true;
        const transcript = this.bridge.transcript;
        console.log(`🧹 [Sarvam] [${this.callSid}] cleanup | transcriptLen=${transcript.length}`);
        this.bridge.close();
        if (this._endCallTimer) { clearTimeout(this._endCallTimer); this._endCallTimer = null; }

        // A browser test is not a call: nothing is logged, analyzed, or billed.
        if (this.isBrowser) return;

        // A call that ended before any conversation happened still has to reach a terminal
        // status, or the row stays "in conversation" in the UI forever.
        if (this.callSid) {
            const hadConversation = transcript.length > 0;
            const updateData = {
                userId: this.userId, agentId: this.agentId, leadId: this.leadId,
                campaignId: this.campaignId, callSid: this.callSid,
                direction: this.direction, voiceEngine: 'sarvam',
                status: hadConversation ? 'completed' : 'failed', endTime: new Date(),
            };
            if (hadConversation) updateData.transcript = transcript;
            if (this.callErrors.length > 0) {
                updateData.$push = { errors: { $each: this.callErrors } };
            }
            CallLog.findOneAndUpdate({ callSid: this.callSid }, updateData, { upsert: true, returnDocument: 'after' }).then(async (updatedLog) => {
                // Twilio's own CallDuration from POST /api/twilio/status is authoritative;
                // this only fills the gap when that callback never lands.
                await persistDurationIfUnset(this.callSid, computeDuration(this.startedAt));

                if (hadConversation && this.settings?.autoAnalysisEnabled) {
                    console.log(`[Sarvam] Auto-analysis triggered for call ${this.callSid}`);
                    analyzeCallLog(updatedLog._id).catch(e => console.error('[Sarvam] Analysis Error:', e));
                }
                const completedPayload = {
                    callSid: this.callSid,
                    leadId: this.leadId,
                    campaignId: this.campaignId,
                    direction: this.direction,
                    status: updateData.status,
                    duration: updatedLog.duration,
                    provider: this.callSid?.startsWith('CA') ? 'twilio' : 'sip',
                };
                WebhookService.trigger(this.userId, 'callCompleted', completedPayload);
                EmailService.trigger(this.userId, 'callCompleted', completedPayload);
            }).catch(e => console.error('[Sarvam] Log Error:', e));
        }
    }
}

module.exports = { TwilioSarvamSession };
