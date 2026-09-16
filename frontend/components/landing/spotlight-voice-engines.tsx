import { SpotlightLayout } from "./_shared/spotlight-layout";
import { AgentEditorMock } from "./_mockups/agent-editor-mock";

export function SpotlightVoiceEngines() {
    return (
        <SpotlightLayout
            id="voice-engines"
            variant="brand"
            strokes="a"
            number="02"
            eyebrow="Voice Engines"
            watermark="voice"
            title={<>Choose the voice engine <span className="italic underline decoration-white/50 decoration-4 underline-offset-[6px]">per agent</span></>}
            description="Every agent picks its own engine — from a fully self-contained pipeline to the lowest-latency managed stack — so you tune quality, cost, and language for each use case."
            bullets={[
                "Classic pipeline: Deepgram STT + OpenRouter LLM + ElevenLabs voices.",
                "Deepgram Voice Agent: one socket, sub-second responses, managed LLM.",
                "Sarvam AI: native Indian languages — Hindi, Tamil, Telugu, Bengali, Kannada, Marathi and more, on a single Sarvam key.",
                "Preview any voice before you launch, and switch engines without rebuilding your agent.",
            ]}
            mock={<AgentEditorMock />}
        />
    );
}
