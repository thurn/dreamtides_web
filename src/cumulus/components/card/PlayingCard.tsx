// PlayingCard — a playing-card display on the shared Cumulus glass.

import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactElement } from "react";
import type {
  GravokGateId,
  StandardPlayingCardRank,
  StandardPlayingCardSuit,
} from "../../../types/gamble";
import { requireDreamsignId } from "../../../data/dreamsigns";
import { glassAccentChrome } from "../../internal/control-treatment";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { dreamsignRevealSpec, type LocalizedDreamsign } from "../hud/Dreamsign";
import { opaque, tx, txa, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

type WagerRevealSourceBinding = ReturnType<typeof useRevealSource>;

/**
 * The deliberately centralized playing-card art direction. Change these
 * constants to retune the square, type, colors, motion, or suit optics.
 */
export const PLAYING_CARD_DESIGN = {
  sizes: {
    wagerCompact: {
      square: 116,
      fontSize: 46,
      rankSuitGap: token("--space-xxs"),
      redCharacterOutlineWidth: 5,
      blackCharacterOutlineWidth: 5,
    },
    wager: {
      square: 188,
      fontSize: 76,
      rankSuitGap: token("--space-xxs"),
      redCharacterOutlineWidth: 5,
      blackCharacterOutlineWidth: 5,
    },
  },
  fontFamily: "Inter",
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

/** Named optical sizes for the shared outlined suit mark. */
export type PlayingCardSuitMarkSize =
  | "indexCompact"
  | "index"
  | "fourSuitCompact"
  | "fourSuit"
  | "rewardCompact"
  | "reward";

/** Stable Gamble prize identities rendered by the shared wager object. */
export type WagerPrizeCardId =
  | GravokGateId
  | "ladder-climb"
  | "starway-1"
  | "starway-2"
  | "starway-3"
  | "blackjack";

/** Named square sizes reserved for Gamble prize cards. */
export type WagerPrizeCardSize = "wagerCompact" | "wager";

/** Semantic visual priority for a wager prize within a multi-tier choice. */
export type WagerPrizeCardEmphasis = "standard" | "current" | "muted";

const SUIT_SYMBOLS: Record<PlayingCardSuit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const RED_SUITS: ReadonlySet<PlayingCardSuit> = new Set(["diamonds", "hearts"]);
const FOUR_SUIT_FACE_ORDER: readonly PlayingCardSuit[] = [
  "spades",
  "hearts",
  "diamonds",
  "clubs",
];

const PLAYING_CARD_SUIT_MARK_SPECS: Readonly<
  Record<
    PlayingCardSuitMarkSize,
    { readonly fontSize: number; readonly outlineWidth: number }
  >
> = {
  indexCompact: {
    fontSize: PLAYING_CARD_DESIGN.sizes.wagerCompact.fontSize,
    outlineWidth:
      PLAYING_CARD_DESIGN.sizes.wagerCompact.blackCharacterOutlineWidth,
  },
  index: {
    fontSize: PLAYING_CARD_DESIGN.sizes.wager.fontSize,
    outlineWidth: PLAYING_CARD_DESIGN.sizes.wager.blackCharacterOutlineWidth,
  },
  fourSuitCompact: { fontSize: 46, outlineWidth: 4 },
  fourSuit: { fontSize: 68, outlineWidth: 5 },
  rewardCompact: { fontSize: 36, outlineWidth: 3 },
  reward: { fontSize: 40, outlineWidth: 3 },
};

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

function PlayingCardRim({
  emphasis = "standard",
}: {
  emphasis?: "standard" | "current";
}): ReactElement {
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
        stroke={
          emphasis === "current"
            ? token("--border-accent-glass")
            : token("--glass-rim")
        }
        strokeWidth={emphasis === "current" ? "5" : "1"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function frontAriaLabel(
  rank: PlayingCardRank,
  suit: PlayingCardSuit,
): LocalizedString {
  return txa(
    "{rank} of {suit}",
    { rank, suit },
    "[accessibility] Name for a revealed standard playing card. rank and suit are its canonical authored display values.",
  );
}

export interface PlayingCardSuitMarkProps {
  /** Suit whose canonical color and symbol are rendered. */
  suit: PlayingCardSuit;
  /** Named optical footprint for a card index, four-suit face, or reward row. */
  size: PlayingCardSuitMarkSize;
}

/** The canonical colored playing-card suit with an optically balanced black outline. */
export function PlayingCardSuitMark({
  suit,
  size,
}: PlayingCardSuitMarkProps): ReactElement {
  const sizeSpec = PLAYING_CARD_SUIT_MARK_SPECS[size];
  const suitOptics = PLAYING_CARD_DESIGN.suitOptics[suit];
  const isRedSuit = RED_SUITS.has(suit);
  const foreground = isRedSuit
    ? PLAYING_CARD_DESIGN.colors.red
    : PLAYING_CARD_DESIGN.colors.black;

  return (
    <span
      aria-hidden="true"
      data-playing-card-suit-mark={suit}
      data-playing-card-suit-mark-size={size}
      style={{
        width: sizeSpec.fontSize,
        height: sizeSpec.fontSize,
        display: "inline-grid",
        placeItems: "center",
        flex: "0 0 auto",
        color: foreground,
        fontFamily: PLAYING_CARD_DESIGN.fontFamily,
        fontSize: sizeSpec.fontSize,
        fontWeight: 900,
        fontStyle: "normal",
        lineHeight: 1,
      }}
    >
      <span
        data-playing-card-suit-glyph=""
        style={{
          position: "relative",
          top: sizeSpec.fontSize * suitOptics.verticalOffsetEm,
          display: "inline-block",
          lineHeight: 1,
          transform: `scale(${String(suitOptics.scale)})`,
          WebkitTextStroke: `${String(sizeSpec.outlineWidth)}px ${PLAYING_CARD_DESIGN.colors.characterOutline}`,
          paintOrder: "stroke fill",
        }}
      >
        {SUIT_SYMBOLS[suit]}
      </span>
    </span>
  );
}

function PlayingCardIndex({
  rank,
  suit,
  size,
}: {
  rank: PlayingCardRank;
  suit: PlayingCardSuit;
  size: WagerPrizeCardSize;
}): ReactElement {
  const sizeSpec = PLAYING_CARD_DESIGN.sizes[size];
  const isRedSuit = RED_SUITS.has(suit);
  const fontSize = sizeSpec.fontSize;
  const foreground = isRedSuit
    ? PLAYING_CARD_DESIGN.colors.red
    : PLAYING_CARD_DESIGN.colors.black;
  const characterOutlineWidth = isRedSuit
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
      }}
    >
      <span
        data-playing-card-rank-glyph=""
        style={{
          WebkitTextStroke: `${String(characterOutlineWidth)}px ${PLAYING_CARD_DESIGN.colors.characterOutline}`,
          paintOrder: "stroke fill",
        }}
      >
        {rank}
      </span>
      <PlayingCardSuitMark
        suit={suit}
        size={size === "wager" ? "index" : "indexCompact"}
      />
    </span>
  );
}

interface PlayingCardBaseProps {
  /** Named Gamble playing-card size. Defaults to `wager`. */
  size?: WagerPrizeCardSize;
  /** Accent the card rim when it is the current choice. */
  emphasis?: "standard" | "current";
}

type RankSuitPlayingCardProps = PlayingCardBaseProps & {
  /** Render a visible rank-and-suit card face. */
  variant: "rankSuit";
  /** Rank shown on the visible card face. */
  rank: PlayingCardRank;
  /** Suit shown on the visible card face. */
  suit: PlayingCardSuit;
  drawnCard?: never;
  revealDrawnCard?: never;
};

type FourSuitPlayingCardProps = PlayingCardBaseProps & {
  /** Render the concealed four-suit face, optionally flipping to a committed draw. */
  variant: "fourSuit";
  rank?: never;
  suit?: never;
  /** Committed result available on the reverse face. */
  drawnCard: {
    rank: PlayingCardRank;
    suit: PlayingCardSuit;
  } | null;
  /** Flip the concealed four-suit face to the committed result. */
  revealDrawnCard?: boolean;
};

type FaceDownPlayingCardProps = PlayingCardBaseProps & {
  /** Render a conventional face-down card, optionally flipping to its committed face. */
  variant: "faceDown";
  rank?: never;
  suit?: never;
  /** Committed face available when the dealer reveals this card. */
  drawnCard: {
    rank: PlayingCardRank;
    suit: PlayingCardSuit;
  };
  /** Flip the face-down card to its committed rank and suit. */
  revealDrawnCard?: boolean;
};

/** Official visible, face-down, and concealed-four-suit playing-card variants. */
export type PlayingCardProps =
  | RankSuitPlayingCardProps
  | FourSuitPlayingCardProps
  | FaceDownPlayingCardProps;

/**
 * A standalone playing card on the shared glass superellipse. Four-Suit
 * Reprise uses its concealed suit-grid variant and built-in result flip.
 */
export function PlayingCard(props: PlayingCardProps): ReactElement {
  const resolve = useLocalizer();
  const reduceMotion = useReducedMotion() === true;
  const size = props.size ?? "wager";
  const emphasis = props.emphasis ?? "standard";
  const sizeSpec = PLAYING_CARD_DESIGN.sizes[size];
  const showingDrawnCard =
    props.variant !== "rankSuit" &&
    props.revealDrawnCard === true &&
    props.drawnCard !== null;
  const visibleCard =
    props.variant === "rankSuit"
      ? { rank: props.rank, suit: props.suit }
      : showingDrawnCard
        ? props.drawnCard
        : null;
  const label =
    visibleCard === null
      ? tx(
          "Face-down four-suit playing card",
          "[accessibility] [gamble] Name for a concealed Four-Suit Reprise playing card.",
        )
      : frontAriaLabel(visibleCard.rank, visibleCard.suit);
  const state =
    props.variant === "rankSuit"
      ? "visible"
      : showingDrawnCard
        ? "drawn"
        : "concealed";
  const surfaceStyle: CSSProperties = {
    ...CARD_FACE_STYLE,
    ...(emphasis === "current"
      ? { ...glassAccentChrome("onMedia"), border: 0 }
      : {}),
    display: "grid",
    placeItems: "center",
  };

  const rankSuitContent =
    visibleCard === null ? null : (
      <PlayingCardIndex
        rank={visibleCard.rank}
        suit={visibleCard.suit}
        size={size}
      />
    );

  return (
    <div
      role="img"
      aria-label={resolve(label)}
      data-playing-card={
        visibleCard === null
          ? props.variant === "faceDown"
            ? "face-down"
            : "four-suit"
          : `${visibleCard.rank}-${visibleCard.suit}`
      }
      data-playing-card-variant={props.variant}
      data-playing-card-state={state}
      data-playing-card-face={visibleCard === null ? "reverse" : "front"}
      style={{
        position: "relative",
        width: sizeSpec.square,
        height: sizeSpec.square,
        flex: "0 0 auto",
        perspective: PLAYING_CARD_DESIGN.flip.perspective,
      }}
    >
      {props.variant === "rankSuit" ? (
        <div data-playing-card-surface="" style={surfaceStyle}>
          {rankSuitContent}
          <PlayingCardRim emphasis={emphasis} />
        </div>
      ) : (
        <motion.div
          data-playing-card-flip=""
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
          <div
            aria-hidden={showingDrawnCard || undefined}
            data-playing-card-concealed-face={props.variant}
            data-playing-card-four-suit-face={
              props.variant === "fourSuit" ? "" : undefined
            }
            data-playing-card-face-down={
              props.variant === "faceDown" ? "" : undefined
            }
            style={surfaceStyle}
          >
            <div
              data-four-suit-playing-card-face=""
              style={{
                position: "relative",
                zIndex: 1,
                display: "grid",
                gridTemplateColumns: "repeat(2, max-content)",
                gridTemplateRows: "repeat(2, max-content)",
                placeItems: "center",
                gap: token("--space-xxs"),
              }}
            >
              {FOUR_SUIT_FACE_ORDER.map((suit) => (
                <PlayingCardSuitMark
                  key={suit}
                  suit={suit}
                  size={size === "wager" ? "fourSuit" : "fourSuitCompact"}
                />
              ))}
            </div>
            <PlayingCardRim emphasis={emphasis} />
          </div>
          <div
            aria-hidden={!showingDrawnCard || undefined}
            data-playing-card-drawn-face=""
            style={{
              ...surfaceStyle,
              transform: "rotateY(180deg)",
            }}
          >
            {rankSuitContent}
            <PlayingCardRim emphasis={emphasis} />
          </div>
        </motion.div>
      )}
    </div>
  );
}

export interface WagerPrizeCardProps {
  /** Stable Gamble choice represented by this prize object. */
  prizeId: WagerPrizeCardId;
  /** Lowest rank in the inclusive winning range through Ace. */
  minimumWinningRank: PlayingCardRank;
  /** Named desktop or mobile square size. Defaults to `wager`. */
  size?: WagerPrizeCardSize;
  /** Committed card shown on the reverse face after a bet. */
  drawnCard: {
    rank: PlayingCardRank;
    suit: PlayingCardSuit;
  } | null;
  /** Turn the prize face over to its committed card. */
  revealDrawnCard?: boolean;
  /** Optional stable selector for the prize Dreamsign name. */
  dreamsignTestId?: string;
  /** Accent current tier, foreground-muted alternative, or standard priority. */
  emphasis?: WagerPrizeCardEmphasis;
  /** Essence awarded on a win. */
  essenceReward: number;
  /** Dreamsign appended to the Essence reward, when present. */
  rewardDreamsign: LocalizedDreamsign | null;
}

/**
 * A Gamble prize on the PlayingCard superellipse. Its reward copy stays one
 * sentence, and an assigned result flips into the standard rank-and-suit face
 * without changing the object's footprint.
 */
export function WagerPrizeCard(props: WagerPrizeCardProps): ReactElement {
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
  props: WagerPrizeCardProps & { rewardDreamsign: LocalizedDreamsign },
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
  minimumWinningRank,
  size = "wager",
  drawnCard,
  revealDrawnCard = false,
  dreamsignTestId,
  emphasis = "standard",
  essenceReward,
  rewardDreamsign,
  revealBinding,
}: WagerPrizeCardProps & {
  revealBinding?: WagerRevealSourceBinding;
}): ReactElement {
  const resolve = useLocalizer();
  const reduceMotion = useReducedMotion() === true;
  const sizeSpec = PLAYING_CARD_DESIGN.sizes[size];
  const showingDrawnCard = revealDrawnCard && drawnCard !== null;
  const prizeLabel =
    rewardDreamsign === null
      ? txa(
          "Draw {minimum_rank}-A. Win {essence_amount} Essence.",
          { minimum_rank: minimumWinningRank, essence_amount: essenceReward },
          "[accessibility] [dreamsign] Complete name for a wager prize without a Dreamsign. minimum_rank is the lowest standard playing-card rank in the inclusive winning range through Ace, and essence_amount is the positive Essence payout.",
        )
      : txa(
          "Draw {minimum_rank}-A. Win {essence_amount} Essence and {dreamsign_name}.",
          {
            minimum_rank: minimumWinningRank,
            essence_amount: essenceReward,
            dreamsign_name: opaque(rewardDreamsign.name),
          },
          "[accessibility] [dreamsign] Complete name for a wager prize that includes a Dreamsign. minimum_rank is the lowest standard playing-card rank in the inclusive winning range through Ace, essence_amount is the positive Essence payout, and dreamsign_name is the canonical authored Dreamsign name.",
        );
  const drawnCardLabel =
    drawnCard === null
      ? prizeLabel
      : frontAriaLabel(drawnCard.rank, drawnCard.suit);
  const prizeDescription =
    rewardDreamsign === null
      ? txa(
          "Win {essence_amount} Essence.",
          { essence_amount: essenceReward },
          "[dreamsign] Reward sentence on a wager prize without a Dreamsign. essence_amount is the positive Essence payout.",
        )
      : txa(
          "Win {essence_amount} Essence and {dreamsign_name}.",
          {
            essence_amount: essenceReward,
            dreamsign_name: opaque(rewardDreamsign.name),
          },
          "[dreamsign] Reward sentence on a wager prize that includes a Dreamsign. essence_amount is the positive Essence payout and dreamsign_name is the canonical authored Dreamsign name.",
        );
  const prizeFaceContent = (
    <>
      <div
        data-wager-prize-copy=""
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          padding: size === "wager" ? token("--space-s") : token("--space-xs"),
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: size === "wager" ? token("--space-s") : token("--space-xs"),
          textAlign: "center",
          color:
            emphasis === "muted"
              ? token("--text-on-glass-muted")
              : token("--text-on-glass"),
          transition: reduceMotion
            ? undefined
            : `color ${token("--dur-fast")} ${token("--ease-out")}`,
        }}
      >
        <h2
          data-wager-prize-title=""
          style={{
            margin: 0,
            font: size === "wager" ? token("--t-title") : token("--t-title-sm"),
          }}
        >
          {resolve(
            txa(
              "Draw {minimum_rank}-A",
              { minimum_rank: minimumWinningRank },
              "[ui] Title printed on a wager prize card before its concealed playing card is revealed. minimum_rank is the lowest standard playing-card rank in the inclusive winning range through Ace.",
            ),
          )}
        </h2>
        <p
          data-wager-prize-description=""
          style={{
            margin: 0,
            font: size === "wager" ? token("--t-body") : token("--t-body-sm"),
          }}
        >
          <span
            data-testid={rewardDreamsign === null ? undefined : dreamsignTestId}
            data-wager-prize-dreamsign-name={
              rewardDreamsign === null ? undefined : ""
            }
          >
            {resolve(prizeDescription)}
          </span>
        </p>
      </div>
      <PlayingCardRim
        emphasis={emphasis === "current" ? "current" : "standard"}
      />
    </>
  );
  const prizeFaceStyle: CSSProperties = {
    ...CARD_FACE_STYLE,
    ...(emphasis === "current"
      ? { ...glassAccentChrome("onMedia"), border: 0 }
      : {}),
    ...revealBinding?.sourceProps.style,
    display: "grid",
    placeItems: "center",
    pointerEvents: showingDrawnCard ? "none" : "auto",
  };

  return (
    <div
      role={showingDrawnCard ? "img" : "group"}
      aria-label={resolve(showingDrawnCard ? drawnCardLabel : prizeLabel)}
      data-wager-prize-card={prizeId}
      data-wager-prize-card-state={showingDrawnCard ? "drawn" : "prize"}
      data-wager-prize-card-size={size}
      data-wager-prize-card-emphasis={emphasis}
      data-wager-prize-target={`${minimumWinningRank}-A`}
      data-wager-prize-essence-reward={essenceReward}
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
        {revealBinding === undefined || rewardDreamsign === null ? (
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
            ariaLabelMessage={txa(
              "Dreamsign: {dreamsign_name}",
              { dreamsign_name: opaque(rewardDreamsign.name) },
              "[accessibility] [dreamsign] Name for an interactive Dreamsign object. dreamsign_name is its canonical authored display name and has unknown grammatical gender.",
            )}
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
            ...(emphasis === "current"
              ? { ...glassAccentChrome("onMedia"), border: 0 }
              : {}),
            display: "grid",
            placeItems: "center",
            transform: "rotateY(180deg)",
          }}
        >
          {drawnCard !== null && (
            <div
              data-wager-drawn-card-content=""
              style={{
                display: "grid",
                placeItems: "center",
                filter: emphasis === "muted" ? "grayscale(1)" : undefined,
                transition: reduceMotion
                  ? undefined
                  : `filter ${token("--dur-fast")} ${token("--ease-out")}`,
              }}
            >
              <PlayingCardIndex
                rank={drawnCard.rank}
                suit={drawnCard.suit}
                size={size}
              />
            </div>
          )}
          <PlayingCardRim
            emphasis={emphasis === "current" ? "current" : "standard"}
          />
        </div>
      </motion.div>
    </div>
  );
}
