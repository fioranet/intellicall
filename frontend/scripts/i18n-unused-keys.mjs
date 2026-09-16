#!/usr/bin/env node
/**
 * English keys that nothing appears to reference. Reports only — it cannot be
 * exact, because keys built at runtime (t(`events.${id}.label`)) are invisible
 * to a text scan. Treat the output as a list to eyeball, not a gate.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function flatten(obj, prefix = "", out = {}) {
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, path, out);
        else out[path] = value;
    }
    return out;
}

const en = {};
for (const file of readdirSync("messages/en")) {
    if (!file.endsWith(".json")) continue;
    const ns = file.replace(/\.json$/, "");
    Object.assign(en, flatten(JSON.parse(readFileSync(join("messages/en", file), "utf8")), ns));
}

function walk(dir, out = []) {
    for (const e of readdirSync(dir)) {
        const f = join(dir, e);
        if (statSync(f).isDirectory()) walk(f, out);
        else if (/\.tsx?$/.test(f)) out.push(f);
    }
    return out;
}
const source = walk("app").concat(walk("components"), walk("i18n"), walk("lib"))
    .map((f) => readFileSync(f, "utf8")).join("\n");

/** Namespaces reached via a template-literal key — everything under them is live. */
const dynamicPrefixes = new Set();
for (const m of source.matchAll(/t\(\s*`([\w.]*?)\$\{/g)) {
    if (m[1]) dynamicPrefixes.add(m[1].replace(/\.$/, ""));
}

const unused = [];
for (const key of Object.keys(en)) {
    const [ns, ...rest] = key.split(".");
    const local = rest.join(".");
    if (!local) continue;
    if (source.includes(`"${local}"`) || source.includes(`'${local}'`) || source.includes(`\`${local}\``)) continue;
    if (source.includes(`"${key}"`) || source.includes(`'${key}'`)) continue;
    if ([...dynamicPrefixes].some((p) => local.startsWith(p) || key.startsWith(p))) continue;
    unused.push(key);
}

// `common` and `errors` are a deliberate shared vocabulary: they exist so future
// screens (and buyers writing their own) have a consistent set to reach for, so
// most of them being unreferenced today is expected, not a defect.
const SHARED_VOCABULARY = ["common.", "errors."];
const inScope = unused.filter((k) => !SHARED_VOCABULARY.some((p) => k.startsWith(p)));
const shared = unused.length - inScope.length;
if (shared) console.log(`${shared} unreferenced key(s) in the shared common/errors vocabulary (expected).\n`);
unused.length = 0;
unused.push(...inScope);

if (!unused.length) {
    console.log("No obviously unused keys.");
} else {
    console.log(`${unused.length} key(s) with no visible reference (verify before deleting):`);
    for (const k of unused) console.log(`  ${k}`);
}
