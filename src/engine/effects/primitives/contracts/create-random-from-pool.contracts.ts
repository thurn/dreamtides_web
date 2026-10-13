/** Fixed pool provenance, private creation, replay and sampling through public engine/fold APIs. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { energy, energyX, event, x } from "../../../dsl/builders";
import { onDawn, triggered } from "../../../dsl/triggers";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type IntentOutcome } from "../../../fold/slice";
import { firstLegalAnswer } from "../../../prompts/answers";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { cloneState } from "../../../state/clone";
import { serializeState, deserializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, type Side } from "../../../state/ids";
import type { BattleInit, BattleState } from "../../../state/types";
import { InlineSource } from "../../../steps/sources";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { testDreamsignId } from "../../../../types/test-identities";
import { resolveEffect } from "../../interpreter";
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
});
