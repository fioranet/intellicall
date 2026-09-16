#!/usr/bin/env node
/**
 * Extraction completeness: report user-facing English literals that have not
 * been routed through a translation call.
 *
 * Tuned for a low false-positive rate rather than maximum recall — a noisy
 * report gets ignored, and the residue is easier to eyeball when it is short.
 *
 *   node scripts/i18n-find-literals.mjs            # in-scope files only
 *   node scripts/i18n-find-literals.mjs --file X   # one file
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SKIP_FILES = new Set(["components/layout/footer.tsx", "app/page.tsx"]);
const SKIP_PREFIXES = ["app/about/", "app/contact/", "app/privacy/", "app/terms/", "components/landing/"];

/** Attributes whose string values are shown to the user. */
const TEXT_ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label", "emptyMessage", "description"]);
/** Attributes that are never prose. */
const IGNORED_ATTRS = new Set([
    "className", "class", "href", "src", "id", "key", "type", "name", "value",
    "htmlFor", "role", "target", "rel", "variant", "size", "side", "align",
    "method", "action", "accept", "autoComplete", "inputMode", "pattern",
    "data-slot", "data-testid", "dir", "lang", "mode", "position", "orientation",
]);

const TOAST_RE = /^toast(\.(success|error|info|warning|loading|message))?$/;

/** Single technical tokens that are the same word in every language. */
const TECHNICAL = new Set([
    "Twilio", "SIP", "API", "CSV", "JSON", "URL", "URLs", "HTTP", "HTTPS", "ID", "IDs",
    "AI", "LLM", "TTS", "STT", "RTP", "SDP", "DTMF", "WebRTC", "OAuth", "JWT",
    "Deepgram", "ElevenLabs", "OpenRouter", "Sarvam", "HubSpot", "Slack", "WhatsApp",
    "Google", "PayPal", "Stripe", "Brevo", "n8n", "Zapier", "GitHub", "YouTube",
    "LinkedIn", "Instagram", "MongoDB", "Redis", "UTC", "PDF", "SMS", "DNS", "IP",
    "CRM", "SaaS", "UI", "UX", "OK", "Webhook", "Webhooks", "Asterisk", "FreePBX",
]);

const allowlistPath = "scripts/i18n-allowlist.json";
const ALLOWLIST = existsSync(allowlistPath)
    ? new Set(JSON.parse(readFileSync(allowlistPath, "utf8")))
    : new Set();

function walk(dir, out = []) {
    for (const e of readdirSync(dir)) {
        const f = join(dir, e);
        if (statSync(f).isDirectory()) walk(f, out);
        else if (f.endsWith(".tsx")) out.push(f);
    }
    return out;
}

const inScope = (p) => !SKIP_FILES.has(p) && !SKIP_PREFIXES.some((s) => p.startsWith(s));

/** Prose = at least one 3+ letter word, and not obviously machine-facing. */
function isProse(text) {
    const t = text.trim();
    if (t.length < 2) return false;
    if (!/[A-Za-z]{3,}/.test(t)) return false;
    if (ALLOWLIST.has(t)) return false;
    if (TECHNICAL.has(t)) return false;
    if (/^https?:\/\//.test(t)) return false;
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) return false;   // email
    if (/^#[0-9a-fA-F]{3,8}$/.test(t)) return false;          // hex colour
    // Slug/identifier: snake_case, kebab-case, or a short bare token. A single
    // ordinary lowercase word ("contacted") is prose and must not be skipped.
    if (/^[a-z0-9]+([_-][a-z0-9]+)+$/.test(t)) return false;
    if (/^[a-z0-9]{1,3}$/.test(t)) return false;
    if (/^[A-Z_][A-Z0-9_]*$/.test(t)) return false;           // CONSTANT_CASE
    if (/^\{.*\}$/.test(t)) return false;
    if (/^\d/.test(t) && t.length < 6) return false;
    return true;
}

/** Is this node inside a t(...) / t.rich(...) call already? */
function insideTranslation(node) {
    for (let p = node.parent; p; p = p.parent) {
        if (ts.isCallExpression(p)) {
            const e = p.expression;
            const name = ts.isIdentifier(e) ? e.text
                : ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) ? e.expression.text
                    : null;
            if (name === "t") return true;
        }
    }
    return false;
}

function scan(file) {
    const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const findings = [];
    const at = (n) => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;

    function report(node, kind, text) {
        if (!isProse(text)) return;
        if (insideTranslation(node)) return;
        findings.push({ line: at(node), kind, text: text.trim().replace(/\s+/g, " ").slice(0, 90) });
    }

    (function visit(node) {
        if (ts.isJsxText(node)) {
            report(node, "jsx", node.text);
        } else if (ts.isJsxAttribute(node) && node.initializer) {
            const attr = node.name.getText(src);
            if (!IGNORED_ATTRS.has(attr)) {
                const init = node.initializer;
                if (ts.isStringLiteral(init) && TEXT_ATTRS.has(attr)) {
                    report(node, `attr:${attr}`, init.text);
                } else if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression) && TEXT_ATTRS.has(attr)) {
                    report(node, `attr:${attr}`, init.expression.text);
                }
            }
        } else if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(src);
            if (TOAST_RE.test(callee)) {
                for (const arg of node.arguments) {
                    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) report(arg, "toast", arg.text);
                    else if (ts.isTemplateExpression(arg)) report(arg, "toast:template", arg.getText(src));
                    else if (ts.isBinaryExpression(arg)) {
                        // err?.response?.data?.message || "Failed to ..." — key the fallback
                        const walkBin = (n) => {
                            if (ts.isBinaryExpression(n)) { walkBin(n.left); walkBin(n.right); }
                            else if (ts.isStringLiteral(n)) report(n, "toast:fallback", n.text);
                        };
                        walkBin(arg);
                    }
                    break;
                }
            }
        }
        ts.forEachChild(node, visit);
    })(src);

    return findings;
}

const fileArg = process.argv.indexOf("--file");
const files = fileArg > -1
    ? [process.argv[fileArg + 1]]
    : [...walk("app"), ...walk("components")].filter(inScope).sort();

let total = 0;
const perFile = [];
for (const f of files) {
    const found = scan(f);
    if (!found.length) continue;
    total += found.length;
    perFile.push([f, found]);
}

if (process.argv.includes("--summary")) {
    for (const [f, found] of perFile.sort((a, b) => b[1].length - a[1].length)) {
        console.log(`${String(found.length).padStart(4)}  ${f}`);
    }
} else {
    for (const [f, found] of perFile) {
        console.log(`\n### ${f}`);
        for (const x of found) console.log(`  ${String(x.line).padStart(4)} [${x.kind}] ${x.text}`);
    }
}
console.log(`\n${total} untranslated literal(s) across ${perFile.length} file(s) — ${files.length} in scope`);
