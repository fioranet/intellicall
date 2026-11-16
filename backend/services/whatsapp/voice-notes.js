/**
 * Voice notes: transcribing the ones people send, and speaking replies as one.
 *
 * In: Deepgram's pre-recorded endpoint reads Ogg/Opus as WhatsApp sends it,
 * with the owner's Deepgram key. Out: WhatsApp shows a message as a voice note
 * only when it is Ogg/Opus, mono. Classic and Deepgram-agent agents speak in
 * their ElevenLabs voice and Sarvam agents in their Bulbul speaker; Gemini Live
 * has no text-to-speech outside its socket, so those agents reply in text. The
 * provider's mp3 is re-encoded with ffmpeg; without ffmpeg the reply goes as text.
 */
const { spawn } = require('child_process');
const { resolveElevenLabsModel } = require('../../utils/voice-quality');
const { SARVAM_TTS_MODEL, resolveSarvamSpeaker } = require('../../utils/sarvam-voices');

/** Longest reply spoken as a voice note; anything longer is sent as text. */
const MAX_VOICE_REPLY_CHARS = 600;

/** The Deepgram language for a pre-recorded transcript. */
function sttLanguage(agent) {
    const lang = agent.language || 'en';
    if (lang === 'multi' || lang === 'auto') return 'multi';
    return lang;
}

/**
 * @param {Buffer} audio
 * @param {string} mimeType
 * @param {object} agent
 * @param {object} settings the owner's Settings (deepgramKey)
 * @returns {Promise<{text: string, seconds: number}>}
 */
async function transcribe(audio, mimeType, agent, settings) {
    const key = settings && settings.deepgramKey;
    if (!key) throw new Error('Voice notes cannot be transcribed: no Deepgram key in Settings.');
    const params = new URLSearchParams({ model: 'nova-3', smart_format: 'true', language: sttLanguage(agent) });
    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: { Authorization: `Token ${key}`, 'Content-Type': mimeType.split(';')[0] || 'audio/ogg' },
        body: new Uint8Array(audio),
        signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const text = (body.results && body.results.channels && body.results.channels[0] && body.results.channels[0].alternatives && body.results.channels[0].alternatives[0] && body.results.channels[0].alternatives[0].transcript || '').trim();
    const seconds = Math.max(1, Number(body.metadata && body.metadata.duration) || 0);
    return { text, seconds };
}

/** Whether this agent's engine can speak a voice note at all. */
function canSpeak(agent) {
    const e = agent.voiceEngine || 'classic';
    return e === 'classic' || e === 'deepgram_agent' || e === 'sarvam';
}

async function elevenLabsMp3(agent, settings, text) {
    const key = settings && settings.elevenLabsKey;
    if (!key) throw new Error('ElevenLabs is not configured.');
    let model = resolveElevenLabsModel(agent);
    // v3 and v4 speak only on the dialogue socket; a file reply uses Flash v2.5.
    if (/^eleven_v[34](_|$)/.test(model)) model = 'eleven_flash_v2_5';
    const voice = agent.voiceId || '21m00Tcm4TlvDq8ikWAM';
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': key, accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: model }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
}

async function sarvamMp3(agent, settings, text) {
    const key = settings && settings.sarvamKey;
    if (!key) throw new Error('Sarvam is not configured.');
    const res = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
        body: JSON.stringify({
            text,
            target_language_code: agent.sarvamLanguage || 'hi-IN',
            speaker: resolveSarvamSpeaker(agent.sarvamSpeaker),
            model: SARVAM_TTS_MODEL,
            output_audio_codec: 'mp3',
        }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Sarvam ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    if (!body.audios || !body.audios.length) throw new Error('Sarvam returned no audio.');
    return Buffer.concat(body.audios.map((a) => Buffer.from(a, 'base64')));
}

/** Re-encode any audio ffmpeg reads as Ogg/Opus, mono, 48 kHz: what WhatsApp plays as a voice note. */
function toOggOpus(input) {
    return new Promise((resolve, reject) => {
        const ff = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
            '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
            '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1',
        ]);
        const out = [];
        let err = '';
        const timer = setTimeout(() => ff.kill('SIGKILL'), 30_000);
        ff.stdout.on('data', (b) => out.push(b));
        ff.stderr.on('data', (b) => { err += b.toString(); });
        ff.on('error', (e) => { clearTimeout(timer); reject(e); });
        ff.on('close', (code) => {
            clearTimeout(timer);
            const buf = Buffer.concat(out);
            if (code === 0 && buf.subarray(0, 4).toString('latin1') === 'OggS') resolve(buf);
            else reject(new Error(`ffmpeg exited ${code}: ${err.slice(0, 200)}`));
        });
        ff.stdin.on('error', () => undefined);
        ff.stdin.end(input);
    });
}

/** The reply as a voice note in the agent's voice. Throws when it cannot be made; the caller sends text. */
async function synthesize(agent, settings, text) {
    if (!canSpeak(agent)) throw new Error('This agent\'s engine cannot speak a voice note.');
    const clean = text.replace(/[*_~`]/g, '').trim();
    const mp3 = agent.voiceEngine === 'sarvam' ? await sarvamMp3(agent, settings, clean) : await elevenLabsMp3(agent, settings, clean);
    return { ogg: await toOggOpus(mp3) };
}

module.exports = { MAX_VOICE_REPLY_CHARS, transcribe, canSpeak, synthesize, toOggOpus };
