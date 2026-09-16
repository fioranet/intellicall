/**
 * Offline checks for the Gemini Live protocol mapping.
 *
 * Feeds synthetic BidiGenerateContent server messages through the bridge and asserts the
 * telephony-facing behaviour: audio is resampled to µ-law, every part of a multi-part
 * event is played, transcripts flush at turn boundaries, interruptions reach the
 * transport, tool calls are answered, and end_call waits for the goodbye.
 *
 * Nothing here touches the network — a wrong protocol assumption shows up as a failure
 * rather than as a silent call.
 *
 *   node scripts/gemini-live-test.js
 */

const B = require('path').join(__dirname, '..');
const { GeminiLiveBridge } = require(B + '/services/gemini-live/gemini-bridge');
const { mulawToPcm16 } = require(B + '/utils/audio-codec');

let fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };

function makeBridge(agentOverrides = {}) {
    const b = new GeminiLiveBridge({
        callId: 'test-call',
        settings: { geminiKey: 'k', userId: 'u1' },
        agent: { systemPrompt: 'Be helpful.', openingMessage: 'Hello!', geminiVoice: 'Kore', geminiLanguage: 'auto', ...agentOverrides },
        lead: { phone: '+911234567890', name: 'Asha' },
    });
    b.active = true;
    const sent = [];
    b.ws = { readyState: 1, send: (s) => sent.push(JSON.parse(s)) };
    b._sent = sent;
    return b;
}
/** 24 kHz PCM sine, base64, as Gemini would send it. */
function pcm24Base64(ms, freq = 440) {
    const n = Math.round(24 * ms);
    const buf = Buffer.allocUnsafe(n * 2);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * freq * i / 24000)), i * 2);
    return buf.toString('base64');
}

// setupComplete flushes buffered audio and nudges the first turn
{
    const b = makeBridge();
    b.sendAudio(Buffer.alloc(160, 0xFF));            // arrives before setup
    check('audio before setup is buffered', b.audioBufferQueue.length === 1);
    b._handleMessage(JSON.stringify({ setupComplete: {} }));
    check('setupComplete drains the buffer', b.audioBufferQueue.length === 0);
    const kinds = b._sent.map(m => Object.keys(m)[0]);
    check('buffered audio sent as realtimeInput', kinds.includes('realtimeInput'));
    const nudge = b._sent.find(m => m.realtimeInput?.text);
    check('first turn is nudged', !!nudge, nudge?.realtimeInput?.text?.slice(0, 40));
    const audioMsg = b._sent.find(m => m.realtimeInput?.audio);
    check('audio mime is 16 kHz PCM', audioMsg?.realtimeInput?.audio?.mimeType === 'audio/pcm;rate=16000', audioMsg?.realtimeInput?.audio?.mimeType);
    check('160 µ-law bytes → 640 PCM bytes', Buffer.from(audioMsg.realtimeInput.audio.data, 'base64').length === 640);
}

// model audio → µ-law at the right rate
{
    const b = makeBridge();
    b._handleMessage(JSON.stringify({ setupComplete: {} }));
    let got = Buffer.alloc(0);
    b.onAudio = (buf) => { got = Buffer.concat([got, buf]); };
    b._handleMessage(JSON.stringify({
        serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm24Base64(60) } }] } },
    }));
    check('24k PCM → 8k µ-law (⅓ the samples)', Math.abs(got.length - 480) <= 2, `${got.length} bytes for 60ms (expect ~480)`);
    const pcm = mulawToPcm16(got);
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    check('agent audio is not silence or clipping', peak > 6000 && peak < 12000, `peak=${peak}`);
}

// several parts in one event (3.1 packs audio + transcript together)
{
    const b = makeBridge();
    b._handleMessage(JSON.stringify({ setupComplete: {} }));
    let chunks = 0;
    b.onAudio = () => chunks++;
    b._handleMessage(JSON.stringify({
        serverContent: {
            outputTranscription: { text: 'Hello there' },
            modelTurn: { parts: [
                { inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm24Base64(20) } },
                { inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm24Base64(20) } },
            ] },
        },
    }));
    check('every part in an event is played', chunks === 2, `${chunks} chunks`);
}

// transcripts flush at the right boundaries
{
    const b = makeBridge();
    b._handleMessage(JSON.stringify({ setupComplete: {} }));
    const seen = [];
    b.onTranscript = (role, content) => seen.push(`${role}:${content}`);
    b._handleMessage(JSON.stringify({ serverContent: { inputTranscription: { text: 'I want ' } } }));
    b._handleMessage(JSON.stringify({ serverContent: { inputTranscription: { text: 'an appointment' } } }));
    check('user fragments are not emitted early', seen.length === 0);
    b._handleMessage(JSON.stringify({ serverContent: { outputTranscription: { text: 'Sure, ' } } }));
    check('user turn flushes when the model answers', seen[0] === 'user:I want an appointment', seen[0]);
    b._handleMessage(JSON.stringify({ serverContent: { outputTranscription: { text: 'what day?' } } }));
    b._handleMessage(JSON.stringify({ serverContent: { turnComplete: true } }));
    check('agent turn flushes on turnComplete', seen[1] === 'assistant:Sure, what day?', seen[1]);
    check('transcript recorded for the CallLog', b.transcript.length === 2 && b.transcript[0].role === 'user');
}

// barge-in
{
    const b = makeBridge();
    b._handleMessage(JSON.stringify({ setupComplete: {} }));
    let barged = 0;
    b.onBargeIn = () => barged++;
    b._handleMessage(JSON.stringify({ serverContent: { outputTranscription: { text: 'As I was saying' } } }));
    b._handleMessage(JSON.stringify({ serverContent: { interrupted: true } }));
    check('interrupted fires onBargeIn', barged === 1);
    check('partial agent speech is kept in the transcript', b.transcript.some(t => t.content === 'As I was saying'));
}

// reconnect behaviour: greeting after a failed first connect, silence when resuming
{
    const b = makeBridge();
    b.reconnectAttempts = 2;                                   // first connects failed
    b._handleMessage(JSON.stringify({ setupComplete: {} }));
    check('greets after a failed first connect', b._sent.some(m => m.realtimeInput?.text));

    const r = makeBridge();
    r._resumptionHandle = 'handle-123';                        // mid-call connection rotation
    r._handleMessage(JSON.stringify({ setupComplete: {} }));
    check('stays quiet when resuming mid-call', !r._sent.some(m => m.realtimeInput?.text));

    const g = makeBridge();
    g._handleMessage(JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: 'h9' } }));
    check('resumption handle is stored', g._resumptionHandle === 'h9');
    g._handleMessage(JSON.stringify({ goAway: { timeLeft: '10s' } }));
    check('goAway marks the rotation', g._goingAway === true);
}

// RTP framing: only whole 20ms frames are queued, and no bytes are lost
{
    const SipGeminiLiveStream = require(B + '/services/sip/sip-gemini-live-stream');
    const s = new SipGeminiLiveStream({ userId: 'u', agentId: 'a', leadId: 'l', direction: 'outbound', callId: 'c', rtpPort: 1 });
    s.udpSocket = { send() {} };
    s.remoteAddress = '127.0.0.1';
    s.remotePort = 1000;
    s._rtpTimer = 1;                                            // hold the drain so the queue is inspectable
    let fed = 0;
    for (const size of [317, 91, 640, 7, 205]) { s._sendRtp(Buffer.alloc(size, 0x7F)); fed += size; }
    const queued = s._rtpQueue.reduce((n, c) => n + c.length, 0);
    const partial = s._rtpPartial ? s._rtpPartial.length : 0;
    check('only whole 160-byte frames queued', s._rtpQueue.every(c => c.length === 160), `sizes=${[...new Set(s._rtpQueue.map(c => c.length))]}`);
    check('no audio bytes dropped', queued + partial === fed, `${queued}+${partial} of ${fed}`);
    s._clearPlayback();
    check('barge-in clears the partial frame', s._rtpPartial === null && s._rtpQueue.length === 0);
}

// tool call → tool response, and the end_call guard rails
{
    const b = makeBridge();
    b._handleMessage(JSON.stringify({ setupComplete: {} }));
    b._sent.length = 0;
    b._connectedAt = Date.now() - 60000;                       // old enough to hang up
    b.transcript.push({ role: 'user', content: 'bye', timestamp: new Date() });
    let ended = 0;
    b.onEndCall = () => ended++;

    b._handleMessage(JSON.stringify({ toolCall: { functionCalls: [{ id: 'fc1', name: 'end_call', args: { reason: 'caller said goodbye' } }] } }));
    setTimeout(() => {
        const resp = b._sent.find(m => m.toolResponse);
        check('toolResponse is sent', !!resp, JSON.stringify(resp?.toolResponse?.functionResponses?.[0]?.name));
        check('response carries the call id', resp?.toolResponse?.functionResponses?.[0]?.id === 'fc1');
        check('end_call armed, not fired yet', b._endCallArmed === true && ended === 0);
        b._handleMessage(JSON.stringify({ serverContent: { generationComplete: true } }));
        check('generationComplete ends the call', ended === 1);

        // guard rail: a fresh call with no caller speech must not hang up
        const c = makeBridge();
        c._handleMessage(JSON.stringify({ setupComplete: {} }));
        c._connectedAt = Date.now();
        c._executeFunction('end_call', {}).then((r) => {
            check('end_call refused on a seconds-old call', /cannot be ended/.test(r), r.slice(0, 40));
            console.log(fail === 0 ? '\nAll bridge protocol checks passed.' : `\n${fail} check(s) FAILED.`);
            process.exit(fail === 0 ? 0 : 1);
        });
    }, 50);
}
