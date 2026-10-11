/** Side-selecting void costs use public physical cards and the existing atomic payment boundary. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, additionalCost, banishFromAnyVoidCost, banishFromVoidCost, banishXCost, choiceCost, energy, event, optionalCost, reclaim, returnCost } from "../../../dsl/builders";
import type { AbilityList, Cost } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { isLegalAnswer, legalAnswers } from "../../../prompts/answers";
import type { Answer, ChooseCardsPrompt, Prompt } from "../../../prompts/types";
import { payCosts, planCosts } from "../../../rules/costs";
import { stateHash } from "../../../state/hash";
import { SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { labBoard } from "../../../testing/lab-solver";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainPoints } from "../gain-points";
import { optional } from "../optional";
import { sequence } from "../sequence";

const deck = Array.from({ length: 4 }, () => v.vanilla1.id);
const other = (side: Side): Side => side === "player" ? "enemy" : "player";
function fixture(index: number, abilities: AbilityList, character = true): EngineCardDefinition {
  return { id: syntheticId(0x9200 + index), cardType: character ? "character" : "event", costs: [energy(0)], spark: character ? 1 : null, subtype: "Mage", speed: "standard", status: "authored", abilities };
}
const payer = (index: number, costs: readonly Cost[]) => fixture(index, () => [activated(costs, gainPoints(1))]);
const action = (source: InstanceId) => ({ kind: "activate", source, ability: 0 } as const);
class Recording implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly answers: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.answers[this.next++];
    if (value === undefined) throw new Error("missing synthetic void-payment answer");
    return value;
  }
}
const candidates = (prompt: Prompt) => new Set(prompt.kind === "chooseCards" ? prompt.candidates : []);
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected applied intent");
  return outcome.slice;
}

describe("banishFromAnyVoidCost", () => {
  it.each(SIDES.flatMap((side) => (["you", "opponent", "any"] as const).map((player) => [side, player] as const)))("%s pays from %s public void(s), preserving physical identity and owner destination", (side, player) => {
    const card = payer(0, [energy(1), banishFromAnyVoidCost(1, {}, player)]);
    const engine = createEngine(testCatalog([card]));
    const foe = other(side);
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id], void: [v.vanilla1.id, v.vanilla1.id], hand: [v.event0.id], energy: 2, deck }, [foe]: { void: [v.vanilla1.id, v.vanilla1.id], hand: [v.event0.id], deck } });
    const pool = player === "you" ? ids[side].void : player === "opponent" ? ids[foe].void : [...ids[side].void, ...ids[foe].void];
    const paid = pool[pool.length - 1];
    const owner = state.instances[paid].owner;
    const answers = new Recording([[paid]]);
    const result = engine.apply(state, side, action(ids[side].back[0]!), answers);
    expect(answers.prompts[0]).toMatchObject({ kind: "chooseCards", side, purpose: { role: "banishAnyVoidCost", cardId: card.id }, min: 1, max: 1 });
    expect(candidates(answers.prompts[0])).toEqual(new Set(pool));
    expect(result.state.instances[paid]).toMatchObject({ owner, controller: owner, zone: "banished" });
    expect(result.state.sides[owner].banished).toEqual([paid]);
    for (const ofSide of SIDES) {
      expect(result.state.sides[ofSide].void).toEqual(ids[ofSide].void.filter((id) => id !== paid));
      expect(engine.view(result.state, ofSide).instances[paid].printing).toEqual(state.instances[paid].printing);
    }
    expect(engine.view(result.state, side).instances[ids[foe].hand[0]]).toBeUndefined();
    expect(result.state.sides[side].currentEnergy).toBe(1);
    expect(result.state.sides[foe].currentEnergy).toBe(state.sides[foe].currentEnergy);
    expect(result.state.sides[side].score).toBe(1);
    expect(result.events).toContainEqual({ kind: "banished", instance: paid, side: owner });
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("filters type/subtype/cost, requires enough distinct cards, and reserves prior payments", () => {
    const mage = fixture(1, () => [], false);
    const expensive = { ...mage, id: syntheticId(0x9202), costs: [energy(3)] };
    const character = fixture(3, () => []);
    const filter = { cardType: "event" as const, subtype: "Mage" as const, costAtMost: 1 };
    const card = payer(4, [banishFromAnyVoidCost(2, filter, "any")]);
    const composed = payer(5, [banishFromAnyVoidCost(), banishFromAnyVoidCost()]);
    const engine = createEngine(testCatalog([mage, expensive, character, card, composed]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [card.id], void: [mage.id, mage.id, expensive.id, character.id], deck }, enemy: { void: [mage.id, v.event0.id], deck } });
    const paid = [ids.player.void[0], ids.enemy.void[0]];
    const answers = new Recording([paid]);
    const result = engine.apply(state, "player", action(ids.player.back[0]!), answers);
    expect(candidates(answers.prompts[0])).toEqual(new Set([ids.player.void[0], ids.player.void[1], ids.enemy.void[0]]));
    expect(answers.prompts[0]).toMatchObject({ min: 2, max: 2 });
    expect(new Set(result.events.filter((e) => e.kind === "banished").map((e) => e.instance))).toEqual(new Set(paid));
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    const short = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [card.id], void: [mage.id], deck }, enemy: { deck } });
    expect(engine.legalActions(short.state, "player")).not.toContainEqual(action(short.ids.player.back[0]!));
    const both = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [composed.id], void: [v.event0.id, v.vanilla1.id], deck }, enemy: { void: [v.vanilla2.id], deck } });
    const repeated = engine.apply(both.state, "player", action(both.ids.player.back[0]!), new ScriptedSource([[both.ids.player.void[0]]]));
    expect(new Set(repeated.state.sides.player.banished)).toEqual(new Set(both.ids.player.void));
    expect(repeated.state.sides.enemy.void).toEqual(both.ids.enemy.void);
    const one = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [composed.id], void: [v.event0.id], deck }, enemy: { deck } });
    expect(engine.legalActions(one.state, "player")).not.toContainEqual(action(one.ids.player.back[0]!));
  });

  it.each(SIDES)("%s checks alternatives, optional payments and energy before committing any void movement", (side) => {
    const card = payer(6, [choiceCost([energy(3), banishFromAnyVoidCost(1, {}, "opponent")], [energy(1), banishFromAnyVoidCost()]), optionalCost(banishFromAnyVoidCost(1, {}, "opponent"))]);
    const engine = createEngine(testCatalog([card]));
    const foe = other(side);
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id], void: [v.vanilla1.id], energy: 1, deck }, [foe]: { void: [v.vanilla2.id], deck } });
    const result = engine.apply(state, side, action(ids[side].back[0]!), new ScriptedSource([true]));
    expect(result.state.sides[side].currentEnergy).toBe(0);
    expect(result.state.sides[side].banished).toEqual(ids[side].void);
    expect(result.state.sides[foe].banished).toEqual(ids[foe].void);
    expect(result.state.sides[side].score).toBe(1);
    state.sides[side].currentEnergy = 0;
    expect(createEngine(engine.catalog).legalActions(state, side)).not.toContainEqual(action(ids[side].back[0]!));
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("excludes its own source when a Reclaim play pays from either void", () => {
    const card = fixture(7, () => [reclaim(energy(0), banishFromAnyVoidCost(1, {}, "any")), event(gainPoints(1))], false);
    const engine = createEngine(testCatalog([card]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { void: [card.id, v.event0.id], deck }, enemy: { void: [v.event0.id], deck } });
    const source = ids.player.void[0], paid = ids.enemy.void[0];
    const answers = new Recording([[paid]]);
    const result = engine.apply(state, "player", { kind: "play", card: source, from: "void" }, answers);
    expect(candidates(answers.prompts[0])).toEqual(new Set([ids.player.void[1], paid]));
    expect(result.state.sides.player.void).toEqual([ids.player.void[1]]);
    expect(result.state.sides.enemy.banished).toEqual([paid]);
    expect(result.state.sides.player.score).toBe(1);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it.each([["player", false], ["enemy", true]] as const)("%s preserves an ability's captured origin after its source returns, created=%s", (side, created) => {
    const card = payer(8, [banishFromAnyVoidCost(1, {}, "opponent"), returnCost()]);
    const engine = createEngine(testCatalog([card]));
    const foe = other(side);
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id], deck }, [foe]: { void: [v.event0.id], hand: [v.interruptEvent.id], energy: 1, deck } });
    const source = ids[side].back[0]!;
    state.instances[source].status.created = created;
    const committed = engine.apply(state, side, action(source), NO_PROMPTS);
    expect(committed.state.stack[0]).toMatchObject({ source, controller: side, origin: { kind: "card", cardId: card.id } });
    if (created) expect(committed.state.instances[source]).toBeUndefined();
    else expect(committed.state.sides[side].hand).toEqual([source]);
    const resolved = engine.apply(committed.state, foe, { kind: "pass" }, NO_PROMPTS);
    expect(resolved.state.sides[side].score).toBe(1);
    expect(resolved.state.sides[foe].banished).toEqual(ids[foe].void);
    expect(invariantViolations(resolved.state, engine.catalog)).toEqual([]);
  });

  it.each(["opponent", "any"] as const)("proves every final %s void selection without spending a synthetic search budget of 1", (player) => {
    const card = payer(12, [energy(1), banishFromAnyVoidCost(2, {}, player)]);
    const engine = createEngine(testCatalog([card]));
    const setup = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [card.id], void: player === "any" ? [v.event0.id, v.vanilla1.id] : [], energy: 2, deck }, enemy: { void: [v.event0.id, v.vanilla1.id, v.vanilla2.id, v.event0.id].slice(0, player === "any" ? 2 : 4), deck } });
    const state = { ...setup.state, config: { ...setup.state.config, feasibilitySearchRuns: 1 } };
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(engine, { log: (r) => records.push(r) });
    const opening = fold.reduce(slice(state), { kind: "battleAction", side: "player", action: action(setup.ids.player.back[0]!) });
    const opened = applied(opening);
    expect(records.filter((r) => r.event === "engine.feasibility")).toEqual([]);
    expect(opening.kind === "applied" && opening.published.some((e) => e.kind === "feasibilityBounded")).toBe(false);
    const pending = fold.pending(opened);
    const prompt = pending?.prompt as ChooseCardsPrompt;
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", purpose: { role: "banishAnyVoidCost" }, min: 2, max: 2 });
    const selections = [...legalAnswers({ ...prompt, allowed: undefined })] as InstanceId[][];
    expect(selections).toHaveLength(6);
    expect(selections.filter((selection) => !isLegalAnswer(prompt, selection))).toEqual([]);
    for (const selection of selections) {
      const paid = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending!.prompt.id, value: selection })).committed;
      for (const of of SIDES) {
        const mine = selection.filter((id) => state.instances[id].owner === of);
        expect(new Set(paid.sides[of].banished)).toEqual(new Set(mine));
        expect(paid.sides[of].banished).toHaveLength(mine.length);
        expect(paid.sides[of].void).toEqual(setup.ids[of].void.filter((id) => !selection.includes(id)));
      }
      expect(paid.sides.player.currentEnergy).toBe(1);
      expect(paid.sides.enemy.currentEnergy).toBe(state.sides.enemy.currentEnergy);
      expect(invariantViolations(paid, engine.catalog)).toEqual([]);
    }
  });

  it("reloads/cancels a suspended payment, refuses duplicate/invalid/stale/foreign/concurrent answers, and pays once", () => {
    const card = fixture(9, () => [activated([energy(1), banishFromAnyVoidCost(2, {}, "any")], sequence(gainPoints(1), optional(gainPoints(1))))]);
    const engine = createEngine(testCatalog([card]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [card.id], void: [v.event0.id, v.event0.id], energy: 2, deck }, enemy: { void: [v.event0.id], hand: [v.vanilla2.id], deck } });
    const source = ids.player.back[0]!, paid = [ids.player.void[0], ids.enemy.void[0]];
    const records: EngineLogRecord[] = [];
    const adapter = createFoldAdapter(engine, { log: (r) => records.push(r) });
    const waiting = applied(adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: action(source) }));
    const pending = adapter.pending(waiting)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", side: "player", purpose: { role: "banishAnyVoidCost" } });
    expect(waiting.committed).toEqual(state);
    const fresh = createFoldAdapter(createEngine(engine.catalog));
    const reloaded = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
    expect(fresh.pending(reloaded)).toEqual(pending);
    const before = stateHash(reloaded.committed);
    for (const intent of [
      { kind: "answer", side: "player", promptId: pending.prompt.id, value: [paid[0], paid[0]] },
      { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[0], paid[0]] },
      { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: paid },
      { kind: "battleAction", side: "enemy", action: { kind: "pass" } },
    ] as const) expect(fresh.reduce(reloaded, intent).kind).toBe("bounced");
    expect(stateHash(reloaded.committed)).toBe(before);
    const cancelled = applied(fresh.reduce(reloaded, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    expect(fresh.reduce(cancelled, { kind: "answer", side: "player", promptId: pending.prompt.id, value: paid }).kind).toBe("bounced");
    const paying = applied(adapter.reduce(waiting, { kind: "answer", side: "player", promptId: pending.prompt.id, value: paid }));
    const effect = adapter.pending(paying)!;
    expect(paying.committed.sides.player.banished).toEqual([paid[0]]);
    expect(paying.committed.sides.enemy.banished).toEqual([paid[1]]);
    expect(paying.committed.sides.player.currentEnergy).toBe(1);
    expect(adapter.reduce(paying, { kind: "cancel", side: "player", promptId: effect.prompt.id }).kind).toBe("bounced");
    expect(adapter.reduce(paying, { kind: "answer", side: "player", promptId: pending.prompt.id, value: paid }).kind).toBe("bounced");
    const restored = JSON.parse(JSON.stringify(paying)) as BattleSlice;
    const finished = applied(fresh.reduce(restored, { kind: "answer", side: "player", promptId: effect.prompt.id, value: true }));
    const inline = engine.apply(state, "player", action(source), new ScriptedSource([paid, true]));
    expect(stateHash(finished.committed)).toBe(stateHash(inline.state));
    expect(records.filter((r) => r.event === "engine.action")).toHaveLength(1);
    expect(invariantViolations(finished.committed, engine.catalog)).toEqual([]);
  });

  it("rolls back energy and both owners' banishment when the public paying step throws", () => {
    const failing: EngineCardDefinition = { ...fixture(10, () => [], false), synthetic: { play(ctx, source) {
      const plan = planCosts(ctx, "player", source, [energy(1), banishFromAnyVoidCost(2, {}, "any")], null, (role) => ({ source, cardId: syntheticId(0x920a), ability: 0, role }), [source]);
      ctx.commitPoint();
      payCosts(ctx, "player", source, plan);
      throw new Error("synthetic failure after both void payments");
    } } };
    const engine = createEngine(testCatalog([failing]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [failing.id], void: [v.event0.id, v.vanilla1.id], energy: 2, deck }, enemy: { void: [v.event0.id], deck } });
    const adapter = createFoldAdapter(engine);
    const waiting = applied(adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const pending = adapter.pending(waiting)!;
    const outcome = adapter.reduce(waiting, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.void[0], ids.enemy.void[0]] });
    if (outcome.kind !== "applied") throw new Error("expected paying-step failure");
    expect(outcome.error).not.toBeNull();
    expect(outcome.slice.committed).toEqual(state);
    expect(outcome.published.some((e) => e.kind === "energyChanged" || e.kind === "banished")).toBe(false);
    expect(outcome.slice.inFlight).toBeNull();
  });

  it("stages side-selecting costs alongside existing payer-void fixed/X costs for both sides", () => {
    const spell = fixture(11, () => [additionalCost(banishFromVoidCost(), banishXCost(), banishFromAnyVoidCost(2, { cardType: "event" }, "opponent"), optionalCost(banishFromAnyVoidCost())), event(gainPoints(1))], false);
    const engine = createEngine(testCatalog([spell]));
    for (const side of SIDES) {
      const lab = labBoard(engine, spell.id, [v.event0, v.vanilla1], side);
      const action = { kind: "play", card: lab.state.sides[side].hand[0], from: "hand" } as const;
      expect(engine.legalActions(lab.state, side)).toContainEqual(action);
      const result = engine.apply(lab.state, side, action, { answer(prompt) {
        if (prompt.kind === "chooseCards") return prompt.candidates.slice(0, prompt.min);
        if (prompt.kind === "confirm") return true;
        throw new Error("unexpected lab cost prompt");
      } });
      expect(result.state.sides[side].banished).toHaveLength(3);
      expect(result.state.sides[other(side)].banished).toHaveLength(2);
      expect(result.state.sides[side].score).toBe(1);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });
});
