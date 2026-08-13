import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { token } from "../../primitives/tokens";
import { CardView, type GameCardModel } from "../card/CardView";
import {
  CARD_ASPECT_H,
  CARD_ASPECT_RATIO,
  CARD_ASPECT_W,
} from "../card/card-aspect";
import { CardBack } from "./CardBack";
import { battleCardLayoutId } from "./battle-card-layout";
import { Pressable } from "../../primitives/Pressable";
import { txa, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

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
}

/** A physical card instance in a pile, ordered topmost-first by callers. */
export type BattlePileCard = FaceDownPileCard | FaceUpPileCard;

/** The treatment used when a pile has no physical cards to render. */
export type CardPileEmptyState = "hidden" | "outlined";

export interface CardPileProps {
  /** Cards ordered topmost-first. At most three physical layers are rendered. */
  readonly cards: readonly BattlePileCard[];
  /** Accessible name for the card zone represented by this pile. */
  readonly label: LocalizedString;
  /** Treatment shown when the pile has no cards. Defaults to `hidden`. */
  readonly emptyState?: CardPileEmptyState;
  /** Visible copy centered inside an empty outlined pile. */
  readonly emptyLabel?: LocalizedString;
  /** Primary press action for the pile as one zone control. */
  readonly onPress?: () => void;
  /** Optional stable test id for the pile as a whole. */
  readonly testId?: string;
}

/** Maximum number of physical card layers a pile paints. */
export const CARD_PILE_VISIBLE_LAYER_CAP = 3;

const LANDSCAPE_ASPECT_RATIO = `${String(CARD_ASPECT_H)} / ${String(CARD_ASPECT_W)}`;
const LANDSCAPE_CARD_WIDTH = `${String((CARD_ASPECT_W / CARD_ASPECT_H) * 100)}%`;
const LAYER_SHIFT_BY_RAISED_LAYERS = [
  "0",
  token("--space-xxs"),
  token("--space-xs"),
] as const;

function cardStageStyle(): CSSProperties {
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

function EmptyPileOutline({ label }: { readonly label?: LocalizedString }) {
  const resolve = useLocalizer();
  return (
    <div
      aria-hidden="true"
      data-card-pile-empty=""
      style={{
        position: "absolute",
        inset: 0,
        boxSizing: "border-box",
        border: token("--battlefield-slot-border"),
        borderRadius: token("--radius-panel"),
        pointerEvents: "none",
      }}
    >
      {label === undefined ? null : (
        <span
          data-card-pile-empty-label=""
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            font: token("--t-button-sm"),
            color: token("--text-faint"),
            textShadow: token("--text-outline-media"),
          }}
        >
          {resolve(label)}
        </span>
      )}
    </div>
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
  label,
  emptyState = "hidden",
  emptyLabel,
  onPress,
  testId,
}: CardPileProps) {
  const resolve = useLocalizer();
  const visibleCards = cards.slice(0, CARD_PILE_VISIBLE_LAYER_CAP);
  const stageStyle = cardStageStyle();

  const layers = visibleCards.map((card, depth) => {
    const raisedLayers = visibleCards.length - depth - 1;
    const shiftX = LAYER_SHIFT_BY_RAISED_LAYERS[raisedLayers] ?? "0";
    const shiftY = raisedLayers === 0 ? "0" : `calc(-1 * ${shiftX})`;

    return (
      <motion.div
        key={card.id}
        layoutId={
          card.face === "up" && card.layoutMotion === "snap"
            ? undefined
            : battleCardLayoutId(card.id)
        }
        data-card-pile-layer=""
        data-battle-card-id={card.id}
        data-battle-card-layout-id={
          card.face === "up" && card.layoutMotion === "snap"
            ? undefined
            : battleCardLayoutId(card.id)
        }
        data-card-face={card.face}
        data-battle-card-layout-motion={
          card.face === "up" && card.layoutMotion === "snap" ? "snap" : "travel"
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
              <CardBack
                label={txa(
                  "Face-down card {position}",
                  { position: depth + 1 },
                  "Accessible name for one unidentified card back within a separately labeled battle pile. position is its positive one-based depth from the top of that pile.",
                )}
              />
            ) : (
              <CardView
                card={card.model.displaySnapshot}
                transfiguration={card.model.transfiguration}
                figment={card.figment}
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
    aspectRatio: LANDSCAPE_ASPECT_RATIO,
    overflow: "visible",
  };
  const sharedProps = {
    "data-card-pile": "",
    "data-pile-orientation": "landscape",
    "data-pile-count": String(cards.length),
    "data-pile-visible-count": String(visibleCards.length),
    "data-pile-empty-state": emptyState,
    "data-testid": testId,
  } as const;

  if (onPress !== undefined) {
    return (
      <Pressable
        as="button"
        ariaLabelMessage={label}
        {...sharedProps}
        onClick={onPress}
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
        {visibleCards.length === 0 && emptyState === "outlined" ? (
          <EmptyPileOutline label={emptyLabel} />
        ) : null}
      </Pressable>
    );
  }

  return (
    <div
      role="group"
      aria-label={resolve(label)}
      {...sharedProps}
      style={rootStyle}
    >
      {layers}
      {visibleCards.length === 0 && emptyState === "outlined" ? (
        <EmptyPileOutline label={emptyLabel} />
      ) : null}
    </div>
  );
}
