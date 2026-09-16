import { SpotlightLayout } from "./_shared/spotlight-layout";
import { InboundCallMock } from "./_mockups/inbound-call-mock";

export function SpotlightInbound() {
    return (
        <SpotlightLayout
            id="inbound"
            variant="brand"
            strokes="c"
            number="04"
            eyebrow="Inbound 24/7"
            watermark="answer"
            title={<>Never miss a call, <span className="italic underline decoration-white/50 decoration-4 underline-offset-[6px]">day or night</span></>}
            description="Your AI receptionist answers every inbound call, captures the lead, answers questions from your knowledge base, and books the meeting — over your own SIP trunk or Twilio."
            bullets={[
                "Bring your own SIP carrier (Telnyx, VoIP.ms and more) or use Twilio.",
                "Per-number routing — a different agent for each line.",
                "Real-time transcription with natural interruption handling.",
                "Cut per-minute costs by owning your telephony stack.",
            ]}
            mock={<InboundCallMock />}
        />
    );
}
