/**
 * Microphone capture worklet for the in-browser agent test.
 *
 * Turns the mic into exactly what every voice engine expects: 20 ms frames of
 * 8 kHz G.711 µ-law, the same format a phone line delivers. Encoding here rather
 * than on the server keeps the wire at 8 KB/s and means the backend needs no new
 * resampling code.
 *
 * The AudioContext is normally opened at 8 kHz, so the browser's own resampler
 * has already done the anti-alias filtering and `decimation` is 1. When a browser
 * refuses that rate (older Safari), it runs at the native rate instead and we
 * decimate here, low-passing first so nothing above ~3.4 kHz folds back into the
 * voice band as a whistle.
 */

const FRAME_SAMPLES = 160; // 20 ms at 8 kHz
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

function linearToMulaw(sample) {
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > MULAW_CLIP) sample = MULAW_CLIP;
    sample += MULAW_BIAS;
    let exponent = 7;
    for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

class MulawCaptureProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const opts = (options && options.processorOptions) || {};
        // How many input samples make one output sample. 1 when the context is
        // already at 8 kHz, which is the normal path.
        this.decimation = Math.max(1, Math.round(opts.decimation || 1));
        this.frame = new Int16Array(FRAME_SAMPLES);
        this.filled = 0;
        this.phase = 0;
        // One-pole low-pass, only used when we decimate ourselves.
        this.lp = 0;
        this.alpha = this.decimation > 1 ? 1 / this.decimation : 1;
        this.muted = false;
        this.port.onmessage = (e) => {
            if (e.data && e.data.type === 'mute') this.muted = !!e.data.value;
        };
    }

    process(inputs) {
        const input = inputs[0];
        const channel = input && input[0];
        if (!channel) return true;

        for (let i = 0; i < channel.length; i++) {
            let sample = channel[i];

            if (this.decimation > 1) {
                this.lp += this.alpha * (sample - this.lp);
                if (this.phase++ % this.decimation !== 0) continue;
                sample = this.lp;
            }

            // Muting sends µ-law silence rather than stopping the stream: the
            // speech-recognition sockets time out if audio stops arriving.
            const clamped = this.muted ? 0 : Math.max(-1, Math.min(1, sample));
            this.frame[this.filled++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

            if (this.filled === FRAME_SAMPLES) {
                const out = new Uint8Array(FRAME_SAMPLES);
                let peak = 0;
                for (let j = 0; j < FRAME_SAMPLES; j++) {
                    const s = this.frame[j];
                    if (s > peak) peak = s;
                    out[j] = linearToMulaw(s);
                }
                // `peak` drives the mic level meter; it costs nothing to compute here.
                this.port.postMessage({ frame: out, peak: peak / 0x7fff }, [out.buffer]);
                this.filled = 0;
            }
        }
        return true;
    }
}

registerProcessor('mulaw-capture', MulawCaptureProcessor);
