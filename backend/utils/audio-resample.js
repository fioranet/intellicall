/**
 * Sample-rate conversion between telephony audio and the Gemini Live API.
 *
 * The SIP leg is G.711 µ-law at 8 kHz in both directions. Gemini Live wants raw
 * 16-bit PCM at 16 kHz on the way in and hands back raw 16-bit PCM at 24 kHz on the
 * way out, so this engine — unlike Deepgram/Sarvam/ElevenLabs, which all speak µ-law
 * natively — has to resample every frame of every call.
 *
 * Both directions are stateful and one instance belongs to one call. Audio arrives in
 * arbitrarily sized chunks that do not line up with the conversion ratio, and a filter
 * or interpolator that resets between chunks clicks audibly at every boundary.
 */

const { mulawToPcm16, linearToMulawSample } = require('./audio-codec');

// ─── Anti-alias filter (24 kHz → 8 kHz) ──────────────────────

const DECIMATION = 3;          // 24000 / 8000
const NUM_TAPS = 48;           // ~2ms group delay, >40dB stopband — plenty for voice
const CUTOFF_HZ = 3400;        // telephony passband
const SOURCE_RATE = 24000;

/**
 * Windowed-sinc low-pass, computed once at module load and shared by every call.
 *
 * Dropping every third sample without this folds everything between 4 kHz and 12 kHz
 * back down into the voice band, which is what makes naively downsampled TTS sound
 * metallic on a phone line.
 */
const TAPS = (() => {
    const taps = new Float32Array(NUM_TAPS);
    const fc = CUTOFF_HZ / SOURCE_RATE;      // cycles per sample
    const mid = (NUM_TAPS - 1) / 2;
    let sum = 0;
    for (let i = 0; i < NUM_TAPS; i++) {
        const n = i - mid;
        const sinc = n === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
        const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (NUM_TAPS - 1));
        taps[i] = sinc * hamming;
        sum += taps[i];
    }
    for (let i = 0; i < NUM_TAPS; i++) taps[i] /= sum;   // unity gain at DC
    return taps;
})();

/**
 * Gemini audio (PCM s16le @ 24 kHz) → telephony audio (µ-law @ 8 kHz).
 *
 * Polyphase: only every third output sample is evaluated, so the filter costs
 * 8000 × 48 multiply-accumulates per second of audio rather than 24000 × 48.
 */
class Pcm24kToMulaw8k {
    constructor() {
        /** Tail of the previous chunk — the filter window reaches back across chunks. */
        this._history = new Float32Array(NUM_TAPS - 1);
        /** Absolute input index of the next output sample. */
        this._nextOut = 0;
        /** Absolute count of input samples consumed so far. */
        this._consumed = 0;
    }

    /**
     * @param {Buffer} pcm  PCM s16le at 24 kHz
     * @returns {Buffer}    G.711 µ-law at 8 kHz
     */
    process(pcm) {
        const inCount = pcm.length >> 1;
        if (inCount === 0) return Buffer.alloc(0);

        const histLen = NUM_TAPS - 1;
        // Absolute index of window[0] is (this._consumed - histLen).
        const window = new Float32Array(histLen + inCount);
        window.set(this._history, 0);
        for (let i = 0; i < inCount; i++) {
            window[histLen + i] = pcm.readInt16LE(i * 2);
        }

        const end = this._consumed + inCount;
        const outCount = Math.max(0, Math.ceil((end - this._nextOut) / DECIMATION));
        const out = Buffer.allocUnsafe(outCount);

        let written = 0;
        for (let n = this._nextOut; n < end; n += DECIMATION) {
            const p = n - this._consumed + histLen;     // position of x[n] in window
            let acc = 0;
            for (let t = 0; t < NUM_TAPS; t++) {
                acc += TAPS[t] * window[p - t];
            }
            let sample = Math.round(acc);
            if (sample > 32767) sample = 32767;
            else if (sample < -32768) sample = -32768;
            out[written++] = linearToMulawSample(sample);
            this._nextOut = n + DECIMATION;
        }

        this._consumed = end;
        this._history.set(window.subarray(window.length - histLen));
        return written === out.length ? out : out.subarray(0, written);
    }
}

// ─── Upsampler (8 kHz → 16 kHz) ──────────────────────────────

/**
 * Telephony audio (µ-law @ 8 kHz) → Gemini audio (PCM s16le @ 16 kHz).
 *
 * Linear interpolation is enough here: the source is already band-limited to ~3.4 kHz
 * by the phone network, so there is nothing above 4 kHz for an anti-imaging filter to
 * remove. Sample-and-hold is not enough — it mirrors the spectrum and audibly degrades
 * recognition.
 */
class Mulaw8kToPcm16k {
    constructor() {
        /** Last sample of the previous chunk, so the seam is interpolated too. */
        this._prev = 0;
    }

    /**
     * @param {Buffer} mulawBuf  G.711 µ-law at 8 kHz
     * @returns {Buffer}         PCM s16le at 16 kHz
     */
    process(mulawBuf) {
        if (mulawBuf.length === 0) return Buffer.alloc(0);
        const pcm = mulawToPcm16(mulawBuf);
        const n = pcm.length >> 1;
        const out = Buffer.allocUnsafe(n * 4);   // 2 output samples per input sample

        let prev = this._prev;
        for (let i = 0; i < n; i++) {
            const cur = pcm.readInt16LE(i * 2);
            out.writeInt16LE((prev + cur) >> 1, i * 4);
            out.writeInt16LE(cur, i * 4 + 2);
            prev = cur;
        }
        this._prev = prev;
        return out;
    }
}

module.exports = { Pcm24kToMulaw8k, Mulaw8kToPcm16k, TAPS, NUM_TAPS, DECIMATION };
