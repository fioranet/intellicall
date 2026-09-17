import { PhoneIncoming } from "lucide-react";
import { MockFrame } from "./mock-frame";

const BARS = [0.4, 0.7, 1, 0.6, 0.85, 0.5, 0.95, 0.65, 0.35, 0.8, 0.55, 1, 0.45, 0.75, 0.6, 0.9, 0.5, 0.7, 0.4, 0.85];

export function InboundCallMock() {
    return (
        <MockFrame
            title="Chamada Receptiva"
            toolbar={
                <div className="flex items-center gap-1.5">
                    <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Tronco SIP</span>
                    <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Telefonia Nuvem</span>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand">
                        <PhoneIncoming className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground">(11) 3090-6888</div>
                        <div className="text-xs text-muted-foreground">Atendida pela assistente virtual IA</div>
                    </div>
                    <span className="rounded-full bg-brand/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-brand">00:47</span>
                </div>

                <div className="flex h-12 items-center justify-center gap-1 rounded-xl border border-border bg-muted/40 px-4">
                    {BARS.map((h, i) => (
                        <span
                            key={i}
                            className="landing-wave-bar w-1 rounded-full bg-brand/70"
                            style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${i * 70}ms` }}
                        />
                    ))}
                </div>

                <div className="space-y-1.5 text-xs leading-relaxed">
                    <p className="text-muted-foreground"><span className="font-semibold text-foreground">Cliente:</span> Olá, vocês têm atendimento neste sábado?</p>
                    <p className="text-muted-foreground"><span className="font-semibold text-brand">Agente:</span> Olá! Sim, atendemos das 9h às 17h. Deseja que eu reserve um horário para você?</p>
                </div>
            </div>
        </MockFrame>
    );
}
