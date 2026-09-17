import { Check, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { MockFrame } from "./mock-frame";

const SLOTS = [
    { time: "10:00", taken: false },
    { time: "11:30", taken: true },
    { time: "13:00", taken: false, selected: true },
    { time: "14:30", taken: false },
    { time: "16:00", taken: true },
    { time: "17:00", taken: false },
];

export function BookingMock() {
    return (
        <MockFrame title="Agendamentos &amp; Base de Conhecimento">
            <div className="space-y-4">
                <div className="text-xs font-medium text-muted-foreground">Horários Disponíveis · Quinta-feira</div>
                <div className="grid grid-cols-3 gap-2">
                    {SLOTS.map((s) => (
                        <div
                            key={s.time}
                            className={cn(
                                "rounded-lg border px-2 py-2 text-center text-xs font-semibold",
                                s.taken && "border-border bg-muted text-muted-foreground/50 line-through",
                                s.selected && "border-brand/40 bg-brand/10 text-brand",
                                !s.taken && !s.selected && "border-border text-foreground"
                            )}
                        >
                            {s.time}
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/[0.06] p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
                        <Check className="h-4 w-4" />
                    </div>
                    <div className="text-sm">
                        <div className="font-semibold text-foreground">Agendado · 13:00</div>
                        <div className="text-xs text-muted-foreground">Sincronizado com Google Calendar · Lembrete por WhatsApp agendado</div>
                    </div>
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span>
                        <span className="font-semibold text-foreground">Da sua base de conhecimento:</span> &ldquo;A primeira consulta de avaliação é gratuita e tem duração de 30 minutos.&rdquo;
                    </span>
                </div>
            </div>
        </MockFrame>
    );
}
