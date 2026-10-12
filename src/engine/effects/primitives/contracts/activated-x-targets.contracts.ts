import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, activated, all, anyCharacter, energy, energyX, enemyCharacter, event, fromVoid, supported, target, x } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import type { Answer, Prompt } from "../../../prompts/types";
import { hasKeyword } from "../../../rules/keywords";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ReplayDivergence } from "../../../steps/errors";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { dissolve } from "../dissolve";
import { gainEnergy } from "../gain-energy";
import { gainSpark } from "../gain-spark";
import { grantReclaim } from "../grant-reclaim";

const exactX = enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() });
const payer: EngineCardDefinition = {
  id: syntheticId(0x6900), cardType: "character", costs: [], spark: 1, subtype: "Mage", speed: "standard", status: "authored",
  abilities: () => [activated([energyX(0)], dissolve(target(exactX)))],
};
const costSelector: EngineCardDefinition = {
  ...payer, id: syntheticId(0x6901),
  abilities: () => [activated([energyX(0), abandonCost({ another: true, sparkAtLeast: x(), sparkAtMost: x() })], gainEnergy(1))],
};
const inheritedTarget: EngineCardDefinition = { ...payer, id: syntheticId(0x6902), abilities: () => [activated([energy(1)], dissolve(target(exactX)))] };
const inheritedCost: EngineCardDefinition = { ...costSelector, id: syntheticId(0x6903), abilities: () => [activated([energy(1), abandonCost({ another: true, sparkAtLeast: x(), sparkAtMost: x() })], gainEnergy(1))] };
const interrupt: EngineCardDefinition = {
  ...v.interruptEvent, id: syntheticId(0x6904), status: "authored",
  abilities: () => [event(gainSpark(target(anyCharacter()), 1))],
};
const voidZero: EngineCardDefinition = { ...v.event0, id: syntheticId(0x6907) };
const voidTwo: EngineCardDefinition = { ...v.event1, id: syntheticId(0x6905), costs: [energy(2)] };
const voidThree: EngineCardDefinition = { ...v.event1, id: syntheticId(0x6906), costs: [energy(3)] };
const engine = createEngine(testCatalog([payer, costSelector, inheritedTarget, inheritedCost, interrupt, voidTwo, voidThree]));
const deck = Array.from({ length: 4 }, () => v.vanilla1.id);
function fixture(card = payer, side: Side = "player", responding = false) {
  const other: Side = side === "player" ? "enemy" : "player";
  const { state: placed, ids } = boardState(engine.catalog, {
    active: side, phase: "day",
    [side]: { back: [card.id, v.vanilla0.id, v.vanilla2.id, v.vanilla3.id], energy: 5, deck },
    [other]: { back: [v.vanilla0.id, v.vanilla2.id, v.vanilla3.id], hand: responding ? [interrupt.id] : [], energy: 2, deck },
  });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const source = ids[side].back[0];
  if (source === null) throw new Error("Missing activated source");
  state.instances[source].status.x = 3;

  return { state, ids, source, other, side, action: { kind: "activate", source, ability: 0 } as const };
}
function instance(id: InstanceId | null): InstanceId {
  if (id === null) throw new Error("Missing fixture instance");
  return id;
}
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly values: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.values[this.next++];
    if (value === undefined) throw new Error(`Missing ${prompt.kind} answer`);
    return value;
  }
  exhausted(): void { expect(this.next).toBe(this.values.length); }
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful activation intent");
  return outcome.slice;
}
function slice(committed: BattleState): BattleSlice { return { committed, inFlight: null, publishedEvents: 0, attempt: 0 }; }

describe("activated chosen X contracts", () => {
  for (const side of ["player", "enemy"] as const) {
    for (const chosen of [0, 2]) it(`${side} targets and resolves against newly chosen X=${String(chosen)}, preserving stored source X=3`, () => {
      const f = fixture(payer, side);
      const selected = instance(f.ids[f.other].back[chosen === 0 ? 0 : 1]);
      const answers = new Answers([chosen, [selected]]);
      const result = engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts[1]).toMatchObject({ kind: "chooseTargets", candidates: [selected] });
      expect(result.state.sides[side].currentEnergy).toBe(5 - chosen);
      expect(result.state.instances[f.source].status.x).toBe(3);
      expect(result.state.instances[selected].zone).toBe("void");
      expect(result.state.instances[instance(f.ids[f.other].back[2])].zone).toBe("play");
      expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(false);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    });

    it(`${side} offers an activation with an affordable exact-X target even when no target matches stored source X`, () => {
      const f = fixture(payer, side);
      const storedMatch = instance(f.ids[f.other].back[2]);
      f.state.instances[storedMatch].status.gainedSpark = 1;
      expect(engine.legalActions(f.state, side)).toContainEqual(f.action);
      const targetId = instance(f.ids[f.other].back[1]);
      const result = engine.apply(f.state, side, f.action, new ScriptedSource([2, [targetId]]));
      expect(result.state.instances[targetId].zone).toBe("void");
    });

    it(`${side} prepares selected payment bounds with chosen X rather than stored source X`, () => {
      const f = fixture(costSelector, side);
      const selected = instance(f.ids[side].back[2]);
      const answers = new Answers([2, [selected]]);
      const result = engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts[1]).toMatchObject({ kind: "chooseCards", candidates: [selected] });
      expect(result.state.instances[selected].zone).toBe("void");
      expect(result.state.instances[instance(f.ids[side].back[3])].zone).toBe("play");
      expect(result.state.sides[side].currentEnergy).toBe(4);
    });

    it(`${side} retains stored-X fallback for ordinary non-X target and cost preparation`, () => {
      for (const card of [inheritedTarget, inheritedCost]) {
        const f = fixture(card, side);
        const selected = instance(f.ids[card === inheritedTarget ? f.other : side].back[card === inheritedTarget ? 2 : 3]);
        const answers = new Answers([[selected]]);
        const result = engine.apply(f.state, side, f.action, answers);
        answers.exhausted();
        expect(answers.prompts).toHaveLength(1);
        expect(answers.prompts[0]).toMatchObject({ candidates: [selected] });
        expect(result.state.instances[selected].zone).toBe("void");
        expect(result.state.instances[f.source].status.x).toBe(3);
      }
    });
  }

  it("revalidates a chosen-X target after an actual Interrupt changes its spark, retaining the paid energy", () => {
    const f = fixture(payer, "player", true);
    const selected = instance(f.ids.enemy.back[1]);
    const activated = engine.apply(f.state, "player", f.action, new ScriptedSource([2, [selected]]));
    expect(activated.state.stack).toHaveLength(1);
    expect(activated.state.sides.player.currentEnergy).toBe(3);
    const response = engine.apply(activated.state, "enemy", { kind: "play", card: f.ids.enemy.hand[0], from: "hand" }, new ScriptedSource([[selected]]));
    expect(response.events.some(event => event.kind === "noLegalTarget")).toBe(true);
    expect(response.state.instances[selected].zone).toBe("play");
    expect(response.state.sides.player.currentEnergy).toBe(3);
    expect(response.state.stack).toEqual([]);
    expect(invariantViolations(response.state, engine.catalog)).toEqual([]);
  });

  it("reloads a raw chosen-X prefix before targeting, cancels without debit, rejects stale/wrong actors and commits once", () => {
    const f = fixture();
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const waiting = applied(fold.reduce(slice(f.state), { kind: "battleAction", side: "player", action: f.action }));
    const number = fold.pending(waiting)?.prompt;
    if (number?.kind !== "chooseNumber") throw new Error("Missing X choice");
    const targeting = applied(fold.reduce(waiting, { kind: "answer", side: "player", promptId: number.id, value: 2 }));
    const saved = JSON.parse(JSON.stringify(targeting)) as BattleSlice;
    const reload = createFoldAdapter(engine, { checkEventPrefix: true });
    const pending = reload.pending(saved);
    if (pending?.prompt.kind !== "chooseTargets") throw new Error("Missing target choice");
    expect(pending).toEqual(fold.pending(targeting));
    expect(saved.inFlight?.answers[0]?.value).toBe(2);
    expect(stateHash(saved.committed)).toBe(stateHash(f.state));
    const selected = instance(f.ids.enemy.back[1]);
    const stale = { ...saved, attempt: saved.attempt + 1 };
    expect(reload.reduce(stale, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [selected] }).kind).toBe("bounced");
    expect(reload.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [selected] }).kind).toBe("bounced");
    expect(reload.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [instance(f.ids.enemy.back[2])] }).kind).toBe("bounced");
    expect(reload.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }).kind).toBe("bounced");
    expect(applied(reload.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id })).committed).toEqual(f.state);
    const done = applied(reload.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [selected] }));
    const inline = engine.apply(f.state, "player", f.action, new ScriptedSource([2, [selected]]));
    expect(stateHash(done.committed)).toBe(stateHash(inline.state));
    expect(reload.reduce(done, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [selected] }).kind).toBe("bounced");
  });

  it("rejects a recorded target prefix carrying the wrong X-bound fingerprint before any payment", () => {
    const f = fixture();
    const first = runStep(f.state, f.action, INTERACTIVE, engine.catalog);
    if (first.kind !== "suspended" || first.prompt.kind !== "chooseNumber") throw new Error("Missing numeric suspension");
    const numeric = { fingerprint: promptFingerprint(first.prompt), value: 2 };
    const next = runStep(f.state, f.action, INTERACTIVE, engine.catalog, { prefix: [numeric] });
    if (next.kind !== "suspended" || next.prompt.kind !== "chooseTargets") throw new Error("Missing target suspension");
    const oldTarget = instance(f.ids.enemy.back[2]);
    const wrong = { ...next.prompt, candidates: [oldTarget] };
    const invalid = { fingerprint: promptFingerprint(wrong), value: [oldTarget] };
    const before = stateHash(f.state);
    expect(() => runStep(f.state, f.action, NO_PROMPTS, engine.catalog, { prefix: [numeric, invalid], replay: true })).toThrow(ReplayDivergence);
    expect(stateHash(f.state)).toBe(before);
  });

  for (const side of ["player", "enemy"] as const) {
    for (const kind of ["all", "supported"] as const) for (const chosenX of [0, 2, null] as const) {
      it(`${side} resolves ${kind} bounds from ${(chosenX !== null) ? `chosen X=${String(chosenX)}` : "stored X=3 without a new binding"}`, () => {
        const ref = kind === "all" ? all(exactX) : supported({ sparkAtLeast: x(), sparkAtMost: x() });
        const card: EngineCardDefinition = {
          ...payer, id: syntheticId(0x6910 + Number(kind === "supported") * 2 + Number((chosenX !== null))),
          abilities: () => [activated([(chosenX !== null) ? energyX(0) : energy(1)], dissolve(ref))],
        };
        const E = createEngine(testCatalog([card]));
        const other: Side = side === "player" ? "enemy" : "player";
        const { state: placed, ids } = boardState(E.catalog, {
          active: side, phase: "day",
          [side]: { back: [null, card.id], front: [chosenX === 0 ? v.vanilla0.id : v.vanilla2.id, v.vanilla3.id], energy: 5, deck },
          [other]: { back: [chosenX === 0 ? v.vanilla0.id : v.vanilla2.id, v.vanilla3.id], deck },
        });
        const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
        const source = instance(ids[side].back[1]);
        state.instances[source].status.x = 3;
        const result = E.apply(state, side, { kind: "activate", source, ability: 0 }, (chosenX !== null) ? new ScriptedSource([chosenX]) : NO_PROMPTS);
        const candidates = kind === "all" ? ids[other].back : ids[side].front;
        const changed = instance(candidates[(chosenX !== null) ? 0 : 1]);
        const kept = instance(candidates[(chosenX !== null) ? 1 : 0]);
        expect(result.events.filter(event => event.kind === "dissolved").map(event => event.instance)).toEqual([changed]);
        expect(result.state.instances[changed].zone).toBe("void");
        expect(result.state.instances[kept].zone).toBe("play");
        expect(result.state.instances[source].status.x).toBe(3);
        expect(result.state.sides[side].currentEnergy).toBe(chosenX === null ? 4 : 5 - chosenX);
        expect(invariantViolations(result.state, E.catalog)).toEqual([]);
      });
    }

    for (const chosenX of [0, 2, null] as const) it(`${side} revalidates a void target with ${(chosenX !== null) ? `chosen X=${String(chosenX)} differing from stored X` : "stored X=3 without a new binding"}`, () => {
      const card: EngineCardDefinition = {
        ...payer, id: syntheticId(0x6920 + Number((chosenX !== null))),
        abilities: () => [activated([(chosenX !== null) ? energyX(0) : energy(1)], grantReclaim(fromVoid({ cardType: "event" }, { count: 1, costAtMost: x() }), { costs: [energy(0)] }))],
      };
      const E = createEngine(testCatalog([card, voidZero, voidTwo, voidThree]));
      const other: Side = side === "player" ? "enemy" : "player";
      const { state: placed, ids } = boardState(E.catalog, {
        active: side, phase: "day", [side]: { back: [card.id], void: [voidZero.id, voidTwo.id, voidThree.id], energy: 5, deck }, [other]: { deck },
      });
      const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
      const source = instance(ids[side].back[0]);
      state.instances[source].status.x = chosenX === 2 ? 0 : 3;

      const selected = ids[side].void[chosenX === 0 ? 0 : chosenX === 2 ? 1 : 2];
      const values: Answer[] = [...(chosenX === null ? [] : [chosenX]), [selected]];
      const answers = new Answers(values);
      const result = E.apply(state, side, { kind: "activate", source, ability: 0 }, answers);
      answers.exhausted();
      const prompt = answers.prompts[answers.prompts.length - 1];
      expect(prompt).toMatchObject({ kind: "chooseTargets", candidates: ids[side].void.slice(0, chosenX === 0 ? 1 : chosenX === 2 ? 2 : 3) });
      expect(hasKeyword(result.state, E.catalog, selected, "reclaim")).toBe(true);
      expect(ids[side].void.filter(id => id !== selected).map(id => hasKeyword(result.state, E.catalog, id, "reclaim"))).toEqual([false, false]);
      expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(false);
      expect(result.state.sides[side].currentEnergy).toBe(chosenX === null ? 4 : 5 - chosenX);
      expect(invariantViolations(result.state, E.catalog)).toEqual([]);
    });
  }

});
