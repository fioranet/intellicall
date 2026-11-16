import { Badge, Message, Transcript } from "@wixzel/react";
import { PhoneIncomingIcon } from "@wixzel/react/icons";
import { MockFrame } from "./mock-frame";

const BARS = [0.4, 0.7, 1, 0.6, 0.85, 0.5, 0.95, 0.65, 0.35, 0.8, 0.55, 1, 0.45, 0.75, 0.6, 0.9, 0.5, 0.7, 0.4, 0.85];

export function InboundCallMock() {
    return (
        <MockFrame
            title="Incoming Call"
            toolbar={
                <div className="flex items-center gap-1.5">
                    <Badge>SIP Trunk</Badge>
                    <Badge>Twilio</Badge>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-ink">
                        <PhoneIncomingIcon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="ltr-data text-body-sm font-semibold text-fg">+1 (415) 555‑0142</div>
                        <div className="text-caption text-fg-muted">Answered by AI receptionist</div>
                    </div>
                    <Badge tone="accent" pulse>
                        00:47
                    </Badge>
                </div>

                <div className="flex h-12 items-center justify-center gap-1 rounded-md bg-surface px-4">
                    {BARS.map((h, i) => (
                        <span
                            key={i}
                            className="landing-wave-bar w-1 rounded-full bg-accent-edge"
                            style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${i * 70}ms` }}
                        />
                    ))}
                </div>

                <Transcript>
                    <Message from="person" name="Caller">Hi, are you open this Saturday?</Message>
                    <Message from="agent" name="Agent">Yes! We&apos;re open 9 to 5. Want me to book you a slot?</Message>
                </Transcript>
            </div>
        </MockFrame>
    );
}
