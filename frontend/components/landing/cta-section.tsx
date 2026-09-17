import Link from "next/link";
import { ArrowRight, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionShell } from "./_shared/section-shell";
import { Reveal } from "./_shared/reveal";

interface CtaSectionProps {
    isLoggedIn: boolean;
    showSelfHosting: boolean;
}

export function CtaSection({ isLoggedIn, showSelfHosting }: CtaSectionProps) {
    return (
        <SectionShell id="start" variant="brand" strokes="b" watermark="start">
            <Reveal className="mx-auto max-w-3xl space-y-8 text-center">
                <h2 className="text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl">
                    Comece a transformar seu atendimento hoje mesmo
                </h2>
                <p className="mx-auto max-w-xl text-lg leading-relaxed text-white/80">
                    Coloque seu primeiro agente de voz no ar em minutos — atenda clientes 24/7, dispare campanhas ativas e agende compromissos no piloto automático.
                </p>
                <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
                    <Button size="lg" className="h-14 rounded-full bg-white px-10 text-base font-semibold text-brand hover:bg-white/90" asChild>
                        <Link href={isLoggedIn ? "/dashboard" : "/signup"}>
                            {isLoggedIn ? "Acessar Painel" : "Começar Gratuitamente"} <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </Button>
                    {showSelfHosting && (
                        <Button size="lg" variant="outline" className="h-14 rounded-full border-white/40 bg-transparent px-10 text-base font-semibold text-white hover:bg-white/10 hover:text-white" asChild>
                            <a href="#self-host" className="flex items-center gap-2">
                                <Server className="h-5 w-5" /> Hospedagem Própria
                            </a>
                        </Button>
                    )}
                </div>
            </Reveal>
        </SectionShell>
    );
}
