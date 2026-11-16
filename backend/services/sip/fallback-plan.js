/**
 * Where an inbound SIP call is forwarded when no AI agent will take it, or why it can't be.
 *
 * A number's fallback is dialled out over the trunk the number belongs to (its PJSIP
 * endpoint `trunk-<id>` in pjsip_intellicall.conf), so it is refused here for anything that
 * trunk could only answer with "unallocated number" -- or, for a fallback that is the
 * number itself, with the same call coming straight back in.
 *
 * Pure, so the decision can be tested without Asterisk; sip-manager.js does the dialling.
 */
const { resolveDialNumber, resolveTrunkDialNumber } = require('../../utils/dial-number');

/**
 * @param {object} phoneConfig  the PhoneNumber that was called (phoneNumber, fallbackNumber)
 * @param {object|null} trunk   its SipTrunk (status, defaultCallerId, dialPrefix, stripPlus)
 * @returns {{ number: string, callerId: string } | { code: string, error: string }}
 */
function planFallback(phoneConfig, trunk) {
    const fallback = String(phoneConfig?.fallbackNumber || '').trim();
    if (!fallback) return { code: 'no_fallback', error: 'the number has no fallback number.' };
    if (!trunk) return { code: 'trunk_missing', error: 'the number has no SIP trunk to dial the fallback through.' };
    if (trunk.status === 'inactive') {
        // An inactive trunk is left out of the Asterisk config, so there is nothing to dial over.
        return { code: 'trunk_inactive', error: `its SIP trunk "${trunk.name || trunk._id}" is switched off.` };
    }

    // The country for a fallback saved without a code comes from the number that was called.
    // A trunk set to dial without the "+" gets the digits as saved (see utils/dial-number.js).
    const from = phoneConfig.phoneNumber || trunk.defaultCallerId;
    const dial = resolveTrunkDialNumber(fallback, from, trunk);
    if (dial.error) {
        return {
            code: 'invalid_number',
            error: `the fallback number "${fallback}" is not a dialable phone number. Save it with its country code on the Phone Numbers page.`
        };
    }

    const digits = (n) => String(n || '').replace(/\D/g, '');
    const self = resolveDialNumber(phoneConfig.phoneNumber, from);
    const fallbackE164 = resolveDialNumber(fallback, from);
    if ((self.number && self.number === fallbackE164.number) || digits(fallback) === digits(phoneConfig.phoneNumber)) {
        return { code: 'fallback_is_self', error: 'the fallback number is this same number, so the call would ring straight back in.' };
    }

    // Carriers drop calls presenting a number the account doesn't own, so the caller's own
    // number isn't shown: the trunk's caller ID, else the number they called.
    return { number: dial.number, callerId: trunk.defaultCallerId || phoneConfig.phoneNumber || '' };
}

module.exports = { planFallback };
