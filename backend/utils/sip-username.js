/**
 * What a SIP trunk username may contain: letters, numbers, and . _ - +
 *
 * The username goes into SIP addresses (sip:<username>@<host>) in the generated PJSIP
 * config, where "@", ":", ";", spaces and the like either break the address or change its
 * meaning, and Asterisk drops the trunk's registration. So such usernames are refused when
 * the trunk is saved, with the characters named, rather than quietly rewritten. A provider
 * that issues an email address as the username can issue a plain one instead.
 *
 * Mirrored in frontend/lib/sip-username.ts so the form says the same thing as you type
 * (translated there). Change both together.
 */

const ALLOWED_CHAR = /[A-Za-z0-9._+-]/;

/** Each character the username may not contain, once, in the order they appear. */
function disallowedChars(username) {
    const seen = [];
    for (const ch of String(username || '')) {
        if (!ALLOWED_CHAR.test(ch) && !seen.includes(ch)) seen.push(ch);
    }
    return seen;
}

/** How a character is named in the message: a space would otherwise be invisible. */
const shown = (ch) => (ch === ' ' ? 'spaces' : /\s/.test(ch) ? 'tabs or line breaks' : `"${ch}"`);

/** The message for a username that breaks the rule, or null when it is fine. Blank is fine. */
function sipUsernameError(username) {
    const bad = disallowedChars(username);
    if (bad.length === 0) return null;
    const list = [...new Set(bad.map(shown))].join(', ');
    return `The SIP username can't contain ${list}. Use only letters, numbers, and . _ - + `
        + '(if your provider gave you an email address as the username, ask them for a plain username instead).';
}

module.exports = { sipUsernameError, disallowedChars };
