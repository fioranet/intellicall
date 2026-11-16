/**
 * Turn a lead's number into the E.164 number the carrier is asked to dial.
 *
 * Leads are stored as bare digits, so "07012419963", "7012419963" and "917012419963" all
 * arrive here without a country code. Prefixing "+" to them (the old behaviour) dialled
 * "+07012419963" (not a number) or "+7012419963" (Kazakhstan), which the carrier refused as
 * "unallocated number". The country comes from the number the call is placed from instead.
 *
 * Uses the full metadata: the small bundle calls "+91 14155551234" a valid Indian number.
 */
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function parseFrom(fromNumber) {
    const digits = String(fromNumber || '').replace(/\D/g, '');
    return digits ? parsePhoneNumberFromString('+' + digits) : null;
}

function countryName(code) {
    try { return regionNames.of(code) || code; } catch (_) { return code; }
}

/**
 * @param {string} raw         the lead's number, as stored or typed
 * @param {string} [fromNumber] the E.164 number the call goes out from
 * @returns {{ number: string } | { error: string }}
 */
function resolveDialNumber(raw, fromNumber) {
    const text = String(raw || '').trim();
    const digits = text.replace(/\D/g, '');
    if (!digits) return { error: 'The lead has no phone number.' };

    const from = parseFrom(fromNumber);
    const country = from?.country || null;
    const where = country ? `a valid ${countryName(country)} number` : 'a valid number';
    const example = `+${from?.countryCallingCode || '1'}`;

    if (text.startsWith('+')) {
        const intl = parsePhoneNumberFromString('+' + digits);
        if (intl && (intl.isValid() || intl.isPossible())) return { number: intl.number };
        return { error: `${text} is not a phone number: the country code is missing or wrong. Save it as ${example} followed by the number.` };
    }

    const national = country ? parsePhoneNumberFromString(digits, country) : null;
    const intl = parsePhoneNumberFromString('+' + digits);
    // A local list usually leaves the country code off, so the calling number's country wins
    // when both readings are real numbers.
    if (national?.isValid()) return { number: national.number };
    if (intl?.isValid()) return { number: intl.number };
    // Number ranges newer than the metadata: trust an international reading of the right length.
    if (!digits.startsWith('0') && intl?.isPossible()) return { number: intl.number };

    return {
        error: `${text} has no country code and isn't ${where}. Save the lead with its country code, for example ${example} followed by the number.`
    };
}

/**
 * The number to hand Asterisk for a call over `trunk`.
 *
 * A trunk set to dial without the "+" (stripPlus, and no dial prefix) is usually a PBX with
 * its own dialling rules, so it gets the digits as saved, which is what it was sent before
 * numbers were normalised: "07012419963" stays a national number rather than becoming
 * "917012419963", and a short number like "7005555" isn't refused. Every other trunk gets
 * E.164; ari-service.originateCall then adds the dial prefix or drops the "+".
 */
function resolveTrunkDialNumber(raw, fromNumber, trunk) {
    if (trunk?.stripPlus && !String(trunk.dialPrefix || '').replace(/\D/g, '')) {
        const digits = String(raw || '').replace(/\D/g, '');
        return digits ? { number: digits } : { error: 'The lead has no phone number.' };
    }
    return resolveDialNumber(raw, fromNumber);
}

module.exports = { resolveDialNumber, resolveTrunkDialNumber };
