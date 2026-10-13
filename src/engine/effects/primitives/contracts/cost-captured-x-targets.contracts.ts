/** Mandatory cost-captured X binds immediate play and activation choices before payment. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, abandonCostCapture, abandonSparkCapture, additionalCost, event, keyword, activated, characterYouControl, banishXCost, discardCost, discardCostFilter, energy, energyX, enemyCharacter, fromVoid, target, x } from "../../../dsl/builders";
import type { AdditionalCost, Cost } from "../../../dsl/types";
import type { Effect } from "../../registry";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { isLegalAnswer } from "../../../prompts/answers";
import { promptFingerprint } from "../../../prompts/fingerprint";
import type { Answer, Prompt, PromptId } from "../../../prompts/types";
import { choosePlayTime } from "../../interpreter";
import { payCosts, planCosts, prepareCostX } from "../../../rules/costs";
import { stateHash } from "../../../state/hash";
import { opponent, type Side } from "../../../state/ids";
import { ReplayDivergence } from "../../../steps/errors";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { chooseOne } from "../choose-one";
import { dissolve } from "../dissolve";
import { floating } from "../floating-trigger";
import { gainPoints } from "../gain-points";
import { returnFromVoid } from "../return-from-void";

const exact = enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() });
const forms = {
  discardCount: discardCostFilter({}, { count: "x", min: 1 }),
  banishCount: banishXCost({ min: 1 }),
  discardCapture: discardCostFilter({}, { captureCost: true }),
  abandonCapture: abandonCostCapture({ another: true }),
} as const;
type Form = keyof typeof forms;
const isCapture = (form: Form) => form === "discardCapture" || form === "abandonCapture";
const deck = [v.vanilla1.id, v.vanilla1.id];
function fixture(form: Form, side: Side = "player", options: { stored?: number | null; priced?: boolean; effect?: Effect; costs?: readonly Cost[]; onlyTwo?: boolean; ownTwos?: boolean } = {}) {
  const card: EngineCardDefinition = {
    ...v.vanilla1, id: syntheticId(0x50b50), status: "authored",
    abilities: () => [activated([energy(1), ...(options.priced ? [energyX(0)] : []), ...(options.costs ?? [forms[form]])], options.effect ?? dissolve(target(exact)))],
  };
  const engine = createEngine(testCatalog([card]));
  const other = opponent(side);
  const { state: placed, ids } = boardState(engine.catalog, {
    active: side, phase: "day",
    [side]: { back: [card.id, v.vanilla2.id, options.ownTwos ? v.vanilla2.id : v.vanilla3.id], hand: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], void: [v.vanilla1.id, v.vanilla2.id, v.vanilla2.id], energy: 5, deck },
    [other]: { back: options.onlyTwo ? [v.vanilla2.id] : [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck },
  });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const source = ids[side].back[0]!;
  state.instances[source].status.x = options.stored ?? null;
  const payment = form === "discardCapture" ? [ids[side].hand[1]] : form === "abandonCapture" ? [ids[side].back[1]!] : form === "discardCount" ? ids[side].hand.slice(0, 2) : ids[side].void.slice(0, 2);
  const selected = ids[other].back[options.onlyTwo ? 0 : 1]!;
  const action = { kind: "activate", source, ability: 0 } as const;
  const values: Answer[] = [...(options.priced || !isCapture(form) ? [2] : []), ...(isCapture(form) ? [payment] : []), [selected], ...(!isCapture(form) ? [payment] : [])];
  return { engine, state, ids, source, side, other, action, payment, selected, values };
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
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful activation intent");
  return outcome.slice;
}
function slice(committed: BattleSlice["committed"]): BattleSlice { return { committed, inFlight: null, publishedEvents: 0, attempt: 0 }; }

describe("mandatory cost-captured activation X", () => {
  for (const side of ["player", "enemy"] as const) for (const form of Object.keys(forms) as Form[]) {
    for (const stored of [null, 3]) it(`${side} ${form} binds X = 2 before exact targets with stored X = ${String(stored)}`, () => {
      const f = fixture(form, side, { stored, onlyTwo: true });
      expect(f.engine.legalActions(f.state, side)).toContainEqual(f.action);
      const answers = new Answers(f.values);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts.map(prompt => prompt.kind)).toEqual(isCapture(form) ? ["chooseCards", "chooseTargets"] : ["chooseNumber", "chooseTargets", "chooseCards"]);
      expect(answers.prompts[1]).toMatchObject({ kind: "chooseTargets", candidates: [f.selected] });
      expect(result.state.instances[f.selected].zone).toBe("void");
      expect(result.state.instances[f.source].status.x).toBe(stored);
      expect(result.state.sides[side].currentEnergy).toBe(4);
      expect(result.events.filter(event => event.kind === "energyChanged")).toHaveLength(1);
      const destination = form === "banishCount" ? "banished" : "void";
      expect(f.payment.map(id => result.state.instances[id]?.zone)).toEqual(f.payment.map(() => destination));
      expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(false);
      expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
    });

    it(`${side} ${form} shares captured X with energy X and debits only the actual energy cost`, () => {
      const f = fixture(form, side, { priced: true, stored: 3 });
      const answers = new Answers(f.values);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(result.state.sides[side].currentEnergy).toBe(2);
      expect(result.state.instances[f.selected].zone).toBe("void");
      expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(false);
      if (isCapture(form)) {
        expect(isLegalAnswer(answers.prompts[1], f.payment)).toBe(true);
        const wrong = form === "discardCapture" ? f.ids[side].hand[2] : f.ids[side].back[2]!;
        expect(isLegalAnswer(answers.prompts[1], [wrong])).toBe(false);
      }
      else expect(answers.prompts[2]).toMatchObject({ kind: "chooseCards", min: 2, max: 2 });
    });

    it(`${side} ${form} retains the targetless card-choice protocol`, () => {
      const f = fixture(form, side, { stored: 3, effect: gainPoints(x()) });
      const answers = new Answers([f.payment]);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts.map(prompt => prompt.kind)).toEqual(["chooseCards"]);
      expect(result.state.sides[side].score).toBe(2);
      expect(result.state.sides[side].currentEnergy).toBe(4);
    });

    it(`${side} ${form} prepares X before modal legality and forwards it to later cost selectors`, () => {
      const effect = chooseOne(dissolve(target(exact)), dissolve(target(enemyCharacter({ sparkAtLeast: 9 }))));
      const costs = [forms[form], abandonCost({ another: true, sparkAtLeast: x(), sparkAtMost: x() })];
      const f = fixture(form, side, { stored: 3, effect, costs, ownTwos: true });
      const second = f.ids[side].back[2]!;
      const values: Answer[] = [...(isCapture(form) ? [f.payment] : [2]), 0, [f.selected], ...(!isCapture(form) ? [f.payment] : []), [second]];
      const answers = new Answers(values);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts[1]).toMatchObject({ kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: false }] });
      expect(result.state.instances[second].zone).toBe("void");
      expect(result.state.instances[f.selected].zone).toBe("void");
      expect(result.state.sides[side].currentEnergy).toBe(4);
    });
  }

  for (const side of ["player", "enemy"] as const) for (const form of ["discardCount", "banishCount"] as const) {
    it(`${side} ${form} can bind X = 2 while holding only its fixed one energy`, () => {
      const f = fixture(form, side, { onlyTwo: true });
      f.state.sides[side].currentEnergy = 1;
      expect(f.engine.legalActions(f.state, side)).toContainEqual(f.action);
      const result = f.engine.apply(f.state, side, f.action, new ScriptedSource(f.values));
      expect(result.state.sides[side].currentEnergy).toBe(0);
      expect(result.state.instances[f.selected].zone).toBe("void");
    });
  }

  it("shares a discarded card's captured cost with a mandatory discard count", () => {
    const f = fixture("discardCapture", "player", { costs: [forms.discardCapture, forms.discardCount] });
    const rest = [f.ids.player.hand[0], f.ids.player.hand[2]];
    const answers = new Answers([f.payment, [f.selected], rest]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    expect(answers.prompts.map(prompt => prompt.kind)).toEqual(["chooseCards", "chooseTargets", "chooseCards"]);
    expect(answers.prompts[2]).toMatchObject({ candidates: rest, min: 2, max: 2 });
    expect(result.events.filter(event => event.kind === "discarded")).toHaveLength(3);
    expect(result.state.instances[f.selected].zone).toBe("void");
  });

  it("limits a shared count to jointly payable distinct payments", () => {
    const f = fixture("discardCount", "player", { costs: [forms.discardCount, forms.discardCount] });
    const fold = createFoldAdapter(f.engine);
    const current = applied(fold.reduce(slice(f.state), { kind: "battleAction", side: "player", action: f.action }));
    expect(isLegalAnswer(fold.pending(current)!.prompt, 2)).toBe(false);
    const selected = f.ids.enemy.back[0]!;
    const result = f.engine.apply(f.state, "player", f.action, new ScriptedSource([1, [selected], [f.ids.player.hand[0]], [f.ids.player.hand[1]]]));
    expect(result.events.filter(event => event.kind === "discarded")).toHaveLength(2);
    expect(result.state.instances[selected].zone).toBe("void");
  });

  it("captures a departing source's copiable cost before its abandonment", () => {
    const f = fixture("abandonCapture", "player", { stored: 3, costs: [abandonCostCapture()] });
    const selected = f.ids.enemy.back[0]!;
    const answers = new Answers([[f.source], [selected]]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    expect(result.state.instances[f.source].zone).toBe("void");
    expect(result.state.instances[selected].zone).toBe("void");
    expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(false);
    expect(result.state.sides.player.currentEnergy).toBe(4);
  });

  it("admits zero captured discard count when its declared minimum and target allow it", () => {
    const f = fixture("discardCount", "player", { costs: [discardCostFilter({}, { count: "x", min: 0 })] });
    const selected = f.ids.enemy.back[0]!;
    f.state.instances[selected].status.gainedSpark = -1;
    const result = f.engine.apply(f.state, "player", f.action, new ScriptedSource([0, [selected], []]));
    expect(result.state.sides.player.hand).toEqual(f.ids.player.hand);
    expect(result.state.instances[selected].zone).toBe("void");
    expect(result.state.sides.player.currentEnergy).toBe(4);
  });

  it("uses the selected discard count rather than a stored source X for both target offering and resolution", () => {
    const f = fixture("discardCount", "player", { stored: 3 });
    const selected = f.ids.enemy.back[0]!;
    const answers = new Answers([1, [selected], [f.ids.player.hand[0]]]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    expect(answers.prompts[1]).toMatchObject({ candidates: [selected] });
    expect(result.state.instances[selected].zone).toBe("void");
    expect(result.state.instances[f.ids.enemy.back[2]!].zone).toBe("play");
    expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(false);
  });

  it("keeps deferred-only X target bounds on the targetless legacy protocol", () => {
    const f = fixture("discardCount", "player", { effect: floating({ on: "draw", player: "you" }, dissolve(target(exact))) });
    const answers = new Answers([f.payment]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    answers.exhausted();
    expect(answers.prompts.map(prompt => prompt.kind)).toEqual(["chooseCards"]);
    expect(result.state.floating).toHaveLength(1);
  });

  it("reserves a void target separately from count-X banish cards", () => {
    const f = fixture("banishCount", "player", { effect: returnFromVoid(fromVoid({}, { costAtMost: x() })) });
    const selected = f.ids.player.void[1];
    const payers = [f.ids.player.void[0], f.ids.player.void[2]];
    const answers = new Answers([2, [selected], payers]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    expect(answers.prompts[2]).toMatchObject({ candidates: payers, min: 2, max: 2 });
    expect(result.state.instances[selected].zone).toBe("hand");
    expect(payers.map(id => result.state.instances[id].zone)).toEqual(["banished", "banished"]);
  });

  it("reserves a captured abandonment card separately from its targets and later payments", () => {
    const effect = dissolve(target(characterYouControl({ another: true, sparkAtLeast: x(), sparkAtMost: x() })));
    const f = fixture("abandonCapture", "player", { effect, ownTwos: true });
    const targetId = f.ids.player.back[2]!;
    const answers = new Answers([f.payment, [targetId]]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    expect(answers.prompts[0]).toMatchObject({ candidates: [f.ids.player.back[1], targetId] });
    expect(isLegalAnswer(answers.prompts[1], f.payment)).toBe(false);
    expect(result.events.filter(event => event.kind === "abandoned")).toHaveLength(1);
    expect(result.state.instances[targetId].zone).toBe("void");
    expect(result.state.instances[f.source].zone).toBe("play");
  });

  it("reserves an early capture from a preceding discard while paying in printed order", () => {
    const f = fixture("discardCapture", "player", { costs: [discardCost(), forms.discardCapture] });
    const answers = new Answers([f.payment, [f.selected], [f.ids.player.hand[0]]]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    expect(isLegalAnswer(answers.prompts[2], f.payment)).toBe(false);
    expect(result.events.filter(event => event.kind === "discarded").map(event => event.instance)).toEqual([f.ids.player.hand[0], ...f.payment]);
  });
});

describe("cost-captured X replay and atomic payment", () => {
  for (const side of ["player", "enemy"] as const) for (const form of Object.keys(forms) as Form[]) {
    it(`${side} ${form} reloads every prefix, cancels, rejects invalid or concurrent input, and pays once`, () => {
      const f = fixture(form, side, { stored: 3 });
      const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
      let current = applied(fold.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
      let firstId: PromptId | null = null;
      for (const value of f.values) {
        const saved = JSON.parse(JSON.stringify(current)) as BattleSlice;
        const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
        const pending = cold.pending(saved)!;
        expect(pending).toEqual(fold.pending(current));
        expect(saved.committed).toEqual(f.state);
        expect(cold.reduce(saved, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
        expect(cold.reduce(saved, { kind: "answer", side: f.other, promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
        const invalid: Answer = pending.prompt.kind === "chooseNumber" ? 9 : [f.source];
        expect(cold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: invalid })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
        if (firstId !== null) expect(cold.reduce(saved, { kind: "answer", side, promptId: firstId, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
        else firstId = pending.prompt.id;
        expect(applied(cold.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id })).committed).toEqual(f.state);
        const reopened = applied(cold.reduce(applied(cold.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id })), { kind: "battleAction", side, action: f.action }));
        expect(cold.reduce(reopened, { kind: "answer", side, promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
        current = applied(cold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value }));
        expect(cold.reduce(current, { kind: "answer", side, promptId: pending.prompt.id, value }).kind).toBe("bounced");
      }
      const inline = f.engine.apply(f.state, side, f.action, new ScriptedSource(f.values));
      expect(stateHash(current.committed)).toBe(stateHash(inline.state));
      expect(current.inFlight).toBeNull();
      expect(current.committed.sides[side].currentEnergy).toBe(4);
      expect(inline.events.filter(event => event.kind === "discarded" || event.kind === "banished" || event.kind === "abandoned")).toHaveLength(f.payment.length);
    });

    it(`${side} ${form} rejects a target replay fingerprint from a different X without publishing payment`, () => {
      const f = fixture(form, side, { stored: 3 });
      const first = runStep(f.state, f.action, INTERACTIVE, f.engine.catalog);
      if (first.kind !== "suspended") throw new Error("Missing binding prompt");
      const binding = { fingerprint: promptFingerprint(first.prompt), value: f.values[0] };
      const targeting = runStep(f.state, f.action, INTERACTIVE, f.engine.catalog, { prefix: [binding] });
      if (targeting.kind !== "suspended" || targeting.prompt.kind !== "chooseTargets") throw new Error("Missing target prompt");
      const wrongTarget = f.ids[f.other].back[2]!;
      const wrong = { fingerprint: promptFingerprint({ ...targeting.prompt, candidates: [wrongTarget] }), value: [wrongTarget] };
      const before = stateHash(f.state);
      expect(() => runStep(f.state, f.action, NO_PROMPTS, f.engine.catalog, { prefix: [binding, wrong], replay: true })).toThrow(ReplayDivergence);
      expect(stateHash(f.state)).toBe(before);
    });

    it(`${side} ${form} leaves committed state intact on a mid-preparation error`, () => {
      const f = fixture(form, side);
      let index = 0;
      const before = stateHash(f.state);
      expect(() => f.engine.apply(f.state, side, f.action, { answer: () => {
        if (index++ === 0) return f.values[0];
        throw new Error("synthetic target preparation failure");
      } })).toThrow("synthetic target preparation failure");
      expect(stateHash(f.state)).toBe(before);
    });
  }

  it("rolls back partial energy and captured-card payment writes when a step errors after commitment", () => {
    const costs = [energy(1), forms.discardCapture];
    const definition: EngineCardDefinition = {
      ...v.event0, id: syntheticId(0x50b51), status: "authored", abilities: () => [],
      synthetic: { play(ctx, source) {
        const purpose = (role: Prompt["purpose"]["role"]) => ({ source, cardId: syntheticId(0x50b51), ability: 0, role });
        const prepared = prepareCostX(ctx, "player", source, costs, purpose, true);
        const choices = choosePlayTime(ctx, [{ ability: 0, effect: dissolve(target(exact)) }], "player", source, (_, role) => purpose(role), prepared.x ?? undefined)[0];
        const plan = planCosts(ctx, "player", source, costs, prepared.x, purpose, [source, ...choices.targets.flat()], undefined, { preparedPayments: prepared.payments, ...(prepared.x === null ? {} : { selectorX: prepared.x }) });
        ctx.commitPoint();
        payCosts(ctx, "player", source, plan);
        throw new Error("synthetic failure after captured payment");
      } },
    };
    const engine = createEngine(testCatalog([definition]));
    const { state: placed, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [definition.id, v.vanilla2.id], energy: 5, deck }, enemy: { back: [v.vanilla2.id], deck } });
    const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    let current = applied(fold.reduce(slice(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    current = applied(fold.reduce(current, { kind: "answer", side: "player", promptId: fold.pending(current)!.prompt.id, value: [ids.player.hand[1]] }));
    const outcome = fold.reduce(current, { kind: "answer", side: "player", promptId: fold.pending(current)!.prompt.id, value: [ids.enemy.back[0]!] });
    if (outcome.kind !== "applied") throw new Error("Expected payment failure");
    expect(outcome.error).not.toBeNull();
    expect(outcome.slice.committed).toEqual(state);
    expect(outcome.published.some(event => event.kind === "energyChanged" || event.kind === "discarded")).toBe(false);
  });
});

/** Played events use the same preparation while reserving their own physical card. */
function played(side: Side, options: { cost?: AdditionalCost; effect?: Effect; priced?: boolean; offering?: boolean; zero?: boolean; ownTarget?: boolean } = {}) {
  const effect = options.effect ?? dissolve(target(options.ownTarget ? characterYouControl({ sparkAtLeast: x(), sparkAtMost: x() }) : exact));
  const card: EngineCardDefinition = { ...v.event0, id: syntheticId(0x60902), status: "authored", costs: [energy(1), ...(options.priced ? [energyX(0)] : [])],
    abilities: () => [event(effect), ...(options.offering ? [keyword("offering")] : []), additionalCost(options.cost ?? abandonSparkCapture())] };
  const engine = createEngine(testCatalog([card]));
  const other = opponent(side);
  const { state: placed, ids } = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { hand: [card.id, v.vanilla2.id, v.event0.id], back: [options.zero ? v.vanilla0.id : v.vanilla2.id, v.vanilla2.id], void: [v.vanilla2.id, v.vanilla1.id], energy: 5, deck },
    [other]: { back: [v.vanilla0.id, v.vanilla2.id], deck } });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const action = { kind: "play", card: ids[side].hand[0], from: "hand" } as const;
  return { engine, state, ids, side, other, action, payer: ids[side].back[0]!, selected: ids[other].back[options.zero ? 0 : 1]! };
}

describe("mandatory captured-X played-card choices", () => {
  for (const side of ["player", "enemy"] as const) {
    for (const [name, cost, payment, prefix] of [
      ["spark", abandonSparkCapture(), "back", false], ["copiable abandon", abandonCostCapture(), "back", false],
      ["copiable discard", forms.discardCapture, "hand", false], ["discard count", forms.discardCount, "hand", true],
    ] as const) it(`${side} prepares ${name} before exact targets and reserves its source`, () => {
      const f = played(side, { cost });
      const payers = payment === "back" ? [f.payer] : prefix ? f.ids[side].hand.slice(1) : [f.ids[side].hand[1]];
      expect(f.engine.legalActions(f.state, side)).toContainEqual(f.action);
      const answers = new Answers([...(prefix ? [2] : [payers]), [f.selected], ...(prefix ? [payers] : [])]);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts[1]).toMatchObject({ kind: "chooseTargets", candidates: [f.selected] });
      expect(result.events.some(e => e.kind === "noLegalTarget")).toBe(false);
      expect(result.state.instances[f.selected].zone).toBe("void");
      expect(result.state.sides[side].currentEnergy).toBe(4);
      expect(result.events.filter(e => e.kind === "abandoned" || e.kind === "discarded")).toHaveLength(payers.length);
      expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
    });
    it(`${side} uses effective spark and offers immediate modes after its payer`, () => {
      const f = played(side, { effect: chooseOne(dissolve(target(exact)), gainPoints(x())) });
      f.state.instances[f.payer].status.gainedSpark = 1;
      const answers = new Answers([[f.payer], 1]);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts.map(p => p.kind)).toEqual(["chooseCards", "chooseMode"]);
      expect(answers.prompts[1]).toMatchObject({ options: [{ mode: 0, legal: false }, { mode: 1, legal: true }] });
      expect(result.state.sides[side].score).toBe(3);
    });
    it(`${side} offers alternate physical payers but reserves one separately from its own target`, () => {
      const f = played(side, { ownTarget: true });
      const other = f.ids[side].back[1]!;
      const answers = new Answers([[other], [f.payer]]);
      const result = f.engine.apply(f.state, side, f.action, answers);
      expect(isLegalAnswer(answers.prompts[0], [f.payer])).toBe(true);
      expect(isLegalAnswer(answers.prompts[1], [other])).toBe(false);
      expect(result.events.filter(e => e.kind === "abandoned").map(e => e.instance)).toEqual([other]);
      expect(result.state.instances[f.payer].zone).toBe("void");
    });
    it(`${side} reloads/cancels every played prefix, rejects stale or competing actors, and pays once`, () => {
      const f = played(side);
      let fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
      let current = applied(fold.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
      let previous: PromptId | null = null;
      for (const value of [[f.payer], [f.selected]]) {
        fold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
        current = JSON.parse(JSON.stringify(current)) as BattleSlice;
        const prompt = fold.pending(current)!.prompt;
        expect(current.committed).toEqual(f.state);
        expect(fold.reduce(current, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
        expect(fold.reduce(current, { kind: "answer", side: f.other, promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
        expect(fold.reduce(current, { kind: "answer", side, promptId: prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
        if (previous !== null) expect(fold.reduce(current, { kind: "answer", side, promptId: previous, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
        const cancelled = applied(fold.reduce(current, { kind: "cancel", side, promptId: prompt.id }));
        expect(cancelled.committed).toEqual(f.state);
        const reopened = applied(fold.reduce(cancelled, { kind: "battleAction", side, action: f.action }));
        expect(fold.reduce(reopened, { kind: "answer", side, promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
        current = applied(fold.reduce(current, { kind: "answer", side, promptId: prompt.id, value }));
        previous = prompt.id;
      }
      const direct = f.engine.apply(f.state, side, f.action, new ScriptedSource([[f.payer], [f.selected]]));
      expect(stateHash(current.committed)).toBe(stateHash(direct.state));
      expect(direct.events.filter(e => e.kind === "abandoned")).toHaveLength(1);
      expect(current.inFlight).toBeNull();
    });
    it(`${side} leaves payment unpublished on a target-preparation error`, () => {
      const f = played(side); const before = stateHash(f.state); let index = 0;
      expect(() => f.engine.apply(f.state, side, f.action, { answer() { if (index++ === 0) return [f.payer]; throw new Error("synthetic played target failure"); } })).toThrow("synthetic played target failure");
      expect(stateHash(f.state)).toBe(before);
    });
  }
  it("prepares modified energy X once with its original ability-zero purpose", () => {
    const f = played("player", { priced: true });
    f.state.floating.push({ id: `e${f.state.nextEffect++}`, controller: "player", source: f.payer, timestamp: 1, expiry: { at: "endOfTurn" }, change: { kind: "cost", amount: -2, next: false, filter: {}, player: "player" } });
    f.state.sides.player.currentEnergy = 1;
    const answers = new Answers([2, [f.payer], [f.selected]]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    expect(answers.prompts.map(p => p.kind)).toEqual(["chooseNumber", "chooseCards", "chooseTargets"]);
    expect(answers.prompts[0].purpose.ability).toBe(0);
    expect(answers.prompts[1].purpose.ability).toBe(1);
    expect(result.state.sides.player.currentEnergy).toBe(0);
    expect(result.state.instances[f.selected].zone).toBe("void");
  });
  for (const priced of [false, true]) it(`preserves Offering ${priced ? "printed X=0" : "independent captured X"}`, () => {
    const f = played("player", { offering: true, priced, zero: priced });
    const answers = new Answers([1, [f.payer], [f.selected], [f.ids.player.hand[2]]]);
    const result = f.engine.apply(f.state, "player", f.action, answers);
    answers.exhausted();
    expect(answers.prompts.map(p => p.kind)).toEqual(["chooseMode", "chooseCards", "chooseTargets", "chooseCards"]);
    expect(result.state.sides.player.currentEnergy).toBe(5);
    expect(result.state.instances[f.selected].zone).toBe("void");
    expect(result.state.instances[f.action.card].status.offering).toBe(true);
  });
});
