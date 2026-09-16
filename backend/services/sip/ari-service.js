const AriClient = require('ari-client');
const { sipLog } = require('./sip-log');

const ARI_URL = process.env.ASTERISK_ARI_URL || 'http://localhost:8088';
const ARI_USER = process.env.ASTERISK_ARI_USER || 'intellicall';
const ARI_PASSWORD = process.env.ASTERISK_ARI_PASSWORD || 'intellicall_ari_secret';
const APP_NAME = 'intellicall';

let ari = null;
let connected = false;

// Connection supervision
const HEALTH_PROBE_MS = 15000;
const MAX_RECONNECT_DELAY_MS = 30000;
let healthTimer = null;
let reconnectTimer = null;
let reconnectAttempt = 0;

// ─── RTP Port Pool ───────────────────────────────────────────
const PORT_START = parseInt(process.env.SIP_RTP_PORT_START) || 21000;
const PORT_END = parseInt(process.env.SIP_RTP_PORT_END) || 30000;
const availablePorts = [];
const portsInUse = new Set();
for (let i = PORT_START; i <= PORT_END; i += 2) availablePorts.push(i); // RTP uses even ports

function acquirePort() {
    const port = availablePorts.shift();
    if (!port) throw new Error('No available RTP ports');
    portsInUse.add(port);
    return port;
}

function releasePort(port) {
    if (portsInUse.has(port)) {
        portsInUse.delete(port);
        availablePorts.push(port);
    }
}

// ─── ARI Connection ──────────────────────────────────────────

/**
 * Initialize the ARI connection. Fails gracefully if Asterisk is not running.
 */
async function initialize() {
    try {
        ari = await AriClient.connect(ARI_URL, ARI_USER, ARI_PASSWORD);
        connected = true;
        reconnectAttempt = 0;
        console.log('✅ Connected to Asterisk ARI');
        sipLog('success', 'Connected to Asterisk ARI');

        ari.start(APP_NAME);
        _registerHandlers(ari);
        _startHealthProbe();

        return ari;
    } catch (err) {
        console.warn(`⚠️  Asterisk ARI not available (${err.message}). SIP features disabled — Twilio calling works normally.`);
        sipLog('warn', `Asterisk ARI not available (${err.message}). SIP features disabled.`);
        connected = false;
        return null;
    }
}

/**
 * Event wiring, kept separate from initialize() so a full reconnect re-registers it.
 */
function _registerHandlers(client) {
    // Inbound call handler
    client.on('StasisStart', async (event, channel) => {
        const args = event.args || [];
        if (args[0] !== 'inbound') return;

        const calledNumber = args[1] || channel.dialplan?.exten || '';
        const callerNumber = channel.caller?.number || 'unknown';
        console.log(`📞 [SIP Inbound] ${callerNumber} → ${calledNumber}`);

        // Lazy-require to avoid circular dependency
        const sipManager = require('./sip-manager');
        sipManager.handleInboundCall(channel, calledNumber, callerNumber).catch(err => {
            console.error('[ARI] Inbound handler error:', err);
        });
    });

    // ari-client reconnects the websocket itself with exponential backoff, but while it
    // is down every ChannelDestroyed event is lost — which is precisely how a call that
    // the caller already hung up stays "in conversation" until the auto-hangup limit.
    client.on('WebSocketReconnecting', (err) => {
        connected = false;
        console.warn(`⚠️  [ARI] Websocket lost (${err?.message || 'unknown'}) — reconnecting`);
        sipLog('warn', 'Asterisk ARI websocket lost — reconnecting. New SIP calls will fail until it is restored.');
    });

    client.on('WebSocketConnected', () => {
        const wasDown = !connected;
        connected = true;
        if (wasDown) {
            console.log('✅ [ARI] Websocket reconnected');
            sipLog('success', 'Asterisk ARI websocket reconnected');
            // Hangups that happened while we were deaf never arrived — ask Asterisk which
            // channels are actually still up and close out everything else.
            _reconcileActiveChannels();
        }
    });

    // Retries exhausted: the socket is not coming back on its own.
    client.on('WebSocketMaxRetries', (err) => {
        _onDisconnected(`websocket retries exhausted (${err?.message || 'unknown'})`);
    });
}

/**
 * Ask Asterisk which channels are still live and end any tracked call whose channel is
 * gone. Runs after a websocket gap, where ChannelDestroyed events were missed.
 */
async function _reconcileActiveChannels() {
    try {
        const channels = await ari.channels.list();
        const liveIds = channels.map(c => c.id);
        await require('./sip-manager').reconcileActiveChannels(liveIds);
    } catch (err) {
        console.error(`[ARI] Channel reconcile failed: ${err.message}`);
    }
}

/**
 * Periodic liveness check. The websocket events above cover a dropped socket, but not
 * Asterisk itself going away with the socket still half-open, so this is the backstop
 * that does not depend on any particular library event firing.
 */
function _startHealthProbe() {
    if (healthTimer) return;
    healthTimer = setInterval(async () => {
        if (!ari) return;
        try {
            if (typeof ari.asterisk?.ping === 'function') await ari.asterisk.ping();
            else await ari.asterisk.getInfo();
            if (!connected) {
                connected = true;
                console.log('✅ [ARI] Asterisk reachable again');
                sipLog('success', 'Asterisk reachable again');
                _reconcileActiveChannels();
            }
        } catch (err) {
            if (connected) _onDisconnected(`health probe failed (${err.message})`);
        }
    }, HEALTH_PROBE_MS);
    if (typeof healthTimer.unref === 'function') healthTimer.unref();
}

/**
 * Asterisk is unreachable. Every in-flight call is unobservable and uncontrollable from
 * here, so close them out rather than leaving rows stuck non-terminal, then keep trying
 * to reconnect so SIP recovers without a process restart.
 */
function _onDisconnected(why) {
    if (!connected && reconnectTimer) return; // already handling
    connected = false;
    console.error(`❌ [ARI] Asterisk ARI connection lost — ${why}`);
    sipLog('error', `Asterisk ARI connection lost (${why}). Active SIP calls were terminated; new SIP calls will fail until the connection is restored.`);

    try {
        require('./sip-manager').endAllCalls(`ARI connection lost: ${why}`);
    } catch (err) {
        console.error(`[ARI] endAllCalls failed: ${err.message}`);
    }

    _scheduleReconnect();
}

function _scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), MAX_RECONNECT_DELAY_MS);
    reconnectAttempt++;
    console.log(`🔄 [ARI] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempt})`);
    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        const client = await initialize();
        if (!client) _scheduleReconnect();
    }, delay);
    if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref();
}

// ─── Channel Operations ─────────────────────────────────────

/**
 * Originate an outbound call through a SIP trunk
 */
async function originateCall(trunkId, destination, trunkHost, metadata = {}) {
    if (!connected) throw new Error('Asterisk ARI not connected');

    const endpointName = `trunk-${trunkId}`;

    // Format: PJSIP/number@endpoint
    // This is the most universal format for Twilio, Telnyx, and Vobiz.
    let cleanNumber = destination.replace(/[^\d+]/g, '');

    // Wholesale carriers often route on a tech prefix (e.g. 999 + E.164) and
    // match it literally, so the leading '+' has to go when one is configured.
    const dialPrefix = (metadata.dialPrefix || '').replace(/\D/g, '');
    if (dialPrefix) cleanNumber = `${dialPrefix}${cleanNumber.replace(/^\+/, '')}`;

    const dialString = `PJSIP/${cleanNumber}@${endpointName}`;

    console.log(`[ARI] Originating call to: ${dialString}`);
    sipLog('info', `Originating call to ${cleanNumber} via endpoint ${endpointName}`, {
        userId: metadata.userId, trunkId
    });

    try {
        const channel = ari.Channel();
        await channel.originate({
            endpoint: dialString,
            app: APP_NAME,
            appArgs: `outbound,${metadata.userId || ''},${metadata.agentId || ''},${metadata.leadId || ''},${metadata.campaignId || ''}`,
            callerId: metadata.callerId || destination.replace(/[^\d+]/g, '')
        });
        return channel;
    } catch (origErr) {
        // Extract the real Asterisk error details
        const statusCode = origErr.statusCode || origErr.code || 'unknown';
        const body = origErr.body || origErr.message || 'No details';
        console.error(`❌ [ARI] Originate FAILED (HTTP ${statusCode}):`, body);
        console.error(`[ARI] Dial string was: ${dialString}`);
        console.error(`[ARI] Debug commands for your VPS:`);
        console.error(`  asterisk -rx "pjsip show endpoints"`);
        console.error(`  asterisk -rx "pjsip show transports"`);
        console.error(`  asterisk -rx "core show channels"`);
        const bodyText = typeof body === 'object' ? JSON.stringify(body) : String(body);
        const hint = bodyText.includes('Allocation failed')
            ? ` Asterisk could not create the channel. Either the PJSIP endpoint "${endpointName}" is not loaded (click "Reload Asterisk"), or the provider is marked unreachable — check the trunk's "Provider reachable" status in Health Checks. An unreachable provider usually means a wrong transport/port (e.g. Twilio supports UDP 5060 or TLS 5061, not TCP).`
            : '';
        sipLog('error', `Originate failed (HTTP ${statusCode}): ${bodyText}.${hint}`, {
            userId: metadata.userId, trunkId, detail: `Dial string: ${dialString}`
        });
        throw origErr;
    }
}

/**
 * Create an ExternalMedia channel — Asterisk sends/receives RTP to our UDP port
 */
async function createExternalMedia(rtpPort) {
    if (!connected) throw new Error('Asterisk ARI not connected');

    const channel = await ari.channels.externalMedia({
        app: APP_NAME,
        external_host: `127.0.0.1:${rtpPort}`,
        format: 'ulaw',
        encapsulation: 'rtp',
        transport: 'udp',
        connection_type: 'client'
    });
    return channel;
}

/**
 * Create a mixing bridge between two channels
 */
async function createBridge(channelIds) {
    if (!connected) throw new Error('Asterisk ARI not connected');

    const bridge = ari.Bridge();
    await bridge.create({ type: 'mixing', name: `ic-${Date.now()}` });
    await bridge.addChannel({ channel: channelIds });
    return bridge;
}

/**
 * Safely hang up a channel (ignore "not found" errors)
 */
async function hangupChannel(channelId) {
    if (!connected || !ari) return;
    try {
        await ari.channels.hangup({ channelId });
    } catch (err) {
        if (!err.message?.includes('not found')) {
            console.error(`[ARI] Hangup error: ${err.message}`);
        }
    }
}

/**
 * Safely destroy a bridge
 */
async function destroyBridge(bridgeId) {
    if (!connected || !ari) return;
    try {
        await ari.bridges.destroy({ bridgeId });
    } catch (err) {
        if (!err.message?.includes('not found')) {
            console.error(`[ARI] Bridge destroy error: ${err.message}`);
        }
    }
}

// ─── Accessors ───────────────────────────────────────────────

function isConnected() { return connected; }
function getAri() { return ari; }
function on(event, handler) { if (ari) ari.on(event, handler); }

module.exports = {
    initialize,
    isConnected,
    getAri,
    on,
    originateCall,
    createExternalMedia,
    createBridge,
    hangupChannel,
    destroyBridge,
    acquirePort,
    releasePort
};
