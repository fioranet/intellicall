import { SpotlightLayout } from "./_shared/spotlight-layout";
import { AgentEditorMock } from "./_mockups/agent-editor-mock";

export function SpotlightVoiceEngines() {
    return (
        <SpotlightLayout
            id="voice-engines"
            variant="brand"
            strokes="a"
            number="02"
            eyebrow="Vozes Humanizadas"
            watermark="voice"
            title={<>Vozes ultra-realistas com respostas <span className="italic underline decoration-white/50 decoration-4 underline-offset-[6px]">instantâneas</span></>}
            description="Nossos agentes conversam com empatia, clareza e ritmo natural, compreendendo as nuances da fala humana e respondendo sem atrasos perceptíveis."
            bullets={[
                "Interrupção natural: o cliente pode falar e interromper a qualquer momento, como em uma ligação real.",
                "Português do Brasil como idioma nativo padrão, com fluência e dicção brasileira.",
                "Personalidade e tom sob medida: configure o perfil ideal para suporte, televendas ou cobrança.",
                "Serviço 100% gerenciado e integrado: sem necessidade de contratar APIs adicionais ou configurações complexas.",
            ]}
            mock={<AgentEditorMock />}
        />
    );
}
