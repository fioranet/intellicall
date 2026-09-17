import { SpotlightLayout } from "./_shared/spotlight-layout";
import { InboundCallMock } from "./_mockups/inbound-call-mock";

export function SpotlightInbound() {
    return (
        <SpotlightLayout
            id="inbound"
            variant="brand"
            strokes="c"
            number="04"
            eyebrow="Atendimento Receptivo 24/7"
            watermark="answer"
            title={<>Nunca mais perca uma ligação, <span className="italic underline decoration-white/50 decoration-4 underline-offset-[6px]">dia ou noite</span></>}
            description="Sua atendente virtual com inteligência artificial atende cada chamada receptiva, tira dúvidas com base nas informações da sua empresa, qualifica o cliente e agenda reuniões ou encaminha para sua equipe."
            bullets={[
                "Conexão flexível: use seus números existentes, troncos SIP corporativos ou telefonia em nuvem.",
                "Roteamento inteligente por número — agentes dedicados para cada linha, filial ou departamento.",
                "Transcrição em tempo real com tratamento natural e instantâneo a interrupções.",
                "Atendimento simultâneo de centenas de clientes sem filas de espera e com custo previsível.",
            ]}
            mock={<InboundCallMock />}
        />
    );
}
