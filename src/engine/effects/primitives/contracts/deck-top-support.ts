import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { BattleState } from "../../../state/types";
import { boardState, type BoardSetup } from "../../../testing/board";
import { DECK_TOP, DECK_TOP_CARDS } from "../../../testing/deck-top-cards";
import { SYNTHETIC as v, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
export { DECK_TOP, DECK_TOP_CARDS, v };
export const engine = createEngine(testCatalog(DECK_TOP_CARDS));
export const placed = (setup: Partial<BoardSetup> = {}) => boardState(engine.catalog, {
  active: "player", phase: "day", player: { back: [DECK_TOP.keeper.id, v.vanilla1.id, v.vanilla2.id],
    hand: [v.vanilla1.id, v.vanilla2.id], energy: 8, deck: [DECK_TOP.payable.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] },
  enemy: { deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] }, ...setup,
});
export const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected applied intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
};
export const adapter = () => createFoldAdapter(engine, { checkEventPrefix: true });
export const resolve = (state: BattleState) => passUntil(engine, state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0);
