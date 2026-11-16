const axios = require('axios');
const CallLog = require('../models/CallLog');
const Settings = require('../models/Settings');
const { openRouterModel } = require('./models');
const WebhookService = require('../services/webhook-service');
const EmailService = require('../services/email-service');

// Text models for analysing a call on the key its own engine used, when the account has
// no OpenRouter key. gemini-flash-latest follows Google's current Flash, so it doesn't
// break when a version is retired (gemini-2.5-flash already refuses new users).
const GEMINI_ANALYSIS_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_ANALYSIS_MODEL = 'gemini-flash-latest';
const SARVAM_ANALYSIS_URL = 'https://api.sarvam.ai/v1/chat/completions';
const SARVAM_ANALYSIS_MODEL = 'sarvam-105b';

/**
 * Which LLM, on whose key, analyses a call. OpenRouter when the account has a key for it;
 * otherwise the key the call itself ran on: Gemini Live calls on the Gemini key, Sarvam
 * calls on Sarvam's own model. Never another account's key.
 */
function analysisLlm(settings, log) {
    if (settings.openRouterKey) {
        return {
            provider: 'OpenRouter',
            url: 'https://openrouter.ai/api/v1/chat/completions',
            model: openRouterModel,
            headers: {
                'Authorization': `Bearer ${settings.openRouterKey}`,
                'HTTP-Referer': 'https://intellicall-ai.com',
                'X-Title': 'IntelliCall AI'
            },
            extra: { response_format: { type: 'json_object' } }
        };
    }
    if (log.voiceEngine === 'gemini_live' && settings.geminiKey) {
        return {
            provider: 'Gemini',
            url: GEMINI_ANALYSIS_URL,
            model: GEMINI_ANALYSIS_MODEL,
            headers: { 'Authorization': `Bearer ${settings.geminiKey}` },
            extra: { response_format: { type: 'json_object' } }
        };
    }
    if (log.voiceEngine === 'sarvam' && settings.sarvamKey) {
        return {
            provider: 'Sarvam',
            url: SARVAM_ANALYSIS_URL,
            model: SARVAM_ANALYSIS_MODEL,
            headers: { 'Authorization': `Bearer ${settings.sarvamKey}` },
            // Reasoning is on by default and only slows this down.
            extra: { reasoning_effort: null }
        };
    }
    return null;
}

/**
 * Perform AI analysis on a call log.
 * Returns { summary, analysis }, or { error } saying why it couldn't (the background
 * callers ignore the result; the Analyze button shows the error). The error is also
 * kept on the call as analysisError, so the call logs page can say why a call has no
 * score instead of showing "Pending" forever.
 * @param {string} callLogId
 */
async function analyzeCallLog(callLogId) {
    const result = await runAnalysis(callLogId);
    if (result?.error) {
        await CallLog.updateOne({ _id: callLogId }, { $set: { analysisError: { message: result.error, at: new Date() } } })
            .catch(err => console.error(`[Analyzer] Could not record why call log ${callLogId} wasn't analyzed:`, err.message));
    }
    return result;
}

async function runAnalysis(callLogId) {
    let provider = 'OpenRouter';
    try {
        const log = await CallLog.findById(callLogId);
        // Every call is seeded with the agent's system prompt; only the spoken turns count.
        const turns = (log?.transcript || []).filter(t => t.role !== 'system');
        if (!log || turns.length === 0) {
            console.log(`[Analyzer] No transcript for call log ${callLogId}`);
            return { error: 'This call has no transcript to analyze: nobody spoke, or the call never connected.' };
        }

        if (log.summary) {
            console.log(`[Analyzer] Call log ${callLogId} already analyzed. Skipping.`);
            return { summary: log.summary, analysis: log.analysis };
        }

        // Analysis runs on the call owner's own keys, never the viewer's.
        const settings = await Settings.findOne({ userId: log.userId });
        const llm = settings && analysisLlm(settings, log);
        if (!llm) {
            console.warn(`[Analyzer] No analysis key for call log ${callLogId} (${log.voiceEngine})`);
            const ownKey = { gemini_live: 'Gemini', sarvam: 'Sarvam' }[log.voiceEngine];
            return {
                error: `Call analysis runs on your OpenRouter${ownKey ? ` or ${ownKey}` : ''} key. Add one in Settings, then try again.`,
                code: 'no_openrouter_key',
                ownerId: log.userId
            };
        }

        const transcriptText = turns.map(t => `${t.role.toUpperCase()}: ${t.content}`).join('\n');

        const prompt = `Analyze the following sales call transcript. Provide a concise summary of the conversation and extract lead qualification data including whether the lead is qualified, a qualification score (0-100), the reason for the score, budget details mentioned, timeline for purchase, suggested next steps, and your overall AI opinion of the lead's potential.

Transcript:
${transcriptText}

Return the response in JSON format only with the following structure:
{
  "summary": "Concise summary of the conversation",
  "analysis": {
    "isQualified": boolean,
    "qualificationScore": number,
    "reason": "Detailed reason for the qualification status",
    "budget": "Budget information mention during call, or 'Unknown'",
    "timeline": "Timeline for purchase/action mention during call, or 'Unknown'",
    "nextSteps": "What should the salesperson do next?",
    "aiOpinion": "Brief overall assessment of lead quality"
  }
}`;

        provider = llm.provider;
        const response = await axios.post(llm.url, {
            model: llm.model,
            messages: [
                { role: 'system', content: 'You are an expert sales analyst specialized in qualifying leads from phone conversations.' },
                { role: 'user', content: prompt }
            ],
            ...llm.extra
        }, { headers: llm.headers, timeout: 120000 });

        const result = response.data?.choices?.[0]?.message?.content || '';
        let analysisData;
        try {
            // Some models wrap the JSON in a ```json fence despite response_format.
            analysisData = JSON.parse(result.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
        } catch {
            console.error(`[Analyzer] Unparseable reply for call log ${callLogId}:`, result.slice(0, 300));
            return { error: 'The AI returned an unreadable analysis. Try again.' };
        }
        if (!analysisData?.summary) {
            return { error: 'The AI returned an empty analysis. Try again.' };
        }

        log.summary = analysisData.summary;
        log.analysis = analysisData.analysis;
        log.analysisError = undefined;
        await log.save();

        // Trigger Webhook if qualified
        if (analysisData.analysis?.isQualified) {
            const qualifiedPayload = {
                callLogId: log._id,
                leadId: log.leadId,
                analysis: analysisData.analysis
            };
            WebhookService.trigger(log.userId, 'leadQualified', qualifiedPayload);
            EmailService.trigger(log.userId, 'leadQualified', qualifiedPayload);
        }

        console.log(`[Analyzer] Successfully analyzed call log ${callLogId}`);
        return { summary: log.summary, analysis: log.analysis };

    } catch (err) {
        const status = err.response?.status;
        // Gemini wraps its error in an array; OpenRouter and Sarvam don't.
        const body = Array.isArray(err.response?.data) ? err.response.data[0] : err.response?.data;
        const detail = body?.error?.message || err.message;
        console.error(`[Analyzer] ${provider} error analyzing call log ${callLogId}:`, status || '', detail);
        if (status === 401 || status === 403 || /api key not valid|invalid api key/i.test(detail)) {
            return { error: `${provider} rejected the API key. Check the ${provider} API key in Settings.` };
        }
        if (status === 402) return { error: `The ${provider} account is out of credits. Add credits, then try again.` };
        if (status === 429) return { error: `${provider} is rate-limiting requests or the account is out of quota. Try again in a minute.` };
        return { error: `Analysis failed (${provider}): ${detail}` };
    }
}

module.exports = { analyzeCallLog };
