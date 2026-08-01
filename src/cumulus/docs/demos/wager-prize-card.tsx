import type { Dreamsign as DreamsignData } from "../../../types/journey";
import { WagerPrizeCard } from "../../components/card/PlayingCard";
import type { CumulusComponent } from "../registry";

const SAMPLE_DREAMSIGN: DreamsignData = {
  id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
  name: "Amplified Acorn",
  imageName: "acorn_gold.png",
  imageAlt: "Golden fruit-like charm with a mesh-patterned orb.",
  effectDescription:
    "Once per turn, when you discard a card, your next card this turn costs 2● less.",
  isBane: false,
};

function WagerPrizeCardDemo({
  revealed = false,
}: {
  revealed?: boolean;
}) {
  return (
    <WagerPrizeCard
      gateId="jack"
      targetLabel="J+"
      essenceReward={200}
      rewardDreamsign={SAMPLE_DREAMSIGN}
      drawnCard={{ rank: "Q", suit: "hearts" }}
      revealDrawnCard={revealed}
    />
  );
}

export const wagerPrizeCardDemo: CumulusComponent = {
  id: "wager-prize-card",
  title: "Wager Prize Card",
  blurb:
    "The Three Gates prize object: one PlayingCard superellipse with a target title, a single reward sentence, and an optional committed-card reverse face.",
  callout:
    "Keep the reward in one sentence; assign a drawn card only when this non-selected gate owns the result reveal.",
  group: "Components",
  docName: "WagerPrizeCard",
  Component: WagerPrizeCardDemo,
  usage: [
    {
      label: "Prize",
      code: `<WagerPrizeCard
  gateId="jack"
  targetLabel="J+"
  essenceReward={200}
  rewardDreamsign={dreamsign}
/>
`,
    },
    {
      label: "Drawn reverse",
      code: `<WagerPrizeCard
  gateId="jack"
  targetLabel="J+"
  essenceReward={200}
  rewardDreamsign={dreamsign}
  drawnCard={{ rank: "Q", suit: "hearts" }}
  revealDrawnCard
/>
`,
    },
  ],
  demo: { defaultArgs: { revealed: false } },
};
