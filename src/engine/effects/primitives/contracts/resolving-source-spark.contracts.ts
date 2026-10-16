/** Public resolving predicate/condition contracts for rules § Spark → This character's ✦. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonSelfCost, activated, controls, energy, energyX, enemyCharacter, event, everyIn, self, stackItem } from "../../../dsl/builders";
import { thisCharacterSpark } from "../../../dsl/values";
import type { ResolvingEffect } from "../../registry";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { conditionHolds, resolveEffect } from "../../interpreter";
import { abandon } from "../abandon";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { ifThen } from "../if-then";
import { materialize } from "../materialize";
import { prevent } from "../prevent";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";

const bound = { sparkAtMost: thisCharacterSpark() };
const deck = [v.vanilla1.id, v.vanilla2.id];
const instance = (id: InstanceId | null): InstanceId => {
  if (id === null) throw new Error("missing fixture instance");
  return id;
};
const initial = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`failed intent ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
function saved(slice: BattleSlice): BattleSlice {
  return { ...(JSON.parse(JSON.stringify(slice)) as BattleSlice), committed: deserializeState(serializeState(slice.committed)) };
}
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly values: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const answer = this.values[this.next++];
    if (answer === undefined) throw new Error(`missing ${prompt.kind} answer`);
    return answer;
  }
  exhausted(): void { expect(this.next).toBe(this.values.length); }
}
function readers(count: number): ResolvingEffect {
  return sequence(ifThen({ ...controls(enemyCharacter(bound), count), atMost: count }, gainPoints(1)), abandon("you", { ...bound, another: true }));
}
function fixture(side: Side, effect: ResolvingEffect, departedCost = false, chosenX: number | null = null, interrupt = false) {
  const sourceCard: EngineCardDefinition = {
    ...v.vanilla2, spark: departedCost ? "x" : 2, id: syntheticId(0x7500), subtype: "Mage", status: "authored",
    abilities: () => [activated([chosenX === null ? energy(1) : energyX(0), ...(departedCost ? [abandonSelfCost()] : [])], effect,
      { speed: interrupt ? "interrupt" : "standard" })],
  };
  const spell: EngineCardDefinition = { ...v.event1, id: syntheticId(0x7501), status: "authored", abilities: () => [event(gainPoints(1))] };
  const E = createEngine(testCatalog([sourceCard, spell]));
  const other = opponent(side);
  const { state: placed, ids } = boardState(E.catalog, { active: interrupt ? other : side, phase: "day",
    [side]: { back: [sourceCard.id, v.vanilla2.id, v.vanilla5.id, v.vanilla8.id], deck, energy: 5 },
    [other]: { back: [v.vanilla2.id, v.vanilla5.id, v.vanilla8.id], hand: [interrupt ? spell.id : v.interruptEvent.id], deck, energy: 5 },
  });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const source = instance(ids[side].back[0]);
  // A distinct stored X proves source-spark predicates do not read that binding.
  state.instances[source].status.x = 3;
  return { E, state, ids, source, side, other, action: { kind: "activate", source, ability: 0 } as const, played: ids[other].hand[0] };
}
function assertClean(state: BattleState, E: ReturnType<typeof createEngine>): void {
  expect(invariantViolations(state, E.catalog)).toEqual([]);
}

describe("resolving source spark", () => {
  for (const side of SIDES) for (const departure of ["live", "mid-step", "reentry"] as const) {
    it(`${side} controls and abandon read ${departure} spark at the exact read`, () => {
      const movement = departure === "mid-step" ? [dissolve(self())]
        : departure === "reentry" ? [returnToHand(self()), materialize(everyIn("hand", { subtype: "Mage" }))] : [];
      const f = fixture(side, sequence(gainSpark(self(), 3, "whileSourceInPlay"), ...movement, readers(departure === "reentry" ? 1 : 2)));
      const selected = instance(f.ids[side].back[departure === "reentry" ? 1 : 2]);
      const answers = new Answers([[selected]]);
      const cast = f.E.apply(f.state, side, f.action, NO_PROMPTS);
      const resolved = f.E.apply(cast.state, f.other, { kind: "pass" }, answers);
      answers.exhausted();
      expect(answers.prompts).toEqual([expect.objectContaining({ kind: "chooseCards", side, candidates: f.ids[side].back.slice(1, departure === "reentry" ? 2 : 3) })]);
      expect(resolved.state.sides[side].score).toBe(1);
      expect(resolved.state.instances[selected].zone).toBe("void");
      expect(resolved.state.instances[instance(f.ids[side].back[3])].zone).toBe("play");
      expect(resolved.state.instances[f.source].zone).toBe(departure === "mid-step" ? "void" : "play");
      expect(effectiveSpark(resolved.state, f.E.catalog, f.source)).toBe(departure === "live" ? 5 : 2);
      if (departure !== "live") expect(resolved.events).toContainEqual({ kind: "leftPlay", instance: f.source, side, to: departure === "mid-step" ? "void" : "hand", spark: 5 });
      assertClean(resolved.state, f.E);
    });
  }

  for (const side of SIDES) it(`${side} retained departure spark survives a stack reload`, () => {
    const f = fixture(side, readers(2), true);
    f.state.instances[f.source].status.x = 5;
    const cast = f.E.apply(f.state, side, f.action, new ScriptedSource([[f.source]]));
    expect(cast.state.instances[f.source].zone).toBe("void");
    expect(effectiveSpark(cast.state, f.E.catalog, f.source)).toBe(0);
    const loaded = deserializeState(serializeState(cast.state));
    const selected = instance(f.ids[side].back[2]);
    const answers = new Answers([[selected]]);
    const resolved = f.E.apply(loaded, f.other, { kind: "pass" }, answers);
    answers.exhausted();
    expect(answers.prompts[0]).toMatchObject({ candidates: f.ids[side].back.slice(1, 3) });
    expect(resolved.state.sides[side].score).toBe(1);
    expect(resolved.state.instances[selected].zone).toBe("void");
    const direct = f.E.apply(cast.state, f.other, { kind: "pass" }, new ScriptedSource([[selected]]));
    expect(stateHash(resolved.state)).toBe(stateHash(direct.state));
    assertClean(resolved.state, f.E);
  });

  for (const side of SIDES) for (const chosen of [0, 2, null] as const) it(`${side} Interrupt unless-abandons reads live spark with X ${String(chosen)}`, () => {
    const f = fixture(side, sequence(gainSpark(self(), 3), prevent(stackItem({ controller: "opponent" }), { unlessAbandons: bound })), false, chosen, true);
    const waiting = f.E.apply(f.state, f.other, { kind: "play", card: f.played, from: "hand" }, NO_PROMPTS);
    const selected = instance(f.ids[f.other].back[1]);
    const answers = new Answers([...(chosen === null ? [] : [chosen]), [f.played], true, [selected]]);
    const result = f.E.apply(waiting.state, side, f.action, answers);
    answers.exhausted();
    expect(answers.prompts[answers.prompts.length - 1]).toMatchObject({ kind: "chooseCards", side: f.other, candidates: f.ids[f.other].back.slice(0, 2) });
    expect(result.state.instances[selected].zone).toBe("void");
    expect(result.state.instances[instance(f.ids[f.other].back[2])].zone).toBe("play");
    expect(result.state.sides[side].currentEnergy).toBe(5 - (chosen ?? 1));
    expect(result.state.stack).toContainEqual(expect.objectContaining({ kind: "card", instance: f.played }));
    expect(result.events.filter(e => e.kind === "abandoned")).toEqual([{ kind: "abandoned", instance: selected, side: f.other }]);
    expect(result.events.some(e => e.kind === "prevented")).toBe(false);
    assertClean(result.state, f.E);
  });

  for (const side of SIDES) it(`${side} Interrupt unless-abandons uses its departed source's retained spark`, () => {
    const f = fixture(side, prevent(stackItem({ controller: "opponent" }), { unlessAbandons: bound }), true, 2, true);
    f.state.instances[f.source].status.x = 5;
    const waiting = f.E.apply(f.state, f.other, { kind: "play", card: f.played, from: "hand" }, NO_PROMPTS);
    const selected = instance(f.ids[f.other].back[1]);
    const answers = new Answers([2, [f.played], [f.source], true, [selected]]);
    const result = f.E.apply(waiting.state, side, f.action, answers);
    answers.exhausted();
    expect(answers.prompts[answers.prompts.length - 1]).toMatchObject({ candidates: f.ids[f.other].back.slice(0, 2) });
    expect(result.state.instances[f.source].zone).toBe("void");
    expect(effectiveSpark(result.state, f.E.catalog, f.source)).toBe(0);
    expect(result.state.instances[selected].zone).toBe("void");
    expect(result.events.some(e => e.kind === "prevented")).toBe(false);
    assertClean(result.state, f.E);
  });

  for (const side of SIDES) it(`${side} reloads source-bound Interrupt choices, rejects stale/foreign/concurrent input and pays once`, () => {
    const f = fixture(side, sequence(gainSpark(self(), 3), prevent(stackItem({ controller: "opponent" }), { unlessAbandons: bound })), false, 2, true);
    const waiting = f.E.apply(f.state, f.other, { kind: "play", card: f.played, from: "hand" }, NO_PROMPTS);
    const fold = createFoldAdapter(f.E, { checkEventPrefix: true });
    const opening = applied(fold.reduce(initial(waiting.state), { kind: "battleAction", side, action: f.action }));
    const numeric = fold.pending(opening)?.prompt;
    if (numeric?.kind !== "chooseNumber") throw new Error("missing X choice");
    const cancelled = applied(fold.reduce(opening, { kind: "cancel", side, promptId: numeric.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(waiting.state));
    expect(fold.pending(cancelled)).toBeNull();
    const answer = (slice: BattleSlice, value: Answer): BattleSlice => {
      const prompt = fold.pending(slice)?.prompt;
      if (prompt === undefined) throw new Error("missing choice");
      return applied(fold.reduce(slice, { kind: "answer", side: prompt.side, promptId: prompt.id, value }));
    };
    const targeting = answer(opening, 2);
    expect(fold.pending(targeting)?.prompt.kind).toBe("chooseTargets");
    const confirming = saved(answer(targeting, [f.played]));
    const fresh = createFoldAdapter(f.E, { checkEventPrefix: true });
    const confirm = fresh.pending(confirming)?.prompt;
    if (confirm?.kind !== "confirm") throw new Error("missing unless choice");
    expect(confirm).toEqual(fold.pending(confirming)?.prompt);
    expect(confirming.committed.sides[side].currentEnergy).toBe(3);
    expect(fresh.reduce(confirming, { kind: "answer", side, promptId: confirm.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(confirming, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(confirming, { kind: "cancel", side: f.other, promptId: confirm.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const choosing = saved(applied(fresh.reduce(confirming, { kind: "answer", side: f.other, promptId: confirm.id, value: true })));
    const prompt = fresh.pending(choosing)?.prompt;
    if (prompt?.kind !== "chooseCards") throw new Error("missing abandonment choice");
    expect(prompt.candidates).toEqual(f.ids[f.other].back.slice(0, 2));
    expect(createFoldAdapter(f.E).pending(choosing)).toEqual(fresh.pending(choosing));
    expect(choosing.committed).toEqual(confirming.committed);
    const selected = instance(f.ids[f.other].back[1]);
    for (const value of [[instance(f.ids[f.other].back[2])], [f.source], [], true]) {
      expect(fresh.reduce(choosing, { kind: "answer", side: f.other, promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(choosing, { kind: "answer", side: f.other, promptId: confirm.id, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce({ ...choosing, attempt: choosing.attempt + 1 }, { kind: "answer", side: f.other, promptId: prompt.id, value: [selected] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const intent = { kind: "answer" as const, side: f.other, promptId: prompt.id, value: [selected] };
    const outcome = fresh.reduce(choosing, intent);
    const done = applied(outcome);
    expect(done.committed.sides[side].currentEnergy).toBe(3);
    expect(done.committed.instances[selected].zone).toBe("void");
    if (outcome.kind !== "applied") throw new Error("answer bounced");
    expect(outcome.published.filter(e => e.kind === "abandoned")).toEqual([{ kind: "abandoned", instance: selected, side: f.other }]);
    const inline = f.E.apply(waiting.state, side, f.action, new ScriptedSource([2, [f.played], true, [selected]]));
    expect(stateHash(done.committed)).toBe(stateHash(inline.state));
    expect(fresh.reduce(done, intent).kind).toBe("bounced");
    assertClean(done.committed, f.E);
  });

  it("rolls back a later synthetic error after a source-bound abandon succeeds", () => {
    // This hook injects an error after a real resolving primitive. It models rollback,
    // not a valid authored card or an additional engine transition.
    const failing: EngineCardDefinition = { ...v.event0, id: syntheticId(0x7502), costs: [energy(1)], abilities: () => [], synthetic: {
      resolve(ctx, item) {
        resolveEffect(ctx, abandon("opponent", bound), { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
          controller: item.controller, ability: 0, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
        throw new Error("synthetic error after source-bound abandonment");
      },
    } };
    const E = createEngine(testCatalog([failing]));
    const { state: placed, ids } = boardState(E.catalog, { active: "player", phase: "day", player: { hand: [failing.id], energy: 5, deck }, enemy: { back: [v.vanilla0.id, v.vanilla2.id], deck } });
    const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opening = applied(fold.reduce(initial(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const prompt = fold.pending(opening)?.prompt;
    if (prompt?.kind !== "chooseCards") throw new Error("missing successful source-bound choice");
    expect(prompt.candidates).toEqual([ids.enemy.back[0]]);
    const selected = instance(ids.enemy.back[0]);
    const outcome = fold.reduce(opening, { kind: "answer", side: "enemy", promptId: prompt.id, value: [selected] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("missing intended later error");
    expect(outcome.error.message).toContain("synthetic error after source-bound abandonment");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed).toEqual(opening.committed);
    expect(outcome.slice.committed.sides.player.currentEnergy).toBe(4);
    expect(outcome.slice.committed.instances[selected].zone).toBe("play");
    expect(fold.pending(outcome.slice)).toBeNull();
  });

  it("keeps source-spark controls unavailable to non-resolving scopes", () => {
    const f = fixture("player", gainPoints(1));
    expect(() => conditionHolds(f.state, f.E.catalog, controls(enemyCharacter(bound), 1), { controller: "player", source: f.source, optionalPaid: [] })).toThrow("A static ability cannot read this character's ✦");
  });
});
