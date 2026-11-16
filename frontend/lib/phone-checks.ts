import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { FormIssue, Translate } from "@/components/ui/form-issues";

/**
 * Checks for a number typed into a form. The backend (utils/dial-number.js) decides the
 * number actually dialled; these only flag what is clearly wrong or likely to go wrong.
 *
 * `t` is the "common" namespace translator; the messages are common.formChecks.*.
 */

/**
 * A number the platform owns or forwards to: it must be full international format.
 * `label` is the field's own (translated) label.
 */
export function e164Issue(value: string, label: string, t: Translate): FormIssue | null {
    const text = value.trim();
    if (!text) return null;
    if (!text.startsWith("+")) {
        return { level: "error", message: t("formChecks.e164NoPlus", { label }) };
    }
    const parsed = parsePhoneNumberFromString(text);
    if (!parsed || !parsed.isPossible()) {
        return { level: "error", message: t("formChecks.e164NotNumber", { label, number: text }) };
    }
    if (!parsed.isValid()) {
        return { level: "warning", message: t("formChecks.e164Unusual", { label, number: text }) };
    }
    return null;
}

type LeadPhoneProblem = "noCountryCode" | "notNumber" | "unusual";

function leadPhoneProblem(value: string): LeadPhoneProblem | null {
    const text = value.trim();
    if (!text) return null;
    if (!text.startsWith("+")) {
        // Leads are saved as bare digits, so a saved "917012419963" comes back without its "+".
        const digits = text.replace(/\D/g, "");
        if (!digits.startsWith("0") && parsePhoneNumberFromString(`+${digits}`)?.isValid()) return null;
        return "noCountryCode";
    }
    const parsed = parsePhoneNumberFromString(text);
    if (!parsed || !parsed.isPossible()) return "notNumber";
    if (!parsed.isValid()) return "unusual";
    return null;
}

/** A lead's number. Leaving off the country code works when the lead is in the calling number's country. */
export function leadPhoneIssue(value: string, t: Translate): FormIssue | null {
    const problem = leadPhoneProblem(value);
    const number = value.trim();
    if (problem === "noCountryCode") return { level: "warning", message: t("formChecks.leadNoCountryCode") };
    if (problem === "notNumber") return { level: "error", message: t("formChecks.leadNotNumber", { number }) };
    if (problem === "unusual") return { level: "warning", message: t("formChecks.leadUnusual", { number }) };
    return null;
}

/** One summary line per kind of problem across many leads, naming a few examples. */
export function leadPhoneSummary(phones: string[], t: Translate): FormIssue[] {
    const groups: Record<LeadPhoneProblem, string[]> = { noCountryCode: [], notNumber: [], unusual: [] };
    for (const phone of phones) {
        const problem = leadPhoneProblem(phone);
        if (problem) groups[problem].push(phone.trim());
    }
    const examples = (numbers: string[]) => numbers.slice(0, 3).join(", ") + (numbers.length > 3 ? ", ..." : "");
    const out: FormIssue[] = [];
    if (groups.noCountryCode.length) out.push({
        level: "warning",
        message: t("formChecks.summaryNoCountryCode", { count: groups.noCountryCode.length, examples: examples(groups.noCountryCode) }),
    });
    if (groups.notNumber.length) out.push({
        level: "error",
        message: t("formChecks.summaryNotNumber", { count: groups.notNumber.length, examples: examples(groups.notNumber) }),
    });
    if (groups.unusual.length) out.push({
        level: "warning",
        message: t("formChecks.summaryUnusual", { count: groups.unusual.length, examples: examples(groups.unusual) }),
    });
    return out;
}
