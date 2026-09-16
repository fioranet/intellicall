const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Substitute {{merge_tags}} in text with lead data.
 * Built-ins: {{name}}, {{phone}}. Every entry in lead.fields is also available
 * as {{field_name}} (case-insensitive, whitespace-tolerant); a custom field
 * named "name"/"phone" overrides the built-in.
 *
 * @param {string} text
 * @param {object|null} lead — Lead document ({ name, phone, fields: [{name, value}] })
 * @param {object} [opts]
 * @param {boolean} [opts.stripUnmatched=false] — remove tags with no matching field
 *   (use for spoken text so TTS never reads "open brace open brace...")
 */
function applyMergeFields(text, lead, { stripUnmatched = false } = {}) {
    if (!text || typeof text !== 'string') return text || '';
    const map = new Map();
    if (lead) {
        map.set('name', lead.name ?? '');
        map.set('phone', lead.phone ?? '');
        (lead.fields || []).forEach(f => {
            if (f?.name) map.set(String(f.name).trim().toLowerCase(),
                                 f.value == null ? '' : String(f.value));
        });
    }
    let out = text;
    for (const [key, value] of map) {
        out = out.replace(new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'gi'), String(value));
    }
    if (stripUnmatched) out = out.replace(/\{\{\s*[^{}]+\s*\}\}/g, '').replace(/ {2,}/g, ' ');
    return out;
}

module.exports = { applyMergeFields };
