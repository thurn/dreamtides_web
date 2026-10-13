/** Public creation contracts for positions reserved by played characters. */
import { describe, expect, it } from "vitest";
import type { EngineAvatarDefinition, EngineCardDefinition, EngineFigmentDefinition } from "../catalog";
import { NO_DECK_MODS } from "../dsl/types";
import { triggered, triggeringCard, whenYouPlay } from "../dsl/triggers";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { gainEnergy } from "../effects/primitives/gain-energy";
import { materializeFigmentCopy } from "../effects/primitives/materialize-figment-copy";
import { materializeFigments } from "../effects/primitives/materialize-figments";
import { optional } from "../effects/primitives/optional";
import { sequence } from "../effects/primitives/sequence";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../fold/slice";
import type { Answer } from "../prompts/types";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import { opponent, parseFigmentId, SIDES, type InstanceId, type Side } from "../state/ids";
import type { BattleState, DeckEntry } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, placeFigment } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { redactionViolations } from "../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { passUntil } from "../testing/trigger-harness";
import { parseAvatarId, parsePromptId } from "../../types/identifiers";

const figment: EngineFigmentDefinition = {
  id: parseFigmentId(syntheticId(0x9700f)), subtype: "Spirit Animal", spark: 1,
  status: "authored", abilities: () => [],
};
const missingFigment = parseFigmentId(syntheticId(0x9700e));
const make = (count = 1, awakened = false) => materializeFigments(figment.id, count, { spark: 1, awakened });
const watches = (effect: Parameters<typeof triggered>[1]): EngineCardDefinition["abilities"] =>
  () => [triggered(whenYouPlay({ subtype: "Spirit Animal" }), effect)];
const watcher = (index: number, effect: Parameters<typeof triggered>[1]): EngineCardDefinition => ({
  ...v.vanilla0, id: syntheticId(0x97000 + index), subtype: "Visitor", status: "authored", abilities: watches(effect),
});
const cards = {
  one: watcher(0, make()),
  group: watcher(1, make(5, true)),
  copy: watcher(2, materializeFigmentCopy(triggeringCard())),
  choice: watcher(3, optional(make(3))),
  suspend: watcher(4, sequence(make(3), optional(gainEnergy(1)))),
  fault: watcher(5, sequence(make(3), materializeFigments(missingFigment))),
  spirit: { ...v.interruptCharacter, id: syntheticId(0x97006), costs: [], spark: 4, subtype: "Spirit Animal" } satisfies EngineCardDefinition,
  spiritEvent: { ...v.interruptEvent, id: syntheticId(0x97007), costs: [], subtype: "Spirit Animal" } satisfies EngineCardDefinition,
  zeroCopy: watcher(8, materializeFigmentCopy(triggeringCard(), { zeroSpark: true })),
};
const emblem: EngineAvatarDefinition = { id: parseAvatarId(syntheticId(0x9700a)), status: "authored", abilities: watches(make()) };
const engine = createEngine(testCatalog(Object.values(cards), { avatars: [emblem] }, [figment]));
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);

function board(side: Side, source: EngineCardDefinition, occupied: number, hand: readonly (DeckEntry | EngineCardDefinition["id"])[] = [cards.spirit.id]) {
  return boardState(engine.catalog, {
    active: side, phase: "day",
    [side]: { back: [source.id, ...Array.from({ length: occupied - 1 }, () => v.vanilla1.id)], hand, energy: 20, deck },
    [opponent(side)]: { deck },
  });
}
function act(state: BattleState, side: Side, card: InstanceId, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = engine.apply(state, side, { kind: "play", card, from: "hand" }, source);
  source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  expect(redactionViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
const created = (events: readonly EngineEvent[]) => events.flatMap(event => event.kind === "cardCreated" ? [event.instance] : []);
function expectCapacity(events: readonly EngineEvent[], side: Side, missing: number) {
  expect(events.filter(event => event.kind === "capacityReached")).toEqual([{ kind: "capacityReached", side, instance: null, missing }]);
}
function expectPlayed(state: BattleState, side: Side, ...ids: InstanceId[]) {
  for (const id of ids) {
    expect(state.instances[id]).toMatchObject({ controller: side, zone: "play" });
    expect(state.sides[side].backRank).toContain(id);
  }
}
const start = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  return outcome;
}

for (const side of SIDES) describe(`${side} played-character reservations`, () => {
  const other = opponent(side);

  it("keeps the last position for a genuinely played character when its permanent source triggers", () => {
    const { state, ids } = board(side, cards.one, 9);
    const result = act(state, side, ids[side].hand[0]);
    expect(created(result.events)).toEqual([]);
    expectCapacity(result.events, side, 1);
    expectPlayed(result.state, side, ids[side].hand[0]);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: ids[side].back[0], controller: side }));
    expect(result.state.sides[side].backRank.filter(id => id !== null)).toHaveLength(10);
    expect(stateHash(deserializeState(serializeState(result.state)))).toBe(stateHash(result.state));
  });

  it("keeps the same position when a genuine permanent Avatar emblem triggers", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: side, phase: "day", [side]: { avatar: emblem.id, back: Array.from({ length: 9 }, () => v.vanilla1.id), hand: [cards.spirit.id], deck }, [other]: { deck },
    });
    const result = act(state, side, ids[side].hand[0]);
    expect(created(result.events)).toEqual([]);
    expectCapacity(result.events, side, 1);
    expectPlayed(result.state, side, ids[side].hand[0]);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: { kind: "avatar", side }, controller: side }));
  });

  for (const first of [v.vanilla1, v.event0]) it(`reserves only effective characters across actual ${first.cardType} and Interrupt response plays`, () => {
    // Rebuild the complete board once: every pending card below comes from a legal play.
    const staged = boardState(engine.catalog, {
      active: side, phase: "day",
      [side]: { back: [cards.one.id, ...Array.from({ length: 7 }, () => v.vanilla1.id)], hand: [first.id, cards.spirit.id, v.interruptEvent.id], energy: 20, deck },
      [other]: { hand: [v.interruptEvent.id], energy: 20, deck },
    });
    const opened = act(staged.state, side, staged.ids[side].hand[0]);
    expect(opened.state.instances[staged.ids[side].hand[0]].zone).toBe("stack");
    const responded = act(opened.state, other, staged.ids[other].hand[0]);
    const result = act(responded.state, side, staged.ids[side].hand[1]);
    const made = created(result.events);
    expect(made).toHaveLength(first.cardType === "character" ? 0 : 1);
    if (first.cardType === "character") expectCapacity(result.events, side, 1);
    else expect(result.events.filter(event => event.kind === "capacityReached")).toEqual([]);
    const settled = passUntil(engine, result.state, current => current.stack.length === 0);
    expectPlayed(settled.state, side, staged.ids[side].hand[1]);
    if (first.cardType === "character") expectPlayed(settled.state, side, staged.ids[side].hand[0]);
    else expect(settled.state.instances[staged.ids[side].hand[0]].zone).toBe("void");
    expect(invariantViolations(settled.state, engine.catalog)).toEqual([]);
  });

  it("does not reserve this controller's positions for an opposing pending character", () => {
    const staged = boardState(engine.catalog, {
      active: other, phase: "day",
      [side]: { back: [cards.one.id, ...Array.from({ length: 7 }, () => v.vanilla1.id)], hand: [cards.spirit.id, v.interruptEvent.id], energy: 20, deck },
      [other]: { hand: [v.vanilla1.id, v.interruptEvent.id], energy: 20, deck },
    });
    const opened = act(staged.state, other, staged.ids[other].hand[0]);
    const result = act(opened.state, side, staged.ids[side].hand[0]);
    expect(created(result.events)).toHaveLength(1);
    expect(result.events.filter(event => event.kind === "capacityReached")).toEqual([]);
    const settled = passUntil(engine, result.state, current => current.stack.length === 0);
    expectPlayed(settled.state, side, staged.ids[side].hand[0]);
    expectPlayed(settled.state, other, staged.ids[other].hand[0]);
  });

  for (const type of ["character", "event"] as const) it(`counts the D39 effective ${type} rather than its catalog printing`, () => {
    const printing = type === "character" ? cards.spiritEvent : cards.spirit;
    const entry: DeckEntry = { cardId: printing.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: type, subtype: "Spirit Animal" } } };
    const { state, ids } = board(side, cards.one, 9, [entry]);
    const result = act(state, side, ids[side].hand[0]);
    expect(created(result.events)).toHaveLength(type === "character" ? 0 : 1);
    if (type === "character") {
      expectCapacity(result.events, side, 1);
      expectPlayed(result.state, side, ids[side].hand[0]);
    } else {
      expect(result.events.filter(event => event.kind === "capacityReached")).toEqual([]);
      expect(result.state.instances[ids[side].hand[0]].zone).toBe("void");
    }
  });

  it("divides a partial group's spark across only unreserved positions, left to right, awakened", () => {
    const { state, ids } = board(side, cards.group, 7);
    const result = act(state, side, ids[side].hand[0]);
    const made = created(result.events);
    expect(made).toHaveLength(2);
    expectCapacity(result.events, side, 3);
    expect(result.state.sides[side].backRank.slice(7, 9)).toEqual(made);
    for (const viewer of SIDES) expect(made.map(id => engine.view(result.state, viewer).instances[id].characteristics.spark)).toEqual([3, 2]);
    for (const id of made) expect(result.state.instances[id]).toMatchObject({ printing: { kind: "figment", figment: figment.id }, status: { exhausted: false, created: true } });
    expectPlayed(result.state, side, ids[side].hand[0]);
  });

  it("keeps each all-fitting figment's spark and an existing figment's identity separate", () => {
    const { state, ids } = board(side, cards.group, 3);
    const existing = placeFigment(state, side, { rank: "back", index: 3 }, { kind: "figment", figment: figment.id, spark: 1 });
    const result = act(state, side, ids[side].hand[0]);
    const made = created(result.events);
    expect(made).toHaveLength(5);
    expect(result.events.filter(event => event.kind === "capacityReached")).toEqual([]);
    expect(made).not.toContain(existing);
    expect(result.state.instances[existing].printing).toEqual(state.instances[existing].printing);
    expect(made.map(id => engine.view(result.state, side).instances[id].characteristics.spark)).toEqual([1, 1, 1, 1, 1]);
    expectPlayed(result.state, side, ids[side].hand[0]);
  });

  for (const occupied of [8, 9]) it(`applies the reservation to C5 figment copies with ${occupied} occupied positions`, () => {
    const { state, ids } = board(side, cards.copy, occupied, [{ cardId: cards.spirit.id, amplified: true }]);
    const original = ids[side].hand[0];
    state.instances[original].status.gainedSpark = 3;
    state.instances[original].status.counters = 2;
    const result = act(state, side, original);
    const made = created(result.events);
    expect(made).toHaveLength(occupied === 9 ? 0 : 1);
    if (occupied === 9) expectCapacity(result.events, side, 1);
    else {
      expect(result.state.instances[made[0]]).toMatchObject({ printing: { kind: "figmentCopy", cardId: cards.spirit.id, spark: null }, variant: { amplified: true }, status: { gainedSpark: 0, counters: 0, created: true } });
      expect(engine.view(result.state, side).instances[made[0]].characteristics.spark).toBe(4);
    }
    expectPlayed(result.state, side, original);
  });

  it("keeps a zero-spark C5 copy at zero in the available unreserved position", () => {
    const { state, ids } = board(side, cards.zeroCopy, 8);
    const result = act(state, side, ids[side].hand[0]);
    const [copy] = created(result.events);
    expect(result.state.instances[copy].printing).toEqual({ kind: "figmentCopy", cardId: cards.spirit.id, spark: 0 });
    expect(engine.view(result.state, side).instances[copy].characteristics.spark).toBe(0);
    expectPlayed(result.state, side, ids[side].hand[0]);
  });

  it("refusal creates nothing and leaves the played character's reservation intact", () => {
    const { state, ids } = board(side, cards.choice, 8);
    const result = act(state, side, ids[side].hand[0], [false]);
    expect(created(result.events)).toEqual([]);
    expect(result.events.filter(event => event.kind === "capacityReached")).toEqual([]);
    expectPlayed(result.state, side, ids[side].hand[0]);
  });

  it("reloads a suspended creation without partial commits and publishes the replayed prefix once", () => {
    const { state, ids } = board(side, cards.suspend, 8);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const action = { kind: "play", card: ids[side].hand[0], from: "hand" } as const;
    const suspended = applied(fold.reduce(start(state), { kind: "battleAction", side, action }));
    expect(suspended.error).toBeNull();
    const pending = fold.pending(suspended.slice)!;
    expect(pending.prompt).toMatchObject({ kind: "confirm", side });
    expect(suspended.slice.committed.instances[ids[side].hand[0]].zone).toBe("stack");
    expect(Object.values(suspended.slice.committed.instances).filter(instance => instance.status.created)).toEqual([]);
    expect(Object.values(pending.display.instances).filter(instance => instance.status.created)).toHaveLength(1);
    expect(fold.reduce(suspended.slice, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(fold.reduce(suspended.slice, { kind: "answer", side: other, promptId: pending.prompt.id, value: false })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(suspended.slice, { kind: "answer", side, promptId: parsePromptId("999999:0:0"), value: false })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fold.reduce(suspended.slice, { kind: "battleAction", side, action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const reloaded = JSON.parse(JSON.stringify(suspended.slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(reloaded)?.prompt.id).toBe(pending.prompt.id);
    for (const accepted of [false, true]) {
      const answered = applied(fresh.reduce(reloaded, { kind: "answer", side, promptId: pending.prompt.id, value: accepted }));
      expect(answered.error).toBeNull();
      expect(created([...suspended.published, ...answered.published])).toHaveLength(1);
      expectCapacity([...suspended.published, ...answered.published], side, 2);
      expectPlayed(answered.slice.committed, side, ids[side].hand[0]);
      const replayed = act(state, side, ids[side].hand[0], [accepted]);
      expect(stateHash(answered.slice.committed)).toBe(stateHash(replayed.state));
      expect(fresh.reduce(answered.slice, { kind: "answer", side, promptId: pending.prompt.id, value: accepted })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      expect(fresh.reduce(answered.slice, { kind: "battleAction", side, action })).toMatchObject({ kind: "bounced" });
    }
  });

  it("keeps the committed play and rolls back creation when a later instruction fails", () => {
    const { state, ids } = board(side, cards.fault, 8);
    const beforeIds = Object.keys(state.instances);
    const fold = createFoldAdapter(engine);
    const failed = applied(fold.reduce(start(state), { kind: "battleAction", side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } }));
    expect(failed.error?.kind).toBe("engine_error");
    expect(failed.error?.step.kind).toBe("resolveTrigger");
    expect(Object.keys(failed.slice.committed.instances)).toEqual(beforeIds);
    expect(failed.slice.committed.instances[ids[side].hand[0]].zone).toBe("stack");
    expect(failed.slice.committed.sides[side].backRank).toEqual(state.sides[side].backRank);
    expect(created(failed.published)).toEqual([]);
    expect(failed.slice.inFlight).toBeNull();
    expect(invariantViolations(failed.slice.committed, engine.catalog)).toEqual([]);
  });
});
