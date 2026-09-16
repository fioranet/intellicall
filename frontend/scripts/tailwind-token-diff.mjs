#!/usr/bin/env node
/**
 * Guard for the RTL codemod. Tailwind silently drops class names it does not
 * recognise, so a typo produces a missing style rather than a build error —
 * `npm run build` cannot catch it. This compares the multiset of class tokens
 * before and after and asserts that only the intended mappings moved.
 *
 *   node scripts/tailwind-token-diff.mjs snapshot > /tmp/before.json
 *   <run the codemod>
 *   node scripts/tailwind-token-diff.mjs compare /tmp/before.json
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const EXPECTED = new Map([
    ["ml-", "ms-"], ["mr-", "me-"], ["pl-", "ps-"], ["pr-", "pe-"],
    ["text-left", "text-start"], ["text-right", "text-end"],
    ["border-l", "border-s"], ["border-r", "border-e"],
    ["rounded-l", "rounded-s"], ["rounded-r", "rounded-e"],
]);

function walk(dir, out = []) {
    for (const e of readdirSync(dir)) {
        const f = join(dir, e);
        if (statSync(f).isDirectory()) walk(f, out);
        else if (f.endsWith(".tsx")) out.push(f);
    }
    return out;
}

/** Every whitespace-separated token inside any quoted string in the file. */
function tokens() {
    const counts = {};
    for (const file of [...walk("app"), ...walk("components")]) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g)) {
            const body = m[1] ?? m[2] ?? m[3] ?? "";
            for (const tok of body.split(/\s+/)) {
                if (/^[a-z0-9:[\]/.!-]+$/i.test(tok) && tok.length > 1) {
                    counts[tok] = (counts[tok] || 0) + 1;
                }
            }
        }
    }
    return counts;
}

/** Rewrite a token through the expected mappings, so before/after should match. */
function normalise(tok) {
    for (const [from, to] of EXPECTED) {
        if (from.endsWith("-")) {
            const bare = from.slice(0, -1);
            const re = new RegExp(`(^|:)${bare}-`);
            if (re.test(tok)) return tok.replace(re, `$1${to}`);
        } else if (tok === from || tok.endsWith(`:${from}`)) {
            return tok.replace(new RegExp(`${from}$`), to);
        } else {
            const re = new RegExp(`(^|:)${from}(?=-|$)`);
            if (re.test(tok)) return tok.replace(re, `$1${to}`);
        }
    }
    return tok;
}

const [mode, arg] = process.argv.slice(2);

if (mode === "snapshot") {
    console.log(JSON.stringify(tokens()));
} else if (mode === "compare") {
    const before = JSON.parse(readFileSync(arg, "utf8"));
    const after = tokens();

    const fold = (counts) => {
        const out = {};
        for (const [tok, n] of Object.entries(counts)) {
            const k = normalise(tok);
            out[k] = (out[k] || 0) + n;
        }
        return out;
    };

    const b = fold(before), a = fold(after);
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    const drift = [];
    for (const k of keys) {
        if ((b[k] || 0) !== (a[k] || 0)) drift.push({ token: k, before: b[k] || 0, after: a[k] || 0 });
    }

    if (drift.length === 0) {
        console.log("OK — class tokens are identical once the intended mappings are folded.");
        process.exit(0);
    }
    console.error(`UNEXPECTED DRIFT in ${drift.length} token(s):`);
    for (const d of drift.sort((x, y) => x.token.localeCompare(y.token))) {
        console.error(`  ${d.token}: ${d.before} -> ${d.after}`);
    }
    process.exit(1);
} else {
    console.error("usage: tailwind-token-diff.mjs snapshot | compare <before.json>");
    process.exit(2);
}
