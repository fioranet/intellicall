"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useCallback } from "react";
import { Headset, Plus, ChatText, PaperPlaneTilt, Clock } from "@phosphor-icons/react";
import {
    Spinner,
    Button,
    Card,
    Input,
    Textarea,
    Badge,
    Field,
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerBody,
    DrawerFooter,
    DrawerTitle,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
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

export default function SupportPage() {
    const t = useTranslations("support");
    const c = useTranslations("common");
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [messages, setMessages] = useState<SupportMessage[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [replyBody, setReplyBody] = useState("");
    const [sending, setSending] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [createSubject, setCreateSubject] = useState("");
    const [createMessage, setCreateMessage] = useState("");
    const [creating, setCreating] = useState(false);
    const { timeFormat } = useSettings();

    const fetchTickets = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const params = new URLSearchParams({ scope: "mine" });
            if (statusFilter !== "all") params.set("status", statusFilter);
            const url = `${API_BASE_URL}/support/tickets?${params.toString()}`;
            const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data?.status === "success") setTickets(res.data.data.tickets || []);
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.loadFailed"));
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
            toast.error(err.response?.data?.message || t("toast.conversationFailed"));
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
            toast.error(err.response?.data?.message || t("toast.replyFailed"));
        } finally {
            setSending(false);
        }
    };

    const createTicket = async () => {
        if (!createSubject.trim()) {
            toast.error(t("toast.subjectRequired"));
            return;
        }
        try {
            setCreating(true);
            const token = localStorage.getItem("token");
            const res = await axios.post(
                `${API_BASE_URL}/support/tickets`,
                { subject: createSubject.trim(), message: createMessage.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data?.status === "success") {
                setTickets((prev) => [res.data.data.ticket, ...prev]);
                setCreateOpen(false);
                setCreateSubject("");
                setCreateMessage("");
                toast.success(t("toast.created"));
                openDetail(res.data.data.ticket);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || t("toast.createFailed"));
        } finally {
            setCreating(false);
        }
    };

    const filteredTickets = tickets;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                description={t("subtitle")}
                actions={
                    <Button variant="primary" iconStart={<Plus />} onClick={() => setCreateOpen(true)}>
                        {t("newTicket")}
                    </Button>
                }
            />

            <Chips
                type="single"
                value={statusFilter}
                onValueChange={(value) => value && setStatusFilter(value)}
                aria-label={t("filters.status")}
            >
                <Chip value="all">{t("filters.all")}</Chip>
                <Chip value="open">{t("filters.open")}</Chip>
                <Chip value="in_progress">{t("filters.inProgress")}</Chip>
                <Chip value="resolved">{t("filters.resolved")}</Chip>
                <Chip value="closed">{t("filters.closed")}</Chip>
            </Chips>

            {loading ? (
                <div className="flex items-center justify-center rounded-lg bg-card py-16">
                    <Spinner size="xl" />
                </div>
            ) : filteredTickets.length === 0 ? (
                <EmptyState
                    icon={<Headset />}
                    title={t("empty.title")}
                    description={t("empty.description")}
                    actions={
                        <Button variant="primary" iconStart={<Plus />} onClick={() => setCreateOpen(true)}>
                            {t("newTicket")}
                        </Button>
                    }
                />
            ) : (
                <Card className="divide-y divide-border overflow-hidden">
                    {filteredTickets.map((ticket) => {
                        const status = statusConfig[ticket.status] || statusConfig.open;
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

            {/* Create ticket dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>{t("create.title")}</DialogTitle>
                        <DialogDescription>{t("create.description")}</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <Field label={t("create.subjectLabel")}>
                            <Input
                                placeholder={t("create.subjectPlaceholder")}
                                value={createSubject}
                                onChange={(e) => setCreateSubject(e.target.value)}
                            />
                        </Field>
                        <Field label={t("create.messageLabel")}>
                            <Textarea
                                placeholder={t("create.messagePlaceholder")}
                                value={createMessage}
                                onChange={(e) => setCreateMessage(e.target.value)}
                                rows={4}
                                className="resize-none"
                            />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setCreateOpen(false)}>{c("actions.cancel")}</Button>
                        <Button variant="primary" onClick={createTicket} disabled={!createSubject.trim()} loading={creating}>
                            {t("create.submit")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Ticket detail drawer */}
            <Drawer open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
                <DrawerContent side="right" style={{ "--wx-drawer-size": "512px" } as React.CSSProperties}>
                    <DrawerHeader className="gap-2">
                        <DrawerTitle className="truncate">{selectedTicket?.subject}</DrawerTitle>
                        {selectedTicket && (
                            <Badge tone={statusConfig[selectedTicket.status]?.tone} dot>
                                {statusConfig[selectedTicket.status]?.label}
                            </Badge>
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
                                        from={msg.authorRole === "user" ? "person" : "agent"}
                                        name={<>{msg.authorId?.name} {msg.authorRole === "admin" && "· Support"}</>}
                                        time={formatTime(msg.createdAt, timeFormat)}
                                    >
                                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                                    </Message>
                                ))}
                            </Transcript>
                        )}
                    </DrawerBody>
                    {selectedTicket && (selectedTicket.status === "open" || selectedTicket.status === "in_progress") && (
                        <DrawerFooter className="flex-col items-stretch">
                            <Textarea
                                placeholder={t("reply.placeholder")}
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
                                {t("reply.send")}
                            </Button>
                        </DrawerFooter>
                    )}
                </DrawerContent>
            </Drawer>
        </div>
    );
}
