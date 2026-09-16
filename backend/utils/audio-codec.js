/**
 * G.711 µ-law (PCMU) codec helpers.
 *
 * Telephony (Twilio Media Streams / Asterisk RTP) carries 8 kHz G.711 µ-law audio.
 * Sarvam's streaming STT accepts linear PCM (pcm_s16le), not µ-law, so caller audio
 * must be decoded before it is sent. (Sarvam TTS can emit µ-law directly, so the
 * reverse direction needs no conversion.)
 *
 * The Gemini Live engine needs the encode direction too: it returns raw PCM, which has
 * to become µ-law before it can go out as RTP. See utils/audio-resample.js.
 */

// Precomputed µ-law → 16-bit signed PCM lookup table (256 entries).
const MULAW_DECODE_TABLE = (() => {
    const BIAS = 0x84; // 132
    const table = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
        const u = ~i & 0xFF;
        let sample = ((u & 0x0F) << 3) + BIAS;
        sample <<= (u & 0x70) >> 4;
        sample -= BIAS;
        table[i] = (u & 0x80) ? -sample : sample;
    }
    return table;
})();

/**
 * Decode a Buffer of 8-bit µ-law samples into little-endian 16-bit PCM.
 * @param {Buffer} mulawBuf
 * @returns {Buffer} PCM s16le, twice the input length.
 */
function mulawToPcm16(mulawBuf) {
    const out = Buffer.allocUnsafe(mulawBuf.length * 2);
    for (let i = 0; i < mulawBuf.length; i++) {
        out.writeInt16LE(MULAW_DECODE_TABLE[mulawBuf[i]], i * 2);
    }
    return out;
}

/**
 * Segment (exponent) lookup for µ-law encoding, indexed by (biased sample >> 7) & 0xFF.
 * Equivalent to floor(log2(i)) — the canonical 0,0,1,1,2×4,3×8,4×16,5×32,6×64,7×128 table.
 */
const MULAW_SEGMENT_TABLE = (() => {
    const table = new Uint8Array(256);
    for (let i = 1; i < 256; i++) table[i] = 31 - Math.clz32(i);
    return table;
})();

const MULAW_BIAS = 0x84;   // 132
const MULAW_CLIP = 32635;  // 32767 - BIAS

/**
 * Encode one 16-bit signed sample as µ-law.
 * @param {number} sample  PCM s16, already clamped to [-32768, 32767]
 * @returns {number} µ-law byte
 */
function linearToMulawSample(sample) {
    const sign = sample < 0 ? 0x80 : 0x00;
    let magnitude = sign ? -sample : sample;
    if (magnitude > MULAW_CLIP) magnitude = MULAW_CLIP;
    magnitude += MULAW_BIAS;

    const exponent = MULAW_SEGMENT_TABLE[(magnitude >> 7) & 0xFF];
    const mantissa = (magnitude >> (exponent + 3)) & 0x0F;
    return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

/**
 * Encode a Buffer of little-endian 16-bit PCM as 8-bit µ-law.
 * @param {Buffer} pcmBuf  PCM s16le
 * @returns {Buffer} µ-law, half the input length.
 */
function pcm16ToMulaw(pcmBuf) {
    const count = pcmBuf.length >> 1;
    const out = Buffer.allocUnsafe(count);
    for (let i = 0; i < count; i++) {
        out[i] = linearToMulawSample(pcmBuf.readInt16LE(i * 2));
    }
    return out;
}

module.exports = { mulawToPcm16, pcm16ToMulaw, linearToMulawSample };
