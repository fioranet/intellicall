/**
 * Refuse a SIP trunk whose host is this server's own Asterisk.
 *
 * Settings shows the SIP address to give the carrier for inbound calls
 * (sip:EXTERNAL_IP:IC_SIP_PORT), and some buyers paste it into the trunk's host instead.
 * Asterisk then sends every outbound call to itself, rejects it as "extension not found",
 * and the call log reads "cause 1: Unallocated number". The trunk test passed too, because
 * our own Asterisk answers the ping, so nothing pointed at the real mistake.
 *
 * Only the ports Asterisk listens on count: another SIP server on the same machine (on its
 * own port) is a real trunk.
 */
const dns = require('dns').promises;
const net = require('net');
const os = require('os');

const OWN_HOST_MESSAGE = "That's the address of this server's own Asterisk: the one you give your carrier so it can send calls to you. " +
    "Enter your carrier's SIP host here instead. Calls through this trunk would be sent back to this server and fail.";

function ownAddresses() {
    const set = new Set(['127.0.0.1', '::1', '0.0.0.0', '::']);
    const external = String(process.env.EXTERNAL_IP || '').trim();
    if (external) set.add(external);
    for (const list of Object.values(os.networkInterfaces())) {
        for (const iface of list || []) set.add(iface.address);
    }
    return set;
}

/** The SIP ports this Asterisk binds: the generated UDP/TCP/TLS transports, and the default 5060/5061. */
function ownSipPorts() {
    const base = parseInt(process.env.IC_SIP_PORT, 10) || 5090;
    return new Set([base, base + 1, base + 2, 5060, 5061]);
}

/**
 * The sentence to show when `host` (and `port`, when given) is this server, else null.
 * A host that won't resolve isn't our call to make.
 */
async function ownSipHostError(host, port) {
    const name = String(host || '').trim().replace(/^sips?:/i, '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (!name) return null;
    const portNumber = parseInt(port, 10);
    if (Number.isInteger(portNumber) && !ownSipPorts().has(portNumber)) return null;
    if (/^localhost$/i.test(name)) return OWN_HOST_MESSAGE;
    let addresses = [];
    if (net.isIP(name)) {
        addresses = [name];
    } else {
        try {
            addresses = (await dns.lookup(name, { all: true })).map(a => a.address);
        } catch (_) {
            return null;
        }
    }
    const own = ownAddresses();
    return addresses.some(a => own.has(a) || a.startsWith('127.')) ? OWN_HOST_MESSAGE : null;
}

module.exports = { ownSipHostError, OWN_HOST_MESSAGE };
