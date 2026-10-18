import { drawGuaranteedOpeningHand } from "../../rules/opening-hand-guarantees";
import { cardMatchesFilter } from "../../continuous/characteristics";
import { buildDreamwellDeck } from "../../rules/dreamwell";
import { drawCard, setEnergy } from "../../rules/resources";
import { BATTLE } from "../../../content/battle";
import { beginFirstTurn, beginPreparedPhase } from "../../rules/turn";
import { opponent, SIDES } from "../../state/ids";
import type { DreamwellCardId, Side } from "../../state/ids";
import { shuffleInPlace } from "../../state/rng";
import type { BattleInit, BattleSetup, OpeningHandDraw } from "../../state/types";
import type { StepContext, StepDefinition } from "../types";

/**
 * Shuffles both decks, builds the Dreamwell, and completes opening hands
 * before their abilities resolve and turn 1 begins. It consumes the battle's next-battle opening-hand draws and
 * starting energy (D39).
 */
export interface BeginBattleStep {
  readonly kind: "beginBattle";
  readonly dreamwell: readonly DreamwellCardId[];
  readonly guaranteedOpeningHand?: BattleInit["guaranteedOpeningHand"];
  /** Extra opening-hand draws per side, after the ordinary hand. */
  readonly openingHand?: Readonly<Partial<Record<Side, readonly OpeningHandDraw[]>>>;
  /** Next-battle energy each side adds to the standard starting energy. */
  readonly startingEnergy?: Readonly<Partial<Record<Side, number>>>;
  /** Entry to an explicitly prepared phase, without opening-hand effects. */
  readonly preparedPhase?: BattleSetup["turn"]["phase"];
}

/** The `beginBattle` step that starts a battle from its init. */
export function beginBattleStep(init: BattleInit): BeginBattleStep {
  const guaranteed = init.guaranteedOpeningHand === undefined ? {} : { guaranteedOpeningHand: init.guaranteedOpeningHand };
  if (init.setup !== undefined) return { kind: "beginBattle", dreamwell: init.dreamwell, ...guaranteed, preparedPhase: init.setup.turn.phase };
  const openingHand: Partial<Record<Side, readonly OpeningHandDraw[]>> = {};
  const startingEnergy: Partial<Record<Side, number>> = {};
  for (const side of SIDES) {
    const effects = init.nextBattle?.[side];
    if (effects === undefined) continue;
    if (effects.openingHand.length > 0) openingHand[side] = effects.openingHand;
    if (effects.startingEnergy > 0) startingEnergy[side] = effects.startingEnergy;
  }
  return {
    kind: "beginBattle",
    dreamwell: init.dreamwell,
    ...guaranteed,
    ...(Object.keys(openingHand).length === 0 ? {} : { openingHand }),
    ...(Object.keys(startingEnergy).length === 0 ? {} : { startingEnergy }),
  };
}

/**
 * Draws one extra opening-hand group: the top `count` cards, or with a
 * filter the first `count` deck cards that match it, which move to the top
 * and are drawn in deck order.
 */
function drawOpeningGroup(ctx: StepContext, side: Side, draw: OpeningHandDraw): void {
  const deck = ctx.state.sides[side].deck;
  let count = draw.count;
  const { filter } = draw;
  if (filter !== null) {
    const matching = deck.filter((id) => cardMatchesFilter(ctx.state, ctx.catalog, id, filter)).slice(0, draw.count);
    deck.splice(0, deck.length, ...matching, ...deck.filter((id) => !matching.includes(id)));
    count = matching.length;
  }
  for (let drawn = 0; drawn < count; drawn++) drawCard(ctx, side);
}

export const beginBattle: StepDefinition<BeginBattleStep> = {
  kind: "beginBattle",
  canceller: () => null,
  run(ctx, step) {
    const { state } = ctx;
    if (step.preparedPhase !== undefined) {
      beginPreparedPhase(ctx, step.preparedPhase);
      return;
    }
    const originalDecks = step.guaranteedOpeningHand === undefined ? undefined : {
      player: [...state.sides.player.deck], enemy: [...state.sides.enemy.deck],
    };
    for (const side of SIDES) {
      shuffleInPlace(state, `shuffle:${side}`, state.sides[side].deck);
    }
    buildDreamwellDeck(state, ctx.catalog, step.dreamwell);
    for (const side of SIDES) {
      const guarantees = step.guaranteedOpeningHand?.[side];
      if (guarantees !== undefined && guarantees.length > 0 && originalDecks !== undefined) {
        drawGuaranteedOpeningHand(ctx, side, originalDecks[side], guarantees);
      } else {
        for (let count = 0; count < state.config.openingHandSize[side]; count++) {
          drawCard(ctx, side);
        }
      }
      for (const draw of step.openingHand?.[side] ?? []) drawOpeningGroup(ctx, side, draw);
      const energy = BATTLE.startingEnergy + (step.startingEnergy?.[side] ?? 0);
      if (energy > 0) setEnergy(ctx, side, energy, energy);
    }
    for (const side of [state.turn.active, opponent(state.turn.active)]) {
      ctx.emit({ kind: "openingHandCompleted", side });
    }
    if (state.triggerQueue.length > 0) {
      state.turn.beginning = true;
      return;
    }
    beginFirstTurn(ctx);
  },
};
