import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { token } from "../../primitives/tokens";
import {
  CardView,
  GameCard,
  type GameCardModel,
} from "../card/CardView";
import {
  CARD_ASPECT_H,
  CARD_ASPECT_RATIO,
  CARD_ASPECT_W,
} from "../card/card-aspect";
import { CardBack } from "./CardBack";
import { Pressable } from "../../primitives/Pressable";

/** A face-down physical card instance. */
export interface FaceDownPileCard {
  readonly face: "down";
  /** Stable battle-card instance id used for continuity across zones. */
  readonly id: string;
}

/** A face-up physical card instance and its canonical display snapshot. */
export interface FaceUpPileCard {
  readonly face: "up";
  /** Stable battle-card instance id used for continuity across zones. */
  readonly id: string;
  /** Canonical UUID-backed card model rendered by GameCard. */
  readonly model: GameCardModel;
  /** Whether this rendered location should participate in shared-layout travel. */
  readonly layoutMotion?: "travel" | "snap";
  /** Render the topmost object with the figment frame. */
  readonly figment?: boolean;
  /** Render a title bar on a named figment. */
  readonly figmentTitleBar?: boolean;
}

/** A physical card instance in a pile, ordered topmost-first by callers. */
export type BattlePileCard = FaceDownPileCard | FaceUpPileCard;

/** The two physical ways a pile may rest on the battle surface. */
export type CardPileOrientation = "portrait" | "landscape";

/** Whether face-up pile cards participate in the shared reveal interaction. */
export type CardPileCardInteraction = "inactive" | "reveal";

/** The treatment used when a pile has no physical cards to render. */
export type CardPileEmptyState = "hidden" | "outlined";

export interface CardPileProps {
  /** Cards ordered topmost-first. At most three physical layers are rendered. */
  readonly cards: readonly BattlePileCard[];
  /** Whether cards rest upright or sideways. */
  readonly orientation: CardPileOrientation;
  /** Accessible name for the card zone represented by this pile. */
  readonly label: string;
  /** Reveal behavior for face-up cards. Defaults to `reveal`. */
  readonly cardInteraction?: CardPileCardInteraction;
  /** Treatment shown when the pile has no cards. Defaults to `hidden`. */
  readonly emptyState?: CardPileEmptyState;
  /** Activates the pile as one zone control. */
  readonly onActivate?: () => void;
  /** Optional stable test id for the pile as a whole. */
  readonly testId?: string;
}

/** Maximum number of physical card layers a pile paints. */
export const CARD_PILE_VISIBLE_LAYER_CAP = 3;

const LANDSCAPE_ASPECT_RATIO = `${String(CARD_ASPECT_H)} / ${String(CARD_ASPECT_W)}`;
const LANDSCAPE_CARD_WIDTH = `${String((CARD_ASPECT_W / CARD_ASPECT_H) * 100)}%`;
const LAYER_SHIFT_BY_RAISED_LAYERS = [
  "0",
  token("--space-1"),
  token("--space-2"),
] as const;

function cardStageStyle(orientation: CardPileOrientation): CSSProperties {
  if (orientation === "portrait") {
    return {
      position: "absolute",
      inset: 0,
    };
  }

  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    // Before rotation the portrait stage is root-height wide and root-width
    // tall. Rotating it therefore fills the landscape pile's 7:5 footprint.
    width: LANDSCAPE_CARD_WIDTH,
    aspectRatio: CARD_ASPECT_RATIO,
    transform: "translate(-50%, -50%) rotate(90deg)",
    transformOrigin: "center",
  };
}

function EmptyPileOutline() {
  return (
    <div
      aria-hidden="true"
      data-card-pile-empty=""
      style={{
        position: "absolute",
        inset: 0,
        boxSizing: "border-box",
        border: token("--battlefield-slot-border"),
        borderRadius: token("--radius-card"),
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * A compact physical stack of cards for decks and voids. The first model is
 * the topmost card; deeper cards peek down-left beneath it, capped at three
 * visible layers. Each card carries a shared-layout identity so the same
 * battle instance can travel continuously between zones.
 */
export function CardPile({
  cards,
  orientation,
  label,
  cardInteraction = "reveal",
  emptyState = "hidden",
  onActivate,
  testId,
}: CardPileProps) {
  const visibleCards = cards.slice(0, CARD_PILE_VISIBLE_LAYER_CAP);
  const stageStyle = cardStageStyle(orientation);

  const layers = visibleCards.map((card, depth) => {
    const raisedLayers = visibleCards.length - depth - 1;
    const shiftX = LAYER_SHIFT_BY_RAISED_LAYERS[raisedLayers] ?? "0";
    const shiftY =
      raisedLayers === 0 ? "0" : `calc(-1 * ${shiftX})`;

    return (
      <motion.div
        key={card.id}
        layoutId={
          card.face === "up" && card.layoutMotion === "snap"
            ? undefined
            : `battle-card:${card.id}`
        }
        data-card-pile-layer=""
        data-battle-card-id={card.id}
        data-card-face={card.face}
        data-battle-card-layout-motion={
          card.face === "up" && card.layoutMotion === "snap"
            ? "snap"
            : "travel"
        }
        data-pile-depth={String(depth)}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: visibleCards.length - depth,
          transition: token("--motion-object-travel"),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${shiftX}, ${shiftY})`,
          }}
        >
          <div style={stageStyle}>
            {card.face === "down" ? (
              <CardBack label={`${label}, face-down card ${String(depth + 1)}`} />
            ) : cardInteraction === "reveal" ? (
              <GameCard
                model={card.model}
                figment={card.figment}
                figmentTitleBar={card.figmentTitleBar}
              />
            ) : (
              <CardView
                card={card.model.displaySnapshot}
                transfiguration={card.model.transfiguration}
                figment={card.figment}
                figmentTitleBar={card.figmentTitleBar}
              />
            )}
          </div>
        </div>
      </motion.div>
    );
  });
  const rootStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio:
      orientation === "portrait"
        ? CARD_ASPECT_RATIO
        : LANDSCAPE_ASPECT_RATIO,
    overflow: "visible",
  };
  const sharedProps = {
    "aria-label": label,
    "data-card-pile": "",
    "data-pile-orientation": orientation,
    "data-pile-count": String(cards.length),
    "data-pile-visible-count": String(visibleCards.length),
    "data-pile-card-interaction": cardInteraction,
    "data-pile-empty-state": emptyState,
    "data-testid": testId,
  } as const;

  if (onActivate !== undefined) {
    return (
      <Pressable
        as="button"
        {...sharedProps}
        onClick={onActivate}
        style={{
          ...rootStyle,
          display: "block",
          appearance: "none",
          padding: 0,
          border: 0,
          background: "transparent",
        }}
      >
        {layers}
        {visibleCards.length === 0 && emptyState === "outlined" ? <EmptyPileOutline /> : null}
      </Pressable>
    );
  }

  return (
    <div
      role="group"
      {...sharedProps}
      style={rootStyle}
    >
      {layers}
      {visibleCards.length === 0 && emptyState === "outlined" ? <EmptyPileOutline /> : null}
    </div>
  );
}
