import {
  PlayingCard,
  type PlayingCardFace,
  type PlayingCardRank,
  type PlayingCardSize,
  type PlayingCardSuit,
} from "../../components/card/PlayingCard";
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

function PlayingCardDemo(args: Record<string, unknown>) {
  const rank = RANKS.includes(args.rank as PlayingCardRank)
    ? (args.rank as PlayingCardRank)
    : "10";
  const suit = SUITS.includes(args.suit as PlayingCardSuit)
    ? (args.suit as PlayingCardSuit)
    : "hearts";
  const size: PlayingCardSize =
    args.size === "compact" ? "compact" : "standard";
  const face: PlayingCardFace = args.face === "back" ? "back" : "front";
  return <PlayingCard rank={rank} suit={suit} size={size} face={face} />;
}

export const playingCardDemo: CumulusComponent = {
  id: "playing-card",
  title: "Playing Card",
  blurb:
    "The standard rank-and-suit object: an Impact index and a bordered checkerboard back on a quartic-superellipse square made from the shared liquid glass.",
  callout:
    "Use the named size only; suit-specific optical corrections keep every Unicode mark aligned with its rank.",
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
      label: "Back Face",
      note: "The inset superellipse carries the canonical two-color checkerboard.",
      code: `<PlayingCard rank="A" suit="spades" face="back" />`,
    },
  ],
  demo: {
    defaultArgs: {
      rank: "10",
      suit: "hearts",
      size: "standard",
      face: "front",
    },
  },
};
