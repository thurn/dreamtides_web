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
        variant="faceDown"
        drawnCard={{ rank: "A", suit: "spades" }}
        revealDrawnCard={revealed}
      />
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
    "The shared outlined playing-card face, with visible rank-and-suit, conventional face-down, and Four-Suit Reprise variants.",
  callout:
    "Use the face-down variant for a hidden committed card and the four-suit variant for Four-Suit Reprise's draw object.",
  propsNote:
    "The rankSuit variant requires rank and suit. The faceDown and fourSuit variants require drawnCard and accept revealDrawnCard.",
  group: "Components",
  docName: "PlayingCard",
  Component: PlayingCardDemo,
  usage: [
    {
      label: "Visible card",
      code: `<PlayingCard variant="rankSuit" rank="Q" suit="hearts" />`,
    },
    {
      label: "Face-down card",
      code: `<PlayingCard
  variant="faceDown"
  drawnCard={{ rank: "A", suit: "spades" }}
  revealDrawnCard
/>`,
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
