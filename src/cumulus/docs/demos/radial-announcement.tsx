import {
  RadialAnnouncement,
  type RadialAnnouncementTone,
} from "../../components/status/RadialAnnouncement";
import { GLYPHS } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";

// The production component is intentionally transient and finishes fully
// transparent. Documentation keeps the same reduced-motion resting state in
// view so the overview remains useful after the first animation cycle.
const FROZEN_ANNOUNCEMENT_CSS = `
  [data-radial-announcement-demo-frozen] [data-radial-announcement-disc],
  [data-radial-announcement-demo-frozen] [data-radial-announcement-orbit],
  [data-radial-announcement-demo-frozen] [data-radial-announcement-ripple],
  [data-radial-announcement-demo-frozen] [data-radial-announcement-copy] {
    animation: none !important;
  }
`;

function RadialAnnouncementDemo(args: Record<string, unknown>) {
  const tone: RadialAnnouncementTone =
    args.tone === "reward" || args.tone === "danger" ? args.tone : "accent";
  return (
    <div
      data-radial-announcement-demo-frozen=""
      style={{ position: "relative", width: "100%", height: 320 }}
    >
      <style>{FROZEN_ANNOUNCEMENT_CSS}</style>
      <RadialAnnouncement
        headline="Fast"
        headlineGlyph={GLYPHS.bolt}
        essenceGained={tone === "reward" ? 150 : undefined}
        tone={tone}
      />
    </div>
  );
}

export const radialAnnouncementDemo: CumulusComponent = {
  id: "radial-announcement",
  title: "Radial Announcement",
  blurb: "The orbiting circular status moment for turn handoffs, wins, failures, and iconic state changes.",
  callout: "Use it only for a brief, non-interactive state change that deserves to interrupt the whole scene. Resource symbols in headline and detail copy render through the canonical inline glyph treatment.",
  group: "Components",
  docName: "RadialAnnouncement",
  Component: RadialAnnouncementDemo,
  usage: [{
    code: `import { RadialAnnouncement } from "src/cumulus/components/status/RadialAnnouncement";
import { GLYPHS } from "src/cumulus/primitives/glyph";

<RadialAnnouncement
  headline="Fast"
  headlineGlyph={GLYPHS.bolt}
  essenceGained={150}
  tone="reward"
  duration="extended"
/>`,
  }],
  demo: { defaultArgs: { tone: "reward" } },
};
