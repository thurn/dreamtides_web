// PlayingCard — a flippable playing-card display on the shared Cumulus glass.

import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactElement } from "react";
import type {
  StandardPlayingCardRank,
  StandardPlayingCardSuit,
} from "../../../types/gamble";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { token } from "../../primitives/tokens";

/**
 * The deliberately centralized playing-card art direction. Change these
 * constants to retune the square, type, colors, faces, motion, or suit optics.
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
  displayFontScale: 1.5,
  colors: {
    black: "#2196F3",
    red: "#FF9800",
    white: "#FFFFFF",
    characterOutline: "#000000",
  },
  backFace: {
    panelInsetPercent: 10,
    borderWidth: 0,
    checkerSquaresPerSide: 4,
  },
  flip: {
    perspective: 1000,
    durationSeconds: 0.42,
    ease: [0.22, 0.61, 0.36, 1],
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

export type PlayingCardRank = StandardPlayingCardRank;

export type PlayingCardSuit = StandardPlayingCardSuit;

export type PlayingCardSize = keyof typeof PLAYING_CARD_DESIGN.sizes;

export type PlayingCardFace = "front" | "back";

export type PlayingCardVariant =
  "rank-and-suit" | "rank-display" | "suit-display" | "rank-target";

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

const CARD_FACE_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  clipPath: SUPERELLIPSE_CLIP_PATH,
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  ...glassSurfaceStyle({ radius: null }),
  border: 0,
};

function PlayingCardRim(): ReactElement {
  return (
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
  );
}

export interface PlayingCardProps {
  /** Playing-card rank used by rank-bearing front variants. */
  rank: PlayingCardRank;
  /** Standard playing-card suit used by suit-bearing front variants. */
  suit: PlayingCardSuit;
  /** Named square and type-size tuple. Defaults to `standard`. */
  size?: PlayingCardSize;
  /** Visible side of the card. Defaults to `front`. */
  face?: PlayingCardFace;
  /** Front-face content treatment. Defaults to `rank-and-suit`. */
  variant?: PlayingCardVariant;
}

function frontAriaLabel(
  rank: PlayingCardRank,
  suit: PlayingCardSuit,
  variant: PlayingCardVariant,
): string {
  switch (variant) {
    case "rank-display":
      return `Rank ${rank}`;
    case "suit-display":
      return suit;
    case "rank-target":
      return `Rank target ${rank} or higher`;
    case "rank-and-suit":
      return `${rank} of ${suit}`;
  }
}

/** A glass playing card with animated front and checkerboard-back faces. */
export function PlayingCard({
  rank,
  suit,
  size = "standard",
  face = "front",
  variant = "rank-and-suit",
}: PlayingCardProps): ReactElement {
  const reduceMotion = useReducedMotion() === true;
  const sizeSpec = PLAYING_CARD_DESIGN.sizes[size];
  const suitOptics = PLAYING_CARD_DESIGN.suitOptics[suit];
  const isRedSuit = RED_SUITS.has(suit);
  const fontSize =
    sizeSpec.fontSize *
    (variant === "rank-display" || variant === "suit-display"
      ? PLAYING_CARD_DESIGN.displayFontScale
      : 1);
  const foreground =
    variant === "rank-display" || variant === "rank-target"
      ? PLAYING_CARD_DESIGN.colors.white
      : isRedSuit
        ? PLAYING_CARD_DESIGN.colors.red
        : PLAYING_CARD_DESIGN.colors.black;
  const characterOutlineWidth =
    (variant === "rank-and-suit" || variant === "suit-display") && isRedSuit
      ? sizeSpec.redCharacterOutlineWidth
      : sizeSpec.blackCharacterOutlineWidth;
  const backFace = PLAYING_CARD_DESIGN.backFace;
  const checkerTilePercent = (2 / backFace.checkerSquaresPerSide) * 100;

  return (
    <div
      role="img"
      aria-label={
        face === "front"
          ? frontAriaLabel(rank, suit, variant)
          : "Face-down playing card"
      }
      data-playing-card={`${rank}-${suit}`}
      data-playing-card-rank={rank}
      data-playing-card-suit={suit}
      data-playing-card-size={size}
      data-playing-card-face={face}
      data-playing-card-variant={variant}
      style={{
        position: "relative",
        width: sizeSpec.square,
        height: sizeSpec.square,
        flex: "0 0 auto",
        perspective: PLAYING_CARD_DESIGN.flip.perspective,
      }}
    >
      <motion.div
        data-playing-card-flip=""
        initial={false}
        animate={{ rotateY: face === "front" ? 0 : 180 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                duration: PLAYING_CARD_DESIGN.flip.durationSeconds,
                ease: PLAYING_CARD_DESIGN.flip.ease,
              }
        }
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          aria-hidden="true"
          data-playing-card-front=""
          style={{
            ...CARD_FACE_STYLE,
            display: "grid",
            placeItems: "center",
          }}
        >
          <span
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
              fontSize,
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
            {variant !== "suit-display" && (
              <span data-playing-card-rank-glyph="">{rank}</span>
            )}
            {variant === "rank-target" && (
              <span data-playing-card-target-glyph="">+</span>
            )}
            {(variant === "rank-and-suit" || variant === "suit-display") && (
              <span
                data-playing-card-suit-glyph=""
                style={{
                  position: "relative",
                  top: fontSize * suitOptics.verticalOffsetEm,
                  display: "inline-block",
                  fontSize: fontSize * suitOptics.scale,
                  lineHeight: 1,
                }}
              >
                {SUIT_SYMBOLS[suit]}
              </span>
            )}
          </span>
          <PlayingCardRim />
        </div>
        <div
          aria-hidden="true"
          data-playing-card-back=""
          style={{
            ...CARD_FACE_STYLE,
            transform: "rotateY(180deg)",
          }}
        >
          <div
            data-playing-card-back-border=""
            style={{
              position: "absolute",
              inset: `${String(backFace.panelInsetPercent)}%`,
              overflow: "hidden",
              clipPath: SUPERELLIPSE_CLIP_PATH,
              background: PLAYING_CARD_DESIGN.colors.characterOutline,
            }}
          >
            <div
              data-playing-card-checkerboard=""
              data-playing-card-checker-squares={backFace.checkerSquaresPerSide}
              style={{
                position: "absolute",
                inset: backFace.borderWidth,
                clipPath: SUPERELLIPSE_CLIP_PATH,
                backgroundColor: PLAYING_CARD_DESIGN.colors.black,
                backgroundImage: `conic-gradient(from 90deg, ${PLAYING_CARD_DESIGN.colors.black} 25%, ${PLAYING_CARD_DESIGN.colors.red} 0 50%, ${PLAYING_CARD_DESIGN.colors.black} 0 75%, ${PLAYING_CARD_DESIGN.colors.red} 0)`,
                backgroundSize: `${String(checkerTilePercent)}% ${String(checkerTilePercent)}%`,
              }}
            />
          </div>
          <PlayingCardRim />
        </div>
      </motion.div>
    </div>
  );
}
