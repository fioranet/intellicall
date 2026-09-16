/**
 * TTS text chunking for the classic (LLM → ElevenLabs) pipelines.
 *
 * Two modes, chosen by the agent's voice-quality config (utils/voice-quality.js):
 *
 * legacy  — exactly the historical behaviour: flush the whole buffer whenever a
 *           streamed delta contains any of [.,!?\n], plus a 12-char fast path
 *           before the first audio chunk. Kept for agents on the 'default'
 *           preset so their calls sound identical to previous releases.
 *
 * prosody — flush on sentence-final punctuation, but only flush on a comma /
 *           semicolon / colon once the clause is long enough to stand on its
 *           own. Aggressively comma-flushed fragments ("Hola," … "además,")
 *           audibly clip articles and prepositions in Romance languages;
 *           sending linguistically complete clauses lets ElevenLabs shape the
 *           intonation across the whole clause.
 *
 * Usage per LLM turn:
 *   const buf = new TtsChunkBuffer(voiceQuality.chunking);
 *   for each streamed delta: for (const chunk of buf.push(delta)) send(chunk);
 *   at end of stream:        const rest = buf.drain(); if (rest) send(rest);
 */

/** Sentence-final punctuation — always a flush point. */
const HARD_BOUNDARY = /[.?!\n]/;
/** Clause punctuation — a flush point only once the clause is long enough. */
const SOFT_BOUNDARY = /[,;:]/;

class TtsChunkBuffer {
    /**
     * @param {object} opts
     * @param {boolean} opts.legacy          historical flush behaviour
     * @param {number}  opts.minClauseChars  prosody mode: min chars before a soft boundary flushes
     * @param {number}  opts.firstChunkChars fast-path length before the first chunk is out
     */
    constructor({ legacy = false, minClauseChars = 48, firstChunkChars = 24 } = {}) {
        this.legacy = legacy;
        this.minClauseChars = minClauseChars;
        this.firstChunkChars = firstChunkChars;
        this.buffer = '';
        this.sentAny = false;
    }

    /** Append a streamed delta; returns an array of chunks ready for TTS (possibly empty). */
    push(delta) {
        if (!delta) return [];
        this.buffer += delta;
        return this.legacy ? this._pushLegacy(delta) : this._pushProsody();
    }

    _pushLegacy(delta) {
        const shouldFlush = HARD_BOUNDARY.test(delta) || SOFT_BOUNDARY.test(delta) ||
            (this.buffer.length >= this.firstChunkChars && !this.sentAny);
        if (!shouldFlush || !this.buffer.trim()) return [];
        const out = this.buffer;
        this.buffer = '';
        this.sentAny = true;
        return [out];
    }

    _pushProsody() {
        const out = [];
        // Repeatedly carve complete clauses/sentences off the front of the buffer.
        for (; ;) {
            const cut = this._findCut();
            if (cut < 0) break;
            const chunk = this.buffer.slice(0, cut);
            this.buffer = this.buffer.slice(cut);
            if (chunk.trim()) {
                out.push(chunk);
                this.sentAny = true;
            }
        }
        return out;
    }

    /**
     * Index to cut the buffer at (exclusive), or -1 to keep buffering.
     * A boundary only counts when followed by whitespace (or a newline itself), so
     * "3.5" or "1,200" never split mid-number; the trailing boundary at buffer end
     * is left for the next delta / drain, since we can't yet tell "3." from "done.".
     */
    _findCut() {
        const firstChunkPending = !this.sentAny;
        for (let i = 0; i < this.buffer.length - 1; i++) {
            const ch = this.buffer[i];
            const next = this.buffer[i + 1];
            if (ch === '\n') return i + 1;
            if (HARD_BOUNDARY.test(ch) && /\s/.test(next)) return i + 2; // include the space
            if (SOFT_BOUNDARY.test(ch) && /\s/.test(next)) {
                // Comma-flush only a clause long enough to carry its own prosody —
                // except before the first chunk, where any boundary beats waiting.
                if (i + 1 >= this.minClauseChars || (firstChunkPending && i + 1 >= this.firstChunkChars)) {
                    return i + 2;
                }
            }
        }
        // First-audio fast path: nothing sent yet and no boundary in sight — flush up to
        // the last word break once the buffer is clearly past the fast-path length, so
        // the caller isn't left waiting for a long opening sentence to finish.
        if (firstChunkPending && this.buffer.length >= this.firstChunkChars * 3) {
            const lastSpace = this.buffer.lastIndexOf(' ');
            if (lastSpace > this.firstChunkChars) return lastSpace + 1;
        }
        return -1;
    }

    /** End of the LLM stream — return whatever is left (or '' if nothing). */
    drain() {
        const rest = this.buffer;
        this.buffer = '';
        return rest.trim() ? rest : '';
    }
}

module.exports = { TtsChunkBuffer };
