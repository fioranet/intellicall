/**
 * GET /api/mcp-oauth/callback — where an MCP server's authorization server
 * sends the owner back after they sign in.
 *
 * Public and unauthenticated by necessity: it is a top-level browser navigation
 * from a third-party site, carrying no session. The `state` parameter is the
 * only credential, and services/mcp/oauth-flow.js treats it as one: hashed at
 * rest, single-use, ten minutes.
 */
const express = require('express');
const { completeOAuth } = require('../services/mcp/oauth-flow');

const router = express.Router();
const str = (v) => (typeof v === 'string' && v ? v : undefined);
const consoleUrl = () => (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');

router.get('/callback', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // The code and state are in this URL; no third party needs to see it in a Referer.
    res.setHeader('Referrer-Policy', 'no-referrer');

    let outcome;
    try {
        outcome = await completeOAuth({
            state: str(req.query.state),
            code: str(req.query.code),
            error: str(req.query.error),
            errorDescription: str(req.query.error_description),
        });
    } catch (err) {
        console.error('[mcp-oauth] callback failed:', err.message);
        outcome = { serverId: null, ok: false, message: 'Something went wrong finishing the sign-in. Try connecting again.' };
    }

    const params = new URLSearchParams({ oauth: outcome.ok ? 'connected' : 'error' });
    if (!outcome.ok) params.set('message', outcome.message);
    const path = outcome.serverId ? `/integrations/edit?id=${outcome.serverId}&` : '/integrations?';
    res.redirect(303, `${consoleUrl()}${path}${params.toString()}`);
});

module.exports = router;
