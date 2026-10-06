/**
 * Figments (rules § Figments): the figment catalog, creation and capacity,
 * merging, Legionnaire, figment costs (C13), Support once per figment, and
 * figment copies (C5). Ported from the prototype's figment, figment-catalog,
 * and Support contracts, rewritten against the engine with synthetic
 * figment types.
 */
import { describe, expect, it } from "vitest";
import { printedCard, type EngineFigmentDefinition } from "../catalog";
import { contentFigmentDefinitions } from "../content-catalog";
import { characterYouControl, energy } from "../dsl/builders";
import { matchingCharacters } from "../dsl/selectors";
import { createEngine } from "../engine";
import type { Answer } from "../prompts/types";
import type { Action } from "./actions";
import type { InstanceId, Side } from "../state/ids";
import { parseFigmentId } from "../state/ids";
import type { BattleState, Printing } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, placeFigment, type BoardSetup } from "../testing/board";
import { CONTINUOUS } from "../testing/continuous-cards";
import { DSL } from "../testing/dsl-cards";
import { invariantViolations } from "../testing/invariants";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { ZONE, ZONE_FIGMENT, zoneCatalog } from "../testing/zone-cards";
import { effectiveSpark } from "./spark";

const engine = createEngine(zoneCatalog());
const v = SYNTHETIC;
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const F = ZONE_FIGMENT;
const figment = (type: EngineFigmentDefinition, spark = 1): Printing => ({ kind: "figment", figment: type.id, spark });

function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, { active: "player", phase: "day", ...setup, player: { deck, ...setup.player }, enemy: { deck, ...setup.enemy } });
}

function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = engine.apply(state, side, action, source);
  source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}

function play(state: BattleState, card: InstanceId | null | undefined, answers: readonly Answer[] = []) {
  if (card === null || card === undefined) throw new Error("no card");
  return act(state, "player", { kind: "play", card, from: "hand" }, answers);
}

function spark(state: BattleState, id: InstanceId | null | undefined): number {
  if (id === null || id === undefined) throw new Error("no character");
  return effectiveSpark(state, engine.catalog, id);
}

const backRank = (state: BattleState) => state.sides.player.backRank;

describe("figment catalog", () => {
  it("looks every catalog figment up by its UUID as a 0● character with a non-negative integer base spark", () => {
    const definitions = contentFigmentDefinitions();
    expect(new Set(definitions.map((definition) => definition.id)).size).toBe(definitions.length);
    for (const definition of definitions) {
      expect(engine.catalog.figment(definition.id)).toEqual(definition);
      expect(Number.isInteger(definition.spark) && definition.spark >= 0).toBe(true);
      const printed = printedCard(engine.catalog, { kind: "figment", figment: definition.id, spark: definition.spark });
      expect(printed).toMatchObject({ cardType: "character", costs: [], spark: definition.spark, subtype: definition.subtype });
    }
    expect(() => engine.catalog.figment(parseFigmentId("5e5e5e5e-0000-4000-8000-00000000ffff"))).toThrow();
  });

  it("gives a figment its type's abilities: an Awakened figment enters ready", () => {
    const { state, ids } = board({ player: { hand: [ZONE.emberCall.id], energy: 1 } });
    const after = play(state, ids.player.hand[0]).state;
    const ember = backRank(after)[0]!;
    expect(after.instances[ember]).toMatchObject({ printing: { kind: "figment", figment: F.ember.id }, status: { exhausted: false, created: true } });
  });
});

describe("creating figments", () => {
  it("materializes each figment as its own character in the leftmost open positions, exhausted, counting as its subtype", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id, null, null], hand: [ZONE.twoWarriors.id], energy: 1 } });
    const { state: after, events } = play(state, ids.player.hand[0]);
    const [b1, b2] = [backRank(after)[1]!, backRank(after)[2]!];
    expect(after.instances[b1]).toMatchObject({ printing: { kind: "figment", figment: F.warrior.id, spark: 1 }, owner: "player", status: { exhausted: true, created: true } });
    expect(spark(after, b1)).toBe(1);
    expect(spark(after, b2)).toBe(1);
    expect(events.filter((event) => event.kind === "materialized")).toHaveLength(2);
    expect(events.filter((event) => event.kind === "cardCreated")).toHaveLength(2);
    expect(matchingCharacters(after, engine.catalog, characterYouControl({ subtype: "Warrior" }), "player", ids.player.back[0]!)).toHaveLength(3);
  });

  it("at capacity fills the open positions and divides the group's total spark among them, remainder left to right", () => {
    const back = [...Array.from({ length: 8 }, () => v.vanilla1.id), null, null];
    const { state, ids } = board({ player: { back, hand: [ZONE.etherealFlood.id], energy: 5 } });
    const { state: after, events } = play(state, ids.player.hand[0], [5]);
    expect([spark(after, backRank(after)[8]), spark(after, backRank(after)[9])]).toEqual([3, 2]);
    expect(events).toContainEqual({ kind: "capacityReached", side: "player", instance: null, missing: 3 });
  });

  it("keeps each figment's spark when the whole group fits, and never merges into figments already in play", () => {
    const { state, ids } = board({ player: { back: [null, null, null], hand: [ZONE.etherealFlood.id], energy: 2 } });
    const existing = placeFigment(state, "player", { rank: "back", index: 0 }, figment(F.ethereal));
    const after = play(state, ids.player.hand[0], [2]).state;
    expect([spark(after, existing), spark(after, backRank(after)[1]), spark(after, backRank(after)[2])]).toEqual([1, 1, 1]);
  });

  it("is not created with no open position; a figment exists only in play and ceases to exist when it leaves", () => {
    const { state } = board({ player: { back: Array.from({ length: 10 }, () => v.vanilla1.id), hand: [ZONE.twoWarriors.id], energy: 1 } });
    expect(engine.legalActions(state, "player").some((action) => action.kind === "play")).toBe(false);
    const banished = board({ player: { hand: [DSL.banishEnemyWithSparkAtMostTwo.id], energy: 1 } });
    const enemyFigment = placeFigment(banished.state, "enemy", { rank: "back", index: 0 }, figment(F.warrior));
    const { state: after, events } = play(banished.state, banished.ids.player.hand[0]);
    expect(after.instances[enemyFigment]).toBeUndefined();
    expect(after.sides.enemy.banished).toEqual([]);
    expect(events.some((event) => event.kind === "banished")).toBe(false);
  });
});

describe("merging figments", () => {
  function twoWarriorFigments(exhausted: readonly [boolean, boolean]) {
    const { state } = board({ player: {} });
    const source = placeFigment(state, "player", { rank: "back", index: 0 }, figment(F.warrior));
    const destination = placeFigment(state, "player", { rank: "back", index: 1 }, figment(F.warrior, 2));
    state.instances[source].status.exhausted = exhausted[0];
    state.instances[destination].status.exhausted = exhausted[1];
    return { state, source, destination };
  }

  it("merges a figment dragged onto one with the same identity: its current spark is added permanently, nothing triggers", () => {
    const { state, source, destination } = twoWarriorFigments([false, false]);
    state.instances[source].status.gainedSpark = 2;
    const { state: after, events } = act(state, "player", { kind: "reposition", card: source, to: { rank: "back", index: 1 } });
    expect(after.instances[source]).toBeUndefined();
    expect(spark(after, destination)).toBe(2 + 1 + 2);
    expect(after.instances[destination].status.gainedSpark).toBe(3);
    expect(events).toContainEqual({ kind: "figmentsMerged", side: "player", source, destination, spark: 3 });
    expect(events.some((event) => event.kind === "leftPlay" || event.kind === "triggerQueued")).toBe(false);
  });

  it("is legal only between two exhausted figments or two ready ones, and only with the same identity", () => {
    const mismatched = twoWarriorFigments([true, false]);
    expect(engine.legalActions(mismatched.state, "player")).not.toContainEqual({ kind: "reposition", card: mismatched.source, to: { rank: "back", index: 1 } });
    const exhausted = twoWarriorFigments([true, true]);
    expect(engine.legalActions(exhausted.state, "player")).toContainEqual({ kind: "reposition", card: exhausted.source, to: { rank: "back", index: 1 } });

    const { state } = board({ player: {} });
    const warrior = placeFigment(state, "player", { rank: "back", index: 0 }, figment(F.warrior));
    const ethereal = placeFigment(state, "player", { rank: "back", index: 1 }, figment(F.ethereal));
    const swapped = act(state, "player", { kind: "reposition", card: warrior, to: { rank: "back", index: 1 } }).state;
    expect(backRank(swapped).slice(0, 2)).toEqual([ethereal, warrior]);
  });

  it("merges figment copies only with figment copies of the same card UUID", () => {
    const { state } = board({ player: {} });
    const a = placeFigment(state, "player", { rank: "back", index: 0 }, { kind: "figmentCopy", cardId: v.vanilla2.id, spark: null });
    const b = placeFigment(state, "player", { rank: "back", index: 1 }, { kind: "figmentCopy", cardId: v.vanilla2.id, spark: null });
    const other = placeFigment(state, "player", { rank: "back", index: 2 }, { kind: "figmentCopy", cardId: v.vanilla3.id, spark: null });
    const merged = act(state, "player", { kind: "reposition", card: a, to: { rank: "back", index: 1 } }).state;
    expect(spark(merged, b)).toBe(4);
    const swapped = act(merged, "player", { kind: "reposition", card: b, to: { rank: "back", index: 2 } }).state;
    expect(backRank(swapped)[1]).toBe(other);
  });

  it("adds only a Legionnaire's base spark; three Legionnaires alone are 3✦ each", () => {
    const { state } = board({ player: {} });
    const legion = [0, 1, 2].map((index) => placeFigment(state, "player", { rank: "back", index }, figment(F.legion)));
    expect(legion.map((id) => spark(state, id))).toEqual([3, 3, 3]);
    const merged = act(state, "player", { kind: "reposition", card: legion[0], to: { rank: "back", index: 1 } }).state;
    // The destination gains 1 (the merged base spark); one fewer other warrior.
    expect(spark(merged, legion[1])).toBe(1 + 1 + 1);
  });
});

describe("figment costs and Support", () => {
  it("costs 0● for cost selectors; a figment copy has the cost it copied (C13)", () => {
    const { state } = board({ player: {} });
    const plain = placeFigment(state, "player", { rank: "back", index: 0 }, figment(F.warrior));
    const copy = placeFigment(state, "player", { rank: "back", index: 1 }, { kind: "figmentCopy", cardId: v.vanilla3.id, spark: null });
    const cheap = matchingCharacters(state, engine.catalog, characterYouControl({ costAtMost: 0 }), "player", plain);
    expect(cheap).toEqual([plain]);
    expect(matchingCharacters(state, engine.catalog, characterYouControl({ costAtMost: 3 }), "player", plain)).toEqual([plain, copy]);
  });

  it("applies a Support spark bonus once to each figment, and once to a merged figment", () => {
    const { state } = board({ player: { back: [null, CONTINUOUS.supporter.id] } });
    const left = placeFigment(state, "player", { rank: "front", index: 0 }, figment(F.warrior));
    const right = placeFigment(state, "player", { rank: "front", index: 1 }, figment(F.warrior));
    expect([spark(state, left), spark(state, right)]).toEqual([3, 3]);
    const merged = act(state, "player", { kind: "reposition", card: left, to: { rank: "front", index: 1 } }).state;
    expect(spark(merged, right)).toBe(1 + 1 + 2);
  });
});

describe("figment copies", () => {
  it("copies the card's copiable values for its variant, never its gained spark, counters, or statuses (C5)", () => {
    const { state, ids } = board({ player: { back: [ZONE.twinner.id, v.vanilla3.id], energy: 2 } });
    const original = ids.player.back[1]!;
    state.instances[original].status.gainedSpark = 4;
    state.instances[original].status.counters = 2;
    state.instances[original].status.reclaimed = true;
    const { state: after } = act(state, "player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }, [[original]]);
    const copy = backRank(after)[2]!;
    expect(after.instances[copy]).toMatchObject({
      printing: { kind: "figmentCopy", cardId: v.vanilla3.id, spark: null },
      status: { gainedSpark: 0, counters: 0, reclaimed: false, created: true },
    });
    expect(spark(after, copy)).toBe(3);
    expect(printedCard(engine.catalog, after.instances[copy].printing).costs).toEqual([energy(3)]);
  });

  it("an until-end-of-turn copy ceases to exist during that turn's Ending", () => {
    const { state, ids } = board({ player: { back: [ZONE.twinner.id, v.vanilla2.id], energy: 2 } });
    const after = act(state, "player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }, [[ids.player.back[1]!]]).state;
    const copy = backRank(after)[2]!;
    const ended = passUntil(engine, after, at(engine, "enemy", "day")).state;
    expect(ended.instances[copy]).toBeUndefined();
    expect(backRank(ended)[2]).toBeNull();
  });

  it("makes a 0✦ figment copy of an abandoned character from wherever it went", () => {
    const { state, ids } = board({ player: { back: [ZONE.reflection.id, ZONE.sacrifice.id, v.vanilla3.id] } });
    const after = act(state, "player", { kind: "activate", source: ids.player.back[1]!, ability: 0 }, [[ids.player.back[2]!]]).state;
    const copy = backRank(after)[2]!;
    expect(after.instances[copy].printing).toEqual({ kind: "figmentCopy", cardId: v.vanilla3.id, spark: 0 });
    expect(spark(after, copy)).toBe(0);
  });
});
