const mongoose = require('mongoose');

/**
 * A remote MCP server an account has connected, so its agents can use the
 * server's tools while they are on a call.
 *
 * Every secret here — header values, OAuth tokens, the dynamic-registration
 * client secret, the PKCE verifier — is stored as utils/encryption ciphertext
 * and written through utils/credentials.js, never by assigning a
 * plaintext string. They are plain String fields rather than encryptedField()
 * getters on purpose: almost every read of this collection is `.lean()`, which
 * skips getters, and a getter that silently does not run is how a credential
 * ends up serialised as ciphertext or, worse, compared as one.
 *
 * `tools` is a snapshot of the server's `tools/list`, refreshed on demand. A
 * call builds its tool declarations from the snapshot so that answering the
 * phone never waits on a third-party server.
 */
const mcpServerSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    transport: { type: String, enum: ['auto', 'streamable_http', 'sse'], default: 'auto' },
    /** What `auto` found to work, so a call does not probe twice. Cleared when the URL changes. */
    detectedTransport: { type: String, enum: ['streamable_http', 'sse', null], default: null },

    authType: { type: String, enum: ['none', 'headers', 'oauth'], default: 'none' },
    headers: [{
        _id: false,
        name: { type: String, required: true },
        valueEncrypted: { type: String, required: true },
    }],
    oauth: {
        /** User-supplied for servers that do not allow dynamic client registration. */
        clientId: { type: String, default: null },
        clientSecretEncrypted: { type: String, default: null },
        scope: { type: String, default: null },
        /** JSON of the RFC 7591 registration response, encrypted (it can carry a client secret). */
        registrationEncrypted: { type: String, default: null },
        /** The redirect URI the registration was made for; a change means registering again. */
        redirectUri: { type: String, default: null },
        tokensEncrypted: { type: String, default: null },
        codeVerifierEncrypted: { type: String, default: null },
        /** sha256 of the `state` sent to the authorization server. */
        stateHash: { type: String, default: null },
        stateExpiresAt: { type: Date, default: null },
        /** Where the callback lands: the console page, or a plain "you can close this tab". */
        returnTo: { type: String, enum: ['console', 'api'], default: 'console' },
        connectedAt: { type: Date, default: null },
    },

    status: { type: String, enum: ['pending', 'ready', 'needs_auth', 'error'], default: 'pending' },
    lastError: { type: String, default: null },
    serverInfo: {
        name: { type: String, default: null },
        version: { type: String, default: null },
    },

    tools: [{
        _id: false,
        name: { type: String, required: true },
        title: { type: String, default: null },
        description: { type: String, default: '' },
        inputSchema: { type: mongoose.Schema.Types.Mixed, default: null },
        annotations: { type: mongoose.Schema.Types.Mixed, default: null },
    }],
    toolsRefreshedAt: { type: Date, default: null },
    /** The allowlist. Only these tools are ever offered to an agent. */
    enabledTools: { type: [String], default: [] },
    /**
     * False until the allowlist has been set once, either by the caller or by
     * the first discovery (which enables only tools the server marks read-only).
     * Without it a later refresh could not tell "nothing chosen yet" from "the
     * owner switched everything off".
     */
    enabledToolsInitialised: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, {
    timestamps: true,
});

mcpServerSchema.index({ 'oauth.stateHash': 1 }, { sparse: true });

const McpServer = mongoose.model('McpServer', mcpServerSchema);

module.exports = McpServer;
