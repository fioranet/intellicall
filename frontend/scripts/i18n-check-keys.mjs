#!/usr/bin/env node
/**
 * Catalog integrity across locales.
 *
 * Reports, per non-English locale:
 *   - coverage: keys present in English but missing here (informational — the
 *     English underlay in i18n/load-messages.ts renders them in English)
 *   - orphans: keys here that English does not have (a typo or an unpropagated
 *     rename — these are dead weight and never render)
 *   - ICU argument mismatches: {name} in en vs {nombre} here, which breaks the
 *     message at runtime
 *
 * Exits non-zero on orphans or argument mismatches only.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = "messages";
const DEFAULT_LOCALE = "en";

function flatten(obj, prefix = "", out = {}) {
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, path, out);
        else out[path] = value;
    }
    return out;
}

function loadLocale(locale) {
    const dir = join(MESSAGES_DIR, locale);
    const out = {};
    for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        const ns = file.replace(/\.json$/, "");
        const tree = JSON.parse(readFileSync(join(dir, file), "utf8"));
        Object.assign(out, flatten(tree, ns));
    }
    return out;
}

/** ICU placeholder names, ignoring plural/select bodies. */
function args(message) {
    if (typeof message !== "string") return new Set();
    const found = new Set();
    for (const m of message.matchAll(/\{\s*([a-zA-Z_][\w]*)\s*(?:,|\})/g)) found.add(m[1]);
    return found;
}

const locales = readdirSync(MESSAGES_DIR).filter((d) => existsSync(join(MESSAGES_DIR, d, "common.json")));
const en = loadLocale(DEFAULT_LOCALE);
const enKeys = Object.keys(en);

let failed = false;
console.log(`English catalog: ${enKeys.length} keys\n`);

for (const locale of locales) {
    if (locale === DEFAULT_LOCALE) continue;
    const target = loadLocale(locale);
    const targetKeys = new Set(Object.keys(target));

    const missing = enKeys.filter((k) => !targetKeys.has(k));
    const orphans = [...targetKeys].filter((k) => !(k in en));
    const argMismatches = [];

    for (const key of enKeys) {
        if (!targetKeys.has(key)) continue;
        const a = args(en[key]), b = args(target[key]);
        const onlyEn = [...a].filter((x) => !b.has(x));
        const onlyTarget = [...b].filter((x) => !a.has(x));
        if (onlyEn.length || onlyTarget.length) {
            argMismatches.push({ key, onlyEn, onlyTarget });
        }
    }

    const translated = enKeys.length - missing.length;
    const pct = ((translated / enKeys.length) * 100).toFixed(1);
    console.log(`${locale}: ${translated}/${enKeys.length} keys (${pct}% coverage)`);

    if (missing.length) {
        console.log(`  ${missing.length} untranslated (render in English):`);
        for (const k of missing.slice(0, 10)) console.log(`    ${k}`);
        if (missing.length > 10) console.log(`    … and ${missing.length - 10} more`);
    }
    if (orphans.length) {
        failed = true;
        console.error(`  ERROR ${orphans.length} orphan key(s) not in English:`);
        for (const k of orphans) console.error(`    ${k}`);
    }
    for (const m of argMismatches) {
        failed = true;
        console.error(`  ERROR ICU args differ at ${m.key}:`);
        if (m.onlyEn.length) console.error(`    missing here: ${m.onlyEn.join(", ")}`);
        if (m.onlyTarget.length) console.error(`    unexpected here: ${m.onlyTarget.join(", ")}`);
    }
    console.log("");
}

process.exit(failed ? 1 : 0);
