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
import { Plus, Hash, UserCircle, Server, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    const [agents, setAgents] = useState<Agent[]>([]);
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
            const response = await axios.get(`${API_BASE_URL}/agents`, {
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
            <DialogContent className="sm:max-w-[540px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
                    <DialogDescription>
                        {t("dialog.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        {/* Provider Toggle */}
                        <div className="grid gap-2">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">{t("dialog.providerLabel")}</Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant={formData.provider === "twilio" ? "default" : "outline"}
                                    size="sm"
                                    className="flex-1 h-10"
                                    onClick={() => setFormData({ ...formData, provider: "twilio", sipTrunkId: "none" })}
                                    disabled={loading}
                                >
                                    <Phone className="me-2 h-4 w-4" />
                                    Twilio
                                </Button>
                                <Button
                                    type="button"
                                    variant={formData.provider === "sip" ? "default" : "outline"}
                                    size="sm"
                                    className="flex-1 h-10"
                                    onClick={() => setFormData({ ...formData, provider: "sip" })}
                                    disabled={loading}
                                >
                                    <Server className="me-2 h-4 w-4" />
                                    {t("dialog.sipTrunk")}
                                </Button>
                            </div>
                        </div>

                        {/* Phone Number */}
                        <div className="grid gap-2">
                            <Label htmlFor="phone-number" className="text-xs font-bold uppercase text-muted-foreground">{t("dialog.phoneLabel")}</Label>
                            <Input
                                id="phone-number"
                                value={formData.phoneNumber}
                                onChange={(e) =>
                                    setFormData({ ...formData, phoneNumber: e.target.value })
                                }
                                placeholder="+966501234567"
                                required
                                disabled={loading || isEditing}
                                className="font-mono"
                            />
                        </div>

                        {/* Friendly Name */}
                        <div className="grid gap-2">
                            <Label htmlFor="name" className="text-xs font-bold uppercase text-muted-foreground">{t("dialog.friendlyNameLabel")}</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder={t("dialog.friendlyNamePlaceholder")}
                                required
                                disabled={loading}
                            />
                        </div>

                        {/* SIP Trunk Selector (only when SIP) */}
                        {isSip && (
                            <div className="grid gap-2">
                                <Label className="text-xs font-bold uppercase text-muted-foreground">{t("dialog.sipTrunkLabel")}</Label>
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
                                                <div className="flex items-center gap-2">
                                                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                                                    <span>{trunk.name}</span>
                                                    {trunk.providerName && (
                                                        <Badge variant="outline" className="text-[8px] h-4 px-1">
                                                            {trunk.providerName}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {sipTrunks.length === 0 && (
                                    <p className="text-[10px] text-amber-600 font-medium">
                                        {t("dialog.noTrunks")}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Inbound Agent */}
                        <div className="grid gap-2">
                            <Label htmlFor="inbound-agent" className="text-xs font-bold uppercase text-muted-foreground">{t("dialog.inboundAgentLabel")}</Label>
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
                                    {agents.map((agent) => (
                                        <SelectItem key={agent._id} value={agent._id}>
                                            <div className="flex items-center gap-2">
                                                <UserCircle className="h-4 w-4 text-muted-foreground" />
                                                <span>{agent.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground italic">
                                {t("dialog.inboundAgentHint")}
                            </p>
                        </div>

                        {/* Fallback Number (only when SIP) */}
                        {isSip && (
                            <div className="grid gap-2">
                                <Label htmlFor="fallback-number" className="text-xs font-bold uppercase text-muted-foreground">
                                    {t("dialog.fallbackLabel")}
                                    <span className="normal-case font-normal text-muted-foreground ms-1">{t("dialog.optional")}</span>
                                </Label>
                                <Input
                                    id="fallback-number"
                                    value={formData.fallbackNumber}
                                    onChange={(e) => setFormData({ ...formData, fallbackNumber: e.target.value })}
                                    placeholder="+966501234567"
                                    disabled={loading}
                                    className="font-mono"
                                />
                                <p className="text-[10px] text-muted-foreground italic">
                                    {t("dialog.fallbackHint")}
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? (isEditing ? "Updating..." : "Adding...") : (isEditing ? "Update" : "Add Number")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
