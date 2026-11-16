#!/usr/bin/env node
/**
 * Inbound fallback forwarding (services/sip/fallback-plan.js and sip-manager.js):
 *
 *   planFallback: no fallback, no / switched-off trunk, unparseable number, the number
 *   itself, a national number given the called DID's country, caller ID choice, and a
 *   trunk set to dial without the "+"
 *
 *   handleInboundCall against a fake ARI, with no database:
 *     no agent -> the fallback is dialled over trunk-<id>, the caller is NOT hung up,
 *                 and is bridged to the fallback when it answers
 *     the assigned agent was deleted -> forwarded the same way
 *     fallback busy -> the caller is hung up, nothing is bridged, the SIP log says why
 *     the fallback is the number itself -> nothing is dialled
 *
 * A real call still needs a live trunk.
 *
 *   node scripts/fallback-forward-test.js
 */
const path = require('path');
const { EventEmitter } = require('events');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 20; i++) await tick(); };

// ─── planFallback ────────────────────────────────────────────

const { planFallback } = require('../services/sip/fallback-plan');
const trunk = { _id: 'abc123', name: 'Telnyx', host: 'sip.telnyx.com', port: 5060, status: 'active', defaultCallerId: '+918071234567' };
const did = { phoneNumber: '+918069001234', fallbackNumber: '9846012345' };

check('no fallback number is refused', planFallback({ ...did, fallbackNumber: '' }, trunk).code === 'no_fallback');
check('no trunk is refused', planFallback(did, null).code === 'trunk_missing');
check('a switched-off trunk is refused', planFallback(did, { ...trunk, status: 'inactive' }).code === 'trunk_inactive');
check('an unparseable number is refused', planFallback({ ...did, fallbackNumber: '12' }, trunk).code === 'invalid_number');
check('the number itself is refused', planFallback({ ...did, fallbackNumber: '08069001234' }, trunk).code === 'fallback_is_self');
{
    const p = planFallback(did, trunk);
    check('a national fallback takes the called number\'s country', p.number === '+919846012345', JSON.stringify(p));
    check('caller ID is the trunk\'s default', p.callerId === '+918071234567');
}
check('caller ID falls back to the called number',
    planFallback(did, { ...trunk, defaultCallerId: '' }).callerId === '+918069001234');
check('an international fallback is kept',
    planFallback({ ...did, fallbackNumber: '+14155552671' }, trunk).number === '+14155552671');
check('a no-plus trunk gets the fallback\'s digits as saved',
    planFallback({ ...did, fallbackNumber: '09846012345' }, { ...trunk, stripPlus: true }).number === '09846012345');
check('a no-plus trunk with a dial prefix still gets E.164 (ari-service adds the prefix)',
    planFallback(did, { ...trunk, stripPlus: true, dialPrefix: '999' }).number === '+919846012345');
check('a no-plus trunk still refuses the number itself',
    planFallback({ ...did, fallbackNumber: '918069001234' }, { ...trunk, stripPlus: true }).code === 'fallback_is_self');

// ─── handleInboundCall with a fake ARI ───────────────────────

const backend = path.join(__dirname, '..');
const stub = (rel, exports) => {
    const file = require.resolve(path.join(backend, rel));
    require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

const ari = new EventEmitter();
let seq = 0;
const state = { originated: [], bridges: [], hungUp: [], played: [], sipLogs: [] };
ari.Playback = () => ({ stop: async () => { } });

function fakeChannel(id) {
    return {
        id,
        play: async ({ media }) => { state.played.push([id, media]); },
        hangup: async () => { state.hungUp.push(id); },
        answer: async () => { },
        getChannelVar: async () => ({ value: '203.0.113.9:5060' })
    };
}

stub('services/sip/ari-service', {
    isConnected: () => true,
    getAri: () => ari,
    originateCall: async (trunkId, destination, host, metadata) => {
        const ch = fakeChannel(`out-${++seq}`);
        state.originated.push({ trunkId, destination, metadata, ch });
        return ch;
    },
    createBridge: async (ids) => { const b = { id: `br-${++seq}`, ids }; state.bridges.push(b); return b; },
    destroyBridge: async () => { },
    hangupChannel: async (id) => { state.hungUp.push(id); },
    acquirePort: () => 40000, releasePort: () => { }
});
stub('services/sip/sip-log', { sipLog: (level, message) => state.sipLogs.push(`${level}: ${message}`) });
for (const s of ['sip-voice-stream', 'sip-deepgram-agent-stream', 'sip-sarvam-stream', 'sip-gemini-live-stream']) {
    stub(`services/sip/${s}`, class { });
}

let phoneConfig = null;
let agentDoc = null;
let currentTrunk = trunk;
let callLogsCreated = 0;
stub('models/PhoneNumber', { findOne: async () => phoneConfig, findById: async () => phoneConfig });
stub('models/SipTrunk', { findById: async () => currentTrunk, findOne: async () => null });
stub('models/Agent', { findOne: async () => agentDoc });
stub('models/Lead', Object.assign(function Lead() { }, { findOne: async () => ({ _id: 'lead1' }) }));
stub('models/CallLog', { create: async () => { callLogsCreated++; }, updateOne: async () => { } });
stub('services/webhook-service', { trigger: () => { } });
stub('services/email-service', { trigger: () => { } });
stub('utils/own-sip-host', { ownSipHostError: async () => null });

const sipManager = require('../services/sip/sip-manager');

function reset() {
    state.originated = []; state.bridges = []; state.hungUp = []; state.played = []; state.sipLogs = [];
    callLogsCreated = 0;
    ari.removeAllListeners();
}

(async () => {
    // 1. No agent assigned.
    reset();
    phoneConfig = { _id: 'pn1', phoneNumber: '+918069001234', fallbackNumber: '9846012345', sipTrunkId: 'abc123', createdBy: 'u1', inboundAgentId: null };
    await sipManager.handleInboundCall(fakeChannel('in-1'), '+918069001234', '+919000000001');
    await settle();
    const o = state.originated[0];
    check('no agent: the fallback is dialled', !!o, `${state.originated.length} originated`);
    check('no agent: over the number\'s own trunk (trunk-<id>)', o?.trunkId === 'abc123');
    check('no agent: to the normalised fallback', o?.destination === '+919846012345', o?.destination);
    check('no agent: presenting the trunk\'s caller ID', o?.metadata.callerId === '+918071234567');
    check('no agent: the trunk\'s dial settings go with it', o?.metadata.stripPlus === false && o?.metadata.dialPrefix === '');
    check('no agent: the caller is not hung up while it rings', !state.hungUp.includes('in-1'), JSON.stringify(state.hungUp));
    check('no agent: the caller hears ringback', state.played.some(([id, m]) => id === 'in-1' && m === 'tone:ring'));
    check('no agent: the forward is tracked as an active call', sipManager.getActiveCallCount() === 1);

    ari.emit('StasisStart', { args: ['outbound'] }, o.ch);
    await settle();
    check('no agent: answered fallback is bridged with the caller',
        state.bridges.length === 1 && state.bridges[0].ids.includes('in-1') && state.bridges[0].ids.includes(o.ch.id));
    check('no agent: the caller is still up after the bridge', !state.hungUp.includes('in-1'));

    ari.emit('ChannelDestroyed', { channel: { id: o.ch.id }, cause: 16 });
    await settle();
    check('no agent: the fallback hanging up ends the caller too', state.hungUp.includes('in-1'));
    check('no agent: the call is no longer tracked', sipManager.getActiveCallCount() === 0);
    check('no agent: no CallLog without an agent', callLogsCreated === 0);
    check('no agent: the SIP log has the forward', state.sipLogs.some(l => /forwarded to \+919846012345/.test(l)));

    // 2. The assigned agent was deleted: forwarded the same way, and the caller hanging up ends it.
    reset();
    agentDoc = null;
    phoneConfig = { ...phoneConfig, inboundAgentId: 'gone' };
    await sipManager.handleInboundCall(fakeChannel('in-2'), '+918069001234', '+919000000002');
    await settle();
    const o2 = state.originated[0];
    check('deleted agent: the fallback is dialled', o2?.destination === '+919846012345');
    ari.emit('ChannelDestroyed', { channel: { id: 'in-2' }, cause: 16 });
    await settle();
    check('deleted agent: caller hangup drops the ringing fallback leg', state.hungUp.includes(o2.ch.id));
    check('deleted agent: the call is no longer tracked', sipManager.getActiveCallCount() === 0);

    // 3. Fallback busy.
    reset();
    phoneConfig = { ...phoneConfig, inboundAgentId: null };
    await sipManager.handleInboundCall(fakeChannel('in-3'), '+918069001234', '+919000000003');
    await settle();
    const o3 = state.originated[0];
    ari.emit('ChannelDestroyed', { channel: { id: o3.ch.id }, cause: 17 });
    await settle();
    check('busy: the caller is hung up', state.hungUp.includes('in-3'));
    check('busy: nothing was bridged', state.bridges.length === 0);
    check('busy: the SIP log says it was busy', state.sipLogs.some(l => /not reached \(busy\)/.test(l)), state.sipLogs.join(' | '));

    // 4. The fallback is the number itself.
    reset();
    phoneConfig = { ...phoneConfig, fallbackNumber: '+918069001234' };
    await sipManager.handleInboundCall(fakeChannel('in-4'), '+918069001234', '+919000000004');
    await settle();
    check('self: nothing is dialled', state.originated.length === 0);
    check('self: the caller is hung up', state.hungUp.includes('in-4'));
    check('self: the SIP log says why', state.sipLogs.some(l => /not forwarded: the fallback number is this same number/.test(l)));

    // 5. A trunk set to dial without the "+".
    reset();
    currentTrunk = { ...trunk, stripPlus: true };
    phoneConfig = { ...phoneConfig, fallbackNumber: '+919846012345' };
    await sipManager.handleInboundCall(fakeChannel('in-5'), '+918069001234', '+919000000005');
    await settle();
    const o5 = state.originated[0];
    check('no-plus trunk: the fallback leg is dialled with stripPlus set', o5?.metadata.stripPlus === true, JSON.stringify(o5?.metadata));
    ari.emit('ChannelDestroyed', { channel: { id: 'in-5' }, cause: 16 });
    await settle();

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
