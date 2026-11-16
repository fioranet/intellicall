import { SpotlightLayout } from "./_shared/spotlight-layout";
import { BookingMock } from "./_mockups/booking-mock";

export function SpotlightAppointments() {
    return (
        <SpotlightLayout
            id="appointments"
            variant="base"
            strokes="a"
            reverse
            number="05"
            eyebrow="Agendamentos & Conhecimento"
            watermark="book"
            title={<>Agendamento de reuniões <span className="text-brand italic">durante a conversa</span></>}
            description="Os agentes respondem com base na documentação da sua empresa e confirmam compromissos diretamente na chamada — consultando horários livres, reservando a vaga e enviando confirmações."
            bullets={[
                "Respostas precisas e seguras a partir dos manuais, regras e materiais da sua empresa.",
                "Consulta de disponibilidade e agendamento em tempo real durante o telefonema.",
                "Sincronização bidirecional com Google Calendar para reagendamentos e cancelamentos.",
                "Lembretes automáticos via WhatsApp antes de cada reunião para reduzir ausências.",
            ]}
            mock={<BookingMock />}
        />
    );
}
