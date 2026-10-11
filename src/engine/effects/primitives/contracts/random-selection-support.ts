import { printedCardId, type EngineCardDefinition } from "../../../catalog";
import { abandonCostCapture, additionalCost, energy, event, randomIn, reclaim, x } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf, moveInstance } from "../../../rules/zones";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import { discover } from "../discover";
import { gainPoints } from "../gain-points";
import { materialize } from "../materialize";
import { sequence } from "../sequence";

const make = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(index), status: "authored", abilities: () => [event(effect)],
});

/** "Materialize two random ≤2● cost characters from your deck", then gain 1⍟. */
const twoCheap = randomIn("deck", 2, { cardType: "character", costAtMost: 2 });
export const twin = make(6500, sequence(materialize(twoCheap), gainPoints(1)));
/** "To play this card, abandon a character. Materialize a random character with higher cost from your deck. Reclaim 3●". */
export const genesis: EngineCardDefinition = {
  ...v.event0,
  id: syntheticId(6501),
  costs: [energy(2)],
  status: "authored",
  abilities: () => [
    additionalCost(abandonCostCapture()),
    event(materialize(randomIn("deck", 1, { cardType: "character" }, { costGreaterThan: x() }))),
    reclaim(energy(3)),
  ],
};
/** A random character from the opponent's deck. */
export const raid = make(6502, materialize(randomIn("deck", 1, { cardType: "character" }, { player: "opponent" })));
/** A random character from your void, and one from your hand. */
export const fromVoid = make(6503, materialize(randomIn("void", 1, { cardType: "character" })));
export const fromHand = make(6504, materialize(randomIn("hand", 1, { cardType: "character" })));
/** Random picks, then a private Discover prompt in the same step. */
export const thenDiscover = make(6505, sequence(materialize(twoCheap), discover({ cardType: "event" })));
/** Materializes two random cheap characters from its controller's deck, then throws. */
export const failing: EngineCardDefinition = {
  ...make(6506, materialize(twoCheap)),
  abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, materialize(twoCheap), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic failure after random materialization");
    },
  },
};
/** An interrupt that puts every character of the opponent's deck into its void. */
export const mill: EngineCardDefinition = {
  ...v.interruptEvent,
  id: syntheticId(6507),
  synthetic: {
    resolve(ctx, item) {
      const side = opponent(item.controller);
      for (const id of [...ctx.state.sides[side].deck]) {
        const card = printedCardId(instanceOf(ctx.state, id).printing);
        if (card !== null && ctx.catalog.card(card).cardType === "character") moveInstance(ctx, id, "void");
      }
    },
  },
};

export const engine = createEngine(testCatalog([twin, genesis, raid, fromVoid, fromHand, thenDiscover, failing, mill]));
export { v };

/** A deck mixing matching (≤2● characters) and other cards. */
export const mixedDeck = [v.vanilla1.id, v.event0.id, v.vanilla3.id, v.vanilla2.id, v.vanilla0.id, v.event1.id, v.vanilla1.id];
export const plainDeck = [v.event0.id, v.event1.id];

/** The cards of `side`'s deck in `before` that are no longer in its deck in `after`, in their former deck order. */
export function leftDeck(before: BattleState, after: BattleState, side: Side): InstanceId[] {
  return before.sides[side].deck.filter((id) => !after.sides[side].deck.includes(id));
}

/** `state` where `viewer` knows exactly `cards`. */
export function knowingOnly(state: BattleState, viewer: Side, cards: readonly InstanceId[]): BattleState {
  return { ...state, knownTo: { ...state.knownTo, [viewer]: [...cards] } };
}
