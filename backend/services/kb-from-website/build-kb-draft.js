const cheerio = require('cheerio');
const axios = require('axios');
const { fetchPageWithPlaywrightFallback } = require('./playwright-html');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const MAX_TEXT_CHARS = 100000;

/**
 * OpenRouter keys are often pasted with "Bearer ", quotes, or invisible chars — fixes double-Bearer 401s.
 * @param {string} raw
 */
function sanitizeOpenRouterApiKey(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let k = raw.replace(/\u200b/g, '').trim();
    if (/^bearer\s+/i.test(k)) k = k.replace(/^bearer\s+/i, '').trim();
    k = k.replace(/^["']+|["']+$/g, '');
    return k.trim();
}

/**
 * OpenRouter returns 401 with message "User not found" for bad keys — map to something actionable.
 * @param {unknown} e
 */
function messageFromOpenRouterAxiosError(e) {
    const status = e?.response?.status;
    const d = e?.response?.data;
    let raw = '';
    if (d && typeof d === 'object') {
        const errPart = d.error;
        if (typeof errPart === 'string') raw = errPart;
        else if (errPart && typeof errPart === 'object' && typeof errPart.message === 'string') raw = errPart.message;
        if (!raw && typeof d.message === 'string') raw = d.message;
    }
    if (!raw) raw = (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' ? e.message : '') || 'OpenRouter request failed';

    const lower = String(raw).toLowerCase();
    const authLike =
        status === 401 ||
        status === 403 ||
        lower.includes('user not found') ||
        lower.includes('invalid api key') ||
        lower.includes('unauthorized') ||
        lower.includes('incorrect api key');

    if (authLike) {
        return 'Your OpenRouter API key is invalid, revoked, or expired. Create a new key at https://openrouter.ai/keys and save it in Settings.';
    }
    return `AI draft failed: ${raw}`;
}

/**
 * @param {string} html
 * @param {number} maxChars
 */
function extractVisibleText(html, maxChars) {
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, iframe').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.slice(0, maxChars);
}

/**
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
function parseJsonFromLlm(raw) {
    let s = String(raw).trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    return JSON.parse(s);
}

/**
 * @param {unknown} draft
 */
function normalizeDraft(draft) {
    const name = typeof draft.name === 'string' ? draft.name.trim().slice(0, 200) : '';
    const description = typeof draft.description === 'string' ? draft.description.trim().slice(0, 500) : '';
    const basicInfo = typeof draft.basicInfo === 'string' ? draft.basicInfo.trim() : '';
    const otherInfo = typeof draft.otherInfo === 'string' ? draft.otherInfo.trim() : '';
    /** @type {{ question: string; answer: string }[]} */
    const faqs = [];
    if (Array.isArray(draft.faqs)) {
        for (const item of draft.faqs.slice(0, 15)) {
            if (!item || typeof item !== 'object') continue;
            const q = typeof item.question === 'string' ? item.question.trim() : '';
            const a = typeof item.answer === 'string' ? item.answer.trim() : '';
            if (q && a) faqs.push({ question: q.slice(0, 500), answer: a.slice(0, 4000) });
        }
    }
    return {
        name: name || 'Imported knowledge base',
        description,
        basicInfo,
        faqs,
        otherInfo,
    };
}

/**
 * Fetch URL, extract text, call OpenRouter to produce KB fields.
 * @param {string} pageUrl
 * @param {string} openRouterApiKey
 * @param {{ model?: string }} [opts]
 * @returns {Promise<{ draft: ReturnType<typeof normalizeDraft>, warnings: string[] }>}
 */
async function buildKbDraftFromUrl(pageUrl, openRouterApiKey, opts = {}) {
    const apiKey = sanitizeOpenRouterApiKey(openRouterApiKey);
    if (!apiKey) {
        const err = new Error('OpenRouter API key is missing after sanitization. Paste your key again in Settings.');
        err.status = 503;
        throw err;
    }

    const warnings = [];
    const fetchResult = await fetchPageWithPlaywrightFallback(pageUrl, { warnings });
    if (fetchResult.usedPlaywright) {
        warnings.push('Page was loaded with a headless browser (SPA or bot protection).');
    }

    const $ = cheerio.load(fetchResult.body);
    const pageTitle = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 300);
    const pageText = extractVisibleText(fetchResult.body, MAX_TEXT_CHARS);
    if (pageText.length < 80) {
        const err = new Error('Not enough readable text on the page to build a knowledge base.');
        err.status = 422;
        throw err;
    }

    const model = opts.model || process.env.OPENROUTER_KB_MODEL || DEFAULT_MODEL;
    const system = `You help build a knowledge base for a phone AI assistant. Output ONLY valid JSON, no markdown outside JSON.
The JSON must have exactly these keys:
- name: short title for the KB (string)
- description: one-line internal description (string)
- basicInfo: business overview, services, hours, contact — plain text (string)
- faqs: array of up to 12 objects with "question" and "answer" strings
- otherInfo: policies, pricing notes, anything else useful — plain text (string)
Use only information supported by the provided page text. If something is unknown, use an empty string or omit optional FAQs.`;

    const user = `URL (final): ${fetchResult.finalUrl}
Page title: ${pageTitle || '(none)'}

Extracted page text:
${pageText}`;

    let content;
    try {
        const res = await axios.post(
            OPENROUTER_URL,
            {
                model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
                temperature: 0.3,
                max_tokens: 4096,
            },
            {
                timeout: 120000,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'HTTP-Referer': process.env.BASE_URL || 'https://intellicall.ai',
                    'X-Title': 'IntelliCall KB Import',
                    'Content-Type': 'application/json',
                },
            }
        );
        content = res.data?.choices?.[0]?.message?.content;
    } catch (e) {
        const msg = messageFromOpenRouterAxiosError(e);
        const err = new Error(msg);
        err.status = 502;
        throw err;
    }

    if (!content || typeof content !== 'string') {
        const err = new Error('AI returned an empty response');
        err.status = 502;
        throw err;
    }

    let parsed;
    try {
        parsed = parseJsonFromLlm(content);
    } catch {
        const err = new Error('AI returned invalid JSON. Try again or use manual entry.');
        err.status = 502;
        throw err;
    }

    return {
        draft: normalizeDraft(parsed),
        warnings,
    };
}

module.exports = {
    buildKbDraftFromUrl,
    extractVisibleText,
    normalizeDraft,
    sanitizeOpenRouterApiKey,
};
