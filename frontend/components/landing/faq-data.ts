export interface Faq {
    question: string;
    answer: string;
}

/**
 * Answer-shaped FAQ content, rendered in the FAQ section AND mirrored into FAQPage JSON-LD.
 * Single source of truth (imported by both) so the two never drift. `appName` is interpolated.
 */
export function buildFaqs(appName: string): Faq[] {
    return [
        {
            question: `O que é o ${appName}?`,
            answer: `O ${appName} é uma plataforma de atendimento e telefonia corporativa com agentes de voz inteligentes. Nossos atendentes virtuais atendem chamadas receptivas e realizam ligações ativas 24 horas por dia, 7 dias por semana — qualificando oportunidades, tirando dúvidas com base nas regras do seu negócio, agendando reuniões e enviando lembretes por WhatsApp.`,
        },
        {
            question: "Como funcionam as chamadas com os agentes de voz?",
            answer: "Cada ligação acontece em tempo real com voz ultra-realista em português brasileiro. O agente compreende o contexto com alta precisão e responde de forma instantânea e natural, permitindo inclusive que o cliente o interrompa a qualquer momento como em uma conversa humana real.",
        },
        {
            question: "Preciso contratar serviços técnicos externos ou configurar chaves de API?",
            answer: "Não. O serviço é totalmente gerenciado e pronto para uso. Toda a inteligência conversacional, telefonia e síntese de voz já vêm integradas na plataforma, sem necessidade de conhecimento técnico ou configurações complexas.",
        },
        {
            question: "O agente consegue agendar compromissos e consultas durante o telefonema?",
            answer: "Sim. O agente consulta seus horários livres em tempo real, confirma o agendamento diretamente na conversa, sincroniza automaticamente com o Google Calendar e agenda o envio de um lembrete no WhatsApp do cliente.",
        },
        {
            question: "A plataforma realiza chamadas ativas e recebe ligações?",
            answer: "Sim, ambas as modalidades. O agente pode funcionar como uma recepcionista 24/7 para atender suas linhas de entrada e também pode discar automaticamente para listas de contatos e leads em campanhas ativas, conforme os horários que você definir.",
        },
        {
            question: "Posso conectar a plataforma com as ferramentas que minha empresa já utiliza?",
            answer: "Sim. Há integração nativa com Google Calendar, Google Sheets, WhatsApp, Slack, HubSpot CRM e n8n, além de Webhooks e API REST para conexão com qualquer CRM, ERP ou sistema interno.",
        },
        {
            question: "Qual a velocidade para ligar para um novo lead recebido no site?",
            answer: "Em poucos segundos. Ao conectar seu formulário de contato ou CRM via webhook ou automação, o agente disca para o cliente no momento exato em que ele demonstra interesse, aumentando exponencialmente sua taxa de conversão.",
        },
    ];
}
