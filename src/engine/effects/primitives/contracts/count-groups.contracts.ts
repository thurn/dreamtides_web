import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { all, characterYouControl, count, countGroups, enemyCharacter, event, lockedAtResolution, plus, self, staticAbility, target, times } from "../../../dsl/builders";
import type { ValueExpr } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { CONTINUOUS } from "../../../testing/continuous-cards";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, SYNTHETIC as v, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { resolveEffect } from "../../interpreter";
import { abandon } from "../abandon";
import { CHOSEN_SUBTYPE, chooseSubtype } from "../choose-subtype";
import { dissolve } from "../dissolve";
import { draw } from "../draw";
import { forDuration } from "../for-duration";
import { gainEnergy } from "../gain-energy";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";

const warriors = characterYouControl({ subtype: "Warrior" });
const groups = countGroups(warriors, 3);
const spell = (index: number, amount: ValueExpr): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x55400 + index), status: "authored", abilities: () => [event(draw(amount))],
});
const grouped = spell(0, groups);
const ordinary = spell(1, count(warriors));
const fractional = spell(2, times(count(warriors), 1 / 3));
const defaultDraw = spell(3, 1);
const nested = spell(4, plus(times(groups, 2), 1));
const chosen: EngineCardDefinition = { ...v.event0, id: syntheticId(0x55405), status: "authored", abilities: () => [event(chooseSubtype({ then: gainEnergy(countGroups(characterYouControl({ subtype: CHOSEN_SUBTYPE }), 3)) }))] };
const locked: EngineCardDefinition = { ...v.event0, id: syntheticId(0x55406), status: "authored", abilities: () => [event(forDuration("untilEndOfTurn", sparkModifier(all(warriors), lockedAtResolution(plus(times(groups, 2), 1)))))] };
const live: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x55407), status: "authored", abilities: () => [staticAbility(sparkModifier(self(), groups))] };
const interrupt: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(0x55408), status: "authored", abilities: () => [event(dissolve(target(enemyCharacter())))] };
const afterRemoval: EngineCardDefinition = { ...v.event0, id: syntheticId(0x55409), status: "authored", abilities: () => [event(sequence(dissolve(target(warriors)), draw(groups)))] };
const promptingEffect = sequence(draw(groups), abandon());
const prompting: EngineCardDefinition = { ...v.event0, id: syntheticId(0x5540a), status: "authored", abilities: () => [event(promptingEffect)] };
const failing: EngineCardDefinition = {
  ...prompting, id: syntheticId(0x5540b),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, promptingEffect, { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
      throw new Error("synthetic failure after grouped draw and abandon");
    },
  },
};
const warriorFigment: EngineFigmentDefinition = { id: parseFigmentId(syntheticId(0x55420)), subtype: "Warrior", spark: 1, status: "vanilla", abilities: () => [] };
const engine = createEngine(testCatalog([grouped, ordinary, fractional, defaultDraw, nested, chosen, locked, live, interrupt, afterRemoval, prompting, failing, CONTINUOUS.everyType], {}, [warriorFigment]));
const deck = Array.from({ length: 12 }, () => v.vanilla1.id);
const play = (state: BattleState, card: InstanceId, side: Side = "player", answers: readonly (number | readonly InstanceId[])[] = []) => engine.apply(state, side, { kind: "play", card, from: "hand" }, new ScriptedSource(answers));
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const applied = (result: IntentOutcome) => {
  if (result.kind !== "applied" || result.error !== null) throw new Error("expected successful applied intent");
  return result.slice;
};

function drawAmount(card: EngineCardDefinition, matching: number, side: Side = "player") {
  const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [card.id], back: Array.from({ length: matching }, () => v.vanilla1.id), deck }, [opponent(side)]: { back: [v.vanilla1.id], deck } });
  const result = play(state, ids[side].hand[0], side);
  expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result.state.sides[side].hand;
}

function suspended(card: EngineCardDefinition) {
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [card.id], back: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id], deck }, enemy: { deck } });
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const start = sliceOf(state);
  const slice = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
  return { state, ids, fold, slice, pending: fold.pending(slice)! };
}

describe("countGroups public contracts", () => {
  it.each(["player", "enemy"] as const)("counts zero, incomplete, exact and multiple groups for %s", (side) => {
    for (let amount = 0; amount <= 9; amount++) {
      expect(drawAmount(grouped, amount, side)).toHaveLength(Math.floor(amount / 3));
      expect(drawAmount(ordinary, amount, side)).toHaveLength(amount);
      expect(drawAmount(fractional, amount, side)).toHaveLength(Math.ceil(amount / 3));
    }
    expect(drawAmount(defaultDraw, 0, side)).toHaveLength(1);
    expect(drawAmount(nested, 5, side)).toHaveLength(3);
  });

  it.each([1, 2, 4, 20])("uses the authored group size %s", (groupSize) => {
    const card = spell(0x30 + groupSize, countGroups(warriors, groupSize));
    const own = createEngine(testCatalog([card]));
    const { state, ids } = boardState(own.catalog, { active: "player", phase: "day", player: { hand: [card.id], back: Array.from({ length: 5 }, () => v.vanilla1.id), deck } });
    const result = own.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]));
    expect(result.state.sides.player.hand).toHaveLength(Math.floor(5 / groupSize));
  });

  it.each([0, -1, 0.5, NaN, Infinity, -Infinity])("rejects invalid authored group size %s", (groupSize) => {
    expect(() => countGroups(warriors, groupSize)).toThrow();
  });

  it("matches subtype, controller, all-types, figments and figment copies through the existing selector", () => {
    const figmentOnly = spell(0x21, countGroups(characterYouControl({ subtype: "Warrior", figment: true }), 2));
    const own = createEngine(testCatalog([figmentOnly, grouped, CONTINUOUS.everyType], {}, [warriorFigment]));
    const { state, ids } = boardState(own.catalog, { active: "player", phase: "day", player: { hand: [figmentOnly.id, grouped.id], back: [CONTINUOUS.everyType.id], deck, figments: [
      { slot: { rank: "back", index: 1 }, printing: { kind: "figment", figment: warriorFigment.id, spark: 1 } },
      { slot: { rank: "back", index: 2 }, printing: { kind: "figmentCopy", cardId: v.vanilla1.id, spark: null } },
    ] }, enemy: { back: [v.vanilla1.id, v.vanilla1.id], deck } });
    const first = own.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]));
    expect(first.state.sides.player.hand).toEqual([ids.player.hand[1], ids.player.deck[0]]);
    const second = own.apply(first.state, "player", { kind: "play", card: ids.player.hand[1], from: "hand" }, new ScriptedSource([]));
    expect(second.state.sides.player.hand).toEqual(ids.player.deck.slice(0, 2));
  });

  it("excludes characters of another subtype and reads opponent-relative selectors", () => {
    const onlyWarriors = spell(0x22, countGroups(warriors, 2));
    const opposing = spell(0x23, countGroups(enemyCharacter({ subtype: "Warrior" }), 2));
    const own = createEngine(testCatalog([onlyWarriors, opposing]));
    const { state, ids } = boardState(own.catalog, { active: "player", phase: "day", player: { hand: [onlyWarriors.id, opposing.id], back: [v.vanilla1.id, v.survivorVictim.id], deck }, enemy: { back: [v.vanilla1.id, v.vanilla1.id], deck } });
    const first = own.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]));
    expect(first.state.sides.player.hand).toEqual([ids.player.hand[1]]);
    const second = own.apply(first.state, "player", { kind: "play", card: ids.player.hand[1], from: "hand" }, new ScriptedSource([]));
    expect(second.state.sides.player.hand).toEqual([ids.player.deck[0]]);
  });

  it("preserves grouping when a chosen subtype remaps a nested count", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [chosen.id], back: Array.from({ length: 4 }, () => v.vanilla1.id), deck } });
    const mode = engine.catalog.characterTypes.indexOf(v.vanilla1.subtype);
    expect(play(state, ids.player.hand[0], "player", [mode]).state.sides.player.currentEnergy).toBe(1);
  });

  it("reads the matching characters at resolution after an earlier node and an Interrupt", () => {
    const beforeNode = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [afterRemoval.id], back: Array.from({ length: 3 }, () => v.vanilla1.id), deck } });
    expect(play(beforeNode.state, beforeNode.ids.player.hand[0], "player", [[beforeNode.ids.player.back[0]!]]).state.sides.player.hand).toEqual([]);
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [grouped.id], back: Array.from({ length: 3 }, () => v.vanilla1.id), deck }, enemy: { hand: [interrupt.id], energy: 1, deck } });
    const queued = play(state, ids.player.hand[0]);
    expect(queued.state.stack).toHaveLength(1);
    const response = play(queued.state, ids.enemy.hand[0], "enemy", [[ids.player.back[0]!]]);
    const done = passUntil(engine, response.state, (current) => current.stack.length === 0);
    expect(done.state.sides.player.hand).toEqual([]);
    expect(done.state.instances[ids.player.back[0]!].zone).toBe("void");
  });

  it("reads static groups live and persists a nested locked result across a saved-state round trip", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [locked.id, afterRemoval.id], back: [live.id, v.vanilla1.id, v.vanilla1.id], deck } });
    const source = ids.player.back[0]!;
    expect(engine.view(state, "player").instances[source].characteristics.spark).toBe(2);
    const fixed = play(state, ids.player.hand[0]);
    expect(engine.view(fixed.state, "player").instances[source].characteristics.spark).toBe(5);
    const saved = deserializeState(serializeState(fixed.state));
    expect(stateHash(saved)).toBe(stateHash(fixed.state));
    const changed = play(saved, ids.player.hand[1], "player", [[ids.player.back[1]!]]);
    expect(engine.view(changed.state, "player").instances[source].characteristics.spark).toBe(4);
    expect(changed.state.floating.filter((record) => record.change.kind === "spark").map((record) => record.change)).toContainEqual({ kind: "spark", instance: source, amount: 3 });
  });

  it("suspends after a grouped draw without a partial commit, reloads, rejects stale/concurrent input and commits once", () => {
    const { state, ids, fold, slice, pending } = suspended(prompting);
    expect(pending.prompt.kind).toBe("chooseCards");
    expect(slice.committed.sides.player.hand).toEqual([]);
    expect(slice.committed.instances[ids.player.hand[0]].zone).toBe("stack");
    expect(pending.display.sides.player.hand).toEqual([ids.player.deck[0]]);
    const loaded = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const current = fresh.pending(loaded)!;
    expect(current.prompt).toEqual(pending.prompt);
    expect(stateHash(current.display)).toBe(stateHash(pending.display));
    const answer = (from: BattleSlice, side: Side = "player", value = [ids.player.back[0]!]) => fresh.reduce(from, { kind: "answer", side, promptId: current.prompt.id, value });
    expect(answer(loaded, "enemy")).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer({ ...loaded, attempt: loaded.attempt + 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(answer(loaded, "player", [ids.player.deck[0]])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(loaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const done = applied(answer(loaded));
    expect(done.committed.sides.player.hand).toEqual([ids.player.deck[0]]);
    expect(done.committed.sides.player.void).toContain(ids.player.back[0]);
    expect(answer(done)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(fold.pending(slice)?.display).toEqual(pending.display);
    expect(state.sides.player.hand).toEqual(ids.player.hand);
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
  });

  it("rolls back a failed step after a grouped draw and published prompt", () => {
    const { ids, fold, slice, pending } = suspended(failing);
    const result = fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.back[0]!] });
    if (result.kind !== "applied") throw new Error("expected recovered error");
    expect(result.error).not.toBeNull();
    expect(result.slice.inFlight).toBeNull();
    expect(result.slice.committed.sides.player.hand).toEqual([]);
    expect(result.slice.committed.instances[ids.player.hand[0]].zone).toBe("stack");
    expect(result.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(result.slice.committed.instances[ids.player.back[0]!].zone).toBe("play");
    expect(result.error?.answers).toHaveLength(1);
    expect(invariantViolations(result.slice.committed, engine.catalog)).toEqual([]);
  });
});
