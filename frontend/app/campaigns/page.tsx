"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Play, CheckCircle, Clock, StopCircle, Robot, Users, SquaresFour, List, Trash, Copy, CalendarCheck } from "@phosphor-icons/react";
import {
    ActionBar,
    Badge,
    Button,
    Card,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    CardContent,
    Checkbox,
    EmptyState,
    PageHeader,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsList,
    TabsTrigger,
    toast,
    useConfirm,
} from "@wixzel/react";
import { CreateCampaignDialog } from "@/components/campaigns/create-campaign-dialog";
import axios from "axios";
import { useTranslations } from "next-intl";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface Campaign {
    _id: string;
    name: string;
    agentId: {
        _id: string;
        name: string;
    } | null;
    leadIds: string[];
    status: "idle" | "scheduled" | "running" | "completed" | "stopped";
    scheduledAt?: string | null;
    createdAt: string;
}

export default function CampaignsPage() {
    const t = useTranslations("campaigns");
    const router = useRouter();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"card" | "list">("card");
    const [isMobile, setIsMobile] = useState(false);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
    const pollInterval = useRef<NodeJS.Timeout | null>(null);
    const confirm = useConfirm();

    // Initial load from localStorage and mobile check
    useEffect(() => {
        const savedView = localStorage.getItem("campaigns_view_mode");
        if (savedView === "list" || savedView === "card") {
            setViewMode(savedView);
        }

        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        setHasHydrated(true);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Save to localStorage when viewMode changes
    useEffect(() => {
        if (hasHydrated) {
            localStorage.setItem("campaigns_view_mode", viewMode);
        }
    }, [viewMode, hasHydrated]);

    const fetchCampaigns = useCallback(async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_BASE_URL}/campaigns`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data?.status === "success") {
                setCampaigns(response.data.data.campaigns);
            }
        } catch (err: any) {
            toast.error(t("toast.loadFailed"));
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    const startCampaign = async (id: string) => {
        try {
            const token = localStorage.getItem("token");

            // Check config status first
            const configResp = await axios.get(`${API_BASE_URL}/settings/config-status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (configResp.data?.status === "success") {
                const status = configResp.data.data;
                if (!status.isTwilioConfigured && !status.isSipConfigured) {
                    toast.error(t("toast.noProvider"));
                    return;
                }
                // Self-contained engines (Sarvam, Gemini Live) need neither Deepgram nor
                // OpenRouter, so don't warn when one of those keys is configured — the backend
                // enforces the real per-agent key requirements on start.
                if (!status.isSarvamConfigured && !status.isGeminiConfigured && (!status.isDeepgramConfigured || !status.isModelConfigured)) {
                    toast.error(t("toast.missingKeys"));
                }
            }

            await axios.post(`${API_BASE_URL}/campaigns/start`, { id }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.started"));
            fetchCampaigns(false);
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.startFailed"));
        }
    };

    const handleDuplicate = async (id: string) => {
        try {
            setDuplicatingId(id);
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/campaigns/duplicate`, { id }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.duplicated"));
            fetchCampaigns();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.duplicateFailed"));
        } finally {
            setDuplicatingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!(await confirm({ title: "Are you sure you want to delete this campaign?", tone: "danger" }))) return;
        try {
            setIsDeleting(true);
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/campaigns/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.deleted"));
            setSelectedIds(prev => prev.filter(item => item !== id));
            fetchCampaigns();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.deleteFailed"));
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (!(await confirm({ title: `Are you sure you want to delete ${selectedIds.length} campaigns?`, tone: "danger" }))) return;
        try {
            setIsDeleting(true);
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/campaigns/bulk-delete`, { ids: selectedIds }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(t("toast.bulkDeleted"));
            setSelectedIds([]);
            fetchCampaigns();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.bulkDeleteFailed"));
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (selectedIds.length === campaigns.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(campaigns.map(c => c._id));
        }
    };

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    // Poll when any campaign is running (live progress) or scheduled (so we pick up scheduler starting them)
    useEffect(() => {
        const hasRunningCampaign = campaigns.some(c => c.status === "running");
        const hasScheduledCampaign = campaigns.some(c => c.status === "scheduled");

        if (hasRunningCampaign || hasScheduledCampaign) {
            if (!pollInterval.current) {
                pollInterval.current = setInterval(() => {
                    fetchCampaigns(false);
                }, 3000); // Poll every 3 seconds
            }
        } else {
            if (pollInterval.current) {
                clearInterval(pollInterval.current);
                pollInterval.current = null;
            }
        }

        return () => {
            if (pollInterval.current) {
                clearInterval(pollInterval.current);
                pollInterval.current = null;
            }
        };
    }, [campaigns, fetchCampaigns]);

    const getStatusBadge = (status: Campaign["status"]) => {
        const tones = {
            idle: "neutral",
            scheduled: "warning",
            running: "info",
            completed: "success",
            stopped: "danger",
        } as const;

        // A running campaign pulses instead of showing an icon: it is live.
        const icons = {
            idle: <Clock />,
            scheduled: <CalendarCheck />,
            running: null,
            completed: <CheckCircle />,
            stopped: <StopCircle />,
        };

        return (
            <Badge tone={tones[status]} pulse={status === "running"}>
                {icons[status]}
                {t(`status.${status}`)}
            </Badge>
        );
    };

    const scheduledLabel = (campaign: Campaign) => (
        <span className="flex items-center gap-1.5 text-caption text-fg-muted">
            <CalendarCheck className="size-3.5" />
            {campaign.scheduledAt
                ? new Date(campaign.scheduledAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                : "Scheduled"}
        </span>
    );

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("subtitle")}
                actions={
                    <>
                        <Tabs
                            variant="segment"
                            value={viewMode}
                            onValueChange={(v) => setViewMode(v as "card" | "list")}
                            className="hidden md:flex"
                        >
                            <TabsList>
                                <TabsTrigger value="card">
                                    <SquaresFour />
                                    {t("view.cards")}
                                </TabsTrigger>
                                <TabsTrigger value="list">
                                    <List />
                                    {t("view.list")}
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <CreateCampaignDialog onSuccess={() => fetchCampaigns()} />
                    </>
                }
            />

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Spinner size="xl" className="text-fg-muted" />
                </div>
            ) : campaigns.length > 0 ? (
                (viewMode === "card" || isMobile) ? (
                    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                        {campaigns.map((campaign) => (
                            <Card
                                key={campaign._id}
                                interactive
                                onClick={() => router.push(`/campaigns/${campaign._id}`)}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 flex-col gap-1">
                                            <CardTitle className="truncate">{campaign.name}</CardTitle>
                                            <CardDescription>
                                                {t("card.created", { date: new Date(campaign.createdAt).toLocaleDateString() })}
                                            </CardDescription>
                                        </div>
                                        {getStatusBadge(campaign.status)}
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1">
                                    <div className="grid grid-cols-2 gap-4 rounded-md bg-surface p-3">
                                        <div className="flex min-w-0 flex-col gap-1">
                                            <div className="flex items-center gap-1.5 text-caption font-medium text-fg-subtle">
                                                <Robot className="size-3.5" />
                                                {t("card.agent")}
                                            </div>
                                            <p className="truncate text-body-sm font-semibold">
                                                {campaign.agentId?.name || t("card.deletedAgent")}
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5 text-caption font-medium text-fg-subtle">
                                                <Users className="size-3.5" />
                                                {t("card.totalLeads")}
                                            </div>
                                            <p className="text-body-sm font-semibold tabular-nums">
                                                {campaign.leadIds.length}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="justify-between">
                                    <span className="font-mono text-caption text-fg-subtle uppercase">
                                        ID: {campaign._id.slice(-6)}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            loading={duplicatingId === campaign._id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDuplicate(campaign._id);
                                            }}
                                            title={t("card.duplicateTitle")}
                                            aria-label={t("card.duplicateTitle")}
                                        >
                                            <Copy />
                                        </Button>
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            disabled={campaign.status === "running" || isDeleting}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(campaign._id);
                                            }}
                                            title={t("card.deleteTitle")}
                                            aria-label={t("card.deleteTitle")}
                                        >
                                            <Trash />
                                        </Button>
                                        {campaign.status === "scheduled" ? (
                                            scheduledLabel(campaign)
                                        ) : (
                                        <Button
                                            size="sm"
                                            className="ms-1"
                                            variant={campaign.status === "running" ? "danger" : "primary"}
                                            disabled={campaign.status === "completed"}
                                            iconStart={
                                                campaign.status === "running" ? <Spinner size="sm" />
                                                    : campaign.status === "completed" ? <CheckCircle />
                                                        : <Play />
                                            }
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startCampaign(campaign._id);
                                            }}
                                        >
                                            {campaign.status === "running" ? t("card.active")
                                                : campaign.status === "completed" ? t("card.done")
                                                    : t("card.start")}
                                        </Button>
                                        )}
                                    </div>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">
                                    <Checkbox
                                        checked={selectedIds.length === campaigns.length && campaigns.length > 0}
                                        onCheckedChange={toggleAll}
                                    />
                                </TableHead>
                                <TableHead className="w-[200px]">{t("table.name")}</TableHead>
                                <TableHead>{t("table.agent")}</TableHead>
                                <TableHead>{t("table.leads")}</TableHead>
                                <TableHead>{t("table.status")}</TableHead>
                                <TableHead>{t("table.createdAt")}</TableHead>
                                <TableHead align="end">{t("table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {campaigns.map((campaign) => (
                                <TableRow
                                    key={campaign._id}
                                    data-state={selectedIds.includes(campaign._id) ? "selected" : undefined}
                                    className="cursor-pointer"
                                    onClick={() => router.push(`/campaigns/${campaign._id}`)}
                                >
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                            checked={selectedIds.includes(campaign._id)}
                                            onCheckedChange={() => toggleSelection(campaign._id)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2.5">
                                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                                <Megaphone className="size-4" />
                                            </span>
                                            {campaign.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Robot className="size-3.5 text-fg-subtle" />
                                            {campaign.agentId?.name || t("card.deletedAgent")}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Users className="size-3.5 text-fg-subtle" />
                                            {campaign.leadIds.length}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {getStatusBadge(campaign.status)}
                                    </TableCell>
                                    <TableCell className="text-caption text-fg-muted">
                                        {new Date(campaign.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell align="end">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Button
                                                size="xs"
                                                variant="secondary"
                                                iconStart={<List />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.push(`/campaigns/${campaign._id}`);
                                                }}
                                            >
                                                {t("table.details")}
                                            </Button>
                                            <Button
                                                size="xs"
                                                variant="secondary"
                                                iconStart={<Copy />}
                                                loading={duplicatingId === campaign._id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDuplicate(campaign._id);
                                                }}
                                            >
                                                {t("table.duplicate")}
                                            </Button>
                                            {campaign.status === "scheduled" ? (
                                                scheduledLabel(campaign)
                                            ) : (
                                            <Button
                                                size="xs"
                                                variant={campaign.status === "running" ? "danger" : "primary"}
                                                disabled={campaign.status === "completed"}
                                                iconStart={campaign.status === "running" ? <Spinner size="sm" /> : <Play />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startCampaign(campaign._id);
                                                }}
                                            >
                                                {campaign.status === "running" ? t("card.active") : t("card.start")}
                                            </Button>
                                            )}
                                            <Button
                                                size="xs"
                                                variant="ghost"
                                                iconStart={<Trash />}
                                                disabled={campaign.status === "running" || isDeleting}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(campaign._id);
                                                }}
                                            >
                                                {t("table.delete")}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )
            ) : (
                <EmptyState
                    icon={<Megaphone />}
                    title={t("empty.title")}
                    description={t("empty.description")}
                    actions={<CreateCampaignDialog onSuccess={() => fetchCampaigns()} />}
                />
            )}

            {/* The selection's actions stick to the bottom of the page while rows are chosen. */}
            {selectedIds.length > 0 && (
                <ActionBar>
                    <div className="flex items-center gap-2">
                        <span className="ps-1 text-body-sm font-medium tabular-nums">
                            {t("selection.count", { count: selectedIds.length })}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                            {t("selection.deselectAll")}
                        </Button>
                    </div>
                    <Button
                        variant="danger"
                        size="sm"
                        iconStart={<Trash />}
                        onClick={handleBulkDelete}
                        disabled={isDeleting}
                    >
                        {t("selection.deleteSelected")}
                    </Button>
                </ActionBar>
            )}
        </div>
    );
}
