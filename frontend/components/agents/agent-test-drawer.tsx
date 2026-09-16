"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    AlertCircle,
    Bot,
    Headphones,
    Loader2,
    Mic,
    MicOff,
    PhoneOff,
    User,
} from "lucide-react";
import {
    AgentTestSession,
    type EndReason,
    type SessionFailure,
    type SessionStatus,
    type TranscriptLine,
} from "@/lib/agent-test-session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

/** Derive the WebSocket origin from the API base URL. */
function wsUrlFor(path: string, ticket: string): string {
    const base = API_BASE_URL.replace(/\/api\/?$/, "");
    const origin = /^https?:\/\//.test(base)
        ? base.replace(/^http/, "ws")
        : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
    return `${origin}${path}?ticket=${encodeURIComponent(ticket)}`;
}

interface TestAgent {
    _id: string;
    name: string;
    useCustomVoice?: boolean;
    voiceEngine?: string;
}

interface AgentTestDrawerProps {
    agent: TestAgent;
    /** Engine label shown in the header, e.g. "Sarvam AI". */
    engineLabel?: string;
    /** Voice + language chips, already resolved by the caller. */
    voiceLabel?: string;
    languageLabel?: string;
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function AgentTestDrawer({
    agent,
    engineLabel,
    voiceLabel,
    languageLabel,
    trigger,
    open: controlledOpen,
    onOpenChange,
}: AgentTestDrawerProps) {
    const t = useTranslations("agents");
    const c = useTranslations("common");

    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = (value: boolean) => {
        if (isControlled) onOpenChange?.(value);
        else setInternalOpen(value);
    };

    const [status, setStatus] = useState<SessionStatus>("idle");
    const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [missingKeys, setMissingKeys] = useState<string[] | null>(null);
    const [agentSpeaking, setAgentSpeaking] = useState(false);
    const [muted, setMuted] = useState(false);
    const [level, setLevel] = useState(0);
    const [remainingMs, setRemainingMs] = useState<number | null>(null);
    const [starting, setStarting] = useState(false);

    const sessionRef = useRef<AgentTestSession | null>(null);
    const transcriptRef = useRef<HTMLDivElement | null>(null);
    const deadlineRef = useRef<number | null>(null);

    const isLive = status === "live";
    const isBusy = status === "requesting-mic" || status === "connecting";

    // Keep the newest line in view by scrolling ONLY the transcript's own viewport.
    // scrollIntoView() would walk up and scroll every scrollable ancestor with it,
    // including the page, which drags the drawer's header off the top of the screen.
    useEffect(() => {
        const viewport = transcriptRef.current?.querySelector<HTMLElement>(
            "[data-slot=scroll-area-viewport]"
        );
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }, [transcript.length]);

    // Countdown against the server-provided session cap.
    useEffect(() => {
        if (!isLive || deadlineRef.current === null) return;
        const tick = () => setRemainingMs(Math.max(0, (deadlineRef.current ?? 0) - Date.now()));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [isLive]);

    const endSession = useCallback(async (reason: EndReason = "user") => {
        await sessionRef.current?.stop(reason);
        sessionRef.current = null;
    }, []);

    // Releasing the mic matters more than anything else here — tear down on close,
    // unmount, and page hide.
    useEffect(() => {
        if (open) return;
        void endSession("user");
    }, [open, endSession]);

    // The drawer is fixed and full-screen, but the dashboard shell behind it is
    // slightly taller than the viewport (a 64px header offset), and the drawer
    // library only locks <body>. Without this the page scrolls underneath the
    // drawer while it is open, which reads as the whole test panel drifting.
    useEffect(() => {
        if (!open) return;
        const root = document.documentElement;
        const previous = root.style.overflow;
        root.style.overflow = "hidden";
        return () => { root.style.overflow = previous; };
    }, [open]);

    useEffect(() => {
        const bye = () => void endSession("user");
        window.addEventListener("pagehide", bye);
        return () => {
            window.removeEventListener("pagehide", bye);
            void endSession("user");
        };
    }, [endSession]);

    const failureMessage = (kind: SessionFailure): string => {
        switch (kind) {
            case "mic-denied": return t("test.micDenied");
            case "mic-unavailable": return t("test.micUnavailable");
            case "insecure-context": return t("test.insecureContext");
            case "unsupported-browser": return t("test.unsupportedBrowser");
            case "connection-failed": return t("test.connectionFailed");
        }
    };

    const startSession = async () => {
        setError(null);
        setMissingKeys(null);
        setTranscript([]);
        setStarting(true);

        try {
            const token = localStorage.getItem("token");
            const res = await axios.post(
                `${API_BASE_URL}/agents/${agent._id}/test-session`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const { ticket, wsPath, maxDurationMs } = res.data.data;

            const session = new AgentTestSession({
                onStatus: setStatus,
                onTranscript: (line) => setTranscript((prev) => [...prev, line]),
                onLevel: setLevel,
                onAgentSpeaking: setAgentSpeaking,
                onError: (message) => setError(message),
                onFailure: (kind) => setError(failureMessage(kind)),
                onEnded: (reason) => {
                    setAgentSpeaking(false);
                    setLevel(0);
                    if (reason === "cap") setError(t("test.timeLimit"));
                    if (reason === "disconnected") setError(t("test.disconnected"));
                },
            });
            sessionRef.current = session;
            deadlineRef.current = Date.now() + (maxDurationMs || 5 * 60 * 1000);
            await session.start(wsUrlFor(wsPath, ticket));
        } catch (err: any) {
            const data = err.response?.data;
            if (data?.code === "missing_keys") setMissingKeys(data.missing || []);
            setError(data?.message || t("test.connectionFailed"));
            setStatus("idle");
        } finally {
            setStarting(false);
        }
    };

    const toggleMute = () => {
        const next = !muted;
        setMuted(next);
        sessionRef.current?.setMuted(next);
    };

    const statusLabel = () => {
        if (status === "requesting-mic") return t("test.requestingMic");
        if (status === "connecting") return t("test.connecting");
        if (isLive) return agentSpeaking ? t("test.agentSpeaking") : t("test.listening");
        if (status === "ended") return t("test.ended");
        return t("test.idle");
    };

    const mmss = (ms: number) => {
        const total = Math.ceil(ms / 1000);
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    };

    return (
        <Drawer open={open} onOpenChange={setOpen} direction="bottom" shouldScaleBackground={false}>
            {!isControlled && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
            <DrawerContent fullScreen className="flex flex-col overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6 md:px-8">
                <DrawerHeader className="flex-shrink-0 border-b border-border/80 py-3 sm:py-4 text-start space-y-1 px-0">
                    <DrawerTitle className="text-lg font-semibold sm:text-xl tracking-tight">
                        {t("test.title", { name: agent.name })}
                    </DrawerTitle>
                    <DrawerDescription className="text-xs sm:text-sm text-muted-foreground">
                        {t("test.description")}
                    </DrawerDescription>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {engineLabel && <Badge variant="outline" className="text-[10px] font-medium">{engineLabel}</Badge>}
                        {voiceLabel && <Badge variant="outline" className="text-[10px] font-medium">{voiceLabel}</Badge>}
                        {languageLabel && <Badge variant="outline" className="text-[10px] font-medium">{languageLabel}</Badge>}
                    </div>
                </DrawerHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4 sm:flex-row sm:gap-6 sm:overflow-hidden">
                    {/* Controls */}
                    <div className="flex min-h-0 shrink-0 flex-col items-center justify-center gap-4 sm:w-64 sm:overflow-y-auto">
                        <div
                            className={`flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${isLive
                                ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                                : "border-border bg-muted/40"
                                }`}
                        >
                            {isBusy ? (
                                <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" />
                            ) : isLive ? (
                                <Mic
                                    className={`h-9 w-9 text-primary ${agentSpeaking ? "animate-pulse" : ""}`}
                                    style={!agentSpeaking && !muted ? { transform: `scale(${1 + Math.min(level, 1) * 0.35})` } : undefined}
                                />
                            ) : (
                                <Mic className="h-9 w-9 text-muted-foreground" />
                            )}
                        </div>

                        <div className="text-center">
                            <p className="text-sm font-medium">{statusLabel()}</p>
                            {isLive && remainingMs !== null && (
                                <p className="text-[11px] text-muted-foreground ltr-data">
                                    {t("test.remaining", { time: mmss(remainingMs) })}
                                </p>
                            )}
                        </div>

                        {!isLive ? (
                            <Button onClick={startSession} disabled={starting || isBusy} className="w-full">
                                {starting || isBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Mic className="me-2 h-4 w-4" />}
                                {status === "ended" ? t("test.restart") : t("test.start")}
                            </Button>
                        ) : (
                            <div className="flex w-full flex-col gap-2">
                                <Button variant="outline" onClick={toggleMute} className="w-full">
                                    {muted ? <MicOff className="me-2 h-4 w-4" /> : <Mic className="me-2 h-4 w-4" />}
                                    {muted ? t("test.unmute") : t("test.mute")}
                                </Button>
                                <Button variant="destructive" onClick={() => endSession("user")} className="w-full">
                                    <PhoneOff className="me-2 h-4 w-4" />
                                    {t("test.stop")}
                                </Button>
                            </div>
                        )}

                        <p className="flex items-center gap-1.5 text-center text-[11px] leading-snug text-muted-foreground">
                            <Headphones className="h-3.5 w-3.5 shrink-0" />
                            {t("test.headphonesHint")}
                        </p>
                    </div>

                    {/* Transcript */}
                    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/80 bg-muted/20">
                        {(error || missingKeys) && (
                            <div className="p-3">
                                <Alert variant="destructive" className="rounded-lg py-2">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <AlertDescription className="text-sm flex flex-wrap items-center justify-between gap-2 w-full">
                                        <span>{error}</span>
                                        {missingKeys && (
                                            <Link href="/settings" className="shrink-0 font-bold underline">
                                                {t("drawer.configure")}
                                            </Link>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            </div>
                        )}

                        <ScrollArea ref={transcriptRef} className="min-h-0 flex-1 p-4">
                            {transcript.length === 0 ? (
                                <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center text-muted-foreground opacity-60">
                                    <Bot className="h-10 w-10" />
                                    <p className="text-sm">{t("test.transcriptEmpty")}</p>
                                </div>
                            ) : (
                                <div className="space-y-4 pb-2">
                                    {transcript.map((item, i) => (
                                        <div key={i} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                                            <div className={`flex max-w-[85%] flex-col ${item.role === "user" ? "items-end" : "items-start"}`}>
                                                <div className="flex items-center gap-1.5 px-1 opacity-70">
                                                    {item.role === "user" ? (
                                                        <>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">{t("test.roleYou")}</span>
                                                            <User className="h-3 w-3" />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Bot className="h-3 w-3" />
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">{t("test.roleAgent")}</span>
                                                        </>
                                                    )}
                                                </div>
                                                <div
                                                    className={`rounded-xl p-3 text-sm ${item.role === "user"
                                                        ? "bg-primary text-primary-foreground rounded-se-none"
                                                        : "bg-background border border-border text-foreground rounded-ss-none"
                                                        }`}
                                                >
                                                    {item.content}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </div>

                <div className="flex flex-shrink-0 justify-end border-t border-border/80 pt-3">
                    <Button variant="outline" onClick={() => setOpen(false)}>{c("actions.close")}</Button>
                </div>
            </DrawerContent>
        </Drawer>
    );
}
