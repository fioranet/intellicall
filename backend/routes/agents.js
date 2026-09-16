const express = require('express');
const joi = require('joi');
const axios = require('axios');
const Agent = require('../models/Agent');
const Settings = require('../models/Settings');
const PhoneNumber = require('../models/PhoneNumber');
const KnowledgeBase = require('../models/KnowledgeBase');
const { auth, requireActivePlan } = require('../middleware/auth');
const checkLimit = require('../middleware/limit-checker');
const { SARVAM_TTS_MODEL, SARVAM_DEFAULT_SPEAKER, resolveSarvamSpeaker } = require('../utils/sarvam-voices');
const Lead = require('../models/Lead');
const { missingEngineKeys } = require('../utils/engine-keys');
const { signVoiceTestToken, VOICE_TEST_TTL_SECONDS } = require('../utils/voice-test-token');

/** Tags the single reusable lead each user gets for in-browser agent tests. */
const AGENT_TEST_LEAD_TAG = 'agent-test';

const router = express.Router();

/**
 * Voice Quality & Conversation fields (shared by create + edit).
 * Numeric fields accept null/'' so the UI can clear an override back to default.
 */
const voiceQualityJoi = {
    voiceQualityPreset: joi.string().valid('default', 'fast', 'balanced', 'natural', 'expressive', 'custom'),
    elevenLabsVoiceSettings: joi.object({
        stability: joi.number().min(0).max(1).allow(null, ''),
        similarityBoost: joi.number().min(0).max(1).allow(null, ''),
        style: joi.number().min(0).max(1).allow(null, ''),
        useSpeakerBoost: joi.boolean().allow(null),
        speed: joi.number().min(0.7).max(1.2).allow(null, ''),
        model: joi.string().valid('auto', 'eleven_turbo_v2_5', 'eleven_flash_v2_5', 'eleven_multilingual_v2'),
        latencyProfile: joi.string().valid('auto', 'fast', 'balanced', 'quality')
    }),
    turnTaking: joi.object({
        endpointingMs: joi.number().integer().min(100).max(2000).allow(null, ''),
        silenceWaitMs: joi.number().integer().min(200).max(3000).allow(null, ''),
        interruptSensitivity: joi.string().valid('low', 'normal', 'high')
    })
};

/**
 * Human Transfer (shared by create + edit). Destination phone numbers never reach the
 * model — they are resolved server-side at dial time — so they are validated here as
 * strictly as the dialler needs them.
 */
const humanTransferDestinationJoi = joi.object({
    id: joi.string().trim().lowercase().pattern(/^[a-z0-9][a-z0-9_-]{0,63}$/).required(),
    name: joi.string().trim().min(1).max(100).required(),
    type: joi.string().valid('phone'),
    value: joi.string().trim().pattern(/^\+?[1-9]\d{6,14}$/).required(),
    enabled: joi.boolean(),
    timeoutSeconds: joi.number().integer().min(5).max(60).allow(null, '')
}).unknown(false);

const humanTransferJoi = {
    humanTransfer: joi.object({
        enabled: joi.boolean(),
        mode: joi.string().valid('blind'),
        defaultDestinationId: joi.string().trim().allow(''),
        ringTimeoutSeconds: joi.number().integer().min(5).max(60),
        maxTransfersPerCall: joi.number().integer().min(1).max(10),
        returnToAgentOnFailure: joi.boolean(),
        destinations: joi.array().items(humanTransferDestinationJoi).max(50)
    }).unknown(false)
};

/**
 * Cross-field rules Joi cannot express on its own. Returns an error string, or null.
 * Runs on create and edit alike so a bad config can never reach a live call.
 */
function validateHumanTransfer(ht) {
    if (!ht) return null;
    const destinations = Array.isArray(ht.destinations) ? ht.destinations : [];
    const seen = new Set();
    for (const d of destinations) {
        if (seen.has(d.id)) return `Duplicate transfer destination ID "${d.id}".`;
        seen.add(d.id);
        if (d.timeoutSeconds === '') d.timeoutSeconds = null;
    }
    const enabledIds = new Set(destinations.filter(d => d.enabled !== false).map(d => d.id));
    if (ht.defaultDestinationId && !enabledIds.has(ht.defaultDestinationId)) {
        return 'The default transfer destination must be an enabled destination.';
    }
    if (ht.enabled && enabledIds.size === 0) {
        return 'Human Transfer needs at least one enabled destination before it can be turned on.';
    }
    return null;
}

/** Coerce '' → null on nested numeric voice-quality fields so mongoose never sees ''. */
function normalizeVoiceQuality(value) {
    const numify = (obj, keys) => {
        if (!obj) return;
        for (const k of keys) {
            if (obj[k] === '' || obj[k] === undefined) {
                if (obj[k] === '') obj[k] = null;
            }
        }
    };
    numify(value.elevenLabsVoiceSettings, ['stability', 'similarityBoost', 'style', 'speed']);
    numify(value.turnTaking, ['endpointingMs', 'silenceWaitMs']);
    return value;
}

// List all agents (convenience)
router.get('/', auth, async (req, res) => {
    try {
        let query = {};
        if (!req.user.isSuperAdmin) {
            query = { createdBy: req.user._id };
        }

        const agents = await Agent.find(query)
            .populate('outboundPhoneNumber')
            .populate('knowledgeBaseId', 'name')
            .sort({ createdAt: -1 });
        res.status(200).json({
            status: 'success',
            results: agents.length,
            data: { agents }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * GET /api/agents/voices
 * Fetch available voices from ElevenLabs
 */
router.get('/voices', auth, async (req, res) => {
    try {
        const settings = await Settings.findOne({ userId: req.user._id });
        if (!settings || !settings.elevenLabsKey) {
            return res.status(400).json({
                status: 'error',
                message: 'ElevenLabs API key not configured. Please add it in Settings.'
            });
        }

        const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': settings.elevenLabsKey }
        });

        const voices = response.data.voices.map(v => ({
            voice_id: v.voice_id,
            name: v.name,
            preview_url: v.preview_url,
            category: v.category,
            labels: v.labels
        }));

        res.status(200).json({
            status: 'success',
            data: { voices }
        });
    } catch (err) {
        console.error('ElevenLabs Voices Error:', err.response?.data || err.message);
        res.status(err.response?.status || 500).json({
            status: 'error',
            message: 'Failed to fetch voices from ElevenLabs'
        });
    }
});

/**
 * POST /api/agents/sarvam/preview
 * Generate a short spoken sample for a Sarvam (Bulbul) speaker + language so the voice can be
 * auditioned in the agent editor. Sarvam has no pre-hosted preview clips (unlike ElevenLabs),
 * so we synthesize one on demand via the REST TTS endpoint using the user's Sarvam key.
 */
const SARVAM_PREVIEW_TEXT = {
    'hi-IN': 'नमस्ते! यह इस आवाज़ का एक नमूना है।',
    'bn-IN': 'নমস্কার! এটি এই কণ্ঠস্বরের একটি নমুনা।',
    'gu-IN': 'નમસ્તે! આ અવાજનો એક નમૂનો છે.',
    'kn-IN': 'ನಮಸ್ಕಾರ! ಇದು ಈ ಧ್ವನಿಯ ಒಂದು ಮಾದರಿ.',
    'ml-IN': 'നമസ്കാരം! ഇത് ഈ ശബ്ദത്തിന്റെ ഒരു സാമ്പിളാണ്.',
    'mr-IN': 'नमस्कार! हा या आवाजाचा एक नमुना आहे.',
    'od-IN': 'ନମସ୍କାର! ଏହା ଏହି ସ୍ୱରର ଏକ ନମୁନା।',
    'pa-IN': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਇਹ ਇਸ ਆਵਾਜ਼ ਦਾ ਇੱਕ ਨਮੂਨਾ ਹੈ।',
    'ta-IN': 'வணக்கம்! இது இந்தக் குரலின் ஒரு மாதிரி.',
    'te-IN': 'నమస్కారం! ఇది ఈ స్వరం యొక్క ఒక నమూనా.',
    'en-IN': 'Hello! This is a sample of this voice.',
};

router.post('/sarvam/preview', auth, async (req, res) => {
    const schema = joi.object({
        speaker: joi.string().trim().default(SARVAM_DEFAULT_SPEAKER),
        language: joi.string().trim().default('hi-IN'),
    });
    try {
        const { speaker, language } = await schema.validateAsync(req.body);
        const settings = await Settings.findOne({ userId: req.user._id });
        if (!settings || !settings.sarvamKey) {
            return res.status(400).json({ status: 'error', message: 'Sarvam API key not configured. Please add it in Settings.' });
        }

        const text = SARVAM_PREVIEW_TEXT[language] || SARVAM_PREVIEW_TEXT['en-IN'];
        const response = await axios.post(
            'https://api.sarvam.ai/text-to-speech',
            {
                text,
                target_language_code: language,
                // Coerced so previewing an agent still on a legacy v2 speaker plays the
                // same voice the call bridge will actually use.
                speaker: resolveSarvamSpeaker(speaker),
                model: SARVAM_TTS_MODEL,
                speech_sample_rate: 22050,
                output_audio_codec: 'wav',
            },
            { headers: { 'api-subscription-key': settings.sarvamKey, 'Content-Type': 'application/json' }, timeout: 20000 }
        );

        const audio = response.data?.audios?.[0];
        if (!audio) {
            return res.status(502).json({ status: 'error', message: 'Sarvam returned no audio for this voice.' });
        }
        res.status(200).json({ status: 'success', data: { audio, contentType: 'audio/wav' } });
    } catch (err) {
        console.error('Sarvam Preview Error:', err.response?.data || err.message);
        const status = err.response?.status;
        const msg = (status === 401 || status === 403)
            ? 'Sarvam API key is invalid or lacks access. Check it in Settings.'
            : 'Failed to generate Sarvam voice preview.';
        res.status(status || 500).json({ status: 'error', message: msg });
    }
});

/**
 * POST /api/agents/:id/test-session
 *
 * Mints a short-lived ticket for the in-browser agent test. No phone call is
 * placed and no telephony is involved, so this is deliberately NOT rate-limited
 * by plan call quotas — a test consumes no minutes and writes no CallLog.
 *
 * Refused up front (rather than after the mic prompt) when the agent cannot be
 * tested at all, or when the engine's provider keys are missing.
 */
router.post('/:id/test-session', auth, async (req, res) => {
    try {
        const agent = await Agent.findOne({ _id: req.params.id, createdBy: req.user._id });
        if (!agent) {
            return res.status(404).json({ status: 'error', code: 'agent_not_found', message: 'Agent not found.' });
        }

        // "Standard (Twilio)" agents are spoken by Twilio's own TwiML voice and never
        // open a media stream, so there is no streaming pipeline to drive from a browser.
        if (!agent.useCustomVoice) {
            return res.status(400).json({
                status: 'error',
                code: 'engine_not_testable',
                message: 'Standard (Twilio) voices are generated by Twilio during a real call and cannot be previewed in the browser. Switch this agent to a streaming voice engine to test it.',
            });
        }

        const { resolveCallAiConfig } = require('../utils/ai-key-resolver');
        const aiConfig = await resolveCallAiConfig(req.user._id, agent, 'browser');
        if (!aiConfig.allowed) {
            return res.status(400).json({
                status: 'error',
                code: aiConfig.reason || 'blocked',
                message: aiConfig.message
            });
        }

        const settings = aiConfig.settings;
        const missing = missingEngineKeys(settings, agent, 'browser');
        if (missing.length > 0) {
            return res.status(400).json({
                status: 'error',
                code: 'missing_keys',
                missing,
                message: `${missing.join(' and ')} ${missing.length > 1 ? 'keys are' : 'key is'} not configured. Add ${missing.length > 1 ? 'them' : 'it'} in Settings to test this agent.`,
            });
        }

        // One reusable lead per user, so merge fields render and appointment booking
        // behaves exactly as on a real call. Mirrors the test lead that POST /calls/test
        // already creates for SIP test calls.
        let lead = await Lead.findOne({ createdBy: req.user._id, tags: AGENT_TEST_LEAD_TAG });
        if (!lead) {
            lead = await Lead.create({
                name: req.user.name || 'Browser Test',
                phone: '0000000000',
                createdBy: req.user._id,
                tags: [AGENT_TEST_LEAD_TAG, 'test'],
            });
        }

        res.status(200).json({
            status: 'success',
            data: {
                ticket: signVoiceTestToken(req.user._id, agent._id, lead._id),
                expiresInSeconds: VOICE_TEST_TTL_SECONDS,
                maxDurationMs: parseInt(process.env.AGENT_TEST_MAX_MS || String(5 * 60 * 1000), 10),
                wsPath: '/api/agent-test',
                engine: agent.voiceEngine || 'classic',
            },
        });
    } catch (err) {
        console.error('Agent Test Session Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Could not start a test session.' });
    }
});

// Create an agent
router.post('/', auth, requireActivePlan, checkLimit('agents'), async (req, res) => {
    const schema = joi.object({
        name: joi.string().required(),
        systemPrompt: joi.string().required(),
        openingMessage: joi.string().required(),
        voice: joi.string().allow('', null),
        voiceId: joi.string().allow('', null),
        voiceName: joi.string().allow('', null),
        useCustomVoice: joi.boolean().default(false),
        voiceEngine: joi.string().valid('classic', 'deepgram_agent', 'sarvam', 'gemini_live').default('classic'),
        sarvamSpeaker: joi.string().allow('', null),
        sarvamLanguage: joi.string().allow('', null),
        geminiVoice: joi.string().allow('', null),
        geminiLanguage: joi.string().allow('', null),
        outboundPhoneNumber: joi.string().allow('', null),
        knowledgeBaseId: joi.string().allow('', null),
        kbSettings: joi.object({
            useBasicInfo: joi.boolean(),
            useFaqs: joi.boolean(),
            useOtherInfo: joi.boolean()
        }),
        language: joi.string().default('en'),
        appointmentBookingEnabled: joi.boolean().default(false),
        appointmentDescription: joi.string().allow('').default(''),
        ...humanTransferJoi,
        ...voiceQualityJoi
    }).unknown();

    // Coerce any stray/invalid voiceEngine (e.g. '' or the UI-only 'twilio_standard')
    // to a valid enum so a client mismatch never hard-fails the request.
    if (req.body && !['classic', 'deepgram_agent', 'sarvam', 'gemini_live'].includes(req.body.voiceEngine)) {
        delete req.body.voiceEngine; // let joi apply the 'classic' default
    }

    try {
        const value = normalizeVoiceQuality(await schema.validateAsync(req.body));

        const transferError = validateHumanTransfer(value.humanTransfer);
        if (transferError) {
            return res.status(400).json({ status: 'error', message: transferError });
        }

        if (req.user.operatingMode === 'byok' && value.voiceEngine === 'gemini_live') {
            return res.status(403).json({
                status: 'error',
                message: 'O motor Gemini Multimodal (Speech-to-Speech) é exclusivo da plataforma gerenciada e não é permitido no modo BYOK.'
            });
        }

        // Normalize outboundPhoneNumber
        if (value.outboundPhoneNumber === '' || value.outboundPhoneNumber === 'none') {
            value.outboundPhoneNumber = null;
        }

        // Ownership validation for cross-resource references
        if (value.outboundPhoneNumber) {
            const phone = await PhoneNumber.findOne({ _id: value.outboundPhoneNumber, createdBy: req.user._id });
            if (!phone) {
                return res.status(403).json({ status: 'error', message: 'You do not own this phone number' });
            }
        }
        if (value.knowledgeBaseId) {
            const kb = await KnowledgeBase.findOne({ _id: value.knowledgeBaseId, createdBy: req.user._id });
            if (!kb) {
                return res.status(403).json({ status: 'error', message: 'You do not own this knowledge base' });
            }
        }

        const agent = new Agent({
            ...value,
            createdBy: req.user._id
        });
        await agent.save();

        res.status(201).json({
            status: 'success',
            data: { agent }
        });
    } catch (err) {
        console.error('AGENT CREATE ERROR:', err);
        res.status(400).json({ status: 'error', message: err.message });
    }
});

// Edit an agent
router.patch('/:id', auth, async (req, res) => {
    const schema = joi.object({
        name: joi.string(),
        systemPrompt: joi.string(),
        openingMessage: joi.string(),
        voice: joi.string().allow('', null),
        voiceId: joi.string().allow('', null),
        voiceName: joi.string().allow('', null),
        useCustomVoice: joi.boolean(),
        voiceEngine: joi.string().valid('classic', 'deepgram_agent', 'sarvam', 'gemini_live'),
        sarvamSpeaker: joi.string().allow('', null),
        sarvamLanguage: joi.string().allow('', null),
        geminiVoice: joi.string().allow('', null),
        geminiLanguage: joi.string().allow('', null),
        outboundPhoneNumber: joi.string().allow('', null),
        knowledgeBaseId: joi.string().allow('', null),
        kbSettings: joi.object({
            useBasicInfo: joi.boolean(),
            useFaqs: joi.boolean(),
            useOtherInfo: joi.boolean()
        }),
        language: joi.string(),
        appointmentBookingEnabled: joi.boolean(),
        appointmentDescription: joi.string().allow(''),
        ...humanTransferJoi,
        ...voiceQualityJoi
    }).unknown();

    // Drop a stray/invalid voiceEngine (e.g. '' or the UI-only 'twilio_standard')
    // so it's simply left unchanged instead of hard-failing the update.
    if (req.body && req.body.voiceEngine !== undefined
        && !['classic', 'deepgram_agent', 'sarvam', 'gemini_live'].includes(req.body.voiceEngine)) {
        delete req.body.voiceEngine;
    }

    try {
        const value = normalizeVoiceQuality(await schema.validateAsync(req.body));

        const transferError = validateHumanTransfer(value.humanTransfer);
        if (transferError) {
            return res.status(400).json({ status: 'error', message: transferError });
        }

        if (req.user.operatingMode === 'byok' && value.voiceEngine === 'gemini_live') {
            return res.status(403).json({
                status: 'error',
                message: 'O motor Gemini Multimodal (Speech-to-Speech) é exclusivo da plataforma gerenciada e não é permitido no modo BYOK.'
            });
        }

        // Normalize outboundPhoneNumber & knowledgeBaseId
        if (value.outboundPhoneNumber === '' || value.outboundPhoneNumber === 'none') {
            value.outboundPhoneNumber = null;
        }
        if (value.knowledgeBaseId === '' || value.knowledgeBaseId === 'none') {
            value.knowledgeBaseId = null;
        }

        const query = { _id: req.params.id };
        if (!req.user.isSuperAdmin) {
            query.createdBy = req.user._id;
        }

        // Ownership validation for cross-resource references
        if (value.outboundPhoneNumber) {
            const phone = await PhoneNumber.findOne({ _id: value.outboundPhoneNumber, createdBy: req.user._id });
            if (!phone) {
                return res.status(403).json({ status: 'error', message: 'You do not own this phone number' });
            }
        }
        if (value.knowledgeBaseId) {
            const kb = await KnowledgeBase.findOne({ _id: value.knowledgeBaseId, createdBy: req.user._id });
            if (!kb) {
                return res.status(403).json({ status: 'error', message: 'You do not own this knowledge base' });
            }
        }

        const agent = await Agent.findOneAndUpdate(
            query,
            value,
            { returnDocument: 'after', runValidators: true }
        );

        if (!agent) {
            return res.status(404).json({
                status: 'error',
                message: 'Agent not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: { agent }
        });
    } catch (err) {
        console.error('AGENT UPDATE ERROR:', err);
        res.status(400).json({ status: 'error', message: err.message });
    }
});

// Delete an agent
router.delete('/:id', auth, async (req, res) => {
    try {
        const query = { _id: req.params.id };
        if (!req.user.isSuperAdmin) {
            query.createdBy = req.user._id;
        }

        const agent = await Agent.findOneAndDelete(query);

        if (!agent) {
            return res.status(404).json({
                status: 'error',
                message: 'Agent not found'
            });
        }

        res.status(200).json({
            status: 'success',
            message: 'Agent deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

module.exports = router;
