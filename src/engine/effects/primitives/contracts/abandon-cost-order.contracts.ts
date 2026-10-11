/** Source-dependent costs are paid in order before a source departs through abandonment. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, activated, characterYouControl, choiceCost, countersCost, energy, exhaustSelf, optionalCost, target } from "../../../dsl/builders";
import type { Cost } from "../../../dsl/types";
import type { Effect } from "../../registry";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { Answer, Prompt } from "../../../prompts/types";
import { payCosts, planCosts } from "../../../rules/costs";
import { stateHash } from "../../../state/hash";
import { SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { optional } from "../optional";
import { sequence } from "../sequence";

const deck = Array.from({ length: 4 }, () => v.vanilla1.id);
const resources = [exhaustSelf(), countersCost(1)];
const matrix = SIDES.flatMap((side) => resources.map((resource) => [side, resource] as const));
function fixture(index: number, costs: readonly Cost[], effect: Effect = gainPoints(1)): EngineCardDefinition {
  return { id: syntheticId(0x39400 + index), cardType: "character", costs: [energy(0)], spark: 1, subtype: "Mage", speed: "standard", status: "authored", abilities: () => [activated(costs, effect)] };
}
function setup(engine: ReturnType<typeof createEngine>, side: Side, card: EngineCardDefinition, companions: readonly typeof card.id[] = []) {
  const other: Side = side === "player" ? "enemy" : "player";
  const result = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id, ...companions], deck, energy: 3 }, [other]: { deck } });
  result.state.instances[result.ids[side].back[0]!].status.counters = 1;
  return result;
}
const action = (source: InstanceId) => ({ kind: "activate", source, ability: 0 } as const);
class Recording implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly value: Answer) {}
  answer(prompt: Prompt): Answer { this.prompts.push(prompt); return this.value; }
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected applied intent");
  return outcome.slice;
}

describe("abandon cost source ordering", () => {
  it.each(matrix)("%s excludes self-abandon before a later source payment %j, while other matching characters remain payable", (side, resource) => {
    const card = fixture(0, [abandonCost(), resource]);
    const engine = createEngine(testCatalog([card]));
    const alone = setup(engine, side, card);
    const source = alone.ids[side].back[0]!;
    expect(engine.legalActions(alone.state, side)).not.toContainEqual(action(source));
    const board = setup(engine, side, card, [v.vanilla1.id, v.vanilla2.id]);
    const paid = board.ids[side].back[1]!;
    const answers = new Recording([paid]);
    const result = engine.apply(board.state, side, action(board.ids[side].back[0]!), answers);
    expect(answers.prompts[0]).toMatchObject({ kind: "chooseCards", side, purpose: { role: "abandonCost" } });
    expect(new Set(answers.prompts[0].kind === "chooseCards" ? answers.prompts[0].candidates : [])).toEqual(new Set(board.ids[side].back.slice(1)));
    expect(result.state.instances[board.ids[side].back[0]!].zone).toBe("play");
    expect(result.state.instances[paid].zone).toBe("void");
    expect(result.state.sides[side].score).toBe(1);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it.each(matrix)("%s may pay a source payment %j first and then abandon that source", (side, resource) => {
    const card = fixture(1, [resource, abandonCost()]);
    const engine = createEngine(testCatalog([card]));
    const { state, ids } = setup(engine, side, card);
    const source = ids[side].back[0]!;
    expect(engine.legalActions(state, side)).toContainEqual(action(source));
    const result = engine.apply(state, side, action(source), NO_PROMPTS);
    expect(result.state.sides[side].void).toEqual([source]);
    expect(result.state.instances[source].status).toMatchObject({ counters: 0, exhausted: false });
    expect(result.state.sides[side].score).toBe(1);
    const resourceEvent = result.events.findIndex((e) => e.kind === (resource.cost === "exhaustSelf" ? "exhaustionChanged" : "countersChanged"));
    expect(resourceEvent).toBeGreaterThanOrEqual(0);
    expect(result.events.findIndex((e) => e.kind === "leftPlay")).toBeGreaterThan(resourceEvent);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it.each(matrix)("%s checks source availability within alternatives and optional payments containing %j", (side, resource) => {
    const alternative = fixture(2, [choiceCost([abandonCost(), resource])]);
    const optionalBefore = fixture(3, [optionalCost(abandonCost(), resource)]);
    const optionalAfter = fixture(4, [abandonCost(), optionalCost(resource)]);
    const validNested = fixture(5, [choiceCost([abandonCost(), resource])]);
    const engine = createEngine(testCatalog([alternative, optionalBefore, optionalAfter, validNested]));
    const impossible = setup(engine, side, alternative);
    expect(engine.legalActions(impossible.state, side)).not.toContainEqual(action(impossible.ids[side].back[0]!));
    for (const card of [optionalBefore, optionalAfter]) {
      const { state, ids } = setup(engine, side, card);
      const source = ids[side].back[0]!;
      const result = engine.apply(state, side, action(source), new ScriptedSource([true]));
      expect(result.state.instances[source].zone).toBe(card === optionalBefore ? "play" : "void");
      expect(result.state.instances[source].status.exhausted).toBe(false);
      expect(result.state.sides[side].score).toBe(1);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
    const valid = setup(engine, side, validNested, [v.vanilla1.id, v.vanilla2.id]);
    const answers = new Recording([valid.ids[side].back[1]!]);
    const result = engine.apply(valid.state, side, action(valid.ids[side].back[0]!), answers);
    expect(new Set(answers.prompts[0].kind === "chooseCards" ? answers.prompts[0].candidates : [])).toEqual(new Set(valid.ids[side].back.slice(1)));
    expect(result.state.sides[side].score).toBe(1);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    for (const card of [optionalBefore, optionalAfter]) {
      const board = setup(engine, side, card, [v.vanilla1.id, v.vanilla2.id]);
      const paid = board.ids[side].back[1]!;
      const paidOptional = engine.apply(board.state, side, action(board.ids[side].back[0]!), {
        answer(prompt) {
          if (prompt.kind === "confirm") return true;
          if (prompt.kind === "chooseCards") return [paid];
          throw new Error("unexpected optional abandonment prompt");
        },
      });
      expect(paidOptional.state.instances[board.ids[side].back[0]!].zone).toBe("play");
      expect(paidOptional.state.instances[paid].zone).toBe("void");
      expect(paidOptional.state.instances[board.ids[side].back[0]!].status).toMatchObject(resource.cost === "exhaustSelf" ? { exhausted: true } : { counters: 0 });
      expect(paidOptional.state.sides[side].score).toBe(1);
      expect(invariantViolations(paidOptional.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("%s pays zero counters after abandonment including created and reclaimed replacements", (side) => {
    const card = fixture(6, [abandonCost(), countersCost(0)]);
    const engine = createEngine(testCatalog([card]));
    for (const replacement of [null, "created", "reclaimed"] as const) {
      const { state, ids } = setup(engine, side, card);
      const source = ids[side].back[0]!;
      if (replacement !== null) state.instances[source].status[replacement] = true;
      const result = engine.apply(state, side, action(source), NO_PROMPTS);
      expect(result.state.sides[side].score).toBe(1);
      expect(result.events.filter((e) => e.kind === "countersChanged")).toEqual([]);
      if (replacement === "created") expect(result.state.instances[source]).toBeUndefined();
      else expect(result.state.instances[source].zone).toBe(replacement === "reclaimed" ? "banished" : "void");
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(["created", "reclaimed"] as const)("a %s self-abandoned source retains its captured ability origin/controller for either side", (replacement) => {
    const card = fixture(7, [exhaustSelf(), abandonCost()], gainSpark(target(characterYouControl({ another: true })), 1));
    const engine = createEngine(testCatalog([card]));
    for (const side of SIDES) {
      const other: Side = side === "player" ? "enemy" : "player";
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id, v.vanilla1.id], deck }, [other]: { hand: [v.interruptEvent.id], energy: 1, deck } });
      const source = ids[side].back[0]!, targetId = ids[side].back[1]!;
      state.instances[source].status[replacement] = true;
      const committed = engine.apply(state, side, action(source), NO_PROMPTS);
      expect(committed.state.stack[0]).toMatchObject({ kind: "ability", source, controller: side, origin: { kind: "card", cardId: card.id }, choices: { targets: [[targetId]] } });
      if (replacement === "created") expect(committed.state.instances[source]).toBeUndefined();
      else expect(committed.state.instances[source].zone).toBe("banished");
      const resolved = engine.apply(committed.state, other, { kind: "pass" }, NO_PROMPTS);
      expect(resolved.state.instances[targetId].status.gainedSpark).toBe(1);
      expect(invariantViolations(resolved.state, engine.catalog)).toEqual([]);
    }
  });

  it("reloads suspended choices, cancels before payment, rejects stale/foreign answers and commits each abandonment/counter payment once", () => {
    const card = fixture(8, [abandonCost(), countersCost(1)], sequence(gainPoints(1), optional(gainPoints(1))));
    const engine = createEngine(testCatalog([card]));
    const { state, ids } = setup(engine, "player", card, [v.vanilla1.id, v.vanilla2.id]);
    const source = ids.player.back[0]!, paid = ids.player.back[1]!;
    const records: EngineLogRecord[] = [];
    const adapter = createFoldAdapter(engine, { log: (record) => records.push(record) });
    const waiting = applied(adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: action(source) }));
    const pending = adapter.pending(waiting)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", purpose: { role: "abandonCost" } });
    expect(waiting.committed).toEqual(state);
    const fresh = createFoldAdapter(createEngine(engine.catalog));
    const restored = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
    expect(fresh.pending(restored)).toEqual(pending);
    expect(fresh.reduce(restored, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [source] }).kind).toBe("bounced");
    expect(fresh.reduce(restored, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [paid] }).kind).toBe("bounced");
    const cancelled = applied(fresh.reduce(restored, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    expect(fresh.reduce(cancelled, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [paid] }).kind).toBe("bounced");
    const paidSlice = applied(adapter.reduce(waiting, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [paid] }));
    const effect = adapter.pending(paidSlice)!;
    expect(paidSlice.committed.sides.player.void).toEqual([paid]);
    expect(paidSlice.committed.instances[source].status.counters).toBe(0);
    expect(adapter.reduce(paidSlice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.back[2]!] }).kind).toBe("bounced");
    const reloadedEffect = JSON.parse(JSON.stringify(paidSlice)) as BattleSlice;
    const finished = applied(fresh.reduce(reloadedEffect, { kind: "answer", side: "player", promptId: effect.prompt.id, value: true }));
    const inline = engine.apply(state, "player", action(source), new ScriptedSource([[paid], true]));
    expect(stateHash(finished.committed)).toBe(stateHash(inline.state));
    expect(finished.committed.sides.player.score).toBe(2);
    expect(finished.committed.sides.player.void).toEqual([paid]);
    expect(records.filter((record) => record.event === "engine.action")).toHaveLength(1);
    expect(invariantViolations(finished.committed, engine.catalog)).toEqual([]);
  });

  it("rolls back earlier abandonment/energy writes when a public paying step fails", () => {
    const failing: EngineCardDefinition = {
      ...fixture(9, []), cardType: "event", spark: null,
      synthetic: { play(ctx, source) {
        const plan = planCosts(ctx, "player", source, [energy(1), abandonCost({}, 2)], null, (role) => ({ source, cardId: syntheticId(0x39409), ability: 0, role }), [source]);
        ctx.commitPoint();
        payCosts(ctx, "player", source, plan);
        throw new Error("synthetic failure after abandon payment");
      } },
    };
    const engine = createEngine(testCatalog([failing]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [failing.id], back: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], energy: 3, deck }, enemy: { deck } });
    const adapter = createFoldAdapter(engine);
    const waiting = applied(adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const pending = adapter.pending(waiting)!;
    const outcome = adapter.reduce(waiting, { kind: "answer", side: "player", promptId: pending.prompt.id, value: ids.player.back.slice(0, 2).filter((id): id is InstanceId => id !== null) });
    if (outcome.kind !== "applied") throw new Error("expected paying-step failure");
    expect(outcome.error).not.toBeNull();
    expect(outcome.slice.committed).toEqual(state);
    expect(outcome.published.some((event) => event.kind === "energyChanged" || event.kind === "leftPlay")).toBe(false);
    expect(outcome.slice.inFlight).toBeNull();
  });
});
