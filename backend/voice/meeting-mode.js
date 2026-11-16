/**
 * Meeting mode: an agent among several people, who mostly talk to each other.
 *
 * On a phone call every word is for the agent. In a meeting most are not, and
 * an agent that answers each one is unusable. Every engine here answers every
 * turn it hears, so asking the model to keep quiet is not enough on its own.
 * Two layers:
 *
 *   1. The prompt: who the agent is in the room, and to stay silent unless it
 *      is addressed by name or is plainly being answered.
 *   2. A gate on the agent's audio, transport-side, that holds the engine to
 *      it whatever the model does. The gate is OPEN after someone says one of
 *      the agent's names, and for a follow-up window after the agent last
 *      spoke. A reply that starts while the gate is closed is HELD briefly,
 *      because the transcript that would open it can arrive just after the
 *      reply's first audio. If no name arrives in time, the reply is dropped.
 *
 * `respondWhen: 'always'` keeps only the prompt's meeting framing and turns the
 * gate off, for a one-to-one meeting or a bot that is meant to chip in.
 *
 * Transport-neutral on purpose: it sees µ-law buffers and transcript text, and
 * hands back what may be played (meetings/attendee-link.js uses it).
 */

/** After the agent speaks or is named, how long the room may answer without naming it again. */
const FOLLOW_UP_MS = 15_000;
/** How long a reply that starts with the gate closed waits for a name to arrive. */
const HOLD_MS = 2_500;
/** A gap this long in the agent's audio ends one reply; the next audio starts another. */
const REPLY_GAP_MS = 800;
/** The greeting goes through: the gate starts open for this long. */
const GREETING_OPEN_MS = 8_000;

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The words that address the agent: each name in full, and the first word of a
 * multi-word name ("Ava from Acme" → "Ava"), when that word is long enough not
 * to be a common word by accident.
 * @param {readonly string[]} names
 * @returns {RegExp[]}
 */
function wakePatterns(names) {
    const words = new Set();
    for (const raw of names) {
        const name = fold(String(raw ?? '')).replace(/\s+/g, ' ').trim();
        if (!name) continue;
        words.add(name);
        const first = name.split(' ')[0];
        if (first.length >= 3 && first !== name) words.add(first);
    }
    return [...words].map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}($|[^\\p{L}\\p{N}])`, 'u'));
}

function mentionsAny(text, patterns) {
    const t = fold(text);
    return patterns.some((p) => p.test(t));
}

/** What the agent is told about the room. Appended to its own prompt. */
function meetingInstructions({ botName, respondWhen, wakeNames }) {
    const lines = [
        `You are in a video meeting as "${botName}". Several people are talking, and you hear all of them mixed together, without names.`,
        'Keep every reply short and spoken: no lists, no markdown, nothing you would not say out loud.',
    ];
    if (respondWhen === 'addressed') {
        const names = [...new Set([botName, ...wakeNames])].filter(Boolean).map((n) => `"${n}"`).join(', ');
        lines.push(
            `Speak only when someone addresses you by name (${names}), or is plainly answering something you just asked.`,
            'People talking to each other are not talking to you. When what you hear is not for you, say nothing at all: no acknowledgement, no filler.',
        );
    }
    return lines.join('\n');
}

class MeetingGate {
    /**
     * @param {{respondWhen: 'addressed' | 'always', names: readonly string[], emit: (mulaw: Buffer) => void, now?: () => number,
     *   followUpMs?: number, holdMs?: number, replyGapMs?: number, greetingOpenMs?: number}} opts
     */
    constructor(opts) {
        this.opts = opts;
        this.patterns = wakePatterns(opts.names);
        this.now = opts.now || Date.now;
        this.followUpMs = opts.followUpMs ?? FOLLOW_UP_MS;
        this.holdMs = opts.holdMs ?? HOLD_MS;
        this.replyGapMs = opts.replyGapMs ?? REPLY_GAP_MS;
        this.openUntil = this.now() + (opts.greetingOpenMs ?? GREETING_OPEN_MS);
        /** @type {'idle' | 'passing' | 'holding' | 'dropping'} */
        this.state = 'idle';
        this.lastAgentAudioAt = 0;
        this.holdDeadline = 0;
        this.held = [];
        /** Assistant text that arrived while its reply was undecided (held). */
        this.pendingText = [];
        /** Assistant text whose audio nobody heard; the call record leaves it out. */
        this.mutedText = [];
        /** Replies dropped, for the log line at the end. */
        this.mutedReplies = 0;
    }

    get enabled() { return this.opts.respondWhen === 'addressed'; }

    isOpen() { return !this.enabled || this.now() < this.openUntil; }

    /** A reply whose audio stopped a gap ago is over, whatever arrives next. */
    settle(now) {
        if (this.state !== 'idle' && now - this.lastAgentAudioAt > this.replyGapMs) this.endReply();
    }

    /** Someone in the room said something (the engine's transcript of the mixed audio). */
    userSaid(text) {
        if (!this.enabled) return;
        this.settle(this.now());
        if (!mentionsAny(text, this.patterns)) return;
        this.openUntil = Math.max(this.openUntil, this.now() + this.followUpMs);
        if (this.state === 'holding') {
            if (this.now() <= this.holdDeadline) this.release();
            else this.drop();
        }
    }

    /** A buffer of the agent's speech, as the engine produced it. */
    agentAudio(buf) {
        if (!this.enabled) { this.opts.emit(buf); return; }
        const now = this.now();
        this.settle(now);
        this.lastAgentAudioAt = now;

        if (this.state === 'idle') this.state = this.isOpen() ? 'passing' : 'holding';
        if (this.state === 'holding') {
            this.holdDeadline ||= now + this.holdMs;
            if (now > this.holdDeadline) { this.drop(); return; }
            this.held.push(buf);
            return;
        }
        if (this.state === 'dropping') return;
        this.openUntil = Math.max(this.openUntil, now + this.followUpMs);
        this.opts.emit(buf);
    }

    /** The engine's text of what the agent said (or would have). */
    agentSaid(text) {
        if (!this.enabled) return;
        this.settle(this.now());
        if (this.state === 'holding') this.pendingText.push(text);
        else if (this.state === 'dropping') this.mutedText.push(text);
        else if (this.state === 'idle' && !this.isOpen()) {
            // Text before audio (the classic engine writes its reply first): the
            // reply that follows is decided when its audio does.
            this.pendingText.push(text);
        }
    }

    /** Barge-in: whatever was queued or held is gone. */
    agentStopped() {
        if (this.state === 'holding') this.drop();
        this.endReply();
    }

    /** Called periodically: a hold whose time ran out with nobody naming the agent is dropped. */
    tick() {
        const now = this.now();
        if (this.state === 'holding' && now > this.holdDeadline) this.drop();
        else this.settle(now);
    }

    release() {
        this.state = 'passing';
        const held = this.held;
        this.held = [];
        this.holdDeadline = 0;
        this.pendingText = [];
        this.openUntil = Math.max(this.openUntil, this.now() + this.followUpMs);
        for (const b of held) this.opts.emit(b);
    }

    drop() {
        if (this.state !== 'dropping') this.mutedReplies += 1;
        this.state = 'dropping';
        this.held = [];
        this.holdDeadline = 0;
        this.mutedText.push(...this.pendingText);
        this.pendingText = [];
    }

    endReply() {
        if (this.state === 'holding') this.drop();
        this.state = 'idle';
        this.holdDeadline = 0;
        // Text that arrived with the gate closed and was never followed by audio was never heard either.
        if (this.pendingText.length && !this.isOpen()) this.mutedText.push(...this.pendingText);
        this.pendingText = [];
    }
}

/**
 * The transcript with the replies nobody heard taken out, each muted text
 * removing one matching assistant line.
 * @template {{role: string, content: string}} T
 * @param {T[]} transcript
 * @param {readonly string[]} muted
 * @returns {T[]}
 */
function withoutMuted(transcript, muted) {
    if (muted.length === 0) return transcript;
    const left = new Map();
    for (const m of muted) left.set(m.slice(0, 2000), (left.get(m.slice(0, 2000)) || 0) + 1);
    return transcript.filter((t) => {
        if (t.role !== 'assistant') return true;
        const key = String(t.content || '').slice(0, 2000);
        const n = left.get(key) || 0;
        if (n === 0) return true;
        left.set(key, n - 1);
        return false;
    });
}

module.exports = { FOLLOW_UP_MS, HOLD_MS, REPLY_GAP_MS, GREETING_OPEN_MS, wakePatterns, mentionsAny, meetingInstructions, MeetingGate, withoutMuted };
