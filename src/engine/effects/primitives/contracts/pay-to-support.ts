import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, costPaid, energy, energyX, event, optionalCost, target, x } from "../../../dsl/builders";
import { triggered, whenDiscard, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { Answer } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { opponent, type CardId, type Side } from "../../../state/ids";
import { boardState, type BoardSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import { chooseOne } from "../choose-one";
import { discard } from "../discard";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { ifThen } from "../if-then";
import { payTo, type ResolvingPayment } from "../pay-to";
import { reveal } from "../reveal";
import { sequence } from "../sequence";

export const deck = Array.from({ length: 6 }, () => v.vanilla1.id);
const card = (n: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x43800 + n), costs: [], status: "authored", abilities,
});
export const compound = card(0, () => [event(payTo({ energy: 2, discard: 1 }, draw(2)))]);
export const twoDiscards = card(11, () => [event(payTo({ energy: 2, discard: 2 }, draw(1)))]);
export const shapes = ([{}, { energy: 2 }, { discard: 1 }, { energy: 0, discard: 0 }] satisfies ResolvingPayment[]).map((payment, i) => card(1 + i, () => [event(payTo(payment, draw(1)))]));
export const deferred = card(5, () => [event(payTo({ energy: 2, discard: 1 }, chooseOne(gainSpark(target({ controller: "opponent" }), 2), draw(1))))]);
const sharedTarget = target({ controller: "opponent" });
const sharedMode = chooseOne(gainSpark(sharedTarget, 1), gainPoints(3));
export const inherited = card(6, () => [
  additionalCost(optionalCost(energy(1))),
  event(sequence(sharedMode, payTo({ energy: 2, discard: 1 }, sequence(sharedMode, ifThen(costPaid(), gainPoints(x()), gainPoints(9)))))) ,
]);
export const inheritedX: EngineCardDefinition = { ...inherited, costs: [energyX(0)] };
export const handSource = card(7, () => [triggered(whenYouPlay({ cardType: "event" }), payTo({ discard: 1 }, gainPoints(2)), { zone: "hand" })]);
export const discardWatcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x43808), status: "authored", abilities: () => [triggered(whenDiscard(), gainPoints(1))] };
/** A deliberately throwing child publishes one drawn card before a later opposing discard prompt, then draws an unseen card before throwing. */
export const failing: EngineCardDefinition = {
  ...card(10, () => []), synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, payTo({ energy: 2, discard: 1 }, sequence(draw(1), reveal(), discard(1, "opponent"), draw(1))), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic payTo child failure");
    },
  },
};
export const engine = createEngine(testCatalog([compound, twoDiscards, ...shapes, deferred, inheritedX, handSource, discardWatcher, failing]));
export function setup(side: Side = "player", subject: CardId = compound.id, energyAmount = 4, hand: readonly CardId[] = [v.vanilla1.id, v.vanilla2.id]): BoardSetup {
  return { active: side, phase: "day", [side]: { hand: [subject, ...hand], energy: energyAmount, deck }, [opponent(side)]: { hand: [v.vanilla1.id], back: [v.vanilla1.id, v.vanilla2.id], deck } };
}
export function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}
export function opened(board = setup(), records: EngineLogRecord[] = []) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
  const { state, ids } = boardState(engine.catalog, board);
  const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const slice = applied(fold.reduce(start, { kind: "battleAction", side: board.active, action: { kind: "play", card: ids[board.active].hand[0], from: "hand" } }));
  return { fold, slice, ids, start };
}
export function answer(fold: ReturnType<typeof createFoldAdapter>, slice: BattleSlice, value: Answer) {
  const prompt = fold.pending(slice)?.prompt;
  if (prompt === undefined) throw new Error("expected pending payTo prompt");
  return fold.reduce(slice, { kind: "answer", side: prompt.side, promptId: prompt.id, value });
}
