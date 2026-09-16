import { cn } from "@/lib/utils";
import { MockFrame } from "./mock-frame";

const ROWS: { name: string; status: string; tone: "brand" | "secondary" | "outline"; score: number }[] = [
    { name: "Priya Sharma", status: "Qualified", tone: "brand", score: 92 },
    { name: "Marcus Lee", status: "Voicemail", tone: "secondary", score: 48 },
    { name: "Anita Desai", status: "Qualified", tone: "brand", score: 87 },
    { name: "Tom Fischer", status: "No answer", tone: "outline", score: 21 },
];

function StatusPill({ status, tone }: { status: string; tone: "brand" | "secondary" | "outline" }) {
    return (
        <span
            className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                tone === "brand" && "bg-brand/15 text-brand",
                tone === "secondary" && "bg-muted text-muted-foreground",
                tone === "outline" && "border border-border text-muted-foreground"
            )}
        >
            {status}
        </span>
    );
}

export function CampaignMock() {
    return (
        <MockFrame title="Outbound Campaign">
            <div className="space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-foreground">Q3 Renewal Outreach</span>
                        <span className="text-muted-foreground">428 / 1,000 called</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-brand" style={{ width: "43%" }} />
                    </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-border">
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Lead</span>
                        <span>Status</span>
                        <span className="text-right">Score</span>
                    </div>
                    {ROWS.map((r, i) => (
                        <div
                            key={r.name}
                            className={cn(
                                "grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm",
                                i !== ROWS.length - 1 && "border-b border-border"
                            )}
                        >
                            <span className="truncate font-medium text-foreground">{r.name}</span>
                            <StatusPill status={r.status} tone={r.tone} />
                            <span className="w-8 text-right font-semibold tabular-nums text-foreground">{r.score}</span>
                        </div>
                    ))}
                </div>
            </div>
        </MockFrame>
    );
}
