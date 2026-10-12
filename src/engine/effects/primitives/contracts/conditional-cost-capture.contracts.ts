/** Conditional activation targets bind mandatory captured X before physical choices. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCostCapture, activated, characterYouControl, controls, discardCostFilter, energy, energyX, enemyCharacter, target, targetWhen, x } from "../../../dsl/builders";
import type { CharacterSelector } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { isLegalAnswer } from "../../../prompts/answers";
import { promptFingerprint } from "../../../prompts/fingerprint";
import type { Answer, Prompt, PromptId } from "../../../prompts/types";
import { effectiveSpark } from "../../../rules/spark";
import { stateHash } from "../../../state/hash";
import { opponent, type Side } from "../../../state/ids";
import { ReplayDivergence } from "../../../steps/errors";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { invariantViolations } from "../../../testing/invariants";
import { boardState } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";

type Form = "abandon" | "discard" | "count";
type Field = "alternate" | "controls" | "ordinary" | "targetless";
const mage: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x56401), subtype: "Mage" };
function fixture(form: Form, field: Field, side: Side, options: { stored?: boolean; ownTarget?: boolean; departingMage?: boolean } = {}) {
  const condition = field === "alternate" ? controls(characterYouControl({ subtype: "Survivor" }))
    : controls(characterYouControl({ subtype: "Mage", costAtLeast: x(), costAtMost: x() }));
  const selector = (bounds: Omit<CharacterSelector, "controller">): CharacterSelector => options.ownTarget ? characterYouControl(bounds) : enemyCharacter(bounds);
  const exact = selector({ sparkAtLeast: x(), sparkAtMost: x() });
  const spec = field === "alternate" ? targetWhen(condition, selector({ sparkAtLeast: 1, sparkAtMost: 1 }), exact)
    : field === "ordinary" ? target(exact) : targetWhen(condition, selector({ sparkAtLeast: 2, sparkAtMost: 2 }), selector({ sparkAtLeast: 1, sparkAtMost: 1 }));
  const cost = form === "abandon" ? abandonCostCapture({ subtype: options.departingMage ? "Mage" : "Warrior" })
    : discardCostFilter({}, form === "count" ? { count: "x", min: 1 } : { captureCost: true });
  const definition: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x56402), status: "authored", costs: [energyX(0)],
    abilities: () => [activated([energy(1), cost], field === "targetless" ? gainPoints(x()) : options.ownTarget ? gainSpark(spec, 1) : dissolve(spec))] };
  const engine = createEngine(testCatalog([definition, mage]));
  const other = opponent(side);
  const board = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { back: [mage.id, v.vanilla2.id, v.vanilla2.id], hand: [definition.id, v.vanilla2.id, v.vanilla3.id], energy: 9 },
    [other]: { back: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] } });
  const source = board.ids[side].hand[0];
  const playedX = new ScriptedSource([options.stored ? 3 : 0]);
  const played = engine.apply(board.state, side, { kind: "play", card: source, from: "hand" }, playedX);
  playedX.assertExhausted();
  const state = { ...played.state, config: { ...played.state.config, autoAnswerForcedPrompts: false } };
  const payment = form === "abandon" ? [board.ids[side].back[options.departingMage ? 0 : 1]!]
    : form === "count" ? board.ids[side].hand.slice(1) : [board.ids[side].hand[1]];
  const selected = options.ownTarget ? board.ids[side].back[2]! : board.ids[other].back[1]!;
  const action = { kind: "activate", source, ability: 0 } as const;
  const values: Answer[] = field === "targetless" ? [payment] : [...(form === "count" ? [2] : [payment]), [selected], ...(form === "count" ? [payment] : [])];
  return { engine, state, ids: board.ids, side, other, source, payment, selected, action, values };
}
function slice(committed: BattleSlice["committed"]): BattleSlice { return { committed, inFlight: null, publishedEvents: 0, attempt: 0 }; }
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected intent outcome ${JSON.stringify(outcome)}`);
  return outcome;
}
function open(f: ReturnType<typeof fixture>, fold = createFoldAdapter(f.engine, { checkEventPrefix: true })) {
  return { fold, opened: applied(fold.reduce(slice(f.state), { kind: "battleAction", side: f.side, action: f.action })) };
}
function answer(fold: ReturnType<typeof createFoldAdapter>, current: BattleSlice, side: Side, value: Answer) {
  const pending = fold.pending(current);
  if (pending === null) throw new Error("Missing public prompt");
  return applied(fold.reduce(current, { kind: "answer", side, promptId: pending.prompt.id, value }));
}

for (const side of ["player", "enemy"] as const) describe(`${side} conditional captured X`, () => {
  for (const form of ["abandon", "discard", "count"] as const) for (const field of ["alternate", "controls"] as const) {
    it(`${form} ${field} binds the payment amount independently of actually played source X`, () => {
      for (const stored of [false, true]) {
        const f = fixture(form, field, side, { stored });
        expect(f.state.instances[f.source].status.x).toBe(stored ? 3 : 0);
        expect(f.engine.legalActions(f.state, side)).toContainEqual(f.action);
        const { fold, opened } = open(f);
        const first = fold.pending(opened.slice)!.prompt;
        expect(first.kind).toBe(form === "count" ? "chooseNumber" : "chooseCards");
        const bound = answer(fold, opened.slice, side, f.values[0]);
        const targetPrompt = fold.pending(bound.slice)!.prompt;
        expect(targetPrompt).toMatchObject({ kind: "chooseTargets", candidates: [f.selected] });
        expect(bound.slice.committed).toEqual(f.state);
        expect(fold.pending(bound.slice)!.display.sides[side].currentEnergy).toBe(f.state.sides[side].currentEnergy);
        expect(f.payment.map(id => fold.pending(bound.slice)!.display.instances[id].zone)).toEqual(f.payment.map(() => form === "abandon" ? "play" : "hand"));
        expect([...opened.published, ...bound.published].filter(e => e.kind === "energyChanged" || e.kind === "abandoned" || e.kind === "discarded")).toEqual([]);
        let done = answer(fold, bound.slice, side, [f.selected]);
        if (form === "count") done = answer(fold, done.slice, side, f.payment);
        expect(fold.pending(done.slice)).toBeNull();
        expect(done.slice.committed.instances[f.selected].zone).toBe("void");
        expect(f.payment.map(id => done.slice.committed.instances[id].zone)).toEqual(f.payment.map(() => "void"));
        expect(done.slice.committed.sides[side].currentEnergy).toBe(f.state.sides[side].currentEnergy - 1);
        expect(done.slice.committed.instances[f.source].status.x).toBe(stored ? 3 : 0);
        expect(done.published.filter(e => e.kind === "abilityActivated")).toHaveLength(1);
        expect(done.published.filter(e => e.kind === "noLegalTarget")).toEqual([]);
        expect(invariantViolations(done.slice.committed, f.engine.catalog)).toEqual([]);
      }
    });

    it(`${form} ${field} reloads every prefix, cancels and rejects competing or stale input`, () => {
      const f = fixture(form, field, side, { stored: true });
      const { fold, opened } = open(f);
      let current = opened.slice;
      let firstId: PromptId | null = null;
      for (const value of f.values) {
        const saved = JSON.parse(JSON.stringify(current)) as BattleSlice;
        const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
        const pending = cold.pending(saved)!;
        expect(pending).toEqual(fold.pending(current));
        expect(saved.committed).toEqual(f.state);
        const intent = { kind: "answer" as const, side, promptId: pending.prompt.id, value };
        expect(cold.reduce(saved, { ...intent, side: f.other })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
        expect(cold.reduce(saved, { ...intent, value: pending.prompt.kind === "chooseNumber" ? 99 : [f.ids[f.other].back[2]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
        expect(cold.reduce(saved, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
        if (firstId !== null) expect(cold.reduce(saved, { ...intent, promptId: firstId })).toEqual({ kind: "bounced", reason: "stalePrompt" });
        else firstId = pending.prompt.id;
        const cancelled = applied(cold.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id }));
        expect(cancelled.slice.committed).toEqual(f.state);
        expect(cancelled.published).toEqual([]);
        const reopened = applied(cold.reduce(cancelled.slice, { kind: "battleAction", side, action: f.action }));
        expect(cold.reduce(reopened.slice, intent)).toEqual({ kind: "bounced", reason: "stalePrompt" });
        current = applied(cold.reduce(saved, intent)).slice;
        expect(cold.reduce(current, intent).kind).toBe("bounced");
      }
      const scripted = new ScriptedSource(f.values);
      const direct = f.engine.apply(f.state, side, f.action, scripted);
      scripted.assertExhausted();
      expect(stateHash(current.committed)).toBe(stateHash(direct.state));
      expect(direct.events.filter(e => e.kind === "abandoned" || e.kind === "discarded")).toHaveLength(f.payment.length);
      expect(direct.events.filter(e => e.kind === "energyChanged")).toHaveLength(1);
    });
  }

  it("excludes the captured abandonment card from physical targets", () => {
    const f = fixture("abandon", "alternate", side, { stored: true, ownTarget: true });
    const { fold, opened } = open(f);
    const bound = answer(fold, opened.slice, side, f.payment);
    const prompt = fold.pending(bound.slice)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseTargets" });
    if (prompt.kind !== "chooseTargets") throw new Error("Missing physical targets");
    expect(prompt.candidates).toContain(f.selected);
    expect(isLegalAnswer(prompt, f.payment)).toBe(false);
    const done = answer(fold, bound.slice, side, [f.selected]);
    expect(done.slice.committed.instances[f.payment[0]].zone).toBe("void");
    expect(effectiveSpark(done.slice.committed, f.engine.catalog, f.selected)).toBe(3);
  });

  it("rechecks the X-dependent controls condition after the matching Mage pays", () => {
    const f = fixture("abandon", "controls", side, { stored: true, departingMage: true });
    const { fold, opened } = open(f);
    const bound = answer(fold, opened.slice, side, f.payment);
    expect(fold.pending(bound.slice)!.prompt).toMatchObject({ kind: "chooseTargets", candidates: [f.selected] });
    const done = answer(fold, bound.slice, side, [f.selected]);
    expect(done.slice.committed.instances[f.payment[0]].zone).toBe("void");
    expect(done.slice.committed.instances[f.selected].zone).toBe("play");
    expect(done.published.filter(e => e.kind === "noLegalTarget")).toEqual([{ kind: "noLegalTarget", source: f.source }]);
  });

  it("preserves ordinary targeted and targetless capture protocols", () => {
    for (const form of ["abandon", "discard", "count"] as const) for (const field of ["ordinary", "targetless"] as const) {
      const f = fixture(form, field, side, { stored: true });
      const prompts: Prompt[] = [];
      let index = 0;
      const done = f.engine.apply(f.state, side, f.action, { answer(prompt) { prompts.push(prompt); return f.values[index++]; } });
      expect(index).toBe(f.values.length);
      expect(prompts.map(p => p.kind)).toEqual(field === "targetless" ? ["chooseCards"] : form === "count" ? ["chooseNumber", "chooseTargets", "chooseCards"] : ["chooseCards", "chooseTargets"]);
      expect(done.state.sides[side].score).toBe(field === "targetless" ? 2 : 0);
      expect(done.state.instances[f.selected].zone).toBe(field === "ordinary" ? "void" : "play");
    }
  });

  it("keeps committed state intact on target preparation errors and divergent replay", () => {
    for (const field of ["alternate", "controls"] as const) {
      const f = fixture("discard", field, side, { stored: true });
      const before = stateHash(f.state);
      let index = 0;
      expect(() => f.engine.apply(f.state, side, f.action, { answer() { if (index++ === 0) return f.payment; throw new Error("synthetic preparation failure"); } })).toThrow("synthetic preparation failure");
      expect(stateHash(f.state)).toBe(before);
      const first = runStep(f.state, f.action, INTERACTIVE, f.engine.catalog);
      if (first.kind !== "suspended") throw new Error("Missing cost capture");
      expect(first.prompt.kind).toBe("chooseCards");
      const binding = { fingerprint: promptFingerprint(first.prompt), value: f.payment };
      const targeting = runStep(f.state, f.action, INTERACTIVE, f.engine.catalog, { prefix: [binding] });
      if (targeting.kind !== "suspended" || targeting.prompt.kind !== "chooseTargets") throw new Error("Missing target prompt");
      const wrong = { fingerprint: promptFingerprint({ ...targeting.prompt, candidates: [f.ids[f.other].back[2]!] }), value: [f.ids[f.other].back[2]!] };
      expect(() => runStep(f.state, f.action, NO_PROMPTS, f.engine.catalog, { prefix: [binding, wrong], replay: true })).toThrow(ReplayDivergence);
      expect(stateHash(f.state)).toBe(before);
    }
  });
});
