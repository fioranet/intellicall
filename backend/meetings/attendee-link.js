/**
 * The meeting bot's audio socket, made to look like a Twilio Media Streams
 * socket to the voice pipeline (services/voice-stream.js, transport 'meeting').
 *
 * handleVoiceStream already does everything a conversation needs: one engine,
 * barge-in, tools, the greeting, end-of-call drain, the timers and one cleanup.
 * What differs for a meeting is only the wire, so this is an adapter rather
 * than a third pipeline. handleVoiceStream is handed an AttendeeLink where it
 * expects a WebSocket and speaks Twilio's JSON frames to it; the link
 * translates both ways:
 *
 *   Attendee → us   {trigger:'realtime_audio.mixed', data:{chunk, sample_rate}}
 *                   base64 PCM s16le mono, 16 kHz here → µ-law 8 kHz →
 *                   {event:'media', media:{payload}} frames
 *   us → Attendee   {event:'media', media:{payload}} → µ-law 8 kHz → PCM 16 kHz →
 *                   {trigger:'realtime_audio.bot_output', data:{chunk, sample_rate}}
 *                   {event:'clear'} (barge-in) → our own queue dropped
 *                   {event:'ic.transcript'} → the meeting gate (voice/meeting-mode.js)
 *                   and the meeting's own transcript
 *
 * Why output is paced here. Attendee has no message that clears what the bot
 * has queued: it plays every chunk it is sent, so audio sent ahead of time
 * cannot be taken back. So the link keeps the agent's speech itself and sends
 * it in real time, never more than LEAD_MS ahead, and a barge-in drops what has
 * not gone yet. At most LEAD_MS of speech is heard after an interruption.
 *
 * Why a link and not the socket itself. Attendee reconnects after a drop, up to
 * 30 times, with the same URL. The conversation must not end with the socket:
 * the bot is still in the meeting. So the link outlives sockets. A new socket
 * for the same meeting is attached in place of the old one, and only when no
 * socket has come back within RECONNECT_GRACE_MS does the link report `close`,
 * which ends the session through the pipeline's usual cleanup.
 *
 * The sample rate is 16 kHz both ways for every engine. The pipeline contract
 * is µ-law 8 kHz (what a phone line carries), so nothing wider survives into
 * or out of an engine; 16 kHz is Attendee's default and the cheapest rate to
 * convert from cleanly.
 */
const { EventEmitter } = require('events');
const WsLib = require('ws');
const { MeetingGate } = require('../voice/meeting-mode');
const { PcmToMulaw8k, Mulaw8kToPcm16k } = require('../utils/audio-resample');

const MEETING_SAMPLE_RATE = 16000;
/** How far ahead of real time the bot is sent speech. Also the most heard after a barge-in. */
const LEAD_MS = 240;
/** One bot_output message: 100 ms, the unit Attendee plays in. */
const OUT_CHUNK_MS = 100;
const OUT_CHUNK_BYTES = OUT_CHUNK_MS * 8;
const PACE_INTERVAL_MS = 20;
/** 200 ms of µ-law per inbound media frame. */
const IN_FRAME_BYTES = 1600;
/** Attendee retries every 10 s in its code (2 s in its docs); four tries' worth. */
const RECONNECT_GRACE_MS = 45_000;
/** Past this much undelivered speech the engine is far ahead of the room; drop, don't queue. */
const MAX_QUEUED_BYTES = 60 * 8000;

class AttendeeLink extends EventEmitter {
    /**
     * @param {{respondWhen: 'addressed' | 'always', wakeNames: readonly string[], logTag: string, callId: string,
     *   reconnectGraceMs?: number, now?: () => number}} opts
     */
    constructor(opts) {
        super();
        this.opts = opts;
        /** What handleVoiceStream reads. OPEN until the meeting's conversation ends. */
        this.readyState = WsLib.OPEN;
        /** Set by server.js on agent-test sockets; the meeting is not one, but it carries audio frames too. */
        this.isAgentTest = true;
        this.socket = null;
        this.graceTimer = null;
        this.queue = [];
        this.queuedBytes = 0;
        /** When the audio sent so far finishes playing, in ms since epoch. */
        this.sentUntil = 0;
        this.inbound = new PcmToMulaw8k(MEETING_SAMPLE_RATE);
        this.outbound = new Mulaw8kToPcm16k();
        this.now = opts.now || Date.now;
        this.graceMs = opts.reconnectGraceMs ?? RECONNECT_GRACE_MS;
        this.gate = new MeetingGate({
            respondWhen: opts.respondWhen,
            names: opts.wakeNames,
            emit: (buf) => this.enqueue(buf),
            now: this.now,
        });
        /** The conversation as the engine reported it, from the pipeline's transcript frames. */
        this.transcript = [];
        /** Errors the pipeline reported (missing keys, provider failures). */
        this.errors = [];
        /** Why the pipeline ended, from its `ic.end` frame. */
        this.endReason = null;
        /** Sockets attached over the meeting's life, for the log. */
        this.connections = 0;
        this.botId = null;
        this.started = false;
        /** When the bot's socket last dropped (epoch ms); moved forward on every attach. */
        this.lastLiveAt = Date.now();
        this.paceTimer = setInterval(() => this.pace(), PACE_INTERVAL_MS);
        if (typeof this.paceTimer.unref === 'function') this.paceTimer.unref();
    }

    /** Undelivered speech, which the adapters read as the client falling behind. */
    get bufferedAmount() { return this.queuedBytes; }

    /** The billable end of the meeting: now while the bot is connected, the moment it dropped once it is not. */
    get billableEndAt() {
        return this.attached ? Date.now() : this.lastLiveAt;
    }

    get attached() { return this.socket !== null && this.socket.readyState === WsLib.OPEN; }

    /** A (re)connected bot socket. Replaces whichever came before. */
    attach(ws) {
        if (this.readyState !== WsLib.OPEN) {
            try { ws.close(4410, 'meeting_ended'); } catch { /* gone */ }
            return;
        }
        const previous = this.socket;
        this.socket = ws;
        this.connections += 1;
        this.lastLiveAt = Date.now();
        if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
        if (previous && previous !== ws) {
            try { previous.close(1000, 'replaced'); } catch { /* gone */ }
        }
        // Whatever was in flight on the old socket is lost; start the clock again.
        this.sentUntil = 0;

        ws.on('message', (data, isBinary) => {
            if (this.socket !== ws || isBinary) return;
            this.fromAttendee(data);
        });
        const lost = () => {
            if (this.socket !== ws) return;
            this.socket = null;
            this.lastLiveAt = Date.now();
            if (this.readyState !== WsLib.OPEN) return;
            console.log(`🔌 [${this.opts.logTag}] bot socket dropped; waiting ${Math.round(this.graceMs / 1000)}s for it to reconnect`);
            this.graceTimer = setTimeout(() => this.closeLink('disconnected'), this.graceMs);
        };
        ws.on('close', lost);
        ws.on('error', lost);

        // The pipeline waits for Twilio's start frame before it does anything.
        if (!this.started) {
            this.started = true;
            setImmediate(() => this.emitFrame({
                event: 'start',
                start: { streamSid: this.opts.callId, callSid: this.opts.callId, customParameters: {} },
            }));
        }
    }

    emitFrame(frame) {
        if (this.readyState !== WsLib.OPEN) return;
        this.emit('message', Buffer.from(JSON.stringify(frame)), false);
    }

    // ── Inbound: the room ─────────────────────────────────────────────────

    fromAttendee(data) {
        let msg;
        try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
        if (typeof msg.bot_id === 'string' && !this.botId) this.botId = msg.bot_id;
        if (msg.trigger !== 'realtime_audio.mixed' || typeof (msg.data && msg.data.chunk) !== 'string') return;
        const rate = Number(msg.data.sample_rate ?? MEETING_SAMPLE_RATE);
        if (rate !== this.inbound.sourceRate) {
            // Configured at 16 kHz; follow whatever actually arrives rather than mangle it.
            if (![8000, 16000, 24000].includes(rate)) return;
            this.inbound = new PcmToMulaw8k(rate);
        }
        const mulaw = this.inbound.process(Buffer.from(msg.data.chunk, 'base64'));
        for (let i = 0; i < mulaw.length; i += IN_FRAME_BYTES) {
            const frame = mulaw.subarray(i, i + IN_FRAME_BYTES);
            this.emitFrame({ event: 'media', media: { payload: frame.toString('base64') } });
        }
    }

    // ── Outbound: what the pipeline says ──────────────────────────────────

    /** handleVoiceStream's ws.send lands here. */
    send(data) {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        switch (msg.event) {
            case 'media':
                if (msg.media && typeof msg.media.payload === 'string') this.gate.agentAudio(Buffer.from(msg.media.payload, 'base64'));
                return;
            case 'clear':
                this.clear();
                this.gate.agentStopped();
                return;
            case 'ic.transcript':
                if (typeof msg.content !== 'string') return;
                this.transcript.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content, timestamp: new Date() });
                if (msg.role === 'user') this.gate.userSaid(msg.content);
                else this.gate.agentSaid(msg.content);
                return;
            case 'ic.error':
                this.errors.push({ service: msg.service || 'system', message: String(msg.message || '').slice(0, 300), at: new Date() });
                return;
            case 'ic.end':
                this.endReason = msg.reason || 'agent';
                return;
            default:
                // mark and the rest: the meeting has nothing to do with them.
                return;
        }
    }

    enqueue(buf) {
        if (this.queuedBytes + buf.length > MAX_QUEUED_BYTES) return;
        this.queue.push(buf);
        this.queuedBytes += buf.length;
    }

    /** Drop what has not been sent. What has (≤ LEAD_MS) plays out at Attendee. */
    clear() {
        this.queue = [];
        this.queuedBytes = 0;
        this.outbound = new Mulaw8kToPcm16k();
    }

    take(bytes) {
        const parts = [];
        let need = bytes;
        while (need > 0 && this.queue.length) {
            const head = this.queue[0];
            if (head.length <= need) {
                parts.push(head);
                this.queue.shift();
                need -= head.length;
            } else {
                parts.push(head.subarray(0, need));
                this.queue[0] = head.subarray(need);
                need = 0;
            }
        }
        const out = Buffer.concat(parts);
        this.queuedBytes -= out.length;
        return out;
    }

    pace() {
        this.gate.tick();
        if (this.queuedBytes === 0) return;
        const ws = this.socket;
        if (!ws || ws.readyState !== WsLib.OPEN) {
            // Nobody to play it to; the room has moved on by the time a socket is back.
            this.clear();
            return;
        }
        const now = this.now();
        if (this.sentUntil < now) this.sentUntil = now;
        while (this.queuedBytes > 0 && this.sentUntil < now + LEAD_MS) {
            const mulaw = this.take(OUT_CHUNK_BYTES);
            const pcm = this.outbound.process(mulaw);
            try {
                ws.send(JSON.stringify({
                    trigger: 'realtime_audio.bot_output',
                    data: { chunk: pcm.toString('base64'), sample_rate: MEETING_SAMPLE_RATE },
                }));
            } catch { return; }
            this.sentUntil += mulaw.length / 8;
        }
    }

    // ── The end ───────────────────────────────────────────────────────────

    closeLink(reason) {
        if (this.readyState !== WsLib.OPEN) return;
        this.readyState = WsLib.CLOSED;
        if (!this.endReason) this.endReason = reason;
        if (this.graceTimer) clearTimeout(this.graceTimer);
        if (this.paceTimer) clearInterval(this.paceTimer);
        this.graceTimer = null;
        this.paceTimer = null;
        this.clear();
        const ws = this.socket;
        this.socket = null;
        if (ws) { try { ws.close(1000, String(reason).slice(0, 120)); } catch { /* gone */ } }
        setImmediate(() => this.emit('close'));
    }

    /** handleVoiceStream closes its "socket" when the conversation ends. */
    close(_code, reason) {
        this.closeLink(reason || this.endReason || 'ended');
    }

    terminate() { this.closeLink('terminated'); }
}

module.exports = { AttendeeLink, MEETING_SAMPLE_RATE, LEAD_MS, RECONNECT_GRACE_MS };
