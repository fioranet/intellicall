/**
 * A tool's parameters (JSON Schema, as the owner or an MCP server wrote it) in
 * the form each engine's function calling accepts.
 *
 * - OpenAI-style `tools` (classic via OpenRouter, Sarvam, the Deepgram agent)
 *   take JSON Schema nearly as-is. Only references are inlined, because a
 *   provider behind OpenRouter may not resolve `$ref` and a dangling one fails
 *   the whole request.
 * - Gemini Live takes a narrow OpenAPI 3.0 subset and rejects the setup message
 *   (the whole call, not just the tool) over a single keyword it does not know.
 *   So that conversion is a whitelist, not a blacklist.
 *
 * Schemas come from third parties and can be anything, including cyclic through
 * `$ref`. Every walk is depth-limited.
 */

const MAX_DEPTH = 8;
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Replace local `$ref`s ("#/$defs/x", "#/definitions/x") with what they point at. */
function inlineRefs(schema, root = isObj(schema) ? schema : {}, depth = 0) {
    if (Array.isArray(schema)) return schema.map((s) => inlineRefs(s, root, depth + 1));
    if (!isObj(schema)) return schema;
    if (depth > MAX_DEPTH) return {};

    if (typeof schema.$ref === 'string') {
        const target = resolvePointer(root, schema.$ref);
        const { $ref: _ref, ...rest } = schema;
        return inlineRefs({ ...(isObj(target) ? target : {}), ...rest }, root, depth + 1);
    }

    const out = {};
    for (const [k, v] of Object.entries(schema)) {
        if (k === '$defs' || k === 'definitions' || k === '$schema' || k === '$id' || k === '$comment') continue;
        out[k] = inlineRefs(v, root, depth + 1);
    }
    return out;
}

function resolvePointer(root, ref) {
    if (!ref.startsWith('#/')) return undefined;
    let cur = root;
    for (const raw of ref.slice(2).split('/')) {
        const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
        if (!isObj(cur)) return undefined;
        cur = cur[key];
    }
    return cur;
}

/** JSON Schema for OpenAI-compatible `tools[].function.parameters`. Always an object schema. */
function toOpenAiParameters(inputSchema) {
    const s = inlineRefs(inputSchema);
    if (!isObj(s) || (s.type !== undefined && s.type !== 'object')) {
        return { type: 'object', properties: {} };
    }
    return { ...s, type: 'object', properties: isObj(s.properties) ? s.properties : {} };
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

const GEMINI_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);
const GEMINI_FORMATS = {
    string: new Set(['enum', 'date-time']),
    integer: new Set(['int32', 'int64']),
    number: new Set(['float', 'double']),
};

/**
 * Gemini `functionDeclarations[].parameters`, or undefined when the tool takes
 * no arguments: the existing declarations omit `parameters` in that case, and
 * an object with empty `properties` is refused at the top level.
 */
function toGeminiParameters(inputSchema) {
    const s = toGeminiSchema(inlineRefs(inputSchema), 0);
    if (!s || s.type !== 'object' || !isObj(s.properties) || Object.keys(s.properties).length === 0) return undefined;
    return s;
}

function toGeminiSchema(schema, depth) {
    if (!isObj(schema) || depth > MAX_DEPTH) return null;

    if (Array.isArray(schema.allOf)) {
        const merged = { ...schema, allOf: undefined };
        for (const part of schema.allOf) {
            if (!isObj(part)) continue;
            merged.type ??= part.type;
            merged.properties = { ...(isObj(merged.properties) ? merged.properties : {}), ...(isObj(part.properties) ? part.properties : {}) };
            merged.required = [...(Array.isArray(merged.required) ? merged.required : []), ...(Array.isArray(part.required) ? part.required : [])];
        }
        return toGeminiSchema(merged, depth + 1);
    }
    const union = Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : null;
    if (union) {
        const branches = union.filter(isObj);
        const nonNull = branches.filter((b) => b.type !== 'null');
        const pick = nonNull[0] ?? branches[0];
        if (!pick) return null;
        const { anyOf: _a, oneOf: _o, ...rest } = schema;
        const out = toGeminiSchema({ ...rest, ...pick, description: schema.description ?? pick.description }, depth + 1);
        if (out && nonNull.length < branches.length) out.nullable = true;
        return out;
    }

    let type = schema.type;
    let nullable = schema.nullable === true;
    if (Array.isArray(type)) {
        nullable = nullable || type.includes('null');
        type = type.find((t) => t !== 'null');
    }
    if (typeof type !== 'string' || !GEMINI_TYPES.has(type)) {
        type = isObj(schema.properties) ? 'object' : schema.items ? 'array' : 'string';
    }

    const out = { type };
    if (typeof schema.description === 'string') out.description = schema.description.slice(0, 1000);
    else if (typeof schema.title === 'string') out.description = schema.title;
    if (nullable) out.nullable = true;
    if (typeof schema.format === 'string' && GEMINI_FORMATS[type]?.has(schema.format)) out.format = schema.format;

    if (Array.isArray(schema.enum)) {
        if (type === 'string') {
            out.enum = schema.enum.filter((v) => v !== null).map(String);
        } else {
            out.description = `${out.description ? `${out.description} ` : ''}One of: ${schema.enum.map(String).join(', ')}.`;
        }
    } else if (schema.const !== undefined && type === 'string') {
        out.enum = [String(schema.const)];
    }

    if (type === 'number' || type === 'integer') {
        if (typeof schema.minimum === 'number') out.minimum = schema.minimum;
        if (typeof schema.maximum === 'number') out.maximum = schema.maximum;
    }

    if (type === 'array') {
        const items = toGeminiSchema(schema.items, depth + 1);
        out.items = items ?? { type: 'string' };
        if (typeof schema.minItems === 'number') out.minItems = schema.minItems;
        if (typeof schema.maxItems === 'number') out.maxItems = schema.maxItems;
    }

    if (type === 'object') {
        const props = {};
        if (isObj(schema.properties)) {
            for (const [k, v] of Object.entries(schema.properties)) {
                const converted = toGeminiSchema(v, depth + 1);
                if (converted) props[k] = converted;
            }
        }
        if (Object.keys(props).length > 0) {
            out.properties = props;
            const required = Array.isArray(schema.required) ? schema.required.filter((r) => typeof r === 'string' && r in props) : [];
            if (required.length) out.required = [...new Set(required)];
        }
    }
    return out;
}

module.exports = { inlineRefs, toOpenAiParameters, toGeminiParameters };
