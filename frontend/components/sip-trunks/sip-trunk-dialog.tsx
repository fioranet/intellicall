"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import axios from "axios";
import { Server, Loader2, PencilLine } from "lucide-react";

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

    const isEditing = !!trunk;

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

            if (isEditing) {
                await axios.patch(`${API_BASE_URL}/sip-trunks/${trunk._id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                toast.success(t("toast.updated"));
            } else {
                await axios.post(`${API_BASE_URL}/sip-trunks`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                toast.success(t("toast.created"));
            }
            onOpenChange(false);
            onSuccess?.();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.saveFailed"));
        } finally {
            setLoading(false);
        }
    };

    const fieldLabelClass = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
    const helperTextClass = "text-xs text-muted-foreground mt-1";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5 text-primary" />
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
                        <div className="grid gap-4 py-4">
                            <Label className={fieldLabelClass}>{t("dialog.quickSetup")}</Label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {SIP_PROVIDER_PRESETS.map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => applyProviderPreset(preset)}
                                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                    >
                                        <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                                        {preset.name}
                                    </button>
                                ))}
                            </div>
                            <div className="pt-2 border-t border-border">
                                <button
                                    type="button"
                                    onClick={startManualEntry}
                                    className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md px-1 py-1"
                                >
                                    <PencilLine className="h-4 w-4 shrink-0" />
                                    {t("dialog.manual")}
                                </button>
                                <p className={helperTextClass + " mt-1 ms-7"}>
                                    {t("dialog.manualHint")}
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                {c("actions.cancel")}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="grid gap-5 py-4">
                            {/* Row 1: Name + Provider */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="trunk-name" className={fieldLabelClass}>{t("dialog.nameLabel")}</Label>
                                    <Input
                                        id="trunk-name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder={t("dialog.namePlaceholder")}
                                        required
                                        disabled={loading}
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="provider-name" className={fieldLabelClass}>{t("dialog.providerLabel")}</Label>
                                    <Input
                                        id="provider-name"
                                        value={formData.providerName}
                                        onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                                        placeholder={t("dialog.providerPlaceholder")}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Row 2: Host + Port + Transport — balanced grid, Transport gets room to avoid overflow */}
                            <div className="grid grid-cols-[1fr_5rem_minmax(10rem,1fr)] gap-4 items-start">
                                <div className="grid gap-1.5 min-w-0">
                                    <Label htmlFor="trunk-host" className={fieldLabelClass}>{t("dialog.hostLabel")}</Label>
                                    <Input
                                        id="trunk-host"
                                        value={formData.host}
                                        onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                        placeholder={t("dialog.hostPlaceholder")}
                                        required
                                        disabled={loading}
                                        className="font-mono text-sm"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="trunk-port" className={fieldLabelClass}>{t("dialog.portLabel")}</Label>
                                    <Input
                                        id="trunk-port"
                                        type="number"
                                        value={formData.port}
                                        onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                                        disabled={loading}
                                        className="font-mono text-sm"
                                    />
                                </div>
                                <div className="grid gap-1.5 min-w-0">
                                    <Label className={fieldLabelClass}>{t("dialog.transportLabel")}</Label>
                                    <Select
                                        value={formData.transport}
                                        onValueChange={(val) => setFormData({ ...formData, transport: val })}
                                        disabled={loading}
                                    >
                                        <SelectTrigger className="w-full min-w-0">
                                            <SelectValue placeholder={t("dialog.transportPlaceholder")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="udp">{t("dialog.udp")}</SelectItem>
                                            <SelectItem value="tcp">{t("dialog.tcp")}</SelectItem>
                                            <SelectItem value="tls">{t("dialog.tls")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className={helperTextClass}>{t("dialog.transportHint")}</p>
                                </div>
                            </div>

                            {/* Row 3: Auth — 3 equal columns */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="grid gap-1.5 min-w-0">
                                    <Label htmlFor="trunk-user" className={fieldLabelClass}>{t("dialog.usernameLabel")}</Label>
                                    <Input
                                        id="trunk-user"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        placeholder="trunk_user"
                                        disabled={loading || clearCredentials}
                                        className="font-mono text-sm"
                                    />
                                </div>
                                <div className="grid gap-1.5 min-w-0">
                                    <Label htmlFor="trunk-pass" className={fieldLabelClass}>{t("dialog.passwordLabel")}</Label>
                                    <Input
                                        id="trunk-pass"
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder={isEditing ? "(unchanged)" : "••••••••"}
                                        disabled={loading || clearCredentials}
                                        className="font-mono text-sm"
                                    />
                                </div>
                                <div className="grid gap-1.5 min-w-0">
                                    <Label htmlFor="trunk-realm" className={fieldLabelClass}>{t("dialog.authRealmLabel")}</Label>
                                    <Input
                                        id="trunk-realm"
                                        value={formData.authRealm}
                                        onChange={(e) => setFormData({ ...formData, authRealm: e.target.value })}
                                        placeholder={t("dialog.authRealmPlaceholder")}
                                        disabled={loading || clearCredentials}
                                        className="font-mono text-sm"
                                    />
                                </div>
                            </div>

                            {/* IP-Based Auth Checkbox (for editing) */}
                            {isEditing && (
                                <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                                    <input
                                        type="checkbox"
                                        id="clear-creds"
                                        checked={clearCredentials}
                                        onChange={(e) => setClearCredentials(e.target.checked)}
                                        disabled={loading}
                                        className="h-4 w-4 rounded border-input"
                                    />
                                    <Label htmlFor="clear-creds" className="text-sm text-muted-foreground cursor-pointer flex-1">
                                        {t("dialog.ipAuth")}
                                    </Label>
                                </div>
                            )}

                            {/* Row 4: Caller ID + Region */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="trunk-cid" className={fieldLabelClass}>{t("dialog.callerIdLabel")}</Label>
                                    <Input
                                        id="trunk-cid"
                                        value={formData.defaultCallerId}
                                        onChange={(e) => setFormData({ ...formData, defaultCallerId: e.target.value })}
                                        placeholder="+966501234567"
                                        disabled={loading}
                                        className="font-mono text-sm"
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="trunk-region" className={fieldLabelClass}>{t("dialog.regionLabel")}</Label>
                                    <Input
                                        id="trunk-region"
                                        value={formData.region}
                                        onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                        placeholder={t("dialog.regionPlaceholder")}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            {/* Row 5: Codecs + Dial Prefix */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="trunk-codecs" className={fieldLabelClass}>{t("dialog.codecsLabel")}</Label>
                                    <Input
                                        id="trunk-codecs"
                                        value={formData.codecs}
                                        onChange={(e) => setFormData({ ...formData, codecs: e.target.value })}
                                        placeholder={t("dialog.codecsPlaceholder")}
                                        disabled={loading}
                                        className="font-mono text-sm"
                                    />
                                    <p className={helperTextClass}>{t("dialog.codecsHint")}</p>
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="trunk-dial-prefix" className={fieldLabelClass}>{t("dialog.dialPrefixLabel")}</Label>
                                    <Input
                                        id="trunk-dial-prefix"
                                        value={formData.dialPrefix}
                                        onChange={(e) => setFormData({ ...formData, dialPrefix: e.target.value })}
                                        placeholder={t("dialog.dialPrefixPlaceholder")}
                                        disabled={loading}
                                        className="font-mono text-sm"
                                    />
                                    <p className={helperTextClass}>{t("dialog.dialPrefixHint")}</p>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                                {c("actions.cancel")}
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                {loading ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Trunk")}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
