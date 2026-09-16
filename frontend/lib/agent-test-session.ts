/**
 * Live in-browser voice session with an agent.
 *
 * Speaks the same frame protocol the telephony transports use, so the server runs
 * the identical engine code it runs for a real call: 8 kHz G.711 µ-law both ways,
 * base64 inside JSON frames. Telephony-band audio is also the honest fidelity to
 * demo here — it is what a caller actually hears.
 *
 * Mic → AudioWorklet (µ-law encode) → WebSocket → engine → WebSocket → scheduled
 * AudioBuffers. Deliberately framework-free so both apps can use it unchanged.
 */

const FRAME_BYTES = 160; // 20 ms at 8 kHz
const TARGET_RATE = 8000;
/** How far ahead of the clock playback is scheduled; absorbs network jitter. */
const JITTER_LEAD_S = 0.15;
/** Longest the mic stays held waiting for the agent's opening line. */
const GREETING_HOLD_MAX_MS = 8000;
/** 20 ms of µ-law silence (0xFF), sent while the mic is held. */
const SILENCE_FRAME = new Uint8Array(FRAME_BYTES).fill(0xff);

const MULAW_DECODE = (() => {
    const table = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
        const inv = ~i & 0xff;
        const sign = inv & 0x80;
        const exponent = (inv >> 4) & 0x07;
        const mantissa = inv & 0x0f;
        let sample = ((mantissa << 3) + 0x84) << exponent;
        sample -= 0x84;
        table[i] = sign ? -sample : sample;
    }
    return table;
})();

function mulawToFloat32(bytes: Uint8Array): Float32Array<ArrayBuffer> {
    const out = new Float32Array(new ArrayBuffer(bytes.length * 4));
    for (let i = 0; i < bytes.length; i++) out[i] = MULAW_DECODE[bytes[i]] / 32768;
    return out;
}

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

export type SessionStatus =
    | 'idle'
    | 'requesting-mic'
    | 'connecting'
    | 'live'
    | 'ended';

export type EndReason = 'user' | 'agent' | 'cap' | 'error' | 'disconnected';

export type SessionFailure =
    | 'mic-denied'
    | 'mic-unavailable'
    | 'insecure-context'
    | 'unsupported-browser'
    | 'connection-failed';

export interface TranscriptLine {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface AgentTestSessionHandlers {
    onStatus?: (status: SessionStatus) => void;
    onTranscript?: (line: TranscriptLine) => void;
    onLevel?: (peak: number) => void;
    /** Agent audio is currently playing — drives the "speaking" indicator. */
    onAgentSpeaking?: (speaking: boolean) => void;
    onError?: (message: string) => void;
    onEnded?: (reason: EndReason) => void;
    onFailure?: (kind: SessionFailure) => void;
}

export class AgentTestSession {
    private ws: WebSocket | null = null;
    private ctx: AudioContext | null = null;
    private stream: MediaStream | null = null;
    private node: AudioWorkletNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private playing = new Set<AudioBufferSourceNode>();
    private cursor = 0;
    private speaking = false;
    private speakingTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * The agent opens the conversation. Until its first audio arrives the mic is
     * held closed, so room noise cannot trigger barge-in and talk over the
     * greeting before the user has heard any of it. Once the agent is audible the
     * mic opens and interrupting works normally.
     */
    private holdingForGreeting = true;
    private greetingHoldTimer: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;
    private status: SessionStatus = 'idle';

    constructor(private handlers: AgentTestSessionHandlers = {}) { }

    private setStatus(status: SessionStatus) {
        if (this.status === status) return;
        this.status = status;
        this.handlers.onStatus?.(status);
    }

    /**
     * Acquire the mic, then connect. The socket is opened only after the mic is
     * live so the agent never greets a room that cannot hear it yet.
     */
    async start(wsUrl: string): Promise<void> {
        if (typeof window === 'undefined') return;

        if (!window.isSecureContext) {
            this.handlers.onFailure?.('insecure-context');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
            this.handlers.onFailure?.('unsupported-browser');
            return;
        }

        this.setStatus('requesting-mic');
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                // Echo cancellation is load-bearing: without it the agent's own voice
                // returns through the mic and it interrupts itself.
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                },
                video: false,
            });
        } catch (err) {
            const name = (err as DOMException)?.name;
            this.handlers.onFailure?.(
                name === 'NotAllowedError' || name === 'SecurityError' ? 'mic-denied' : 'mic-unavailable'
            );
            this.setStatus('idle');
            return;
        }
        if (this.stopped) return void this.stop('user');

        try {
            await this.openAudio();
        } catch {
            this.handlers.onFailure?.('unsupported-browser');
            await this.stop('error');
            return;
        }
        if (this.stopped) return void this.stop('user');

        this.setStatus('connecting');
        this.openSocket(wsUrl);
    }

    private async openAudio() {
        // Ask for 8 kHz directly so the browser's own high-quality resampler does the
        // anti-alias work. Some browsers accept the hint and ignore it, so the actual
        // rate decides whether the worklet has to decimate.
        let ctx: AudioContext;
        try {
            ctx = new AudioContext({ sampleRate: TARGET_RATE });
        } catch {
            ctx = new AudioContext();
        }
        this.ctx = ctx;
        if (ctx.state === 'suspended') await ctx.resume();

        await ctx.audioWorklet.addModule('/worklets/mulaw-capture-worklet.js');

        const decimation = Math.max(1, Math.round(ctx.sampleRate / TARGET_RATE));
        this.node = new AudioWorkletNode(ctx, 'mulaw-capture', {
            numberOfInputs: 1,
            numberOfOutputs: 0,
            processorOptions: { decimation },
        });
        this.node.port.onmessage = (e) => {
            const { frame, peak } = e.data as { frame: Uint8Array; peak: number };
            if (typeof peak === 'number') this.handlers.onLevel?.(peak);
            this.sendFrame(frame);
        };

        this.source = ctx.createMediaStreamSource(this.stream!);
        this.source.connect(this.node);
    }

    private openSocket(wsUrl: string) {
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onopen = () => {
            // The server fills in identity from the ticket; this frame only says
            // "the mic is live, you may greet now".
            ws.send(JSON.stringify({ event: 'start', start: {} }));
            this.setStatus('live');
            // Safety valve: if the agent never speaks (misconfigured engine), the
            // user must still be able to talk rather than sit muted forever.
            this.greetingHoldTimer = setTimeout(() => this.releaseGreetingHold(), GREETING_HOLD_MAX_MS);
        };

        ws.onmessage = (event) => {
            let msg: any;
            try { msg = JSON.parse(event.data); } catch { return; }

            switch (msg.event) {
                case 'media':
                    this.playChunk(base64ToBytes(msg.media.payload));
                    break;
                case 'clear':
                    this.flushPlayback();
                    break;
                case 'ic.transcript':
                    this.handlers.onTranscript?.({ role: msg.role, content: msg.content });
                    break;
                case 'ic.error':
                    this.handlers.onError?.(msg.message || 'The voice service reported an error.');
                    break;
                case 'ic.end':
                    this.stop((msg.reason as EndReason) || 'agent');
                    break;
            }
        };

        ws.onerror = () => {
            if (this.status === 'connecting') this.handlers.onFailure?.('connection-failed');
        };

        ws.onclose = () => {
            if (this.stopped) return;
            // Closed by the far side without an ic.end — the session is over either way.
            this.stop('disconnected');
        };
    }

    private sendFrame(frame: Uint8Array) {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        // Under backpressure, drop rather than queue: stale mic audio is worse than none.
        if (ws.bufferedAmount > 256 * 1024) return;
        if (frame.length !== FRAME_BYTES) return;
        // Silence rather than nothing: the speech-recognition sockets time out if
        // audio stops arriving, so the stream has to keep flowing while held.
        const payload = this.holdingForGreeting ? SILENCE_FRAME : frame;
        ws.send(JSON.stringify({
            event: 'media',
            // The server only accepts inbound-track frames.
            media: { track: 'inbound', payload: bytesToBase64(payload) },
        }));
    }

    private playChunk(bytes: Uint8Array) {
        const ctx = this.ctx;
        if (!ctx || this.stopped) return;

        const samples = mulawToFloat32(bytes);
        // Always build the buffer at 8 kHz — when the context runs at another rate
        // the browser resamples it natively on playback.
        const buffer = ctx.createBuffer(1, samples.length, TARGET_RATE);
        buffer.copyToChannel(samples, 0);

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);

        // Re-prime the cursor after any gap, or playback would try to start in the past.
        if (this.cursor < ctx.currentTime + 0.02) this.cursor = ctx.currentTime + JITTER_LEAD_S;
        src.start(this.cursor);
        this.cursor += buffer.duration;

        this.playing.add(src);
        src.onended = () => this.playing.delete(src);

        this.releaseGreetingHold();
        this.markSpeaking();
    }

    /** Open the mic once the agent has been heard — or if it never speaks. */
    private releaseGreetingHold() {
        if (!this.holdingForGreeting) return;
        this.holdingForGreeting = false;
        if (this.greetingHoldTimer) { clearTimeout(this.greetingHoldTimer); this.greetingHoldTimer = null; }
    }

    /** Agent audio is arriving; go quiet again once the queue has drained. */
    private markSpeaking() {
        if (!this.speaking) {
            this.speaking = true;
            this.handlers.onAgentSpeaking?.(true);
        }
        if (this.speakingTimer) clearTimeout(this.speakingTimer);
        const remainingMs = Math.max(0, (this.cursor - (this.ctx?.currentTime ?? 0)) * 1000);
        this.speakingTimer = setTimeout(() => {
            this.speaking = false;
            this.handlers.onAgentSpeaking?.(false);
        }, remainingMs + 120);
    }

    /** Barge-in: drop everything queued so the agent stops mid-word. */
    private flushPlayback() {
        for (const src of this.playing) {
            try { src.stop(); } catch { /* already finished */ }
        }
        this.playing.clear();
        this.cursor = 0;
        if (this.speakingTimer) { clearTimeout(this.speakingTimer); this.speakingTimer = null; }
        if (this.speaking) {
            this.speaking = false;
            this.handlers.onAgentSpeaking?.(false);
        }
    }

    setMuted(muted: boolean) {
        this.node?.port.postMessage({ type: 'mute', value: muted });
    }

    /** Idempotent: close, release the mic, and report why. */
    async stop(reason: EndReason = 'user'): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;

        this.flushPlayback();
        if (this.greetingHoldTimer) { clearTimeout(this.greetingHoldTimer); this.greetingHoldTimer = null; }

        const ws = this.ws;
        this.ws = null;
        if (ws) {
            try {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ event: 'stop' }));
                }
                ws.onclose = null;
                ws.close();
            } catch { /* already gone */ }
        }

        try { this.source?.disconnect(); } catch { }
        try { this.node?.disconnect(); } catch { }
        if (this.node) this.node.port.onmessage = null;
        this.source = null;
        this.node = null;

        // Stopping the tracks is what turns the browser's mic indicator off.
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;

        const ctx = this.ctx;
        this.ctx = null;
        if (ctx && ctx.state !== 'closed') { try { await ctx.close(); } catch { } }

        this.setStatus('ended');
        this.handlers.onEnded?.(reason);
    }
}
