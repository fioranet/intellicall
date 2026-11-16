/**
 * The MCP SDK's OAuthClientProvider, backed by the McpServer document.
 *
 * The SDK does the protocol: discovery of the authorization server, dynamic
 * client registration, PKCE, the code exchange and refreshing. This class is
 * only where it keeps what it learns (encrypted, on the server's document) and
 * the one place its "send the user to this URL" request is caught instead of
 * acted on, because there is no browser here to send.
 *
 * Two lives:
 *  - interactive, while the owner is connecting (oauth/start and the callback).
 *    The authorization URL is captured and handed back to them.
 *  - during a call or a refresh, where nobody is there to sign in. A refresh
 *    token that no longer works lands in redirectToAuthorization too, and there
 *    the only honest thing to do is mark the server as needing a reconnect.
 */
const { randomBytes } = require('crypto');
const { open, openJson, seal, sealJson } = require('./credentials');
/** The product name shown to OAuth providers and MCP servers. Sync: used inside getters. */
const appName = () => process.env.APP_NAME || 'IntelliCall AI';

const McpServer = require('../../models/McpServer');

/** Where authorization servers send the owner back to. One URL for every server. */
function oauthRedirectUri(env = process.env) {
    const base = (env.BASE_URL || `http://localhost:${env.PORT || 5001}`).replace(/\/+$/, '');
    return `${base}/api/mcp-oauth/callback`;
}

class StoredOAuthProvider {
    /**
     * @param {object} doc the McpServer document (`.lean()`)
     * @param {{interactive: boolean, state?: string, redirectUri?: string}} [opts]
     */
    constructor(doc, opts = { interactive: false }) {
        this.doc = doc;
        this.opts = opts;
        /** Set when the SDK asks to send the user somewhere. */
        this.authorizationUrl = null;
    }

    get oauth() {
        if (!this.doc.oauth) this.doc.oauth = {};
        return this.doc.oauth;
    }

    persist(set) {
        return McpServer.updateOne({ _id: this.doc._id }, { $set: set });
    }

    get redirectUrl() {
        return this.opts.redirectUri || this.oauth.redirectUri || oauthRedirectUri();
    }

    get clientMetadata() {
        const hasSecret = Boolean(this.oauth.clientSecretEncrypted);
        return {
            client_name: appName(),
            redirect_uris: [this.redirectUrl],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: hasSecret ? 'client_secret_post' : 'none',
            ...(this.oauth.scope ? { scope: this.oauth.scope } : {}),
        };
    }

    state() {
        return this.opts.state || randomBytes(24).toString('base64url');
    }

    clientInformation() {
        // A pre-registered app the owner typed in wins over anything registered
        // dynamically: some servers (GitHub's) do not allow registration at all.
        if (this.oauth.clientId) {
            const secret = open(this.oauth.clientSecretEncrypted, 'MCP OAuth client secret');
            return { client_id: this.oauth.clientId, ...(secret ? { client_secret: secret } : {}) };
        }
        const registered = openJson(this.oauth.registrationEncrypted, 'MCP OAuth registration');
        // A registration made for a different redirect URI (BASE_URL changed)
        // would be refused at the authorization endpoint; register again.
        const uris = registered && registered.redirect_uris;
        if (Array.isArray(uris) && !uris.includes(this.redirectUrl)) return undefined;
        return registered;
    }

    async saveClientInformation(info) {
        this.oauth.registrationEncrypted = sealJson(info);
        await this.persist({ 'oauth.registrationEncrypted': this.oauth.registrationEncrypted });
    }

    tokens() {
        return openJson(this.oauth.tokensEncrypted, 'MCP OAuth tokens');
    }

    async saveTokens(tokens) {
        this.oauth.tokensEncrypted = sealJson(tokens);
        await this.persist({ 'oauth.tokensEncrypted': this.oauth.tokensEncrypted });
    }

    async redirectToAuthorization(url) {
        this.authorizationUrl = url;
        if (!this.opts.interactive) {
            // Nobody can sign in mid-call. The tokens are gone or refused; say so
            // where the owner will look, rather than failing every call quietly.
            this.doc.status = 'needs_auth';
            await this.persist({
                status: 'needs_auth',
                lastError: 'The connection to this server expired. Reconnect it to keep using its tools.',
            });
        }
    }

    async saveCodeVerifier(verifier) {
        this.oauth.codeVerifierEncrypted = seal(verifier);
        await this.persist({ 'oauth.codeVerifierEncrypted': this.oauth.codeVerifierEncrypted });
    }

    codeVerifier() {
        const v = open(this.oauth.codeVerifierEncrypted, 'MCP OAuth code verifier');
        if (!v) throw new Error('No PKCE verifier is stored for this server; start the connection again.');
        return v;
    }

    /** @param {'all' | 'client' | 'tokens' | 'verifier' | 'discovery'} scope */
    async invalidateCredentials(scope) {
        const set = {};
        if (scope === 'all' || scope === 'tokens') set['oauth.tokensEncrypted'] = null;
        if (scope === 'all' || scope === 'verifier') set['oauth.codeVerifierEncrypted'] = null;
        if (scope === 'all' || scope === 'client') set['oauth.registrationEncrypted'] = null;
        if (Object.keys(set).length === 0) return;
        for (const k of Object.keys(set)) this.oauth[k.slice('oauth.'.length)] = null;
        await this.persist(set);
    }
}

module.exports = { StoredOAuthProvider, oauthRedirectUri };
