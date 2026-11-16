"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Input,
    Label,
    Field,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Chips,
    Chip,
    CheckboxCard,
} from "@wixzel/react";
import { toast } from "@wixzel/react";
import axios from "axios";
import { PencilSimple } from "@phosphor-icons/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface EditUserDialogProps {
    user: {
        _id: string;
        name: string;
        email: string;
        role: string;
        sharedTags?: string[];
        sharedAgents?: string[];
        sharedCampaigns?: string[];
    };
    onUserUpdated: () => void;
}

interface Agent {
    _id: string;
    name: string;
}

interface Campaign {
    _id: string;
    name: string;
}

export function EditUserDialog({ user, onUserUpdated }: EditUserDialogProps) {
    const t = useTranslations("users");
    const c = useTranslations("common");
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        role: user.role,
        sharedTags: user.sharedTags || [],
        sharedAgents: user.sharedAgents || [],
        sharedCampaigns: user.sharedCampaigns || [],
    });

    const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
    const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState("");

    useEffect(() => {
        if (open) {
            setFormData({
                role: user.role,
                sharedTags: user.sharedTags || [],
                sharedAgents: user.sharedAgents || [],
                sharedCampaigns: user.sharedCampaigns || [],
            });
            fetchData();
        }
    }, [open, user]);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem("token");
            const headers = { Authorization: `Bearer ${token}` };

            const [agentsRes, campaignsRes, leadsRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/agents`, { headers }),
                axios.get(`${API_BASE_URL}/campaigns`, { headers }),
                axios.get(`${API_BASE_URL}/leads`, { headers }), // To extract unique tags
            ]);

            if (agentsRes.data.status === "success") {
                setAvailableAgents(agentsRes.data.data.agents);
            }
            if (campaignsRes.data.status === "success") {
                setAvailableCampaigns(campaignsRes.data.data.campaigns);
            }
            if (leadsRes.data.status === "success") {
                // Extract unique tags from leads
                const tags = new Set<string>();
                leadsRes.data.data.leads.forEach((lead: any) => {
                    if (lead.tags && Array.isArray(lead.tags)) {
                        lead.tags.forEach((tag: string) => tags.add(tag));
                    }
                });
                setAvailableTags(Array.from(tags));
            }
        } catch (error) {
            console.error("Failed to fetch data", error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const token = localStorage.getItem("token");
            const response = await axios.patch(`${API_BASE_URL}/users/${user._id}`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.data.status === "success") {
                toast.success(t("toast.updated"));
                setOpen(false);
                onUserUpdated();
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || "Failed to update user";
            toast.error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleArrayItem = (field: 'sharedTags' | 'sharedAgents' | 'sharedCampaigns', value: string) => {
        setFormData(prev => {
            const current = prev[field];
            const updated = current.includes(value)
                ? current.filter(item => item !== value)
                : [...current, value];
            return { ...prev, [field]: updated };
        });
    };

    const addManualTag = () => {
        if (newTag && !formData.sharedTags.includes(newTag)) {
            toggleArrayItem('sharedTags', newTag);
            if (!availableTags.includes(newTag)) {
                setAvailableTags([...availableTags, newTag]);
            }
            setNewTag("");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("edit.title", { name: user.name })}>
                    <PencilSimple />
                </Button>
            </DialogTrigger>
            <DialogContent size="lg">
                <DialogHeader>
                    <DialogTitle>{t("edit.title", { name: user.name })}</DialogTitle>
                    <DialogDescription>
                        {t("edit.description")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <Field label={t("edit.roleLabel")} id="edit-role">
                        <Select
                            value={formData.role}
                            onValueChange={(value) =>
                                setFormData({ ...formData, role: value })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={t("roles.placeholder")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                                <SelectItem value="member">{t("roles.member")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>

                    <div className="flex flex-col gap-2">
                        <Label>{t("edit.sharedTags")}</Label>
                        <div className="min-h-[80px] rounded-md bg-bg-muted p-3">
                            {availableTags.length === 0 ? (
                                <p className="w-full py-2 text-center text-body-sm italic text-fg-muted">{t("edit.noTags")}</p>
                            ) : (
                                <Chips
                                    type="multiple"
                                    value={formData.sharedTags}
                                    onValueChange={(value: string[]) => setFormData((prev) => ({ ...prev, sharedTags: value }))}
                                    aria-label={t("edit.sharedTags")}
                                >
                                    {availableTags.map(tag => (
                                        <Chip key={tag} value={tag}>{tag}</Chip>
                                    ))}
                                </Chips>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-caption text-fg-muted">
                            <span>{t("edit.manualTag")}</span>
                            <Input
                                size="sm"
                                className="w-[150px]"
                                value={newTag}
                                aria-label={t("edit.manualTag")}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addManualTag();
                                    }
                                }}
                            />
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={addManualTag}
                            >
                                {t("edit.add")}
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label>{t("edit.sharedAgents")}</Label>
                        <div className="max-h-[180px] overflow-y-auto rounded-md bg-bg-muted p-2">
                            {availableAgents.length === 0 ? (
                                <p className="py-2 text-center text-body-sm italic text-fg-muted">{t("edit.noAgents")}</p>
                            ) : (
                                <div role="group" aria-label={t("edit.sharedAgents")} className="grid grid-cols-2 gap-2">
                                    {availableAgents.map(agent => (
                                        <CheckboxCard
                                            key={agent._id}
                                            title={agent.name}
                                            checked={formData.sharedAgents.includes(agent._id)}
                                            onCheckedChange={() => toggleArrayItem('sharedAgents', agent._id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label>{t("edit.sharedCampaigns")}</Label>
                        <div className="max-h-[180px] overflow-y-auto rounded-md bg-bg-muted p-2">
                            {availableCampaigns.length === 0 ? (
                                <p className="py-2 text-center text-body-sm italic text-fg-muted">{t("edit.noCampaigns")}</p>
                            ) : (
                                <div role="group" aria-label={t("edit.sharedCampaigns")} className="grid grid-cols-2 gap-2">
                                    {availableCampaigns.map(campaign => (
                                        <CheckboxCard
                                            key={campaign._id}
                                            title={campaign.name}
                                            checked={formData.sharedCampaigns.includes(campaign._id)}
                                            onCheckedChange={() => toggleArrayItem('sharedCampaigns', campaign._id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={isLoading}>
                            {c("actions.cancel")}
                        </Button>
                        <Button type="submit" variant="primary" loading={isLoading}>
                            {isLoading ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
