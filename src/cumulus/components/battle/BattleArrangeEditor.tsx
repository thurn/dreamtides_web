import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useState, type ReactElement } from "react";
import { GameCard } from "../card/CardView";
import { GlassButton } from "../controls/GlassButton";
import { IconButton } from "../controls/IconButton";
import { Select } from "../controls/Select";
import { GlassDialog } from "../overlay/GlassDialog";
import { GLYPHS } from "../../primitives/glyph";
import { motionTimeSeconds } from "../../primitives/motion-time";
import { token } from "../../primitives/tokens";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import { formatNumber } from "../../../runtime/format-number";
import type { BattleCardId } from "../../../types/identifiers";
import type { BattleForeseeEditorCard, BattleForeseeResult } from "./BattleForeseeEditor";

/** Card widths: the Foresee editor's mobile width, and a desktop width that keeps three lanes on one row. */
const ARRANGE_CARD_WIDTH_DESKTOP_PX = 150;
const ARRANGE_CARD_WIDTH_MOBILE_PX = 104;

/** Where an arrangement may put a card. */
export type BattleArrangeDestination = "top" | "bottom" | "void" | "hand";

/** One destination of an arrangement, with the cards it starts with. */
export interface BattleArrangeLane {
  readonly destination: BattleArrangeDestination;
  /** The lane's heading, such as "Top of Deck". */
  readonly label: string;
  /** The compact form on each card's destination control, such as "Top". */
  readonly shortLabel: string;
  /** The fewest cards the lane must receive. */
  readonly min: number;
  /** The most cards the lane may receive. */
  readonly max: number;
  /** The order of the lane's cards matters (the top or bottom of the deck), so the player may reorder them. */
  readonly ordered: boolean;
  /** The cards the lane starts with, first first. */
  readonly cardIds: readonly BattleCardId[];
}

/** An arrangement of some cards among their allowed destinations. */
export interface BattleArrangeEditorModel {
  /** What the player is asked. */
  readonly title: string;
  /** The line naming the card that asks, when there is one. */
  readonly subtitle: string | null;
  /** Every card to place, in the order the effect looked at them. */
  readonly cards: readonly BattleForeseeEditorCard[];
  /** The allowed destinations, in the effect's order; every card starts in exactly one. */
  readonly lanes: readonly BattleArrangeLane[];
}

export interface BattleArrangeEditorProps {
  readonly model: BattleArrangeEditorModel;
  /** Commits one complete arrangement, every lane within its bounds. */
  readonly onConfirm: (result: BattleForeseeResult) => void;
  /** Cancels the play awaiting this arrangement; omit when it cannot be cancelled. */
  readonly onCancel?: () => void;
}

/** Whether every lane holds between its fewest and most cards. */
export function arrangementWithinBounds(
  lanes: readonly Pick<BattleArrangeLane, "min" | "max">[],
  placement: readonly (readonly BattleCardId[])[],
): boolean {
  return lanes.every((lane, index) => {
    const count = placement[index]?.length ?? 0;
    return count >= lane.min && count <= lane.max;
  });
}

/**
 * The arrangement editor: one lane per allowed destination, each card a
 * tangible object with a destination control beneath it, and order controls
 * where order matters. A card sent to another lane travels there. Confirm
 * commits once every lane is within its bounds. Key it by the prompt so a
 * new arrangement starts over.
 */
export function BattleArrangeEditor({ model, onConfirm, onCancel }: BattleArrangeEditorProps): ReactElement {
  const isDesktop = useIsDesktop();
  const reduceMotion = useReducedMotion() === true;
  const cardWidthPx = isDesktop ? ARRANGE_CARD_WIDTH_DESKTOP_PX : ARRANGE_CARD_WIDTH_MOBILE_PX;
  const [placement, setPlacement] = useState<readonly (readonly BattleCardId[])[]>(() =>
    model.lanes.map((lane) => lane.cardIds),
  );
  const cardById = new Map(model.cards.map((card) => [card.battleCardId, card]));
  const options = model.lanes.map((lane) => ({
    value: lane.destination,
    label: lane.label,
    triggerLabel: lane.shortLabel,
  }));
  const valid = arrangementWithinBounds(model.lanes, placement);

  const moveTo = (cardId: BattleCardId, destination: BattleArrangeDestination): void => {
    setPlacement((current) =>
      current.map((ids, index) => {
        const without = ids.filter((id) => id !== cardId);
        return model.lanes[index]?.destination === destination ? [...without, cardId] : without;
      }),
    );
  };
  const shift = (laneIndex: number, cardId: BattleCardId, offset: -1 | 1): void => {
    setPlacement((current) =>
      current.map((ids, index) => {
        if (index !== laneIndex) return ids;
        const from = ids.indexOf(cardId);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= ids.length) return ids;
        const next = [...ids];
        [next[from], next[to]] = [next[to], next[from]];
        return next;
      }),
    );
  };
  const laneIds = (destination: BattleArrangeDestination): readonly BattleCardId[] =>
    placement[model.lanes.findIndex((lane) => lane.destination === destination)] ?? [];
  const confirm = (): void => {
    if (!valid) return;
    onConfirm({
      viewedCardIds: model.cards.map((card) => card.battleCardId),
      orderedCardIds: laneIds("top"),
      bottomCardIds: laneIds("bottom"),
      voidCardIds: laneIds("void"),
      handCardIds: laneIds("hand"),
    });
  };
  const travel = { duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base") };

  return (
    <GlassDialog
      title={model.title}
      {...(model.subtitle === null ? {} : { subtitle: model.subtitle })}
      desktopCenterTarget="battlefield"
      {...(onCancel === undefined ? {} : { onClose: onCancel, closeLabel: "Cancel" })}
    >
      <div data-battle-arrange-editor="" style={{ display: "grid", gap: token("--space-l") }}>
        <LayoutGroup>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "flex-start",
              gap: token("--space-l"),
            }}
          >
            {model.lanes.map((lane, laneIndex) => {
              const ids = placement[laneIndex] ?? [];
              const withinBounds = ids.length >= lane.min && ids.length <= lane.max;
              return (
                <motion.section
                  key={lane.destination}
                  layout={reduceMotion ? false : "position"}
                  transition={travel}
                  aria-label={lane.label}
                  data-battle-arrange-lane={lane.destination}
                  data-battle-arrange-lane-valid={withinBounds ? "true" : "false"}
                  style={{ display: "grid", justifyItems: "center", gap: token("--space-xs") }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: token("--space-xs") }}>
                    <span
                      style={{
                        color: token("--text-on-glass-muted"),
                        font: token("--t-eyebrow"),
                        letterSpacing: token("--tracking-eyebrow"),
                        textTransform: "uppercase",
                      }}
                    >
                      {lane.label}
                    </span>
                    <span
                      data-battle-arrange-lane-count=""
                      style={{
                        color: withinBounds ? token("--text-on-glass-muted") : token("--text-on-glass"),
                        font: token("--t-caption"),
                      }}
                    >
                      {`${formatNumber(ids.length)}/${formatNumber(lane.max)}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: token("--space-s") }}>
                    {ids.map((cardId, index) => {
                      const card = cardById.get(cardId);
                      if (card === undefined) return null;
                      const name = card.card.displaySnapshot.name;
                      return (
                        <motion.div
                          key={cardId}
                          layoutId={reduceMotion ? undefined : `battle-arrange:${cardId}`}
                          layout={reduceMotion ? false : "position"}
                          transition={travel}
                          data-battle-arrange-card={cardId}
                          data-battle-arrange-card-destination={lane.destination}
                          style={{ width: cardWidthPx, display: "grid", gap: token("--space-xs") }}
                        >
                          <GameCard model={card.card} presentation="full" />
                          <Select
                            options={options}
                            value={lane.destination}
                            size="sm"
                            full
                            ariaLabel={`Where ${name} goes`}
                            onChange={(destination) => moveTo(cardId, destination)}
                          />
                          {lane.ordered && ids.length > 1 ? (
                            <div style={{ display: "flex", justifyContent: "center", gap: token("--space-xs") }}>
                              <IconButton
                                glyph={GLYPHS.chevronLeft}
                                size="sm"
                                placement="onGlass"
                                label={`Move ${name} earlier`}
                                disabled={index === 0}
                                onPress={() => shift(laneIndex, cardId, -1)}
                              />
                              <IconButton
                                glyph={GLYPHS.chevronRight}
                                size="sm"
                                placement="onGlass"
                                label={`Move ${name} later`}
                                disabled={index === ids.length - 1}
                                onPress={() => shift(laneIndex, cardId, 1)}
                              />
                            </div>
                          ) : null}
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.section>
              );
            })}
          </div>
        </LayoutGroup>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <GlassButton
            label={"Confirm"}
            placement="onGlass"
            variant="accent"
            disabled={!valid}
            testId="battle-arrange-confirm"
            onPress={confirm}
          />
        </div>
      </div>
    </GlassDialog>
  );
}
