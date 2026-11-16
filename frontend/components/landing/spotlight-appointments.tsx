import { SpotlightLayout } from "./_shared/spotlight-layout";
import { BookingMock } from "./_mockups/booking-mock";

export function SpotlightAppointments() {
    return (
        <SpotlightLayout
            id="appointments"
            reverse
            eyebrow="Appointments & Knowledge"
            title={<>Books the meeting <span className="text-accent-ink">mid-conversation</span></>}
            description="Agents answer from your business knowledge base and lock in appointments during the call — checking availability, booking the slot, and confirming, all without a human."
            bullets={[
                "Grounded answers from your uploaded FAQs, docs, and scripts.",
                "Live availability check and booking, right on the call.",
                "Two-way Google Calendar sync — reschedules and cancellations too.",
                "Automatic WhatsApp reminders before every appointment.",
            ]}
            mock={<BookingMock />}
        />
    );
}
