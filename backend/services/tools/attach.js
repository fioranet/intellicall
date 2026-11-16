/**
 * The two lines every voice transport needs to give a call its tools, and to
 * put the record of what the tools did on the CallLog afterwards.
 *
 * Never throws: a broken tool must not stop the phone being answered.
 */

/**
 * Build the session and hand it to the bridge (or any object with
 * setToolSession). Must run before the bridge connects: the native engines fix
 * their function list at setup.
 *
 * @param {{setToolSession?: Function}} bridge
 * @param {object} agent
 * @param {unknown} userId
 * @param {{testCall?: boolean, callId?: string | null, logPrefix?: string, lead?: object | null}} [opts]
 * @returns {Promise<import('./agent-tool-session').AgentToolSession | null>}
 */
async function attachToolSession(bridge, agent, userId, { testCall = false, callId = null, logPrefix = '[tools]', lead = null } = {}) {
    // A test call speaks one phrase and hangs up; there is no conversation to use tools in.
    if (testCall || typeof bridge?.setToolSession !== 'function') return null;
    const whatsapp = Boolean(agent?.whatsapp?.accountId && lead?.phone);
    if (!agent?.mcpServerIds?.length && !agent?.toolIds?.length && !whatsapp) return null;
    try {
        const { AgentToolSession } = require('./agent-tool-session');
        // The WhatsApp tools send to the caller's own number, and only that.
        const session = await AgentToolSession.forAgent(agent, userId, whatsapp
            ? { whatsapp: { channel: 'call', phone: lead.phone, callSid: callId ? String(callId) : null, leadId: lead._id || null } }
            : {});
        if (!session || session.tools.length === 0) return null;
        if (callId) session.setCallId(String(callId));
        bridge.setToolSession(session);
        session.warm();
        const apps = session.appNames();
        console.log(`🧰 ${logPrefix} ${session.tools.length} tool(s)${apps.length ? ` incl. ${apps.join(', ')}` : ''}`);
        return session;
    } catch (err) {
        console.error(`${logPrefix} tools unavailable for this call: ${err.message}`);
        return null;
    }
}

/** Close the session's connections and save its tool calls on the CallLog. */
async function finishToolSession(session, callSid) {
    if (!session) return;
    try {
        await session.finish(callSid);
    } catch (err) {
        console.error(`[tools] could not finish tool session for ${callSid}: ${err.message}`);
    }
}

module.exports = { attachToolSession, finishToolSession };
