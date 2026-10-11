import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, SyntheticHooks } from "../../../catalog";
import { event, topOfDeck } from "../../../dsl/builders";
import type { CardFilter } from "../../../dsl/types";
import { createEngine, type Engine } from "../../../engine";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { SIDES, type CardId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import { banishCards } from "../banish-cards";

type Mode = "filtered" | "plain" | "known" | "empty" | "crossed" | "opaque" | "hidden" | "asymmetric" | "failure";
const character: CardFilter = { cardType: "character" };

/**
 * The controller ("player") banishes from `owner`'s deck. Unless `deck` says
 * otherwise, that deck is [character, K, event, T, event] with K and T known
 * to both viewers: "the characters among the top 3" leaves K ambiguous and
 * T below the public prefix. "crossed" names a deep known card before an
 * anonymous one, against deck order.
 */
function fixture(owner: Side, mode: Mode, deck?: readonly CardId[]) {
  const player = owner === "player" ? "you" : "opponent";
  const effect = mode === "plain" ? banishCards([topOfDeck(1, {}, player)])
    : mode === "crossed" ? banishCards([topOfDeck(4, { cardType: "character", costAtLeast: 3 }, player), topOfDeck(4, { cardType: "event" }, player)])
    : banishCards([topOfDeck(3, character, player)]);
  const defined: EngineCardDefinition = { ...v.event0, id: syntheticId(0x43300), status: "authored", abilities: () => [event(effect)] };
  const hiddenSource: EngineCardDefinition = { ...defined, id: syntheticId(0x43301) };
  const synthetic: SyntheticHooks = { resolve(ctx, item) {
    const hand = ctx.state.sides.player.hand;
    const own = ctx.state.sides.player.deck;
    const source = mode === "hidden" ? own[own.length - 1] : mode === "asymmetric" ? hand[hand.length - 1] : item.instance;
    resolveEffect(ctx, effect, { source, origin: instanceOrigin(instanceOf(ctx.state, source)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
    if (mode === "failure") throw new Error("synthetic deck banishment failure");
  } };
  const source: EngineCardDefinition = ["opaque", "hidden", "asymmetric", "failure"].includes(mode) ? { ...defined, abilities: () => [], synthetic } : defined;
  const engine = createEngine(testCatalog([source, hiddenSource]));
  const cards = deck ?? (mode === "empty" ? [v.event0.id, v.event1.id, v.event0.id, v.event1.id, v.event0.id]
    : mode === "crossed" ? [v.event0.id, v.vanilla1.id, v.vanilla3.id, v.vanilla2.id]
    : [v.vanilla1.id, v.event1.id, v.event0.id, v.event1.id, v.event0.id]);
  const tail = mode === "hidden" ? [hiddenSource.id] : [];
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day",
    player: { hand: [source.id, ...(mode === "asymmetric" ? [hiddenSource.id] : [])], deck: owner === "player" ? [...cards, ...tail] : [...tail, v.event1.id] },
    enemy: { deck: owner === "enemy" ? cards : [v.event1.id] } });
  const known = [ids[owner].deck[1], mode === "crossed" ? ids[owner].deck[2] : ids[owner].deck[3], ...(mode === "known" ? [ids[owner].deck[0]] : [])];
  state.knownTo = { player: [...known], enemy: [...known] };
  return { engine, state, source: ids.player.hand[0], deck: ids[owner].deck };
}
const deckOf = (engine: Engine, state: BattleState, viewer: Side, owner: Side) => engine.view(state, viewer).sides[owner].deck;
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function observe(f: ReturnType<typeof fixture>) {
  const fold = createFoldAdapter(f.engine);
  const outcome = fold.reduce(sliceOf(f.state), { kind: "battleAction", side: "player", action: { kind: "play", card: f.source, from: "hand" } }, { presented: () => true, limit: 256 });
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("deck banishment failed");
  const snapshots = outcome.published.map(e => {
    const snapshot = fold.observed(e);
    if (!snapshot) throw new Error("missing event observation");
    return snapshot;
  });
  return { state: outcome.slice.committed, events: outcome.published, snapshots };
}
const left = (before: BattleState, after: BattleState, owner: Side) => before.sides[owner].deck.filter(id => !after.sides[owner].deck.includes(id));
/** The settled states every viewer observed once a card had left `owner`'s deck, ending with the committed one. */
const removed = (f: ReturnType<typeof fixture>, result: ReturnType<typeof observe>, owner: Side) =>
  [...result.snapshots.filter(s => left(f.state, s, owner).length > 0), result.state];
const banished = (result: ReturnType<typeof observe>) => result.events.flatMap(e => e.kind === "banished" ? [e.instance] : []);
const clean = (f: ReturnType<typeof fixture>, result: ReturnType<typeof observe>) => {
  expect(eventRedactionViolations(result.events, f.state, result.state)).toEqual([]);
  expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
};

describe("banishCards deck knowledge", () => {
  it.each(SIDES)("forgets a known place a filtered top removal from %s's deck leaves ambiguous, at every observation", owner => {
    const f = fixture(owner, "filtered"); const result = observe(f);
    expect(left(f.state, result.state, owner)).toEqual([f.deck[0]]);
    for (const state of removed(f, result, owner)) {
      for (const viewer of SIDES) expect(deckOf(f.engine, state, viewer, owner).known).toEqual([{ id: f.deck[3], index: 2 }]);
    }
    clean(f, result);
  });
  it.each(SIDES)("shows the same %s deck places whichever unseen prefix slot the filtered removal took", owner => {
    const first = fixture(owner, "filtered"); const second = fixture(owner, "filtered", [v.event0.id, v.event1.id, v.vanilla1.id, v.event1.id, v.event0.id]);
    const a = observe(first); const b = observe(second);
    expect(left(second.state, b.state, owner)).toEqual([second.deck[2]]);
    for (const viewer of SIDES) expect(deckOf(second.engine, b.state, viewer, owner)).toEqual(deckOf(first.engine, a.state, viewer, owner));
  });
  it.each(SIDES)("keeps %s deck places a visible unfiltered top or known removal determines", owner => {
    for (const mode of ["plain", "known"] as const) {
      const f = fixture(owner, mode); const result = observe(f);
      expect(left(f.state, result.state, owner)).toEqual([f.deck[0]]);
      for (const state of removed(f, result, owner)) {
        for (const viewer of SIDES) expect(deckOf(f.engine, state, viewer, owner).known).toEqual([{ id: f.deck[1], index: 0 }, { id: f.deck[3], index: 2 }]);
      }
    }
  });
  it.each(SIDES)("keeps %s deck knowledge when nothing matches", owner => {
    const f = fixture(owner, "empty"); const result = observe(f);
    expect(left(f.state, result.state, owner)).toEqual([]);
    for (const viewer of SIDES) expect(deckOf(f.engine, result.state, viewer, owner)).toEqual(deckOf(f.engine, f.state, viewer, owner));
  });
  it.each(SIDES)("banishes in reference order and infers no %s deck order the references do not show", owner => {
    const outcomes = [[v.event0.id, v.vanilla1.id, v.vanilla3.id, v.vanilla2.id], [v.vanilla2.id, v.vanilla1.id, v.vanilla3.id, v.event0.id]].map(deck => {
      const f = fixture(owner, "crossed", deck); const result = observe(f);
      const anonymous = deck[0] === v.event0.id ? f.deck[0] : f.deck[3];
      expect(banished(result)).toEqual([f.deck[2], anonymous]);
      for (const state of removed(f, result, owner)) {
        // Once only the known card has left, its departure determines the rest; the anonymous one then leaves K ambiguous.
        const expected = left(f.state, state, owner).length === 1 ? [{ id: f.deck[1], index: 1 }] : [];
        for (const viewer of SIDES) expect(deckOf(f.engine, state, viewer, owner).known).toEqual(expected);
      }
      clean(f, result);
      return SIDES.map(viewer => deckOf(f.engine, result.state, viewer, owner));
    });
    expect(outcomes[1]).toEqual(outcomes[0]);
  });
  for (const mode of ["opaque", "hidden"] as const) {
    it.each(SIDES)(`uses no public prefix or order for a ${mode} resolver removing from %s`, owner => {
      const f = fixture(owner, mode); const result = observe(f);
      expect(left(f.state, result.state, owner)).toEqual([f.deck[0]]);
      for (const viewer of SIDES) expect(deckOf(f.engine, result.state, viewer, owner).known).toEqual([]);
    });
  }
  it.each(SIDES)("bounds %s's deck removal only for the viewer who identifies the source, through observation and cold replay", owner => {
    const f = fixture(owner, "asymmetric"); const first = observe(f);
    const cold = { ...f, engine: createEngine(f.engine.catalog), state: JSON.parse(JSON.stringify(f.state)) as BattleState };
    const second = observe(cold);
    expect(stateHash(second.state)).toBe(stateHash(first.state));
    expect(second.events).toEqual(first.events);
    for (const [run, result] of [[f, first], [cold, second]] as const) {
      for (const state of removed(f, result, owner)) {
        expect(deckOf(run.engine, state, "player", owner).known).toEqual([{ id: f.deck[3], index: 2 }]);
        expect(deckOf(run.engine, state, "enemy", owner).known).toEqual([]);
      }
    }
    for (const viewer of SIDES) expect(cold.engine.view(second.state, viewer)).toEqual(f.engine.view(first.state, viewer));
    clean(f, first);
  });
  it("rolls back the banishment and its knowledge changes when resolution throws", () => {
    const f = fixture("player", "failure"); const fold = createFoldAdapter(f.engine);
    const outcome = fold.reduce(sliceOf(f.state), { kind: "battleAction", side: "player", action: { kind: "play", card: f.source, from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.published.some(e => e.kind === "banished")).toBe(false);
    expect(outcome.slice.committed.sides.player.deck).toEqual(f.deck);
    expect(outcome.slice.committed.knownTo).toEqual(f.state.knownTo);
    expect(invariantViolations(outcome.slice.committed, f.engine.catalog)).toEqual([]);
  });
});
