import { Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { MockFrame } from "./mock-frame";

function EngineRow({
    letter,
    name,
    meta,
    badge,
    selected,
}: {
    letter: string;
    name: string;
    meta: string;
    badge?: string;
    selected?: boolean;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                selected ? "border-brand/40 bg-brand/10" : "border-transparent"
            )}
        >
            <div
                className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-bold",
                    selected ? "border-brand/40 bg-brand text-white" : "border-border bg-background text-muted-foreground"
                )}
            >
                {letter}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{name}</span>
                    {badge && (
                        <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
                            {badge}
                        </span>
                    )}
                </div>
                <div className="truncate text-xs text-muted-foreground">{meta}</div>
            </div>
            {selected && <Check className="h-4 w-4 shrink-0 text-brand" />}
        </div>
    );
}

export function AgentEditorMock() {
    return (
        <MockFrame title="Agent · Voice">
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Zap className="h-3.5 w-3.5" /> Voice Engine
                </div>
                <div className="space-y-1 rounded-xl border border-border bg-background p-1.5">
                    <EngineRow letter="C" name="Classic pipeline" meta="Deepgram + OpenRouter + ElevenLabs" selected />
                    <EngineRow letter="D" name="Deepgram Voice Agent" meta="Lowest latency · managed LLM" />
                    <EngineRow letter="G" name="Gemini Live" meta="One Google model · 97 languages" badge="New" />
                    <EngineRow letter="S" name="Sarvam AI" meta="Indian languages · self-contained" />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">Language</div>
                        <div className="flex flex-wrap gap-1.5">
                            {["English", "Spanish", "French"].map((l) => (
                                <span key={l} className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground">
                                    {l}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">Voice</div>
                        <div className="flex items-center justify-between rounded-md border border-border bg-muted px-2.5 py-1.5">
                            <span className="text-xs font-semibold text-foreground">Rachel</span>
                            <span className="rounded-full border border-brand/40 px-2 py-0.5 text-[10px] font-semibold text-brand">▶ Test</span>
                        </div>
                    </div>
                </div>
            </div>
        </MockFrame>
    );
}
