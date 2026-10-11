import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { event, everyIn, fromVoid, keyword, topOfDeck } from "../../../dsl/builders";
import { onMaterialized, triggered, whenMaterialize, whenYouPlay } from "../../../dsl/triggers";
import { eventSeenBy } from "../../../events";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { ChooseCardsPrompt, Prompt, Answer } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { banish, instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, type CardId, type InstanceId, type Side } from "../../../state/ids";
import { ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type BoardSetup } from "../../../testing/board";
import { eventRedactionViolations } from "../../../testing/redaction";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { draw } from "../draw";
import { discover } from "../discover";
import { gainPoints } from "../gain-points";
import { materialize } from "../materialize";
import { sequence } from "../sequence";

const make = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(index), status: "authored", abilities: () => [event(effect)],
});
const voidRef = fromVoid({ cardType: "character", costAtMost: 2 }, { count: 2, upTo: true });
const fromVoidCard = make(1280, sequence(materialize(voidRef), gainPoints(1)));
const fromOther = make(1281, materialize(fromVoid({ cardType: "character" }, { player: "opponent" })));
const fromHand = make(1282, materialize(everyIn("hand")));
const fromDeck = make(1283, materialize(topOfDeck(3)));
const discoverCard = make(1284, materialize(discover({ cardType: "character", costAtMost: 2 })));
const untargetable: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(1285), abilities: () => [keyword("cannotBeTargeted")] };
const arrival: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(1286), abilities: () => [triggered(onMaterialized(), gainPoints(2))] };
const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(1287), abilities: () => [triggered(whenMaterialize(), gainPoints(3)), triggered(whenYouPlay({ cardType: "character" }), gainPoints(7))] };
const failing: EngineCardDefinition = {
  ...make(1288, materialize(discover({ cardType: "character" }))), abilities: () => [],
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, materialize(discover({ cardType: "character" })), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic failure after materialization");
  } },
};
const sweep: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(1289), synthetic: { resolve(ctx, item) {
  for (const id of [...ctx.state.sides[opponent(item.controller)].void]) banish(ctx, id);
} } };
const awakened: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(1290), abilities: () => [keyword("awakened")] };
const discoverArrival: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(1291), abilities: () => [triggered(onMaterialized(), materialize(discover({ cardType: "character" })))] };
const drawThenDiscover = make(1292, sequence(draw(1), materialize(discover({ cardType: "character" }))));
const engine = createEngine(testCatalog([fromVoidCard, fromOther, fromHand, fromDeck, discoverCard, untargetable, arrival, watcher, failing, sweep, awakened, discoverArrival, drawThenDiscover]));
const deck = Array.from({ length: 5 }, () => v.vanilla1.id);
class Picking implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (ids: readonly InstanceId[]) => readonly InstanceId[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseCards" && prompt.kind !== "chooseTargets") throw new Error(`unexpected ${prompt.kind}`);
    return this.pick(prompt.candidates);
  }
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}
function board(card: CardId = fromVoidCard.id, side: Side = "player"): BoardSetup {
  return { active: side, phase: "day", [side]: { hand: [card, v.vanilla2.id], void: [v.vanilla1.id, v.event0.id, v.vanilla1.id, v.vanilla3.id, untargetable.id], energy: 5, deck }, [opponent(side)]: { deck } };
}
function opened(setup = board(discoverCard.id), records: EngineLogRecord[] = []) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
  const { state, ids } = boardState(engine.catalog, setup);
  const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const slice = applied(fold.reduce(start, { kind: "battleAction", side: setup.active, action: playFromHand(ids, setup.active).action }));
  return { fold, slice, ids, start };
}

describe("materialize", () => {
  it.each(["player", "enemy"] as const)("%s targets matching void characters, placing selected physical cards in source order without playing or paying for them", (side) => {
    const { state, ids } = boardState(engine.catalog, board(fromVoidCard.id, side));
    const source = new Picking((candidates) => [...candidates].reverse());
    const result = engine.apply(state, side, playFromHand(ids, side).action, source);
    expect(source.prompts[0]).toMatchObject({ kind: "chooseTargets", side, min: 0, max: 2, candidates: [ids[side].void[0], ids[side].void[2]] });
    const entered = [ids[side].void[0], ids[side].void[2]];
    expect(result.state.sides[side].backRank.slice(0, 2)).toEqual(entered);
    expect(entered[0]).not.toBe(entered[1]);
    for (const id of entered) expect(result.state.instances[id]).toMatchObject({ zone: "play", owner: side, controller: side, status: { exhausted: true } });
    expect(result.state.sides[side].currentEnergy).toBe(5);
    expect(result.state.sides[side].score).toBe(1);
    expect(result.events.filter((e) => e.kind === "cardPlayed").map((e) => e.instance)).toEqual([ids[side].hand[0]]);
    expect(result.events.filter((e) => e.kind === "materialized").map((e) => e.instance)).toEqual(entered);
    expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("permits zero targets and empty eligibility, with no target failure and continuing trailing effects", () => {
    for (const playerVoid of [[], [v.event0.id, untargetable.id], [v.vanilla1.id, v.vanilla2.id]]) {
      const result = runScenario(engine, { board: { active: "player", phase: "day", player: { hand: [fromVoidCard.id], void: playerVoid, deck }, enemy: { deck } }, steps: (ids) => [playFromHand(ids, "player")], answers: () => [[]] });
      expect(result.state.sides.player.backRank.filter(Boolean)).toEqual([]);
      expect(result.events.filter((e) => e.kind === "noLegalTarget" || e.kind === "materialized")).toEqual([]);
      expect(result.state.sides.player.score).toBe(1);
    }
  });

  it("materializes another owner's void card under the effect controller, preserving ownership and firing arrival but not play triggers", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [fromOther.id], back: [watcher.id], deck }, enemy: { void: [arrival.id], deck } });
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([]));
    expect(result.state.instances[ids.enemy.void[0]]).toMatchObject({ owner: "enemy", controller: "player", zone: "play", status: { exhausted: true } });
    expect(result.state.sides.player.backRank[1]).toBe(ids.enemy.void[0]);
    expect(result.state.sides.player.score).toBe(5);
    expect(result.state.sides.enemy.score).toBe(0);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("takes only characters from hand or the named top deck cards, preserves gained statuses and reads awakened on entry", () => {
    for (const [card, setup] of [[fromHand.id, { hand: [fromHand.id, v.event1.id, awakened.id, v.vanilla2.id] }], [fromDeck.id, { hand: [fromDeck.id], deck: [v.event1.id, awakened.id, v.vanilla2.id, v.vanilla3.id] }]] as const) {
      const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { deck, ...setup }, enemy: { deck } });
      const entered = card === fromHand.id ? ids.player.hand.slice(2) : ids.player.deck.slice(1, 3);
      state.instances[entered[1]].status.gainedSpark = 4;
      const result = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([]));
      expect(result.state.sides.player.backRank.slice(0, 2)).toEqual(entered);
      expect(result.state.instances[entered[0]].status.exhausted).toBe(false);
      expect(result.state.instances[entered[1]].status).toMatchObject({ exhausted: true, gainedSpark: 4, x: null });
      expect(result.events.filter((e) => e.kind === "materialized")).toHaveLength(2);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it("fills only the remaining slot in source order and leaves overflow in its zone with an announced capacity result", () => {
    const { state, ids } = boardState(engine.catalog, { ...board(), player: { hand: [fromVoidCard.id], back: Array.from({ length: 9 }, () => v.vanilla1.id), void: [v.vanilla1.id, v.vanilla2.id], deck } });
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[...ids.player.void].reverse()]));
    expect(result.state.sides.player.backRank[9]).toBe(ids.player.void[0]);
    expect(result.state.instances[ids.player.void[1]].zone).toBe("void");
    expect(result.events).toContainEqual({ kind: "capacityReached", side: "player", instance: ids.player.void[1], missing: 1 });
    expect(result.state.sides.player.score).toBe(1);
    const capacity = result.events.find((e) => e.kind === "capacityReached")!;
    for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(capacity, viewer, result.state)).toEqual(capacity);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    const full = boardState(engine.catalog, { ...board(), player: { hand: [fromVoidCard.id, discoverCard.id], back: Array.from({ length: 10 }, () => v.vanilla1.id), void: [v.vanilla1.id], deck } });
    expect(engine.legalActions(full.state, "player").filter((a) => a.kind === "play")).toEqual([]);
  });

  it("retains a discovered character in hand when a materialized trigger finds the last slot occupied", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [discoverArrival.id], back: Array.from({ length: 9 }, () => v.vanilla1.id), energy: 1, deck: [v.vanilla2.id] }, enemy: { deck } });
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([]));
    expect(result.state.sides.player.backRank[9]).toBe(ids.player.hand[0]);
    expect(result.state.sides.player.hand).toEqual(ids.player.deck);
    expect(result.state.instances[ids.player.deck[0]].zone).toBe("hand");
    const capacity = result.events.find((e) => e.kind === "capacityReached");
    if (capacity === undefined) throw new Error("expected capacity event");
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    expect(capacity).toEqual({ kind: "capacityReached", side: "player", instance: ids.player.deck[0], missing: 1 });
    expect(eventSeenBy(capacity, "player", result.state)).toEqual(capacity);
    expect(eventSeenBy(capacity, "enemy", result.state)).toEqual({ kind: "capacityReached", side: "player", instance: null, missing: 1 });
    expect(view(result.state, "enemy", engine.catalog).instances[ids.player.deck[0]]).toBeUndefined();
    const known = { ...result.state, knownTo: { ...result.state.knownTo, enemy: [...result.state.knownTo.enemy, ids.player.deck[0]] } };
    expect(eventSeenBy(capacity, "enemy", known)).toEqual(capacity);
    expect(result.events.filter((e) => e.kind === "materialized")).toHaveLength(1);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("rechecks a void target after an opposing response moved it, reports that failure once, and continues", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [fromVoidCard.id], void: [v.vanilla1.id], deck }, enemy: { hand: [sweep.id], energy: 1, deck } });
    const played = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[ids.player.void[0]]]));
    expect(played.state.stack).toHaveLength(1);
    const response = engine.apply(played.state, "enemy", playFromHand(ids, "enemy").action, new ScriptedSource([]));
    const done = passUntil(engine, response.state, (next) => next.stack.length === 0);
    expect(done.state.instances[ids.player.void[0]].zone).toBe("banished");
    expect(done.state.sides.player.backRank.filter(Boolean)).toEqual([]);
    expect([...response.events, ...done.events].filter((e) => e.kind === "noLegalTarget")).toEqual([{ kind: "noLegalTarget", source: ids.player.hand[0] }]);
    expect(done.state.sides.player.score).toBe(1);
  });

  it.each(["player", "enemy"] as const)("%s privately discovers then materializes exactly the newly arrived hand card, shuffling without moving an existing matching hand card", (side) => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [discoverCard.id, v.vanilla1.id], deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla1.id, v.event0.id, v.vanilla3.id], energy: 4 }, [opponent(side)]: { deck } });
    const source = new Picking((offered) => [offered[1]]);
    const result = engine.apply(state, side, playFromHand(ids, side).action, source);
    const prompt = source.prompts[0] as ChooseCardsPrompt;
    expect(prompt).toMatchObject({ kind: "chooseCards", side, privateTo: side, purpose: { role: "discover" } });
    expect(new Set(prompt.candidates)).toEqual(new Set(ids[side].deck.slice(0, 3)));
    const chosen = prompt.candidates[1];
    expect(result.state.sides[side].backRank[0]).toBe(chosen);
    expect(result.state.sides[side].hand).toEqual([ids[side].hand[1]]);
    expect(result.state.sides[side].currentEnergy).toBe(4);
    expect(result.state.rng[`shuffle:${side}`]).toBeGreaterThan(state.rng[`shuffle:${side}`] ?? 0);
    expect(result.events.filter((e) => e.kind === "cardPlayed").map((e) => e.instance)).toEqual([ids[side].hand[0]]);
    expect(result.events.filter((e) => e.kind === "cardDiscovered")).toEqual([{ kind: "cardDiscovered", side, instance: chosen }]);
    expect(result.events.filter((e) => e.kind === "materialized")).toEqual([{ kind: "materialized", side, instance: chosen, slot: { rank: "back", index: 0 } }]);
    expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    const none = runScenario(engine, { board: { active: side, phase: "day", [side]: { hand: [discoverCard.id, v.vanilla1.id], deck: [v.event0.id, v.vanilla3.id] }, [opponent(side)]: { deck } }, steps: (placed) => [playFromHand(placed, side)] });
    expect(none.state.sides[side].hand).toEqual([none.ids[side].hand[1]]);
    expect(none.events.filter((e) => e.kind === "materialized" || e.kind === "noLegalTarget")).toEqual([]);
  });

  it("materializes only the nested discovery's card after an earlier effect actually moved a matching card into hand", () => {
    const result = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [drawThenDiscover.id], deck: [v.vanilla1.id, v.vanilla2.id] }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(result.state.sides.player.hand).toEqual([result.ids.player.deck[0]]);
    expect(result.state.sides.player.backRank.filter(Boolean)).toEqual([result.ids.player.deck[1]]);
    expect(result.events.filter((e) => e.kind === "cardDrawn").map((e) => e.instance)).toEqual([result.ids.player.deck[0]]);
    expect(result.events.filter((e) => e.kind === "materialized").map((e) => e.instance)).toEqual([result.ids.player.deck[1]]);
  });

  it.each([fromVoidCard, discoverCard])("reloads %s's prompt, bounces foreign/invalid/stale/concurrent input and resolves exactly once", (card) => {
    const records: EngineLogRecord[] = [];
    const { fold, slice, ids, start } = opened(board(card.id), records);
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const pending = fresh.pending(saved)!;
    expect(pending).toEqual(fold.pending(slice));
    if (pending.prompt.kind !== "chooseCards" && pending.prompt.kind !== "chooseTargets") throw new Error("expected cards");
    const chosen = pending.prompt.candidates[1];
    const intent = { kind: "answer" as const, side: "player" as const, promptId: pending.prompt.id, value: [chosen] };
    expect(fresh.reduce(saved, { ...intent, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(saved, { ...intent, value: [ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(saved, { ...intent, value: [chosen, chosen] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, intent)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const before = stateHash(saved.committed);
    if (card === discoverCard) {
      expect((promptView(pending.prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual([]);
      const opponentView = view(pending.display, "enemy", engine.catalog);
      for (const id of pending.prompt.candidates) expect(opponentView.instances[id]).toBeUndefined();
      expect(saved.committed.sides.player.deck).toEqual(start.committed.sides.player.deck);
      expect(saved.committed.sides.player.backRank.filter(Boolean)).toEqual([]);
      expect(fresh.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    } else {
      const cancelled = applied(fresh.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
      expect(cancelled.committed).toEqual(start.committed);
    }
    const outcome = fresh.reduce(saved, intent);
    const done = applied(outcome);
    expect(done).toEqual(applied(fold.reduce(slice, intent)));
    expect(stateHash(saved.committed)).toBe(before);
    expect(done.committed.sides.player.backRank.filter(Boolean)).toEqual([chosen]);
    expect(fresh.pending(done)).toBeNull();
    expect(fresh.reduce(done, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptAnswered", value: [chosen] }));
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
  });

  it("rolls back an error after actual discovered materialization, keeping only disclosed knowledge and no partial zones, ranks, RNG or published changes", () => {
    const { fold, slice, ids } = opened(board(failing.id));
    const pending = fold.pending(slice)!;
    if (pending.prompt.kind !== "chooseCards") throw new Error("expected discover");
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const outcome = fold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [pending.prompt.candidates[1]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic error");
    expect(outcome.error.message).toContain("after materialization");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed.sides).toEqual(slice.committed.sides);
    expect(outcome.slice.committed.instances).toEqual(slice.committed.instances);
    expect(outcome.slice.committed.rng).toEqual(slice.committed.rng);
    expect(outcome.slice.committed.sides.player.backRank.filter(Boolean)).toEqual([]);
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(outcome.slice.committed.knownTo.player).toEqual(expect.arrayContaining([...pending.prompt.candidates]));
    expect(outcome.slice.committed.knownTo.enemy).toEqual(slice.committed.knownTo.enemy);
    expect(outcome.slice.inFlight).toBeNull();
    expect(invariantViolations(outcome.slice.committed, engine.catalog)).toEqual([]);
  });
});
