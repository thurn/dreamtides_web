import {
  RadialAnnouncement,
  type RadialAnnouncementTone,
} from "../../components/status/RadialAnnouncement";
import type { CumulusComponent } from "../registry";

function RadialAnnouncementDemo(args: Record<string, unknown>) {
  const tone: RadialAnnouncementTone =
    args.tone === "reward" || args.tone === "danger" ? args.tone : "accent";
  return (
    <div style={{ position: "relative", width: "100%", height: 320 }}>
      <RadialAnnouncement
        headline={tone === "danger" ? "Bust!" : "Won!"}
        essenceGained={tone === "reward" ? 150 : undefined}
        tone={tone}
      />
    </div>
  );
}

export const radialAnnouncementDemo: CumulusComponent = {
  id: "radial-announcement",
  title: "Radial Announcement",
  blurb: "The orbiting circular status moment for turn handoffs, wins, and failures.",
  callout: "Use it only for a brief, non-interactive state change that deserves to interrupt the whole scene.",
  group: "Components",
  docName: "RadialAnnouncement",
  Component: RadialAnnouncementDemo,
  usage: [{
    code: `import { RadialAnnouncement } from "src/cumulus/components/status/RadialAnnouncement";

<RadialAnnouncement
  headline="Won!"
  essenceGained={150}
  tone="reward"
  duration="extended"
/>`,
  }],
  demo: { defaultArgs: { tone: "reward" } },
};
