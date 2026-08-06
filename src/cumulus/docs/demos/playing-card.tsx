import {
  PlayingCard,
  type PlayingCardRank,
  type PlayingCardSize,
  type PlayingCardSuit,
  type PlayingCardVariant,
} from "../../components/card/PlayingCard";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

const RANKS: readonly PlayingCardRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

const SUITS: readonly PlayingCardSuit[] = [
  "clubs",
  "diamonds",
  "hearts",
  "spades",
];

const VARIANTS: readonly PlayingCardVariant[] = [
  "rank-and-suit",
  "rank-display",
  "suit-display",
  "rank-target",
];

const FOCUSED_VARIANTS: readonly {
  label: string;
  variant: PlayingCardVariant;
  suit: PlayingCardSuit;
}[] = [
  { label: "Rank Display", variant: "rank-display", suit: "clubs" },
  { label: "Suit Display", variant: "suit-display", suit: "hearts" },
  { label: "Rank Target", variant: "rank-target", suit: "spades" },
];

function PlayingCardDemo(args: Record<string, unknown>) {
  const rank = RANKS.includes(args.rank as PlayingCardRank)
    ? (args.rank as PlayingCardRank)
    : "10";
  const suit = SUITS.includes(args.suit as PlayingCardSuit)
    ? (args.suit as PlayingCardSuit)
    : "hearts";
  const size: PlayingCardSize =
    args.size === "compact" ||
    args.size === "wagerCompact" ||
    args.size === "wager"
      ? args.size
      : "standard";
  const variant = VARIANTS.includes(args.variant as PlayingCardVariant)
    ? (args.variant as PlayingCardVariant)
    : "rank-and-suit";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-2xl"),
      }}
    >
      <PlayingCard
        rank={rank}
        suit={suit}
        size={size}
        variant={variant}
      />
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: token("--space-l"),
        }}
      >
        {FOCUSED_VARIANTS.map((entry) => (
          <div
            key={entry.variant}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: token("--space-xs"),
            }}
          >
            <PlayingCard
              rank="7"
              suit={entry.suit}
              size="compact"
              variant={entry.variant}
            />
            <span
              style={{
                color: token("--text-muted"),
                font: token("--t-caption"),
              }}
            >
              {entry.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const playingCardDemo: CumulusComponent = {
  id: "playing-card",
  title: "Playing Card",
  blurb:
    "The standard playing-card object: full rank-and-suit, focused rank, colored suit, and rank-target treatments on a quartic-superellipse square made from the shared liquid glass.",
  callout:
    "Choose the front variant by its game meaning and use the named size only; suit-specific optical corrections keep every Unicode mark aligned.",
  group: "Components",
  docName: "PlayingCard",
  Component: PlayingCardDemo,
  usage: [
    {
      code: `import { PlayingCard } from "src/cumulus/components/card/PlayingCard";

<PlayingCard rank="10" suit="hearts" />`,
    },
    {
      label: "Compact",
      note: "The compact square fits dense three-column mobile hands.",
      code: `<PlayingCard rank="A" suit="spades" size="compact" />`,
    },
    {
      label: "Wager Squares",
      note: "The wager sizes align a drawn card with the desktop and mobile Three Gates prize objects.",
      code: `<PlayingCard rank="Q" suit="hearts" size="wager" />`,
    },
    {
      label: "Rank Display",
      note: "A white rank with no suit mark.",
      code: `<PlayingCard rank="7" suit="clubs" variant="rank-display" />`,
    },
    {
      label: "Suit Display",
      note: "The colored suit mark with no rank.",
      code: `<PlayingCard rank="7" suit="hearts" variant="suit-display" />`,
    },
    {
      label: "Rank Target",
      note: "A white rank followed by a plus sign.",
      code: `<PlayingCard rank="7" suit="spades" variant="rank-target" />`,
    },
  ],
  demo: {
    defaultArgs: {
      rank: "10",
      suit: "hearts",
      size: "standard",
      variant: "rank-and-suit",
    },
  },
};
