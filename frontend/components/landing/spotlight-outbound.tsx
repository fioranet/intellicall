import { SpotlightLayout } from "./_shared/spotlight-layout";
import { CampaignMock } from "./_mockups/campaign-mock";

export function SpotlightOutbound() {
    return (
        <SpotlightLayout
            id="outbound"
            variant="base"
            strokes="b"
            reverse
            number="03"
            eyebrow="Campanhas Ativas"
            watermark="dial"
            title={<>Disque para <span className="text-brand italic">centenas de contatos</span> no piloto automático</>}
            description="Importe sua base de contatos, defina os horários de disparo e deixe os agentes de IA realizarem as ligações. Acompanhe o progresso em tempo real e receba os leads qualificados prontos para sua equipe fechar negócios."
            bullets={[
                "Importação rápida de listas via arquivo CSV ou integração com planilhas.",
                "Cadência e distribuição automática de chamadas sem sobrecarregar sua linha.",
                "Acompanhamento ao vivo com status de atendimento, caixas postais e tempo de chamada.",
                "Qualificação inteligente de leads: seus consultores focam apenas nas melhores oportunidades.",
            ]}
            mock={<CampaignMock />}
        />
    );
}
