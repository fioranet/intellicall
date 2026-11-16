import { Alert, Chip, Chips } from "@wixzel/react";
import { BookOpenIcon, CheckCircleIcon } from "@wixzel/react/icons";
import { MockFrame } from "./mock-frame";

const SLOTS = [
    { time: "10:00", taken: false },
    { time: "11:30", taken: true },
    { time: "1:00", taken: false },
    { time: "2:30", taken: false },
    { time: "4:00", taken: true },
    { time: "5:00", taken: false },
];

export function BookingMock() {
    return (
        <MockFrame title="Appointments · Knowledge Base">
            <div className="flex flex-col gap-4">
                <div className="text-caption font-medium text-fg-muted">Available · Thursday, Jul 10</div>
                {/* Taken slots are disabled; the booked one is inked, like any chosen chip. */}
                <Chips type="single" defaultValue="1:00" className="grid grid-cols-3 gap-2">
                    {SLOTS.map((s) => (
                        <Chip key={s.time} value={s.time} disabled={s.taken} className="justify-center tabular-nums">
                            <span className={s.taken ? "line-through" : undefined}>{s.time}</span>
                        </Chip>
                    ))}
                </Chips>

                <Alert tone="success" icon={<CheckCircleIcon />} title="Booked · 1:00 PM">
                    Synced to Google Calendar · WhatsApp reminder queued
                </Alert>

                <div className="flex items-start gap-2.5 rounded-md bg-surface p-3 text-caption text-fg-muted">
                    <BookOpenIcon className="mt-0.5 size-4 shrink-0 text-accent-ink" />
                    <span>
                        <span className="font-semibold text-fg">From your knowledge base:</span> &ldquo;First consultations are free and last about 30 minutes.&rdquo;
                    </span>
                </div>
            </div>
        </MockFrame>
    );
}
