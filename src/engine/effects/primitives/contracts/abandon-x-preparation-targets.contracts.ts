/** Mandatory count preparation, prospective selector eligibility and the nested authoring boundary. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonXCost, activated, additionalCost, choiceCost, energy, energyX, enemyCharacter, event, keyword, optionalCost, target, x } from "../../../dsl/builders";
import type { AdditionalCost, CharacterSelector } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { isLegalAnswer } from "../../../prompts/answers";
import type { Answer, Prompt } from "../../../prompts/types";
import { chooseX, payCosts, planCosts } from "../../../rules/costs";
import { opponent, type Side } from "../../../state/ids";
import { ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, placeFigment } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { dissolve } from "../dissolve";

const exactTarget = target(enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() }));
const deck = [v.vanilla1.id, v.vanilla1.id];
function fixture(side: Side, options: { offering?: boolean; priced?: boolean; min?: number; selector?: Omit<CharacterSelector, "controller">; stored?: number; nested?: "choice" | "optional" } = {}) {
  const count = abandonXCost({ min: options.min ?? 1, selector: { figment: true, ...options.selector } });
  const costs: readonly AdditionalCost[] = options.nested === undefined ? [energy(1), count] : JSON.parse(JSON.stringify([
    energy(1), options.nested === "choice" ? { cost: "choice", options: [[count], [energy(2)]] } : { cost: "optional", costs: [count] },
  ])) as AdditionalCost[];
  const definition: EngineCardDefinition = options.offering ? {
    ...v.event1, id: syntheticId(0x54400), status: "authored", costs: [energy(3), ...(options.priced ? [energyX(0)] : [])],
    abilities: () => [keyword("offering"), additionalCost(...costs.slice(1)), event(dissolve(exactTarget))],
  } : {
    ...v.vanilla2, id: syntheticId(0x54401), status: "authored",
    abilities: () => [activated(costs, dissolve(exactTarget))],
  };
  const engine = createEngine(testCatalog([definition]));
  const other = opponent(side);
  const { state: placed, ids } = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { ...(options.offering ? { hand: [definition.id, v.event0.id] } : { back: [definition.id] }), energy: 6, deck },
    [other]: { back: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id], hand: [v.interruptEvent.id], energy: 3, deck },
  });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const source = options.offering ? ids[side].hand[0] : ids[side].back[0]!;
  state.instances[source].status.x = options.stored ?? 0;
  const figments = [0, 1].map(index => placeFigment(state, side, { rank: "front", index }, { kind: "figmentCopy", cardId: v.vanilla2.id, spark: null }));
  const foreign = placeFigment(state, other, { rank: "front", index: 0 }, { kind: "figmentCopy", cardId: v.vanilla2.id, spark: null });
  const action = options.offering ? { kind: "play", card: source, from: "hand" } as const : { kind: "activate", source, ability: 0 } as const;
  return { engine, state, ids, source, side, other, figments, foreign, action };
}
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly values: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    const answer = this.values[this.prompts.length];
    this.prompts.push(prompt);
    if (answer === undefined) throw new Error(`Missing answer for ${prompt.purpose.role}`);
    return answer;
  }
}
const slice = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

for (const side of ["player", "enemy"] as const) describe(`abandon-X preparation as ${side}`, () => {
  it.each([0, 1])("prepares Offering route %i before targets and resolves the paid count without an energy-X debit", route => {
    const f = fixture(side, { offering: true });
    const targetId = f.ids[f.other].back[2]!;
    const answers = new Answers([route, 2, [targetId], ...(route === 1 ? [[f.ids[side].hand[1]]] : []), f.figments]);
    const paid = f.engine.apply(f.state, side, f.action, answers);
    expect(answers.prompts.map(prompt => prompt.purpose.role)).toEqual(["playRoute", "chooseX", "target", ...(route === 1 ? ["offeringCost"] : []), "abandonCost"]);
    expect(answers.prompts.find(prompt => prompt.purpose.role === "target")).toMatchObject({ candidates: [targetId, f.foreign] });
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(paid.state.sides[side].currentEnergy).toBe(route === 1 ? 6 : 3);
    expect(paid.events.filter(event => event.kind === "abandoned")).toHaveLength(2);
    const resolved = f.engine.apply(paid.state, f.other, { kind: "pass" }, new ScriptedSource([]));
    expect(resolved.state.instances[targetId].zone).toBe("void");
    expect(resolved.events.some(event => event.kind === "noLegalTarget")).toBe(false);
    expect(invariantViolations(resolved.state, f.engine.catalog)).toEqual([]);
  });

  it("fixes printed energy-X Offering at zero and withholds an incompatible positive abandonment minimum", () => {
    const f = fixture(side, { offering: true, priced: true, min: 0 });
    const answers = new Answers([1, [f.ids[f.other].back[0]!], [f.ids[side].hand[1]], []]);
    const paid = f.engine.apply(f.state, side, f.action, answers);
    expect(answers.prompts.some(prompt => prompt.purpose.role === "chooseX")).toBe(false);
    expect(paid.state.stack[0]?.x).toBe(0);
    expect(paid.state.sides[side].currentEnergy).toBe(6);
    expect(paid.events.some(event => event.kind === "abandoned")).toBe(false);
    const resolved = f.engine.apply(paid.state, f.other, { kind: "pass" }, new ScriptedSource([]));
    expect(resolved.state.instances[f.ids[f.other].back[0]!].zone).toBe("void");
    const positive = fixture(side, { offering: true, priced: true });
    const choices = new Answers([0, 2, [positive.ids[positive.other].back[2]!], positive.figments]);
    positive.engine.apply(positive.state, side, positive.action, choices);
    expect(choices.prompts[0]).toMatchObject({ kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: false }] });
  });

  it.each([0, 2, 9])("evaluates spark, cost and alternative payment bounds at prospective X with stored X=%i", stored => {
    for (const selector of [
      { sparkAtLeast: x(), sparkAtMost: x() },
      { costAtLeast: x(), costAtMost: x() },
      { anyOf: [{ sparkAtLeast: x(), sparkAtMost: x() }, { costAtLeast: 8 }] },
    ]) {
      const f = fixture(side, { selector, stored, min: 0 });
      expect(f.engine.legalActions(f.state, side)).toContainEqual(f.action);
      const answers = new Answers([2, [f.ids[f.other].back[2]!], f.figments]);
      const paid = f.engine.apply(f.state, side, f.action, answers);
      expect(answers.prompts.map(prompt => prompt.purpose.role)).toEqual(["chooseX", "target", "abandonCost"]);
      expect(isLegalAnswer(answers.prompts[0], 0)).toBe(true);
      expect(isLegalAnswer(answers.prompts[0], 1)).toBe(false);
      expect(isLegalAnswer(answers.prompts[0], 2)).toBe(true);
      expect(paid.state.stack[0]?.x).toBe(2);
      expect(paid.state.instances[f.source].status.x).toBe(stored);
      expect(paid.state.sides[side].currentEnergy).toBe(5);
      const resolved = f.engine.apply(paid.state, f.other, { kind: "pass" }, new ScriptedSource([]));
      expect(resolved.state.instances[f.ids[f.other].back[2]!].zone).toBe("void");
    }
  });

  it.each(["choice", "optional"] as const)("rejects directly authored nested %s before route, X, target or payment choices", nested => {
    for (const offering of [false, true]) {
      const f = fixture(side, { nested, offering });
      const before = JSON.stringify(f.state);
      expect(f.engine.legalActions(f.state, side)).not.toContainEqual(f.action);
      const adapter = createFoldAdapter(f.engine);
      const current = slice(f.state);
      expect(adapter.reduce(current, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "illegalAction" });
      expect(adapter.pending(current)).toBeNull();
      expect(JSON.stringify(f.state)).toBe(before);
    }
  });

  it("reloads each Offering choice, rejects invalid/stale/concurrent answers and cancels without payment", () => {
    const f = fixture(side, { offering: true });
    const adapter = createFoldAdapter(f.engine, { checkEventPrefix: true });
    let current = applied(adapter.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
    const routePrompt = adapter.pending(current)!.prompt;
    current = applied(adapter.reduce(current, { kind: "answer", side, promptId: routePrompt.id, value: 1 }));
    const xPrompt = adapter.pending(current)!.prompt;
    expect(adapter.reduce(current, { kind: "answer", side, promptId: xPrompt.id, value: 3 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(adapter.reduce(current, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    for (const value of [2, [f.ids[f.other].back[2]!], [f.ids[side].hand[1]]] as const) {
      current = JSON.parse(JSON.stringify(current)) as BattleSlice;
      const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
      const pending = cold.pending(current)!;
      expect(current.committed).toEqual(f.state);
      expect(cold.reduce(current, { kind: "answer", side: f.other, promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      current = applied(cold.reduce(current, { kind: "answer", side, promptId: pending.prompt.id, value }));
    }
    const pending = adapter.pending(current)!;
    expect(adapter.reduce(current, { kind: "answer", side, promptId: routePrompt.id, value: 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(adapter.reduce(current, { kind: "answer", side, promptId: pending.prompt.id, value: [f.foreign] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const cancelled = applied(adapter.reduce(current, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(f.state);
    const completed = applied(adapter.reduce(current, { kind: "answer", side, promptId: pending.prompt.id, value: f.figments }));
    const inline = f.engine.apply(f.state, side, f.action, new ScriptedSource([1, 2, [f.ids[f.other].back[2]!], [f.ids[side].hand[1]], f.figments]));
    expect(completed.committed).toEqual(inline.state);
    expect(completed.committed.stack[0]?.x).toBe(2);
  });
});

describe("abandon-X typed authoring and payment atomicity", () => {
  it("keeps mandatory placement typed separately from alternative and optional payment lists", () => {
    // @ts-expect-error A count-X abandon is a mandatory top-level cost.
    const alternative = choiceCost([abandonXCost()]);
    // @ts-expect-error A count-X abandon is a mandatory top-level cost.
    const optional = optionalCost(abandonXCost());
    expect(alternative.cost).toBe("choice");
    expect(optional.cost).toBe("optional");
    expect(activated([abandonXCost()], dissolve(exactTarget)).costs).toHaveLength(1);
    expect(additionalCost(abandonXCost()).costs).toHaveLength(1);
  });

  it("rolls back partial energy and abandonment writes after an error following prospective-X payment", () => {
    const failing: EngineCardDefinition = { ...v.event0, id: syntheticId(0x54402), status: "authored", synthetic: { play(ctx, source) {
      const costs = [energy(1), abandonXCost({ min: 1, selector: { figment: true, sparkAtLeast: x(), sparkAtMost: x() } })];
      const purpose = { source, cardId: syntheticId(0x54402), ability: 0, role: "chooseX" as const };
      const prepared = chooseX(ctx, "player", costs, purpose);
      const plan = planCosts(ctx, "player", source, costs, prepared, role => ({ ...purpose, role }), [source], undefined, { selectorX: prepared ?? 0 });
      ctx.commitPoint();
      payCosts(ctx, "player", source, plan);
      throw new Error("synthetic error after prospective count payment");
    } } };
    const engine = createEngine(testCatalog([failing]));
    const { state: placed, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [failing.id], energy: 3, deck }, enemy: { deck } });
    const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
    const figments = [0, 1].map(index => placeFigment(state, "player", { rank: "front", index }, { kind: "figmentCopy", cardId: v.vanilla2.id, spark: null }));
    const adapter = createFoldAdapter(engine);
    let current = applied(adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    current = applied(adapter.reduce(current, { kind: "answer", side: "player", promptId: adapter.pending(current)!.prompt.id, value: 2 }));
    const result = adapter.reduce(current, { kind: "answer", side: "player", promptId: adapter.pending(current)!.prompt.id, value: figments });
    if (result.kind !== "applied") throw new Error("Expected recovered payment failure");
    expect(result.error).not.toBeNull();
    expect(result.slice.committed).toEqual(state);
    expect(result.published.some(event => event.kind === "energyChanged" || event.kind === "abandoned")).toBe(false);
  });
});
