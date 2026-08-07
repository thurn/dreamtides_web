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
};

function WagerPrizeCardDemo({ revealed = false }: { revealed?: boolean }) {
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
    "The shared Gamble reward object: a playing-card superellipse with threshold-and-reverse or flat-reward presentations.",
  callout:
    "Use the flat-reward presentation when the game has one persistent prize instead of a draw threshold.",
  details: [
    "When a Dreamsign is present, the entire prize face is its hover and press reveal source.",
  ],
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
  drawnCard={null}
/>
`,
    },
    {
      label: "Flat reward",
      code: `<WagerPrizeCard
  prizeId="blackjack"
  presentation="rewardOnly"
  essenceReward={300}
  rewardDreamsign={null}
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
