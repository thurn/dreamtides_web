import { BattleStatusDisplay } from "../../components/battle/BattleStatusDisplay";
import type { DreamcallerVisual } from "../../components/hud/DreamcallerPortrait";
import type { TangoComponent } from "../registry";

const DREAMCALLER: DreamcallerVisual = {
  imageNumber: "0025",
  name: "Threxan",
  title: "the Resounding Wrath",
};

function BattleStatusDisplayDemo(args: Record<string, unknown>) {
  const owner = args.owner === "enemy" ? "enemy" : "player";
  const currentEnergy = typeof args.currentEnergy === "number" ? args.currentEnergy : 2;
  const maxEnergy = typeof args.maxEnergy === "number" ? args.maxEnergy : 3;
  const points = typeof args.points === "number" ? args.points : 4;
  return (
    <div style={{ width: 280 }}>
      <BattleStatusDisplay
        owner={owner}
        dreamcaller={DREAMCALLER}
        currentEnergy={currentEnergy}
        maxEnergy={maxEnergy}
        points={points}
      />
    </div>
  );
}

export const battleStatusDisplayDemo: TangoComponent = {
  id: "battle-status-display",
  title: "Battle Status Display",
  blurb:
    "The solid physical status card for one battle participant: current and maximum energy at left, a head-focused Dreamcaller portrait at center, and current points at right.",
  callout:
    "This display has no phase, active-state, debug, or interaction API. Place the complete fixed object through a wrapper.",
  group: "Components",
  docName: "BattleStatusDisplay",
  Component: BattleStatusDisplayDemo,
  usage: [
    {
      note: "One complete participant status card. Energy and points use the canonical ResourceChip marks; the portrait uses DreamcallerPortrait's thumb framing.",
      code: `import { BattleStatusDisplay } from "src/tango/components/battle/BattleStatusDisplay";

<BattleStatusDisplay
  owner="player"
  dreamcaller={playerDreamcaller}
  currentEnergy={2}
  maxEnergy={3}
  points={4}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      owner: "player",
      currentEnergy: 2,
      maxEnergy: 3,
      points: 4,
    },
  },
};
