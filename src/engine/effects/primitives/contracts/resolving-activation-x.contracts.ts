import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonSelfCost, activated, controls, count, energy, energyX, enemyCharacter, event, self, stackItem, staticAbility, target, x } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import type { Effect } from "../../registry";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import type { Answer, Prompt } from "../../../prompts/types";
import { hasKeyword } from "../../../rules/keywords";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import { ReplayDivergence } from "../../../steps/errors";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { abandon } from "../abandon";
import { banishSelfOnResolve } from "../banish-self-on-resolve";
import { chooseOne } from "../choose-one";
import { choosePlayer } from "../choose-player";
import { chooseSubtype } from "../choose-subtype";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { grant } from "../grant";
import { ifThen } from "../if-then";
import { payTo } from "../pay-to";
import { prevent } from "../prevent";
import { sequence } from "../sequence";

const exactX = enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() });
const predicate = { sparkAtLeast: x(), sparkAtMost: x() };
const deck = [v.vanilla1.id, v.vanilla1.id];
function instance(id: InstanceId | null): InstanceId {
  if (id === null) throw new Error("Missing fixture instance");
  return id;
}
function fixture(effect: Effect, side: Side, chosen: number | null, depart = false, staticControl = false) {
  const card: EngineCardDefinition = {
    id: syntheticId(0x7100), cardType: "character", costs: [], spark: 1, subtype: "Mage", speed: "standard", status: "authored",
    abilities: () => [activated([chosen === null ? energy(1) : energyX(0), ...(depart ? [abandonSelfCost()] : [])], effect),
      ...(staticControl ? [staticAbility(grant(self(), "vengeful"), { while: controls(exactX, 1) })] : [])],
  };
  const engine = createEngine(testCatalog([card]));
  const other: Side = side === "player" ? "enemy" : "player";
  const matching = chosen === 0 ? v.vanilla0.id : v.vanilla2.id;
  const { state: placed, ids } = boardState(engine.catalog, {
    active: side, phase: "day", [side]: { back: [card.id, matching, matching, v.vanilla3.id], energy: 5, deck },
    [other]: { back: [matching, matching, v.vanilla3.id], deck },
  });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const source = instance(ids[side].back[0]);
  state.instances[source].status.x = 3;
  return { engine, state, ids, source, side, other, action: { kind: "activate", source, ability: 0 } as const,
    selected: instance(ids[other].back[chosen === null ? 2 : 0]),
    ownSelected: instance(ids[side].back[chosen === null ? 3 : 1]) };
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
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful intent");
  return outcome.slice;
}

describe("resolving activation X contracts", () => {
  for (const side of ["player", "enemy"] as const) for (const chosen of [0, 2, null] as const) {
    const binding = chosen === null ? "stored X=3" : `chosen X=${String(chosen)}`;
    for (const wrapper of ["payTo", "choosePlayer", "chooseSubtype"] as const) it(`${side} ${wrapper} defers exact-X targets using ${binding}`, () => {
      const effect = dissolve(target(exactX));
      const wrapped = wrapper === "payTo" ? payTo({ energy: 1 }, effect)
        : wrapper === "choosePlayer" ? choosePlayer(() => effect) : chooseSubtype({ then: effect });
      const f = fixture(wrapped, side, chosen);
      const answers = new Answers([...(chosen === null ? [] : [chosen]), wrapper === "payTo" ? true : 0, [f.selected]]);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts[answers.prompts.length - 1]).toMatchObject({ kind: "chooseTargets", candidates: chosen === null ? [f.selected] : f.ids[f.other].back.slice(0, 2) });
      expect(result.state.instances[f.selected].zone).toBe("void");
      expect(result.state.instances[f.source].status.x).toBe(3);
      expect(result.state.sides[side].currentEnergy).toBe(5 - (chosen ?? 1) - Number(wrapper === "payTo"));
      expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(false);
      expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
    });

    it(`${side} deferred mode legality uses ${binding}`, () => {
      const f = fixture(payTo({ energy: 1 }, chooseOne(dissolve(target(exactX)), gainPoints(1))), side, chosen);
      if (chosen !== null) f.state.instances[instance(f.ids[f.other].back[2])].status.gainedSpark = 1;
      const answers = new Answers([...(chosen === null ? [] : [chosen]), true, 0, [f.selected]]);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts.find(prompt => prompt.purpose.role === "chooseOne")).toMatchObject({
        kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: true }],
      });
      expect(result.state.instances[f.selected].zone).toBe("void");
      expect(result.state.sides[side].score).toBe(0);
    });

    it(`${side} selector-count values use ${binding}`, () => {
      const f = fixture(gainPoints(count(exactX)), side, chosen);
      const result = f.engine.apply(f.state, side, f.action, chosen === null ? NO_PROMPTS : new ScriptedSource([chosen]));
      expect(result.state.sides[side].score).toBe(chosen === null ? 1 : 2);
      expect(result.state.sides[side].currentEnergy).toBe(5 - (chosen ?? 1));
    });

    it(`${side} resolving controls use ${binding} while static conditions retain source X`, () => {
      const f = fixture(ifThen(controls(exactX, 2), gainPoints(7), gainPoints(1)), side, chosen, false, true);
      expect(hasKeyword(f.state, f.engine.catalog, f.source, "vengeful")).toBe(true);
      const result = f.engine.apply(f.state, side, f.action, chosen === null ? NO_PROMPTS : new ScriptedSource([chosen]));
      expect(result.state.sides[side].score).toBe(chosen === null ? 1 : 7);
      expect(hasKeyword(result.state, f.engine.catalog, f.source, "vengeful")).toBe(true);
      expect(result.state.instances[f.source].status.x).toBe(3);
    });

    it(`${side} non-targeting abandon candidates use ${binding}`, () => {
      const f = fixture(abandon("you", predicate), side, chosen);
      const answers = new Answers([...(chosen === null ? [] : [chosen]), [f.ownSelected]]);
      const result = f.engine.apply(f.state, side, f.action, answers);
      answers.exhausted();
      expect(answers.prompts[answers.prompts.length - 1]).toMatchObject({ kind: "chooseCards", candidates: chosen === null ? [f.ownSelected] : f.ids[side].back.slice(1, 3) });
      expect(result.state.instances[f.ownSelected].zone).toBe("void");
      expect(result.state.instances[instance(f.ids[side].back[chosen === null ? 1 : 3])].zone).toBe("play");
    });
  }

  for (const side of ["player", "enemy"] as const) it(`${side} retains paid X after the activated source abandons itself`, () => {
    const f = fixture(payTo({ energy: 1 }, dissolve(target(exactX))), side, 2, true);
    const answers = new Answers([2, [f.source], true, [f.selected]]);
    const result = f.engine.apply(f.state, side, f.action, answers);
    answers.exhausted();
    expect(result.state.instances[f.source].zone).toBe("void");
    expect(result.state.instances[f.source].status.x).toBeNull();
    expect(result.state.instances[f.selected].zone).toBe("void");
    expect(result.state.sides[side].currentEnergy).toBe(2);
  });

  for (const side of ["player", "enemy"] as const) for (const chosen of [0, 2, null] as const) it(`${side} prevent unless-abandons uses ${chosen === null ? "stored X" : `chosen X=${String(chosen)}`}`, () => {
    const sourceCard: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x7110), abilities: () => [activated(
      [chosen === null ? energy(1) : energyX(0)], prevent(stackItem({ controller: "opponent" }), { unlessAbandons: predicate }), { speed: "interrupt" },
    )] };
    const spell: EngineCardDefinition = { ...v.event1, id: syntheticId(0x7111), abilities: () => [event(gainPoints(1))] };
    const E = createEngine(testCatalog([sourceCard, spell]));
    const other: Side = side === "player" ? "enemy" : "player";
    const matching = chosen === 0 ? v.vanilla0.id : v.vanilla2.id;
    const { state: placed, ids } = boardState(E.catalog, { active: other, phase: "day",
      [side]: { back: [sourceCard.id], energy: 5, deck },
      [other]: { back: [matching, v.vanilla3.id], hand: [spell.id], energy: 5, deck },
    });
    const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
    const source = instance(ids[side].back[0]);
    state.instances[source].status.x = 3;
    const played = ids[other].hand[0];
    const waiting = E.apply(state, other, { kind: "play", card: played, from: "hand" }, NO_PROMPTS);
    const selected = instance(ids[other].back[chosen === null ? 1 : 0]);
    const answers = new Answers([...(chosen === null ? [] : [chosen]), [played], true, [selected]]);
    const result = E.apply(waiting.state, side, { kind: "activate", source, ability: 0 }, answers);
    answers.exhausted();
    expect(answers.prompts[answers.prompts.length - 1]).toMatchObject({ kind: "chooseCards", side: other, candidates: [selected] });
    expect(result.state.instances[selected].zone).toBe("void");
    expect(result.state.instances[instance(ids[other].back[chosen === null ? 0 : 1])].zone).toBe("play");
    expect(result.state.sides[other].score).toBe(0);
    expect(result.state.stack.some(item => item.kind === "card" && item.instance === played)).toBe(true);
    expect(result.events.some(event => event.kind === "prevented")).toBe(false);
    expect(result.state.sides[side].currentEnergy).toBe(5 - (chosen ?? 1));
  });

  it("reloads deferred target prefixes, rejects invalid actors/attempts and commits payments once", () => {
    const f = fixture(payTo({ energy: 1 }, dissolve(target(exactX))), "player", 2);
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const initial: BattleSlice = { committed: f.state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const numeric = applied(fold.reduce(initial, { kind: "battleAction", side: "player", action: f.action }));
    const number = fold.pending(numeric)?.prompt;
    if (number?.kind !== "chooseNumber") throw new Error("Missing X choice");
    const confirming = applied(fold.reduce(numeric, { kind: "answer", side: "player", promptId: number.id, value: 2 }));
    const confirm = fold.pending(confirming)?.prompt;
    if (confirm?.kind !== "confirm") throw new Error("Missing optional payment choice");
    const targeting = applied(fold.reduce(confirming, { kind: "answer", side: "player", promptId: confirm.id, value: true }));
    const saved = JSON.parse(JSON.stringify(targeting)) as BattleSlice;
    const reload = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const pending = reload.pending(saved);
    if (pending?.prompt.kind !== "chooseTargets") throw new Error("Missing deferred targets");
    expect(pending.prompt.candidates).toEqual(f.ids.enemy.back.slice(0, 2));
    expect(pending).toEqual(fold.pending(targeting));
    expect(saved.committed.sides.player.currentEnergy).toBe(3);
    expect(targeting.committed).toEqual(confirming.committed);
    expect(reload.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [instance(f.ids.enemy.back[2])] }).kind).toBe("bounced");
    expect(reload.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [f.selected] }).kind).toBe("bounced");
    expect(reload.reduce({ ...saved, attempt: saved.attempt + 1 }, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [f.selected] }).kind).toBe("bounced");
    expect(reload.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }).kind).toBe("bounced");
    expect(reload.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const done = applied(reload.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [f.selected] }));
    const inline = f.engine.apply(f.state, "player", f.action, new ScriptedSource([2, true, [f.selected]]));
    expect(stateHash(done.committed)).toBe(stateHash(inline.state));
    expect(done.committed.sides.player.currentEnergy).toBe(2);
    expect(reload.reduce(done, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [f.selected] }).kind).toBe("bounced");
  });

  it("rejects a historical stored-X deferred target fingerprint before any committed resolving payment", () => {
    const f = fixture(payTo({ energy: 1 }, dissolve(target(exactX))), "player", 2);
    const fold = createFoldAdapter(f.engine);
    const initial: BattleSlice = { committed: f.state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const numeric = applied(fold.reduce(initial, { kind: "battleAction", side: "player", action: f.action }));
    const number = fold.pending(numeric)?.prompt;
    if (number?.kind !== "chooseNumber") throw new Error("Missing X choice");
    const resolving = applied(fold.reduce(numeric, { kind: "answer", side: "player", promptId: number.id, value: 2 }));
    const flight = resolving.inFlight;
    if (flight === null) throw new Error("Missing automatic resolution");
    const confirming = runStep(resolving.committed, flight.step, INTERACTIVE, f.engine.catalog, { automatic: true });
    if (confirming.kind !== "suspended" || confirming.prompt.kind !== "confirm") throw new Error("Missing payment suspension");
    const paid = [{ fingerprint: promptFingerprint(confirming.prompt), value: true }];
    const targeting = runStep(resolving.committed, flight.step, INTERACTIVE, f.engine.catalog, { prefix: paid, automatic: true });
    if (targeting.kind !== "suspended" || targeting.prompt.kind !== "chooseTargets") throw new Error("Missing target suspension");
    const oldTarget = instance(f.ids.enemy.back[2]);
    const wrong = { ...targeting.prompt, candidates: [oldTarget] };
    const invalid = [...paid, { fingerprint: promptFingerprint(wrong), value: [oldTarget] }];
    const before = stateHash(resolving.committed);
    expect(() => runStep(resolving.committed, flight.step, NO_PROMPTS, f.engine.catalog, { prefix: invalid, replay: true, automatic: true })).toThrow(ReplayDivergence);
    expect(stateHash(resolving.committed)).toBe(before);
    expect(resolving.committed.sides.player.currentEnergy).toBe(3);
  });

  for (const side of ["player", "enemy"] as const) it(`${side} played event retains chosen X after banishing its stack source`, () => {
    const card: EngineCardDefinition = {
      ...v.event0, id: syntheticId(0x7120), costs: [energyX(0)],
      abilities: () => [event(sequence(
        banishSelfOnResolve(), gainPoints(count(exactX)),
        ifThen(controls(exactX, 2), gainPoints(1)),
        abandon("you", predicate), payTo({ energy: 1 }, dissolve(target(exactX))),
      ))],
    };
    const E = createEngine(testCatalog([card]));
    const other: Side = side === "player" ? "enemy" : "player";
    const { state: placed, ids } = boardState(E.catalog, { active: side, phase: "day",
      [side]: { hand: [card.id], back: [v.vanilla2.id, v.vanilla2.id, v.vanilla3.id], energy: 5, deck },
      [other]: { back: [v.vanilla2.id, v.vanilla2.id, v.vanilla3.id], deck },
    });
    const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
    const source = ids[side].hand[0];
    const own = instance(ids[side].back[0]);
    const selected = instance(ids[other].back[0]);
    const answers = new Answers([2, [own], true, [selected]]);
    const result = E.apply(state, side, { kind: "play", card: source, from: "hand" }, answers);
    answers.exhausted();
    expect(answers.prompts.map(prompt => prompt.kind)).toEqual(["chooseNumber", "chooseCards", "confirm", "chooseTargets"]);
    expect(answers.prompts[1]).toMatchObject({ candidates: ids[side].back.slice(0, 2) });
    expect(answers.prompts[3]).toMatchObject({ candidates: ids[other].back.slice(0, 2) });
    expect(result.state.instances[source]).toMatchObject({ zone: "banished", status: { x: null } });
    expect(result.state.sides[side].score).toBe(3);
    expect(result.state.sides[side].currentEnergy).toBe(2);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "banished", instance: source }));
    expect(result.events).toContainEqual({ kind: "abandoned", instance: own, side });
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "dissolved", instance: selected, side: other }));
    expect(result.state.instances[own].zone).toBe("void");
    expect(result.state.instances[selected].zone).toBe("void");
    for (const owner of [side, other]) for (const id of ids[owner].back.slice(1)) expect(result.state.instances[instance(id)].zone).toBe("play");
    expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(false);
    expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  });

});
