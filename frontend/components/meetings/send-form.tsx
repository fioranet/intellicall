"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import axios from "axios";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import {
    Button,
    Field,
    Input,
    Section,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tabs,
    TabsList,
    TabsTrigger,
    toast,
} from "@wixzel/react";
import { API_BASE_URL, apiError, authHeaders, platformOf, type AgentRef, type Meeting, type RespondWhen } from "./types";

const DEFAULT_MINUTES = 60;
const MIN_MINUTES = 1;
const MAX_MINUTES = 240;
const MAX_WAKE_NAMES = 5;

interface SendFormProps {
    agents: AgentRef[];
    onSent: (meeting: Meeting) => void;
}

/** Send an agent to a meeting: which agent, which link, what it is called and when it speaks. */
export function SendForm({ agents, onSent }: SendFormProps) {
    const t = useTranslations("meetings");
    const [agentId, setAgentId] = useState("");
    const [meetingUrl, setMeetingUrl] = useState("");
    const [botName, setBotName] = useState("");
    const [respondWhen, setRespondWhen] = useState<RespondWhen>("addressed");
    const [wakeNamesText, setWakeNamesText] = useState("");
    const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES));
    const [busy, setBusy] = useState(false);
    const [touched, setTouched] = useState(false);

    // The Select may still say nothing while agents load, so the choice falls back to the first agent.
    const chosenAgent = agents.find((a) => a._id === agentId) ?? agents[0];

    const wakeNames = useMemo(
        () => [...new Set(wakeNamesText.split(",").map((s) => s.trim()).filter(Boolean))],
        [wakeNamesText],
    );
    const wakeNamesError = wakeNames.length > MAX_WAKE_NAMES
        ? t("send.wakeNamesTooMany", { max: MAX_WAKE_NAMES })
        : wakeNames.some((n) => n.length < 2 || n.length > 60)
            ? t("send.wakeNamesTooShort")
            : undefined;

    const minutesNumber = Number(minutes);
    const minutesError = !Number.isInteger(minutesNumber) || minutesNumber < MIN_MINUTES || minutesNumber > MAX_MINUTES
        ? t("send.maxDurationInvalid", { min: MIN_MINUTES, max: MAX_MINUTES })
        : undefined;

    const urlError = touched && meetingUrl.trim() && !platformOf(meetingUrl) ? t("send.meetingUrlInvalid") : undefined;

    const canSend = Boolean(chosenAgent) && !busy && !wakeNamesError && !minutesError && !urlError;

    const failMessage = (err: unknown, fallback: string) => {
        const { code, message, missing } = apiError(err);
        if (code && t.has(`errors.${code}`)) return t(`errors.${code}`, { missing: (missing ?? []).join(", ") });
        return message || fallback;
    };

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!chosenAgent || !platformOf(meetingUrl) || wakeNamesError || minutesError) return;
        setBusy(true);
        try {
            const body: Record<string, unknown> = {
                agentId: chosenAgent._id,
                meetingUrl: meetingUrl.trim(),
                respondWhen,
                maxDurationSeconds: minutesNumber * 60,
            };
            if (botName.trim()) body.botName = botName.trim();
            if (wakeNames.length) body.wakeNames = wakeNames;
            const res = await axios.post(`${API_BASE_URL}/meetings`, body, { headers: authHeaders() });
            const meeting = res.data?.data?.meeting as Meeting;
            toast.success(t("send.toast.sent", { name: meeting.botName || chosenAgent.name }));
            setMeetingUrl("");
            setTouched(false);
            onSent(meeting);
        } catch (err) {
            toast.error(failMessage(err, t("send.toast.failed")));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Section icon={<PaperPlaneTilt />} title={t("send.heading")} description={t("send.description")}>
            <form onSubmit={send} className="flex flex-col gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={t("send.agent")} required hint={agents.length === 0 ? t("send.noAgents") : undefined}>
                        <Select value={chosenAgent?._id ?? ""} onValueChange={(v) => { if (v) setAgentId(v); }} disabled={busy || agents.length === 0}>
                            <SelectTrigger className="w-full" aria-label={t("send.agent")}>
                                <SelectValue placeholder={t("send.agentPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                                {agents.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t("send.botName")} hint={t("send.botNameHint")}>
                        <Input
                            value={botName}
                            maxLength={100}
                            placeholder={chosenAgent?.name ?? ""}
                            disabled={busy}
                            onChange={(e) => setBotName(e.target.value)}
                        />
                    </Field>
                </div>

                <Field label={t("send.meetingUrl")} required hint={t("send.meetingUrlHint")} error={urlError}>
                    <Input
                        type="url"
                        dir="ltr"
                        className="ltr-data"
                        value={meetingUrl}
                        placeholder="https://meet.google.com/abc-defg-hij"
                        required
                        disabled={busy}
                        onChange={(e) => setMeetingUrl(e.target.value)}
                        onBlur={() => setTouched(true)}
                    />
                </Field>

                <div>
                    <p className="mb-2 text-body-sm font-medium text-fg">{t("send.speaks")}</p>
                    <Tabs variant="segment" value={respondWhen} onValueChange={(v) => setRespondWhen(v as RespondWhen)}>
                        <TabsList aria-label={t("send.speaks")}>
                            <TabsTrigger value="addressed">{t("send.speaksAddressed")}</TabsTrigger>
                            <TabsTrigger value="always">{t("send.speaksAlways")}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <p className="mt-2 text-caption text-fg-subtle">
                        {respondWhen === "addressed" ? t("send.addressedLine") : t("send.alwaysLine")}
                    </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={t("send.wakeNames")} labelAside={t("send.optional")} hint={t("send.wakeNamesHint", { max: MAX_WAKE_NAMES })} error={wakeNamesError}>
                        <Input
                            value={wakeNamesText}
                            placeholder={t("send.wakeNamesPlaceholder")}
                            disabled={busy}
                            onChange={(e) => setWakeNamesText(e.target.value)}
                        />
                    </Field>
                    <Field label={t("send.maxDuration")} hint={t("send.maxDurationHint", { min: MIN_MINUTES, max: MAX_MINUTES })} error={minutesError}>
                        <Input
                            type="number"
                            inputMode="numeric"
                            min={MIN_MINUTES}
                            max={MAX_MINUTES}
                            step={1}
                            value={minutes}
                            trailing={<span className="text-caption text-fg-muted">{t("send.minutes")}</span>}
                            disabled={busy}
                            onChange={(e) => setMinutes(e.target.value)}
                        />
                    </Field>
                </div>

                <div>
                    <Button type="submit" variant="primary" loading={busy} disabled={!canSend} iconStart={<PaperPlaneTilt />}>
                        {t("send.submit")}
                    </Button>
                </div>
            </form>
        </Section>
    );
}
