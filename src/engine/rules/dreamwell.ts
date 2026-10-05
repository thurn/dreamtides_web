import type { EngineCatalog } from "../catalog";
import { DREAMWELL_RULES } from "../../content/dreamwell-rules";
import type { DreamwellCardId, Side } from "../state/ids";
import { shuffleInPlace } from "../state/rng";
import type { BattleState } from "../state/types";
import type { StepContext } from "../steps/types";
import { setEnergy } from "./resources";

/**
 * Appends one Dreamwell cycle to the shared deck: up to
 * `cardsPerRecurringOrder` cards from each recurring tier, shuffled within
 * the tier on the `dreamwell` stream (rules § Dreamwell numbers and cycling).
 * Returns the number of cards added.
 */
function appendCycle(state: BattleState, catalog: EngineCatalog): number {
  let added = 0;
  for (const order of DREAMWELL_RULES.recurringOrders) {
    const tier = state.dreamwell.catalog.filter(
      (id) => catalog.dreamwellCard(id).order === order,
    );
    shuffleInPlace(state, "dreamwell", tier);
    const taken = tier.slice(0, DREAMWELL_RULES.cardsPerRecurringOrder);
    state.dreamwell.deck.push(...taken);
    added += taken.length;
  }
  return added;
}

/** Builds the shared Dreamwell deck to at least the minimum constructed length. */
export function buildDreamwellDeck(
  state: BattleState,
  catalog: EngineCatalog,
  cards: readonly DreamwellCardId[],
): void {
  state.dreamwell = { deck: [], next: 0, catalog: [...cards] };
  while (state.dreamwell.deck.length < DREAMWELL_RULES.minimumConstructedLength) {
    if (appendCycle(state, catalog) === 0) {
      return;
    }
  }
}

/**
 * Draws the next Dreamwell card for `side`: its `energyAdded` permanently
 * raises maximum ●, and current ● updates to the new maximum. A Dreamwell
 * card with an unimplemented bonus has only its energy effect.
 */
export function drawDreamwell(ctx: StepContext, side: Side): void {
  const { state } = ctx;
  if (state.dreamwell.next >= state.dreamwell.deck.length) {
    appendCycle(state, ctx.catalog);
  }
  const card = state.dreamwell.deck[state.dreamwell.next];
  if (card === undefined) {
    return;
  }
  state.dreamwell.next += 1;
  const definition = ctx.catalog.dreamwellCard(card);
  ctx.emit({ kind: "dreamwellDrawn", side, card, energyAdded: definition.energyAdded });
  if (definition.status === "pending") {
    ctx.emit({ kind: "pendingAbility", side, cardId: card, instance: null, reason: "drawn" });
  }
  const max = state.sides[side].maxEnergy + definition.energyAdded;
  setEnergy(ctx, side, max, max);
}
