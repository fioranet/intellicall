import { Badge, Button, Chip, Chips, Input, RadioCard, RadioCards } from "@wixzel/react";
import { LightningIcon, PlayIcon } from "@wixzel/react/icons";
import { MockFrame } from "./mock-frame";

const ENGINES = [
    { value: "classic", letter: "C", name: "Classic pipeline", meta: "Deepgram + OpenRouter + ElevenLabs" },
    { value: "deepgram", letter: "D", name: "Deepgram Voice Agent", meta: "Lowest latency · managed LLM" },
    { value: "gemini", letter: "G", name: "Gemini Live", meta: "One Google model · 97 languages", badge: "New" },
    { value: "sarvam", letter: "S", name: "Sarvam AI", meta: "Indian languages · self-contained" },
];

export function AgentEditorMock() {
    return (
        <MockFrame title="Agent · Voice">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-caption font-medium text-fg-muted">
                    <LightningIcon className="size-3.5" /> Voice Engine
                </div>
                <RadioCards defaultValue="classic" columns={2}>
                    {ENGINES.map((e) => (
                        <RadioCard
                            key={e.value}
                            value={e.value}
                            icon={<span className="text-caption font-bold">{e.letter}</span>}
                            title={e.name}
                            description={e.meta}
                            aside={e.badge ? <Badge tone="accent" size="sm">{e.badge}</Badge> : undefined}
                        />
                    ))}
                </RadioCards>

                <div className="grid gap-4 pt-1 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <div className="text-caption font-medium text-fg-muted">Language</div>
                        <Chips type="single" defaultValue="English">
                            {["English", "Spanish", "French"].map((l) => (
                                <Chip key={l} value={l}>
                                    {l}
                                </Chip>
                            ))}
                        </Chips>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <div className="text-caption font-medium text-fg-muted">Voice</div>
                        <Input
                            size="sm"
                            readOnly
                            defaultValue="Rachel"
                            aria-label="Voice"
                            trailing={
                                <Button size="xs" variant="secondary" iconStart={<PlayIcon />}>
                                    Test
                                </Button>
                            }
                        />
                    </div>
                </div>
            </div>
        </MockFrame>
    );
}
