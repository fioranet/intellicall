"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useTranslations } from "next-intl";
import {
    Alert,
    Badge,
    Button,
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
    Message,
    Spinner,
    Transcript,
} from "@wixzel/react";
import { Robot, Headphones, Microphone, MicrophoneSlash, PhoneSlash } from "@phosphor-icons/react";
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
        const viewport = transcriptRef.current;
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
        <Drawer open={open} onOpenChange={setOpen}>
            {!isControlled && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
            <DrawerContent side="right" style={{ "--wx-drawer-size": "960px" } as React.CSSProperties}>
                <DrawerHeader>
                    <DrawerTitle>
                        {t("test.title", { name: agent.name })}
                    </DrawerTitle>
                    <DrawerDescription>
                        {t("test.description")}
                    </DrawerDescription>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {engineLabel && <Badge>{engineLabel}</Badge>}
                        {voiceLabel && <Badge>{voiceLabel}</Badge>}
                        {languageLabel && <Badge>{languageLabel}</Badge>}
                    </div>
                </DrawerHeader>

                <DrawerBody className="flex flex-col gap-4 sm:flex-row sm:gap-6 sm:overflow-hidden">
                    {/* Controls */}
                    <div className="flex min-h-0 shrink-0 flex-col items-center justify-center gap-4 sm:w-64 sm:overflow-y-auto">
                        <div
                            className={`flex size-28 shrink-0 items-center justify-center rounded-full transition-colors ${isLive
                                ? "bg-accent-subtle text-accent-ink"
                                : "bg-bg-muted text-fg-muted"
                                }`}
                        >
                            {isBusy ? (
                                <Spinner size="xl" />
                            ) : isLive ? (
                                <Microphone
                                    className="size-9"
                                    style={!agentSpeaking && !muted ? { transform: `scale(${1 + Math.min(level, 1) * 0.35})` } : undefined}
                                />
                            ) : (
                                <Microphone className="size-9" />
                            )}
                        </div>

                        <div className="flex flex-col items-center gap-1 text-center">
                            {isLive ? (
                                <Badge tone="accent" dot pulse={agentSpeaking}>{statusLabel()}</Badge>
                            ) : (
                                <p className="text-body-sm font-medium">{statusLabel()}</p>
                            )}
                            {isLive && remainingMs !== null && (
                                <p className="text-caption tabular-nums text-fg-muted ltr-data">
                                    {t("test.remaining", { time: mmss(remainingMs) })}
                                </p>
                            )}
                        </div>

                        {!isLive ? (
                            <Button
                                variant="primary"
                                block
                                onClick={startSession}
                                disabled={starting || isBusy}
                                loading={starting || isBusy}
                                iconStart={<Microphone />}
                            >
                                {status === "ended" ? t("test.restart") : t("test.start")}
                            </Button>
                        ) : (
                            <div className="flex w-full flex-col gap-2">
                                <Button variant="secondary" block onClick={toggleMute} iconStart={muted ? <MicrophoneSlash /> : <Microphone />}>
                                    {muted ? t("test.unmute") : t("test.mute")}
                                </Button>
                                <Button variant="danger" block onClick={() => endSession("user")} iconStart={<PhoneSlash />}>
                                    {t("test.stop")}
                                </Button>
                            </div>
                        )}

                        <p className="flex items-center gap-1.5 text-center text-caption text-fg-muted">
                            <Headphones className="size-3.5 shrink-0" />
                            {t("test.headphonesHint")}
                        </p>
                    </div>

                    {/* Transcript */}
                    <div className="flex min-h-[260px] flex-1 flex-col rounded-lg bg-card sm:min-h-0">
                        {(error || missingKeys) && (
                            <div className="p-3">
                                <Alert
                                    tone="danger"
                                    action={missingKeys ? (
                                        <Button asChild variant="link" size="sm">
                                            <Link href="/settings">{t("drawer.configure")}</Link>
                                        </Button>
                                    ) : undefined}
                                >
                                    {error}
                                </Alert>
                            </div>
                        )}

                        <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto p-4">
                            {transcript.length === 0 ? (
                                <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center text-fg-subtle">
                                    <Robot className="size-10" />
                                    <p className="text-body-sm">{t("test.transcriptEmpty")}</p>
                                </div>
                            ) : (
                                <Transcript className="pb-2">
                                    {transcript.map((item, i) => (
                                        <Message
                                            key={i}
                                            from={item.role === "user" ? "person" : "agent"}
                                            name={item.role === "user" ? t("test.roleYou") : t("test.roleAgent")}
                                        >
                                            {item.content}
                                        </Message>
                                    ))}
                                </Transcript>
                            )}
                        </div>
                    </div>
                </DrawerBody>

                <DrawerFooter>
                    <Button variant="secondary" onClick={() => setOpen(false)}>{c("actions.close")}</Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
