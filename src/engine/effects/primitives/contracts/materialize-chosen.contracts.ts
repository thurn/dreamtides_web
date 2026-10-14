/** Physical private hand selection composes ordinary arrival, bounds and suspended replay. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonSelfCost, activated, anyCharacter, countersCost, event, everyIn, returnCost, storedCounters, target } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { onMaterialized, triggered, whenMaterialize, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { cardMatchesFilter } from "../../../continuous/characteristics";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, ChooseCardsPrompt, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, SIDES, type CardId, type Side } from "../../../state/ids";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type BoardSetup } from "../../../testing/board";
import { labBoard } from "../../../testing/lab-solver";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { banishCards } from "../banish-cards";
import { costModifier } from "../cost-modifier";
import { materialize } from "../materialize";
import { createCopyInHand } from "../create-copy-in-hand";
import { gainPoints } from "../gain-points";
import { materializeChosen } from "../materialize-chosen";
import { optional } from "../optional";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { storeCounters } from "../store-counters";
import { capturedCards, withMaterialized } from "../with-materialized";

const spell = (n: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x48440 + n), status: "authored", abilities: () => [event(effect)],
});
const bound2 = spell(0, materializeChosen(2));
const bound3 = spell(1, materializeChosen(3));
const bound0 = spell(2, materializeChosen(0));
const boundNegative = spell(3, materializeChosen(-1));
const may = spell(4, optional(materializeChosen(3)));
const captured = spell(5, withMaterialized(materializeChosen(2), banishCards([capturedCards()])));
const arrival: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x48450), status: "authored", abilities: () => [triggered(onMaterialized(), gainPoints(2))] };
const watcher: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x48451), status: "authored", abilities: () => [triggered(whenMaterialize(), gainPoints(3)), triggered(whenYouPlay({ cardType: "character" }), gainPoints(7))] };
const capacitySource: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x48452), status: "authored", abilities: () => [triggered(onMaterialized(), withMaterialized(materializeChosen(2), banishCards([capturedCards()])))] };
const storeSource: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x48453), status: "authored", abilities: () => [activated([], sequence(storeCounters(1), materializeChosen(storedCounters())))] };
const paymentSource: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x48454), status: "authored", abilities: () => [activated([countersCost(1), abandonSelfCost()], materializeChosen(storedCounters()))] };
const returningSource: EngineCardDefinition = { ...paymentSource, id: syntheticId(0x48455), abilities: () => [activated([countersCost(1), returnCost({ another: false })], materializeChosen(storedCounters()))] };
const response: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(0x48456), status: "authored", abilities: () => [event(returnToHand(target(anyCharacter())))] };
const discount = spell(0x22, sequence(costModifier("you", { cardType: "character" }, -3), materializeChosen(2)));
const reenter: EngineCardDefinition = { ...response, id: syntheticId(0x48457), abilities: () => [event(materialize(everyIn("void", {}, { player: "opponent" })))] };
const directSource: EngineCardDefinition = { ...storeSource, id: syntheticId(0x48458), abilities: () => [activated([], materializeChosen(storedCounters()))] };
const copy = spell(0x20, sequence(createCopyInHand(target(anyCharacter())), materializeChosen(2)));
const fail: EngineCardDefinition = { ...spell(0x21, materializeChosen(2)), abilities: () => [], synthetic: {
  resolve(ctx, item) {
    resolveEffect(ctx, materializeChosen(2), { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
    throw new Error("synthetic error after chosen arrival");
  },
} };
const cards = [bound2, bound3, bound0, boundNegative, may, captured, arrival, watcher, capacitySource, storeSource, paymentSource, returningSource, response, copy, fail, discount, reenter, directSource];
const engine = createEngine(testCatalog(cards));
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);
class Picking implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (prompt: Prompt) => Answer) {}
  answer(prompt: Prompt): Answer { this.prompts.push(prompt); return this.pick(prompt); }
}
const last = (prompt: Prompt): Answer => {
  if (prompt.kind !== "chooseCards" && prompt.kind !== "chooseTargets") throw new Error(`Unexpected ${prompt.kind}`);
  return prompt.candidates.slice(-1);
};
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(result)}`);
  return result.slice;
}
function setup(side: Side, source = bound2.id, hand: readonly CardId[] = [arrival.id, arrival.id, v.vanilla3.id, v.event0.id]): BoardSetup {
  return { active: side, phase: "day", [side]: { hand: [source, ...hand], energy: 5, deck }, [opponent(side)]: { hand: [v.vanilla2.id], void: [v.vanilla1.id], deck } };
}
function opened(board: BoardSetup) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const { state, ids } = boardState(engine.catalog, board);
  const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const slice = applied(fold.reduce(start, { kind: "battleAction", side: board.active, action: { kind: "play", from: "hand", card: ids[board.active].hand[0] } }));
  return { fold, start, slice, ids, pending: fold.pending(slice)! };
}
function clean(before: Parameters<typeof invariantViolations>[0], result: ReturnType<typeof engine.apply>) {
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  expect(unannouncedChanges(result.events, before, result.state)).toEqual([]);
  expect(eventRedactionViolations(result.events, before, result.state)).toEqual([]);
}
for (const side of SIDES) describe(`materializeChosen ${side}`, () => {
  const other = opponent(side);
  it("selects the non-first physical duplicate, privately, with arrival triggers but no selected play or payment", () => {
    const board = setup(side);
    const { state, ids } = boardState(engine.catalog, { ...board, [side]: { ...board[side], back: [watcher.id] } });
    const answers = new Picking(last);
    const result = engine.apply(state, side, { kind: "play", from: "hand", card: ids[side].hand[0] }, answers);
    expect(answers.prompts).toHaveLength(1);
    expect(answers.prompts[0]).toMatchObject({ kind: "chooseCards", side, privateTo: side, min: 1, max: 1, purpose: { role: "materializeChosen" }, candidates: ids[side].hand.slice(1, 3) });
    const chosen = ids[side].hand[2];
    expect(result.state.instances[chosen]).toMatchObject({ zone: "play", owner: side, controller: side, status: { exhausted: true } });
    expect(result.state.sides[side].backRank[1]).toBe(chosen);
    expect(result.state.sides[side].hand).toEqual(ids[side].hand.slice(1).filter(id => id !== chosen));
    expect(result.state.sides[side].currentEnergy).toBe(5);
    expect(result.state.sides[side].score).toBe(5);
    expect(result.events.filter(e => e.kind === "cardPlayed").map(e => e.instance)).toEqual([ids[side].hand[0]]);
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([chosen]);
    expect(result.state.sides[other]).toEqual(state.sides[other]);
    clean(state, result);
  });
  it.each([[bound2, 2], [bound3, 3]] as const)("uses the fixed maximum of $0.id", (source, maximum) => {
    const { pending, ids } = opened(setup(side, source.id, [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.event0.id]));
    expect((pending.prompt as ChooseCardsPrompt).candidates).toEqual(ids[side].hand.slice(1, maximum + 1));
  });
  it.each([[bound0, [v.vanilla0.id, v.vanilla1.id]], [boundNegative, [v.vanilla0.id]], [bound2, []], [bound2, [v.event0.id, v.vanilla3.id]]] as const)("handles zero, negative, empty or unmatched hands", (source, hand) => {
    const { state, ids } = boardState(engine.catalog, setup(side, source.id, hand));
    const result = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const entered = source === bound0 ? [ids[side].hand[1]] : [];
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual(entered);
    expect(result.state.sides[side].hand).toEqual(ids[side].hand.slice(1).filter(id => !entered.includes(id)));
    expect(result.state.rng).toEqual(state.rng);
    clean(state, result);
  });
  it("filters current effective types, copiable deck-mod costs and amplified variants", () => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [bound2.id,
      { cardId: v.event1.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Mage" } } },
      { cardId: v.vanilla1.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } },
      { cardId: v.vanilla3.id, deckMods: { ...NO_DECK_MODS, costReduction: 1 } },
      { cardId: v.vanilla2.id, amplified: true }, v.vanilla3.id], energy: 3, deck }, [other]: { deck } });
    const answers = new Picking(last);
    const result = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, answers);
    expect((answers.prompts[0] as ChooseCardsPrompt).candidates).toEqual([ids[side].hand[1], ids[side].hand[3], ids[side].hand[4]]);
    expect(result.state.sides[side].backRank[0]).toBe(ids[side].hand[4]);
    clean(state, result);
  });
  it.each([false, true])("composes optional accepted=%s independently", accepted => {
    const { state, ids } = boardState(engine.catalog, setup(side, may.id, [v.vanilla1.id, v.vanilla2.id]));
    const answers = new Picking(prompt => prompt.kind === "confirm" ? accepted : last(prompt));
    const result = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, answers);
    expect(answers.prompts.map(p => p.purpose.role)).toEqual(accepted ? ["youMay", "materializeChosen"] : ["youMay"]);
    expect(result.state.sides[side].backRank.filter(Boolean)).toEqual(accepted ? [ids[side].hand[2]] : []);
    expect(result.state.sides[side].currentEnergy).toBe(5);
    clean(state, result);
  });
  it("preserves earlier opposing knowledge while hiding unknown eligible identities until arrival", () => {
    const { fold, slice, pending, ids } = opened(setup(side));
    const offered = ids[side].hand.slice(1, 3);
    expect((promptView(pending.prompt, other, pending.display) as ChooseCardsPrompt).candidates).toEqual([]);
    expect(view(pending.display, other, engine.catalog).instances[offered[0]]).toBeUndefined();
    const known = { ...pending.display, knownTo: { ...pending.display.knownTo, [other]: [offered[0]] } };
    expect((promptView(pending.prompt, other, known) as ChooseCardsPrompt).candidates).toEqual([offered[0]]);
    expect(view(pending.display, side, engine.catalog).instances[offered[1]]).toBeDefined();
    const outcome = fold.reduce(slice, { kind: "answer", side, promptId: pending.prompt.id, value: [offered[1]] });
    const done = applied(outcome);
    expect(view(done.committed, other, engine.catalog).instances[offered[1]]).toBeDefined();
    expect(view(done.committed, other, engine.catalog).instances[offered[0]]).toBeUndefined();
    if (outcome.kind !== "applied") throw new Error("bounced");
    const arrivalEvent = outcome.published.find(e => e.kind === "materialized")!;
    expect(eventSeenBy(arrivalEvent, other, done.committed)).toEqual(arrivalEvent);
  });
  it("retains foreign ownership and binds only the exact successfully materialized card", () => {
    const { state, ids } = boardState(engine.catalog, setup(side, captured.id, [v.vanilla1.id, v.vanilla1.id]));
    const chosen = ids[side].hand[2];
    state.instances[chosen] = { ...state.instances[chosen], owner: other };
    const result = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, new Picking(last));
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([chosen]);
    expect(result.state.sides[other].banished).toContain(chosen);
    expect(result.state.sides[side].hand).toEqual([ids[side].hand[1]]);
    clean(state, result);
  });
  it.each([8, 9])("captures actual arrivals when %i back slots precede the source trigger", count => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [capacitySource.id, v.vanilla1.id, v.vanilla1.id], back: Array.from({ length: count }, () => v.vanilla1.id), deck }, [other]: { deck } });
    const chosen = ids[side].hand[2];
    const result = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, new Picking(last));
    expect(result.state.sides[side].hand).toEqual(count === 8 ? [ids[side].hand[1]] : ids[side].hand.slice(1));
    expect(result.state.sides[side].banished).toEqual(count === 8 ? [chosen] : []);
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual(count === 8 ? [ids[side].hand[0], chosen] : [ids[side].hand[0]]);
    if (count === 9) expect(result.events).toContainEqual({ kind: "capacityReached", side, instance: chosen, missing: 1 });
    clean(state, result);
  });
  it("blocks a hand source and activated entry ability at full back capacity", () => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [bound2.id, v.vanilla1.id], front: [storeSource.id], back: Array.from({ length: 10 }, () => v.vanilla1.id), deck }, [other]: { deck } });
    const legal = engine.legalActions(state, side);
    expect(legal).not.toContainEqual({ kind: "play", card: ids[side].hand[0], from: "hand" });
    expect(legal).not.toContainEqual({ kind: "activate", source: ids[side].front[0], ability: 0 });
  });
  it("reads live post-instruction source counters and stages fixed/direct-counter forms for the lab", () => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [storeSource.id], hand: [v.vanilla0.id, v.vanilla2.id, v.vanilla3.id], deck }, [other]: { deck } });
    state.instances[ids[side].back[0]!].status.counters = 1;
    const answers = new Picking(last);
    const result = engine.apply(state, side, { kind: "activate", source: ids[side].back[0]!, ability: 0 }, answers);
    expect((answers.prompts[0] as ChooseCardsPrompt).candidates).toEqual(ids[side].hand.slice(0, 2));
    expect(result.state.instances[ids[side].back[0]!].status.counters).toBe(2);
    expect(result.state.instances[ids[side].hand[1]].zone).toBe("play");
    for (const source of [bound0, bound2, bound3, storeSource]) {
      const solved = labBoard(engine, source.id, cards, side);
      expect(solved.state.sides[side].hand).toHaveLength(2);
      const staged = solved.state.sides[side].hand[1];
      expect(cardMatchesFilter(solved.state, engine.catalog, staged, { cardType: "character", costAtMost: source === storeSource || source === bound0 ? 0 : source === bound2 ? 2 : 3 })).toBe(true);
    }
    clean(state, result);
  });
  it.each([paymentSource, returningSource])("uses the precise own-payment departure snapshot", source => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [source.id], hand: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck }, [other]: { hand: [v.interruptEvent.id], energy: 3, deck } });
    const own = ids[side].back[0]!;
    state.instances[own].status.counters = 3;
    const paid = engine.apply(state, side, { kind: "activate", source: own, ability: 0 }, new ScriptedSource([[own]]));
    expect(paid.state.stack[0]).toMatchObject({ paymentSourceCounters: 2 });
    const answers = new Picking(() => [ids[side].hand[1]]);
    const done = passUntil(engine, paid.state, next => next.stack.length === 0, answers);
    expect((answers.prompts[0] as ChooseCardsPrompt).candidates).toEqual([...ids[side].hand.slice(0, 2), ...(source === returningSource ? [own] : [])]);
    expect(done.state.instances[ids[side].hand[1]].zone).toBe("play");
    expect(done.state.instances[own].status.counters).toBe(0);
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });
  it("rechecks the current hand after interruption and uses zero after opposing source departure", () => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [storeSource.id], hand: [v.vanilla0.id, v.vanilla2.id], deck }, [other]: { hand: [response.id], back: [v.vanilla1.id], energy: 3, deck } });
    state.instances[ids[side].back[0]!].status.counters = 2;
    const activated = engine.apply(state, side, { kind: "activate", source: ids[side].back[0]!, ability: 0 }, NO_PROMPTS);
    const answers = new Picking(prompt => prompt.purpose.role === "target" ? [ids[side].back[0]!] : last(prompt));
    const returned = engine.apply(activated.state, other, { kind: "play", card: ids[other].hand[0], from: "hand" }, answers);
    const done = passUntil(engine, returned.state, next => next.stack.length === 0, answers);
    expect((answers.prompts.find(p => p.purpose.role === "materializeChosen") as ChooseCardsPrompt).candidates).toEqual([ids[side].hand[0], ids[side].back[0]]);
    expect(done.state.instances[ids[side].hand[1]].zone).toBe("hand");
    expect(done.state.instances[ids[side].back[0]!].status.counters).toBe(0);
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });
  it("ignores temporary play-cost discounts when filtering copiable cost", () => {
    const { state, ids } = boardState(engine.catalog, setup(side, discount.id, [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id]));
    const answers = new Picking(last);
    const result = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, answers);
    expect((answers.prompts[0] as ChooseCardsPrompt).candidates).toEqual(ids[side].hand.slice(1, 3));
    expect(result.state.instances[ids[side].hand[3]].zone).toBe("hand");
    clean(state, result);
  });
  it("accepts an optional instruction with no eligible character without a card prompt", () => {
    const { state, ids } = boardState(engine.catalog, setup(side, may.id, [v.event0.id, v.vanilla5.id]));
    const answers = new Picking(() => true);
    const result = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, answers);
    expect(answers.prompts.map(p => p.purpose.role)).toEqual(["youMay"]);
    expect(result.state.sides[side].hand).toEqual(ids[side].hand.slice(1));
    expect(result.events.filter(e => e.kind === "materialized")).toEqual([]);
    clean(state, result);
  });
  it.each([0, 3])("reads this physical source's current counters=%i independently", counters => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [directSource.id, directSource.id], hand: [v.vanilla0.id, v.vanilla2.id, v.vanilla3.id], deck }, [other]: { deck } });
    state.instances[ids[side].back[0]!].status.counters = counters;
    state.instances[ids[side].back[1]!].status.counters = 7;
    const result = engine.apply(state, side, { kind: "activate", source: ids[side].back[0]!, ability: 0 }, new Picking(last));
    const chosen = ids[side].hand[counters === 0 ? 0 : 2];
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([chosen]);
    expect(result.state.instances[ids[side].back[1]!].status.counters).toBe(7);
    clean(state, result);
  });
  it("lets live reentry zero supersede an own-payment counter snapshot", () => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [paymentSource.id], hand: [v.vanilla0.id, v.vanilla2.id], deck }, [other]: { hand: [reenter.id], energy: 3, deck } });
    const own = ids[side].back[0]!;
    state.instances[own].status.counters = 3;
    const paid = engine.apply(state, side, { kind: "activate", source: own, ability: 0 }, new ScriptedSource([[own]]));
    expect(paid.state.stack[0]).toMatchObject({ paymentSourceCounters: 2 });
    const responded = engine.apply(paid.state, other, { kind: "play", card: ids[other].hand[0], from: "hand" }, NO_PROMPTS);
    const done = passUntil(engine, responded.state, next => next.stack.length === 0, NO_PROMPTS);
    expect(done.state.instances[own]).toMatchObject({ zone: "play", controller: other, status: { counters: 0 } });
    expect(done.state.instances[ids[side].hand[0]].zone).toBe("play");
    expect(done.state.instances[ids[side].hand[1]].zone).toBe("hand");
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });
  it("materializes a current copiable hand copy without selecting the original", () => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [v.vanilla2.id], hand: [copy.id, v.vanilla1.id], deck }, [other]: { deck } });
    const result = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, new Picking(last));
    const copied = result.events.find(e => e.kind === "cardCopied");
    if (copied?.kind !== "cardCopied") throw new Error("missing copy");
    expect(result.state.instances[copied.copy]).toMatchObject({ zone: "play", owner: side, controller: side, status: { created: true, exhausted: true } });
    expect(result.state.instances[ids[side].back[0]!].zone).toBe("play");
    expect(result.state.sides[side].hand).toEqual([ids[side].hand[1]]);
    clean(state, result);
  });
  it("saves and reconstructs each prompt, refuses invalid/stale/concurrent answers, and commits once", () => {
    const { fold, slice, ids, pending } = opened(setup(side, may.id, [v.vanilla1.id, v.vanilla2.id, v.vanilla5.id]));
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    const confirmed = applied(fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: true }));
    const next = fresh.pending(confirmed)!;
    const again = JSON.parse(JSON.stringify(confirmed)) as BattleSlice;
    expect(fresh.pending(again)).toEqual(next);
    const unchanged = stateHash(again.committed);
    const answer = { kind: "answer" as const, side, promptId: next.prompt.id, value: [ids[side].hand[2]] };
    for (const value of [[], ids[side].hand.slice(1, 3), [ids[side].hand[3]], [ids[other].hand[0]], [ids[side].hand[1], ids[side].hand[1]]]) expect(fresh.reduce(again, { ...answer, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(again, { ...answer, side: other })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...again, attempt: again.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(again, { kind: "battleAction", side: other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(again, { kind: "cancel", side, promptId: next.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(again.committed)).toBe(unchanged);
    const done = applied(fresh.reduce(again, answer));
    expect(done).toEqual(applied(fold.reduce(confirmed, answer)));
    expect(done.committed.sides[side].backRank[0]).toBe(ids[side].hand[2]);
    expect(fresh.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });
  it("rolls back failure after arrival without partial rank, zones, RNG or published events", () => {
    const { fold, slice, pending, ids } = opened(setup(side, fail.id, [v.vanilla1.id, v.vanilla2.id]));
    const outcome = fold.reduce(slice, { kind: "answer", side, promptId: pending.prompt.id, value: [ids[side].hand[2]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("missing failure");
    expect(outcome.error.message).toContain("synthetic error after chosen arrival");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed.sides).toEqual(slice.committed.sides);
    expect(outcome.slice.committed.instances).toEqual(slice.committed.instances);
    expect(outcome.slice.committed.rng).toEqual(slice.committed.rng);
    expect(outcome.slice.committed.triggerQueue).toEqual(slice.committed.triggerQueue);
    expect(outcome.slice.inFlight).toBeNull();
    expect(invariantViolations(outcome.slice.committed, engine.catalog)).toEqual([]);
  });
});
