"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useCallback } from "react";
import {
    HeadphonesIcon,
    Plus,
    Loader2,
    MessageSquare,
    Send,
    Clock,
    User,
    ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
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
import axios from "axios";
import { toast } from "sonner";
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

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
    open: { label: "Open", variant: "secondary", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20" },
    in_progress: { label: "In Progress", variant: "default", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" },
    resolved: { label: "Resolved", variant: "outline", className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20" },
    closed: { label: "Closed", variant: "secondary", className: "bg-muted text-muted-foreground" },
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
            <div className="flex flex-col gap-1">
                <h2 className="text-3xl font-bold tracking-tight">{t("title")}</h2>
                <p className="text-muted-foreground">{t("subtitle")}</p>
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder={t("filters.status")} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("filters.all")}</SelectItem>
                        <SelectItem value="open">{t("filters.open")}</SelectItem>
                        <SelectItem value="in_progress">{t("filters.inProgress")}</SelectItem>
                        <SelectItem value="resolved">{t("filters.resolved")}</SelectItem>
                        <SelectItem value="closed">{t("filters.closed")}</SelectItem>
                    </SelectContent>
                </Select>
                <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 me-2" />
                    {t("newTicket")}
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : filteredTickets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                            <HeadphonesIcon className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="font-medium text-foreground">{t("empty.title")}</p>
                            <p className="text-sm text-muted-foreground mt-1">{t("empty.description")}</p>
                            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                                <Plus className="h-4 w-4 me-2" />
                                {t("newTicket")}
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {filteredTickets.map((ticket) => {
                                const status = statusConfig[ticket.status] || statusConfig.open;
                                return (
                                    <button
                                        key={ticket._id}
                                        type="button"
                                        className={cn(
                                            "w-full flex items-center gap-4 p-4 text-start hover:bg-muted/50 transition-colors",
                                            selectedTicket?._id === ticket._id && "bg-muted/50"
                                        )}
                                        onClick={() => openDetail(ticket)}
                                    >
                                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                            <MessageSquare className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold truncate">{ticket.subject}</p>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                <Clock className="h-3 w-3" />
                                                {formatTime(ticket.updatedAt, timeFormat)}
                                            </p>
                                        </div>
                                        <Badge variant={status.variant} className={cn("shrink-0", status.className)}>
                                            {status.label}
                                        </Badge>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create ticket dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t("create.title")}</DialogTitle>
                        <DialogDescription>{t("create.description")}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t("create.subjectLabel")}</label>
                            <Input
                                placeholder={t("create.subjectPlaceholder")}
                                value={createSubject}
                                onChange={(e) => setCreateSubject(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t("create.messageLabel")}</label>
                            <Textarea
                                placeholder={t("create.messagePlaceholder")}
                                value={createMessage}
                                onChange={(e) => setCreateMessage(e.target.value)}
                                rows={4}
                                className="resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>{c("actions.cancel")}</Button>
                        <Button onClick={createTicket} disabled={creating || !createSubject.trim()}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
                            {t("create.submit")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Ticket detail sheet */}
            <Sheet open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
                <SheetContent className="flex flex-col w-full sm:max-w-lg overflow-hidden p-0">
                    <SheetHeader className="p-4 border-b shrink-0">
                        <SheetTitle className="text-start truncate pe-8">{selectedTicket?.subject}</SheetTitle>
                        <div className="text-start flex items-center gap-2 text-muted-foreground text-sm">
                            {selectedTicket && (
                                <Badge
                                    variant={statusConfig[selectedTicket.status]?.variant}
                                    className={statusConfig[selectedTicket.status]?.className}
                                >
                                    {statusConfig[selectedTicket.status]?.label}
                                </Badge>
                            )}
                        </div>
                    </SheetHeader>
                    <ScrollArea className="flex-1 p-4">
                        {messagesLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {messages.map((msg) => (
                                    <div
                                        key={msg._id}
                                        className={cn(
                                            "flex gap-3",
                                            msg.authorRole === "user" && "flex-row-reverse"
                                        )}
                                    >
                                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                            {msg.authorRole === "admin" ? (
                                                <ShieldCheck className="h-4 w-4 text-primary" />
                                            ) : (
                                                <User className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div
                                            className={cn(
                                                "rounded-lg px-3 py-2 max-w-[85%]",
                                                msg.authorRole === "admin"
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-muted"
                                            )}
                                        >
                                            <p className="text-xs font-medium opacity-90">
                                                {msg.authorId?.name} {msg.authorRole === "admin" && "· Support"}
                                            </p>
                                            <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{msg.body}</p>
                                            <p className="text-[10px] opacity-70 mt-1">
                                                {formatTime(msg.createdAt, timeFormat)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                    {selectedTicket && (selectedTicket.status === "open" || selectedTicket.status === "in_progress") && (
                        <div className="p-4 border-t shrink-0 space-y-2">
                            <Textarea
                                placeholder={t("reply.placeholder")}
                                value={replyBody}
                                onChange={(e) => setReplyBody(e.target.value)}
                                rows={3}
                                className="resize-none"
                            />
                            <Button onClick={sendReply} disabled={sending || !replyBody.trim()} className="w-full">
                                {sending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Send className="h-4 w-4 me-2" />}
                                {t("reply.send")}
                            </Button>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
