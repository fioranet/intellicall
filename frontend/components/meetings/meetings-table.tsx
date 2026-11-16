"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import axios from "axios";
import { GoogleLogo, MicrosoftTeamsLogo, VideoCamera, VideoConference } from "@phosphor-icons/react";
import {
    Badge,
    type BadgeProps,
    Button,
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
    EmptyState,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    toast,
    useConfirm,
} from "@wixzel/react";
import { API_BASE_URL, apiError, authHeaders, isLive, type Meeting, type MeetingPlatform, type MeetingStatus } from "./types";

/** Each status as a Badge. A bot on its way in or in the meeting is live, so it pulses. */
const STATUS_TONES: Record<MeetingStatus, { tone: BadgeProps["tone"]; pulse?: boolean }> = {
    joining: { tone: "warning", pulse: true },
    waiting_room: { tone: "warning" },
    in_meeting: { tone: "success", pulse: true },
    ended: { tone: "neutral" },
    failed: { tone: "danger" },
};

const PLATFORM_ICONS: Record<MeetingPlatform, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
    zoom: VideoCamera,
    google_meet: GoogleLogo,
    teams: MicrosoftTeamsLogo,
};

/** 65 → "1:05", 3725 → "1:02:05". Digits are the same in every language. */
function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const two = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

interface MeetingsTableProps {
    /** null while loading. */
    meetings: Meeting[] | null;
    connected: boolean;
    onChanged: (meeting: Meeting) => void;
}

/** The last meetings bots were sent to, with a way to call a live one out. */
export function MeetingsTable({ meetings, connected, onChanged }: MeetingsTableProps) {
    const t = useTranslations("meetings");
    const locale = useLocale();
    const confirm = useConfirm();
    const [leaving, setLeaving] = useState<string | null>(null);

    const when = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
    const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : null);

    const leave = async (m: Meeting) => {
        const name = m.botName || m.agentName || t("recent.agentFallback");
        const ok = await confirm({
            title: t("recent.leaveTitle", { name }),
            description: t("recent.leaveDescription"),
            confirmLabel: t("recent.leaveConfirm"),
            tone: "danger",
        });
        if (!ok) return;
        setLeaving(m._id);
        try {
            const res = await axios.post(`${API_BASE_URL}/meetings/${encodeURIComponent(m._id)}/leave`, {}, { headers: authHeaders() });
            const updated = res.data?.data?.meeting as Meeting | undefined;
            if (updated) onChanged(updated);
            toast.success(t("recent.leftToast", { name }));
        } catch (err) {
            toast.error(apiError(err).message || t("recent.leaveFailed"));
        } finally {
            setLeaving(null);
        }
    };

    /** The status pill: a bot called off from here is "Called off", not "Did not join". */
    const statusBadge = (m: Meeting) => {
        if (m.status === "failed" && m.endReason === "client") return <Badge tone="neutral" dot>{t("recent.status.calledOff")}</Badge>;
        const s = STATUS_TONES[m.status];
        return <Badge tone={s.tone} dot pulse={s.pulse}>{t(`recent.status.${m.status}`)}</Badge>;
    };

    /** Why it ended, in the reader's words when the code is a known one; the error itself when there is one. */
    const outcome = (m: Meeting) => {
        if (m.error) return <span className="text-danger-ink line-clamp-3 break-words" title={m.error}>{m.error}</span>;
        if (!m.endReason) return <span className="text-fg-subtle">—</span>;
        if (t.has(`recent.reason.${m.endReason}`)) return t(`recent.reason.${m.endReason}`);
        return <span className="ltr-data font-mono text-caption">{m.endReason}</span>;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <VideoConference className="size-5 text-accent-ink" aria-hidden />
                    {t("recent.heading")}
                </CardTitle>
                <CardDescription>{t("recent.description", { count: 20 })}</CardDescription>
            </CardHeader>

            {meetings === null && (
                <div className="flex flex-col gap-2 p-5 pt-0">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-md" />)}
                </div>
            )}

            {meetings?.length === 0 && (
                <EmptyState
                    icon={<VideoConference />}
                    title={t("recent.emptyTitle")}
                    description={connected ? t("recent.emptyDescription") : t("recent.emptyNotConnected")}
                />
            )}

            {meetings && meetings.length > 0 && (
                <Table frameClassName="mt-3">
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("recent.table.platform")}</TableHead>
                            <TableHead>{t("recent.table.agent")}</TableHead>
                            <TableHead>{t("recent.table.botName")}</TableHead>
                            <TableHead>{t("recent.table.status")}</TableHead>
                            <TableHead>{t("recent.table.joined")}</TableHead>
                            <TableHead>{t("recent.table.duration")}</TableHead>
                            <TableHead>{t("recent.table.outcome")}</TableHead>
                            <TableHead align="end">
                                <span className="sr-only">{t("recent.table.actions")}</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {meetings.map((m) => {
                            const Icon = m.platform ? PLATFORM_ICONS[m.platform] : VideoConference;
                            const joined = fmt(m.joinedAt);
                            const sent = fmt(m.createdAt);
                            return (
                                <TableRow key={m._id}>
                                    <TableCell className="py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                                                <Icon className="size-4" aria-hidden />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="font-medium">{m.platform ? t(`platform.${m.platform}`) : "—"}</p>
                                                {m.meetingUrl && (
                                                    <a
                                                        href={m.meetingUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title={m.meetingUrl}
                                                        className="ltr-data block max-w-[220px] truncate text-caption text-fg-muted hover:underline"
                                                    >
                                                        {m.meetingUrl.replace(/^https:\/\//, "")}
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">{m.agentName ?? <span className="text-fg-subtle">{t("recent.agentFallback")}</span>}</TableCell>
                                    <TableCell className="py-3">
                                        {m.botName ?? "—"}
                                        {m.signedIn && <span className="ms-2 text-caption text-fg-subtle">{t("recent.signedIn")}</span>}
                                    </TableCell>
                                    <TableCell className="py-3">{statusBadge(m)}</TableCell>
                                    <TableCell className="py-3 text-fg-muted tabular-nums">
                                        {joined ?? (sent ? <span className="text-caption text-fg-subtle">{t("recent.table.sentAt", { when: sent })}</span> : "—")}
                                    </TableCell>
                                    <TableCell className="py-3 text-fg-muted tabular-nums">
                                        {m.durationSeconds > 0 ? <span className="ltr-data">{formatDuration(m.durationSeconds)}</span> : "—"}
                                    </TableCell>
                                    <TableCell className="py-3 max-w-[260px] whitespace-normal text-body-sm text-fg-muted">{outcome(m)}</TableCell>
                                    <TableCell align="end" className="py-3">
                                        {isLive(m) && (
                                            <Button size="sm" onClick={() => void leave(m)} loading={leaving === m._id}>
                                                {t("recent.leave")}
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
        </Card>
    );
}
