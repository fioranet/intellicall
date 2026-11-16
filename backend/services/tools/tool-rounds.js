/**
 * Shared by the engines that run tool calls through an OpenAI-style chat
 * completion loop (classic, Sarvam). The native realtime engines get their
 * round-tripping from the provider and need neither.
 */

/** Tool rounds per caller turn before the model is made to answer in words. */
const MAX_TOOL_ROUNDS = 3;

/** Said while a tool runs, when the model went straight to the tool without a word. */
const TOOL_FILLER = {
    en: 'One moment, let me check that.',
    hi: 'एक पल, मैं देखता हूँ।',
    es: 'Un momento, déjeme revisarlo.',
    fr: 'Un instant, je vérifie.',
    de: 'Einen Moment, ich schaue nach.',
    pt: 'Um momento, vou verificar.',
    it: 'Un attimo, controllo subito.',
    ar: 'لحظة من فضلك، سأتحقق من ذلك.',
};

/** @param {string | undefined} language an agent language code such as 'en', 'en-US', 'hi-IN' */
function toolFiller(language) {
    const base = String(language || 'en').toLowerCase().split(/[-_]/)[0];
    return TOOL_FILLER[base] || TOOL_FILLER.en;
}

module.exports = { MAX_TOOL_ROUNDS, TOOL_FILLER, toolFiller };
