/** Physical opening guarantees through the real engine, fold, cold guard and private event projection. */
import { describe, expect, it } from "vitest";
import { parseEngineBattleFold } from "../../rules/battle/fold";
import { parseDeckEntryId, parseDreamsignId } from "../../types/identifiers";
import { createEngine, NO_PROMPTS, ScriptedSource, type BattleInit, type BattleSetup, type BattleState, type Side } from "../index";
import { afterOpeningHand, atStartOfFirstTurn, triggered } from "../dsl/triggers";
import { self } from "../dsl/builders";
import { gainPoints } from "../effects/primitives/gain-points";
import { gainAdditionalSpark } from "../effects/primitives/gain-spark";
import { optional } from "../effects/primitives/optional";
import { redrawChosenHand } from "../effects/primitives/partial-redraw-hand";
import { sequence } from "../effects/primitives/sequence";
import { eventSeenBy, type EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../fold/slice";
import { eventLogRecords, type EngineLogRecord } from "../log";
import { stateHash } from "../state/hash";
import { battleSeed, opponent, SIDES } from "../state/ids";
import { invariantViolations } from "../testing/invariants";
import { SYNTHETIC as v, SYNTHETIC_DREAMWELL, testCatalog } from "../testing/synthetic-cards";

const ids = [1, 2, 3, 4, 5, 6, 7, 8].map(n => parseDreamsignId(`5e5e5e5e-0000-4000-8000-${(0x722000 + n).toString(16).padStart(12, "0")}`));
const engine = createEngine(testCatalog([], { dreamsigns: ids.map((id, index) => ({ id, status: "authored", abilities: () =>
  index === 5 ? [triggered(afterOpeningHand(), sequence(redrawChosenHand(), optional(gainPoints(2))))] :
  index === 6 ? [triggered(afterOpeningHand(), sequence(redrawChosenHand(), optional(gainAdditionalSpark(self(), 1))))] :
  index === 7 ? [triggered(afterOpeningHand(), gainPoints(1)), triggered(atStartOfFirstTurn(), gainPoints(2))] : [] })) }));
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const source = (deckIndex: number, heldIndex = 0, entryId = parseDeckEntryId(`opening-entry-${deckIndex}`), dreamsignId = ids[heldIndex]) => ({ deckIndex, heldIndex, entryId, dreamsignId });
function input(startingSide: Side = "player"): BattleInit {
  const deck = Array.from({ length: 20 }, (_, index) => ({ cardId: v.vanilla1.id, amplified: index === 3 }));
  return { seed: battleSeed("selected-physical-opening"), scoreToWin: 1000, startingSide, decks: { player: deck, enemy: deck },
    dreamwell: SYNTHETIC_DREAMWELL.map(card => card.id), dreamsigns: { player: ids, enemy: ids } };
}
function setup(side: Side, phase: BattleSetup["turn"]["phase"] = "day"): BattleSetup {
  return { placements: [], sides: { player: { currentEnergy: 0, maxEnergy: 0, score: 0 }, enemy: { currentEnergy: 0, maxEnergy: 0, score: 0 } },
    turn: { active: side, phase, round: 1, turnNumber: 1, sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 }, lastNormal: side }, dreamwell: { deck: [], next: 0 } };
}
/** Obtain actual original slot IDs through the public prepared-position engine, without an allocation formula. */
function prepared(init: BattleInit) {
  return engine.createBattle({ ...init, guaranteedOpeningHand: undefined, nextBattle: undefined, setup: setup(init.startingSide ?? "player") }, NO_PROMPTS).state;
}
function original(init: BattleInit) { return prepared(init).sides; }
function opened(init: BattleInit) {
  let boundary: BattleState | undefined;
  const out = engine.createBattle(init, new ScriptedSource([[], false, [], false, [], false, [], false]), (state, step) => {
    if (step.kind === "beginBattle") boundary = state;
  });
  if (boundary === undefined) throw new Error("Missing opening boundary");
  return { ...out, boundary };
}
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error("Expected successful fold operation");
  return out;
}
const draws = (events: readonly EngineEvent[]) => events.filter(event => event.kind === "cardDrawn");
function loaded(init: BattleInit, slice: BattleSlice): BattleSlice {
  const parsed = parseEngineBattleFold(copy({ init, slice }), engine.catalog);
  if (parsed === null) throw new Error("Saved opening rejected");
  return parsed.slice;
}

// Plain held sources isolate normal dealing; the last three definitions exercise real opening continuations.
function plain(side: Side = "player"): BattleInit {
  const init = { ...input(side), dreamsigns: { player: ids.slice(0, 5), enemy: ids.slice(0, 5) } };
  const normal = prepared(init).config.openingHandSize;
  const effects = (holder: Side) => ({ openingHand: [], startingEnergy: 0,
    smallerHandAndCostDiscount: [{ openingHandDelta: 5 - normal[holder], costReduction: 0 }] });
  return { ...init, nextBattle: { player: effects("player"), enemy: effects("enemy") } };
}

describe("guaranteed original opening slots", () => {
  it.each(SIDES)("deals selected physical copies once, retaining variants, source order and all attribution: %s", side => {
    const base = plain(side), init = { ...base, dreamsigns: { ...base.dreamsigns, [side]: [ids[0], ids[0], ...ids.slice(2, 5)] } }, slots = original(init), other = opponent(side);
    const declarations = [source(8), source(8, 1, undefined, ids[0]), source(3, 2)];
    const out = opened({ ...init, guaranteedOpeningHand: { [side]: declarations } });
    const expected = [slots[side].deck[8], slots[side].deck[3]];
    expect(out.boundary.sides[side].hand.slice(0, 2)).toEqual(expected);
    expect(out.boundary.instances[expected[1]].variant).toEqual({ amplified: true });
    expect(out.boundary.instances[slots[side].deck[2]].variant).toEqual({ amplified: false });
    expect(out.boundary.sides[side].hand).toHaveLength(Math.max(out.boundary.config.openingHandSize[side], expected.length));
    const annotated = draws(out.events).filter(event => event.openingHandGuaranteed !== undefined);
    expect(annotated).toEqual(expected.map((instance, index) => ({ kind: "cardDrawn", side, instance,
      openingHandGuaranteed: { cardId: v.vanilla1.id, sources: index === 0 ? declarations.slice(0, 2) : declarations.slice(2) } })));
    expect(draws(out.events).filter(event => event.instance === expected[0])).toHaveLength(1);
    const control = opened(init);
    expect(out.boundary.sides[other]).toEqual(control.boundary.sides[other]);
    expect(out.boundary.rng).toEqual(control.boundary.rng);
    expect(out.boundary.dreamwell).toEqual(control.boundary.dreamwell);
    const controlOrder = [...control.boundary.sides[side].hand, ...control.boundary.sides[side].deck];
    const actualOrder = [...out.boundary.sides[side].hand, ...out.boundary.sides[side].deck];
    expect(actualOrder).toEqual([...expected, ...controlOrder.filter(id => !expected.includes(id))]);
    expect(out.state.turn).toEqual(control.state.turn);
    expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
  });

  it("preserves the entire absent and empty-declaration engine result and RNG streams", () => {
    const init = plain(), baseline = opened(init);
    expect(opened({ ...init, guaranteedOpeningHand: {} })).toEqual(baseline);
    expect(opened({ ...init, guaranteedOpeningHand: { player: [], enemy: [] } })).toEqual(baseline);
  });

  it.each([0, 1, 2])("fills at least every distinct guarantee with ordinary hand delta mode %s, then extra groups and energy", mode => {
    const init = plain("enemy");
    const declarations = [source(3), source(8, 1), source(12, 2)];
    const normal = prepared(init).config.openingHandSize;
    const effects = (side: Side) => ({ openingHand: [{ count: 1, filter: null }, { count: 1, filter: { cardType: "character" as const } }], startingEnergy: 4,
      smallerHandAndCostDiscount: mode < 2 ? [{ openingHandDelta: mode - normal[side], costReduction: 0 }] : init.nextBattle?.[side]?.smallerHandAndCostDiscount ?? [] });
    const out = opened({ ...init, guaranteedOpeningHand: { player: declarations, enemy: declarations }, nextBattle: { player: effects("player"), enemy: effects("enemy") } });
    for (const side of SIDES) {
      if (mode < 2) expect(out.boundary.config.openingHandSize[side]).toBe(mode);
      expect(out.boundary.sides[side].hand).toHaveLength(Math.max(out.boundary.config.openingHandSize[side], 3) + 2);
      expect(out.boundary.sides[side]).toMatchObject({ currentEnergy: 4, maxEnergy: 4 });
    }
    const completed = out.events.filter(event => event.kind === "openingHandCompleted");
    expect(completed).toEqual([{ kind: "openingHandCompleted", side: "enemy" }, { kind: "openingHandCompleted", side: "player" }]);
    const boundary = out.events.findIndex(event => event.kind === "openingHandCompleted");
    expect(draws(out.events.slice(0, boundary))).toHaveLength(out.boundary.sides.player.hand.length + out.boundary.sides.enemy.hand.length);
    expect(draws(out.events.slice(boundary))).toEqual([]);
    expect(out.state.turn.turnNumber).toBe(1);
  });

  it.each(SIDES)("keeps attributed draws private under null and repeated redaction and logs exact UUID/source/result: %s", side => {
    const init = { ...plain(side), guaranteedOpeningHand: { [side]: [source(3), source(3, 1)] } };
    const out = opened(init), event = draws(out.events).find(event => event.openingHandGuaranteed !== undefined);
    if (event === undefined) throw new Error("Missing attributed draw");
    const hidden = { kind: "cardDrawn", side, instance: null };
    expect(eventSeenBy(event, side, out.state)).toEqual(event);
    expect(eventSeenBy(event, opponent(side), out.state)).toEqual(hidden);
    expect(eventSeenBy({ ...event, instance: null }, opponent(side), out.state)).toEqual(hidden);
    const redacted = eventSeenBy(event, opponent(side), out.state);
    if (redacted === null) throw new Error("Draw count must be public");
    expect(eventSeenBy(redacted, opponent(side), out.state)).toEqual(hidden);
    expect(eventSeenBy(redacted, side, out.state)).toEqual(hidden);
    expect(eventLogRecords([event], 0)).toEqual([{ event: "engine.openingHandGuaranteed", version: 0, detail: event }]);
    expect(eventLogRecords([redacted], 0)).toEqual([]);
    const records: EngineLogRecord[] = [], fold = createFoldAdapter(engine, { log: record => records.push(record) });
    applied(fold.start(init));
    expect(records.filter(record => record.event === "engine.openingHandGuaranteed")).toEqual(eventLogRecords([event], 0));
    expect(records.find(record => record.event === "engine.battleStarted")).toMatchObject({ init });
    const publicState = copy(out.state);
    if (event.instance === null) throw new Error("Real draw must have a physical instance");
    publicState.knownTo[opponent(side)].push(event.instance);
    expect(eventSeenBy(event, opponent(side), publicState)).toEqual(hidden);
  });

  it("rejects malformed and inconsistent declarations atomically in construction and cold init guards", () => {
    const init = plain(), good = source(3);
    const malformed: unknown[] = [null, [], { partner: [] }, { player: null }, { player: [null] }, { player: [{ ...good, extra: true }] },
      ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, 20].map(deckIndex => ({ player: [{ ...good, deckIndex }] })),
      { player: [{ ...good, heldIndex: 5 }] }, { player: [{ ...good, heldIndex: -1 }] }, { player: [{ ...good, dreamsignId: ids[1] }] },
      { player: [{ ...good, dreamsignId: "invalid" }] }, { player: [{ ...good, entryId: "" }] }, { player: [good, good] },
      { player: [source(3, 1), source(8, 0)] }, { player: [good, source(8, 1, good.entryId)] },
      { player: [good, source(3, 1, parseDeckEntryId("another-entry"))] }, { enemy: [good, source(3, 1, parseDeckEntryId("another-entry"))] }];
    const slice = applied(createFoldAdapter(engine).start(init)).slice;
    for (const guaranteedOpeningHand of malformed) {
      const invalid = { ...init, guaranteedOpeningHand } as BattleInit, frozen = copy(invalid);
      let observed = 0;
      expect(() => engine.createBattle(invalid, NO_PROMPTS, () => { observed += 1; })).toThrow();
      expect(observed).toBe(0);
      expect(invalid).toEqual(frozen);
      expect(() => createFoldAdapter(engine).start(invalid)).toThrow();
      expect(parseEngineBattleFold(copy({ init: invalid, slice }), engine.catalog)).toBeNull();
    }
    expect(loaded(init, slice)).toEqual(slice);
    for (const phase of ["draw", "dawn", "day"] as const) {
      const prepared = { ...init, nextBattle: undefined, setup: setup("player", phase) };
      expect(() => engine.createBattle({ ...prepared, guaranteedOpeningHand: { player: [good] } }, NO_PROMPTS)).toThrow();
      expect(parseEngineBattleFold(copy({ init: { ...prepared, guaranteedOpeningHand: { player: [good] } }, slice }), engine.catalog)).toBeNull();
      expect(engine.createBattle({ ...prepared, guaranteedOpeningHand: { player: [] } }, NO_PROMPTS)).toEqual(engine.createBattle(prepared, NO_PROMPTS));
    }
  });

  it.each(SIDES)("cold-guards current and history-base own begin declarations against immutable init: %s", side => {
    const init = { ...plain(side), guaranteedOpeningHand: { [side]: [source(3)] } }, slice = applied(createFoldAdapter(engine).start(init)).slice;
    // Structural saved-step fixtures exercise the load boundary; beginBattle itself has no suspending prompt.
    const beginning: BattleSlice = { ...slice, inFlight: { step: { kind: "beginBattle", dreamwell: init.dreamwell, guaranteedOpeningHand: init.guaranteedOpeningHand }, automatic: true, answers: [] } };
    const saved = { init, slice: { ...beginning, history: { base: copy(beginning), entries: [] } } };
    expect(parseEngineBattleFold(copy(saved), engine.catalog)).toEqual(saved);
    for (const where of ["current", "history"] as const) for (const altered of [undefined, {}, { [side]: [source(4)] }, { [side]: [{ ...source(3), deckIndex: -1 }] }, { [side]: [{ ...source(3), extra: true }] }]) {
      const invalid = copy(saved), target = where === "current" ? invalid.slice : invalid.slice.history.base;
      if (target.inFlight?.step.kind !== "beginBattle") throw new Error("Missing begin DTO fixture");
      Object.assign(target.inFlight.step, { guaranteedOpeningHand: altered });
      expect(parseEngineBattleFold(copy(invalid), engine.catalog)).toBeNull();
    }
    const legacy = copy(saved);
    Object.assign(legacy.init, { guaranteedOpeningHand: undefined });
    for (const target of [legacy.slice, legacy.slice.history.base]) {
      if (target.inFlight?.step.kind !== "beginBattle") throw new Error("Missing begin DTO fixture");
      Object.assign(target.inFlight.step, { guaranteedOpeningHand: undefined });
    }
    expect(parseEngineBattleFold(legacy, engine.catalog)).toEqual(legacy);
    const forgedLegacy = copy(legacy);
    if (forgedLegacy.slice.inFlight?.step.kind !== "beginBattle") throw new Error("Missing begin DTO fixture");
    Object.assign(forgedLegacy.slice.inFlight.step, { guaranteedOpeningHand: init.guaranteedOpeningHand });
    expect(parseEngineBattleFold(forgedLegacy, engine.catalog)).toBeNull();
    const foreignStep = copy(saved);
    Object.assign(foreignStep.slice.inFlight!.step, { kind: "advancePhase" });
    expect(parseEngineBattleFold(foreignStep, engine.catalog)).toBeNull();
    const prepared = copy(saved);
    if (prepared.slice.inFlight?.step.kind !== "beginBattle") throw new Error("Missing begin DTO fixture");
    Object.assign(prepared.slice.inFlight.step, { preparedPhase: "day" });
    expect(parseEngineBattleFold(prepared, engine.catalog)).toBeNull();
  });

  it.each(SIDES)("retains completed guaranteed hands across real opening prompts, cold replay, cancel refusal and later redraw: %s", side => {
    const init = { ...plain(side), dreamsigns: { [side]: [ids[5], ids[7]] }, guaranteedOpeningHand: { [side]: [source(3, 0, undefined, ids[5])] } };
    const records: EngineLogRecord[] = [], fold = createFoldAdapter(engine, { checkEventPrefix: true, log: record => records.push(record) });
    const start = applied(fold.start(init)), prompt = fold.pending(start.slice);
    if (prompt?.prompt.kind !== "chooseCards") throw new Error("Missing real opening redraw prompt");
    const guaranteed = start.slice.committed.sides[side].hand[0];
    expect(start.slice.committed.turn.turnNumber).toBe(0);
    expect(start.slice.committed.instances[guaranteed].variant).toEqual({ amplified: true });
    expect(fold.reduce(start.slice, { kind: "cancel", side, promptId: prompt.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const cold = createFoldAdapter(engine, { checkEventPrefix: true }), restored = loaded(init, start.slice);
    expect(cold.pending(restored)).toEqual(prompt);
    const intent = { kind: "answer" as const, side, promptId: prompt.prompt.id, value: [guaranteed] };
    const warm = applied(fold.reduce(start.slice, intent)), again = applied(cold.reduce(restored, intent));
    expect(again).toEqual(warm);
    expect(warm.slice.committed.sides[side].hand).toEqual(start.slice.committed.sides[side].hand);
    expect(draws(warm.published)).toHaveLength(1);
    expect(draws(warm.published).every(event => event.openingHandGuaranteed === undefined)).toBe(true);
    const tail = cold.pending(again.slice);
    if (tail?.prompt.kind !== "confirm") throw new Error("Missing real trailing prompt");
    const done = applied(cold.reduce(loaded(init, again.slice), { kind: "answer", side, promptId: tail.prompt.id, value: false }));
    expect(done.slice.committed.sides[side].void).toContain(guaranteed);
    expect(done.slice.committed.sides[side].hand).not.toContain(guaranteed);
    expect(done.slice.committed.turn.turnNumber).toBe(1);
    expect(done.slice.committed.sides[side].score).toBe(3);
    expect(records.filter(record => record.event === "engine.openingHandGuaranteed")).toHaveLength(1);
    expect(done.published.filter(event => event.kind === "openingHandCompleted")).toEqual([]);
    const inline = engine.createBattle(init, new ScriptedSource([[guaranteed], false]));
    expect(stateHash(inline.state)).toBe(stateHash(done.slice.committed));
  });

  it.each(SIDES)("keeps the committed guarantee when a later published opening suffix fails: %s", side => {
    const init = { ...plain(side), dreamsigns: { [side]: [ids[6]] }, guaranteedOpeningHand: { [side]: [source(3, 0, undefined, ids[6])] } };
    const fold = createFoldAdapter(engine, { checkEventPrefix: true }), start = applied(fold.start(init)), prompt = fold.pending(start.slice);
    if (prompt?.prompt.kind !== "chooseCards") throw new Error("Missing opening prompt");
    const physical = start.slice.committed.sides[side].hand[0], initial = copy(start.slice.committed);
    const partial = applied(fold.reduce(start.slice, { kind: "answer", side, promptId: prompt.prompt.id, value: [physical] })), tail = fold.pending(partial.slice);
    if (tail === null) throw new Error("Missing suffix prompt");
    const failed = fold.reduce(loaded(init, partial.slice), { kind: "answer", side, promptId: tail.prompt.id, value: true });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("Expected genuine opening ability error");
    // Published private draws remain known on rollback; the committed zones and deal stay exact.
    for (const holder of SIDES) {
      expect(failed.slice.committed.sides[holder]).toEqual(initial.sides[holder]);
    }
    expect(failed.slice.committed.turn).toEqual(initial.turn);
    expect(failed.slice.committed.rng).toEqual(initial.rng);
    expect(failed.slice.committed.sides[side].hand[0]).toBe(physical);
    expect(failed.slice.inFlight).toBeNull();
    expect(draws(failed.published)).toEqual([]);
    expect(start.slice.committed.sides[side].hand[0]).toBe(physical);
  });
});
