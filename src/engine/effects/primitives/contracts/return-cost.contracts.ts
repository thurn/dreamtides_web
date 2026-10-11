/** Return payments use public play-time choices, ordinary zone replacements and atomic commitment. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, additionalCost, characterYouControl, choiceCost, costPaid, countersCost, energy, event, exhaustSelf, optionalCost, returnCost, target } from "../../../dsl/builders";
import type { AdditionalCost } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { Answer, Prompt } from "../../../prompts/types";
import { payCosts, planCosts } from "../../../rules/costs";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { labBoard } from "../../../testing/lab-solver";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { ifThen } from "../if-then";
import { optional } from "../optional";
import { sequence } from "../sequence";

function fixture(index: number, abilities: EngineCardDefinition["abilities"], character = true): EngineCardDefinition {
  return { id: syntheticId(0x9000 + index), cardType: character ? "character" : "event", costs: [energy(0)], spark: character ? 1 : null, subtype: character ? "Mage" : "", speed: "standard", status: "authored", abilities };
}
const payer = fixture(0, () => [activated([returnCost()], gainPoints(2))]);
const pump = fixture(1, () => [activated([energy(1), returnCost()], gainSpark(target(characterYouControl()), 1))]);
const filtered = fixture(2, () => [activated([returnCost({ subtype: "Mage", costAtMost: 2, sparkAtLeast: 1, another: true }, 2)], gainPoints(3))]);
const mage: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x9003), subtype: "Mage" };
const composed = fixture(4, () => [activated([returnCost({}, 2), returnCost()], gainPoints(3))]);
const alternatives = fixture(5, () => [activated([choiceCost([energy(2), returnCost({}, 2)], [energy(4), returnCost()]), optionalCost(returnCost())], sequence(gainPoints(1), ifThen(costPaid(), gainPoints(1))))]);
const paused = fixture(6, () => [activated([returnCost()], sequence(gainPoints(1), optional(gainPoints(1))))]);
const failing = {
  ...fixture(8, () => [], false),
  synthetic: { play(ctx, source) {
    const plan = planCosts(ctx, "player", source, [energy(1), returnCost({}, 2)], null, (role) => ({ source, cardId: syntheticId(0x9008), ability: 0, role }), [source]);
    ctx.commitPoint();
    payCosts(ctx, "player", source, plan);
    throw new Error("synthetic failure after two return payments");
  } },
} satisfies EngineCardDefinition;
const engine = createEngine(testCatalog([payer, pump, filtered, mage, composed, alternatives, paused, failing]));
const deck = Array.from({ length: 4 }, () => v.vanilla1.id);
const board = (card = payer.id, extra: readonly typeof payer.id[] = []) => boardState(engine.catalog, { active: "player", phase: "day", player: { back: [card, ...extra], deck, energy: 5 }, enemy: { deck } });
const action = (source: InstanceId) => ({ kind: "activate", source, ability: 0 } as const);
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected applied intent");
  return outcome.slice;
}
class Recording implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly answers: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.answers[this.next++];
    if (value === undefined) throw new Error("missing scripted return-cost answer");
    return value;
  }
}

describe("returnCost", () => {
  it.each(["player", "enemy"] as const)("%s chooses controlled front/back/self characters, never cards in other zones or opposing characters", (side) => {
    const other: Side = side === "player" ? "enemy" : "player";
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { front: [v.vanilla1.id], back: [payer.id, v.vanilla2.id], hand: [v.vanilla3.id], void: [v.vanilla1.id], deck }, [other]: { back: [v.vanilla2.id], deck } });
    const source = ids[side].back[0]!, paid = ids[side].front[0]!;
    const answers = new Recording([[paid]]);
    const result = engine.apply(state, side, action(source), answers);
    expect(answers.prompts).toHaveLength(1);
    expect(answers.prompts[0]).toMatchObject({ kind: "chooseCards", side, purpose: { role: "returnCost" }, min: 1, max: 1 });
    expect(new Set(answers.prompts[0].kind === "chooseCards" ? answers.prompts[0].candidates : [])).toEqual(new Set([source, ids[side].back[1], paid]));
    expect(result.state.sides[side].hand).toEqual([...ids[side].hand, paid]);
    expect(result.events).toContainEqual({ kind: "returnedToHand", instance: paid, side });
    expect(result.state.sides[side].score).toBe(2);
    expect(result.state.sides[side].void).toEqual(ids[side].void);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    const self = engine.apply(state, side, action(source), new ScriptedSource([[source]]));
    expect(self.state.instances[source].zone).toBe("hand");
    expect(self.state.sides[side].score).toBe(2);
  });

  it("uses selector bounds and distinct cards across composed costs, alternatives and optional costs", () => {
    const f = board(filtered.id, [mage.id, mage.id, mage.id, v.vanilla3.id]);
    const candidates = new Recording([[f.ids.player.back[1]!, f.ids.player.back[2]!]]);
    expect(engine.apply(f.state, "player", action(f.ids.player.back[0]!), candidates).state.sides.player.score).toBe(3);
    expect(candidates.prompts[0]).toMatchObject({ kind: "chooseCards", min: 2, max: 2 });
    expect(new Set(candidates.prompts[0].kind === "chooseCards" ? candidates.prompts[0].candidates : [])).toEqual(new Set(f.ids.player.back.slice(1, 4)));
    expect(engine.legalActions(board(filtered.id, [mage.id]).state, "player").some((a) => a.kind === "activate")).toBe(false);
    const short = board(composed.id, [v.vanilla1.id]);
    expect(engine.legalActions(short.state, "player").some((a) => a.kind === "activate")).toBe(false);
    const enough = board(composed.id, [v.vanilla1.id, v.vanilla2.id]);
    const result = engine.apply(enough.state, "player", action(enough.ids.player.back[0]!), new ScriptedSource([[enough.ids.player.back[1]!, enough.ids.player.back[2]!]]));
    expect(result.state.sides.player.hand).toHaveLength(3);
    expect(result.events.filter((e) => e.kind === "returnedToHand")).toHaveLength(3);
    const a = board(alternatives.id, [v.vanilla1.id, v.vanilla2.id]);
    a.state.sides.player.currentEnergy = 2;
    const choices = new Recording([[a.ids.player.back[1]!, a.ids.player.back[2]!], true]);
    const optionalPaid = engine.apply(a.state, "player", action(a.ids.player.back[0]!), choices);
    expect(optionalPaid.state.sides.player.score).toBe(2);
    expect(optionalPaid.state.sides.player.currentEnergy).toBe(0);
    expect(optionalPaid.state.sides.player.hand).toHaveLength(3);
  });

  it("selects effect targets before payment, reserves them, and preserves the source origin through self-return", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [pump.id, v.vanilla2.id], energy: 1, deck }, enemy: { hand: [v.interruptEvent.id], energy: 1, deck } });
    const source = ids.player.back[0]!, targetId = ids.player.back[1]!;
    const answers = new Recording([[targetId]]);
    const committed = engine.apply(state, "player", action(source), answers);
    expect(answers.prompts.map((p) => p.purpose.role)).toEqual(["target"]);
    expect(committed.state.sides.player.hand).toEqual([source]);
    expect(committed.state.sides.player.currentEnergy).toBe(0);
    expect(committed.state.stack[0]).toMatchObject({ kind: "ability", source, origin: { kind: "card", cardId: pump.id }, controller: "player", choices: { targets: [[targetId]] } });
    expect(committed.events.findIndex((e) => e.kind === "returnedToHand")).toBeLessThan(committed.events.findIndex((e) => e.kind === "abilityActivated"));
    const resolved = engine.apply(committed.state, "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(resolved.state.instances[targetId].status.gainedSpark).toBe(1);
    expect(resolved.events.filter((e) => e.kind === "returnedToHand")).toEqual([]);
    const alone = board(pump.id);
    expect(engine.legalActions(alone.state, "player").some((a) => a.kind === "activate")).toBe(false);
    state.sides.player.currentEnergy = 0;
    expect(createEngine(engine.catalog).legalActions(state, "player").some((a) => a.kind === "activate")).toBe(false);
  });

  it.each([exhaustSelf(), countersCost(1)])("preserves later source payments %j, while an earlier payment may precede self-return", (resource) => {
      const later = fixture(10, () => [activated([returnCost(), resource], gainPoints(1))]);
      const earlier = fixture(11, () => [activated([resource, returnCost()], gainPoints(1))]);
      const local = createEngine(testCatalog([later, earlier]));
      const only = boardState(local.catalog, { active: "player", phase: "day", player: { back: [later.id], deck }, enemy: { deck } });
      only.state.instances[only.ids.player.back[0]!].status.counters = 1;
      expect(local.legalActions(only.state, "player").some((a) => a.kind === "activate")).toBe(false);
      const enough = boardState(local.catalog, { active: "player", phase: "day", player: { back: [later.id, v.vanilla1.id, v.vanilla2.id], deck }, enemy: { deck } });
      const source = enough.ids.player.back[0]!;
      enough.state.instances[source].status.counters = 1;
      const answers = new Recording([[enough.ids.player.back[1]!]]);
      const paid = local.apply(enough.state, "player", action(source), answers);
      expect(answers.prompts[0]).toMatchObject({ kind: "chooseCards", purpose: { role: "returnCost" } });
      expect(new Set(answers.prompts[0].kind === "chooseCards" ? answers.prompts[0].candidates : [])).toEqual(new Set(enough.ids.player.back.slice(1)));
      expect(paid.state.sides.player.score).toBe(1);
      expect(invariantViolations(paid.state, local.catalog)).toEqual([]);
      const ordered = boardState(local.catalog, { active: "player", phase: "day", player: { back: [earlier.id], deck }, enemy: { deck } });
      const self = ordered.ids.player.back[0]!;
      ordered.state.instances[self].status.counters = 1;
      const returned = local.apply(ordered.state, "player", action(self), NO_PROMPTS);
      expect(returned.state.sides.player.hand).toEqual([self]);
      expect(returned.state.sides.player.score).toBe(1);
      expect(invariantViolations(returned.state, local.catalog)).toEqual([]);
  });

  it("handles source ordering inside alternatives and optional costs, and zero-counter payment after created-source departure", () => {
    const nested = fixture(12, () => [activated([choiceCost([returnCost(), exhaustSelf()], [returnCost()])], gainPoints(1))]);
    const optionalBefore = fixture(13, () => [activated([optionalCost(returnCost(), exhaustSelf())], gainPoints(1))]);
    const optionalAfter = fixture(14, () => [activated([returnCost(), optionalCost(exhaustSelf())], gainPoints(1))]);
    const zero = fixture(15, () => [activated([returnCost(), countersCost(0)], gainPoints(1))]);
    const local = createEngine(testCatalog([nested, optionalBefore, optionalAfter, zero]));
    for (const definition of [nested, optionalBefore, optionalAfter]) {
      const { state, ids } = boardState(local.catalog, { active: "player", phase: "day", player: { back: [definition.id], deck }, enemy: { deck } });
      const source = ids.player.back[0]!;
      const result = local.apply(state, "player", action(source), NO_PROMPTS);
      expect(result.state.sides.player.score).toBe(1);
      expect(result.state.instances[source].zone).toBe(definition === optionalBefore ? "play" : "hand");
      expect(invariantViolations(result.state, local.catalog)).toEqual([]);
    }
    for (const created of [false, true]) {
      const { state, ids } = boardState(local.catalog, { active: "player", phase: "day", player: { back: [zero.id], deck }, enemy: { deck } });
      const source = ids.player.back[0]!;
      state.instances[source].status.created = created;
      expect(local.legalActions(state, "player").some((a) => a.kind === "activate")).toBe(true);
      const result = local.apply(state, "player", action(source), NO_PROMPTS);
      expect(result.state.sides.player.score).toBe(1);
      expect(result.state.sides.player.hand).toEqual(created ? [] : [source]);
      expect(result.events.some((e) => e.kind === "countersChanged")).toBe(false);
      expect(invariantViolations(result.state, local.catalog)).toEqual([]);
    }
  });

  it("returns an opponent-owned controlled character to its owner's hand while the payer keeps the effect", () => {
    const { state, ids } = board(payer.id, [v.vanilla2.id]);
    const source = ids.player.back[0]!, stolen = ids.player.back[1]!;
    state.instances[stolen] = { ...state.instances[stolen], owner: "enemy" };
    const result = engine.apply(state, "player", action(source), new ScriptedSource([[stolen]]));
    expect(result.state.sides.enemy.hand).toEqual([stolen]);
    expect(result.state.sides.player.hand).toEqual([]);
    expect(result.state.instances[stolen]).toMatchObject({ owner: "enemy", controller: "enemy", zone: "hand" });
    expect(result.state.sides.player.score).toBe(2);
    expect(result.events).toContainEqual({ kind: "returnedToHand", side: "enemy", instance: stolen });
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it.each(["created", "reclaimed"] as const)("a %s source can pay its return; its departure replacement pays once and its captured ability resolves", (replacement) => {
    const { state, ids } = board();
    const source = ids.player.back[0]!;
    state.instances[source].status[replacement] = true;
    const result = engine.apply(state, "player", action(source), NO_PROMPTS);
    expect(result.state.sides.player.score).toBe(2);
    expect(result.state.sides.player.hand).toEqual([]);
    expect(result.events.filter((e) => e.kind === "returnedToHand")).toEqual([]);
    if (replacement === "created") {
      expect(result.state.instances[source]).toBeUndefined();
      expect(result.events.filter((e) => e.kind === "ceasedToExist")).toHaveLength(1);
    } else {
      expect(result.state.sides.player.banished).toEqual([source]);
      expect(result.events.filter((e) => e.kind === "banished")).toHaveLength(1);
    }
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("a suspended payment reloads identically, cancels atomically, and rejects invalid/stale/foreign/concurrent answers", () => {
    const { state, ids } = board(paused.id, [v.vanilla1.id]);
    const source = ids.player.back[0]!, paid = ids.player.back[1]!;
    const records: EngineLogRecord[] = [];
    const adapter = createFoldAdapter(engine, { log: (r) => records.push(r) });
    const suspended = applied(adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: action(source) }));
    const pending = adapter.pending(suspended)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", cancellable: true, purpose: { role: "returnCost" } });
    expect(suspended.committed).toEqual(state);
    const fresh = createFoldAdapter(createEngine(engine.catalog));
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    expect(fresh.pending(reloaded)).toEqual(pending);
    const before = stateHash(reloaded.committed);
    for (const intent of [
      { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [paid] },
      { kind: "answer", side: "player", promptId: pending.prompt.id, value: [] },
      { kind: "answer", side: "player", promptId: pending.prompt.id, value: [paid, paid] },
      { kind: "battleAction", side: "enemy", action: { kind: "pass" } },
    ] as const) expect(fresh.reduce(reloaded, intent).kind).toBe("bounced");
    expect(stateHash(reloaded.committed)).toBe(before);
    const cancelled = applied(fresh.reduce(reloaded, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    expect(fresh.reduce(cancelled, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [paid] }).kind).toBe("bounced");
    const paidSlice = applied(adapter.reduce(suspended, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [paid] }));
    const effect = adapter.pending(paidSlice)!;
    expect(effect.prompt).toMatchObject({ kind: "confirm", cancellable: false });
    expect(paidSlice.committed.sides.player.hand).toEqual([paid]);
    expect(adapter.reduce(paidSlice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [source] }).kind).toBe("bounced");
    expect(adapter.reduce(paidSlice, { kind: "cancel", side: "player", promptId: effect.prompt.id }).kind).toBe("bounced");
    const restored = JSON.parse(JSON.stringify(paidSlice)) as BattleSlice;
    const finished = applied(fresh.reduce(restored, { kind: "answer", side: "player", promptId: effect.prompt.id, value: true }));
    const inline = engine.apply(state, "player", action(source), new ScriptedSource([[paid], true]));
    expect(stateHash(finished.committed)).toBe(stateHash(inline.state));
    expect(finished.committed.sides.player.hand).toEqual([paid]);
    expect(finished.committed.sides.player.score).toBe(2);
    expect(records.filter((r) => r.event === "engine.action")).toHaveLength(1);
  });

  it("rolls back all earlier return and energy writes when the paying step throws, publishing no partial movement", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [failing.id], back: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck, energy: 3 }, enemy: { deck } });
    const adapter = createFoldAdapter(engine);
    const suspended = applied(adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const pending = adapter.pending(suspended)!;
    const outcome = adapter.reduce(suspended, { kind: "answer", side: "player", promptId: pending.prompt.id, value: ids.player.back.slice(0, 2).filter((id): id is InstanceId => id !== null) });
    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("expected failed step record");
    expect(outcome.error).not.toBeNull();
    expect(outcome.slice.committed).toEqual(state);
    expect(outcome.published.some((e) => e.kind === "returnedToHand" || e.kind === "energyChanged")).toBe(false);
    expect(outcome.slice.inFlight).toBeNull();
  });

  it("the public lab stages distinct matching return resources for composed, alternative and optional payments on both sides", () => {
    const costs: readonly AdditionalCost[] = [returnCost({ subtype: "Mage" }, 2), choiceCost([returnCost()], [returnCost({}, 2)]), optionalCost(returnCost())];
    const spell = fixture(9, () => [additionalCost(...costs), event(gainPoints(1))], false);
    const catalog = testCatalog([spell, mage]);
    const labEngine = createEngine(catalog);
    for (const side of ["player", "enemy"] as const) {
      const lab = labBoard(labEngine, spell.id, [mage, v.vanilla1], side);
      const card = lab.state.sides[side].hand[0];
      expect(labEngine.legalActions(lab.state, side)).toContainEqual({ kind: "play", card, from: "hand" });
      for (const mode of [0, 1]) {
        const result = labEngine.apply(lab.state, side, { kind: "play", card, from: "hand" }, {
          answer(prompt) {
            if (prompt.kind === "chooseMode") return mode;
            if (prompt.kind === "confirm") return true;
            if (prompt.kind === "chooseCards") return prompt.candidates.slice(0, prompt.min);
            throw new Error("unexpected return payment prompt");
          },
        });
        expect(result.state.sides[side].score).toBe(1);
        expect(result.events.filter((e) => e.kind === "returnedToHand")).toHaveLength(mode === 0 ? 4 : 5);
        expect(result.state.sides[side].hand).toHaveLength(mode === 0 ? 4 : 5);
        expect(invariantViolations(result.state, catalog)).toEqual([]);
      }
    }
  });
});
