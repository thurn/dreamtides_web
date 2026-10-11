import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, SyntheticHooks } from "../../../catalog";
import { event, everyIn, topOfDeck } from "../../../dsl/builders";
import { createEngine, type Engine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { SIDES, type Side, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import { materialize } from "../materialize";
import { sequence } from "../sequence";
import { ifThen } from "../if-then";

type Mode = "filtered" | "plain" | "whole" | "single" | "known" | "empty" | "blocked" | "opaque" | "hidden" | "asymmetric" | "branchShort" | "branchLong" | "failure";
function fixture(owner: Side, mode: Mode, full = false) {
  const player = owner === "player" ? "you" : "opponent";
  const from = mode === "whole" ? everyIn("deck", { cardType: "character" }, { player })
    : topOfDeck(mode === "single" ? 1 : mode === "empty" ? 0 : 4, mode === "plain" || mode === "single" ? {} : { cardType: "character" }, player);
  const branch = mode === "branchShort" || mode === "branchLong";
  const effect = branch ? ifThen({ cond: "cardsIn", player: "you", zone: "hand", filter: { cardType: "event", costAtLeast: 1 }, atLeast: 1 },
    materialize(topOfDeck(2, { cardType: "character" }, player)), materialize(topOfDeck(5, { cardType: "character" }, player)))
    : mode === "blocked" ? sequence(materialize(everyIn("hand", { cardType: "character" })), materialize(from)) : materialize(from);
  const defined: EngineCardDefinition = { ...v.event0, id: syntheticId(0x40900), status: "authored", abilities: () => [event(effect)] };
  const hiddenSource: EngineCardDefinition = { ...defined, id: syntheticId(0x40901) };
  const synthetic: SyntheticHooks = { resolve(ctx, item) {
    const deck = ctx.state.sides.player.deck;
    const hand = ctx.state.sides.player.hand;
    const source = mode === "hidden" ? deck[deck.length - 1] : mode === "asymmetric" ? hand[hand.length - 1] : item.instance;
    resolveEffect(ctx, effect, { source, origin: instanceOrigin(instanceOf(ctx.state, source)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
    if (mode === "failure") throw new Error("synthetic deck materialization failure");
  } };
  const source: EngineCardDefinition = ["opaque", "hidden", "asymmetric", "failure"].includes(mode) ? { ...defined, abilities: () => [], synthetic } : defined;
  const engine = createEngine(testCatalog([source, hiddenSource]));
  const deck = mode === "single" ? [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.event1.id]
    : mode === "known" ? [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.event1.id]
    : full ? [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.event1.id]
    : [v.event0.id, v.vanilla1.id, v.event1.id, branch ? v.event0.id : v.vanilla2.id, v.event0.id, mode === "hidden" ? hiddenSource.id : v.vanilla3.id];
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day",
    player: { hand: [source.id, ...(mode === "blocked" ? [v.vanilla1.id] : mode === "asymmetric" ? [hiddenSource.id] : branch ? [mode === "branchShort" ? v.event1.id : v.event0.id] : [])], back: full ? [] : Array.from({ length: 9 }, () => v.vanilla1.id), deck: owner === "player" ? deck : [mode === "hidden" ? hiddenSource.id : v.event1.id] },
    enemy: { deck: owner === "enemy" ? deck : [v.event1.id] } });
  const known = mode === "single" || full ? [ids[owner].deck[1], ids[owner].deck[3]]
    : mode === "known" ? [ids[owner].deck[0], ids[owner].deck[1], ids[owner].deck[3]]
    : [ids[owner].deck[0], ids[owner].deck[2], ids[owner].deck[4]];
  state.knownTo = { player: [...known], enemy: [...known] };
  return { engine, state, ids, source: ids.player.hand[0], deck: ids[owner].deck, known };
}
const sees = (engine: Engine, state: BattleState, viewer: Side, id: InstanceId) => engine.view(state, viewer).instances[id] !== undefined;
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function observe(f: ReturnType<typeof fixture>) {
  const fold = createFoldAdapter(f.engine);
  const outcome = fold.reduce(sliceOf(f.state), { kind: "battleAction", side: "player", action: { kind: "play", card: f.source, from: "hand" } }, { presented: () => true, limit: 256 });
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("public materialization failed");
  const snapshots = outcome.published.map(e => {
    const snapshot = fold.observed(e);
    if (!snapshot) throw new Error("missing event observation");
    return snapshot;
  });
  return { state: outcome.slice.committed, events: outcome.published, snapshots };
}
const left = (before: BattleState, after: BattleState, owner: Side) => before.sides[owner].deck.filter(id => !after.sides[owner].deck.includes(id));

describe("materialize deck knowledge", () => {
  for (const mode of ["filtered", "plain", "whole"] as const) {
    it.each(SIDES)(`re-checks ${mode} removals from %s's deck at each observation and capacity limit`, owner => {
      const f = fixture(owner, mode); const result = observe(f);
      expect(left(f.state, result.state, owner)).toEqual([f.deck[1]]);
      expect(result.events.filter(e => e.kind === "materialized")).toHaveLength(1);
      expect(result.events.some(e => e.kind === "capacityReached")).toBe(true);
      for (const state of [...result.snapshots.filter(s => left(f.state, s, owner).length > 0), result.state]) {
        for (const viewer of SIDES) {
          expect(sees(f.engine, state, viewer, f.deck[0])).toBe(true);
          expect(sees(f.engine, state, viewer, f.deck[2])).toBe(false);
          expect(sees(f.engine, state, viewer, f.deck[4])).toBe(mode !== "whole");
          expect(sees(f.engine, state, viewer, f.deck[3])).toBe(false);
          if (mode !== "whole") expect(f.engine.view(state, viewer).sides[owner].deck.known).toContainEqual({ id: f.deck[4], index: 3 });
        }
      }
      const capacity = result.events.find(e => e.kind === "capacityReached")!;
      for (const viewer of SIDES) expect(eventSeenBy(capacity, viewer, result.state)).toMatchObject({ instance: null });
      expect(eventRedactionViolations(result.events, f.state, result.state)).toEqual([]);
      expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
    });
  }
  it.each(SIDES)("regains a position once all ambiguous slots in %s's prefix have visibly left", owner => {
    const f = fixture(owner, "filtered", true); const result = observe(f);
    expect(left(f.state, result.state, owner)).toEqual([f.deck[0], f.deck[2]]);
    const partial = result.snapshots.filter(s => left(f.state, s, owner).length === 1);
    expect(partial.length).toBeGreaterThan(0);
    for (const state of partial) for (const viewer of SIDES) expect(sees(f.engine, state, viewer, f.deck[1])).toBe(false);
    for (const viewer of SIDES) expect(f.engine.view(result.state, viewer).sides[owner].deck.known).toEqual([{ id: f.deck[1], index: 0 }, { id: f.deck[3], index: 1 }]);
  });
  it.each(SIDES)("preserves exact positions after the visible unfiltered top removal from %s", owner => {
    const f = fixture(owner, "single"); const result = observe(f);
    for (const viewer of SIDES) expect(f.engine.view(result.state, viewer).sides[owner].deck.known).toEqual([{ id: f.deck[1], index: 0 }, { id: f.deck[3], index: 2 }]);
  });
  it.each(SIDES)("preserves exact positions when the actual removal from %s was known", owner => {
    const f = fixture(owner, "known"); const result = observe(f);
    expect(left(f.state, result.state, owner)).toEqual([f.deck[0]]);
    for (const viewer of SIDES) expect(f.engine.view(result.state, viewer).sides[owner].deck.known).toEqual([{ id: f.deck[1], index: 0 }, { id: f.deck[3], index: 2 }]);
  });
  for (const mode of ["empty", "blocked"] as const) {
    it.each(SIDES)(`keeps %s deck knowledge when ${mode} causes no actual deck removal`, owner => {
      const f = fixture(owner, mode); const result = observe(f);
      expect(left(f.state, result.state, owner)).toEqual([]);
      for (const viewer of SIDES) expect(f.engine.view(result.state, viewer).sides[owner].deck.known).toEqual(f.engine.view(f.state, viewer).sides[owner].deck.known);
    });
  }
  for (const mode of ["opaque", "hidden"] as const) {
    it.each(SIDES)(`uses no hidden prefix proof for a ${mode} resolver removing from %s`, owner => {
    const f = fixture(owner, mode); const result = observe(f);
    for (const viewer of SIDES) {
      expect(sees(f.engine, result.state, viewer, f.deck[0])).toBe(true);
      expect(sees(f.engine, result.state, viewer, f.deck[2])).toBe(false);
      expect(sees(f.engine, result.state, viewer, f.deck[4])).toBe(false);
    }
  });
  }
  it.each(SIDES)("bounds %s's deck removal only for the viewer who identifies the source, through observation and cold replay", owner => {
    const f = fixture(owner, "asymmetric"); const first = observe(f);
    const cold = { ...f, engine: createEngine(f.engine.catalog), state: JSON.parse(JSON.stringify(f.state)) as BattleState };
    const second = observe(cold);
    expect(left(f.state, first.state, owner)).toEqual([f.deck[1]]);
    expect(stateHash(second.state)).toBe(stateHash(first.state));
    expect(second.events).toEqual(first.events);
    for (const [run, result] of [[f, first], [cold, second]] as const) {
      for (const state of [...result.snapshots.filter(s => left(f.state, s, owner).length > 0), result.state]) {
        for (const viewer of SIDES) {
          expect(sees(run.engine, state, viewer, f.deck[0])).toBe(true);
          expect(sees(run.engine, state, viewer, f.deck[2])).toBe(false);
        }
        expect(run.engine.view(state, "player").sides[owner].deck.known).toContainEqual({ id: f.deck[4], index: 3 });
        expect(sees(run.engine, state, "enemy", f.deck[4])).toBe(false);
      }
    }
    for (const viewer of SIDES) expect(cold.engine.view(second.state, viewer)).toEqual(f.engine.view(first.state, viewer));
    expect(eventRedactionViolations(first.events, f.state, first.state)).toEqual([]);
  });
  it.each(SIDES)("uses the public maximum count across hidden branches on %s's deck", owner => {
    const short = fixture(owner, "branchShort"); const longer = fixture(owner, "branchLong");
    const first = observe(short); const second = observe(longer);
    expect(first.events).toEqual(second.events);
    expect(short.engine.view(first.state, "enemy").sides[owner].deck).toEqual(longer.engine.view(second.state, "enemy").sides[owner].deck);
    for (const [f, result] of [[short, first], [longer, second]] as const) {
      expect(sees(f.engine, result.state, "enemy", f.deck[2])).toBe(false);
      expect(f.engine.view(result.state, "enemy").sides[owner].deck.known).toContainEqual({ id: f.deck[4], index: 3 });
    }
  });
  it.each(SIDES)("cold-replays %s's deck removal with identical public views and events", owner => {
    const f = fixture(owner, "filtered"); const first = observe(f);
    const cold = { ...f, engine: createEngine(f.engine.catalog), state: JSON.parse(JSON.stringify(f.state)) as BattleState };
    const second = observe(cold);
    expect(stateHash(second.state)).toBe(stateHash(first.state));
    expect(second.events).toEqual(first.events);
    for (const viewer of SIDES) expect(cold.engine.view(second.state, viewer)).toEqual(f.engine.view(first.state, viewer));
  });
  it("rolls back actual materialization and its knowledge changes when resolution throws", () => {
    const f = fixture("player", "failure"); const fold = createFoldAdapter(f.engine);
    const outcome = fold.reduce(sliceOf(f.state), { kind: "battleAction", side: "player", action: { kind: "play", card: f.source, from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.slice.inFlight).toBeNull();
    expect(outcome.published.some(e => e.kind === "materialized")).toBe(false);
    expect(outcome.slice.committed.sides.player.deck).toEqual(f.deck);
    for (const viewer of SIDES) expect(f.engine.view(outcome.slice.committed, viewer).sides.player.deck).toEqual(f.engine.view(f.state, viewer).sides.player.deck);
    expect(invariantViolations(outcome.slice.committed, f.engine.catalog)).toEqual([]);
  });
});
