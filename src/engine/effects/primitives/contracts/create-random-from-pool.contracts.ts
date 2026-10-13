/** Fixed pool provenance, private creation, replay and sampling through public engine/fold APIs. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { activated, energy, energyX, event, fromVoid, self, x } from "../../../dsl/builders";
import type { Variant } from "../../../dsl/types";
import { onDawn, triggered } from "../../../dsl/triggers";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type IntentOutcome } from "../../../fold/slice";
import { firstLegalAnswer } from "../../../prompts/answers";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { cloneState } from "../../../state/clone";
import { serializeState, deserializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, parseFigmentId, type Side } from "../../../state/ids";
import type { BattleInit, BattleState, CardInstance } from "../../../state/types";
import { InlineSource } from "../../../steps/sources";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { testDreamsignId } from "../../../../types/test-identities";
import { resolveEffect } from "../../interpreter";
import { createCard } from "../create-card";
import { createCopyInHand } from "../create-copy-in-hand";
import { banishCards } from "../banish-cards";
import { gainAbilities } from "../gain-abilities";
import { returnToHand } from "../return-to-hand";
import { createRandomFromPool } from "../create-random-from-pool";
import { gainPoints } from "../gain-points";
import { optional } from "../optional";
import { sequence } from "../sequence";

const cheap: EngineCardDefinition = { ...v.event0, status: "authored", id: syntheticId(0x580001), costs: [energy(2), energyX(7)], abilities: () => [event(gainPoints(x()))] };
const otherCheap: EngineCardDefinition = { ...v.event0, status: "authored", id: syntheticId(0x580002), costs: [energy(1)], abilities: () => [event(gainPoints(1))] };
const expensive: EngineCardDefinition = { ...otherCheap, id: syntheticId(0x580003), costs: [energy(3)] };
const filter = { cardType: "event" as const, costAtMost: 2 };
const paused: EngineCardDefinition = { ...v.event0, status: "authored", id: syntheticId(0x580004), abilities: () => [event(sequence(createRandomFromPool(filter), optional(gainPoints(0))))] };
const toOpponent: EngineCardDefinition = { ...v.event0, status: "authored", id: syntheticId(0x580005), abilities: () => [event(createRandomFromPool(filter, "opponent"))] };
const failing: EngineCardDefinition = { ...v.event0, status: "authored", id: syntheticId(0x580006), abilities: () => [], synthetic: { resolve(ctx, item) {
  resolveEffect(ctx, createRandomFromPool(filter), { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
  throw new Error("synthetic failure after pool creation");
} } };
const sign = testDreamsignId("580-pool-creation");
const engine = createEngine(testCatalog([cheap, otherCheap, expensive, paused, toOpponent, failing], {
  dreamsigns: [{ id: sign, status: "authored", abilities: () => [triggered(onDawn(), createRandomFromPool(filter))] }],
}));
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const pools = () => ({ player: [cheap.id, cheap.id, expensive.id, v.vanilla1.id], enemy: [otherCheap.id] });
const applied = (outcome: IntentOutcome) => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("public pool contract intent failed");
  return outcome;
};
const answers = () => new InlineSource({ player: firstLegalAnswer, enemy: firstLegalAnswer });

function init(side: Side, draftPools: BattleInit["draftPools"] = pools(), phase: "day" | "dawn" = "dawn", source?: EngineCardDefinition): BattleInit {
  const other = opponent(side);
  return { seed: battleSeed(`pool-contract:${side}`), scoreToWin: 1000, startingSide: side,
    decks: { player: [], enemy: [], ...(source === undefined ? {} : { [side]: [{ cardId: source.id }] }) }, dreamwell: [],
    ...(draftPools === undefined ? {} : { draftPools }), dreamsigns: { [side]: [sign] },
    setup: { placements: source === undefined ? [] : [{ side, deckIndex: 0, zone: "hand" }],
      sides: { player: { currentEnergy: 30, maxEnergy: 30, score: 0 }, enemy: { currentEnergy: 30, maxEnergy: 30, score: 0 } },
      turn: { active: side, phase, round: 1, turnNumber: 1, sideTurns: { [side]: 1, [other]: 0 } as Record<Side, number>, lastNormal: side },
      dreamwell: { deck: [], next: 0 } } };
}

const returning: EngineCardDefinition = { ...v.vanilla1, status: "authored", id: syntheticId(0x9f004), abilities: () => [activated([], returnToHand(self()))] };
function domainScene(side: Side, mixed = false, multiple = false, player: "you" | "opponent" = "you") {
  const holder = player === "you" ? side : opponent(side);
  const effect = multiple ? sequence(createRandomFromPool(filter, player), createRandomFromPool({ cardType: "event", costAtMost: 1 }, player),
    createRandomFromPool({ cardType: "character", costAtMost: 1 }, player), createCard(v.vanilla1.id, 1, player)) : createRandomFromPool(filter, player);
  const custom = createEngine(testCatalog([cheap, otherCheap, expensive, returning], {
    dreamsigns: [{ id: sign, status: "authored", abilities: () => [triggered(onDawn(), effect)] }],
  }));
  const declared = { player: [cheap.id, cheap.id, otherCheap.id, expensive.id, returning.id], enemy: [cheap.id, otherCheap.id, otherCheap.id, expensive.id, returning.id] };
  const input: BattleInit = { ...init(side, declared), decks: { player: [], enemy: [], ...(mixed ? { [holder]: [{ cardId: v.vanilla1.id }, { cardId: v.vanilla3.id, amplified: true }] } : {}) },
    setup: { ...init(side).setup!, placements: mixed ? [{ side: holder, deckIndex: 0, zone: "hand" }] : [] } };
  return { engine: custom, input, holder, started: applied(createFoldAdapter(custom).start(input)) };
}
const constrained = (state: BattleState): CardInstance[] => Object.values(state.instances).filter((card) => card.poolCandidates !== undefined);
const ordinary = (state: BattleState) => Object.values(state.instances).filter((card) => !card.status.created)
  .map(({ owner, printing, variant }) => ({ owner, printing, variant })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

describe("createRandomFromPool", () => {
  it.each(["player", "enemy"] as const)("creates one private base card from the resolved side's eligible multiset using random:dreamsign for %s", (side) => {
    const declared = pools(), input = init(side, declared), before = copy(input);
    const started = applied(createFoldAdapter(engine).start(input));
    const created = started.published.filter((e) => e.kind === "cardCreated");
    expect(created).toHaveLength(1);
    const card = started.slice.committed.instances[created[0].instance];
    expect(card).toMatchObject({ owner: side, controller: side, zone: "hand", printing: { kind: "card", cardId: side === "player" ? cheap.id : otherCheap.id }, variant: { amplified: false }, status: { created: true, x: null } });
    expect(started.slice.committed.rng).toEqual({ "random:dreamsign": 1 });
    expect(started.slice.committed.draftPools).toEqual(declared);
    expect(input).toEqual(before);
    expect(eventSeenBy(created[0], opponent(side), started.slice.committed)).toBeNull();
    expect(engine.view(started.slice.committed, opponent(side)).instances[card.id]).toBeUndefined();
    expect(eventRedactionViolations(started.published, started.slice.committed, started.slice.committed)).toEqual([]);
    expect(invariantViolations(started.slice.committed, engine.catalog)).toEqual([]);
    // The printed 2+X card is eligible with X=0 despite its play-time minimum7.
    const played = engine.apply(started.slice.committed, side, { kind: "play", card: card.id, from: "hand" }, answers());
    const done = passUntil(engine, played.state, (state) => state.stack.length === 0, answers());
    expect(done.state.instances[card.id]).toBeUndefined();
    expect([...played.events, ...done.events]).toContainEqual({ kind: "ceasedToExist", instance: card.id, side, from: "stack" });
    expect(done.state.draftPools).toEqual(declared);
  });

  it("selects an eligible printing while preserving copies, source exclusion and unrelated streams", () => {
    const declared = { player: [cheap.id, cheap.id, otherCheap.id], enemy: [expensive.id] };
    const started = applied(createFoldAdapter(engine).start(init("player", declared)));
    const card = started.published.find((e) => e.kind === "cardCreated");
    if (card === undefined || card.printing.kind !== "card") throw new Error("matching printing not created");
    expect([cheap.id, otherCheap.id]).toContain(card.printing.cardId);
    expect(started.slice.committed.draftPools).toEqual(declared);
    expect(started.slice.committed.rng).toEqual({ "random:dreamsign": 1 });
  });

  it.each(["player", "enemy"] as const)("uses the requested opponent holder's source rather than the controller's pool for %s", (side) => {
    const input = init(side, pools(), "day", toOpponent), fold = createFoldAdapter(engine), started = applied(fold.start(input));
    const played = applied(fold.reduce(started.slice, { kind: "battleAction", side, action: { kind: "play", card: started.slice.committed.sides[side].hand[0], from: "hand" } }));
    const created = played.published.filter((e) => e.kind === "cardCreated");
    expect(created).toEqual([expect.objectContaining({ side: opponent(side), printing: { kind: "card", cardId: side === "player" ? otherCheap.id : cheap.id } })]);
    expect(eventSeenBy(created[0], side, played.slice.committed)).toBeNull();
    expect(played.slice.committed.rng).toEqual({ "random:dreamsign": 1 });
  });

  it("does nothing for missing, empty or unmatched pools without a catalog fallback or RNG draw", () => {
    for (const declared of [undefined, { player: [], enemy: [] }, { player: [expensive.id, v.vanilla1.id], enemy: [] }]) {
      const input = init("player", declared);
      if (declared === undefined) delete (input as { draftPools?: BattleInit["draftPools"] }).draftPools;
      const started = applied(createFoldAdapter(engine).start(input));
      expect(started.published.filter((e) => e.kind === "cardCreated")).toEqual([]);
      expect(started.slice.committed.rng).toEqual({});
      expect(started.slice.committed.sides.player.hand).toEqual([]);
    }
  });

  it.each(["player", "enemy"] as const)("creates again at a later ordinary Dawn without consuming the fixed pool for %s", (side) => {
    const started = applied(createFoldAdapter(engine).start(init(side)));
    const later = passUntil(engine, started.slice.committed, (state) => state.turn.active === side && state.turn.phase === "day" && state.turn.sideTurns[side] > 1);
    expect(later.events.filter((e) => e.kind === "cardCreated")).toHaveLength(1);
    expect(later.state.sides[side].hand).toHaveLength(2);
    expect(later.state.rng["random:dreamsign"]).toBe(2);
    expect(later.state.draftPools).toEqual(pools());
  });

  it.each(["player", "enemy"] as const)("preserves fixed pools through clone, JSON save, strict reload and sampled future creation for %s", (side) => {
    const input = init(side), started = applied(createFoldAdapter(engine).start(input)), state = started.slice.committed;
    expect(cloneState(state)).toEqual(deserializeState(serializeState(state)));
    expect(stateHash(cloneState(state))).toBe(stateHash(state));
    const loaded = parseEngineBattleFold(copy({ init: input, slice: started.slice }));
    expect(loaded?.slice).toEqual(started.slice);
    const changed = { ...state, draftPools: { ...state.draftPools!, player: [...state.draftPools!.player, otherCheap.id] } };
    expect(stateHash(changed)).not.toBe(stateHash(state));
    for (const viewer of ["player", "enemy"] as const) {
      const visible = engine.view(state, viewer);
      expect(visible.draftPools).toEqual(input.draftPools);
      const sampled = engine.determinize(visible, input.decks, () => 0.9);
      expect(sampled.sides[side].hand).toHaveLength(1);
      expect(sampled.instances[sampled.sides[side].hand[0]]).toMatchObject({ printing: { kind: "card", cardId: side === "player" ? cheap.id : otherCheap.id }, variant: { amplified: false }, poolCandidates: side === "player" ? [cheap.id, cheap.id] : [otherCheap.id] });
      expect(sampled.draftPools).toEqual(input.draftPools);
      const saved = parseEngineBattleFold(copy({ init: input, slice: { ...started.slice, committed: sampled } }));
      if (saved === null) throw new Error("sampled pool snapshot rejected");
      const later = passUntil(engine, saved.slice.committed, (next) => next.turn.active === side && next.turn.phase === "day" && next.turn.sideTurns[side] > 1);
      const created = later.events.filter((e) => e.kind === "cardCreated");
      expect(created).toEqual([expect.objectContaining({ side, printing: { kind: "card", cardId: side === "player" ? cheap.id : otherCheap.id } })]);
      expect(later.state.draftPools).toEqual(input.draftPools);
    }
  });

  it("restores qualified anonymous observed pool-created facts without revealing the physical hand identity", () => {
    const input = init("player", { player: [cheap.id, otherCheap.id], enemy: [] });
    const started = applied(createFoldAdapter(engine).start(input)), state = started.slice.committed;
    const physical = state.instances[state.sides.player.hand[0]];
    // A declared public observation from a genuine output, rather than a claimed interactive reveal/forget workflow.
    const observed: BattleState = { ...state, rememberedCards: { player: [], enemy: [{ instance: physical.id, owner: physical.owner, printing: physical.printing, variant: physical.variant, status: physical.status, effects: [] }] } };
    const visible = engine.view(observed, "enemy");
    expect(visible.instances[physical.id]).toBeUndefined();
    expect(visible.hiddenCards?.player).toHaveLength(1);
    const sampled = engine.determinize(visible, input.decks, () => 0.9), again = engine.view(sampled, "enemy");
    expect(again.hiddenCards?.player).toEqual(visible.hiddenCards?.player);
    expect(sampled.sides.player.hand).toHaveLength(1);
    expect(sampled.instances[sampled.sides.player.hand[0]]).toMatchObject({ printing: physical.printing, variant: physical.variant, status: { created: true } });
  });

  it("replays a paused creation with the same RNG prefix and rejects stale or concurrent answers", () => {
    const input = init("player", pools(), "day", paused), fold = createFoldAdapter(engine), started = applied(fold.start(input));
    const opened = applied(fold.reduce(started.slice, { kind: "battleAction", side: "player", action: { kind: "play", card: started.slice.committed.sides.player.hand[0], from: "hand" } })).slice;
    const pending = fold.pending(opened)!;
    expect(pending.prompt.kind).toBe("confirm");
    expect(pending.display.rng["random:dreamsign"]).toBe(1);
    const loaded = parseEngineBattleFold(copy({ init: input, slice: opened }));
    if (loaded === null) throw new Error("paused pool source rejected");
    const cold = createFoldAdapter(engine), answer = { kind: "answer" as const, side: "player" as const, promptId: pending.prompt.id, value: true };
    expect(cold.pending(loaded.slice)).toEqual(pending);
    expect(cold.reduce(loaded.slice, { ...answer, side: "enemy" })).toMatchObject({ kind: "bounced" });
    expect(cold.reduce(loaded.slice, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });
    const stale = { ...loaded.slice, attempt: loaded.slice.attempt + 1 };
    expect(cold.reduce(stale, answer)).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    const completed = applied(cold.reduce(loaded.slice, answer));
    expect(completed).toEqual(fold.reduce(opened, answer));
    expect(completed.slice.committed.rng["random:dreamsign"]).toBe(1);
    expect(completed.slice.committed.sides.player.hand).toHaveLength(1);
    expect(cold.reduce(completed.slice, answer)).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("rolls back creation and RNG on a mid-step error without partial publication", () => {
    const fold = createFoldAdapter(engine), started = applied(fold.start(init("player", pools(), "day", failing)));
    const before = copy(started.slice), outcome = fold.reduce(started.slice, { kind: "battleAction", side: "player", action: { kind: "play", card: started.slice.committed.sides.player.hand[0], from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("synthetic creation failure missing");
    expect(outcome.published.filter((e) => e.kind === "cardCreated")).toEqual([]);
    expect(outcome.slice.committed.rng).toEqual({});
    expect(outcome.slice.committed.sides.player.hand).toEqual([]);
    expect(started.slice).toEqual(before);
  });

  it("rejects malformed, partial and inconsistent saved pool fields without mutation", () => {
    const input = init("player"), started = applied(createFoldAdapter(engine).start(input));
    const { history: _history, ...base } = started.slice;
    const saved = { init: input, slice: { ...started.slice, history: { base, entries: [] } } };
    expect(parseEngineBattleFold(copy(saved))).not.toBeNull();
    for (const value of [null, [], {}, { player: [] }, { player: [], enemy: [], outsider: [] }, { player: ["bad"], enemy: [] }, { player: [], enemy: [] }]) {
      for (const where of ["init", "committed", "history"] as const) {
        const bad = copy(saved);
        const record = where === "init" ? bad.init : where === "committed" ? bad.slice.committed : bad.slice.history.base.committed;
        (record as unknown as Record<string, unknown>).draftPools = value;
        const before = copy(bad);
        expect(parseEngineBattleFold(bad)).toBeNull();
        expect(bad).toEqual(before);
      }
    }
    const partial = copy(saved);
    delete (partial.slice.committed as { draftPools?: BattleState["draftPools"] }).draftPools;
    expect(parseEngineBattleFold(partial)).toBeNull();
    const unknown = { ...input, draftPools: { player: [syntheticId(0x580fff)], enemy: [] } };
    expect(() => createFoldAdapter(engine).start(unknown)).toThrow();
  });

  it("samples each created hand domain as base while retaining original inventory for both viewers", () => {
    for (const side of ["player", "enemy"] as const) for (const mixed of [false, true]) for (const player of ["you", "opponent"] as const) {
      const scene = domainScene(side, mixed, true, player), state = scene.started.slice.committed;
      expect(constrained(state)).toHaveLength(3);
      for (const viewer of ["player", "enemy"] as const) for (const draw of [0.1, 0.9]) {
        const visible = scene.engine.view(state, viewer), before = copy(visible);
        const sampled = scene.engine.determinize(visible, scene.input.decks, () => draw);
        expect(visible).toEqual(before);
        expect(ordinary(sampled)).toEqual(ordinary(state));
        expect(constrained(sampled)).toHaveLength(3);
        expect(Object.values(sampled.instances).filter((card) => card.status.created)).toHaveLength(4);
        for (const card of constrained(sampled)) {
          if (card.printing.kind !== "card") throw new Error("pool card has no card printing");
          expect(card.poolCandidates).toContain(card.printing.cardId);
          expect(card.variant).toEqual({ amplified: false });
          expect(card).toMatchObject({ owner: scene.holder, controller: scene.holder, zone: "hand", status: { created: true } });
        }
        expect(scene.engine.view(sampled, viewer).poolCreatedHands).toEqual(visible.poolCreatedHands);
        expect(invariantViolations(sampled, scene.engine.catalog)).toEqual([]);
      }
    }
  });

  it("keeps unobserved pool choices anonymous across different printing and physical identities", () => {
    const scene = domainScene("player"), state = scene.started.slice.committed;
    const actual = constrained(state)[0], otherId = "i99" as const;
    const changed: BattleState = { ...copy(state), nextInstance: 100, instances: { [otherId]: { ...copy(actual), id: otherId, printing: { kind: "card", cardId: actual.printing.kind === "card" && actual.printing.cardId === cheap.id ? otherCheap.id : cheap.id } } },
      sides: { ...copy(state.sides), player: { ...copy(state.sides.player), hand: [otherId] } }, rememberedCards: { player: [], enemy: [] } };
    const anonymous = { ...state, rememberedCards: { player: [], enemy: [] } };
    const visible = scene.engine.view(anonymous, "enemy");
    expect(scene.engine.view(changed, "enemy")).toEqual(visible);
    expect(visible.instances[actual.id]).toBeUndefined();
    expect(visible.poolCreatedHands?.player).toEqual([{ owner: "player", candidates: [cheap.id, cheap.id, otherCheap.id].sort() }]);
    const cloned = cloneState(state), shown = scene.engine.view(state, "player");
    expect(cloned.instances[actual.id].poolCandidates).not.toBe(actual.poolCandidates);
    expect(shown.instances[actual.id].poolCandidates).not.toBe(actual.poolCandidates);
    const narrower: BattleState = { ...state, instances: { ...state.instances, [actual.id]: { ...actual, poolCandidates: [actual.printing.kind === "card" ? actual.printing.cardId : cheap.id] } } };
    expect(stateHash(narrower)).not.toBe(stateHash(state));
  });

  it("preserves current created domains through sampled cold-save continuation", () => {
    for (const side of ["player", "enemy"] as const) {
      const scene = domainScene(side, true), state = scene.started.slice.committed;
      const sampled = scene.engine.determinize(scene.engine.view(state, opponent(side)), scene.input.decks, () => 0.9);
      const loaded = parseEngineBattleFold(copy({ init: scene.input, slice: { ...scene.started.slice, committed: sampled } }));
      if (loaded === null) throw new Error("sampled domain rejected");
      expect(stateHash(loaded.slice.committed)).toBe(stateHash(cloneState(sampled)));
      const card = constrained(loaded.slice.committed)[0];
      expect(card.variant).toEqual({ amplified: false });
      expect(card.poolCandidates).toContain(card.printing.kind === "card" ? card.printing.cardId : null);
      const played = scene.engine.apply(loaded.slice.committed, side, { kind: "play", card: card.id, from: "hand" }, answers());
      const done = passUntil(scene.engine, played.state, (next) => next.stack.length === 0, answers());
      expect(done.state.instances[card.id]).toBeUndefined();
      expect([...played.events, ...done.events]).toContainEqual({ kind: "ceasedToExist", instance: card.id, side, from: "stack" });
      const later = passUntil(scene.engine, done.state, (next) => next.turn.active === side && next.turn.phase === "day" && next.turn.sideTurns[side] > 1);
      expect(constrained(later.state)).toHaveLength(1);
      expect(later.state.draftPools).toEqual(scene.input.draftPools);
    }
  });

  it("binds overlapping domains to their genuine derived anonymous observations", () => {
    const scene = domainScene("player", true, true), state = scene.started.slice.committed;
    const cards = constrained(state), observed: BattleState = { ...state, rememberedCards: { player: [], enemy: cards.map((card) => ({ instance: card.id, owner: card.owner, printing: card.printing, variant: card.variant, status: card.status, effects: [] })) } };
    // These declared snapshots derive from genuine outputs; no interactive reveal/forget workflow is claimed.
    const visible = scene.engine.view(observed, "enemy"), sampled = scene.engine.determinize(visible, scene.input.decks, () => 0.9);
    expect(scene.engine.view(sampled, "enemy").hiddenCards).toEqual(visible.hiddenCards);
    expect(scene.engine.view(sampled, "enemy").poolCreatedHands).toEqual(visible.poolCreatedHands);
    expect(ordinary(sampled)).toEqual(ordinary(state));
    for (const card of constrained(sampled)) expect(card.poolCandidates).toContain(card.printing.kind === "card" ? card.printing.cardId : null);
  });

  it("preserves a public created character through play and ceases it on return", () => {
    const custom = createEngine(testCatalog([returning], { dreamsigns: [{ id: sign, status: "authored", abilities: () => [triggered(onDawn(), createRandomFromPool({ cardType: "character", costAtMost: 1 }))] }] }));
    const input = init("player", { player: [returning.id], enemy: [] }), started = applied(createFoldAdapter(custom).start(input));
    const card = constrained(started.slice.committed)[0];
    const played = custom.apply(started.slice.committed, "player", { kind: "play", card: card.id, from: "hand" }, answers());
    const settled = passUntil(custom, played.state, (next) => next.stack.length === 0, answers()).state;
    expect(settled.instances[card.id]).toMatchObject({ zone: "play", poolCandidates: [returning.id] });
    expect(parseEngineBattleFold(copy({ init: input, slice: { ...started.slice, committed: settled } }))).not.toBeNull();
    // A captured card's immutable intrinsic variant is base, including after public play.
    const amplified = cloneState(settled); amplified.instances[card.id] = { ...amplified.instances[card.id], variant: { amplified: true } };
    expect(parseEngineBattleFold(copy({ init: input, slice: { ...started.slice, committed: amplified } }))).toBeNull();
    const activated = custom.apply(settled, "player", { kind: "activate", source: card.id, ability: 0 }, answers());
    const returned = passUntil(custom, activated.state, (next) => next.stack.length === 0, answers());
    expect(returned.state.instances[card.id]).toBeUndefined();
    expect([...activated.events, ...returned.events]).toContainEqual({ kind: "ceasedToExist", instance: card.id, side: "player", from: "play" });
  });

  it("rejects malformed captured creation domains without mutation", () => {
    const scene = domainScene("player"), state = scene.started.slice.committed, card = constrained(state)[0];
    const saved = copy({ init: scene.input, slice: scene.started.slice });
    for (const domain of [null, [], ["bad"], [expensive.id], [cheap.id, cheap.id, cheap.id]]) for (const where of ["committed", "history"] as const) {
      const bad = copy(saved);
      if (where === "history") { const { history: _history, ...base } = bad.slice; bad.slice = { ...bad.slice, history: { base, entries: [] } }; }
      const target = where === "committed" ? bad.slice.committed : bad.slice.history!.base.committed;
      (target.instances[card.id] as unknown as Record<string, unknown>).poolCandidates = domain;
      const before = copy(bad); expect(parseEngineBattleFold(bad)).toBeNull(); expect(bad).toEqual(before);
    }
    for (const zone of ["deck", "void", "banished"] as const) for (const where of ["committed", "history"] as const) {
      const bad = copy(saved);
      if (where === "history") { const { history: _history, ...base } = bad.slice; bad.slice = { ...bad.slice, history: { base, entries: [] } }; }
      const target = where === "committed" ? bad.slice.committed : bad.slice.history!.base.committed;
      target.sides.player.hand = []; target.sides.player[zone].push(card.id); target.instances[card.id].zone = zone;
      const before = copy(bad); expect(parseEngineBattleFold(bad)).toBeNull(); expect(bad).toEqual(before);
      delete (target.instances[card.id] as { poolCandidates?: readonly unknown[] }).poolCandidates;
      expect(parseEngineBattleFold(bad)).not.toBeNull();
    }
    for (const change of [{ status: { ...card.status, created: false } }, { printing: { kind: "figment", figment: parseFigmentId(syntheticId(0x9f005)), spark: 1 } }]) {
      const bad = copy(saved); Object.assign(bad.slice.committed.instances[card.id], change);
      const before = copy(bad); expect(parseEngineBattleFold(bad)).toBeNull(); expect(bad).toEqual(before);
    }
    const missingSource = copy(saved);
    delete (missingSource.init as { draftPools?: BattleInit["draftPools"] }).draftPools;
    delete (missingSource.slice.committed as { draftPools?: BattleState["draftPools"] }).draftPools;
    expect(parseEngineBattleFold(missingSource)).toBeNull();
    const legacy = copy(saved); delete (legacy.slice.committed.instances[card.id] as { poolCandidates?: readonly unknown[] }).poolCandidates;
    expect(parseEngineBattleFold(legacy)).not.toBeNull();
    const record = { instance: card.id, owner: card.owner, printing: card.printing, variant: card.variant, status: card.status, effects: [] };
    for (const change of [{ owner: "enemy" as const }, { status: { ...card.status, created: false } },
      { printing: { kind: "card" as const, cardId: expensive.id } },
      { printing: { kind: "card" as const, cardId: card.printing.kind === "card" && card.printing.cardId === cheap.id ? otherCheap.id : cheap.id } }]) {
      const bad = copy(saved); bad.slice.committed.rememberedCards = { player: [], enemy: [{ ...record, ...change }] };
      const before = copy(bad); expect(parseEngineBattleFold(bad)).toBeNull(); expect(bad).toEqual(before);
    }
    const stale = copy(saved); stale.slice.committed.rememberedCards = { player: [], enemy: [{ ...record, status: { ...record.status, exhausted: true }, effects: [] }] };
    expect(parseEngineBattleFold(stale)).not.toBeNull();
    const legacyRecord = copy(saved); delete (legacyRecord.slice.committed.instances[card.id] as { poolCandidates?: readonly unknown[] }).poolCandidates;
    legacyRecord.slice.committed.rememberedCards = { player: [], enemy: [{ ...record, status: { ...record.status, created: false } }] };
    expect(parseEngineBattleFold(legacyRecord)).not.toBeNull();
    const visible = scene.engine.view(state, "enemy");
    for (const domains of [[{ owner: "player", candidates: [] }], [{ owner: "player", candidates: [expensive.id], member: 0 }], [{ owner: "enemy", candidates: [cheap.id, cheap.id] }], [{ owner: "player", candidates: [cheap.id], member: 999 }]]) {
      const bad = { ...visible, poolCreatedHands: { player: domains, enemy: [] } } as unknown as typeof visible, before = copy(bad);
      expect(() => scene.engine.determinize(bad, scene.input.decks, () => 0.9)).toThrow(); expect(bad).toEqual(before);
    }
  });

  it("rejects non-base intrinsic variants of captured cards and observations", () => {
    const variants: readonly Variant[] = [{ amplified: true }, { amplified: false, transfigurations: ["Inspired"] },
      { amplified: false, transfigurations: [] }, ...[0, 1].map((costReduction) => ({ amplified: false,
        deckMods: { sparkBonus: 0, costReduction, fast: false, reclaim: null, typeChange: null } }))];
    for (const side of ["player", "enemy"] as const) {
      const custom = createEngine(testCatalog([returning], { dreamsigns: [{ id: sign, status: "authored",
        abilities: () => [triggered(onDawn(), createRandomFromPool({ cardType: "character", costAtMost: 1 }))] }] }));
      const input = init(side, { player: [returning.id], enemy: [returning.id] }), started = applied(createFoldAdapter(custom).start(input));
      const state = started.slice.committed, card = constrained(state)[0], frames: BattleState[] = [state];
      const played = custom.apply(state, side, { kind: "play", card: card.id, from: "hand" }, answers(), (next) => {
        if (frames.length === 1 && next.instances[card.id]?.zone === "stack") frames.push(next);
      });
      frames.push(passUntil(custom, played.state, (next) => next.stack.length === 0, answers()).state);
      expect(frames.map((frame) => frame.instances[card.id].zone)).toEqual(["hand", "stack", "play"]);
      for (const frame of frames) for (const where of ["committed", "history"] as const) {
        // All categories cover hidden current/observed records; one representative covers public zones.
        for (const variant of frame.instances[card.id].zone === "hand" ? variants : variants.slice(0, 1)) {
          for (const observed of [false, true]) {
            const saved = copy({ init: input, slice: { ...started.slice, committed: frame } });
            if (where === "history") { const { history: _history, ...base } = saved.slice; saved.slice.history = { base, entries: [] }; }
            const target = where === "history" ? saved.slice.history!.base.committed : saved.slice.committed;
            if (observed) target.rememberedCards = { player: [], enemy: [], [opponent(side)]: [{ instance: card.id,
              owner: side, printing: card.printing, variant, status: card.status, effects: [] }] };
            else target.instances[card.id] = { ...target.instances[card.id], variant };
            const before = copy(saved); expect(parseEngineBattleFold(saved)).toBeNull(); expect(saved).toEqual(before);
          }
        }
      }
      const legacy = copy({ init: input, slice: started.slice });
      delete (legacy.slice.committed.instances[card.id] as { poolCandidates?: readonly unknown[] }).poolCandidates;
      legacy.slice.committed.instances[card.id] = { ...legacy.slice.committed.instances[card.id], variant: { amplified: true } };
      legacy.slice.committed.rememberedCards = { player: [], enemy: [], [opponent(side)]: [{ instance: card.id,
        owner: side, printing: card.printing, variant: { amplified: true }, status: { ...card.status, created: false }, effects: [] }] };
      expect(parseEngineBattleFold(legacy)).not.toBeNull();
    }
  });

  it("preserves ordinary modified copies and mutable captured-card facts", () => {
    const copier: EngineCardDefinition = { ...otherCheap, id: syntheticId(0x9f104), abilities: (variant) => [event(sequence(
      gainPoints(variant.amplified || variant.transfigurations?.length || variant.deckMods !== undefined ? 10 : 1), createCopyInHand(self())))] };
    const donor: EngineCardDefinition = { ...v.vanilla1, status: "authored", id: syntheticId(0x9f103), abilities: () => [activated([energy(0)], gainPoints(3))] };
    const collector: EngineCardDefinition = { ...returning, id: syntheticId(0x9f102), abilities: () => [activated([energy(0)],
      gainAbilities(banishCards([fromVoid({ cardType: "character" }, { player: "opponent" })])))] };
    const custom = createEngine(testCatalog([copier, donor, collector], { dreamsigns: [{ id: sign, status: "authored",
      abilities: () => [triggered(onDawn(), createRandomFromPool({ cardType: "character", costAtMost: 1 }))] }] }));
    const variants: readonly Variant[] = [{ amplified: true }, { amplified: false, transfigurations: ["Inspired"] },
      { amplified: false, deckMods: { sparkBonus: 0, costReduction: 1, fast: false, reclaim: null, typeChange: null } }];
    for (const side of ["player", "enemy"] as const) {
      for (const variant of variants) {
        const input = { ...init(side, { player: [collector.id], enemy: [collector.id] }, "day", copier),
          decks: { player: [], enemy: [], [side]: [{ cardId: copier.id, ...variant }] } };
        const started = applied(createFoldAdapter(custom).start(input)), state = started.slice.committed, source = state.sides[side].hand[0];
        expect(parseEngineBattleFold(copy({ init: input, slice: started.slice }))).not.toBeNull();
        const played = custom.apply(state, side, { kind: "play", card: source, from: "hand" }, answers());
        const done = passUntil(custom, played.state, (next) => next.stack.length === 0, answers()).state, created = done.instances[done.sides[side].hand[0]];
        expect(created).toMatchObject({ variant: state.instances[source].variant, status: { created: true } });
        expect(created.poolCandidates).toBeUndefined(); expect(done.sides[side].score).toBe(10);
        const loaded = parseEngineBattleFold(copy({ init: input, slice: { ...started.slice, committed: done } }));
        if (loaded === null) throw new Error("modified public copy rejected");
        expect(custom.determinize(custom.view(loaded.slice.committed, side), input.decks, () => 0.9).instances[created.id].variant).toEqual(created.variant);
      }
      const other = opponent(side), base = init(side, { player: [collector.id], enemy: [collector.id] });
      const input: BattleInit = { ...base, decks: { player: [], enemy: [], [other]: [{ cardId: donor.id, amplified: true }] },
        setup: { ...base.setup!, placements: [{ side: other, deckIndex: 0, zone: "void" }] } };
      const started = applied(createFoldAdapter(custom).start(input)), card = constrained(started.slice.committed)[0];
      const played = custom.apply(started.slice.committed, side, { kind: "play", card: card.id, from: "hand" }, answers());
      const settled = passUntil(custom, played.state, (next) => next.stack.length === 0, answers()).state;
      const activated = custom.apply(settled, side, { kind: "activate", source: card.id, ability: 0 }, answers());
      const done = passUntil(custom, activated.state, (next) => next.stack.length === 0, answers()).state;
      expect(done.instances[card.id]).toMatchObject({ variant: { amplified: false }, status: { exhausted: true } });
      expect(done.instances[card.id].status.gainedAbilities).toHaveLength(1); expect(done.floating).toHaveLength(1);
      const saved = copy({ init: input, slice: { ...started.slice, committed: done } });
      // This declared observation derives from an earlier genuine output; no interactive reveal is claimed.
      saved.slice.committed.rememberedCards = { player: [], enemy: [], [other]: [{ instance: card.id,
        owner: side, printing: card.printing, variant: card.variant, status: card.status, effects: [] }] };
      expect(parseEngineBattleFold(saved)).not.toBeNull();
    }
  });

});
