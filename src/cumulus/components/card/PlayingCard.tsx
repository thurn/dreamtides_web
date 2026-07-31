// PlayingCard — a standard rank-and-suit index on the shared Cumulus glass.

import type { ReactElement } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { token } from "../../primitives/tokens";

/**
 * The deliberately centralized playing-card art direction. Change these
 * constants to retune the square, type, colors, superellipse, or suit optics.
 */
export const PLAYING_CARD_DESIGN = {
  sizes: {
    compact: {
      square: 104,
      fontSize: 40,
      rankSuitGap: 3,
      redCharacterOutlineWidth: 5,
      blackCharacterOutlineWidth: 5,
    },
    standard: {
      square: 156,
      fontSize: 65,
      rankSuitGap: 2,
      redCharacterOutlineWidth: 5,
      blackCharacterOutlineWidth: 5,
    },
  },
  fontFamily: "Inter",
  colors: {
    black: "#2196F3",
    red: "#FF9800",
    characterOutline: "#000000",
  },
  superellipseExponent: 4,
  superellipseSamples: 96,
  rimInsetPercent: 0.65,
  // Production card indices size and position suit marks optically instead of
  // trusting Unicode em boxes. These per-glyph values equalize apparent ink
  // weight with the rank and align their visual centers; the diamond needs the
  // largest scale because its pointed silhouette occupies less of its em box.
  suitOptics: {
    clubs: { scale: 0.9, verticalOffsetEm: 0.01 },
    diamonds: { scale: 0.8, verticalOffsetEm: 0 },
    hearts: { scale: 0.8, verticalOffsetEm: 0 },
    spades: { scale: 0.9, verticalOffsetEm: 0 },
  },
} as const;

export type PlayingCardRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type PlayingCardSuit = "clubs" | "diamonds" | "hearts" | "spades";

export type PlayingCardSize = keyof typeof PLAYING_CARD_DESIGN.sizes;

const SUIT_SYMBOLS: Record<PlayingCardSuit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const RED_SUITS: ReadonlySet<PlayingCardSuit> = new Set(["diamonds", "hearts"]);

function superellipsePoint(
  index: number,
  sampleCount: number,
  insetPercent: number,
): readonly [number, number] {
  const angle = (index / sampleCount) * Math.PI * 2;
  const power = 2 / PLAYING_CARD_DESIGN.superellipseExponent;
  const radius = (100 - insetPercent * 2) / 2;
  const x =
    50 +
    Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** power * radius;
  const y =
    50 +
    Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** power * radius;
  return [x, y];
}

function superellipsePoints(insetPercent: number): readonly string[] {
  return Array.from(
    { length: PLAYING_CARD_DESIGN.superellipseSamples },
    (_, index) => {
      const [x, y] = superellipsePoint(
        index,
        PLAYING_CARD_DESIGN.superellipseSamples,
        insetPercent,
      );
      return `${x.toFixed(3)}% ${y.toFixed(3)}%`;
    },
  );
}

const SUPERELLIPSE_CLIP_PATH = `polygon(${superellipsePoints(0).join(", ")})`;

const SUPERELLIPSE_RIM_PATH = superellipsePoints(
  PLAYING_CARD_DESIGN.rimInsetPercent,
)
  .map((point, index) => {
    const [x, y] = point.split(" ");
    return `${index === 0 ? "M" : "L"} ${x?.replace("%", "")} ${y?.replace("%", "")}`;
  })
  .join(" ")
  .concat(" Z");

export interface PlayingCardProps {
  /** Playing-card rank shown before the suit mark. */
  rank: PlayingCardRank;
  /** Standard playing-card suit. */
  suit: PlayingCardSuit;
  /** Named square and type-size tuple. Defaults to `standard`. */
  size?: PlayingCardSize;
}

/** A static glass playing card with an optically aligned rank-and-suit index. */
export function PlayingCard({
  rank,
  suit,
  size = "standard",
}: PlayingCardProps): ReactElement {
  const sizeSpec = PLAYING_CARD_DESIGN.sizes[size];
  const suitOptics = PLAYING_CARD_DESIGN.suitOptics[suit];
  const isRedSuit = RED_SUITS.has(suit);
  const foreground = isRedSuit
    ? PLAYING_CARD_DESIGN.colors.red
    : PLAYING_CARD_DESIGN.colors.black;
  const characterOutlineWidth = isRedSuit
    ? sizeSpec.redCharacterOutlineWidth
    : sizeSpec.blackCharacterOutlineWidth;

  return (
    <div
      role="img"
      aria-label={`${rank} of ${suit}`}
      data-playing-card={`${rank}-${suit}`}
      data-playing-card-rank={rank}
      data-playing-card-suit={suit}
      data-playing-card-size={size}
      style={{
        position: "relative",
        width: sizeSpec.square,
        height: sizeSpec.square,
        flex: "0 0 auto",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        clipPath: SUPERELLIPSE_CLIP_PATH,
        ...glassSurfaceStyle({ radius: null }),
        border: 0,
      }}
    >
      <span
        aria-hidden="true"
        data-playing-card-index=""
        style={{
          position: "relative",
          zIndex: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: sizeSpec.rankSuitGap,
          color: foreground,
          fontFamily: PLAYING_CARD_DESIGN.fontFamily,
          fontSize: sizeSpec.fontSize,
          fontWeight: 900,
          fontStyle: "normal",
          lineHeight: 1,
          letterSpacing: "-0.025em",
          whiteSpace: "nowrap",
          ...(characterOutlineWidth > 0
            ? {
                WebkitTextStroke: `${String(characterOutlineWidth)}px ${PLAYING_CARD_DESIGN.colors.characterOutline}`,
                paintOrder: "stroke fill",
              }
            : {}),
        }}
      >
        <span data-playing-card-rank-glyph="">{rank}</span>
        <span
          data-playing-card-suit-glyph=""
          style={{
            position: "relative",
            top: sizeSpec.fontSize * suitOptics.verticalOffsetEm,
            display: "inline-block",
            fontSize: sizeSpec.fontSize * suitOptics.scale,
            lineHeight: 1,
          }}
        >
          {SUIT_SYMBOLS[suit]}
        </span>
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <path
          d={SUPERELLIPSE_RIM_PATH}
          fill="none"
          stroke={token("--glass-rim")}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
