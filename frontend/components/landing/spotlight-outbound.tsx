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
            eyebrow="Outbound Campaigns"
            watermark="dial"
            title={<>Dial <span className="text-brand italic">thousands of leads</span> on autopilot</>}
            description="Import your list, set the schedule, and let AI agents run the whole campaign — no human dialers. Watch progress live and let AI score every lead the moment the call ends."
            bullets={[
                "Import leads from CSV or sync straight from Google Sheets.",
                "Automatic scheduling and pacing across your whole list.",
                "Real-time call progress and per-lead status at a glance.",
                "AI qualifies and scores each lead so reps chase only the hottest.",
            ]}
            mock={<CampaignMock />}
        />
    );
}
