// PlayingCard — a playing-card display on the shared Cumulus glass.

import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactElement } from "react";
import type {
  GravokGateId,
  StandardPlayingCardRank,
  StandardPlayingCardSuit,
} from "../../../types/gamble";
import type { Dreamsign as DreamsignData } from "../../../types/journey";
import { requireDreamsignId } from "../../../data/dreamsigns";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { dreamsignRevealSpec } from "../hud/Dreamsign";
import { EssenceValue } from "../hud/EssenceValue";

type WagerRevealSourceBinding = ReturnType<typeof useRevealSource>;

/**
 * The deliberately centralized playing-card art direction. Change these
 * constants to retune the square, type, colors, motion, or suit optics.
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
    wagerCompact: {
      square: 116,
      fontSize: 46,
      rankSuitGap: 3,
      redCharacterOutlineWidth: 5,
      blackCharacterOutlineWidth: 5,
    },
    wager: {
      square: 188,
      fontSize: 76,
      rankSuitGap: 3,
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
  flip: {
    perspective: 1000,
    durationSeconds: 0.72,
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

/** Stable timing shared by card-flip choreography and the screen that stages it. */
export const PLAYING_CARD_FLIP_DURATION_MS = Math.round(
  PLAYING_CARD_DESIGN.flip.durationSeconds * 1000,
);

export type PlayingCardRank = StandardPlayingCardRank;

export type PlayingCardSuit = StandardPlayingCardSuit;

export type PlayingCardSize = keyof typeof PLAYING_CARD_DESIGN.sizes;

export type PlayingCardVariant =
  "rank-and-suit" | "rank-display" | "suit-display" | "rank-target";

/** Stable Gamble prize identities rendered by the shared wager object. */
export type WagerPrizeCardId =
  | GravokGateId
  | "ladder-climb"
  | "starway-1"
  | "starway-2"
  | "starway-3";

/** Named square sizes reserved for Gamble prize cards. */
export type WagerPrizeCardSize = "wagerCompact" | "wager";

/** Named copy treatment for a Gamble prize card. */
export type WagerPrizeCardPresentation = "draw-target" | "bust-range";

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

function PlayingCardIndex({
  rank,
  suit,
  size,
  variant,
}: {
  rank: PlayingCardRank;
  suit: PlayingCardSuit;
  size: PlayingCardSize;
  variant: PlayingCardVariant;
}): ReactElement {
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

  return (
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
  );
}

/** A glass playing card with a rank-and-suit front face. */
export function PlayingCard({
  rank,
  suit,
  size = "standard",
  variant = "rank-and-suit",
}: PlayingCardProps): ReactElement {
  const sizeSpec = PLAYING_CARD_DESIGN.sizes[size];

  return (
    <div
      role="img"
      aria-label={frontAriaLabel(rank, suit, variant)}
      data-playing-card={`${rank}-${suit}`}
      data-playing-card-rank={rank}
      data-playing-card-suit={suit}
      data-playing-card-size={size}
      data-playing-card-variant={variant}
      style={{
        position: "relative",
        width: sizeSpec.square,
        height: sizeSpec.square,
        flex: "0 0 auto",
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
        <PlayingCardIndex
          rank={rank}
          suit={suit}
          size={size}
          variant={variant}
        />
        <PlayingCardRim />
      </div>
    </div>
  );
}

interface WagerPrizeCardBaseProps {
  /** Stable Gamble choice represented by this prize object. */
  prizeId: WagerPrizeCardId;
  /** Inclusive rank range shown as authored compact notation. */
  targetLabel: string;
  /** Named desktop or mobile square size. Defaults to `wager`. */
  size?: WagerPrizeCardSize;
  /** Committed card shown on the reverse face after a bet. */
  drawnCard?: {
    rank: PlayingCardRank;
    suit: PlayingCardSuit;
  } | null;
  /** Turn the prize face over to its committed card. */
  revealDrawnCard?: boolean;
  /** Optional stable selector for the prize Dreamsign name. */
  dreamsignTestId?: string;
  /** Named semantic copy treatment. Defaults to `draw-target`. */
  presentation?: WagerPrizeCardPresentation;
}

/** A prize always carries Essence, a Dreamsign, or both. */
export type WagerPrizeCardProps = WagerPrizeCardBaseProps &
  (
    | {
        /** Essence awarded on a win. */
        essenceReward: number;
        /** Dreamsign appended to the Essence reward, when present. */
        rewardDreamsign: DreamsignData | null;
      }
    | {
        /** Null selects a Dreamsign-only prize. */
        essenceReward: null;
        /** Dreamsign used as the complete reward. */
        rewardDreamsign: DreamsignData;
      }
  );

/**
 * A Gamble prize on the PlayingCard superellipse. Its reward copy stays one
 * sentence, and an assigned result flips into the standard rank-and-suit face
 * without changing the object's footprint.
 */
export function WagerPrizeCard(
  props: WagerPrizeCardProps,
): ReactElement {
  if (props.rewardDreamsign !== null) {
    return (
      <DreamsignWagerPrizeCard
        {...props}
        rewardDreamsign={props.rewardDreamsign}
      />
    );
  }
  return <WagerPrizeCardObject {...props} />;
}

function DreamsignWagerPrizeCard(
  props: WagerPrizeCardProps & { rewardDreamsign: DreamsignData },
): ReactElement {
  const dreamsignId = requireDreamsignId(
    props.rewardDreamsign,
    "Wager prize card",
  );
  const revealBinding = useRevealSource({
    identity: {
      entityType: "dreamsign",
      entityId: revealEntityId("dreamsign", dreamsignId),
    },
    spec: dreamsignRevealSpec(
      props.rewardDreamsign,
      Boolean(props.rewardDreamsign.imageName),
    ),
    feedback: "stationary",
  });

  return <WagerPrizeCardObject {...props} revealBinding={revealBinding} />;
}

function WagerPrizeCardObject({
  prizeId,
  targetLabel,
  essenceReward,
  rewardDreamsign,
  size = "wager",
  drawnCard = null,
  revealDrawnCard = false,
  dreamsignTestId,
  presentation = "draw-target",
  revealBinding,
}: WagerPrizeCardProps & {
  revealBinding?: WagerRevealSourceBinding;
}): ReactElement {
  const reduceMotion = useReducedMotion() === true;
  const sizeSpec = PLAYING_CARD_DESIGN.sizes[size];
  const showingDrawnCard = revealDrawnCard && drawnCard !== null;
  const rewardLabel = essenceReward === null
    ? rewardDreamsign?.name ?? ""
    : `${String(essenceReward)} Essence${
        rewardDreamsign === null ? "" : ` and ${rewardDreamsign.name}`
      }`;
  const prizeLabel = presentation === "bust-range"
    ? `Ranks ${targetLabel} bust. Prize ${rewardLabel}.`
    : `Draw ${targetLabel}. Win ${rewardLabel}.`;
  const drawnCardLabel =
    drawnCard === null
      ? prizeLabel
      : frontAriaLabel(drawnCard.rank, drawnCard.suit, "rank-and-suit");
  const prizeFaceContent = (
    <>
      <div
        data-wager-prize-copy=""
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          padding:
            size === "wager" ? token("--space-4") : token("--space-2"),
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: size === "wager" ? token("--space-3") : token("--space-2"),
          textAlign: "center",
          color: token("--text-on-glass"),
        }}
      >
        <h2
          data-wager-prize-title=""
          style={{
            margin: 0,
            font:
              size === "wager"
                ? token("--t-title")
                : presentation === "bust-range"
                  ? token("--t-tutorial-dialogue")
                  : token("--t-title-sm"),
            whiteSpace: presentation === "bust-range" ? "nowrap" : undefined,
          }}
        >
          {presentation === "bust-range"
            ? `Bust ${targetLabel}`
            : `Draw ${targetLabel}`}
        </h2>
        <p
          data-wager-prize-description=""
          style={{
            margin: 0,
            font:
              size === "wager" ? token("--t-body") : token("--t-body-sm"),
          }}
        >
          {presentation === "bust-range" ? "Prize: " : "Win "}
          {essenceReward !== null && (
            <EssenceValue amount={essenceReward} tone="inherit" />
          )}
          {essenceReward !== null && rewardDreamsign !== null && " and "}
          {rewardDreamsign !== null && (
            <span
              data-testid={dreamsignTestId}
              data-wager-prize-dreamsign-name=""
              style={{
                display: "inline-block",
                font: "inherit",
                textDecoration: "underline",
              }}
            >
              {rewardDreamsign.name}
            </span>
          )}
        </p>
      </div>
      <PlayingCardRim />
    </>
  );
  const prizeFaceStyle: CSSProperties = {
    ...CARD_FACE_STYLE,
    ...revealBinding?.sourceProps.style,
    display: "grid",
    placeItems: "center",
    pointerEvents: showingDrawnCard ? "none" : "auto",
  };

  return (
    <div
      role={showingDrawnCard ? "img" : "group"}
      aria-label={showingDrawnCard ? drawnCardLabel : prizeLabel}
      data-wager-prize-card={prizeId}
      data-wager-prize-card-state={showingDrawnCard ? "drawn" : "prize"}
      data-wager-prize-card-size={size}
      data-wager-prize-drawn-card={
        drawnCard === null ? undefined : `${drawnCard.rank}-${drawnCard.suit}`
      }
      data-playing-card={
        showingDrawnCard
          ? `${drawnCard?.rank ?? "A"}-${drawnCard?.suit ?? "spades"}`
          : undefined
      }
      data-playing-card-face={showingDrawnCard ? "front" : undefined}
      style={{
        position: "relative",
        width: sizeSpec.square,
        height: sizeSpec.square,
        flex: "0 0 auto",
        perspective: PLAYING_CARD_DESIGN.flip.perspective,
      }}
    >
      <motion.div
        data-wager-prize-card-flip=""
        initial={false}
        animate={{ rotateY: showingDrawnCard ? 180 : 0 }}
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
        {revealBinding === undefined ? (
          <div
            aria-hidden={showingDrawnCard || undefined}
            data-wager-prize-face=""
            style={prizeFaceStyle}
          >
            {prizeFaceContent}
          </div>
        ) : (
          <Pressable
            as="div"
            ref={revealBinding.ref}
            {...revealBinding.sourceProps}
            role="button"
            tabIndex={showingDrawnCard ? -1 : 0}
            aria-label={`Dreamsign: ${rewardDreamsign?.name ?? ""}`}
            aria-hidden={showingDrawnCard || undefined}
            pressFeedback="stationary"
            hoverFeedback="stationary"
            data-wager-prize-face=""
            data-wager-prize-dreamsign-source=""
            style={prizeFaceStyle}
          >
            {prizeFaceContent}
          </Pressable>
        )}
        <div
          aria-hidden={!showingDrawnCard || undefined}
          data-wager-drawn-card-face=""
          style={{
            ...CARD_FACE_STYLE,
            display: "grid",
            placeItems: "center",
            transform: "rotateY(180deg)",
          }}
        >
          {drawnCard !== null && (
            <PlayingCardIndex
              rank={drawnCard.rank}
              suit={drawnCard.suit}
              size={size}
              variant="rank-and-suit"
            />
          )}
          <PlayingCardRim />
        </div>
      </motion.div>
    </div>
  );
}
