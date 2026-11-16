"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useCallback } from "react";
import { Headset, ChatText, PaperPlaneTilt, Clock, User, Envelope } from "@phosphor-icons/react";
import {
    Spinner,
    Button,
    Card,
    Textarea,
    Badge,
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerBody,
    DrawerFooter,
    DrawerTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Label,
    Chips,
    Chip,
    EmptyState,
    PageHeader,
    Transcript,
    Message,
} from "@wixzel/react";
import axios from "axios";
import { toast } from "@wixzel/react";
import { cn } from "@/lib/utils";
import { useSettings, formatTime } from "@/components/settings-provider";
import { AdminNav } from "@/components/admin/nav";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

interface SupportMessage {
    _id: string;
    authorId: { _id: string; name: string; email: string };
    authorRole: "user" | "admin";
    body: string;
    createdAt: string;
}

interface SupportTicket {
    _id: string;
    userId: { _id: string; name: string; email: string };
    subject: string;
    status: "open" | "in_progress" | "resolved" | "closed";
    createdAt: string;
    updatedAt: string;
}

const statusConfig: Record<string, { label: string; tone: "info" | "warning" | "success" | "neutral" }> = {
    open: { label: "Open", tone: "info" },
    in_progress: { label: "In Progress", tone: "warning" },
    resolved: { label: "Resolved", tone: "success" },
    closed: { label: "Closed", tone: "neutral" },
};

export default function AdminSupportPage() {
    const t = useTranslations("admin");
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [messages, setMessages] = useState<SupportMessage[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [replyBody, setReplyBody] = useState("");
    const [sending, setSending] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const { timeFormat } = useSettings();

    const fetchTickets = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const url = statusFilter === "all"
                ? `${API_BASE_URL}/support/tickets`
                : `${API_BASE_URL}/support/tickets?status=${statusFilter}`;
            const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data?.status === "success") setTickets(res.data.data.tickets || []);
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("support.toast.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const fetchTicketDetail = useCallback(async (id: string) => {
        try {
            setMessagesLoading(true);
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/support/tickets/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data?.status === "success") {
                setMessages(res.data.data.messages || []);
                setSelectedTicket(res.data.data.ticket);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("support.toast.conversationFailed"));
        } finally {
            setMessagesLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTickets();
    }, [fetchTickets]);

    useEffect(() => {
        if (selectedTicket?._id) fetchTicketDetail(selectedTicket._id);
    }, [selectedTicket?._id]);

    const openDetail = (ticket: SupportTicket) => {
        setSelectedTicket(ticket);
        setReplyBody("");
    };

    const sendReply = async () => {
        if (!selectedTicket || !replyBody.trim()) return;
        try {
            setSending(true);
            const token = localStorage.getItem("token");
            const res = await axios.post(
                `${API_BASE_URL}/support/tickets/${selectedTicket._id}/messages`,
                { body: replyBody.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data?.status === "success") {
                setReplyBody("");
                fetchTickets();
                if (selectedTicket?._id) fetchTicketDetail(selectedTicket._id);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("support.toast.replyFailed"));
        } finally {
            setSending(false);
        }
    };

    const updateStatus = async (newStatus: string) => {
        if (!selectedTicket) return;
        try {
            setStatusUpdating(true);
            const token = localStorage.getItem("token");
            const res = await axios.patch(
                `${API_BASE_URL}/support/tickets/${selectedTicket._id}`,
                { status: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data?.status === "success") {
                setSelectedTicket(res.data.data.ticket);
                fetchTickets();
                toast.success(t("support.toast.statusUpdated"));
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("support.toast.statusFailed"));
        } finally {
            setStatusUpdating(false);
        }
    };

    const filteredTickets = tickets;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("support.title")} description={t("support.subtitle")} />
            <AdminNav currentPath="/admin/support" />
            <Chips
                type="single"
                value={statusFilter}
                onValueChange={(value) => value && setStatusFilter(value)}
                aria-label={t("support.statusFilter")}
            >
                <Chip value="all">{t("support.all")}</Chip>
                <Chip value="open">{t("support.open")}</Chip>
                <Chip value="in_progress">{t("support.inProgress")}</Chip>
                <Chip value="resolved">{t("support.resolved")}</Chip>
                <Chip value="closed">{t("support.closed")}</Chip>
            </Chips>

            {loading ? (
                <div className="flex items-center justify-center rounded-lg bg-card py-16">
                    <Spinner size="xl" />
                </div>
            ) : filteredTickets.length === 0 ? (
                <EmptyState
                    icon={<Headset />}
                    title={t("support.emptyTitle")}
                    description={t("support.emptyDescription")}
                />
            ) : (
                <Card className="divide-y divide-border overflow-hidden">
                    {filteredTickets.map((ticket) => {
                        const status = statusConfig[ticket.status] || statusConfig.open;
                        const user = ticket.userId as { _id: string; name: string; email: string };
                        return (
                            <button
                                key={ticket._id}
                                type="button"
                                className={cn(
                                    "flex w-full items-center gap-4 px-4 py-3 text-start transition-colors wx-focus",
                                    "hover:bg-[color-mix(in_oklab,var(--wx-color-card),var(--wx-color-fg)_3%)]",
                                    selectedTicket?._id === ticket._id && "bg-accent-subtle hover:bg-accent-subtle"
                                )}
                                onClick={() => openDetail(ticket)}
                            >
                                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink [&_svg]:size-5">
                                    <ChatText />
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-body-sm font-medium">{ticket.subject}</p>
                                    <p className="mt-0.5 flex items-center gap-1 text-caption text-fg-muted">
                                        <User className="size-3" />
                                        {user?.name || "Unknown"} · <span className="ltr-data">{user?.email}</span>
                                    </p>
                                    <p className="mt-0.5 flex items-center gap-1 text-caption text-fg-muted">
                                        <Clock className="size-3" />
                                        {formatTime(ticket.updatedAt, timeFormat)}
                                    </p>
                                </div>
                                <Badge tone={status.tone} dot>
                                    {status.label}
                                </Badge>
                            </button>
                        );
                    })}
                </Card>
            )}

            {/* Ticket detail drawer */}
            <Drawer open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
                <DrawerContent side="right" style={{ "--wx-drawer-size": "512px" } as React.CSSProperties}>
                    <DrawerHeader className="gap-2">
                        <DrawerTitle className="truncate">{selectedTicket?.subject}</DrawerTitle>
                        {selectedTicket && (
                            <div className="flex flex-col gap-2 text-body-sm text-fg-muted">
                                <Badge tone={statusConfig[selectedTicket.status]?.tone} dot>
                                    {statusConfig[selectedTicket.status]?.label}
                                </Badge>
                                <div className="flex flex-wrap items-center gap-2">
                                    <User className="size-3.5" />
                                    <span>{(selectedTicket.userId as { name?: string })?.name}</span>
                                    <Envelope className="ms-2 size-3.5" />
                                    <span className="ltr-data">{(selectedTicket.userId as { email?: string })?.email}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="ticket-status" className="text-caption text-fg-muted">{t("support.statusLabel")}</Label>
                                    <Select
                                        value={selectedTicket.status}
                                        onValueChange={updateStatus}
                                        disabled={statusUpdating}
                                    >
                                        <SelectTrigger id="ticket-status" size="sm" className="w-[140px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="open">{t("support.open")}</SelectItem>
                                            <SelectItem value="in_progress">{t("support.inProgress")}</SelectItem>
                                            <SelectItem value="resolved">{t("support.resolved")}</SelectItem>
                                            <SelectItem value="closed">{t("support.closed")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {statusUpdating && <Spinner />}
                                </div>
                            </div>
                        )}
                    </DrawerHeader>
                    <DrawerBody>
                        {messagesLoading ? (
                            <div className="flex justify-center py-8">
                                <Spinner size="xl" />
                            </div>
                        ) : (
                            <Transcript>
                                {messages.map((msg) => (
                                    <Message
                                        key={msg._id}
                                        from={msg.authorRole === "admin" ? "person" : "agent"}
                                        name={<>{msg.authorId?.name} {msg.authorRole === "admin" && "· Support"}</>}
                                        time={formatTime(msg.createdAt, timeFormat)}
                                    >
                                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                                    </Message>
                                ))}
                            </Transcript>
                        )}
                    </DrawerBody>
                    {selectedTicket && (selectedTicket.status === "open" || selectedTicket.status === "in_progress" || selectedTicket.status === "resolved") && (
                        <DrawerFooter className="flex-col items-stretch">
                            <Textarea
                                placeholder={t("support.replyPlaceholder")}
                                value={replyBody}
                                onChange={(e) => setReplyBody(e.target.value)}
                                rows={3}
                                className="resize-none"
                            />
                            <Button
                                variant="primary"
                                block
                                onClick={sendReply}
                                disabled={!replyBody.trim()}
                                loading={sending}
                                iconStart={<PaperPlaneTilt />}
                            >
                                {t("support.sendReply")}
                            </Button>
                        </DrawerFooter>
                    )}
                </DrawerContent>
            </Drawer>
        </div>
    );
}
