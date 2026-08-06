import {
  RadialAnnouncement,
  type RadialAnnouncementTone,
} from "../../components/status/RadialAnnouncement";
import { GLYPHS } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";

// The scene announcement is intentionally transient and finishes fully
// transparent. Documentation keeps its reduced-motion resting state visible
// while the other enum variants demonstrate their own choreography.
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
  const variant =
    args.variant === "card-score" ||
    args.variant === "merge-target" ||
    args.variant === "victory"
      ? args.variant
      : "announcement";
  const points = typeof args.points === "number" ? args.points : 3;
  const status = args.status === "blocked" ? "blocked" : "available";
  const addedSpark = typeof args.addedSpark === "number" ? args.addedSpark : 2;
  return (
    <div
      data-radial-announcement-demo-frozen={
        variant === "announcement" ? "" : undefined
      }
      style={{
        position: "relative",
        width:
          variant === "card-score" || variant === "merge-target" ? 220 : "100%",
        height: 320,
        margin: "0 auto",
      }}
    >
      <style>{FROZEN_ANNOUNCEMENT_CSS}</style>
      {variant === "card-score" ? (
        <RadialAnnouncement variant="card-score" points={points} />
      ) : variant === "merge-target" ? (
        status === "blocked" ? (
          <RadialAnnouncement variant="merge-target" status="blocked" />
        ) : (
          <RadialAnnouncement
            variant="merge-target"
            status="available"
            addedSpark={addedSpark}
          />
        )
      ) : variant === "victory" ? (
        <RadialAnnouncement variant="victory" headline="Victory" />
      ) : (
        <RadialAnnouncement
          headline="Fast"
          headlineGlyph={GLYPHS.bolt}
          essenceGained={tone === "reward" ? 150 : undefined}
          tone={tone}
        />
      )}
    </div>
  );
}

export const radialAnnouncementDemo: CumulusComponent = {
  id: "radial-announcement",
  title: "Radial Announcement",
  blurb:
    "The single orbiting circular status system for scene announcements, card scoring, merge targets, and terminal victory.",
  callout:
    "Use a strict named variant for every orbiting circular status moment.",
  details: [
    "Each enum branch owns its established production choreography—including the card-attached scoring travel—while callers only place it in the relevant scene or card context.",
  ],
  group: "Components",
  docName: "RadialAnnouncement",
  Component: RadialAnnouncementDemo,
  usage: [
    {
      code: `import { RadialAnnouncement } from "src/cumulus/components/status/RadialAnnouncement";
import { GLYPHS } from "src/cumulus/primitives/glyph";

<RadialAnnouncement
  headline="Fast"
  headlineGlyph={GLYPHS.bolt}
  essenceGained={150}
  tone="reward"
  duration="extended"
/>`,
    },
    {
      code: `<RadialAnnouncement
  variant="card-score"
  points={3}
  announcementId="challenge-resolved:player:5:F0"
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "announcement",
      tone: "reward",
      points: 3,
      status: "available",
      addedSpark: 2,
    },
  },
};
