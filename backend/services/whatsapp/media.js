/**
 * Files on WhatsApp: what people send coming in, and voice-note replies going out.
 *
 * In: Meta gives a media id; the bytes are fetched with the account's token and
 * kept under backend/uploads/wa/<accountId>/, so the inbox can show them and a
 * voice note can be transcribed. Out: a voice-note reply is uploaded to
 * /{phone_number_id}/media and the id Meta returns is sent; ids are cached by
 * content hash for 25 days (Meta keeps uploads 30).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const graph = require('./graph');

const WhatsAppMediaCache = require('../../models/WhatsAppMediaCache');

const CACHE_DAYS = 25;
const ROOT = path.join(__dirname, '..', '..', 'uploads', 'wa');

/** Meta's limits per kind, in bytes. */
const MEDIA_LIMITS = {
    image: 5 * 1024 * 1024,
    video: 16 * 1024 * 1024,
    audio: 16 * 1024 * 1024,
    document: 100 * 1024 * 1024,
};

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/3gpp']);

/** Which WhatsApp message kind a file goes out as. */
function mediaKindOf(mimeType) {
    const m = String(mimeType || '').toLowerCase().split(';')[0].trim();
    if (IMAGE_TYPES.has(m)) return 'image';
    if (VIDEO_TYPES.has(m)) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    return 'document';
}

class MediaError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const safeId = (v) => String(v).replace(/[^a-zA-Z0-9_-]/g, '');

/** The path on disk for an inbound message's media. */
function mediaPath(accountId, messageId) {
    return path.join(ROOT, safeId(accountId), safeId(messageId));
}

/** A Meta media id for these bytes on this number, uploading only when not cached. */
async function mediaIdFor(account, token, bytes, mimeType, filename, sha256) {
    const hash = sha256 || crypto.createHash('sha256').update(bytes).digest('hex');
    const hit = await WhatsAppMediaCache.findOne({ accountId: account._id, sha256: hash, expiresAt: { $gt: new Date() } }).lean();
    if (hit) return String(hit.metaMediaId);
    const id = await graph.uploadMedia(token, account.phoneNumberId, bytes, mimeType, filename);
    await WhatsAppMediaCache.updateOne(
        { accountId: account._id, sha256: hash },
        { $set: { metaMediaId: id, expiresAt: new Date(Date.now() + CACHE_DAYS * 86400_000) } },
        { upsert: true },
    ).catch(() => undefined);
    return id;
}

/** Fetch an inbound media file and keep it. Returns its storage key (the relative path) and type. */
async function keepInbound(account, token, mediaId, messageId, maxBytes = MEDIA_LIMITS.document) {
    const { bytes, mimeType } = await graph.downloadMedia(token, mediaId, maxBytes);
    const file = mediaPath(account._id, messageId);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, bytes);
    const storageKey = path.relative(ROOT, file).split(path.sep).join('/');
    return { storageKey, mimeType, bytes: bytes.length, data: bytes };
}

/** Read a kept inbound file by its storage key. */
async function readStored(storageKey) {
    const file = path.join(ROOT, ...String(storageKey).split('/').map(safeId));
    return fs.promises.readFile(file);
}

/** Delete everything kept for an account. */
async function removeAccountMedia(accountId) {
    await fs.promises.rm(path.join(ROOT, safeId(accountId)), { recursive: true, force: true });
}

module.exports = { MEDIA_LIMITS, mediaKindOf, MediaError, mediaIdFor, keepInbound, readStored, removeAccountMedia, mediaPath };
