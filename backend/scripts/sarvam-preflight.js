#!/usr/bin/env node
/**
 * Sarvam voice-engine preflight.
 *
 * Run this on the machine that runs the backend, with the same Sarvam key the app uses
 * (Settings → Sarvam API key):
 *
 *   node scripts/sarvam-preflight.js --key <SARVAM_KEY> [--lang ml-IN] [--speaker priya]
 *   SARVAM_API_KEY=... node scripts/sarvam-preflight.js
 *
 * It answers the two questions the voice path can't answer for itself:
 *
 *  1. Does Bulbul actually return µ-law at 8 kHz when we ask for it? Bulbul v3 defaults to
 *     24 kHz; if `speech_sample_rate` were ignored we would be playing 24 kHz audio out an
 *     8 kHz RTP leg — three times too slow, and silent as a failure mode. The check is exact:
 *     µ-law at 8 kHz is 8 bytes per millisecond.
 *
 *  2. Is this account enabled for the realtime STT endpoint? If not, the
 *     bridge falls back to the legacy socket, which emits no partial transcripts and therefore
 *     cannot barge in until the caller has already stopped talking.
 *
 * The two are chained: the TTS audio from step 1 is streamed straight into STT in step 2, so a
 * sample-rate mismatch also shows up as a garbled transcript.
 */
const WebSocket = require('ws');
const {
    SARVAM_STT_REALTIME_MODEL, SARVAM_STT_MODEL, SARVAM_TTS_MODEL, resolveSarvamSpeaker,
} = require('../utils/sarvam-voices');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const KEY = flag('key', process.env.SARVAM_API_KEY || '');
const LANG = flag('lang', 'hi-IN');
const SPEAKER = resolveSarvamSpeaker(flag('speaker', ''));
const PHRASE = flag('text', LANG.startsWith('ml') ? 'നമസ്കാരം, എനിക്ക് നിങ്ങളെ സഹായിക്കാൻ കഴിയും.' : 'नमस्ते, मैं आपकी मदद कर सकता हूँ।');

if (!KEY) {
    console.error('Missing Sarvam key. Pass --key <key> or set SARVAM_API_KEY.');
    process.exit(2);
}

const BYTES_PER_MS = 8;              // µ-law, 8 kHz, mono
const CHUNK_BYTES = 800;             // ~100ms per websocket frame, matching the bridge
const results = [];
const pass = (name, detail) => { results.push([true, name, detail]); console.log(`  ✅ ${name} — ${detail}`); };
const fail = (name, detail) => { results.push([false, name, detail]); console.log(`  ❌ ${name} — ${detail}`); };

/** Step 1 — synthesize a known phrase and verify the audio format byte-exactly. */
function synthesize() {
    return new Promise((resolve) => {
        const url = `wss://api.sarvam.ai/text-to-speech/ws?model=${SARVAM_TTS_MODEL}&send_completion_event=true`;
        const ws = new WebSocket(url, { headers: { 'Api-Subscription-Key': KEY } });
        const chunks = [];
        let contentType = '';
        let settled = false;
        const done = (err) => { if (settled) return; settled = true; try { ws.close(); } catch (_) { } resolve({ err, chunks, contentType }); };
        const timer = setTimeout(() => done('timed out after 20s'), 20000);

        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'config',
                data: {
                    language_code: LANG, target_language_code: LANG, speaker: SPEAKER,
                    model: SARVAM_TTS_MODEL, speech_sample_rate: '8000', output_audio_codec: 'mulaw',
                    min_buffer_size: 30, max_chunk_length: 150, pace: 1.0, temperature: 0.4,
                },
            }));
            ws.send(JSON.stringify({ type: 'text', data: { text: PHRASE } }));
            ws.send(JSON.stringify({ type: 'flush' }));
        });
        ws.on('message', (raw) => {
            let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
            if (m.type === 'audio' && m.data?.audio) {
                if (!contentType) contentType = m.data.content_type || '(unspecified)';
                chunks.push(Buffer.from(m.data.audio, 'base64'));
            } else if (m.type === 'event' && m.data?.event_type === 'final') {
                clearTimeout(timer); done(null);
            } else if (m.type === 'error' || m.error) {
                clearTimeout(timer); done(m.data?.message || m.data?.error || JSON.stringify(m));
            }
        });
        ws.on('unexpected-response', (_r, res) => { clearTimeout(timer); done(`handshake rejected: HTTP ${res.statusCode}`); });
        ws.on('error', (e) => { clearTimeout(timer); done(e.message); });
        ws.on('close', (code, reason) => { clearTimeout(timer); done(chunks.length ? null : `closed before any audio (code=${code} ${reason || ''})`); });
    });
}

/** Step 2 — stream that audio back into an STT socket and see what comes out. */
function transcribe(audio, flavor) {
    return new Promise((resolve) => {
        const realtime = flavor === 'realtime';
        const url = realtime
            ? 'wss://api.sarvam.ai/speech-to-text-realtime/ws?' + new URLSearchParams({
                model: SARVAM_STT_REALTIME_MODEL, language_code: LANG === 'od-IN' ? 'or-IN' : LANG,
                stream_type: 'fast', mode: 'transcribe', endpointing: 'vad',
                encoding: 'mulaw', sample_rate: '8000',
                threshold: '0.7', min_speech_duration_ms: '200', silence_duration_ms: '500',
                prefix_padding_ms: '300',
            })
            : 'wss://api.sarvam.ai/speech-to-text/ws?' + new URLSearchParams({
                model: SARVAM_STT_MODEL, 'language-code': LANG, sample_rate: '8000',
                input_audio_codec: 'pcm_s16le', vad_signals: 'true', high_vad_sensitivity: 'true',
            });

        const ws = new WebSocket(url, { headers: { 'api-subscription-key': KEY } });
        const out = { partials: 0, finals: [], connected: false, closeCode: 0, closeReason: '', err: null };
        let settled = false;
        const done = () => { if (settled) return; settled = true; try { ws.close(); } catch (_) { } resolve(out); };
        const timer = setTimeout(done, 25000);

        ws.on('open', async () => {
            out.connected = true;
            // µ-law feeds the realtime socket directly; the legacy socket needs PCM16.
            const { mulawToPcm16 } = require('../utils/audio-codec');
            for (let i = 0; i < audio.length; i += CHUNK_BYTES) {
                if (ws.readyState !== WebSocket.OPEN) break;
                const slice = audio.slice(i, i + CHUNK_BYTES);
                ws.send(realtime
                    ? JSON.stringify({ event: 'audio_input', audio: slice.toString('base64') })
                    : JSON.stringify({ audio: { data: mulawToPcm16(slice).toString('base64'), sample_rate: '8000', encoding: 'audio/wav' } }));
                await new Promise(r => setTimeout(r, 100));   // pace it like a real call
            }
            // Let the server's VAD close the utterance out.
            setTimeout(() => { clearTimeout(timer); done(); }, 3000);
        });
        ws.on('message', (raw) => {
            let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
            if (realtime) {
                if (m.event === 'transcript.partial') out.partials++;
                else if (m.event === 'transcript.final' && m.text) out.finals.push(m.text);
                else if (m.event === 'error') out.err = `${m.code}: ${m.message}`;
            } else {
                const t = m.data?.transcript ?? m.transcript;
                if (t) out.finals.push(String(t));
                if (m.type === 'error') out.err = m.data?.error || m.data?.message;
            }
        });
        ws.on('unexpected-response', (_r, res) => { out.closeCode = res.statusCode; out.closeReason = `HTTP ${res.statusCode}`; });
        ws.on('error', (e) => { if (!out.err) out.err = e.message; });
        ws.on('close', (code, reason) => { out.closeCode = out.closeCode || code; out.closeReason = out.closeReason || (reason && reason.toString()) || ''; clearTimeout(timer); done(); });
    });
}

(async () => {
    console.log(`\nSarvam preflight — lang=${LANG} speaker=${SPEAKER}\n`);

    console.log('1. Bulbul v3 TTS: µ-law @ 8 kHz');
    const tts = await synthesize();
    if (tts.err || !tts.chunks.length) {
        fail('TTS websocket', tts.err || 'no audio returned');
        console.log('\nCannot continue without audio.\n');
        process.exit(1);
    }
    const audio = Buffer.concat(tts.chunks);
    const impliedMs = Math.round(audio.length / BYTES_PER_MS);
    const charsPerSec = PHRASE.length / (impliedMs / 1000);
    pass('TTS websocket', `${tts.chunks.length} chunks, ${audio.length} bytes, content_type=${tts.contentType}`);
    // Speech runs roughly 8-25 characters a second. At 24 kHz misread as 8 kHz the implied
    // duration is 3x too long, which lands far below that band.
    if (charsPerSec >= 5 && charsPerSec <= 40) {
        pass('Sample rate', `${impliedMs}ms of audio for ${PHRASE.length} chars (${charsPerSec.toFixed(1)} chars/sec) — consistent with 8 kHz`);
    } else {
        fail('Sample rate', `${impliedMs}ms for ${PHRASE.length} chars (${charsPerSec.toFixed(1)} chars/sec). Expected 5-40. Sarvam is likely NOT honouring speech_sample_rate=8000 — audio will play ~3x too slow on the phone leg.`);
    }

    console.log('\n2. Realtime STT: saaras:v3-realtime');
    const rt = await transcribe(audio, 'realtime');
    if (!rt.connected) {
        fail('Realtime endpoint', `not enabled for this account (${rt.closeReason || rt.err || 'connection refused'}). The bridge will fall back to the legacy socket — no partial transcripts, so barge-in waits for the caller to stop talking. Ask Sarvam to enable saaras:v3-realtime.`);
        console.log('\n3. Legacy STT fallback: saaras:v3');
        const lg = await transcribe(audio, 'legacy');
        if (lg.connected && lg.finals.length) pass('Legacy fallback', `works — transcript: "${lg.finals.join(' ')}"`);
        else fail('Legacy fallback', lg.err || lg.closeReason || 'no transcript');
    } else {
        pass('Realtime endpoint', 'connected — account is enabled');
        if (rt.partials > 0) pass('Partial transcripts', `${rt.partials} received — fast barge-in is live`);
        else fail('Partial transcripts', 'none received; barge-in will be slow. Check stream_type=fast.');
        if (rt.finals.length) pass('Transcription round-trip', `"${rt.finals.join(' ')}"  (spoken: "${PHRASE}")`);
        else fail('Transcription round-trip', rt.err || 'no final transcript — if the audio format were wrong this is what you would see');
    }

    const failed = results.filter(r => !r[0]).length;
    console.log(`\n${failed === 0 ? '✅ All checks passed.' : `❌ ${failed} check(s) failed.`}\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
