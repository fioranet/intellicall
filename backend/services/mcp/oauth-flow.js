/**
 * Connecting an MCP server that signs in with OAuth.
 *
 * start:    the owner asks to connect. The SDK discovers the server's
 *           authorization server, registers this install as a client if needed,
 *           and builds the authorization URL; we hand that URL back.
 * callback: the authorization server sends the owner back with a code and the
 *           state we issued. The state finds the server; the SDK exchanges the
 *           code for tokens; the tools are read for the first time.
 *
 * The state is a 32-byte random value, stored only as its sha256, single-use
 * and valid for ten minutes. It is the only thing tying an unauthenticated
 * callback request to an account, so it is treated like a password.
 */
const { createHash, randomBytes } = require('crypto');
const { oauthRedirectUri, StoredOAuthProvider } = require('./oauth-provider');
const { safeFetch } = require('../../utils/safe-fetch');
const { describeFailure, refreshServer } = require('./client');

const { auth } = require('@modelcontextprotocol/sdk/client/auth.js');
const McpServer = require('../../models/McpServer');

const STATE_TTL_MS = 10 * 60 * 1000;
const hashState = (state) => createHash('sha256').update(state).digest('hex');

class OAuthFlowError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'OAuthFlowError';
        this.code = code;
        this.status = 400;
    }
}

async function startOAuth(doc) {
    if (doc.authType !== 'oauth') {
        throw new OAuthFlowError('not_an_oauth_server', 'This server is not set to sign in with OAuth. Set its authentication to OAuth first.');
    }

    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    const redirectUri = oauthRedirectUri();
    const provider = new StoredOAuthProvider(doc, { interactive: true, state, redirectUri });

    // Connecting again means signing in again: whatever tokens were stored are
    // the ones that stopped working, or belong to the account being replaced.
    await provider.invalidateCredentials('tokens');
    await McpServer.updateOne({ _id: doc._id }, {
        $set: {
            'oauth.stateHash': hashState(state),
            'oauth.stateExpiresAt': expiresAt,
            'oauth.returnTo': 'console',
            'oauth.redirectUri': redirectUri,
        },
    });

    let result;
    try {
        result = await auth(provider, {
            serverUrl: doc.url,
            fetchFn: safeFetch,
            ...(doc.oauth && doc.oauth.scope ? { scope: doc.oauth.scope } : {}),
        });
    } catch (err) {
        const { message } = describeFailure(doc, err);
        throw new OAuthFlowError('oauth_start_failed', `Could not start sign-in with this server. ${message}`);
    }

    if (result !== 'REDIRECT' || !provider.authorizationUrl) {
        throw new OAuthFlowError('oauth_start_failed', 'The server did not ask for a sign-in, so there is nothing to connect. Try authentication "none".');
    }
    return { authorizationUrl: provider.authorizationUrl.href, expiresAt };
}

/**
 * @param {{state?: string, code?: string, error?: string, errorDescription?: string}} params
 * @returns {Promise<{serverId: string | null, ok: boolean, message: string}>}
 */
async function completeOAuth(params) {
    if (!params.state) {
        return { serverId: null, ok: false, message: 'The sign-in link was missing its state. Start the connection again.' };
    }

    // Claim the state atomically: a replayed callback finds nothing.
    const doc = await McpServer.findOneAndUpdate(
        { 'oauth.stateHash': hashState(params.state), 'oauth.stateExpiresAt': { $gt: new Date() } },
        { $set: { 'oauth.stateHash': null, 'oauth.stateExpiresAt': null } },
        { returnDocument: 'after' },
    ).lean();
    if (!doc) {
        return { serverId: null, ok: false, message: 'This sign-in link has expired or was already used. Start the connection again.' };
    }

    const serverId = String(doc._id);

    if (params.error || !params.code) {
        const why = params.errorDescription || params.error || 'no authorization code was returned';
        await McpServer.updateOne({ _id: doc._id }, { $set: { status: 'needs_auth', lastError: `Sign-in did not complete: ${why}` } });
        return { serverId, ok: false, message: `Sign-in did not complete: ${why}` };
    }

    const provider = new StoredOAuthProvider(doc, {
        interactive: true,
        redirectUri: (doc.oauth && doc.oauth.redirectUri) || oauthRedirectUri(),
    });
    try {
        await auth(provider, { serverUrl: doc.url, authorizationCode: params.code, fetchFn: safeFetch });
    } catch (err) {
        const { message } = describeFailure(doc, err);
        await McpServer.updateOne({ _id: doc._id }, { $set: { status: 'needs_auth', lastError: message } });
        return { serverId, ok: false, message };
    }

    await McpServer.updateOne({ _id: doc._id }, {
        $set: { 'oauth.connectedAt': new Date(), 'oauth.codeVerifierEncrypted': null },
    });
    const fresh = await McpServer.findById(doc._id).lean();
    const updated = await refreshServer(fresh);
    if (updated.status !== 'ready') {
        return { serverId, ok: false, message: updated.lastError || 'Signed in, but the server\'s tools could not be read.' };
    }
    return { serverId, ok: true, message: 'Connected.' };
}

module.exports = { startOAuth, completeOAuth, OAuthFlowError };
