"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import axios from "axios";
import { Plus, Search, CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface Agent {
    _id: string;
    name: string;
}

interface Lead {
    _id: string;
    name: string;
    phone: string;
    tags: string[];
}

interface CreateCampaignDialogProps {
    onSuccess?: () => void;
}

function getCreateCampaignErrorMessage(err: unknown): string {
    const fallback = "Failed to create campaign";
    if (!err || typeof err !== "object") return fallback;
    const ax = err as { response?: { data?: { message?: unknown } } };
    const raw = ax.response?.data?.message;
    const msg = typeof raw === "string" ? raw.trim() : "";
    if (!msg) return fallback;
    if (/agent\s*id/i.test(msg)) return "Please select an agent";
    return msg;
}

export function CreateCampaignDialog({ onSuccess }: CreateCampaignDialogProps) {
    const t = useTranslations("campaigns");
    const c = useTranslations("common");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();
    const [formData, setFormData] = useState({
        name: "",
        agentId: "",
        selectedLeads: [] as string[],
        scheduleEnabled: false,
        scheduledAt: "", // datetime-local value: YYYY-MM-DDTHH:mm
    });

    useEffect(() => {
        if (open) {
            fetchInitialData();
        }
    }, [open]);

    const fetchInitialData = async () => {
        try {
            const token = localStorage.getItem("token");
            const [agentsRes, leadsRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/agents`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                axios.get(`${API_BASE_URL}/leads`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            setAgents(agentsRes.data.data.agents);
            setLeads(leadsRes.data.data.leads);
        } catch (err: any) {
            toast.error(t("toast.loadDataFailed"));
        }
    };

    const handleLeadToggle = (leadId: string) => {
        setFormData((prev) => ({
            ...prev,
            selectedLeads: prev.selectedLeads.includes(leadId)
                ? prev.selectedLeads.filter((id) => id !== leadId)
                : [...prev.selectedLeads, leadId],
        }));
    };

    const handleTagToggle = (tag: string, checked: boolean) => {
        const leadsWithTag = leads.filter(lead => lead.tags?.includes(tag)).map(lead => lead._id);

        setFormData((prev) => {
            let newSelected = [...prev.selectedLeads];
            if (checked) {
                // Add all leads with tag that aren't already selected
                leadsWithTag.forEach(id => {
                    if (!newSelected.includes(id)) newSelected.push(id);
                });
            } else {
                // Remove all leads that have this tag
                newSelected = newSelected.filter(id => !leadsWithTag.includes(id));
            }
            return { ...prev, selectedLeads: newSelected };
        });
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setFormData(prev => ({
                ...prev,
                selectedLeads: filteredLeads.map(l => l._id)
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                selectedLeads: []
            }));
        }
    };

    const allTags = Array.from(new Set(leads.flatMap(lead => lead.tags || []))).sort();

    const filteredLeads = leads.filter(lead =>
        lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.phone.includes(searchQuery)
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.agentId?.trim()) {
            toast.error(t("toast.selectAgent"));
            return;
        }
        if (formData.selectedLeads.length === 0) {
            toast.error(t("toast.selectLead"));
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const payload: { name: string; agentId: string; leadIds: string[]; scheduledAt?: string } = {
                name: formData.name,
                agentId: formData.agentId,
                leadIds: formData.selectedLeads
            };
            if (formData.scheduleEnabled && formData.scheduledAt) {
                payload.scheduledAt = new Date(formData.scheduledAt).toISOString();
            }
            const response = await axios.post(`${API_BASE_URL}/campaigns`, payload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            toast.success(payload.scheduledAt ? "Campaign scheduled successfully!" : "Campaign created successfully!");
            setOpen(false);
            setFormData({ name: "", agentId: "", selectedLeads: [], scheduleEnabled: false, scheduledAt: "" });
            onSuccess?.();

            // Redirect to the new campaign details page
            if (response.data?.data?.campaign?._id) {
                router.push(`/campaigns/${response.data.data.campaign._id}`);
            }
        } catch (err: unknown) {
            toast.error(getCreateCampaignErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="h-4 w-4" />
                    {t("create.trigger")}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{t("create.title")}</DialogTitle>
                    <DialogDescription>
                        {t("create.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="campaign-name">{t("create.nameLabel")}</Label>
                            <Input
                                id="campaign-name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                placeholder={t("create.namePlaceholder")}
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="agent">{t("create.agentLabel")}</Label>
                            <Select
                                value={formData.agentId}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, agentId: value })
                                }
                                required
                                disabled={loading}
                            >
                                <SelectTrigger id="agent">
                                    <SelectValue placeholder={t("create.agentPlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {agents.map((agent) => (
                                        <SelectItem key={agent._id} value={agent._id}>
                                            {agent.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="schedule-campaign"
                                    checked={formData.scheduleEnabled}
                                    onChange={(e) => setFormData({ ...formData, scheduleEnabled: e.target.checked })}
                                    disabled={loading}
                                    className="h-4 w-4 rounded border-input"
                                />
                                <Label htmlFor="schedule-campaign" className="flex items-center gap-1.5 cursor-pointer">
                                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                                    {t("create.scheduleLater")}
                                </Label>
                            </div>
                            {formData.scheduleEnabled && (
                                <div className="grid gap-1.5">
                                    <Label htmlFor="scheduled-at">{t("create.dateTimeLabel")}</Label>
                                    <input
                                        id="scheduled-at"
                                        type="datetime-local"
                                        value={formData.scheduledAt}
                                        onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                                        disabled={loading}
                                        min={new Date().toISOString().slice(0, 16)}
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <div className="flex items-center justify-between mb-1">
                                <Label>{t("create.selectLeads", { count: formData.selectedLeads.length })}</Label>
                                <div className="flex items-center gap-4">
                                    <Select onValueChange={(tag) => handleTagToggle(tag, true)}>
                                        <SelectTrigger className="h-7 w-fit text-xs px-2 border-dashed">
                                            <SelectValue placeholder={t("create.addByTag")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allTags.map(tag => (
                                                <SelectItem key={tag} value={tag} className="text-xs">
                                                    {tag}
                                                </SelectItem>
                                            ))}
                                            {allTags.length === 0 && (
                                                <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("create.noTags")}</div>
                                            )}
                                        </SelectContent>
                                    </Select>

                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="select-all"
                                            checked={formData.selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                        />
                                        <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer">{t("create.selectAll")}</label>
                                    </div>
                                </div>
                            </div>

                            <div className="relative mb-2">
                                <Search className="absolute start-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder={t("create.searchLeads")}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-8 ps-8 text-xs"
                                />
                            </div>

                            <ScrollArea className="h-[200px] rounded-md border p-4">
                                <div className="space-y-3">
                                    {filteredLeads.map((lead) => (
                                        <div key={lead._id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`lead-${lead._id}`}
                                                checked={formData.selectedLeads.includes(lead._id)}
                                                onCheckedChange={() => handleLeadToggle(lead._id)}
                                                disabled={loading}
                                            />
                                            <label
                                                htmlFor={`lead-${lead._id}`}
                                                className="flex-1 cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                            >
                                                {lead.name}
                                                <span className="ms-2 text-xs font-normal text-muted-foreground">
                                                    <span className="ltr-data">{lead.phone}</span>
                                                </span>
                                            </label>
                                        </div>
                                    ))}
                                    {filteredLeads.length === 0 && (
                                        <p className="text-center text-xs text-muted-foreground py-4">
                                            {t("create.noLeadsFound")}
                                        </p>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? t("create.creating") : t("create.trigger")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
