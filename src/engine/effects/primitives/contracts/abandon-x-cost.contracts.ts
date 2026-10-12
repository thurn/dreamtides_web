/** Count-X cost preparation, payment and persisted choice contracts on synthetic definitions. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, abandonXCost, activated, additionalCost, energy, energyX, enemyCharacter, event, target, x } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { greedyAnswer } from "../../../policy/prompts";
import { isLegalAnswer } from "../../../prompts/answers";
import type { Answer, Prompt } from "../../../prompts/types";
import { chooseX, payCosts, planCosts } from "../../../rules/costs";
import { stateHash } from "../../../state/hash";
import { opponent, type Side } from "../../../state/ids";
import { ReplayDivergence } from "../../../steps/errors";
import { runStep } from "../../../steps/runner";
import { ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, placeFigment } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";

const exact = enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() });
const copy = { kind: "figmentCopy", cardId: v.vanilla1.id, spark: null } as const;
const deck = [v.vanilla1.id, v.vanilla1.id];
function fixture(side: Side, options: { min?: number; priced?: boolean; overlap?: boolean; interrupt?: boolean; effectTargets?: boolean; rawController?: "opponent" | "any" } = {}) {
  const card: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x51200), status: "authored", abilities: () => [activated([
    energy(1), ...(options.priced ? [energyX(0)] : []), options.rawController === undefined ? abandonXCost({ min: options.min, selector: { figment: true } }) : { cost: "abandon", count: "x", min: options.min ?? 1, selector: { controller: options.rawController, figment: true } },
    ...(options.overlap ? [abandonCost({ figment: true })] : []),
  ], options.effectTargets === false ? gainPoints(x()) : dissolve(target(exact)), { speed: options.interrupt ? "interrupt" : "standard" })] };
  const engine = createEngine(testCatalog([card]));
  const other = opponent(side);
  const { state: placed, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id, v.vanilla1.id], energy: 5, deck }, [other]: { back: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], hand: [v.interruptEvent.id], energy: 3, deck } });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const source = ids[side].back[0]!;
  state.instances[source].status.x = 3;
  const figments = [0, 1].map(index => placeFigment(state, side, { rank: "front", index }, copy));
  placeFigment(state, other, { rank: "front", index: 0 }, copy);
  const action = { kind: "activate", source, ability: 0 } as const;
  return { engine, state, ids, side, other, source, figments, action };
}
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private index = 0;
  constructor(private readonly values: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.values[this.index++];
    if (value === undefined) throw new Error(`Missing ${prompt.purpose.role}`);
    return value;
  }
}
const slice = (state: BattleSlice["committed"]): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected applied intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

for (const side of ["player", "enemy"] as const) describe(`abandonXCost as ${side}`, () => {
  it.each([0, 1, 2])("chooses X=%i before exact-X targets, abandons that count and pays only fixed energy", count => {
    const f = fixture(side);
    const targetId = f.ids[f.other].back[count]!;
    const answers = new Answers([count, [targetId], f.figments.slice(0, count)]);
    const paid = f.engine.apply(f.state, side, f.action, answers);
    expect(answers.prompts.map(prompt => prompt.purpose.role)).toEqual(["chooseX", "target", "abandonCost"]);
    expect(answers.prompts[0]).toMatchObject({ min: 0, max: 2 });
    expect(answers.prompts[1]).toMatchObject({ candidates: count === 1 ? [targetId, f.state.sides[f.other].frontRank[0]] : [targetId] });
    expect(answers.prompts[2]).toMatchObject({ candidates: f.figments, min: count, max: count });
    expect(paid.state.stack[0]?.x).toBe(count);
    expect(paid.state.sides[side].currentEnergy).toBe(4);
    expect(paid.events.filter(event => event.kind === "abandoned")).toHaveLength(count);
    expect(paid.events.filter(event => event.kind === "energyChanged" && event.cause === "payment").map(event => event.kind === "energyChanged" ? event.change : 0)).toEqual([-1]);
    for (const id of f.figments.slice(0, count)) expect(paid.state.instances[id]).toBeUndefined();
    expect(paid.state.instances[f.source].status.x).toBe(3);
    const resolved = f.engine.apply(paid.state, f.other, { kind: "pass" }, new ScriptedSource([]));
    expect(resolved.state.instances[targetId].zone).toBe("void");
    expect(invariantViolations(resolved.state, f.engine.catalog)).toEqual([]);
    expect(f.state.sides[side].currentEnergy).toBe(5);
  });

  it("withholds X above controlled eligibility and honors a declared positive minimum", () => {
    const f = fixture(side, { min: 1 });
    const adapter = createFoldAdapter(f.engine);
    const opened = applied(adapter.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
    const prompt = adapter.pending(opened)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseNumber", min: 1, max: 2 });
    expect(isLegalAnswer(prompt, 0)).toBe(false);
    expect(isLegalAnswer(prompt, 3)).toBe(false);
    const impossible = fixture(side, { min: 3 });
    expect(impossible.engine.legalActions(impossible.state, side)).not.toContainEqual(impossible.action);
  });

  it("limits directly authored opposing and unrestricted selectors to payer-controlled payment candidates", () => {
    const opposed = fixture(side, { rawController: "opponent" });
    expect(opposed.engine.legalActions(opposed.state, side)).not.toContainEqual(opposed.action);
    const f = fixture(side, { rawController: "any" });
    const answers = new Answers([1, [f.ids[f.other].back[1]!], [f.figments[0]]]);
    const paid = f.engine.apply(f.state, side, f.action, answers);
    expect(answers.prompts[0]).toMatchObject({ min: 1, max: 2 });
    expect(answers.prompts[2]).toMatchObject({ candidates: f.figments, min: 1, max: 1 });
    const opponentFigment = f.state.sides[f.other].frontRank[0]!;
    expect(isLegalAnswer(answers.prompts[2], [opponentFigment])).toBe(false);
    expect(paid.state.instances[opponentFigment].zone).toBe("play");
    expect(paid.events.filter(event => event.kind === "abandoned")).toHaveLength(1);
    expect(paid.state.sides[side].currentEnergy).toBe(4);
  });

  it("shares one chosen X with an actual energy-X cost and jointly reserves overlapping character costs", () => {
    const priced = fixture(side, { priced: true });
    const paid = priced.engine.apply(priced.state, side, priced.action, new ScriptedSource([2, [priced.ids[priced.other].back[2]!], priced.figments]));
    expect(paid.state.sides[side].currentEnergy).toBe(2);
    expect(paid.state.stack[0]?.x).toBe(2);
    const f = fixture(side, { overlap: true, effectTargets: false });
    const adapter = createFoldAdapter(f.engine);
    const opened = applied(adapter.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
    expect(isLegalAnswer(adapter.pending(opened)!.prompt, 2)).toBe(false);
    const result = f.engine.apply(f.state, side, f.action, new ScriptedSource([1, [f.figments[0]], [f.figments[1]]]));
    expect(result.events.filter(event => event.kind === "abandoned")).toHaveLength(2);
    expect(result.state.sides[side].currentEnergy).toBe(4);
  });

  it("suspends, reloads and replays every choice; rejects invalid, stale and concurrent inputs without payment", () => {
    const f = fixture(side);
    const adapter = createFoldAdapter(f.engine, { checkEventPrefix: true });
    let current = applied(adapter.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
    const xPrompt = adapter.pending(current)!.prompt;
    expect(adapter.reduce(current, { kind: "answer", side, promptId: xPrompt.id, value: 3 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(adapter.reduce(current, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    for (const value of [1, [f.ids[f.other].back[1]!]] as const) {
      const saved = JSON.parse(JSON.stringify(current)) as BattleSlice;
      const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
      const pending = cold.pending(saved)!;
      expect(pending).toEqual(adapter.pending(current));
      expect(saved.committed).toEqual(f.state);
      expect(cold.reduce(saved, { kind: "answer", side: f.other, promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      current = applied(cold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value }));
    }
    const saved = JSON.parse(JSON.stringify(current)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
    const pending = cold.pending(saved)!;
    for (const value of [[], [f.source], [f.ids[side].back[1]!], [f.figments[0], f.figments[0]]]) {
      expect(cold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(saved.committed).toEqual(f.state);
    }
    expect(cold.reduce(saved, { kind: "answer", side, promptId: xPrompt.id, value: 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const cancelled = applied(cold.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(f.state);
    const reopened = applied(cold.reduce(cancelled, { kind: "battleAction", side, action: f.action }));
    expect(cold.reduce(reopened, { kind: "answer", side, promptId: pending.prompt.id, value: [f.figments[0]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const completed = applied(cold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: [f.figments[0]] }));
    const inline = f.engine.apply(f.state, side, f.action, new ScriptedSource([1, [f.ids[f.other].back[1]!], [f.figments[0]]]));
    expect(stateHash(completed.committed)).toBe(stateHash(inline.state));
    expect(completed.committed.sides[side].currentEnergy).toBe(4);
    expect(completed.committed.stack[0]?.x).toBe(1);
    const altered = saved.inFlight!.answers.map((answer, index) => index === 0 ? { ...answer, value: 2 } : answer);
    expect(() => runStep(saved.committed, saved.inFlight!.step, new ScriptedSource([]), f.engine.catalog, { prefix: altered })).toThrow(ReplayDivergence);
  });

  it("lets the real Greedy prompt policy choose and pay a legal count", () => {
    const f = fixture(side);
    const result = f.engine.apply(f.state, side, f.action, { answer: prompt => greedyAnswer(prompt, () => ({ mine: true, value: 1 }), () => new Set<number>(), 0) });
    expect(result.events.some(event => event.kind === "abandoned")).toBe(true);
    expect(result.state.sides[side].currentEnergy).toBe(4);
    expect(result.state.stack[0]?.x).toBeGreaterThan(0);
    expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
  });

  it("activates the same count-payment at Interrupt speed in an opponent response window", () => {
    const f = fixture(side, { interrupt: true });
    const state = { ...f.state, turn: { ...f.state.turn, active: f.other }, priority: f.other };
    const opener = f.engine.apply(state, f.other, { kind: "play", card: f.ids[f.other].hand[0], from: "hand" }, new ScriptedSource([]));
    expect(f.engine.legalActions(opener.state, side)).toContainEqual(f.action);
    const result = f.engine.apply(opener.state, side, f.action, new ScriptedSource([1, [f.ids[f.other].back[1]!], [f.figments[0]]]));
    expect(result.events.filter(event => event.kind === "abandoned")).toHaveLength(1);
    expect(result.state.instances[f.ids[f.other].back[1]!].zone).toBe("void");
    expect(result.state.sides[side].currentEnergy).toBe(4);
  });
});

describe("abandonXCost failure and builder boundary", () => {
  it("rejects malformed minima", () => {
    for (const min of [-1, 0.5, Infinity, NaN]) expect(() => abandonXCost({ min })).toThrow();
    expect(abandonXCost()).toMatchObject({ cost: "abandon", count: "x", min: 0, selector: { controller: "you" } });
  });
  it("rolls back energy and abandonment if the paying step fails after commitment", () => {
    const failed: EngineCardDefinition = { ...v.event0, id: syntheticId(0x51201), status: "authored", abilities: () => [additionalCost(abandonXCost()), event(gainPoints(1))], synthetic: { play(ctx, source) {
      const costs = [energy(1), abandonXCost({ selector: { figment: true }, min: 1 })];
      const purpose = { source, cardId: syntheticId(0x51201), ability: 0, role: "chooseX" as const };
      const chosen = chooseX(ctx, "player", costs, purpose);
      const plan = planCosts(ctx, "player", source, costs, chosen, role => ({ ...purpose, role }), [source]);
      ctx.commitPoint();
      payCosts(ctx, "player", source, plan);
      throw new Error("synthetic failure after abandon-X payment");
    } } };
    const engine = createEngine(testCatalog([failed]));
    const { state: placed, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [failed.id], energy: 3, deck }, enemy: { deck } });
    const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
    const figment = placeFigment(state, "player", { rank: "back", index: 0 }, copy);
    const adapter = createFoldAdapter(engine);
    let opened = applied(adapter.reduce(slice(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    opened = applied(adapter.reduce(opened, { kind: "answer", side: "player", promptId: adapter.pending(opened)!.prompt.id, value: 1 }));
    const outcome = adapter.reduce(opened, { kind: "answer", side: "player", promptId: adapter.pending(opened)!.prompt.id, value: [figment] });
    if (outcome.kind !== "applied") throw new Error("Expected paying failure");
    expect(outcome.error).not.toBeNull();
    expect(outcome.slice.committed).toEqual(state);
    expect(outcome.published.some(event => event.kind === "energyChanged" || event.kind === "abandoned")).toBe(false);
  });
});
