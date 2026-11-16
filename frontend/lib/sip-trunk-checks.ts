import type { FormIssue, Translate } from "@/components/ui/form-issues";
import { e164Issue } from "@/lib/phone-checks";

/**
 * What the SIP trunk form can tell is wrong before Save. Each rule is a mistake that made
 * real trunks fail: a pasted "sip:host:port", a preset placeholder left in, this server's
 * own SIP address entered as the carrier's, or an IP host beside the carrier's SIP domain.
 *
 * The username rule lives in lib/sip-username.ts (mirrored on the server) and the
 * "this is our own Asterisk" check is answered by POST /sip-trunks/check-host.
 *
 * `t` is the "sip" namespace translator (sip.checks.*), `c` the "common" one for the
 * caller ID's number check.
 */

export interface TrunkCheckInput {
    host: string;
    port: string;
    transport: string;
    username: string;
    password: string;
    authRealm: string;
    defaultCallerId: string;
    dialPrefix: string;
    stripPlus: boolean;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function sipTrunkIssues(
    form: TrunkCheckInput,
    { isEditing, clearCredentials }: { isEditing: boolean; clearCredentials: boolean },
    { t, c }: { t: Translate; c: Translate }
): FormIssue[] {
    const issues: FormIssue[] = [];
    const host = form.host.trim();
    const realm = form.authRealm.trim();
    const port = parseInt(form.port, 10);

    if (/[<>]/.test(host)) {
        issues.push({ level: "error", message: t("checks.hostPlaceholder") });
    } else if (/^sips?:|^https?:|[\s/@]|:\d+$/i.test(host)) {
        issues.push({ level: "error", message: t("checks.hostFormat") });
    }
    if (/[<>]/.test(realm)) {
        issues.push({ level: "error", message: t("checks.realmPlaceholder") });
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        issues.push({ level: "error", message: t("checks.portRange") });
    } else if (form.transport === "tls" && port === 5060) {
        issues.push({ level: "warning", message: t("checks.tlsOn5060") });
    } else if (form.transport !== "tls" && port === 5061) {
        issues.push({ level: "warning", message: t("checks.port5061NotTls") });
    }

    if (host && realm && IPV4.test(host) && !IPV4.test(realm)) {
        issues.push({ level: "warning", message: t("checks.ipHostDomainRealm", { realm }) });
    }

    if (!clearCredentials) {
        const user = form.username.trim();
        if (user && !form.password && !isEditing) {
            issues.push({ level: "warning", message: t("checks.usernameNoPassword") });
        }
        if (!user && form.password) {
            issues.push({ level: "warning", message: t("checks.passwordNoUsername") });
        }
    }

    // A caller ID the carrier doesn't recognise as a number is usually refused (403).
    const callerId = e164Issue(form.defaultCallerId, t("dialog.callerIdLabel"), c);
    if (callerId) issues.push({ level: "warning", message: callerId.message });

    // ari-service always drops the "+" when there is a dial prefix, so the toggle does nothing.
    if (form.stripPlus && form.dialPrefix.replace(/\D/g, "")) {
        issues.push({ level: "warning", message: t("checks.stripPlusWithPrefix") });
    }

    return issues;
}
