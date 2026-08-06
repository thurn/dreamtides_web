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
  isNegative: false,
};

function WagerPrizeCardDemo({
  revealed = false,
}: {
  revealed?: boolean;
}) {
  return (
    <WagerPrizeCard
      prizeId="jack"
      targetLabel="J-A"
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
    "The shared Gamble prize object: one PlayingCard superellipse with a draw target or minimum draw, a single Essence and/or Dreamsign reward sentence, an optional whole-face Dreamsign reveal, and a committed-card reverse face.",
  callout:
    "Keep the reward in one sentence. When a Dreamsign is present, the entire prize face is its hover and press reveal source.",
  group: "Components",
  docName: "WagerPrizeCard",
  Component: WagerPrizeCardDemo,
  usage: [
    {
      label: "Prize",
      code: `<WagerPrizeCard
  prizeId="jack"
  targetLabel="J-A"
  essenceReward={200}
  rewardDreamsign={dreamsign}
/>
`,
    },
    {
      label: "Dreamsign prize",
      code: `<WagerPrizeCard
  prizeId="ladder-climb"
  targetLabel="Q-A"
  essenceReward={null}
  rewardDreamsign={dreamsign}
/>
`,
    },
    {
      label: "Minimum draw",
      code: `<WagerPrizeCard
  prizeId="starway-1"
  presentation="draw-minimum"
  targetLabel="3+"
  essenceReward={60}
  rewardDreamsign={null}
  emphasis="current"
/>
`,
    },
    {
      label: "Drawn reverse",
      code: `<WagerPrizeCard
  prizeId="jack"
  targetLabel="J-A"
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
