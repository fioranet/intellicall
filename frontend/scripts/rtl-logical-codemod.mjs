#!/usr/bin/env node
/**
 * One-shot codemod: physical Tailwind direction utilities -> logical ones, so
 * the UI mirrors correctly under dir="rtl".
 *
 * Only unambiguous mappings are handled here. Insets (left-/right-) and
 * translate-x-* are deliberately excluded: `left-1/2 -translate-x-1/2` is
 * centring, not alignment, and flipping it would break every centred dialog.
 * Those ~46 sites are converted by hand.
 *
 * Run with --check to diff class tokens without writing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP_FILES = new Set([
    "components/layout/footer.tsx",
    "app/page.tsx",
]);
const SKIP_PREFIXES = [
    "app/about/", "app/contact/", "app/privacy/", "app/terms/",
    "components/landing/",
];

/** [pattern, replacement] — ordered; longest/most specific first. */
const MAPPINGS = [
    [/(?<![\w-])text-left(?![\w-])/g, "text-start"],
    [/(?<![\w-])text-right(?![\w-])/g, "text-end"],
    // border-l / border-l-2 / border-l-muted -> border-s… (but never border-lime-*)
    [/(?<![\w-])border-l(?=$|[\s"'`]|-(?:\d|\[))/g, "border-s"],
    [/(?<![\w-])border-r(?=$|[\s"'`]|-(?:\d|\[))/g, "border-e"],
    [/(?<![\w-])rounded-l(?=$|[\s"'`]|-(?:\d|\[|none|sm|md|lg|xl|full))/g, "rounded-s"],
    [/(?<![\w-])rounded-r(?=$|[\s"'`]|-(?:\d|\[|none|sm|md|lg|xl|full))/g, "rounded-e"],
    [/(?<![\w-])ml-(?=[\d[a-z])/g, "ms-"],
    [/(?<![\w-])mr-(?=[\d[a-z])/g, "me-"],
    [/(?<![\w-])pl-(?=[\d[a-z])/g, "ps-"],
    [/(?<![\w-])pr-(?=[\d[a-z])/g, "pe-"],
];

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (entry.endsWith(".tsx")) out.push(full);
    }
    return out;
}

function inScope(p) {
    return !SKIP_FILES.has(p) && !SKIP_PREFIXES.some((s) => p.startsWith(s));
}

/**
 * Apply mappings only inside className/class string contents, so a mapping can
 * never touch a URL, an id, or prose.
 */
const CLASSNAME_RE = /(className\s*=\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\{(?:[^{}]|\{[^{}]*\})*\})/g;

function transform(source) {
    let count = 0;
    const out = source.replace(CLASSNAME_RE, (whole, prefix, value) => {
        let next = value;
        for (const [re, rep] of MAPPINGS) {
            next = next.replace(re, () => { count++; return rep; });
        }
        return prefix + next;
    });
    return { out, count };
}

const check = process.argv.includes("--check");
const files = [...walk("app"), ...walk("components")].filter(inScope);
let total = 0, touched = 0;

for (const file of files) {
    const src = readFileSync(file, "utf8");
    const { out, count } = transform(src);
    if (!count) continue;
    total += count; touched++;
    if (!check) writeFileSync(file, out);
    console.log(`${String(count).padStart(4)}  ${file}`);
}

console.log(`\n${check ? "would rewrite" : "rewrote"} ${total} utilities across ${touched} files (${files.length} in scope)`);
