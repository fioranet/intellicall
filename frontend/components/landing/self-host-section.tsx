import { ArrowRight, PlayCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionShell } from "./_shared/section-shell";
import { Reveal } from "./_shared/reveal";

const POINTS = [
    "Instalação web simplificada — configure tudo direto pelo seu navegador.",
    "Acesso total ao código-fonte — personalize a plataforma para suas necessidades.",
    "Implante em qualquer VPS ou servidor em nuvem.",
    "Sem mensalidades adicionais da plataforma para instâncias próprias.",
];

export function SelfHostSection() {
    return (
        <SectionShell id="self-host" variant="base" strokes="b" watermark="deploy" watermarkPos="right">
            <Reveal className="mx-auto max-w-4xl space-y-8">
                <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-brand">09 · Hospedagem Própria</p>
                <h2 className="text-3xl font-bold leading-[1.1] tracking-tight text-foreground md:text-5xl">
                    Execute no <span className="text-brand italic">seu próprio servidor</span>
                </h2>
                <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                    Tenha controle total sobre sua infraestrutura e dados. Implante na sua própria nuvem com instalador web descomplicado.
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                    {POINTS.map((p) => (
                        <li key={p} className="flex items-start gap-3 text-sm text-muted-foreground">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                            <span>{p}</span>
                        </li>
                    ))}
                </ul>
                <div className="flex flex-col gap-4 pt-2 sm:flex-row">
                    <Button size="lg" className="h-14 rounded-full bg-brand px-8 text-base font-semibold text-white hover:bg-brand/90" asChild>
                        <a href="https://codecanyon.net/item/intellicall-ai-ai-voice-calling-agents-for-lead-campaign-automation/61664541" target="_blank" rel="noopener noreferrer" className="flex items-center">
                            Adquirir Licença <ArrowRight className="ml-2 h-5 w-5" />
                        </a>
                    </Button>
                    <Button size="lg" variant="outline" className="h-14 rounded-full border-border px-8 text-base font-semibold hover:bg-muted" asChild>
                        <a href="https://www.youtube.com/watch?v=Vd2jzOCLjhg" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                            <PlayCircle className="h-5 w-5" /> Tutorial de Instalação
                        </a>
                    </Button>
                </div>
            </Reveal>
        </SectionShell>
    );
}
