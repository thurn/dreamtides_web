/** Resolving numeric X shares the source binding used by selector bounds (rules § A character's X). */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCostCapture, activated, discardCostFilter, energy, energyX, enemyCharacter, event, everyIn, self, target, x } from "../../../dsl/builders";
import type { Cost } from "../../../dsl/types";
import { onDissolved, onMaterialized, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import type { Effect } from "../../registry";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { materialize } from "../materialize";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";

const deck = [v.vanilla1.id, v.vanilla2.id];
const bounded = () => sequence(gainPoints(x()), dissolve(target(enemyCharacter({ sparkAtMost: x() }))));
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private index = 0;
  constructor(private readonly values: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const answer = this.values[this.index++];
    if (answer === undefined) throw new Error(`missing ${prompt.purpose.role}`);
    return answer;
  }
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`failed intent ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
function fixture(side: Side, effect: Effect = bounded(), options: { costs?: readonly Cost[]; trigger?: boolean; departureTrigger?: boolean; interrupt?: boolean; placed?: boolean } = {}) {
  const card: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x76501), costs: [energyX(0)], subtype: "Mage", status: "authored", abilities: () => options.trigger
    ? [triggered(onMaterialized(), effect)]
    : [activated(options.costs ?? [energy(1)], effect, { speed: options.interrupt ? "interrupt" : "standard" }), ...(options.departureTrigger ? [triggered(onDissolved(), gainPoints(x()))] : [])] };
  const engine = createEngine(testCatalog([card]));
  const other = opponent(side);
  const { state: initial, ids } = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { hand: options.placed ? [v.vanilla1.id, v.vanilla1.id] : [card.id, v.vanilla1.id, v.vanilla1.id], back: [v.vanilla0.id, v.vanilla2.id, ...(options.placed ? [card.id] : [])], energy: 10, deck },
    [other]: { back: [v.vanilla0.id, v.vanilla2.id, v.vanilla5.id], hand: [v.interruptEvent.id], energy: 3, deck },
  });
  const state = { ...initial, config: { ...initial.config, autoAnswerForcedPrompts: false } };
  const source = options.placed ? ids[side].back[2]! : ids[side].hand[0];
  const action = { kind: "activate", source, ability: 0 } as const;
  return { engine, card, state, ids, source, side, other, action };
}
function playSource(f: ReturnType<typeof fixture>, values: readonly Answer[] = [3]): BattleState {
  return f.engine.apply(f.state, f.side, { kind: "play", card: f.source, from: "hand" }, new ScriptedSource(values)).state;
}
function settle(f: ReturnType<typeof fixture>, state: BattleState, source: AnswerSource = NO_PROMPTS) {
  return passUntil(f.engine, state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
}
function inPlay(f: ReturnType<typeof fixture>): BattleState {
  const state = settle(f, playSource(f)).state;
  expect(state.instances[f.source]).toMatchObject({ zone: "play", status: { x: 3 } });
  expect(state.sides[f.side].currentEnergy).toBe(7);
  return state;
}
function clean(f: ReturnType<typeof fixture>, state: BattleState): void {
  expect(invariantViolations(state, f.engine.catalog)).toEqual([]);
}

for (const side of SIDES) describe(`stored source X values as ${side}`, () => {
  it("reads actual played X in a fixed-cost activation and its selector bounds", () => {
    const f = fixture(side);
    const state = inPlay(f);
    const answers = new Answers([[f.ids[f.other].back[1]!]]);
    const paid = f.engine.apply(state, side, f.action, answers);
    expect(answers.prompts).toHaveLength(1);
    expect(answers.prompts[0]).toMatchObject({ candidates: f.ids[f.other].back.slice(0, 2), purpose: { role: "target" } });
    expect(paid.state.stack[0]).toMatchObject({ kind: "ability", x: null });
    expect(paid.state.sides[side].currentEnergy).toBe(6);
    const result = settle(f, paid.state);
    expect(result.state.sides[side].score).toBe(3);
    expect(result.state.instances[f.ids[f.other].back[1]!].zone).toBe("void");
    expect(result.state.instances[f.ids[f.other].back[2]!].zone).toBe("play");
    expect(result.state.instances[f.source].status.x).toBe(3);
    clean(f, result.state);
  });

  it("reads retained played X in a materialized trigger and replays its target prompt", () => {
    const f = fixture(side, bounded(), { trigger: true });
    const stack = playSource(f);
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(stack), { kind: "battleAction", side: f.other, action: { kind: "pass" } }));
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
    const prompt = cold.pending(saved)!.prompt;
    expect(prompt).toEqual(fold.pending(opened)!.prompt);
    expect(prompt).toMatchObject({ candidates: f.ids[f.other].back.slice(0, 2) });
    expect(saved.committed.sides[side].score).toBe(0);
    const targetId = f.ids[f.other].back[1]!;
    const done = applied(cold.reduce(saved, { kind: "answer", side, promptId: prompt.id, value: [targetId] }));
    const direct = f.engine.apply(stack, f.other, { kind: "pass" }, new ScriptedSource([[targetId]]));
    expect(stateHash(done.committed)).toBe(stateHash(direct.state));
    expect(done.committed.sides[side].score).toBe(3);
    expect(done.committed.instances[targetId].zone).toBe("void");
    clean(f, done.committed);
  });

  for (const binding of ["energy", "count", "captured"] as const) it.each([0, 2])(`${binding} X=%i overrides stored played X`, chosen => {
    const cost = binding === "energy" ? energyX(0) : binding === "count" ? discardCostFilter({}, { count: "x", min: 0 }) : abandonCostCapture();
    const f = fixture(side, sequence(gainPoints(x()), gainPoints(1)), { costs: [cost] });
    const state = inPlay(f);
    const values = binding === "energy" ? [chosen] : binding === "count" ? [state.sides[side].hand.slice(0, chosen)] : [[f.ids[side].back[chosen === 0 ? 0 : 1]!]];
    const paid = f.engine.apply(state, side, f.action, new ScriptedSource(values));
    expect(paid.state.stack[0]?.x).toBe(chosen);
    expect(paid.state.instances[f.source].status.x).toBe(3);
    const loaded = deserializeState(serializeState(paid.state));
    const result = settle(f, loaded);
    expect(result.state.sides[side].score).toBe(chosen + 1);
    expect(stateHash(result.state)).toBe(stateHash(settle(f, paid.state).state));
    clean(f, result.state);
  });

  it.each([0, 2])("preserves a normally played event's explicit X=%i", chosen => {
    const card: EngineCardDefinition = { ...v.event0, id: syntheticId(0x76503), costs: [energyX(0)], status: "authored", abilities: () => [event(sequence(gainPoints(x()), gainPoints(1)))] };
    const engine = createEngine(testCatalog([card]));
    const other = opponent(side);
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [card.id], energy: 3, deck }, [other]: { hand: [v.interruptEvent.id], energy: 3, deck } });
    const paid = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, new ScriptedSource([chosen]));
    expect(paid.state.stack[0]?.x).toBe(chosen);
    const done = passUntil(engine, paid.state, next => next.stack.length === 0);
    expect(done.state.sides[side].score).toBe(chosen + 1);
    expect(done.state.sides[side].currentEnergy).toBe(3 - chosen);
  });

  it("reads zero when its trigger source materializes without being played", () => {
    const f = fixture(side, sequence(gainPoints(x()), gainPoints(1)), { trigger: true });
    const spell: EngineCardDefinition = { ...v.event0, id: syntheticId(0x76504), status: "authored", abilities: () => [event(materialize(everyIn("void", { subtype: "Mage" })))] };
    const engine = createEngine(testCatalog([f.card, spell]));
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [spell.id], void: [f.card.id], energy: 3, deck }, [f.other]: { hand: [v.interruptEvent.id], energy: 3, deck } });
    const paid = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const done = passUntil(engine, paid.state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
    expect(done.state.instances[ids[side].void[0]]).toMatchObject({ zone: "play", status: { x: null } });
    expect(done.state.sides[side].score).toBe(1);
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });

  it("defaults an unplayed source to zero without an activation binding", () => {
    const f = fixture(side, sequence(gainPoints(x()), gainPoints(1)), { placed: true });
    const paid = f.engine.apply(f.state, side, f.action, NO_PROMPTS);
    expect(paid.state.stack[0]?.x).toBeNull();
    const result = settle(f, paid.state);
    expect(result.state.sides[side].score).toBe(1);
    clean(f, result.state);
  });

  for (const reenter of [false, true]) it(`reads current X at each numeric instruction after departure, reentry=${String(reenter)}`, () => {
    const movement = reenter ? [returnToHand(self()), materialize(everyIn("hand", { subtype: "Mage" }))] : [dissolve(self())];
    const f = fixture(side, sequence(gainPoints(x()), ...movement, gainPoints(x())), { departureTrigger: !reenter });
    const state = inPlay(f);
    const paid = f.engine.apply(state, side, f.action, NO_PROMPTS);
    const result = settle(f, paid.state);
    expect(result.state.sides[side].score).toBe(3);
    expect(result.state.instances[f.source].zone).toBe(reenter ? "play" : "void");
    expect(result.state.instances[f.source].status.x).toBeNull();
    if (!reenter) expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: f.source }));
    clean(f, result.state);
  });

  it("reads stored X in an actual Interrupt activation in the opponent response window", () => {
    const f = fixture(side, gainPoints(x()), { interrupt: true });
    const state = inPlay(f);
    const opening = f.engine.apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, NO_PROMPTS);
    // A response interrupt is legal while the opponent holds stack priority.
    const response = f.engine.apply(opening.state, f.other, { kind: "play", card: f.ids[f.other].hand[0], from: "hand" }, NO_PROMPTS);
    expect(f.engine.legalActions(response.state, side)).toContainEqual(f.action);
    const result = f.engine.apply(response.state, side, f.action, NO_PROMPTS);
    expect(result.state.sides[side].score).toBe(3);
    expect(result.state.stack.some(item => item.kind === "card")).toBe(true);
    clean(f, result.state);
  });
});

describe("stored source X values recovery", () => {
  it("reloads fixed activation targets, rejects invalid/stale/concurrent answers and cancels without payment", () => {
    const f = fixture("player");
    const state = inPlay(f);
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(state), { kind: "battleAction", side: "player", action: f.action }));
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
    const prompt = cold.pending(saved)!.prompt;
    expect(cold.pending(saved)).toEqual(fold.pending(opened));
    expect(saved.committed).toEqual(state);
    expect(cold.reduce(saved, { kind: "battleAction", side: "player", action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(cold.reduce(saved, { kind: "answer", side: "enemy", promptId: prompt.id, value: [f.ids.enemy.back[1]!] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "answer", side: "player", promptId: prompt.id, value: [f.ids.enemy.back[2]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const cancelled = applied(cold.reduce(saved, { kind: "cancel", side: "player", promptId: prompt.id }));
    expect(cancelled.committed).toEqual(state);
    const reopened = applied(cold.reduce(cancelled, { kind: "battleAction", side: "player", action: f.action }));
    expect(cold.reduce(reopened, { kind: "answer", side: "player", promptId: prompt.id, value: [f.ids.enemy.back[1]!] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const paid = applied(cold.reduce(saved, { kind: "answer", side: "player", promptId: prompt.id, value: [f.ids.enemy.back[1]!] }));
    expect(paid.committed.sides.player.currentEnergy).toBe(6);
    const resolved = settle(f, paid.committed);
    const inline = f.engine.apply(state, "player", f.action, new ScriptedSource([[f.ids.enemy.back[1]!]]));
    expect(stateHash(resolved.state)).toBe(stateHash(settle(f, inline.state).state));
    expect(resolved.state.sides.player.score).toBe(3);
    clean(f, resolved.state);
  });

  it("rolls back an injected resolving error after a stack-source numeric read", () => {
    let attemptedScore: number | null = null;
    const failed: EngineCardDefinition = { ...v.event0, id: syntheticId(0x76502), costs: [energyX(0)], status: "authored", abilities: () => [], synthetic: { resolve(ctx, item) {
      // Existing synthetic hook probes sourceX on the stack with an absent binding.
      resolveEffect(ctx, gainPoints(x()), { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), controller: item.controller, ability: 0, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
      attemptedScore = ctx.state.sides.player.score;
      throw new Error("injected resolving failure");
    } } };
    const engine = createEngine(testCatalog([failed]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [failed.id], energy: 5, deck }, enemy: { hand: [v.interruptEvent.id], energy: 3, deck } });
    const paid = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([3]));
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const outcome = fold.reduce(slice(paid.state), { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("missing injected failure");
    expect(attemptedScore).toBe(3);
    expect(outcome.published.some(entry => entry.kind === "pointsScored")).toBe(false);
    expect(outcome.slice.committed.sides.player.score).toBe(0);
    expect(outcome.slice.committed.sides.player.currentEnergy).toBe(2);
    expect(outcome.slice.committed.stack).toEqual(paid.state.stack);
    expect(paid.state.sides.player.score).toBe(0);
  });
});
