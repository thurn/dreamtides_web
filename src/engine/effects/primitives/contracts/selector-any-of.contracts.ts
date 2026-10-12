/** Nonrecursive alternative predicates through public targeting, activation, layers and replay. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCostCapture, abandonSelfCost, activated, all, characterYouControl, countCards, discardCostFilter, energyX, enemyCharacter, event, everyIn, staticAbility, target, x } from "../../../dsl/builders";
import { matchingCharacters } from "../../../dsl/selectors";
import type { CharacterPredicate, CharacterSelector, StaticCharacterSelector } from "../../../dsl/types";
import { whenMaterialize } from "../../../dsl/triggers";
import { thisCharacterSpark } from "../../../dsl/values";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOrigin } from "../../../rules/activation";
import { stateHash } from "../../../state/hash";
import { opponent, type Side } from "../../../state/ids";
import { ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { instanceOf } from "../../../rules/zones";
import { resolveEffect } from "../../interpreter";
import { banishCards } from "../banish-cards";
import { dissolve } from "../dissolve";
import { gainSpark } from "../gain-spark";
import { giveAllTypes } from "../give-all-types";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";

const highWarrior = { ...v.vanilla5, id: syntheticId(0x55601) };
const lowSpirit = { ...v.vanilla1, id: syntheticId(0x55602), subtype: "Spirit Animal" as const };
const overlap = { ...v.vanilla1, id: syntheticId(0x55603) };
const illegal = { ...v.vanilla5, id: syntheticId(0x55604), subtype: "Spirit Animal" as const };
const victims = [highWarrior, lowSpirit, overlap, illegal];
const union = (): CharacterSelector => enemyCharacter({ anyOf: [{ subtype: "Warrior" }, { sparkAtMost: 2 }] });
function spell(selector: CharacterSelector, extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(0x55605), status: "authored", abilities: () => [event(dissolve(target(selector)))], ...extra };
}
function fixture(side: Side, card = spell(union()), extra: readonly EngineCardDefinition[] = [], voidCards: readonly EngineCardDefinition[] = []) {
  const engine = createEngine(testCatalog([...victims, card, ...extra]));
  const other = opponent(side);
  const { state: initial, ids } = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { hand: [card.id], back: [highWarrior.id], energy: 9, void: voidCards.map(c => c.id) },
    [other]: { back: victims.map(c => c.id), hand: extra.map(c => c.id), energy: 9 } });
  const state = { ...initial, config: { ...initial.config, autoAnswerForcedPrompts: false } };
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const action = { kind: "play" as const, card: ids[side].hand[0], from: "hand" as const };
  return { engine, fold, start, action, ids, side, other };
}
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(outcome)}`);
  return outcome;
}
function answer(fold: ReturnType<typeof createFoldAdapter>, current: BattleSlice, side: Side, value: Answer) {
  const pending = fold.pending(current);
  if (pending === null) throw new Error("Missing pending public choice");
  return applied(fold.reduce(current, { kind: "answer", side, promptId: pending.prompt.id, value }));
}

for (const side of ["player", "enemy"] as const) describe(`${side} alternative character predicates`, () => {
  it("offers disjoint and overlapping alternatives once in physical board order and resolves each", () => {
    for (const index of [0, 1, 2]) {
      const f = fixture(side);
      const opened = applied(f.fold.reduce(f.start, { kind: "battleAction", side, action: f.action }));
      expect(f.fold.pending(opened.slice)?.prompt).toMatchObject({ kind: "chooseTargets", candidates: f.ids[f.other].back.slice(0, 3) });
      const chosen = f.ids[f.other].back[index]!;
      const done = answer(f.fold, opened.slice, side, [chosen]);
      const resolved = passUntil(f.engine, done.slice.committed, next => next.stack.length === 0).state;
      expect(resolved.instances[chosen].zone).toBe("void");
      for (const kept of f.ids[f.other].back.filter(id => id !== chosen)) expect(resolved.instances[kept!].zone).toBe("play");
      expect(resolved.instances[f.ids[side].back[0]!].zone).toBe("play");
      expect(invariantViolations(resolved, f.engine.catalog)).toEqual([]);
    }
  });

  it("keeps outer predicates conjunctive, legacy conjunction intact, and empty alternatives unplayable", () => {
    for (const selector of [enemyCharacter({ sparkAtMost: 2, anyOf: [{ subtype: "Warrior" }, { costAtLeast: 99 }] }), enemyCharacter({ subtype: "Warrior", sparkAtMost: 2 })]) {
      const f = fixture(side, spell(selector));
      const opened = applied(f.fold.reduce(f.start, { kind: "battleAction", side, action: f.action }));
      expect(f.fold.pending(opened.slice)?.prompt).toMatchObject({ candidates: [f.ids[f.other].back[2]] });
    }
    const empty = fixture(side, spell(enemyCharacter({ anyOf: [] })));
    expect(empty.engine.legalActions(empty.start.committed, side).some(a => a.kind === "play")).toBe(false);
    expect(empty.fold.reduce(empty.start, { kind: "battleAction", side, action: empty.action })).toEqual({ kind: "bounced", reason: "illegalAction" });
  });

  it("reloads targeting, rejects illegal, foreign, stale and concurrent input, then accepts once", () => {
    const f = fixture(side);
    const opened = applied(f.fold.reduce(f.start, { kind: "battleAction", side, action: f.action }));
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const cold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(f.fold.pending(opened.slice));
    const pending = cold.pending(saved)!;
    const intent = { kind: "answer" as const, side, promptId: pending.prompt.id, value: [f.ids[f.other].back[1]!] };
    const before = stateHash(saved.committed);
    for (const value of [[], [f.ids[f.other].back[3]!], [f.ids[side].back[0]!], [f.ids[f.other].back[0]!, f.ids[f.other].back[0]!]]) {
      expect(cold.reduce(saved, { ...intent, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(cold.reduce(saved, { ...intent, side: f.other })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = applied(cold.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id }));
    const reopened = applied(cold.reduce(cancelled.slice, { kind: "battleAction", side, action: f.action }));
    expect(cold.reduce(reopened.slice, intent)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(stateHash(saved.committed)).toBe(before);
    const done = applied(cold.reduce(saved, intent));
    expect(done).toEqual(applied(f.fold.reduce(opened.slice, intent)));
    expect(cold.reduce(done.slice, intent).kind).toBe("bounced");
  });

  it("rechecks a fixed branch after an actual opponent interrupt changes its target", () => {
    const response: EngineCardDefinition = { ...v.event0, id: syntheticId(0x55606), speed: "interrupt", status: "authored",
      abilities: () => [event(gainSpark(target(characterYouControl({ subtype: "Spirit Animal", sparkAtMost: 2 })), 4))] };
    const f = fixture(side, spell(union(), { speed: "fast" }), [response]);
    const chosen = f.ids[f.other].back[1]!;
    const played = f.engine.apply(f.start.committed, side, f.action, new ScriptedSource([[chosen]]));
    const interrupted = f.engine.apply(played.state, f.other, { kind: "play", card: f.ids[f.other].hand[0], from: "hand" }, new ScriptedSource([[chosen]]));
    const resolved = passUntil(f.engine, interrupted.state, next => next.stack.length === 0);
    expect(effectiveSpark(resolved.state, f.engine.catalog, chosen)).toBe(5);
    expect(resolved.state.instances[chosen].zone).toBe("play");
    expect([...interrupted.events, ...resolved.events].some(e => e.kind === "noLegalTarget")).toBe(true);
  });

  it("reads branch X and live zone counts at resolution with the resolving bindings", () => {
    const byX = fixture(side, spell(enemyCharacter({ anyOf: [{ subtype: "Mage" }, { sparkAtMost: x() }] }), { costs: [energyX(0)] }));
    const played = byX.engine.apply(byX.start.committed, side, byX.action, new ScriptedSource([1, [byX.ids[byX.other].back[1]!]]));
    const resolved = passUntil(byX.engine, played.state, next => next.stack.length === 0).state;
    expect(resolved.instances[byX.ids[byX.other].back[1]!].zone).toBe("void");
    const byCount = fixture(side, spell(enemyCharacter({ anyOf: [{ subtype: "Mage" }, { sparkAtMost: countCards("void") }] }), {
      abilities: () => [event(sequence(dissolve(all(characterYouControl())), dissolve(target(enemyCharacter({ anyOf: [{ sparkAtMost: countCards("void") }] })))))],
    }), [], [overlap]);
    const counted = byCount.engine.apply(byCount.start.committed, side, byCount.action, new ScriptedSource([[byCount.ids[byCount.other].back[1]!]]));
    const countResolved = passUntil(byCount.engine, counted.state, next => next.stack.length === 0).state;
    expect(countResolved.instances[byCount.ids[byCount.other].back[1]!].zone).toBe("void");
    const disappearing = fixture(side, spell(enemyCharacter({ anyOf: [{ sparkAtMost: countCards("void") }] }), {
      abilities: () => [event(sequence(banishCards([everyIn("void")]), dissolve(target(enemyCharacter({ anyOf: [{ sparkAtMost: countCards("void") }] })))))],
    }), [], [overlap]);
    const invalidated = disappearing.engine.apply(disappearing.start.committed, side, disappearing.action, new ScriptedSource([[disappearing.ids[disappearing.other].back[1]!]]));
    const settled = passUntil(disappearing.engine, invalidated.state, next => next.stack.length === 0);
    expect(settled.state.instances[disappearing.ids[disappearing.other].back[1]!].zone).toBe("play");
    expect([...invalidated.events, ...settled.events].some(e => e.kind === "noLegalTarget")).toBe(true);
  });

  it("retains source spark inside an alternative after its source pays abandonment", () => {
    const source: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x55607), status: "authored",
      abilities: () => [activated([abandonSelfCost()], dissolve(target(enemyCharacter({ anyOf: [{ subtype: "Mage" }, { sparkAtMost: thisCharacterSpark() }] }))))] };
    const f = fixture(side, source);
    const board = boardState(f.engine.catalog, { active: side, phase: "day", [side]: { back: [source.id] }, [f.other]: { back: victims.map(c => c.id) } });
    const state = { ...board.state, config: { ...board.state.config, autoAnswerForcedPrompts: false } };
    const selected = board.ids[f.other].back[1]!;
    const played = f.engine.apply(state, side, { kind: "activate", source: board.ids[side].back[0]!, ability: 0 }, new ScriptedSource([[selected], [board.ids[side].back[0]!]]));
    const resolved = passUntil(f.engine, played.state, next => next.stack.length === 0).state;
    expect(resolved.instances[selected].zone).toBe("void");
    expect(resolved.instances[board.ids[side].back[0]!].zone).toBe("void");
  });

  for (const capture of ["abandon", "discard", "count"] as const) it(`prepares mandatory ${capture} X found only in an alternative before targeting`, () => {
    const costs = capture === "abandon" ? [abandonCostCapture()] : [discardCostFilter({}, capture === "count" ? { count: "x", min: 1 } : { captureCost: true })];
    const source: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x55608), status: "authored",
      abilities: () => [activated(costs, dissolve(target(enemyCharacter({ anyOf: [{ subtype: "Mage" }, { sparkAtLeast: x(), sparkAtMost: x() }] }))))] };
    const engine = createEngine(testCatalog([...victims, source]));
    const other = opponent(side);
    const board = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [source.id, v.vanilla1.id], hand: [v.vanilla1.id, v.vanilla1.id] }, [other]: { back: victims.map(c => c.id) } });
    const state = { ...board.state, config: { ...board.state.config, autoAnswerForcedPrompts: false } };
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = applied(fold.reduce(start, { kind: "battleAction", side, action: { kind: "activate", source: board.ids[side].back[0]!, ability: 0 } }));
    expect(fold.pending(opened.slice)?.prompt.kind).toBe(capture === "count" ? "chooseNumber" : "chooseCards");
    const payment = capture === "abandon" ? [board.ids[side].back[1]!] : [board.ids[side].hand[0]];
    const prepared = answer(fold, opened.slice, side, capture === "count" ? 1 : payment);
    expect(fold.pending(prepared.slice)?.prompt).toMatchObject({ kind: "chooseTargets", candidates: [board.ids[other].back[1], board.ids[other].back[2]] });
    let done = answer(fold, prepared.slice, side, [board.ids[other].back[1]!]);
    if (capture === "count") done = answer(fold, done.slice, side, payment);
    const resolved = passUntil(engine, done.slice.committed, next => next.stack.length === 0).state;
    expect(resolved.instances[board.ids[other].back[1]!].zone).toBe("void");
  });
});

it("reads effective all-types and spark through earlier layers for every alternative", () => {
  const source: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x55609), status: "authored", abilities: () => [
    staticAbility(giveAllTypes(all(characterYouControl({ subtype: "Spirit Animal" })))),
    staticAbility(sparkModifier(all(characterYouControl({ anyOf: [{ subtype: "Mage", sparkAtMost: 1 }, { subtype: "Survivor", sparkAtMost: 1 }] })), 3)),
  ] };
  const engine = createEngine(testCatalog([source, lowSpirit, illegal]));
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [source.id, lowSpirit.id, illegal.id] } });
  expect(effectiveSpark(state, engine.catalog, ids.player.back[0]!)).toBe(1);
  expect(effectiveSpark(state, engine.catalog, ids.player.back[1]!)).toBe(4);
  expect(effectiveSpark(state, engine.catalog, ids.player.back[2]!)).toBe(5);
});

it("preserves branch figment, exclusion, cost, readiness, position and live challenge roles", () => {
  const engine = createEngine(testCatalog(victims));
  const deck = Array.from({ length: 8 }, () => overlap.id);
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day",
    player: { back: [highWarrior.id, lowSpirit.id], front: [overlap.id], deck,
      figments: [{ slot: { rank: "back", index: 2 }, printing: { kind: "figmentCopy", cardId: overlap.id, spark: null } }] },
    enemy: { front: [lowSpirit.id], deck } });
  const source = ids.player.back[0]!;
  state.instances[ids.player.back[1]!].status.exhausted = true;
  const copy = state.sides.player.backRank[2]!;
  expect(matchingCharacters(state, engine.catalog, characterYouControl({ anyOf: [
    { figment: true }, { another: true, rank: "back", exhausted: true, notSubtype: "Warrior", costAtMost: 1, costAtLeast: 1 },
  ] }), "player", source)).toEqual([ids.player.back[1], copy]);
  expect(matchingCharacters(state, engine.catalog, characterYouControl({ figment: false, anyOf: [{ figment: true }, { rank: "front" }] }), "player", source)).toEqual(ids.player.front);
  const night = passUntil(engine, state, at(engine, "player", "night")).state;
  expect(matchingCharacters(night, engine.catalog, { controller: "any", anyOf: [{ challenging: true }, { blocking: true }] }, "player", source)).toEqual([ids.player.front[0], ids.enemy.front[0]]);
  expect(matchingCharacters(night, engine.catalog, characterYouControl({ anyOf: [{ challenging: false, blocking: false }] }), "player", source)).toEqual([source, ids.player.back[1], copy]);
});

it("rolls back a synthetic mid-resolution error without a partial committed union effect", () => {
  const broken = spell(union(), { synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, dissolve(all(union())), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic union failure");
  } } });
  const f = fixture("player", broken);
  const opened = applied(f.fold.reduce(f.start, { kind: "battleAction", side: "player", action: f.action }));
  const pending = f.fold.pending(opened.slice)!;
  const result = f.fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [f.ids.enemy.back[1]!] });
  if (result.kind !== "applied" || result.error === null) throw new Error("Expected synthetic resolution error");
  expect(result.slice.committed.sides.player.score).toBe(0);
  for (const victim of f.ids.enemy.back) expect(result.slice.committed.instances[victim!].zone).toBe("play");
  expect(result.slice.committed.stack).toHaveLength(1);
  expect(result.published.filter(e => e.kind === "dissolved")).toEqual([]);
  expect(result.slice.inFlight).toBeNull();
});

it("keeps counted materialization narrow and prevents structural nested or controller alternatives", () => {
  expect(() => whenMaterialize(union(), 2)).toThrow();
  const broad: CharacterSelector = union();
  // @ts-expect-error A complete selector cannot be a leaf, even as a structural value.
  const nested: CharacterPredicate = broad;
  // @ts-expect-error Static alternatives cannot read a resolving source's spark.
  const staticSelector: StaticCharacterSelector = { controller: "you", anyOf: [{ sparkAtMost: thisCharacterSpark() }] };
  const nestedValue = { sparkAtMost: 1, anyOf: [{ sparkAtMost: 1 }] };
  // @ts-expect-error A predeclared predicate containing alternatives cannot be a leaf.
  const nestedOnly: CharacterPredicate = nestedValue;
  const controlledValue = { controller: "you", sparkAtMost: 1 } as const;
  // @ts-expect-error A predeclared leaf cannot supply its own controller.
  const controlled: CharacterPredicate = controlledValue;
  void nestedOnly;
  void controlled;
  void nested;
  void staticSelector;
});
