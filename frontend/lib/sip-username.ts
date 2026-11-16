/**
 * What a SIP trunk username may contain: letters, numbers, and . _ - +
 *
 * Mirrors backend/utils/sip-username.js, which refuses the same characters when the
 * trunk is saved. The username goes into SIP addresses (sip:<username>@<host>), where
 * "@", ":", ";" or spaces break the address and the trunk never registers. Change both
 * files together. The message itself is translated (sip.dialog.usernameInvalid).
 */

const ALLOWED_CHAR = /[A-Za-z0-9._+-]/;

/** Each character the username may not contain, once, in the order typed. Empty when fine. */
export function disallowedSipUsernameChars(username: string): string[] {
    const bad: string[] = [];
    for (const ch of username || "") {
        if (!ALLOWED_CHAR.test(ch) && !bad.includes(ch)) bad.push(ch);
    }
    return bad;
}
