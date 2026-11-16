/**
 * Offline checks for SIP trunk usernames and the reasons a failed call records.
 *
 * Mongo is stubbed. Locks in: usernames that can't sit in a SIP address are refused with
 * the characters named, an old trunk with one gets no registration section (rather than
 * one Asterisk drops), and a call Asterisk or the carrier would not complete says why.
 *
 *   node scripts/sip-trunk-config-test.js
 */

const path = require('path');
const fs = require('fs');
const B = path.join(__dirname, '..');

let fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };

let trunks = [];
require.cache[require.resolve(B + '/models/SipTrunk')] = {
    exports: { find: async () => trunks }, loaded: true, id: 'SipTrunk',
};

const { sipUsernameError } = require(B + '/utils/sip-username');
const { generatePjsipConfig } = require(B + '/services/sip/asterisk-config');
const { getLogs } = require(B + '/services/sip/sip-log');

const trunk = (id, name, username) => ({
    _id: id, name, createdBy: 'owner', host: 'x.sip.vobiz.ai', port: 5060, transport: 'udp',
    username, password: 'p', authRealm: 'x.sip.vobiz.ai', codecs: 'PCMU,PCMA', defaultCallerId: '',
});

(async () => {
    // the rule
    for (const ok of ['mukkamtvs', 'vinil', '+919876543210', 'a.b_c-d', '']) check(`username ${JSON.stringify(ok)} is allowed`, sipUsernameError(ok) === null);
    const one = sipUsernameError('mukkamtvs@gmail.com');
    check('an email is refused, naming "@"', /can't contain "@"/.test(one || ''), one);
    const many = sipUsernameError('a b:c;d@e');
    check('every bad character is named once', /spaces, ":", ";", "@"/.test(many || ''), many);
    const front = fs.readFileSync(path.join(B, '../frontend/lib/sip-username.ts'), 'utf8');
    check('the form uses the same allowed characters', front.includes('const ALLOWED_CHAR = /[A-Za-z0-9._+-]/;'));

    // the generated config
    trunks = [trunk('6a81573be22f6bf134136e83', 'good', 'vinil'), trunk('6ad4bff2ef3fcee958047934', 'mtvstrunk', 'mukkamtvs@gmail.com')];
    const conf = await generatePjsipConfig();
    check('a plain username gets its registration', conf.includes('[trunk-6a81573be22f6bf134136e83-reg]') && conf.includes('client_uri=sip:vinil@x.sip.vobiz.ai'));
    check('an old bad username gets no registration section', !conf.includes('[trunk-6ad4bff2ef3fcee958047934-reg]') && !conf.includes('sip:mukkamtvs@gmail.com@'));
    check('its endpoint is still written', conf.includes('[trunk-6ad4bff2ef3fcee958047934]\ntype=endpoint'));
    const warned = getLogs({ userId: 'owner' }).filter(l => /mtvstrunk/.test(l.message) && /registration left out/.test(l.message));
    check('and the SIP log says why', warned.length === 1, warned[0]?.message);

    // what a failed call records
    const { originateFailureMessage } = require(B + '/services/sip/sip-manager');
    const alloc = originateFailureMessage({ body: { error: 'Allocation failed' } }, { name: 'mtvstrunk' }, '+917012419963');
    check('Allocation failed explains the trunk is not loaded', /not placed/.test(alloc) && /"mtvstrunk" is not loaded in Asterisk/.test(alloc), alloc);
    const other = originateFailureMessage({ body: 'Endpoint not found' }, { name: 'x' }, '+1');
    check("other refusals pass on Asterisk's words", /Endpoint not found/.test(other), other);

    console.log(fail === 0 ? '\nAll SIP trunk config checks passed.' : `\n${fail} check(s) FAILED.`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
