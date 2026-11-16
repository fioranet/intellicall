"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import axios from "axios";
import { PageHeader, Skeleton, toast } from "@wixzel/react";
import { AttendeeCard } from "@/components/meetings/attendee-card";
import { SendForm } from "@/components/meetings/send-form";
import { MeetingsTable } from "@/components/meetings/meetings-table";
import { API_BASE_URL, apiError, authHeaders, isLive, type AgentRef, type Meeting, type MeetingIntegration } from "@/components/meetings/types";

const DEFAULT_HOSTED_URL = "https://app.attendee.dev";
const RECENT_LIMIT = 20;
const POLL_MS = 5000;

/**
 * Meetings: agents join Zoom, Google Meet and Teams meetings through the
 * owner's own Attendee account. The page stores that account, sends an agent
 * to a meeting, and lists recent meetings with a way to call a bot out.
 */
export default function MeetingsPage() {
    const t = useTranslations("meetings");
    // undefined while loading, null when no account is connected.
    const [integration, setIntegration] = useState<MeetingIntegration | null | undefined>(undefined);
    const [hostedUrl, setHostedUrl] = useState(DEFAULT_HOSTED_URL);
    const [agents, setAgents] = useState<AgentRef[]>([]);
    const [meetings, setMeetings] = useState<Meeting[] | null>(null);

    const loadMeetings = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/meetings`, { params: { limit: RECENT_LIMIT }, headers: authHeaders() });
            if (res.data?.status === "success") setMeetings(res.data.data.meetings as Meeting[]);
        } catch {
            // A missed refresh keeps the rows it had; the next tick tries again.
            setMeetings((list) => list ?? []);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const headers = authHeaders();
        void (async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/meetings/integration`, { headers });
                if (cancelled) return;
                setIntegration((res.data?.data?.integration as MeetingIntegration | null) ?? null);
                if (res.data?.data?.hostedUrl) setHostedUrl(res.data.data.hostedUrl as string);
            } catch (err) {
                if (cancelled) return;
                setIntegration(null);
                toast.error(apiError(err).message || t("loadFailed"));
            }
            // Agents only fill the form's choice; the page still works without them.
            try {
                const res = await axios.get(`${API_BASE_URL}/agents`, { headers });
                if (!cancelled && res.data?.status === "success") setAgents(res.data.data.agents as AgentRef[]);
            } catch {
                /* the form says there are no agents */
            }
            if (!cancelled) await loadMeetings();
        })();
        return () => {
            cancelled = true;
        };
    }, [loadMeetings, t]);

    // While a bot is on its way in or in the meeting, keep its row fresh.
    const anyLive = useMemo(() => (meetings ?? []).some(isLive), [meetings]);
    useEffect(() => {
        if (!anyLive) return;
        const timer = setInterval(() => void loadMeetings(), POLL_MS);
        return () => clearInterval(timer);
    }, [anyLive, loadMeetings]);

    /** A meeting the server just returned replaces its row, or goes on top when it is new. */
    const upsertMeeting = (meeting: Meeting) => {
        setMeetings((list) => {
            const current = list ?? [];
            return current.some((m) => m._id === meeting._id)
                ? current.map((m) => (m._id === meeting._id ? meeting : m))
                : [meeting, ...current].slice(0, RECENT_LIMIT);
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} description={t("description")} info={t("info")} />

            {integration === undefined && <Skeleton className="h-64 rounded-lg" />}

            {integration !== undefined && (
                <AttendeeCard
                    integration={integration}
                    hostedUrl={hostedUrl}
                    onSaved={setIntegration}
                    onDisconnected={() => setIntegration(null)}
                />
            )}

            {integration && <SendForm agents={agents} onSent={upsertMeeting} />}

            <MeetingsTable meetings={meetings} connected={Boolean(integration)} onChanged={upsertMeeting} />
        </div>
    );
}
