/** One payment-dependent physical target, prepared without paying and retained for copies/replay. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, abandonSparkCapture, activated, additionalCost, all, characterYouControl, costPaid, discardCost, energy, energyX, enemyCharacter, event, keyword, optionalCost, reclaim, staticAbility, targetWhen, x } from "../../../dsl/builders";
import { triggered, triggeringCard, whenYouPlay } from "../../../dsl/triggers";
import { NO_DECK_MODS, type AdditionalCost, type Cost } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { isLegalAnswer } from "../../../prompts/answers";
import { promptFingerprint } from "../../../prompts/fingerprint";
import type { Answer, Prompt, PromptId } from "../../../prompts/types";
import { payCosts, planCosts } from "../../../rules/costs";
import { stateHash } from "../../../state/hash";
import { opponent, type Side } from "../../../state/ids";
import type { BattleState, CardStackItem } from "../../../state/types";
import { cloneState } from "../../../state/clone";
import { ReplayDivergence } from "../../../steps/errors";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource, StepResult } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { DSL } from "../../../testing/dsl-cards";
import { ZONE } from "../../../testing/zone-cards";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { banish } from "../banish";
import { copyCard } from "../copy-card";
import { sequence } from "../sequence";
import { chooseOne } from "../choose-one";
import { choosePlayer } from "../choose-player";
import { at, passUntil } from "../../../testing/trigger-harness";
import { costModifier } from "../cost-modifier";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";

const deck = Array.from({ length: 6 }, () => v.vanilla1.id);
const definitions = { energy: DSL.optionalEnergyTarget, discard: DSL.optionalDiscardTarget };
type Form = keyof typeof definitions;
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
  exhausted() { expect(this.index).toBe(this.values.length); }
}
function done(result: StepResult) {
  if (result.kind !== "done") throw new Error("Expected completed public step");
  return result;
}
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected applied intent");
  return outcome.slice;
}
function slice(committed: BattleState): BattleSlice { return { committed, inFlight: null, publishedEvents: 0, attempt: 0 }; }
function fixture(form: Form, side: Side = "player", options: { energy?: number; extraHand?: boolean; onlyWide?: boolean; definition?: EngineCardDefinition; own?: boolean; echo?: EngineCardDefinition } = {}) {
  const card = options.definition ?? definitions[form];
  const engine = createEngine(testCatalog([card, ...(options.echo ? [options.echo] : [])]));
  const other = opponent(side);
  const placed = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { hand: [card.id, ...(options.extraHand === false ? [] : [v.event0.id])], back: options.echo ? [options.echo.id] : options.own ? [v.vanilla1.id, v.vanilla2.id] : [], energy: options.energy ?? 6, deck },
    [other]: { hand: [], back: options.onlyWide ? [v.vanilla5.id] : [v.vanilla1.id, v.vanilla2.id, v.vanilla5.id], deck } });
  const state = { ...placed.state, config: { ...placed.state.config, autoAnswerForcedPrompts: false } };
  const action = { kind: "play", card: placed.ids[side].hand[0], from: "hand" } as const;
  return { engine, state, ids: placed.ids, side, other, action, card, wide: placed.ids[other].back[options.onlyWide ? 0 : 2]!, narrow: placed.ids[other].back[0]!, payer: placed.ids[side].hand[1] };
}
function values(f: ReturnType<typeof fixture>, form: Form, pays: boolean, target = pays ? f.wide : f.narrow): Answer[] {
  return [pays, ...(pays && form === "discard" ? [[f.payer]] : []), [target]];
}
function playedItem(state: BattleState): CardStackItem {
  const item = state.stack[0];
  if (item?.kind !== "card") throw new Error("Missing played card stack item");
  return item;
}

for (const side of ["player", "enemy"] as const) for (const form of ["energy", "discard"] as const) {
  describe(`${side} optional ${form} target restriction`, () => {
    for (const pays of [true, false]) it(`selects one physical target with exact paid=${pays}`, () => {
      const f = fixture(form, side); const answers = new Answers(values(f, form, pays));
      expect(f.engine.legalActions(f.state, side)).toContainEqual(f.action);
      const prepared = done(runStep(f.state, f.action, answers, f.engine.catalog)); answers.exhausted();
      expect(answers.prompts.filter(p => p.kind === "chooseTargets")).toHaveLength(1);
      expect(answers.prompts[0]).toMatchObject({ kind: "confirm", purpose: { role: "optionalCost" } });
      const target = answers.prompts[answers.prompts.length - 1];
      expect(target).toMatchObject({ kind: "chooseTargets", min: 1, max: 1 });
      if (target.kind !== "chooseTargets") throw new Error("Missing target choice");
      expect(target.candidates).toEqual(pays ? f.ids[f.other].back : f.ids[f.other].back.slice(0, 2));
      expect(playedItem(prepared.state)).toMatchObject({ optionalPaid: [pays], choices: [{ targets: [[pays ? f.wide : f.narrow]] }] });
      expect(prepared.state.sides[side].currentEnergy).toBe(form === "energy" && pays ? 2 : 5);
      expect(prepared.events.filter(e => e.kind === "discarded")).toHaveLength(form === "discard" && pays ? 1 : 0);
      const resolved = done(runStep(prepared.state, { kind: "resolveTop" }, NO_PROMPTS, f.engine.catalog));
      expect(resolved.state.instances[pays ? f.wide : f.narrow].zone).toBe("void");
      expect(resolved.state.instances[pays ? f.narrow : f.wide].zone).toBe("play");
      expect(invariantViolations(resolved.state, f.engine.catalog)).toEqual([]);
      expect(stateHash(f.state)).not.toBe(stateHash(prepared.state));
      expect(f.state.sides[side].currentEnergy).toBe(6);
    });

    it("admits a payable expanded target when the restricted branch is empty", () => {
      const f = fixture(form, side, { onlyWide: true });
      expect(f.engine.legalActions(f.state, side)).toContainEqual(f.action);
      const answers = new Answers(values(f, form, true));
      const result = f.engine.apply(f.state, side, f.action, answers); answers.exhausted();
      expect(result.state.instances[f.wide].zone).toBe("void");
      expect(result.events.filter(e => e.kind === "dissolved")).toHaveLength(1);
    });

    it("declines an unaffordable whole optional cost and excludes the wide target", () => {
      const f = fixture(form, side, form === "energy" ? { energy: 3 } : { extraHand: false });
      const answers = new Answers([[f.narrow]]);
      const played = done(runStep(f.state, f.action, answers, f.engine.catalog)); answers.exhausted();
      expect(answers.prompts.map(p => p.kind)).toEqual(["chooseTargets"]);
      expect(answers.prompts[0]).toMatchObject({ candidates: f.ids[f.other].back.slice(0, 2) });
      expect(playedItem(played.state).optionalPaid).toEqual([false]);
      const impossible = fixture(form, side, { onlyWide: true, ...(form === "energy" ? { energy: 3 } : { extraHand: false }) });
      expect(impossible.engine.legalActions(impossible.state, side)).not.toContainEqual(impossible.action);
      expect(() => impossible.engine.apply(impossible.state, side, impossible.action, NO_PROMPTS)).toThrow();
      expect(impossible.state.instances[impossible.action.card].zone).toBe("hand");
    });

    for (const pays of [true, false]) it(`reloads every paid=${pays} prefix and rejects cancellation/stale/foreign/competing input without payment`, () => {
      const f = fixture(form, side); let fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
      let current = applied(fold.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
      let previous: PromptId | null = null;
      for (const value of values(f, form, pays)) {
        const saved = JSON.parse(JSON.stringify(current)) as BattleSlice;
        fold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
        const pending = fold.pending(saved)!;
        expect(pending).toEqual(createFoldAdapter(f.engine).pending(current));
        expect(saved.committed).toEqual(f.state);
        expect(pending.display.sides[side].currentEnergy).toBe(6);
        expect(pending.display.instances[f.payer].zone).toBe("hand");
        expect(fold.reduce(saved, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
        expect(fold.reduce(saved, { kind: "answer", side: f.other, promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
        const invalid: Answer = [f.action.card];
        expect(fold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: invalid })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
        if (previous !== null) expect(fold.reduce(saved, { kind: "answer", side, promptId: previous, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
        const cancelled = applied(fold.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id }));
        expect(cancelled.committed).toEqual(f.state);
        const reopened = applied(fold.reduce(cancelled, { kind: "battleAction", side, action: f.action }));
        expect(fold.reduce(reopened, { kind: "answer", side, promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
        current = applied(fold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value })); previous = pending.prompt.id;
        expect(fold.reduce(current, { kind: "answer", side, promptId: pending.prompt.id, value }).kind).toBe("bounced");
      }
      const inline = f.engine.apply(f.state, side, f.action, new ScriptedSource(values(f, form, pays)));
      expect(stateHash(current.committed)).toBe(stateHash(inline.state));
      expect(current.inFlight).toBeNull();
      expect(inline.events.filter(e => e.kind === "energyChanged")).toHaveLength(1);
      expect(inline.events.filter(e => e.kind === "discarded")).toHaveLength(form === "discard" && pays ? 1 : 0);
    });

    it("rejects a target fingerprint from the opposite payment branch", () => {
      const f = fixture(form, side);
      const start = runStep(f.state, f.action, INTERACTIVE, f.engine.catalog);
      if (start.kind !== "suspended") throw new Error("Missing decision");
      const bindings = [{ fingerprint: promptFingerprint(start.prompt), value: false }];
      const targeting = runStep(f.state, f.action, INTERACTIVE, f.engine.catalog, { prefix: bindings });
      if (targeting.kind !== "suspended" || targeting.prompt.kind !== "chooseTargets") throw new Error("Missing target");
      const wrong = { fingerprint: promptFingerprint({ ...targeting.prompt, candidates: [f.wide] }), value: [f.wide] };
      const before = stateHash(f.state);
      expect(() => runStep(f.state, f.action, NO_PROMPTS, f.engine.catalog, { prefix: [...bindings, wrong], replay: true })).toThrow(ReplayDivergence);
      expect(stateHash(f.state)).toBe(before);
    });

    it("keeps payment unpublished when target preparation throws", () => {
      const f = fixture(form, side); let index = 0; const before = stateHash(f.state);
      expect(() => f.engine.apply(f.state, side, f.action, { answer() {
        if (index++ === 0) return true;
        if (form === "discard" && index === 2) return [f.payer];
        throw new Error("synthetic target failure");
      } })).toThrow("synthetic target failure");
      expect(stateHash(f.state)).toBe(before);
    });

    for (const pays of [true, false]) it(`rechecks live restrictions using retained paid=${pays} rather than later resources`, () => {
      const f = fixture(form, side); const target = form === "discard" && !pays ? f.wide : pays ? f.wide : f.narrow;
      if (form === "discard" && !pays) f.state.instances[target] = { ...f.state.instances[target], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 4 } } };
      const played = done(runStep(f.state, f.action, new ScriptedSource(values(f, form, pays, target)), f.engine.catalog));
      const changed = cloneState(played.state); changed.sides[side].currentEnergy = pays ? 0 : 100;
      if (form === "energy") changed.instances[target].status.gainedSpark = 8;
      else changed.instances[target] = { ...changed.instances[target], variant: { amplified: false } };
      const resolved = done(runStep(changed, { kind: "resolveTop" }, NO_PROMPTS, f.engine.catalog));
      expect(resolved.state.instances[target].zone).toBe(pays ? "void" : "play");
      expect(resolved.events.some(e => e.kind === "noLegalTarget")).toBe(!pays);
      expect(resolved.state.sides[side].currentEnergy).toBe(pays ? 0 : 100);
    });
  });
}

function custom(index: number, costs: readonly AdditionalCost[], effect: Parameters<typeof event>[0]): EngineCardDefinition {
  return { ...v.event1, id: syntheticId(0x47110 + index), status: "authored", abilities: () => [additionalCost(...costs), event(effect)] };
}
describe("prepared payment/target composition", () => {
  it("binds the exact optional index through modal eligibility before choosing one target", () => {
    const card = custom(0, [optionalCost(energy(1)), optionalCost(energy(2))], chooseOne(
      dissolve(targetWhen(costPaid(1), enemyCharacter(), enemyCharacter({ sparkAtMost: 0 }))), gainPoints(1)));
    const f = fixture("energy", "player", { definition: card, onlyWide: true });
    const answers = new Answers([false, true, 0, [f.wide]]);
    const result = f.engine.apply(f.state, "player", f.action, answers); answers.exhausted();
    expect(answers.prompts[2]).toMatchObject({ kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] });
    expect(result.state.sides.player.currentEnergy).toBe(3);
    expect(result.state.instances[f.wide].zone).toBe("void");
  });

  for (const side of ["player", "enemy"] as const) it(`${side} reserves an optional abandon payer before its own target`, () => {
    const card = custom(1, [optionalCost(abandonCost())], dissolve(targetWhen(costPaid(), characterYouControl(), characterYouControl({ sparkAtMost: 0 }))));
    const f = fixture("energy", side, { definition: card, own: true }); const [payer, target] = f.ids[side].back;
    const answers = new Answers([true, [payer!], [target!]]);
    const result = f.engine.apply(f.state, side, f.action, answers); answers.exhausted();
    expect(answers.prompts[2]).toMatchObject({ candidates: [target] });
    expect(isLegalAnswer(answers.prompts[2], [payer!])).toBe(false);
    expect(result.events.filter(e => e.kind === "abandoned").map(e => e.instance)).toEqual([payer]);
    expect(result.events.filter(e => e.kind === "dissolved").map(e => e.instance)).toEqual([payer, target]);
    const scarce = cloneState(f.state); scarce.sides[side].backRank[1] = null; delete scarce.instances[target!];
    expect(f.engine.legalActions(scarce, side)).not.toContainEqual(f.action);
  });

  it("shares mandatory captured spark and numeric X with the optional target decision", () => {
    const spec = targetWhen(costPaid(), enemyCharacter({ sparkAtMost: x() }), enemyCharacter({ sparkAtMost: 0 }));
    const card = { ...custom(2, [abandonSparkCapture(), optionalCost(energy(1))], dissolve(spec)), costs: [energy(1), energyX(0)] };
    const f = fixture("energy", "player", { definition: card, own: true });
    const answers = new Answers([2, [f.ids.player.back[1]!], true, [f.ids.enemy.back[1]!]]);
    const result = f.engine.apply(f.state, "player", f.action, answers); answers.exhausted();
    expect(result.state.sides.player.currentEnergy).toBe(2);
    expect(result.events.filter(e => e.kind === "abandoned")).toHaveLength(1);
    expect(answers.prompts[answers.prompts.length - 1]).toMatchObject({ candidates: f.ids.enemy.back.slice(0, 2) });
  });

  it("combines a modified aggregate energy cost and explicit Reclaim with the payment decision", () => {
    const base = definitions.energy;
    const card: EngineCardDefinition = { ...base, id: syntheticId(0x47120), abilities: variant => [reclaim(energy(2)), ...base.abilities(variant)] };
    const discount: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x47121), abilities: () => [staticAbility(costModifier("you", { cardType: "event" }, -2))] };
    const engine = createEngine(testCatalog([card, discount]));
    const f = boardState(engine.catalog, { active: "player", phase: "day", player: { void: [card.id], back: [discount.id], energy: 3, deck }, enemy: { back: [v.vanilla5.id], deck } });
    const played = done(runStep({ ...f.state, config: { ...f.state.config, autoAnswerForcedPrompts: false } }, { kind: "play", card: f.ids.player.void[0], from: "void" }, new ScriptedSource([true, [f.ids.enemy.back[0]!]]), engine.catalog));
    expect(played.state.sides.player.currentEnergy).toBe(0);
    expect(playedItem(played.state)).toMatchObject({ optionalPaid: [true] });
    expect(played.state.instances[f.ids.player.void[0]].status.reclaimed).toBe(true);
  });

  it("keeps Offering's printed energy X at zero while paying an optional energy cost", () => {
    const base = definitions.energy;
    const card: EngineCardDefinition = { ...base, id: syntheticId(0x47122), costs: [energy(1), energyX(0)], abilities: variant => [keyword("offering"), ...base.abilities(variant)] };
    const f = fixture("energy", "player", { definition: card });
    const answers = new Answers([1, [f.payer], true, [f.wide]]);
    const played = done(runStep(f.state, f.action, answers, f.engine.catalog)); answers.exhausted();
    expect(played.state.sides.player.currentEnergy).toBe(3);
    expect(playedItem(played.state)).toMatchObject({ x: 0, optionalPaid: [true] });
    expect(played.state.instances[f.payer].zone).toBe("banished");
  });

  for (const side of ["player", "enemy"] as const) for (const form of ["energy", "discard"] as const) for (const speed of ["fast", "interrupt"] as const) {
    const card: EngineCardDefinition = { ...definitions[form], speed };
    it(`${side} ${form} ${speed} uses normal Fast windows`, () => {
      const f = fixture(form, side, { definition: card });
      expect(f.engine.legalActions(f.state, side)).toContainEqual(f.action);
      const night = passUntil(f.engine, f.state, at(f.engine, side, "night")).state;
      expect(f.engine.legalActions(night, side)).toContainEqual(f.action);
      const dusk = passUntil(f.engine, night, at(f.engine, f.other, "dusk")).state;
      expect(f.engine.legalActions(dusk, side)).toContainEqual(f.action);
    });
    for (const pays of [true, false]) it(`${side} ${form} ${speed} paid=${pays} answers an actual opponent play`, () => {
      const engine = createEngine(testCatalog([card])); const other = opponent(side);
      const f = boardState(engine.catalog, { active: other, phase: "day",
        [side]: { hand: [card.id, v.event0.id, v.interruptEvent.id], energy: 6, deck },
        [other]: { hand: [v.event1.id, v.interruptEvent.id], back: [v.vanilla1.id, v.vanilla2.id, v.vanilla5.id], energy: 6, deck } });
      const start = { ...f.state, config: { ...f.state.config, autoAnswerForcedPrompts: false } };
      const opened = engine.apply(start, other, { kind: "play", card: f.ids[other].hand[0], from: "hand" }, NO_PROMPTS);
      expect(opened.events.filter(e => e.kind === "cardPlayed")).toMatchObject([{ instance: f.ids[other].hand[0], side: other }]);
      expect(opened.state.stack).toMatchObject([{ kind: "card", instance: f.ids[other].hand[0], controller: other }]);
      expect(engine.decision(opened.state)?.side).toBe(side);
      const action = { kind: "play", card: f.ids[side].hand[0], from: "hand" } as const;
      if (speed === "fast") {
        const before = stateHash(opened.state);
        expect(engine.legalActions(opened.state, side)).not.toContainEqual(action);
        expect(() => engine.apply(opened.state, side, action, NO_PROMPTS)).toThrow();
        expect(stateHash(opened.state)).toBe(before); return;
      }
      expect(engine.legalActions(opened.state, side)).toContainEqual(action);
      const target = f.ids[other].back[pays ? 2 : 0]!;
      const answers = new Answers([pays, ...(pays && form === "discard" ? [[f.ids[side].hand[1]]] : []), [target]]);
      const response = engine.apply(opened.state, side, action, answers); answers.exhausted();
      expect(response.state.stack).toHaveLength(2);
      expect(response.state.stack[1]).toMatchObject({ instance: action.card, optionalPaid: [pays], choices: [{ targets: [[target]] }] });
      expect(answers.prompts[answers.prompts.length - 1]).toMatchObject({ candidates: pays ? f.ids[other].back : f.ids[other].back.slice(0, 2) });
      expect(response.state.sides[side].currentEnergy).toBe(form === "energy" && pays ? 2 : 5);
      expect(response.events.filter(e => e.kind === "discarded")).toHaveLength(form === "discard" && pays ? 1 : 0);
      const resolved = passUntil(engine, response.state, state => state.stack.length === 0).state;
      expect(resolved.instances[target].zone).toBe("void");
      expect(resolved.instances[f.ids[other].hand[0]].zone).toBe("void");
      expect(invariantViolations(resolved, engine.catalog)).toEqual([]);
    });
  }

  for (const side of ["player", "enemy"] as const) for (const form of ["energy", "discard"] as const) for (const pays of [true, false]) it(`${side} activation ${form} paid=${pays} selects before debit`, () => {
    const optional = form === "energy" ? energy(3) : discardCost();
    const card: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x47124), status: "authored", abilities: () => [activated([energy(1), optionalCost(optional)], dissolve(targetWhen(costPaid(), enemyCharacter(), enemyCharacter({ sparkAtMost: 2 }))), { oncePerTurn: true })] };
    const engine = createEngine(testCatalog([card])); const other = opponent(side);
    const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id], hand: [v.event0.id], energy: 6, deck }, [other]: { back: [v.vanilla1.id, v.vanilla5.id], deck } });
    const state = { ...f.state, config: { ...f.state.config, autoAnswerForcedPrompts: false } };
    const target = f.ids[other].back[pays ? 1 : 0]!;
    const result = done(runStep(state, { kind: "activate", source: f.ids[side].back[0]!, ability: 0 }, new ScriptedSource([pays, ...(form === "discard" && pays ? [[f.ids[side].hand[0]]] : []), [target]]), engine.catalog));
    expect(result.state.stack[0]).toMatchObject({ kind: "ability", optionalPaid: [pays], choices: { targets: [[target]] } });
    expect(result.state.sides[side].currentEnergy).toBe(form === "energy" && pays ? 2 : 5);
    expect(result.state.oncePerTurn).toHaveLength(1);
  });
});

for (const side of ["player", "enemy"] as const) for (const form of ["energy", "discard"] as const) for (const pays of [true, false]) it(`${side} copy ${form} retains paid=${pays} and retargets without repayment`, () => {
  const f = fixture(form, side, { echo: ZONE.echo });
  const copiedTarget = pays ? f.wide : f.ids[f.other].back[1]!;
  const answers = new Answers([...values(f, form, pays), [copiedTarget]]);
  let copy: CardStackItem | null = null;
  const result = f.engine.apply(f.state, side, f.action, answers, (state, _step, events) => {
    const event = events.find(e => e.kind === "cardCopied");
    if (event?.kind !== "cardCopied") return;
    const item = state.stack.find(item => item.kind === "card" && item.instance === event.copy);
    if (item?.kind === "card") copy = item;
  }); answers.exhausted();
  expect(copy).toMatchObject({ optionalPaid: [pays], x: null, choices: [{ targets: [[copiedTarget]] }] });
  expect(answers.prompts[answers.prompts.length - 1]).toMatchObject({ kind: "chooseTargets", candidates: pays ? f.ids[f.other].back : f.ids[f.other].back.slice(0, 2) });
  expect(result.state.sides[side].currentEnergy).toBe(form === "energy" && pays ? 2 : 5);
  expect(result.events.filter(e => e.kind === "discarded")).toHaveLength(form === "discard" && pays ? 1 : 0);
  expect(result.events.filter(e => e.kind === "energyChanged")).toHaveLength(1);
  expect(result.events.filter(e => e.kind === "cardPlayed")).toHaveLength(1);
  expect(result.events.filter(e => e.kind === "cardCopied")).toHaveLength(1);

});

for (const side of ["player", "enemy"] as const) for (const form of ["energy", "discard"] as const) for (const pays of [true, false]) it(`${side} copy ${form} paid=${pays} keeps its original target when retargeting has no legal option`, () => {
  const echo: EngineCardDefinition = { ...ZONE.echo, id: syntheticId(0x47132), abilities: () => [triggered(whenYouPlay({ cardType: "event" }), sequence(
    banish(all(enemyCharacter())), copyCard(triggeringCard()),
  ))] };
  const f = fixture(form, side, { echo }); const selected = pays ? f.wide : f.narrow;
  const answers = new Answers(values(f, form, pays)); let copy: CardStackItem | null = null;
  const result = f.engine.apply(f.state, side, f.action, answers, (state, _step, events) => {
    const copied = events.find(e => e.kind === "cardCopied");
    if (copied?.kind !== "cardCopied") return;
    const item = state.stack.find(item => item.kind === "card" && item.instance === copied.copy);
    if (item?.kind === "card") copy = item;
  }); answers.exhausted();
  expect(copy).toMatchObject({ optionalPaid: [pays], choices: [{ targets: [[selected]] }] });
  expect(answers.prompts.filter(p => p.kind === "chooseTargets")).toHaveLength(1);
  expect(result.events.filter(e => e.kind === "noLegalTarget")).toHaveLength(2);
  expect(result.state.instances[selected].zone).toBe("banished");
});

for (const side of ["player", "enemy"] as const) for (const form of ["energy", "discard"] as const) it(`${side} ${form} paid targets still recheck their current controller`, () => {
  const f = fixture(form, side);
  const played = done(runStep(f.state, f.action, new ScriptedSource(values(f, form, true)), f.engine.catalog));
  const changed = cloneState(played.state); const index = changed.sides[f.other].backRank.indexOf(f.wide);
  changed.sides[f.other].backRank[index] = null; changed.sides[side].backRank[0] = f.wide;
  changed.instances[f.wide].controller = side;
  const resolved = done(runStep(changed, { kind: "resolveTop" }, NO_PROMPTS, f.engine.catalog));
  expect(resolved.state.instances[f.wide].zone).toBe("play");
  expect(resolved.events.some(e => e.kind === "noLegalTarget")).toBe(true);
});

it("rolls back partial payment writes after a prepared optional decision commits and then throws", () => {
  const costs: Cost[] = [energy(1), optionalCost(discardCost())];
  const card: EngineCardDefinition = { ...v.event0, id: syntheticId(0x47131), status: "authored", abilities: () => [], synthetic: { play(ctx, source) {
    const purpose = (role: Prompt["purpose"]["role"]) => ({ source, cardId: syntheticId(0x47131), ability: 0, role });
    const plan = planCosts(ctx, "player", source, costs, null, purpose, [source]);
    ctx.commitPoint(); payCosts(ctx, "player", source, plan); throw new Error("synthetic optional payment failure");
  } } };
  const f = fixture("discard", "player", { definition: card }); const fold = createFoldAdapter(f.engine);
  let current = applied(fold.reduce(slice(f.state), { kind: "battleAction", side: "player", action: f.action }));
  current = applied(fold.reduce(current, { kind: "answer", side: "player", promptId: fold.pending(current)!.prompt.id, value: true }));
  const outcome = fold.reduce(current, { kind: "answer", side: "player", promptId: fold.pending(current)!.prompt.id, value: [f.payer] });
  if (outcome.kind !== "applied") throw new Error("Expected contained failure");
  expect(outcome.error).not.toBeNull(); expect(outcome.slice.committed).toEqual(f.state);
  expect(outcome.published.some(e => e.kind === "energyChanged" || e.kind === "discarded")).toBe(false);
});

function deferred(form: Form) {
  return custom(form === "energy" ? 3 : 4, [optionalCost(form === "energy" ? energy(3) : discardCost())], choosePlayer(() => dissolve(
    targetWhen(costPaid(), enemyCharacter(), enemyCharacter(form === "energy" ? { sparkAtMost: 2 } : { costAtMost: 2 })),
  )));
}
for (const side of ["player", "enemy"] as const) for (const form of ["energy", "discard"] as const) for (const pays of [true, false]) {
  it(`${side} deferred ${form} paid=${pays} chooses its payment-dependent target only during resolution`, () => {
    const f = fixture(form, side, { definition: deferred(form) });
    const payment = new Answers(values(f, form, pays).slice(0, -1));
    const played = done(runStep(f.state, f.action, payment, f.engine.catalog)); payment.exhausted();
    expect(payment.prompts.some(p => p.kind === "chooseTargets" || p.purpose.role === "choosePlayer")).toBe(false);
    expect(playedItem(played.state)).toMatchObject({ optionalPaid: [pays], choices: [{ targets: [] }] });
    const target = pays ? f.wide : f.narrow; const answers = new Answers([0, [target]]);
    const resolved = done(runStep(played.state, { kind: "resolveTop" }, answers, f.engine.catalog)); answers.exhausted();
    expect(answers.prompts.map(p => p.purpose.role)).toEqual(["choosePlayer", "target"]);
    expect(answers.prompts[1]).toMatchObject({ candidates: pays ? f.ids[f.other].back : f.ids[f.other].back.slice(0, 2), min: 1, max: 1, cancellable: false });
    expect(resolved.state.instances[target].zone).toBe("void");
    expect(resolved.state.sides[side].currentEnergy).toBe(form === "energy" && pays ? 2 : 5);
    expect(resolved.events.some(e => e.kind === "energyChanged" || e.kind === "discarded")).toBe(false);
    expect(invariantViolations(resolved.state, f.engine.catalog)).toEqual([]);
  });

  it(`${side} deferred ${form} paid=${pays} replays resolution prefixes and contains invalid, competing and failed answers`, () => {
    const f = fixture(form, side, { definition: deferred(form) }); let fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    let current = applied(fold.reduce(slice(f.state), { kind: "battleAction", side, action: f.action }));
    let previous: PromptId | null = null;
    for (const value of [...values(f, form, pays).slice(0, -1), 0, [pays ? f.wide : f.narrow]] as Answer[]) {
      const saved = JSON.parse(JSON.stringify(current)) as BattleSlice;
      fold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
      const pending = fold.pending(saved)!;
      expect(pending).toEqual(createFoldAdapter(f.engine).pending(current));
      expect(fold.reduce(saved, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      expect(fold.reduce(saved, { kind: "answer", side: f.other, promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      expect(fold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: [f.action.card] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      if (previous !== null) expect(fold.reduce(saved, { kind: "answer", side, promptId: previous, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      if (pending.prompt.purpose.role === "choosePlayer" || pending.prompt.purpose.role === "target") {
        expect(playedItem(saved.committed).optionalPaid).toEqual([pays]);
        expect(saved.committed.sides[side].currentEnergy).toBe(form === "energy" && pays ? 2 : 5);
        expect(fold.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
      }
      current = applied(fold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value })); previous = pending.prompt.id;
    }
    const inline = f.engine.apply(f.state, side, f.action, new ScriptedSource([...values(f, form, pays).slice(0, -1), 0, [pays ? f.wide : f.narrow]]));
    expect(stateHash(current.committed)).toBe(stateHash(inline.state)); expect(current.inFlight).toBeNull();
    const played = done(runStep(f.state, f.action, new ScriptedSource(values(f, form, pays).slice(0, -1)), f.engine.catalog));
    const before = stateHash(played.state); let count = 0;
    expect(() => runStep(played.state, { kind: "resolveTop" }, { answer() { if (count++ === 0) return 0; throw new Error("synthetic deferred target failure"); } }, f.engine.catalog)).toThrow("synthetic deferred target failure");
    expect(stateHash(played.state)).toBe(before); expect(played.state.instances[pays ? f.wide : f.narrow].zone).toBe("play");
  });

  it(`${side} triggered ${form} source paid=${pays} uses the trigger's empty optional payment context`, () => {
    const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x47115), status: "authored", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), choosePlayer(() => dissolve(
      targetWhen(costPaid(), enemyCharacter(), enemyCharacter(form === "energy" ? { sparkAtMost: 2 } : { costAtMost: 2 })),
    )))] };
    const f = fixture(form, side, { echo: watcher });
    const played = done(runStep(f.state, f.action, new ScriptedSource(values(f, form, pays)), f.engine.catalog));
    expect(playedItem(played.state).optionalPaid).toEqual([pays]); expect(played.state.triggerQueue).toHaveLength(1);
    const chosen = f.ids[f.other].back[1]!; const answers = new Answers([0, [chosen]]);
    const resolved = done(runStep(played.state, { kind: "resolveTrigger" }, answers, f.engine.catalog)); answers.exhausted();
    expect(answers.prompts.map(p => p.purpose.role)).toEqual(["choosePlayer", "target"]);
    expect(answers.prompts[1]).toMatchObject({ candidates: f.ids[f.other].back.slice(0, 2) });
    expect(resolved.state.instances[chosen].zone).toBe("void"); expect(resolved.state.instances[f.wide].zone).toBe("play");
    expect(resolved.events.filter(e => e.kind === "triggerResolved")).toMatchObject([{ applied: true, controller: side }]);
    expect(playedItem(resolved.state).optionalPaid).toEqual([pays]);
    expect(resolved.events.some(e => e.kind === "energyChanged" || e.kind === "discarded")).toBe(false);
  });
}
