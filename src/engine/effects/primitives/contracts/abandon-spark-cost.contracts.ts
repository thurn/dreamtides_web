/** One paid character's effective prepayment spark binds the existing shared X. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, abandonCostCapture, abandonSparkCapture, abandonXCost, activated, additionalCost, all, characterYouControl, choiceCost, energy, energyX, enemyCharacter, event, optionalCost, staticAbility, supported, target, x } from "../../../dsl/builders";
import { NO_DECK_MODS, type Cost } from "../../../dsl/types";
import type { Effect } from "../../registry";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { isLegalAnswer } from "../../../prompts/answers";
import type { Answer, Prompt, PromptId } from "../../../prompts/types";
import { copyOnStack } from "../../../rules/copies";
import { payCosts, planCosts } from "../../../rules/costs";
import { stateHash } from "../../../state/hash";
import { opponent, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { Context } from "../../../steps/context";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, placeFigment } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { chooseOne } from "../choose-one";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { setBaseSpark } from "../set-base-spark";
import { sparkModifier } from "../spark-modifier";

const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];
const capture = abandonSparkCapture();
interface Setup {
  readonly costs?: readonly Cost[];
  readonly effect?: Effect;
  readonly targeted?: boolean;
  readonly gained?: number;
  readonly timed?: number;
  readonly static?: number;
  readonly support?: number;
  readonly base?: number;
  readonly variant?: number;
  readonly expected?: number;
  readonly self?: boolean;
  readonly figment?: boolean;
}
function fixture(side: Side = "player", options: Setup = {}) {
  const expected = options.expected ?? 12;
  const effect = options.effect ?? (options.targeted ? dissolve(target(enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() }))) : gainPoints(x()));
  const source: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x54310), costs: [energy(4)], spark: 7, status: "authored", abilities: () => [
    activated(options.costs ?? [energy(1), capture], effect),
    ...(options.static === undefined ? [] : [staticAbility(sparkModifier(all(characterYouControl()), options.static))]),
    ...(options.support === undefined ? [] : [staticAbility(sparkModifier(supported(), options.support))]),
    ...(options.base === undefined ? [] : [staticAbility(setBaseSpark(all(characterYouControl()), options.base))]),
  ] };
  const payer: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x54311), costs: [energy(4)], spark: 7 };
  const victim: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x54312), spark: expected };
  const engine = createEngine(testCatalog([source, payer, victim]));
  const other = opponent(side);
  const { state: placed, ids } = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { back: [source.id, v.vanilla3.id], front: options.figment ? [] : [payer.id], hand: [v.vanilla1.id, v.vanilla2.id], energy: 20, deck },
    [other]: { back: [victim.id, v.vanilla1.id], deck },
  });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const paid = options.self ? ids[side].back[0]! : options.figment ? placeFigment(state, side, { rank: "front", index: 0 }, { kind: "figmentCopy", cardId: payer.id, spark: null }) : ids[side].front[0]!;
  state.instances[paid].status.gainedSpark = options.gained ?? 5;
  if (options.variant !== undefined) state.instances[paid] = { ...state.instances[paid], variant: { amplified: true, deckMods: { ...NO_DECK_MODS, sparkBonus: options.variant } } };
  if (options.timed !== undefined) {
    state.floating.push({ id: `e${state.nextEffect++}`, controller: side, source: ids[side].back[0]!, timestamp: 1, expiry: { at: "endOfTurn" }, change: { kind: "spark", instance: paid, amount: options.timed } });
  }
  state.instances[ids[side].back[0]!].status.x = 3;
  return { engine, state, ids, side, other, paid, expected, selected: ids[other].back[0]!, source: ids[side].back[0]!, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } as const };
}
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private index = 0;
  constructor(private readonly values: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.values[this.index++];
    if (value === undefined) throw new Error(`Missing ${prompt.kind} answer`);
    return value;
  }
  exhausted(): void { expect(this.index).toBe(this.values.length); }
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful spark-capture intent");
  return outcome.slice;
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });

const changes: readonly { readonly label: string; readonly options: Setup; readonly spark: number }[] = [
  { label: "printed spark distinct from cost", options: { gained: 0 }, spark: 7 },
  { label: "gained spark distinct from base", options: {}, spark: 12 },
  { label: "unexpired duration", options: { timed: 2 }, spark: 14 },
  { label: "live static anthem", options: { static: 3 }, spark: 15 },
  { label: "Support", options: { support: 2 }, spark: 14 },
  { label: "variant and deck-entry spark", options: { variant: 4 }, spark: 16 },
  { label: "current base-setting layer", options: { base: 3 }, spark: 8 },
  { label: "all current layers", options: { base: 3, static: 4, support: 2, timed: 3 }, spark: 17 },
  { label: "zero clamp", options: { gained: -9 }, spark: 0 },
];
describe("abandon spark capture", () => {
  for (const side of ["player", "enemy"] as const) {
    it.each(changes)(`${side} captures $label without charging captured X as energy`, ({ options, spark }) => {
      const f = fixture(side, { ...options, expected: spark });
      const answers = new Answers([[f.paid]]);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(result.state.sides[side].score).toBe(spark);
      expect(result.state.sides[side].currentEnergy).toBe(19);
      expect(result.state.instances[f.paid].zone).toBe("void");
      expect(result.state.instances[f.source].status.x).toBe(3);
      expect(result.events.filter(e => e.kind === "abandoned")).toHaveLength(1);
      expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
    });
    for (const self of [false, true]) it(`${side} retains ${self ? "self" : "other"} payer spark after departure for immediate X targets`, () => {
      const f = fixture(side, { self, targeted: true, support: self ? undefined : 2, expected: self ? 12 : 14 });
      const answers = new Answers([[f.paid], [f.selected]]);
      expect(f.engine.legalActions(f.state, side)).toContainEqual(f.action);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts.map(p => p.kind)).toEqual(["chooseCards", "chooseTargets"]);
      expect(answers.prompts[1]).toMatchObject({ candidates: [f.selected] });
      expect(result.state.instances[f.paid].zone).toBe("void");
      expect(result.state.instances[f.selected].zone).toBe("void");
      expect(result.events.some(e => e.kind === "noLegalTarget")).toBe(false);
    });
    it(`${side} retains a ceased figment's captured spark`, () => {
      const f = fixture(side, { figment: true, support: 2, expected: 14 });
      const result = f.engine.apply(f.state, side, f.action, new ScriptedSource([[f.paid]]));
      expect(result.state.instances[f.paid]).toBeUndefined();
      expect(result.events).toContainEqual(expect.objectContaining({ kind: "ceasedToExist", instance: f.paid }));
      expect(result.state.sides[side].score).toBe(14);
    });
    it(`${side} binds matching energy X and withholds a disagreeing payment`, () => {
      const f = fixture(side, { costs: [energy(1), energyX(0), capture], targeted: true });
      const fold = createFoldAdapter(f.engine);
      const opened = applied(fold.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
      const number = fold.pending(opened)!.prompt;
      expect(isLegalAnswer(number, 4)).toBe(false);
      expect(isLegalAnswer(number, 12)).toBe(true);
      const bound = applied(fold.reduce(opened, { kind: "answer", side, promptId: number.id, value: 12 }));
      const payment = fold.pending(bound)!.prompt;
      expect(isLegalAnswer(payment, [f.paid])).toBe(true);
      expect(isLegalAnswer(payment, [f.source])).toBe(false);
      const result = f.engine.apply(f.state, side, f.action, new ScriptedSource([12, [f.paid], [f.selected]]));
      expect(result.state.sides[side].currentEnergy).toBe(7);
      expect(result.state.instances[f.selected].zone).toBe("void");
    });
  }

  it("binds effective spark before an immediate modal target choice", () => {
    const effect = chooseOne(dissolve(target(enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() }))), gainPoints(1));
    const f = fixture("player", { effect });
    const answers = new Answers([[f.paid], 0, [f.selected]]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    answers.exhausted();
    expect(answers.prompts.map(prompt => prompt.kind)).toEqual(["chooseCards", "chooseMode", "chooseTargets"]);
    expect(result.state.instances[f.selected].zone).toBe("void");
  });
  it("captures before an earlier printed abandonment removes its Support and static provider", () => {
    const f = fixture("player", { costs: [abandonCost(), capture], support: 2, static: 3, expected: 17 });
    const result = f.engine.apply(f.state, "player", f.action, new ScriptedSource([[f.source], [f.paid]]));
    expect(result.events.filter(e => e.kind === "abandoned").map(e => e.instance)).toEqual([f.source, f.paid]);
    expect(result.state.sides.player.score).toBe(17);
  });
  it("keeps targets and subsequent cost cards distinct from a prepared capture", () => {
    const effect = gainSpark(target(characterYouControl({ sparkAtMost: x() })), x());
    const f = fixture("player", { costs: [capture, abandonCost()], effect });
    const targetId = f.ids.player.back[1]!;
    const answers = new Answers([[f.paid], [targetId], [f.source]]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    expect(isLegalAnswer(answers.prompts[1], [f.paid])).toBe(false);
    expect(isLegalAnswer(answers.prompts[2], [f.paid])).toBe(false);
    expect(result.state.instances[targetId].status.gainedSpark).toBe(12);
  });
  it("preserves chosen alternative and optional capture protocols", () => {
    for (const kind of ["choice", "optional"] as const) for (const paid of [false, true]) {
      const costs = kind === "choice" ? [choiceCost([capture], [energy(2)])] : [optionalCost(capture)];
      const f = fixture("player", { costs });
      const result = f.engine.apply(f.state, "player", f.action, new ScriptedSource([kind === "choice" ? (paid ? 0 : 1) : paid, ...(paid ? [[f.paid]] : [])]));
      expect(result.state.sides.player.score).toBe(paid ? 12 : 3);
      expect(result.state.instances[f.paid].zone).toBe(paid ? "void" : "play");
      expect(result.state.sides.player.currentEnergy).toBe(kind === "choice" && !paid ? 18 : 20);
    }
  });
  it("shares captured spark with an independently chosen abandon count", () => {
    const f = fixture("player", { gained: -5, expected: 2, costs: [energy(1), capture, abandonXCost({ min: 1 })] });
    const result = f.engine.apply(f.state, "player", f.action, new ScriptedSource([2, [f.paid], [f.source, f.ids.player.back[1]!]]));
    expect(result.state.sides.player.score).toBe(2);
    expect(result.state.sides.player.currentEnergy).toBe(19);
    expect(result.events.filter(e => e.kind === "abandoned")).toHaveLength(3);
  });
  it("uses clamped zero to bind a meaningful zero-spark target", () => {
    const f = fixture("player", { gained: -9, expected: 0, targeted: true });
    const result = f.engine.apply(f.state, "player", f.action, new ScriptedSource([[f.paid], [f.selected]]));
    expect(result.state.instances[f.selected].zone).toBe("void");
    expect(result.state.sides.player.currentEnergy).toBe(19);
  });
  it("preserves copiable-cost and abandon-count X beside spark capture", () => {
    for (const [cost, expected] of [[abandonCostCapture(), 4], [abandonXCost({ min: 1 }), 1]] as const) {
      const f = fixture("player", { costs: [energy(1), cost] });
      const result = f.engine.apply(f.state, "player", f.action, new ScriptedSource([...(cost.cost === "abandon" && cost.count === "x" ? [1] : []), [f.paid]]));
      expect(result.state.sides.player.score).toBe(expected);
      expect(result.state.sides.player.currentEnergy).toBe(19);
    }
    const f = fixture("player", { costs: [capture, abandonCostCapture()] });
    expect(f.engine.legalActions(f.state, "player")).not.toContainEqual(f.action);
  });
});

for (const side of ["player", "enemy"] as const) describe(`abandon spark capture ${side} replay`, () => {
  it("reloads every prefix, cancels, rejects invalid/stale/competing inputs and commits payment once", () => {
    const f = fixture(side, { targeted: true });
    let current = applied(createFoldAdapter(f.engine).reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
    let previous: PromptId | null = null;
    for (const value of [[f.paid], [f.selected]]) {
      const fold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
      current = JSON.parse(JSON.stringify(current)) as BattleSlice;
      const prompt = fold.pending(current)!.prompt;
      expect(current.committed).toEqual(f.state);
      expect(fold.reduce(current, { kind: "answer", side: f.other, promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      expect(fold.reduce(current, { kind: "answer", side, promptId: prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fold.reduce(current, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      if (previous !== null) expect(fold.reduce(current, { kind: "answer", side, promptId: previous, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      const cancelled = applied(fold.reduce(current, { kind: "cancel", side, promptId: prompt.id }));
      expect(cancelled.committed).toEqual(f.state);
      const reopened = applied(fold.reduce(cancelled, { kind: "battleAction", side, action: f.action }));
      expect(fold.reduce(reopened, { kind: "answer", side, promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      current = applied(fold.reduce(current, { kind: "answer", side, promptId: prompt.id, value }));
      expect(fold.reduce(current, { kind: "answer", side, promptId: prompt.id, value }).kind).toBe("bounced");
      previous = prompt.id;
    }
    const direct = f.engine.apply(f.state, side, f.action, new ScriptedSource([[f.paid], [f.selected]]));
    expect(stateHash(current.committed)).toBe(stateHash(direct.state));
    expect(direct.events.filter(e => e.kind === "abandoned")).toHaveLength(1);
    expect(direct.state.sides[side].currentEnergy).toBe(19);
  });
  it("retains captured X in the saved stack, both views and determinization after the paid character leaves play", () => {
    const f = fixture(side, { support: 2, expected: 14 });
    const staged = runStep(f.state, f.action, new ScriptedSource([[f.paid]]), f.engine.catalog);
    if (staged.kind !== "done") throw new Error("Expected paid stack item");
    expect(staged.state.stack[0]).toMatchObject({ x: 14 });
    const saved = JSON.parse(JSON.stringify(staged.state)) as BattleState;
    for (const viewer of [side, f.other]) {
      const view = f.engine.view(saved, viewer);
      expect(view.stack[0]).toMatchObject({ x: 14 });
      const decklists = {
        player: Object.values(saved.instances).flatMap(i => i.owner === "player" && i.printing.kind === "card" ? [{ cardId: i.printing.cardId, ...i.variant }] : []),
        enemy: Object.values(saved.instances).flatMap(i => i.owner === "enemy" && i.printing.kind === "card" ? [{ cardId: i.printing.cardId, ...i.variant }] : []),
      };
      const restored = f.engine.determinize(view, decklists, () => 0.5);
      expect(restored.stack[0]).toMatchObject({ x: 14 });
    }
    const resolved = runStep(saved, { kind: "resolveTop" }, NO_PROMPTS, f.engine.catalog);
    if (resolved.kind !== "done") throw new Error("Expected resolution");
    expect(resolved.state.sides[side].score).toBe(14);
  });
});

describe("abandon spark capture copied cards and failures", () => {
  it("a card copy retains captured X and pays no second abandonment", () => {
    const card: EngineCardDefinition = { ...v.event0, id: syntheticId(0x54320), status: "authored", abilities: () => [additionalCost(capture), event(gainPoints(x()))] };
    const engine = createEngine(testCatalog([card]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [card.id], back: [v.vanilla3.id], deck }, enemy: { deck } });
    const paid = runStep(state, { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS, engine.catalog);
    if (paid.kind !== "done") throw new Error("Expected paid card");
    const ctx = new Context(paid.state, engine.catalog, NO_PROMPTS);
    expect(copyOnStack(ctx, ids.player.hand[0], "player")).not.toBeNull();
    expect(ctx.state.stack.map(item => item.x)).toEqual([3, 3]);
    expect(ctx.events.filter(e => e.kind === "abandoned")).toEqual([]);
    const first = runStep(ctx.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
    if (first.kind !== "done") throw new Error("Expected copy resolution");
    const second = runStep(first.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
    if (second.kind !== "done") throw new Error("Expected original resolution");
    expect(second.state.sides.player.score).toBe(6);
    expect(paid.events.filter(e => e.kind === "abandoned")).toHaveLength(1);
  });
  it("rolls back a genuine paying-step fault and succeeds with the ordinary restored card", () => {
    const healthy: EngineCardDefinition = { ...v.event0, id: syntheticId(0x54321), status: "authored", abilities: () => [additionalCost(capture), event(gainPoints(x()))] };
    const failed: EngineCardDefinition = { ...healthy, synthetic: { play(ctx, source) {
      const costs = [energy(1), capture];
      const purpose = { source, cardId: healthy.id, ability: 0 };
      const plan = planCosts(ctx, "player", source, costs, null, role => ({ ...purpose, role }), [source]);
      ctx.commitPoint();
      payCosts(ctx, "player", source, plan);
      throw new Error("synthetic failure after captured-spark payment");
    } } };
    const engine = createEngine(testCatalog([failed]));
    const { state: placed, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [healthy.id], back: [v.vanilla3.id], energy: 5, deck }, enemy: { deck } });
    const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
    const action = { kind: "play", card: ids.player.hand[0], from: "hand" } as const;
    const before = stateHash(state);
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(slice(state), { kind: "battleAction", side: "player", action }));
    const outcome = fold.reduce(opened, { kind: "answer", side: "player", promptId: fold.pending(opened)!.prompt.id, value: [ids.player.back[0]!] });
    if (outcome.kind !== "applied") throw new Error("Expected paying failure");
    expect(outcome.error).not.toBeNull();
    expect(outcome.slice.committed).toEqual(state);
    expect(outcome.published.filter(e => e.kind === "energyChanged" || e.kind === "abandoned")).toEqual([]);
    expect(stateHash(state)).toBe(before);
    const restored = createEngine(testCatalog([healthy])).apply(state, "player", action, new ScriptedSource([[ids.player.back[0]!]]));
    expect(restored.state.sides.player.score).toBe(3);
    expect(restored.events.filter(e => e.kind === "abandoned")).toHaveLength(1);
  });
});
