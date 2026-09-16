const WebSocket = require('ws');
const { GeminiLiveBridge } = require('./gemini-bridge');
const CallLog = require('../../models/CallLog');
const WebhookService = require('../webhook-service');
const EmailService = require('../email-service');
const { analyzeCallLog } = require('../../utils/analyzer');
const { computeDuration, persistDurationIfUnset } = require('../../utils/call-duration');

/** Extra silence after the estimated playout, so the last word is actually heard. */
const END_CALL_DRAIN_GRACE_MS = 600;

/**
 * Media Streams ↔ Gemini Live adapter.
 *
 * The exact structural sibling of the Sarvam and Deepgram Voice Agent adapters:
 * inbound media frames → bridge; agent audio → media frames; barge-in → 'clear'.
 * The bridge already resamples in both directions internally, so µ-law 8k is the
 * only format that crosses this boundary — same as every other engine.
 *
 * Used today by the in-browser agent test (`transport: 'browser'`), which speaks
 * the Media Streams frame protocol over its own socket. Gemini over real Twilio
 * calls stays gated in voice-stream.js until it has been validated on a phone
 * leg; when that happens this adapter serves it unchanged.
 */
class TwilioGeminiLiveSession {
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
        this.startedAt = 0;
        this._endCallTimer = null;

        this.bridge = new GeminiLiveBridge({ callId: callSid, settings, agent, lead });

        // The client paces playback on its side, so there is no local queue to measure.
        // Estimate instead: µ-law 8k is 8 bytes per millisecond of speech.
        this._playoutUntil = 0;

        this.bridge.onAudio = (buf) => {
            if (this.ws.readyState !== WebSocket.OPEN || !this.streamSid) return;
            if (this.ws.bufferedAmount > 1024 * 1024) {
                console.warn(`⚠️ [Gemini] [${this.callSid}] Dropping audio chunk — ws backpressure (buffered=${this.ws.bufferedAmount})`);
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
            if (this._endCallTimer) {
                clearTimeout(this._endCallTimer);
                this._endCallTimer = null;
                console.log(`🙅 [Gemini] [${this.callSid}] Scheduled hangup cancelled — caller spoke again`);
            }
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
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
     * The agent decided the conversation is over. The closing line is still buffered
     * on the client, so wait out the estimated playout or the goodbye is cut off.
     */
    _hangupAfterPlayout() {
        if (this._endCallTimer || !this.callSid) return;
        const waitMs = Math.max(0, this._playoutUntil - Date.now()) + END_CALL_DRAIN_GRACE_MS;
        console.log(`📴 [Gemini] [${this.callSid}] Agent ended the call — hanging up in ${waitMs}ms`);
        this._endCallTimer = setTimeout(async () => {
            this._endCallTimer = null;
            if (this.isBrowser) {
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
            } catch (err) {
                console.error(`❌ [Gemini] [${this.callSid}] Hangup failed:`, err.message);
            }
        }, waitMs);
    }

    async start() {
        this.startedAt = Date.now();
        if (this.agent.knowledgeBaseId) {
            try {
                const KnowledgeBase = require('../../models/KnowledgeBase');
                const { formatKnowledgeBaseContent } = require('../../utils/kb-formatter');
                const kb = await KnowledgeBase.findById(this.agent.knowledgeBaseId);
                if (kb) this.bridge.setKbContent(formatKnowledgeBaseContent(kb, this.agent.kbSettings || {}));
            } catch (kbErr) {
                console.error(`[Gemini] [${this.callSid}] KB preload failed:`, kbErr.message);
            }
        }
        this.bridge.connect();
    }

    /** Inbound media payload (base64 µ-law 8k) → Gemini. */
    onMedia(base64Payload) {
        this.bridge.sendAudio(Buffer.from(base64Payload, 'base64'));
    }

    injectWarning(text) {
        this.bridge.injectAgentMessage(text);
    }

    _pushError(service, code, message) {
        this.callErrors.push({ service, code: String(code || ''), message, timestamp: new Date() });
        if (this.isBrowser) {
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
        console.log(`🧹 [Gemini] [${this.callSid}] cleanup | transcriptLen=${transcript.length}`);
        this.bridge.close();
        if (this._endCallTimer) { clearTimeout(this._endCallTimer); this._endCallTimer = null; }

        // A browser test is not a call: nothing is logged, analyzed, or billed.
        if (this.isBrowser) return;

        if (this.callSid) {
            const hadConversation = transcript.length > 0;
            const updateData = {
                userId: this.userId, agentId: this.agentId, leadId: this.leadId,
                campaignId: this.campaignId, callSid: this.callSid,
                direction: this.direction, voiceEngine: 'gemini_live',
                status: hadConversation ? 'completed' : 'failed', endTime: new Date(),
            };
            if (hadConversation) updateData.transcript = transcript;
            if (this.callErrors.length > 0) {
                updateData.$push = { errors: { $each: this.callErrors } };
            }
            CallLog.findOneAndUpdate({ callSid: this.callSid }, updateData, { upsert: true, returnDocument: 'after' }).then(async (updatedLog) => {
                await persistDurationIfUnset(this.callSid, computeDuration(this.startedAt));

                if (hadConversation && this.settings?.autoAnalysisEnabled) {
                    analyzeCallLog(updatedLog._id).catch(e => console.error('[Gemini] Analysis Error:', e));
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
            }).catch(e => console.error('[Gemini] Log Error:', e));
        }
    }
}

module.exports = { TwilioGeminiLiveSession };
