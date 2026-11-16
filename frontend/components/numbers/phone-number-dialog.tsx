"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Field,
    Input,
    RadioCard,
    RadioCards,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    toast,
} from "@wixzel/react";
import axios from "axios";
import { UserCircle, HardDrives, Phone } from "@phosphor-icons/react";
import { e164Issue } from "@/lib/phone-checks";
import { FormIssues, hasErrors, type FormIssue } from "@/components/ui/form-issues";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface Agent {
    _id: string;
    name: string;
}

interface SipTrunk {
    _id: string;
    name: string;
    providerName: string;
    host: string;
    defaultCallerId?: string;
    status?: string;
}

interface PhoneNumber {
    _id: string;
    phoneNumber: string;
    name: string;
    inboundAgentId?: any;
    provider?: string;
    sipTrunkId?: any;
    fallbackNumber?: string;
    status: string;
}

interface PhoneNumberDialogProps {
    phoneNumber?: PhoneNumber;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function PhoneNumberDialog({ phoneNumber, open, onOpenChange, onSuccess }: PhoneNumberDialogProps) {
    const t = useTranslations("numbers");
    const c = useTranslations("common");
    const [loading, setLoading] = useState(false);
    const [agents, setAgents] = useState<Agent[] | null>(null);
    const [sipTrunks, setSipTrunks] = useState<SipTrunk[]>([]);
    const [formData, setFormData] = useState({
        phoneNumber: "",
        name: "",
        inboundAgentId: "none",
        provider: "twilio",
        sipTrunkId: "none",
        fallbackNumber: "",
    });

    useEffect(() => {
        if (open) {
            setAgents(null);
            fetchAgents();
            fetchSipTrunks();
            setFormData({
                phoneNumber: phoneNumber?.phoneNumber || "",
                name: phoneNumber?.name || "",
                inboundAgentId: phoneNumber?.inboundAgentId?._id || phoneNumber?.inboundAgentId || "none",
                provider: phoneNumber?.provider || "twilio",
                sipTrunkId: phoneNumber?.sipTrunkId?._id || phoneNumber?.sipTrunkId || "none",
                fallbackNumber: phoneNumber?.fallbackNumber || "",
            });
        }
    }, [open, phoneNumber]);

    const fetchAgents = async () => {
        try {
            const token = localStorage.getItem("token");
            // Only your own agents: a number can't be given another account's agent.
            const response = await axios.get(`${API_BASE_URL}/agents?mine=1`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setAgents(response.data.data.agents);
            }
        } catch (err) {
            console.error("Failed to fetch agents:", err);
        }
    };

    const fetchSipTrunks = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/sip-trunks`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setSipTrunks(response.data.data.trunks || []);
            }
        } catch (err) {
            // SIP trunks endpoint might not exist yet—that's ok
            console.error("Failed to fetch SIP trunks:", err);
        }
    };

    const isEditing = !!phoneNumber;
    const isSip = formData.provider === "sip";

    // Everything this form can tell is wrong before Save.
    const selectedTrunk = sipTrunks.find((tr) => tr._id === formData.sipTrunkId);
    const ownNumber = formData.phoneNumber.replace(/\s+/g, "");
    const fallback = formData.fallbackNumber.replace(/\s+/g, "");
    const issues: FormIssue[] = [];
    const numberIssue = isEditing ? null : e164Issue(ownNumber, t("dialog.phoneLabel"), c);
    if (numberIssue) issues.push(numberIssue);
    if (isSip && formData.sipTrunkId === "none") {
        issues.push({ level: "error", message: t("dialog.issues.noTrunk") });
    }
    if (selectedTrunk?.status === "inactive") {
        issues.push({ level: "warning", message: t("dialog.issues.trunkInactive", { name: selectedTrunk.name }) });
    }
    const trunkCallerId = selectedTrunk?.defaultCallerId?.replace(/\s+/g, "");
    if (selectedTrunk && trunkCallerId && ownNumber && trunkCallerId.replace(/\D/g, "") !== ownNumber.replace(/\D/g, "")) {
        issues.push({
            level: "warning",
            message: t("dialog.issues.trunkCallerId", { name: selectedTrunk.name, callerId: trunkCallerId }),
        });
    }
    if (isSip) {
        const fallbackIssue = e164Issue(fallback, t("dialog.fallbackLabel"), c);
        if (fallbackIssue) issues.push(fallbackIssue);
        if (fallback && ownNumber && fallback.replace(/\D/g, "") === ownNumber.replace(/\D/g, "")) {
            issues.push({ level: "error", message: t("dialog.issues.fallbackIsSelf") });
        }
    }
    if (formData.inboundAgentId === "none" && !(isSip && fallback)) {
        issues.push({ level: "warning", message: t("dialog.issues.noAgentHangsUp") });
    } else if (formData.inboundAgentId !== "none" && isSip && fallback) {
        issues.push({ level: "warning", message: t("dialog.issues.fallbackUnused") });
    }
    if (agents?.length === 0) {
        issues.push({ level: "warning", message: t("dialog.issues.noAgents") });
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const firstError = issues.find((i) => i.level === "error");
        if (firstError) {
            toast.error(firstError.message);
            return;
        }
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const submissionData = {
                ...formData,
                inboundAgentId: formData.inboundAgentId === "none" ? null : formData.inboundAgentId,
                sipTrunkId: formData.sipTrunkId === "none" ? null : formData.sipTrunkId,
                fallbackNumber: formData.fallbackNumber || null,
            };
            if (isEditing) {
                await axios.patch(`${API_BASE_URL}/numbers/${phoneNumber._id}`, submissionData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success(t("toast.updated"));
            } else {
                await axios.post(`${API_BASE_URL}/numbers`, submissionData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success(t("toast.added"));
            }
            onOpenChange(false);
            onSuccess?.();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.generic"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle>{isEditing ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
                    <DialogDescription>
                        {t("dialog.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="grid gap-4">
                        {/* Provider Toggle */}
                        <Field label={t("dialog.providerLabel")}>
                            <RadioCards
                                columns={2}
                                value={formData.provider}
                                onValueChange={(value) =>
                                    setFormData(
                                        value === "twilio"
                                            ? { ...formData, provider: "twilio", sipTrunkId: "none" }
                                            : { ...formData, provider: "sip" }
                                    )
                                }
                                disabled={loading}
                                aria-label={t("dialog.providerLabel")}
                            >
                                <RadioCard value="twilio" icon={<Phone />} title="Twilio" />
                                <RadioCard value="sip" icon={<HardDrives />} title={t("dialog.sipTrunk")} />
                            </RadioCards>
                        </Field>

                        {/* Phone Number */}
                        <Field id="phone-number" label={t("dialog.phoneLabel")}>
                            <Input
                                value={formData.phoneNumber}
                                onChange={(e) =>
                                    setFormData({ ...formData, phoneNumber: e.target.value })
                                }
                                placeholder="+966501234567"
                                required
                                disabled={loading || isEditing}
                                className="font-mono"
                            />
                        </Field>

                        {/* Friendly Name */}
                        <Field id="name" label={t("dialog.friendlyNameLabel")}>
                            <Input
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder={t("dialog.friendlyNamePlaceholder")}
                                required
                                disabled={loading}
                            />
                        </Field>

                        {/* SIP Trunk Selector (only when SIP) */}
                        {isSip && (
                            <Field label={t("dialog.sipTrunkLabel")}>
                                <Select
                                    value={formData.sipTrunkId}
                                    onValueChange={(value) => setFormData({ ...formData, sipTrunkId: value })}
                                    disabled={loading}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("dialog.selectTrunk")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t("dialog.noTrunkSelected")}</SelectItem>
                                        {sipTrunks.map((trunk) => (
                                            <SelectItem key={trunk._id} value={trunk._id}>
                                                <span className="flex items-center gap-2">
                                                    <HardDrives className="size-3.5 text-fg-muted" />
                                                    <span>{trunk.name}</span>
                                                    {trunk.providerName && (
                                                        <Badge size="sm">{trunk.providerName}</Badge>
                                                    )}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {sipTrunks.length === 0 && (
                                    <p className="text-caption font-medium text-warning-ink">
                                        {t("dialog.noTrunks")}
                                    </p>
                                )}
                            </Field>
                        )}

                        {/* Inbound Agent */}
                        <Field id="inbound-agent" label={t("dialog.inboundAgentLabel")} hint={t("dialog.inboundAgentHint")}>
                            <Select
                                value={formData.inboundAgentId}
                                onValueChange={(value) => setFormData({ ...formData, inboundAgentId: value })}
                                disabled={loading}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t("dialog.selectAgent")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t("dialog.noAgentHangUp")}</SelectItem>
                                    {(agents || []).map((agent) => (
                                        <SelectItem key={agent._id} value={agent._id}>
                                            <span className="flex items-center gap-2">
                                                <UserCircle className="size-4 text-fg-muted" />
                                                <span>{agent.name}</span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>

                        {/* Fallback Number (only when SIP) */}
                        {isSip && (
                            <Field
                                id="fallback-number"
                                label={t("dialog.fallbackLabel")}
                                labelAside={t("dialog.optional")}
                                hint={t("dialog.fallbackHint")}
                            >
                                <Input
                                    value={formData.fallbackNumber}
                                    onChange={(e) => setFormData({ ...formData, fallbackNumber: e.target.value })}
                                    placeholder="+966501234567"
                                    disabled={loading}
                                        className="font-mono"
                                />
                            </Field>
                        )}
                    </div>
                    <FormIssues issues={issues} />
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" variant="primary" loading={loading} disabled={hasErrors(issues)}>
                            {loading ? (isEditing ? "Updating..." : "Adding...") : (isEditing ? "Update" : "Add Number")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
