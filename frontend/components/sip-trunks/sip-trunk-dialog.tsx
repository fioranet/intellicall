"use client";

import { useTranslations } from "next-intl";
import { disallowedSipUsernameChars } from "@/lib/sip-username";
import { useState, useEffect } from "react";
import {
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Field,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tile,
    toast,
} from "@wixzel/react";
import axios from "axios";
import { HardDrives, PencilLine } from "@phosphor-icons/react";
import { sipTrunkIssues } from "@/lib/sip-trunk-checks";
import { FormIssues, hasErrors, type FormIssue } from "@/components/ui/form-issues";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

/**
 * Pre-configured SIP provider presets for quick setup when adding a new trunk.
 *
 * Defaults follow each provider's documented signaling settings. UDP 5060 is
 * the deliberate default everywhere: it works without server-side TLS certs
 * (the config generator falls back to UDP when SIP_TLS_CERT/KEY are missing,
 * which would break a TLS preset pointing at port 5061). Twilio in particular
 * supports only UDP 5060 or TLS 5061 — never TCP.
 *
 * authRealm is left empty on purpose: Asterisk picks up the realm from the
 * provider's 401 challenge automatically, and a placeholder value saved as-is
 * would end up verbatim in the Asterisk config.
 */
const SIP_PROVIDER_PRESETS: Array<{
    id: string;
    name: string;
    providerName: string;
    host: string;
    port: number;
    transport: string;
    authRealm: string;
    region: string;
    codecs: string;
}> = [
        {
            "id": "twilio",
            "name": "Twilio",
            "providerName": "Twilio",
            "host": "<YOUR_TRUNK_DOMAIN>.pstn.twilio.com",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Global",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "telnyx",
            "name": "Telnyx",
            "providerName": "Telnyx",
            "host": "sip.telnyx.com",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Global",
            "codecs": "PCMU,PCMA,G722"
        },
        {
            "id": "plivo",
            "name": "Plivo",
            "providerName": "Plivo",
            "host": "<YOUR_ZENTRUNK_TERMINATION_URI>",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Global",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "vonage",
            "name": "Vonage",
            "providerName": "Vonage",
            "host": "sip.nexmo.com",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Global",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "exotel",
            "name": "Exotel",
            "providerName": "Exotel",
            "host": "<EXOTEL_PROVIDED_SIP_HOST>",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "India",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "bandwidth",
            "name": "Bandwidth",
            "providerName": "Bandwidth",
            "host": "<YOUR_REALM>.sip.bandwidth.com",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "US",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "didww",
            "name": "DIDWW",
            "providerName": "DIDWW",
            "host": "out.didww.com",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Global",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "zadarma",
            "name": "Zadarma",
            "providerName": "Zadarma",
            "host": "sip.zadarma.com",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Global",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "cloudonix",
            "name": "Cloudonix",
            "providerName": "Cloudonix",
            "host": "<CLOUDONIX_PROVIDED_SIP_HOST>",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Global",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "ringcentral",
            "name": "RingCentral",
            "providerName": "RingCentral",
            "host": "<RINGCENTRAL_PROVIDED_SIP_HOST>",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "US",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "sinch",
            "name": "Sinch",
            "providerName": "Sinch",
            "host": "<SINCH_PROVIDED_SIP_HOST>",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Global",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "infobip",
            "name": "Infobip",
            "providerName": "Infobip",
            "host": "<INFOBIP_PROVIDED_SIP_HOST>",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Global",
            "codecs": "PCMU,PCMA"
        },
        {
            "id": "generic",
            "name": "Generic",
            "providerName": "Generic SIP",
            "host": "<SIP_HOST>",
            "port": 5060,
            "transport": "udp",
            "authRealm": "",
            "region": "Any",
            "codecs": "PCMU,PCMA"
        }
    ];

const DEFAULT_FORM = {
    name: "",
    host: "",
    port: "5060",
    transport: "udp",
    username: "",
    password: "",
    authRealm: "",
    defaultCallerId: "",
    dialPrefix: "",
    stripPlus: false,
    codecs: "PCMU,PCMA",
    providerName: "",
    region: "",
};

type TrunkFormData = {
    name: string;
    host: string;
    port: string;
    transport: string;
    username: string;
    password: string;
    authRealm: string;
    defaultCallerId: string;
    dialPrefix: string;
    stripPlus: boolean;
    codecs: string;
    providerName: string;
    region: string;
};

interface SipTrunk {
    _id: string;
    name: string;
    host: string;
    port: number;
    transport: string;
    username: string;
    authRealm: string;
    defaultCallerId: string;
    dialPrefix: string;
    stripPlus: boolean;
    codecs: string;
    providerName: string;
    region: string;
    status: string;
}

interface SipTrunkDialogProps {
    trunk?: SipTrunk | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function SipTrunkDialog({ trunk, open, onOpenChange, onSuccess }: SipTrunkDialogProps) {
    const t = useTranslations("sip");
    const c = useTranslations("common");
    const [loading, setLoading] = useState(false);
    const [clearCredentials, setClearCredentials] = useState(false);
    const [showFormFields, setShowFormFields] = useState(false);
    const [formData, setFormData] = useState<TrunkFormData>({ ...DEFAULT_FORM });
    // Same rule the server applies on save; shown as you type so it is never a surprise.
    const badUsernameChars = clearCredentials ? [] : disallowedSipUsernameChars(formData.username);
    const usernameError = badUsernameChars.length
        ? t("dialog.usernameInvalid", {
            chars: [...new Set(badUsernameChars.map(ch => (/\s/.test(ch) ? t("dialog.usernameSpaces") : `"${ch}"`)))].join(", "),
        })
        : null;

    const isEditing = !!trunk;

    // This server's own SIP address in SIP Host, asked of the server (it knows its IPs and
    // resolves names) a moment after typing stops.
    const [ownHost, setOwnHost] = useState(false);
    useEffect(() => {
        const host = formData.host.trim();
        if (!open || !showFormFields || !host) {
            setOwnHost(false);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const token = localStorage.getItem("token");
                const res = await axios.post(`${API_BASE_URL}/sip-trunks/check-host`, { host, port: formData.port }, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!cancelled) setOwnHost(res.data?.data?.ok === false);
            } catch {
                if (!cancelled) setOwnHost(false);
            }
        }, 500);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [formData.host, formData.port, open, showFormFields]);

    const issues: FormIssue[] = [
        ...(ownHost ? [{ level: "error" as const, message: t("checks.ownHost") }] : []),
        ...sipTrunkIssues(formData, { isEditing, clearCredentials }, { t, c }),
    ];
    const blocked = !!usernameError || hasErrors(issues);

    useEffect(() => {
        if (open) {
            setClearCredentials(false);
            if (trunk) {
                setShowFormFields(true);
                setFormData({
                    name: trunk.name || "",
                    host: trunk.host || "",
                    port: String(trunk.port || 5060),
                    transport: trunk.transport || "udp",
                    username: trunk.username || "",
                    password: "",
                    authRealm: trunk.authRealm || "",
                    defaultCallerId: trunk.defaultCallerId || "",
                    dialPrefix: trunk.dialPrefix || "",
                    stripPlus: trunk.stripPlus || false,
                    codecs: trunk.codecs || "PCMU,PCMA",
                    providerName: trunk.providerName || "",
                    region: trunk.region || "",
                });
            } else {
                setShowFormFields(false);
                setFormData({ ...DEFAULT_FORM });
            }
        }
    }, [open, trunk]);

    const applyProviderPreset = (preset: (typeof SIP_PROVIDER_PRESETS)[number]) => {
        setFormData((prev) => ({
            ...prev,
            name: `${preset.name} Trunk`,
            host: preset.host,
            port: String(preset.port),
            transport: preset.transport,
            providerName: preset.providerName,
            authRealm: preset.authRealm,
            region: preset.region,
            codecs: preset.codecs,
        }));
        setShowFormFields(true);
    };

    const startManualEntry = () => {
        setFormData({ ...DEFAULT_FORM });
        setShowFormFields(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (usernameError) {
            toast.error(usernameError);
            return;
        }
        const firstError = issues.find((i) => i.level === "error");
        if (firstError) {
            toast.error(firstError.message);
            return;
        }
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const payload = {
                ...formData,
                port: parseInt(formData.port) || 5060,
            };

            // Handle credentials on edit
            if (isEditing) {
                if (clearCredentials) {
                    // Explicitly clear credentials for IP-based auth
                    payload.username = "";
                    payload.password = "";
                } else if (!payload.password) {
                    // Don't send empty password (means "keep existing")
                    delete (payload as any).password;
                }
            }

            const res = isEditing
                ? await axios.patch(`${API_BASE_URL}/sip-trunks/${trunk._id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                : await axios.post(`${API_BASE_URL}/sip-trunks`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
            // Saved is not the same as usable: Asterisk has to load the trunk too.
            const asterisk = res.data?.data?.asterisk as { loaded: boolean; message?: string } | undefined;
            if (asterisk && !asterisk.loaded) {
                toast.warning(t("toast.savedNotLoaded"), { description: asterisk.message, duration: 15000 });
            } else {
                toast.success(isEditing ? t("toast.updated") : t("toast.created"));
            }
            onOpenChange(false);
            onSuccess?.();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.saveFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <HardDrives className="size-5 text-accent-ink" />
                        {isEditing ? "Edit SIP Trunk" : "Add SIP Trunk"}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? "Update your SIP trunk settings below."
                            : showFormFields
                                ? "Review or change the pre-filled values, then save."
                                : "Choose a provider to pre-fill defaults, or enter details manually."}
                    </DialogDescription>
                </DialogHeader>

                {!isEditing && !showFormFields ? (
                    <>
                        <div className="flex flex-col gap-3">
                            <p className="text-body-sm font-medium">{t("dialog.quickSetup")}</p>
                            {/* Each preset fills the form and moves on, so these are actions, not a choice to confirm. */}
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {SIP_PROVIDER_PRESETS.map((preset) => (
                                    <Tile
                                        key={preset.id}
                                        icon={<HardDrives />}
                                        title={preset.name}
                                        onClick={() => applyProviderPreset(preset)}
                                    />
                                ))}
                            </div>
                            <div className="flex flex-col items-start gap-1 border-t border-border pt-3">
                                <Button variant="ghost" size="sm" onClick={startManualEntry} iconStart={<PencilLine />}>
                                    {t("dialog.manual")}
                                </Button>
                                <p className="ms-2.5 text-caption text-fg-muted">
                                    {t("dialog.manualHint")}
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                                {c("actions.cancel")}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div className="grid gap-5">
                            {/* Row 1: Name + Provider */}
                            <div className="grid grid-cols-2 gap-4">
                                <Field id="trunk-name" label={t("dialog.nameLabel")}>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder={t("dialog.namePlaceholder")}
                                        required
                                        disabled={loading}
                                    />
                                </Field>
                                <Field id="provider-name" label={t("dialog.providerLabel")}>
                                    <Input
                                        value={formData.providerName}
                                        onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                                        placeholder={t("dialog.providerPlaceholder")}
                                        disabled={loading}
                                    />
                                </Field>
                            </div>

                            {/* Row 2: Host + Port + Transport — balanced grid, Transport gets room to avoid overflow */}
                            <div className="grid grid-cols-[1fr_5rem_minmax(10rem,1fr)] items-start gap-4">
                                <Field id="trunk-host" label={t("dialog.hostLabel")} className="min-w-0">
                                    <Input
                                        value={formData.host}
                                        onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                        placeholder={t("dialog.hostPlaceholder")}
                                        required
                                        disabled={loading}
                                        aria-invalid={ownHost}
                                        className="font-mono"
                                    />
                                </Field>
                                <Field id="trunk-port" label={t("dialog.portLabel")}>
                                    <Input
                                        type="number"
                                        value={formData.port}
                                        onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                                        disabled={loading}
                                        className="font-mono"
                                    />
                                </Field>
                                <Field label={t("dialog.transportLabel")} hint={t("dialog.transportHint")} className="min-w-0">
                                    <Select
                                        value={formData.transport}
                                        onValueChange={(val) => setFormData({ ...formData, transport: val })}
                                        disabled={loading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={t("dialog.transportPlaceholder")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="udp">{t("dialog.udp")}</SelectItem>
                                            <SelectItem value="tcp">{t("dialog.tcp")}</SelectItem>
                                            <SelectItem value="tls">{t("dialog.tls")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </div>

                            {/* Row 3: Auth — 3 equal columns */}
                            <div className="grid grid-cols-3 gap-4">
                                <Field id="trunk-user" label={t("dialog.usernameLabel")} className="min-w-0">
                                    <Input
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        placeholder="trunk_user"
                                        disabled={loading || clearCredentials}
                                        aria-invalid={!!usernameError}
                                        aria-describedby={usernameError ? "trunk-user-error" : undefined}
                                        className="font-mono"
                                    />
                                </Field>
                                <Field id="trunk-pass" label={t("dialog.passwordLabel")} className="min-w-0">
                                    <Input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder={isEditing ? "(unchanged)" : "••••••••"}
                                        disabled={loading || clearCredentials}
                                        className="font-mono"
                                    />
                                </Field>
                                <Field id="trunk-realm" label={t("dialog.authRealmLabel")} className="min-w-0">
                                    <Input
                                        value={formData.authRealm}
                                        onChange={(e) => setFormData({ ...formData, authRealm: e.target.value })}
                                        placeholder={t("dialog.authRealmPlaceholder")}
                                        disabled={loading || clearCredentials}
                                        className="font-mono"
                                    />
                                </Field>
                            </div>

                            {usernameError && (
                                <p id="trunk-user-error" role="alert" className="-mt-2 text-caption font-medium text-danger-ink">
                                    {usernameError}
                                </p>
                            )}

                            {/* IP-Based Auth Checkbox (for editing) */}
                            {isEditing && (
                                <div className="flex items-center gap-2.5 rounded-md bg-bg-muted px-3 py-2.5">
                                    <Checkbox
                                        id="clear-creds"
                                        checked={clearCredentials}
                                        onCheckedChange={(checked) => setClearCredentials(checked === true)}
                                        disabled={loading}
                                    />
                                    <Label htmlFor="clear-creds" className="flex-1 cursor-pointer font-normal text-fg-muted">
                                        {t("dialog.ipAuth")}
                                    </Label>
                                </div>
                            )}

                            {/* Row 4: Caller ID + Region */}
                            <div className="grid grid-cols-2 gap-4">
                                <Field id="trunk-cid" label={t("dialog.callerIdLabel")}>
                                    <Input
                                        value={formData.defaultCallerId}
                                        onChange={(e) => setFormData({ ...formData, defaultCallerId: e.target.value })}
                                        placeholder="+966501234567"
                                        disabled={loading}
                                        className="font-mono"
                                    />
                                </Field>
                                <Field id="trunk-region" label={t("dialog.regionLabel")}>
                                    <Input
                                        value={formData.region}
                                        onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                        placeholder={t("dialog.regionPlaceholder")}
                                        disabled={loading}
                                    />
                                </Field>
                            </div>

                            {/* Row 5: Codecs + Dial Prefix */}
                            <div className="grid grid-cols-2 gap-4">
                                <Field id="trunk-codecs" label={t("dialog.codecsLabel")} hint={t("dialog.codecsHint")}>
                                    <Input
                                        value={formData.codecs}
                                        onChange={(e) => setFormData({ ...formData, codecs: e.target.value })}
                                        placeholder={t("dialog.codecsPlaceholder")}
                                        disabled={loading}
                                        className="font-mono"
                                    />
                                </Field>
                                <Field id="trunk-dial-prefix" label={t("dialog.dialPrefixLabel")} hint={t("dialog.dialPrefixHint")}>
                                    <Input
                                        value={formData.dialPrefix}
                                        onChange={(e) => setFormData({ ...formData, dialPrefix: e.target.value })}
                                        placeholder={t("dialog.dialPrefixPlaceholder")}
                                        disabled={loading}
                                        className="font-mono"
                                    />
                                </Field>
                            </div>

                            {/* Strip the leading "+" for PBXs that reject it */}
                            <div className="flex items-center gap-2.5 rounded-md bg-bg-muted px-3 py-2.5">
                                <Checkbox
                                    id="trunk-strip-plus"
                                    checked={formData.stripPlus}
                                    onCheckedChange={(checked) => setFormData({ ...formData, stripPlus: checked === true })}
                                    disabled={loading}
                                />
                                <Label htmlFor="trunk-strip-plus" className="flex-1 cursor-pointer font-normal text-fg-muted">
                                    {t("dialog.stripPlusLabel")}
                                </Label>
                            </div>
                        </div>
                        <FormIssues issues={issues} />
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
                                {c("actions.cancel")}
                            </Button>
                            <Button type="submit" variant="primary" loading={loading} disabled={blocked}>
                                {loading ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Trunk")}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
