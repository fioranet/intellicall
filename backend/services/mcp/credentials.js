/**
 * The secrets on an McpServer document, sealed and opened in one place.
 * See models/McpServer.js for why these are plain String fields.
 */
const { seal, open, sealJson, openJson } = require('../../utils/credentials');

/** The custom headers to send, decrypted. Empty unless the server uses header auth. */
function requestHeaders(doc) {
    if (doc.authType !== 'headers') return {};
    const out = {};
    for (const h of doc.headers || []) {
        const value = open(h.valueEncrypted, `MCP server header ${h.name}`);
        if (value) out[h.name] = value;
    }
    return out;
}

module.exports = { seal, open, sealJson, openJson, requestHeaders };
