import { PlayingCard } from "../../components/card/PlayingCard";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

function PlayingCardDemo({
  revealed = false,
}: {
  revealed?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: token("--space-xl"),
      }}
    >
      <PlayingCard variant="rankSuit" rank="Q" suit="hearts" />
      <PlayingCard
        variant="fourSuit"
        drawnCard={{ rank: "7", suit: "clubs" }}
        revealDrawnCard={revealed}
      />
    </div>
  );
}

export const playingCardDemo: CumulusComponent = {
  id: "playing-card",
  title: "Playing Card",
  blurb:
    "The shared outlined playing-card face, with a visible rank-and-suit variant and Four-Suit Reprise's concealed suit grid.",
  callout:
    "Use the four-suit variant for the Gamble draw object; its committed result flips onto the reverse face without changing the footprint.",
  propsNote:
    "The rankSuit variant requires rank and suit. The fourSuit variant requires drawnCard and accepts revealDrawnCard.",
  group: "Components",
  docName: "PlayingCard",
  Component: PlayingCardDemo,
  usage: [
    {
      label: "Visible card",
      code: `<PlayingCard variant="rankSuit" rank="Q" suit="hearts" />`,
    },
    {
      label: "Four-suit draw",
      code: `<PlayingCard
  variant="fourSuit"
  drawnCard={{ rank: "7", suit: "clubs" }}
  revealDrawnCard
/>`,
    },
  ],
  demo: { defaultArgs: { revealed: false } },
};
