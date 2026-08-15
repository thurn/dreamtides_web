import { assertLocalized } from "@trox/runtime";
import { BattleStatusDisplay } from "../../components/battle/BattleStatusDisplay";
import type { AvatarVisual } from "../../components/hud/AvatarPortrait";
import type { CumulusComponent } from "../registry";

const AVATAR: AvatarVisual = {
  imageNumber: "0025",
  name: assertLocalized("Threxan"),
  title: assertLocalized("the Resounding Wrath"),
};

function BattleStatusDisplayDemo(args: Record<string, unknown>) {
  const owner = args.owner === "enemy" ? "enemy" : "player";
  const relationship = args.relationship === "far" ? "far" : "near";
  const avatar = args.placeholder === true ? null : AVATAR;
  const currentEnergy =
    typeof args.currentEnergy === "number" ? args.currentEnergy : 2;
  const maxEnergy = typeof args.maxEnergy === "number" ? args.maxEnergy : 3;
  const points = typeof args.points === "number" ? args.points : 4;
  const pointsToWin =
    typeof args.pointsToWin === "number" ? args.pointsToWin : 25;
  return (
    <div style={{ width: 280 }}>
      <BattleStatusDisplay
        owner={owner}
        relationship={relationship}
        avatar={avatar}
        currentEnergy={currentEnergy}
        maxEnergy={maxEnergy}
        points={points}
        pointsToWin={pointsToWin}
      />
    </div>
  );
}

export const battleStatusDisplayDemo: CumulusComponent = {
  id: "battle-status-display",
  title: "Battle Status Display",
  blurb:
    "The glass status card for one battle participant: centered current and maximum energy at left, a head-focused Avatar portrait or loading placeholder at center, and centered current and target points at right.",
  callout:
    "Pass the canonical owner and its near/far relationship separately so accessibility copy follows the current perspective.",
  group: "Battle",
  docName: "BattleStatusDisplay",
  Component: BattleStatusDisplayDemo,
  usage: [
    {
      note: "One complete participant status card. Energy and points use the component's fixed battle notation; the portrait uses AvatarPortrait's thumb framing.",
      code: `import { BattleStatusDisplay } from "src/cumulus/components/battle/BattleStatusDisplay";

<BattleStatusDisplay
  owner="player"
  relationship="near"
  avatar={playerAvatar}
  currentEnergy={2}
  maxEnergy={3}
  points={4}
  pointsToWin={25}
/>`,
    },
    {
      note: "Use the null portrait state while the participant identity is being populated.",
      code: `<BattleStatusDisplay
  owner="enemy"
  relationship="far"
  avatar={null}
  currentEnergy={0}
  maxEnergy={0}
  points={0}
  pointsToWin={10}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      owner: "player",
      relationship: "near",
      currentEnergy: 2,
      maxEnergy: 3,
      points: 4,
      pointsToWin: 25,
      placeholder: false,
    },
  },
};
