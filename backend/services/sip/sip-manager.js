const { v4: uuidv4 } = require('uuid');
const ariService = require('./ari-service');
const { sipLog } = require('./sip-log');
const SipVoiceStream = require('./sip-voice-stream');
const SipDeepgramAgentStream = require('./sip-deepgram-agent-stream');
const SipSarvamStream = require('./sip-sarvam-stream');
const SipGeminiLiveStream = require('./sip-gemini-live-stream');
const PhoneNumber = require('../../models/PhoneNumber');
const SipTrunk = require('../../models/SipTrunk');
const Agent = require('../../models/Agent');
const Lead = require('../../models/Lead');
const CallLog = require('../../models/CallLog');
const WebhookService = require('../webhook-service');
const EmailService = require('../email-service');

// Track all active SIP calls for cleanup
const activeCalls = new Map();

// Configurable concurrent call limit (env or default 50)
const MAX_CONCURRENT_CALLS = parseInt(process.env.SIP_MAX_CONCURRENT_CALLS) || 50;

// ─── Outbound failure causes ─────────────────────────────────
// Asterisk reports hangups as Q.850 cause codes, NOT SIP response names — ARI's
// cause_txt is ast_cause2str() output ("User alerting, no answer"), never
// "Request Timeout". The SIP response each code comes from is noted so the
// message can name what the provider actually sent back.
const HANGUP_CAUSE_MESSAGES = {
    1: 'The provider does not recognise this number (404). Check the number format — if your carrier needs a technical dial prefix, set it in the trunk\'s Dial Prefix field.',
    3: 'The provider has no route to this destination. This destination is probably not enabled on your account — ask your carrier to open the route.',
    16: 'The call ended normally.',
    17: 'The number is busy (486).',
    18: 'The destination did not respond (480). The number may be switched off or unreachable.',
    19: 'The call rang but nobody answered. The trunk and the number both work — nothing to fix here.',
    20: 'The subscriber is absent or unreachable.',
    21: 'The provider rejected the call (403/407). Check the trunk username and password, whether your server IP is whitelisted, and whether the caller ID you send is authorised on your account.',
    22: 'The number has changed and is no longer in service.',
    27: 'The destination is out of order.',
    28: 'The provider rejected the number format (484). If your carrier requires a technical dial prefix, set it in the trunk\'s Dial Prefix field.',
    34: 'The provider has no circuits available right now (congestion). Retry shortly.',
    38: 'The provider returned a server error (500/501/502).',
    41: 'The provider is temporarily unavailable (503). It is reachable but refusing calls — usually capacity, balance, or a route being down.',
    42: 'The provider\'s switch is congested. Retry shortly.',
    58: 'Codec mismatch (488) — the provider rejected the audio codecs offered. Set the trunk Codecs to PCMU,PCMA; G729 needs a licence Asterisk does not ship with.',
    88: 'The provider rejected the call as incompatible (493).',
    102: 'The provider did not respond in time (408 timeout). Verify the SIP Host and Port in your trunk settings, and that the provider allows SIP from your server IP.'
};

// WebSocket broadcast reference (set from server.js)
let wsBroadcast = null;
function setWsBroadcast(fn) { wsBroadcast = fn; }

/**
 * Emit a real-time event to all connected dashboard clients
 */
function emitEvent(event, data) {
    if (wsBroadcast) {
        try { wsBroadcast(JSON.stringify({ type: event, ...data })); } catch (_) { }
    }
}

// ─── Outbound ────────────────────────────────────────────────

/**
 * Place an outbound call via SIP trunk (called by campaigns or test calls)
 * When testCall is true, plays testPhrase once via TTS then hangs up (no agent conversation).
 */
async function placeCall({ phoneNumber, agent, lead, campaign, userId, testCall = false, testPhrase = '' }) {
    if (!ariService.isConnected()) {
        throw new Error('Asterisk not available. Ensure Asterisk is running and ARI is configured.');
    }

    // Step 3.6: Concurrent call limit
    if (activeCalls.size >= MAX_CONCURRENT_CALLS) {
        throw new Error(`Concurrent SIP call limit reached (${MAX_CONCURRENT_CALLS}). Try again shortly.`);
    }

    // Resolve the SIP trunk: use the explicitly passed phoneNumber (from test call UI
    // or campaign outbound number), NOT always the agent's default outbound number.
    // The phoneNumber param may already be populated or may need a fresh fetch.
    let fromNumber;
    if (phoneNumber && phoneNumber.sipTrunkId) {
        // If sipTrunkId is already populated (an object with _id), use it directly
        if (typeof phoneNumber.sipTrunkId === 'object' && phoneNumber.sipTrunkId._id) {
            fromNumber = phoneNumber;
        } else {
            // sipTrunkId is just an ObjectId — populate it
            fromNumber = await PhoneNumber.findById(phoneNumber._id || phoneNumber).populate('sipTrunkId');
        }
    } else if (phoneNumber && phoneNumber._id) {
        // phoneNumber passed but sipTrunkId not set — fetch and populate
        fromNumber = await PhoneNumber.findById(phoneNumber._id).populate('sipTrunkId');
    } else {
        // Fallback: use the agent's outbound phone number (campaign flow where phoneNumber is the agent's number)
        fromNumber = await PhoneNumber.findById(agent.outboundPhoneNumber._id || agent.outboundPhoneNumber).populate('sipTrunkId');
    }

    if (!fromNumber || fromNumber.provider !== 'sip' || !fromNumber.sipTrunkId) {
        throw new Error('Phone number does not have a valid SIP trunk configured');
    }

    const trunk = fromNumber.sipTrunkId;
    const callId = `sip-${uuidv4()}`;
    const rtpPort = ariService.acquirePort();

    console.log(`📞 [SIP] Calling ${lead.phone} via ${trunk.name} (${trunk.host})`);
    sipLog('info', `${testCall ? 'Test call' : 'Call'} to ${lead.phone} via trunk "${trunk.name}" (${trunk.host})`, {
        userId, callId, trunkId: trunk._id
    });

    let voiceStream = null;
    try {
        // 1. Start the AI voice stream (opens UDP socket)
        // Deepgram Voice Agent and Gemini Live have no test-phrase mode, so their test
        // calls fall back to the classic ElevenLabs stream. Sarvam is self-contained
        // (Sarvam-only accounts have no ElevenLabs key), so it speaks the test phrase
        // through its own Bulbul TTS.
        const useDeepgramAgent = !testCall && agent.voiceEngine === 'deepgram_agent';
        const useGeminiLive = !testCall && agent.voiceEngine === 'gemini_live';
        const useSarvam = agent.voiceEngine === 'sarvam';
        if (useDeepgramAgent) {
            voiceStream = new SipDeepgramAgentStream({
                userId, agentId: agent._id, leadId: lead._id,
                campaignId: campaign?._id || null,
                direction: 'outbound', callId, rtpPort
            });
        } else if (useGeminiLive) {
            voiceStream = new SipGeminiLiveStream({
                userId, agentId: agent._id, leadId: lead._id,
                campaignId: campaign?._id || null,
                direction: 'outbound', callId, rtpPort
            });
        } else if (useSarvam) {
            voiceStream = new SipSarvamStream({
                userId, agentId: agent._id, leadId: lead._id,
                campaignId: campaign?._id || null,
                direction: 'outbound', callId, rtpPort,
                testCall, testPhrase
            });
        } else {
            voiceStream = new SipVoiceStream({
                userId, agentId: agent._id, leadId: lead._id,
                campaignId: campaign?._id || null,
                direction: 'outbound', callId, rtpPort,
                testCall, testPhrase
            });
        }
        if (useDeepgramAgent) console.log(`🤖 [SIP] Using Deepgram Voice Agent engine for ${callId}`);
        if (useGeminiLive) console.log(`✨ [SIP] Using Gemini Live engine for ${callId}`);
        if (useSarvam) console.log(`🇮🇳 [SIP] Using Sarvam AI engine for ${callId}`);

        // Human Transfer is SIP-only: this is the one transport that can dial and bridge a
        // second leg, so the capability is injected here and nowhere else. Test calls never
        // hold a conversation, so they never get it.
        if (!testCall && typeof voiceStream.setTransferHandler === 'function') {
            voiceStream.setTransferHandler((destinationId, reason) => transferCall(callId, destinationId, reason));
        }

        const ok = await voiceStream.start();
        if (!ok) {
            throw new Error('Voice engine failed to initialize');
        }
        console.log(`[SIP] Voice engine active for ${callId}`);

        // 2. Create ExternalMedia channel (Asterisk → our UDP socket)
        console.log(`[SIP] Allocating external media on port ${rtpPort}...`);
        const emChannel = await ariService.createExternalMedia(rtpPort);
        console.log(`[SIP] External media allocated: ${emChannel.id}`);

        // 3. Originate call via SIP trunk
        console.log(`[SIP] Originating call through trunk...`);
        const destination = lead.phone.startsWith('+') ? lead.phone : `+${lead.phone.replace(/\D/g, '')}`;
        const callChannel = await ariService.originateCall(
            trunk._id.toString(), destination, trunk.host,
            {
                userId, agentId: agent._id.toString(), leadId: lead._id.toString(),
                campaignId: campaign?._id?.toString() || '',
                callerId: trunk.defaultCallerId || fromNumber.phoneNumber,
                dialPrefix: trunk.dialPrefix || ''
            }
        );
        console.log(`[SIP] Call originated: ${callChannel.id}`);

        // 4. When call enters Stasis, bridge channels
        const ari = ariService.getAri();
        let onEarlyHangup; // forward-declare so onStasis can remove it
        const onStasis = async (event, channel) => {
            if (channel.id !== callChannel.id) return;
            ari.removeListener('StasisStart', onStasis);
            // Call entered Stasis — SIP negotiation succeeded, remove the early-hangup watcher
            if (onEarlyHangup) ari.removeListener('ChannelDestroyed', onEarlyHangup);

            // The hangup watcher must be registered BEFORE the awaits below. Answering,
            // bridging, starting the recording and loading Settings are all I/O, and a
            // caller who hangs up inside that window would otherwise never be noticed:
            // the CallLog would sit at 'in-progress' until the auto-hangup limit fired
            // minutes later — logging that entire idle stretch as call duration.
            // activeCalls must be populated first too, or endCall() early-returns.
            let hungUpDuringSetup = false;
            activeCalls.set(callId, {
                voiceStream, callChannel, emChannel, bridge: null, rtpPort, userId,
                // Human Transfer needs the agent (for its destinations) and the trunk
                // (to dial the second leg over the same carrier) later in the call.
                agentId: agent._id, trunkId: trunk._id,
                sourcePhoneNumberId: fromNumber?._id || null,
                transferCount: 0, transferChannel: null
            });
            const onDestroy = (evt) => {
                if (evt.channel.id !== channel.id) return;
                ari.removeListener('ChannelDestroyed', onDestroy);
                hungUpDuringSetup = true;
                endCall(callId);
            };
            ari.on('ChannelDestroyed', onDestroy);

            try {
                await channel.answer();
                if (hungUpDuringSetup) return;

                const bridge = await ariService.createBridge([emChannel.id, channel.id]);
                const tracked = activeCalls.get(callId);
                if (!tracked || hungUpDuringSetup) {
                    // Caller vanished mid-bridge: endCall() already ran and could not have
                    // seen this bridge, so tear it down here or it leaks in Asterisk.
                    await ariService.destroyBridge(bridge.id);
                    return;
                }
                tracked.bridge = bridge;

                // Step 3.3: Start recording via Asterisk (if enabled)
                try {
                    const Settings = require('../../models/Settings');
                    const settings = await Settings.findOne({ userId });
                    const recordingEnabled = settings?.recordingEnabled !== false;

                    if (recordingEnabled) {
                        await bridge.record({
                            name: callId, format: 'wav', beep: false, ifExists: 'overwrite'
                        });
                    }
                } catch (recErr) {
                    console.warn(`[SIP] Recording failed (non-fatal): ${recErr.message}`);
                }
                if (hungUpDuringSetup) return;

                console.log(`✅ [SIP] Call ${callId} bridged`);
                sipLog('success', `Call to ${lead.phone} answered and bridged`, { userId, callId, trunkId: trunk._id });

                // Signal the voice stream that the bridge is up — greeting can now be sent
                voiceStream.setBridgeReady();

                // Auto-hangup timer
                const Settings = require('../../models/Settings');
                const settings = await Settings.findOne({ userId });
                if (settings?.autoHangupEnabled) {
                    const limit = settings.outgoingHangupLimit ?? 10;
                    const hangupMs = limit * 60 * 1000;
                    console.log(`⏳ [SIP Outbound] Auto-hangup scheduled in ${limit} minutes for ${callId}`);
                    setTimeout(() => {
                        if (activeCalls.has(callId)) {
                            console.log(`⏰ [SIP Outbound] Auto-hangup triggered for ${callId}`);
                            endCall(callId);
                        }
                    }, hangupMs);
                }

                if (testCall && typeof voiceStream.setOnTestComplete === 'function') {
                    voiceStream.setOnTestComplete(() => endCall(callId));
                }

                // The agent decided the conversation is over — it has already finished
                // speaking its closing line by the time this fires.
                if (typeof voiceStream.setOnEndCall === 'function') {
                    voiceStream.setOnEndCall(() => endCall(callId));
                }

                // Caller RTP stopped: a hangup Asterisk never told us about.
                voiceStream.onMediaTimeout = () => endCall(callId);

                // Step 3.5: Notify dashboard
                emitEvent('sip:call-started', {
                    callId, direction: 'outbound', to: lead.phone,
                    agentName: agent.name, trunkName: trunk.name, userId
                });
            } catch (err) {
                console.error(`❌ [SIP] Bridge failed: ${err.message}`);
                sipLog('error', `Bridge setup failed for call to ${lead.phone}: ${err.message}`, { userId, callId, trunkId: trunk._id });
                emitEvent('sip:call-failed', {
                    callId, userId,
                    reason: `Bridge setup failed: ${err.message}`,
                    phase: 'bridge'
                });
                endCall(callId);
            }
        };
        ari.on('StasisStart', onStasis);

        // Watch for early hangup (SIP trunk rejected: 407, 403, 404, etc.)
        // If the call channel is destroyed before Stasis fires, the trunk rejected it.
        onEarlyHangup = (evt) => {
            if (evt.channel.id !== callChannel.id) return;
            ari.removeListener('ChannelDestroyed', onEarlyHangup);
            ari.removeListener('StasisStart', onStasis);

            const cause = evt.cause_txt || evt.channel?.hangup_cause || 'Unknown';
            const causeCode = evt.cause || 0;
            console.error(`❌ [SIP] Call did not connect (cause ${causeCode}: ${cause})`);

            // Q.850 cause → what the buyer should actually do about it
            const userMessage = HANGUP_CAUSE_MESSAGES[causeCode] || `Call failed: ${cause}.`;

            // Ringing-but-unanswered and busy are normal call outcomes, not faults —
            // logging them as errors sends buyers hunting for a problem that isn't there.
            const level = (causeCode === 17 || causeCode === 19) ? 'info' : 'error';
            sipLog(level, `Call to ${lead.phone} via trunk "${trunk.name}" did not connect (cause ${causeCode}: ${cause}). ${userMessage}`, {
                userId, callId, trunkId: trunk._id
            });
            emitEvent('sip:call-failed', {
                callId, userId,
                reason: userMessage,
                cause: cause,
                causeCode: causeCode,
                phase: 'sip-negotiation'
            });

            // Cleanup
            if (voiceStream) voiceStream.cleanup();
            ariService.releasePort(rtpPort);
            if (activeCalls.has(callId)) activeCalls.delete(callId);
        };
        ari.on('ChannelDestroyed', onEarlyHangup);

        // CallLog is already created/upserted by SipVoiceStream.start()
        // No duplicate create needed here

        return { callId, status: 'initiated' };
    } catch (err) {
        if (voiceStream) await voiceStream.cleanup();
        ariService.releasePort(rtpPort);
        throw err;
    }
}

// ─── Inbound ─────────────────────────────────────────────────

/**
 * Normalize phone number for flexible matching (Step 3.1)
 * Handles: +966501234567, 966501234567, 0501234567, 501234567
 */
function buildNumberVariants(number) {
    const digits = number.replace(/\D/g, '');
    const variants = [number, digits];

    // With and without leading +
    if (number.startsWith('+')) variants.push(digits);
    else variants.push(`+${digits}`);

    // Without country code (try stripping 1-3 digit prefix)
    if (digits.length > 7) {
        variants.push(digits.slice(1));       // e.g. 966xx → 66xx
        variants.push(digits.slice(2));       // e.g. 966xx → 6xx
        variants.push(digits.slice(3));       // e.g. 966xx → xx (local)
        variants.push('0' + digits.slice(3)); // e.g. 966xx → 0xx (Saudi local format)
    }

    return [...new Set(variants)];
}

// ─── Inbound scanner guard ───────────────────────────────────
// SIP scanners probe public servers with sequential fake numbers. Track source
// IPs whose calls repeatedly match no configured number and temporarily ban
// them: banned calls are hung up instantly with no media (no dialplan work,
// no "not in service" announcement that confirms a live SIP server).
// Legit provider IPs are unaffected — real DID traffic matches a number, and
// even a misconfigured DID unbans itself when the ban window expires.
const SCAN_BAN_THRESHOLD = parseInt(process.env.SIP_SCAN_BAN_THRESHOLD, 10) || 5;
const SCAN_WINDOW_MS = (parseInt(process.env.SIP_SCAN_WINDOW_MINUTES, 10) || 10) * 60 * 1000;
const SCAN_BAN_MS = (parseInt(process.env.SIP_SCAN_BAN_MINUTES, 10) || 60) * 60 * 1000;
const unmatchedInbound = new Map(); // ip -> { count, firstAt, bannedUntil }

async function getInboundSourceIp(channel) {
    try {
        const res = await channel.getChannelVar({ variable: 'CHANNEL(pjsip,remote_addr)' });
        const addr = res?.value || '';
        return addr.split(':')[0] || null;
    } catch (_) {
        return null;
    }
}

function isBannedIp(ip) {
    const entry = ip && unmatchedInbound.get(ip);
    return !!(entry && entry.bannedUntil && entry.bannedUntil > Date.now());
}

/** Register an unmatched-number attempt; returns true if the IP just got banned */
function registerUnmatchedInbound(ip) {
    if (!ip) return false;
    // Bound memory: drop oldest entries if the map grows unreasonably large
    if (unmatchedInbound.size > 10000) {
        const oldest = unmatchedInbound.keys().next().value;
        unmatchedInbound.delete(oldest);
    }
    const now = Date.now();
    let entry = unmatchedInbound.get(ip);
    if (!entry || now - entry.firstAt > SCAN_WINDOW_MS) {
        entry = { count: 0, firstAt: now, bannedUntil: 0 };
    }
    entry.count += 1;
    unmatchedInbound.set(ip, entry);
    if (entry.count >= SCAN_BAN_THRESHOLD && !entry.bannedUntil) {
        entry.bannedUntil = now + SCAN_BAN_MS;
        return true;
    }
    return false;
}

/**
 * Handle an inbound SIP call (called from ari-service StasisStart)
 */
async function handleInboundCall(channel, calledNumber, callerNumber) {
    console.log(`📞 [SIP Inbound] ${callerNumber} → ${calledNumber}`);

    // Scanner guard: drop banned sources immediately, before any DB work or media
    const sourceIp = await getInboundSourceIp(channel);
    if (isBannedIp(sourceIp)) {
        try { await channel.hangup(); } catch (_) { }
        return;
    }

    // Step 3.6: Concurrent call limit
    if (activeCalls.size >= MAX_CONCURRENT_CALLS) {
        console.warn(`[SIP Inbound] Rejected: concurrent limit reached (${MAX_CONCURRENT_CALLS})`);
        try {
            // Play a brief message if possible, then hang up
            await channel.play({ media: 'sound:all-circuits-busy-now' }).catch(() => { });
        } catch (_) { }
        try { await channel.hangup(); } catch (_) { }
        return;
    }

    // Step 3.1: Robust number matching
    const variants = buildNumberVariants(calledNumber);
    let phoneConfig = await PhoneNumber.findOne({
        phoneNumber: { $in: variants },
        provider: 'sip'
    });

    // Step 3.2: Registration-based providers (e.g. Cloud Telecom) deliver the
    // inbound call addressed to the trunk's SIP *username* (e.g. "ha13"), not the
    // DID. When the dialed value doesn't match a number, fall back to the trunk
    // whose username equals it, then route to that trunk's configured number.
    if (!phoneConfig && calledNumber) {
        const trunk = await SipTrunk.findOne({ username: calledNumber, status: 'active' });
        if (trunk) {
            phoneConfig = await PhoneNumber.findOne({
                sipTrunkId: trunk._id,
                provider: 'sip'
            });
            if (phoneConfig) {
                console.log(`[SIP Inbound] Matched by trunk username '${calledNumber}' → ${phoneConfig.phoneNumber} (trunk: ${trunk.name})`);
            }
        }
    }

    // Step 3.4: Graceful fallback when no agent
    if (!phoneConfig) {
        console.error(`[SIP Inbound] No SIP number configured for ${calledNumber}`);
        const justBanned = registerUnmatchedInbound(sourceIp);
        if (justBanned) {
            console.warn(`[SIP Inbound] Banned ${sourceIp} for ${SCAN_BAN_MS / 60000} min (${SCAN_BAN_THRESHOLD} unknown-number attempts — likely a SIP scanner)`);
            sipLog('warn', `Blocked ${sourceIp} for ${SCAN_BAN_MS / 60000} minutes after ${SCAN_BAN_THRESHOLD} calls to unknown numbers (likely a SIP scanner). Its calls will be dropped silently. If this is your provider, add the dialed number on the Phone Numbers page — the block lifts automatically.`);
        } else {
            // Common log (no owner known) — deliberately excludes the caller's number
            sipLog('error', `Inbound call rejected: no SIP phone number matches "${calledNumber}". Add it on the Phone Numbers page or check the trunk username.`);
            // Play the announcement only for first-time sources; repeat offenders
            // get a silent hangup so scanners can't confirm a live SIP server
            const attempts = sourceIp ? (unmatchedInbound.get(sourceIp)?.count || 0) : 0;
            if (attempts <= 1) {
                try { await channel.play({ media: 'sound:number-not-in-service' }).catch(() => { }); } catch (_) { }
            }
        }
        try { await channel.hangup(); } catch (_) { }
        return;
    }

    sipLog('info', `Inbound call from ${callerNumber} to ${phoneConfig.phoneNumber}`, {
        userId: phoneConfig.createdBy, trunkId: phoneConfig.sipTrunkId
    });

    if (!phoneConfig.inboundAgentId) {
        console.warn(`[SIP Inbound] No agent mapped to ${calledNumber}`);
        sipLog('warn', `Inbound call to ${phoneConfig.phoneNumber} has no inbound agent assigned${phoneConfig.fallbackNumber ? `; forwarding to fallback ${phoneConfig.fallbackNumber}` : '. Assign one on the Phone Numbers page.'}`, {
            userId: phoneConfig.createdBy, trunkId: phoneConfig.sipTrunkId
        });

        // Try fallback number
        if (phoneConfig.fallbackNumber) {
            console.log(`[SIP Inbound] Forwarding to fallback: ${phoneConfig.fallbackNumber}`);
            try {
                // Dial the fallback number through the same trunk
                const trunkId = phoneConfig.sipTrunkId?.toString();
                if (trunkId) {
                    await channel.continueInDialplan({ context: 'intellicall-inbound', extension: phoneConfig.fallbackNumber });
                }
            } catch (fwdErr) {
                console.error(`[SIP Inbound] Fallback forward failed: ${fwdErr.message}`);
            }
        }
        try { await channel.hangup(); } catch (_) { }
        return;
    }

    const userId = phoneConfig.createdBy;
    const agent = await Agent.findOne({ _id: phoneConfig.inboundAgentId, createdBy: userId });
    if (!agent) {
        console.error(`[SIP Inbound] Agent not found or not owned by user: ${phoneConfig.inboundAgentId}`);
        sipLog('error', `Inbound call to ${phoneConfig.phoneNumber} dropped: the assigned inbound agent no longer exists. Re-assign an agent on the Phone Numbers page.`, {
            userId, trunkId: phoneConfig.sipTrunkId
        });
        try { await channel.hangup(); } catch (_) { }
        return;
    }

    const callId = `sip-${uuidv4()}`;
    const rtpPort = ariService.acquirePort();

    // Find or create lead
    const normalizedFrom = callerNumber.replace(/\D/g, '');
    let lead = await Lead.findOne({ phone: normalizedFrom, createdBy: userId });
    if (!lead) {
        lead = new Lead({
            name: `Inbound (${callerNumber})`, phone: normalizedFrom,
            createdBy: userId, tags: ['inbound', 'sip']
        });
        await lead.save();

        // Trigger Webhook + Email
        WebhookService.trigger(userId, 'leadCreated', { lead });
        EmailService.trigger(userId, 'leadCreated', { lead });
    }

    try {
        let voiceStream;
        if (agent.voiceEngine === 'deepgram_agent') {
            voiceStream = new SipDeepgramAgentStream({
                userId, agentId: agent._id, leadId: lead._id,
                campaignId: null, direction: 'inbound', callId, rtpPort
            });
            console.log(`🤖 [SIP Inbound] Using Deepgram Voice Agent engine for ${callId}`);
        } else if (agent.voiceEngine === 'gemini_live') {
            voiceStream = new SipGeminiLiveStream({
                userId, agentId: agent._id, leadId: lead._id,
                campaignId: null, direction: 'inbound', callId, rtpPort
            });
            console.log(`✨ [SIP Inbound] Using Gemini Live engine for ${callId}`);
        } else if (agent.voiceEngine === 'sarvam') {
            voiceStream = new SipSarvamStream({
                userId, agentId: agent._id, leadId: lead._id,
                campaignId: null, direction: 'inbound', callId, rtpPort
            });
            console.log(`🇮🇳 [SIP Inbound] Using Sarvam AI engine for ${callId}`);
        } else {
            voiceStream = new SipVoiceStream({
                userId, agentId: agent._id, leadId: lead._id,
                campaignId: null, direction: 'inbound', callId, rtpPort
            });
        }

        // Human Transfer — see the outbound path above.
        if (typeof voiceStream.setTransferHandler === 'function') {
            voiceStream.setTransferHandler((destinationId, reason) => transferCall(callId, destinationId, reason));
        }

        // Watch for hangup BEFORE answering. Answering, starting the engine, allocating
        // external media, bridging and loading Settings are all I/O; a caller who gives up
        // inside that window must still close the call out, or the row sits 'in-progress'
        // until the auto-hangup limit fires and reports that idle time as call duration.
        const ari = ariService.getAri();
        let hungUpDuringSetup = false;
        activeCalls.set(callId, {
            voiceStream, callChannel: channel, emChannel: null, bridge: null, rtpPort, userId,
            // See the outbound path — Human Transfer resolves both of these at dial time.
            agentId: agent._id, trunkId: phoneConfig.sipTrunkId,
            sourcePhoneNumberId: phoneConfig._id,
            transferCount: 0, transferChannel: null
        });
        const onDestroy = (evt) => {
            if (evt.channel.id !== channel.id) return;
            ari.removeListener('ChannelDestroyed', onDestroy);
            hungUpDuringSetup = true;
            endCall(callId);
        };
        ari.on('ChannelDestroyed', onDestroy);

        await channel.answer();
        if (hungUpDuringSetup) return;

        const ok = await voiceStream.start();
        if (!ok || hungUpDuringSetup) {
            ari.removeListener('ChannelDestroyed', onDestroy);
            await endCall(callId);
            return;
        }

        const emChannel = await ariService.createExternalMedia(rtpPort);
        const tracked = activeCalls.get(callId);
        if (!tracked || hungUpDuringSetup) {
            await ariService.hangupChannel(emChannel.id);
            return;
        }
        tracked.emChannel = emChannel;

        const bridge = await ariService.createBridge([emChannel.id, channel.id]);
        if (!activeCalls.has(callId) || hungUpDuringSetup) {
            // endCall() already ran and could not have seen this bridge — destroy it here.
            await ariService.destroyBridge(bridge.id);
            return;
        }
        tracked.bridge = bridge;

        // Step 3.3: Start recording (if enabled)
        try {
            const Settings = require('../../models/Settings');
            const settings = await Settings.findOne({ userId });
            if (settings?.recordingEnabled !== false) {
                await bridge.record({ name: callId, format: 'wav', beep: false, ifExists: 'overwrite' });
            }
        } catch (recErr) {
            console.warn(`[SIP] Inbound recording failed (non-fatal): ${recErr.message}`);
        }
        if (hungUpDuringSetup) return;

        console.log(`✅ [SIP Inbound] Call ${callId} bridged`);

        // Signal the voice stream that the bridge is up — greeting can now be sent
        voiceStream.setBridgeReady();

        // Auto-hangup timer
        const Settings = require('../../models/Settings');
        const settings = await Settings.findOne({ userId });
        if (settings?.autoHangupEnabled) {
            const limit = settings.incomingHangupLimit ?? 10;
            const hangupMs = limit * 60 * 1000;
            console.log(`⏳ [SIP Inbound] Auto-hangup scheduled in ${limit} minutes for ${callId}`);

            // 1-minute warning for inbound
            if (limit > 1) {
                const warningMs = (limit - 1) * 60 * 1000;
                setTimeout(() => {
                    if (activeCalls.has(callId)) {
                        console.log(`🔔 [SIP Inbound] Playing 1-minute warning for ${callId}`);
                        voiceStream.injectAudioSpeech("This phone call will end in 1 minute.");
                    }
                }, warningMs);
            }

            setTimeout(() => {
                if (activeCalls.has(callId)) {
                    console.log(`⏰ [SIP Inbound] Auto-hangup triggered for ${callId}`);
                    endCall(callId);
                }
            }, hangupMs);
        }

        // The agent decided the conversation is over — it has already finished speaking
        // its closing line by the time this fires.
        if (typeof voiceStream.setOnEndCall === 'function') {
            voiceStream.setOnEndCall(() => endCall(callId));
        }

        // Caller RTP stopped: a hangup Asterisk never told us about.
        voiceStream.onMediaTimeout = () => endCall(callId);

        // Step 3.5: Notify dashboard
        emitEvent('sip:call-started', {
            callId, direction: 'inbound', from: callerNumber, to: calledNumber,
            agentName: agent.name, userId
        });
    } catch (err) {
        console.error(`❌ [SIP Inbound] Failed: ${err.message}`);
        if (activeCalls.has(callId)) {
            // Registered before answering, so route through endCall() to close the CallLog
            // out and release everything rather than leaking a non-terminal row.
            await endCall(callId);
        } else {
            ariService.releasePort(rtpPort);
        }
        try { await channel.hangup(); } catch (_) { }
    }
}

// ─── Human Transfer ──────────────────────────────────────────
// SIP only. IntelliCall owns the caller's channel for the whole call: the second leg is
// dialled over the same trunk, the AI stays bridged and audible while it rings, and the
// AI leg is swapped out only once a human actually answers. Every failure therefore lands
// back in the SAME live AI session, with its conversation context untouched.

/** Q.850 hangup cause → the outcome we report to the agent and store on the CallLog. */
const TRANSFER_CAUSE_OUTCOMES = {
    17: 'BUSY',
    18: 'NO_ANSWER', 19: 'NO_ANSWER',
    21: 'REJECTED',
    1: 'UNAVAILABLE', 3: 'UNAVAILABLE', 20: 'UNAVAILABLE',
    22: 'UNAVAILABLE', 27: 'UNAVAILABLE', 28: 'UNAVAILABLE'
};

function transferCauseOf(evt) {
    return Number(evt?.cause ?? evt?.channel?.cause ?? 0) || null;
}

function transferOutcomeFromCause(evt) {
    return TRANSFER_CAUSE_OUTCOMES[transferCauseOf(evt)] || 'FAILED';
}

/**
 * Every transfer outcome is returned to the model as a JSON string, never thrown — a
 * misconfigured or unreachable destination has to degrade into the agent apologising and
 * carrying on, and must never be able to drop a live call.
 */
function transferResult(code, message, extra = {}) {
    return JSON.stringify({
        ok: code === 'TRANSFER_CONNECTED',
        code,
        message,
        ...extra
    });
}

function transferRefusal(code, message) {
    return transferResult(code, message, {
        instruction: 'Do not claim the caller was transferred. Tell them briefly and naturally that you could not put them through, and carry on helping them yourself.'
    });
}

/** Webhook delivery must never be able to break a call in progress. */
function safeTransferWebhook(userId, event, payload) {
    try { WebhookService.trigger(userId, event, payload); } catch (_) { }
}

/**
 * Hand the live caller of `callId` to one of the agent's authorised human destinations.
 *
 * Called by the voice engines when the caller asks for a person. `requestedDestinationId`
 * is the only thing the model controls, and it is matched against the agent's configured
 * destinations — the phone number itself is resolved here, so a hallucinated number can
 * never be dialled.
 *
 * Resolves a JSON string describing the outcome, which the engine hands straight back to
 * the model as its tool/command result.
 */
async function transferCall(callId, requestedDestinationId = '', reason = '') {
    const call = activeCalls.get(callId);
    if (!call) return transferRefusal('FAILED', 'This call is no longer active.');
    if (!call.bridge || !call.callChannel || !call.emChannel) {
        return transferRefusal('FAILED', 'The call is not ready to be transferred yet.');
    }
    if (call.transferChannel) {
        return transferRefusal('FAILED', 'A transfer is already in progress on this call.');
    }

    const agent = await Agent.findOne({ _id: call.agentId, createdBy: call.userId }).lean().catch(() => null);
    const ht = agent?.humanTransfer;
    if (!ht?.enabled) {
        return transferRefusal('TRANSFER_DISABLED', 'Human transfer is switched off for this agent.');
    }

    const destinations = Array.isArray(ht.destinations)
        ? ht.destinations.filter(d => d && d.enabled !== false && d.id && d.value)
        : [];
    const wantedId = String(requestedDestinationId || ht.defaultDestinationId || '').trim().toLowerCase();
    const destination = destinations.find(d => String(d.id).toLowerCase() === wantedId);
    if (!destination) {
        return transferRefusal('DESTINATION_NOT_FOUND', requestedDestinationId
            ? `There is no configured destination called "${requestedDestinationId}".`
            : 'No default human destination is configured for this agent.');
    }

    const maxTransfers = Math.max(1, Math.min(10, Number(ht.maxTransfersPerCall) || 3));
    call.transferCount = Number(call.transferCount || 0);
    if (call.transferCount >= maxTransfers) {
        return transferRefusal('LIMIT_REACHED', 'This call has already used all of its transfer attempts.');
    }

    const trunk = call.trunkId ? await SipTrunk.findById(call.trunkId).catch(() => null) : null;
    if (!trunk || trunk.status === 'inactive') {
        return transferRefusal('FAILED', 'The SIP trunk for this call is unavailable.');
    }

    const ari = ariService.getAri();
    if (!ari || !ariService.isConnected()) {
        return transferRefusal('FAILED', 'The telephony server is not reachable right now.');
    }

    // Committed to dialling from here on, so the attempt counts against the per-call cap.
    call.transferCount += 1;
    const attempt = call.transferCount;
    const attemptId = uuidv4();
    const startedAt = Date.now();
    const timeoutSec = Math.max(5, Math.min(60, Number(destination.timeoutSeconds || ht.ringTimeoutSeconds) || 20));
    const trimmedReason = String(reason || '').slice(0, 500);

    const sourceNumber = call.sourcePhoneNumberId
        ? await PhoneNumber.findById(call.sourcePhoneNumberId).lean().catch(() => null)
        : null;
    const callerId = trunk.defaultCallerId || sourceNumber?.phoneNumber || '';

    await CallLog.updateOne({ callSid: callId }, {
        $push: {
            transfers: {
                attemptId,
                destinationId: destination.id,
                destinationName: destination.name,
                reason: trimmedReason,
                status: 'ringing',
                attempt,
                requestedAt: new Date(startedAt)
            }
        }
    }).catch(e => console.error(`[HumanTransfer] [${callId}] log push failed: ${e.message}`));

    /** Update this attempt's row in place — CallLog.transfers is append-only otherwise. */
    const settleLog = (fields) => CallLog.updateOne(
        { callSid: callId, 'transfers.attemptId': attemptId },
        { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`transfers.$.${k}`, v])) }
    ).catch(e => console.error(`[HumanTransfer] [${callId}] log update failed: ${e.message}`));

    const base = {
        callId, userId: call.userId,
        agentId: String(call.agentId || ''), agentName: agent?.name || '',
        destinationId: destination.id, destinationName: destination.name,
        reason: trimmedReason, attempt
    };

    console.log(`↪️  [HumanTransfer] [${callId}] Attempt ${attempt}/${maxTransfers} → ${destination.name} (${destination.id}), ringing up to ${timeoutSec}s`);
    sipLog('info', `Transferring the caller to "${destination.name}" (attempt ${attempt} of ${maxTransfers})`, {
        userId: call.userId, callId, trunkId: trunk._id
    });
    emitEvent('sip:transfer-ringing', { ...base, timeoutSeconds: timeoutSec });

    return await new Promise((resolve) => {
        let targetChannel = null;
        let answered = false;
        let settled = false;
        let ringTimer = null;

        const stopWatching = () => {
            ari.removeListener('StasisStart', onAnswered);
            ari.removeListener('ChannelDestroyed', onDestroyed);
            if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
        };

        /**
         * The human could not be reached. The caller never left the bridge, so this simply
         * drops the half-dialled leg and reports back to the still-connected agent.
         */
        const fail = async (code, evt = null, message = '') => {
            if (settled) return;
            settled = true;
            stopWatching();

            const endedAt = Date.now();
            const ringDurationMs = endedAt - startedAt;
            const sipCause = transferCauseOf(evt);

            if (targetChannel) await ariService.hangupChannel(targetChannel.id).catch(() => { });
            if (targetChannel && call.transferChannel?.id === targetChannel.id) call.transferChannel = null;

            await settleLog({
                status: code.toLowerCase(), endedAt: new Date(endedAt),
                ringDurationMs, failureCode: code, sipCause
            });

            console.log(`↩️  [HumanTransfer] [${callId}] ${code} after ${ringDurationMs}ms — caller stays with the agent`);
            const payload = { ...base, result: code, ringDurationMs, sipCause };
            emitEvent('sip:transfer-failed', payload);
            safeTransferWebhook(call.userId, 'transferFailed', payload);

            resolve(transferResult(code, message || 'The human destination could not be reached.', {
                destination_id: destination.id,
                destination_name: destination.name,
                ring_duration_ms: ringDurationMs,
                instruction: 'Tell the caller naturally that the person or department could not be reached, and offer to keep helping them yourself.'
            }));
        };

        const onDestroyed = (evt) => {
            if (!targetChannel || evt.channel?.id !== targetChannel.id) return;

            if (!answered) {
                fail(transferOutcomeFromCause(evt), evt)
                    .catch(e => console.error(`[HumanTransfer] [${callId}] failure handling:`, e.message));
                return;
            }

            // The human hung up. Nothing is left bridged to the caller — the AI was
            // detached on answer — so the whole call is over.
            ari.removeListener('ChannelDestroyed', onDestroyed);
            const endedAt = Date.now();
            const connectedDurationMs = Math.max(0, endedAt - (call.transferAnsweredAt || endedAt));
            settleLog({ status: 'completed', endedAt: new Date(endedAt), connectedDurationMs });
            emitEvent('sip:transfer-completed', { ...base, result: 'COMPLETED', connectedDurationMs });
            call.transferChannel = null;
            endCall(callId).catch(e => console.error(`[HumanTransfer] [${callId}] endCall:`, e.message));
        };

        const onAnswered = async (event, channel) => {
            if (!targetChannel || channel.id !== targetChannel.id) return;
            // The ring timer can fire in the same tick the destination picks up. Claim the
            // outcome before the first await so that race cannot end with the AI removed
            // from a bridge whose other leg is already being hung up — a silent caller.
            if (settled) return;
            settled = true;
            answered = true;
            ari.removeListener('StasisStart', onAnswered);
            if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }

            try {
                call.transferChannel = channel;
                call.transferAnsweredAt = Date.now();

                // Add the human BEFORE removing the AI, so the caller is never alone in
                // the bridge and a failed add leaves the agent still connected.
                await call.bridge.addChannel({ channel: channel.id });
                await call.bridge.removeChannel({ channel: call.emChannel.id });

                // The AI leg is out of the bridge: stop its media watchdogs (which would
                // otherwise read the silence as a hangup and kill the call within seconds)
                // and close its engine socket, while leaving the CallLog to endCall().
                if (typeof call.voiceStream?.detachForTransfer === 'function') {
                    call.voiceStream.detachForTransfer();
                }

                const ringDurationMs = call.transferAnsweredAt - startedAt;
                await settleLog({
                    status: 'connected',
                    answeredAt: new Date(call.transferAnsweredAt),
                    ringDurationMs
                });

                console.log(`✅ [HumanTransfer] [${callId}] ${destination.name} answered after ${ringDurationMs}ms — caller handed over`);
                sipLog('success', `Caller transferred to "${destination.name}"`, {
                    userId: call.userId, callId, trunkId: trunk._id
                });
                const payload = { ...base, result: 'TRANSFER_CONNECTED', ringDurationMs };
                emitEvent('sip:transfer-answered', payload);
                safeTransferWebhook(call.userId, 'callTransferred', payload);

                resolve(transferResult('TRANSFER_CONNECTED', 'The human destination answered and the caller is now connected to them.', {
                    destination_id: destination.id,
                    destination_name: destination.name,
                    ring_duration_ms: ringDurationMs
                }));
            } catch (err) {
                console.error(`❌ [HumanTransfer] [${callId}] Bridge handover failed: ${err.message}`);
                // Put the AI back in the bridge — adding a channel already in it is a no-op.
                try { await call.bridge.addChannel({ channel: call.emChannel.id }); } catch (_) { }
                try { await ariService.hangupChannel(channel.id); } catch (_) { }
                call.transferChannel = null;
                // Release the claim taken above so fail() can report this and resolve.
                answered = false;
                settled = false;
                await fail('FAILED', null, 'The caller could not be connected to the destination.');
            }
        };

        (async () => {
            try {
                targetChannel = await ariService.originateCall(
                    trunk._id.toString(), destination.value, trunk.host,
                    {
                        userId: String(call.userId || ''),
                        agentId: String(call.agentId || ''),
                        leadId: '', campaignId: '',
                        callerId,
                        dialPrefix: trunk.dialPrefix || ''
                    }
                );
                call.transferChannel = targetChannel;

                ari.on('StasisStart', onAnswered);
                ari.on('ChannelDestroyed', onDestroyed);

                // Backstop for a destination that rings forever, and for the rare hangup
                // event we never see — either way the caller goes back to the agent.
                ringTimer = setTimeout(() => {
                    fail('NO_ANSWER', null, 'The destination did not answer within the configured time.')
                        .catch(e => console.error(`[HumanTransfer] [${callId}] timeout handling:`, e.message));
                }, timeoutSec * 1000);
                if (typeof ringTimer.unref === 'function') ringTimer.unref();
            } catch (err) {
                console.error(`❌ [HumanTransfer] [${callId}] Could not dial ${destination.name}: ${err.message}`);
                await fail('FAILED', null, 'The destination could not be dialled.');
            }
        })();
    });
}

// ─── Cleanup ─────────────────────────────────────────────────

/**
 * End a SIP call — cleanup all resources
 */
async function endCall(callId) {
    const call = activeCalls.get(callId);
    if (!call) return;

    activeCalls.delete(callId);
    console.log(`🛑 [SIP] Ending call ${callId}`);
    sipLog('info', 'Call ended', { userId: call.userId, callId });

    // Cleanup voice stream (saves transcript, triggers analysis)
    if (call.voiceStream) await call.voiceStream.cleanup();

    // Cleanup Asterisk resources
    // A transferred call still has the human's leg up — drop it with everything else.
    if (call.transferChannel) await ariService.hangupChannel(call.transferChannel.id);
    if (call.bridge) await ariService.destroyBridge(call.bridge.id);
    if (call.emChannel) await ariService.hangupChannel(call.emChannel.id);
    if (call.callChannel) await ariService.hangupChannel(call.callChannel.id);

    // Release RTP port
    ariService.releasePort(call.rtpPort);

    // Step 3.5: Notify dashboard
    emitEvent('sip:call-ended', { callId, userId: call.userId });
}

/**
 * End every tracked call.
 *
 * Used when the ARI connection drops: from that moment we can neither observe nor
 * control those channels, so leaving them "active" guarantees CallLog rows stuck at
 * 'in-progress' with durations that grow until the auto-hangup limit. Asterisk tears
 * down Stasis channels when the app disappears anyway — closing them here is what
 * produces terminal rows with an accurate duration.
 */
async function endAllCalls(reason) {
    const ids = Array.from(activeCalls.keys());
    if (ids.length === 0) return;
    console.warn(`🛑 [SIP] Ending ${ids.length} active call(s) — ${reason}`);
    sipLog('error', `${ids.length} active SIP call(s) were terminated: ${reason}`);
    await Promise.all(ids.map(id => endCall(id).catch(e => console.error(`[SIP] endAllCalls ${id}:`, e.message))));
}

/**
 * End tracked calls whose Asterisk channel no longer exists.
 *
 * Called after an ARI websocket gap: ChannelDestroyed events raised while we were
 * disconnected are gone for good, so Asterisk's live channel list is the only way to
 * find calls that ended without us noticing.
 */
async function reconcileActiveChannels(liveChannelIds) {
    if (!Array.isArray(liveChannelIds)) return;
    const live = new Set(liveChannelIds);

    const stale = [];
    for (const [callId, call] of activeCalls.entries()) {
        const channelId = call.callChannel?.id;
        if (channelId && !live.has(channelId)) stale.push(callId);
    }
    if (stale.length === 0) return;

    console.warn(`🧟 [SIP] ${stale.length} tracked call(s) have no Asterisk channel — closing them out`);
    await Promise.all(stale.map(id => endCall(id).catch(e => console.error(`[SIP] reconcile ${id}:`, e.message))));
}

/**
 * Stop all active calls belonging to a campaign
 */
async function stopCampaignCalls(campaignId) {
    if (!campaignId) return;
    const cid = campaignId.toString();
    console.log(`🛑 [SIP] Stopping all active calls for campaign ${cid}`);

    const terminations = [];
    for (const [callId, call] of activeCalls.entries()) {
        if (call.voiceStream.campaignId?.toString() === cid) {
            terminations.push(endCall(callId));
        }
    }
    await Promise.all(terminations);
}

/**
 * Returns the current number of active SIP calls
 */
function getActiveCallCount() {
    return activeCalls.size;
}

/**
 * Returns the callIds (== callSid) of all currently active SIP calls.
 * Used by the stale-call reconcile sweep to avoid marking a live call terminal.
 */
function getActiveCallIds() {
    return Array.from(activeCalls.keys());
}

module.exports = { placeCall, handleInboundCall, transferCall, endCall, endAllCalls, reconcileActiveChannels, getActiveCallCount, getActiveCallIds, setWsBroadcast, stopCampaignCalls };
