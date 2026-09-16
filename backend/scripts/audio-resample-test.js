/**
 * Offline checks for the µ-law codec and the Gemini Live resamplers.
 *
 * The 24 kHz -> 8 kHz path is the one piece of the Gemini engine that cannot be judged
 * by ear after the fact: a missing anti-alias filter folds high frequencies down into
 * the voice band, and a filter that resets between chunks clicks at every boundary.
 * Both show up here as hard failures.
 *
 *   node scripts/audio-resample-test.js
 */

const { Pcm24kToMulaw8k, Mulaw8kToPcm16k } = require('../utils/audio-resample');
const { mulawToPcm16, pcm16ToMulaw, linearToMulawSample } = require('../utils/audio-codec');

function sine24k(freq, seconds, amp = 12000) {
    const n = Math.round(24000 * seconds);
    const buf = Buffer.allocUnsafe(n * 2);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(amp * Math.sin(2 * Math.PI * freq * i / 24000)), i * 2);
    return buf;
}
/** Magnitude of frequency f in a PCM s16le buffer at rate fs, normalised to amplitude. */
function magAt(pcm, f, fs) {
    const n = pcm.length >> 1;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
        const s = pcm.readInt16LE(i * 2);
        re += s * Math.cos(2 * Math.PI * f * i / fs);
        im += s * Math.sin(2 * Math.PI * f * i / fs);
    }
    return 2 * Math.hypot(re, im) / n;
}
const decode = (mulaw) => mulawToPcm16(mulaw);

let fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };

// 1. µ-law codec round trip
{
    // µ-law is logarithmic: error is proportional to magnitude, so relative error is the
    // meaningful metric above the quantisation floor and absolute error below it.
    let worstRel = 0, worstLow = 0;
    for (let s = -32768; s < 32768; s++) {
        const back = mulawToPcm16(Buffer.from([linearToMulawSample(s)])).readInt16LE(0);
        const err = Math.abs(back - s);
        if (Math.abs(s) >= 256) worstRel = Math.max(worstRel, err / Math.abs(s));
        else worstLow = Math.max(worstLow, err);
    }
    check('µ-law round trip within 8% (loud) ', worstRel < 0.08, `worst=${(worstRel * 100).toFixed(2)}%`);
    check('µ-law quantisation floor ≤ 8 LSB   ', worstLow <= 8, `worst=${worstLow} LSB`);
    const buf = Buffer.alloc(6); buf.writeInt16LE(1000, 0); buf.writeInt16LE(-1000, 2); buf.writeInt16LE(0, 4);
    check('pcm16ToMulaw halves the byte length', pcm16ToMulaw(buf).length === 3);
}

// 2. Passband: 1 kHz survives decimation to 8 kHz
{
    const out = decode(new Pcm24kToMulaw8k().process(sine24k(1000, 0.5)));
    const pass = magAt(out, 1000, 8000);
    check('1 kHz passes at full amplitude', pass > 11000 && pass < 13000, `amp=${Math.round(pass)} (in 12000)`);
}

// 3. Stopband: 6 kHz is filtered, NOT aliased down to 2 kHz
{
    const out = decode(new Pcm24kToMulaw8k().process(sine24k(6000, 0.5)));
    const alias = magAt(out, 2000, 8000);
    check('6 kHz does not alias to 2 kHz', alias < 12000 * 0.02, `alias amp=${Math.round(alias)} (${(20 * Math.log10(Math.max(alias, 1) / 12000)).toFixed(1)} dB)`);
}

// 4. Chunk-boundary continuity: odd chunk sizes must equal one big chunk
{
    const src = sine24k(800, 0.3);
    const whole = new Pcm24kToMulaw8k().process(src);
    const chunked = new Pcm24kToMulaw8k();
    const parts = [];
    const sizes = [317, 640, 91, 1280, 7];   // deliberately not multiples of 3 samples
    for (let off = 0, k = 0; off < src.length;) {
        let len = sizes[k++ % sizes.length];
        if (len % 2) len++;                   // never split a sample in half
        parts.push(chunked.process(src.subarray(off, Math.min(off + len, src.length))));
        off += len;
    }
    const joined = Buffer.concat(parts);
    check('chunked output byte-identical to whole', joined.equals(whole), `${joined.length} vs ${whole.length} bytes`);
}

// 5. Upsampler: length, rate, and no discontinuity across chunks
{
    const up = new Mulaw8kToPcm16k();
    const frame = pcm16ToMulaw(Buffer.concat([...Array(8)].map((_, i) => {
        const b = Buffer.allocUnsafe(40);
        for (let j = 0; j < 20; j++) b.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * 500 * (i * 20 + j) / 8000)), j * 2);
        return b;
    })));
    const whole = new Mulaw8kToPcm16k().process(frame);
    check('8k→16k doubles the sample count', whole.length === frame.length * 4, `${frame.length} µ-law bytes → ${whole.length >> 1} samples`);
    const a = up.process(frame.subarray(0, 63));
    const b = up.process(frame.subarray(63));
    check('upsampler continuous across chunks', Buffer.concat([a, b]).equals(whole));
    check('500 Hz preserved after upsampling', Math.abs(magAt(whole, 500, 16000) - 9000) < 900, `amp=${Math.round(magAt(whole, 500, 16000))}`);
}

// 6. Round trip through the full telephony path
{
    const src8k = Buffer.allocUnsafe(8000 * 2);
    for (let i = 0; i < 8000; i++) src8k.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / 8000)), i * 2);
    const up = new Mulaw8kToPcm16k().process(pcm16ToMulaw(src8k));   // 8k µ-law → 16k PCM
    check('440 Hz intact after µ-law→16k', Math.abs(magAt(up, 440, 16000) - 10000) < 1000, `amp=${Math.round(magAt(up, 440, 16000))}`);
}

console.log(fail === 0 ? '\nAll audio checks passed.' : `\n${fail} check(s) FAILED.`);
process.exit(fail === 0 ? 0 : 1);
