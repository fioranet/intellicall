import { Badge, Progress } from "@wixzel/react";
import { MockFrame } from "./mock-frame";

type Tone = "accent" | "neutral" | "outline";

const ROWS: { name: string; status: string; tone: Tone; score: number }[] = [
    { name: "Priya Sharma", status: "Qualified", tone: "accent", score: 92 },
    { name: "Marcus Lee", status: "Voicemail", tone: "neutral", score: 48 },
    { name: "Anita Desai", status: "Qualified", tone: "accent", score: 87 },
    { name: "Tom Fischer", status: "No answer", tone: "outline", score: 21 },
];

function StatusBadge({ status, tone }: { status: string; tone: Tone }) {
    if (tone === "outline") return <Badge appearance="outline">{status}</Badge>;
    return <Badge tone={tone}>{status}</Badge>;
}

export function CampaignMock() {
    return (
        <MockFrame title="Outbound Campaign">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3 text-body-sm">
                        <span className="font-semibold text-fg">Q3 Renewal Outreach</span>
                        <span className="tabular-nums text-fg-muted">428 / 1,000 called</span>
                    </div>
                    <Progress value={428} max={1000} />
                </div>

                <div className="overflow-hidden rounded-md bg-surface">
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border px-3 py-2 text-caption font-medium text-fg-subtle">
                        <span>Lead</span>
                        <span>Status</span>
                        <span className="w-8 text-end">Score</span>
                    </div>
                    <div className="divide-y divide-border">
                        {ROWS.map((r) => (
                            <div key={r.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-body-sm">
                                <span className="truncate font-medium text-fg">{r.name}</span>
                                <StatusBadge status={r.status} tone={r.tone} />
                                <span className="w-8 text-end font-semibold tabular-nums text-fg">{r.score}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </MockFrame>
    );
}
