/**
 * Zone changes and special mechanics (engine-design § Zones and zone
 * changes): the moveInstance replacements in order (created cards cease to
 * exist, reclaimed cards are banished, Veil), materialize placement and
 * capacity, leaving play, gain control, banish-until, Offering, Reclaim,
 * Ephemeral, and Phasing.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import { eventVisibleTo, type EngineEvent } from "../events";
import type { Answer } from "../prompts/types";
import type { Action } from "./actions";
import { SIDES, type InstanceId, type Side } from "../state/ids";
import type { BattleState, CardInstance } from "../state/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState, placeFigment, type BoardSetup } from "../testing/board";
import { DSL } from "../testing/dsl-cards";
import { invariantViolations } from "../testing/invariants";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { TRIGGER } from "../testing/trigger-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { ZONE, ZONE_FIGMENT, zoneCatalog } from "../testing/zone-cards";
import { freshStatus } from "../state/create";
import { hasKeyword } from "./keywords";

const engine = createEngine(zoneCatalog());
const v = SYNTHETIC;
const t = TRIGGER;
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const warrior = { kind: "figment", figment: ZONE_FIGMENT.warrior.id, spark: 1 } as const;

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

function play(state: BattleState, side: Side, card: InstanceId | null | undefined, answers: readonly Answer[] = []) {
  if (card === null || card === undefined) throw new Error("no card");
  return act(state, side, { kind: "play", card, from: "hand" }, answers);
}

function kinds(events: readonly EngineEvent[], instance: InstanceId): string[] {
  return events.filter((event) => "instance" in event && event.instance === instance).map((event) => event.kind);
}

function where(state: BattleState, id: InstanceId): CardInstance["zone"] | null {
  return state.instances[id]?.zone ?? null;
}

/** The enemy, in its own Day, plays "Dissolve an enemy" at `target`. */
function enemyDissolves(state: BattleState, target: InstanceId) {
  const hand = [...state.sides.enemy.hand];
  const ready = structuredClone(state);
  ready.turn = { ...ready.turn, active: "enemy", phase: "day" };
  ready.sides.enemy.currentEnergy = 5;
  const card = hand.find((id) => ready.instances[id]?.printing.kind === "card" && ready.instances[id].printing.cardId === DSL.dissolveEnemy.id);
  const candidates = ready.sides.player.backRank.concat(ready.sides.player.frontRank).filter((id) => id !== null);
  return play(ready, "enemy", card, candidates.length > 1 ? [[target]] : []);
}

describe("zone-change replacements", () => {
  it("a created card ceases to exist instead of entering a hand, firing nothing that names a zone", () => {
    const { state, ids } = board({ player: { back: [t.leavesPlayEnergy.id], hand: [DSL.returnAnyToHand.id], energy: 1 } });
    const figment = placeFigment(state, "player", { rank: "back", index: 1 }, warrior);
    const { state: after, events } = play(state, "player", ids.player.hand[0], [[figment]]);
    expect(after.instances[figment]).toBeUndefined();
    expect(kinds(events, figment)).toEqual(["leftPlay", "ceasedToExist"]);
    // It ceased from play, where both sides saw it.
    const ceased = events.find((event) => event.kind === "ceasedToExist");
    expect(ceased).toEqual({ kind: "ceasedToExist", instance: figment, side: "player", from: "play" });
    for (const viewer of SIDES) expect(ceased !== undefined && eventVisibleTo(ceased, viewer, after)).toBe(true);
    expect(after.sides.player.hand).toEqual([]);
    // "When a character you control leaves play" still sees it leave.
    expect(after.sides.player.currentEnergy).toBe(1);
  });

  it("a dissolved figment fires ▸Dissolved first, then ceases to exist", () => {
    const { state, ids } = board({ enemy: { hand: [DSL.dissolveEnemy.id], back: [null, v.vanilla2.id] } });
    const copy = placeFigment(state, "player", { rank: "back", index: 0 }, { kind: "figmentCopy", cardId: t.dissolvedRevenge.id, spark: null });
    const { state: after, events } = enemyDissolves(state, copy);
    expect(kinds(events, copy)).toEqual(["leftPlay", "dissolved", "ceasedToExist"]);
    expect(events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: copy }));
    // Its ▸Dissolved resolved after it ceased: the enemy character is dissolved.
    expect(where(after, ids.enemy.back[1]!)).toBe("void");
    expect(after.instances[copy]).toBeUndefined();
  });

  it("a reclaimed character is banished instead of dissolved, without ▸Dissolved, and instead of returning to hand", () => {
    const { state, ids } = board({ player: { back: [t.dissolvedRevenge.id] }, enemy: { hand: [DSL.dissolveEnemy.id], back: [v.vanilla2.id] } });
    const revenge = ids.player.back[0]!;
    state.instances[revenge].status.reclaimed = true;
    const { state: after, events } = enemyDissolves(state, revenge);
    expect(where(after, revenge)).toBe("banished");
    expect(after.sides.player.banished).toEqual([revenge]);
    expect(kinds(events, revenge)).not.toContain("dissolved");
    expect(where(after, ids.enemy.back[0]!)).toBe("play");

    const returned = board({ player: { back: [v.vanilla1.id], hand: [DSL.returnAnyToHand.id], energy: 1 } });
    const card = returned.ids.player.back[0]!;
    returned.state.instances[card].status.reclaimed = true;
    const back = play(returned.state, "player", returned.ids.player.hand[0]).state;
    expect(where(back, card)).toBe("banished");
  });

  it("Veil turns the opponent's dissolve into losing Veil; its own controller's abandon still dissolves it", () => {
    const { state, ids } = board({ enemy: { hand: [DSL.dissolveEnemy.id, DSL.dissolveEnemy.id] }, player: { back: [ZONE.veiled.id, ZONE.sacrifice.id] } });
    const veiled = ids.player.back[0]!;
    const first = enemyDissolves(state, veiled);
    expect(where(first.state, veiled)).toBe("play");
    expect(hasKeyword(first.state, engine.catalog, veiled, "veil")).toBe(false);
    expect(kinds(first.events, veiled)).not.toContain("dissolved");
    expect(where(enemyDissolves(first.state, veiled).state, veiled)).toBe("void");

    const abandon = act(state, "player", { kind: "activate", source: ids.player.back[1]!, ability: 0 }, [[veiled]]);
    expect(where(abandon.state, veiled)).toBe("void");
    expect(kinds(abandon.events, veiled)).toEqual(["leftPlay", "abandoned", "dissolved"]);
  });

  it("applies the replacements in order: a reclaimed Veil character is banished, a Veil figment only loses Veil", () => {
    const { state, ids } = board({ enemy: { hand: [DSL.dissolveEnemy.id] }, player: { back: [ZONE.veiled.id] } });
    const veiled = ids.player.back[0]!;
    state.instances[veiled].status.reclaimed = true;
    expect(where(enemyDissolves(state, veiled).state, veiled)).toBe("banished");

    const figmentBoard = board({ enemy: { hand: [DSL.dissolveEnemy.id] } });
    const copy = placeFigment(figmentBoard.state, "player", { rank: "back", index: 0 }, { kind: "figmentCopy", cardId: ZONE.veiled.id, spark: null });
    const after = enemyDissolves(figmentBoard.state, copy).state;
    expect(where(after, copy)).toBe("play");
    expect(hasKeyword(after, engine.catalog, copy, "veil")).toBe(false);
  });
});

const fullBack = Array.from({ length: 10 }, () => v.vanilla1.id);

describe("leaving play", () => {
  it("returns an exhausted character to hand ready, as if drawn, and it enters per the normal rules when replayed", () => {
    for (const card of [v.vanilla2.id, v.awakened2.id]) {
      const { state, ids } = board({ player: { back: [card], hand: [DSL.returnAnyToHand.id], energy: 5 } });
      const bounced = ids.player.back[0]!;
      const ready = structuredClone(state);
      ready.instances[bounced].status = { ...ready.instances[bounced].status, exhausted: true, counters: 2 };
      const returned = play(ready, "player", ids.player.hand[0]).state;
      expect(returned.instances[bounced]).toMatchObject({ zone: "hand", status: freshStatus() });
      const replayed = play(returned, "player", bounced).state;
      expect(where(replayed, bounced)).toBe("play");
      expect(replayed.instances[bounced].status.exhausted).toBe(card !== v.awakened2.id);
    }
  });
});

describe("materialize placement and capacity", () => {
  it("enters the leftmost open back-rank position, or the open position a UI drop names", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id, null, v.vanilla1.id], hand: [v.vanilla2.id, v.vanilla2.id], energy: 4 } });
    const plain = play(state, "player", ids.player.hand[0]).state;
    expect(plain.sides.player.backRank[1]).toBe(ids.player.hand[0]);
    const dropped = act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand", slot: { rank: "back", index: 6 } }).state;
    expect(dropped.sides.player.backRank[6]).toBe(ids.player.hand[0]);
    expect(dropped.instances[ids.player.hand[0]].status.exhausted).toBe(true);
    // A drop on an occupied position is not a legal action.
    expect(() => engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand", slot: { rank: "back", index: 0 } }, NO_PROMPTS)).toThrow();
  });

  it("makes plays and activations that would put a character into play illegal with a full back rank", () => {
    const { state, ids } = board({ player: { back: [ZONE.twinner.id, ...fullBack.slice(1)], hand: [v.vanilla1.id, ZONE.twoWarriors.id, DSL.drawTwo.id], energy: 5 } });
    const legal = engine.legalActions(state, "player");
    expect(legal).toContainEqual({ kind: "play", card: ids.player.hand[2], from: "hand" });
    expect(legal.some((action) => action.kind === "play" && action.card !== ids.player.hand[2])).toBe(false);
    expect(legal.some((action) => action.kind === "activate")).toBe(false);
  });
});

describe("gain control", () => {
  it("moves an enemy to the leftmost open back-rank position, exhausted, keeping its owner", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [ZONE.seize.id], energy: 3 }, enemy: { front: [v.awakened2.id] } });
    const taken = ids.enemy.front[0]!;
    const { state: after, events } = play(state, "player", ids.player.hand[0]);
    expect(after.sides.player.backRank[1]).toBe(taken);
    expect(after.sides.enemy.frontRank[0]).toBeNull();
    expect(after.instances[taken]).toMatchObject({ controller: "player", owner: "enemy", zone: "play", status: { exhausted: true } });
    expect(events).toContainEqual({ kind: "controlChanged", instance: taken, from: "enemy", to: "player", slot: { rank: "back", index: 1 } });
    expect(kinds(events, taken)).not.toContain("materialized");
  });

  it("fails when the receiving back rank is full", () => {
    const { state, ids } = board({ player: { back: fullBack, hand: [ZONE.seize.id], energy: 3 }, enemy: { front: [v.vanilla2.id] } });
    const { state: after, events } = play(state, "player", ids.player.hand[0]);
    expect(after.instances[ids.enemy.front[0]!].controller).toBe("enemy");
    expect(events).toContainEqual({ kind: "capacityReached", side: "player", instance: ids.enemy.front[0], missing: 1 });
  });
});

describe("banish until", () => {
  it("returns a card banished until end of turn during Ending, as a materialize under its prior controller", () => {
    const { state, ids } = board({ player: { hand: [ZONE.exile.id], energy: 1 }, enemy: { back: [v.vanilla1.id, ZONE.legionCaller.id] } });
    const caller = ids.enemy.back[1]!;
    const banished = play(state, "player", ids.player.hand[0], [[caller]]).state;
    expect(where(banished, caller)).toBe("banished");
    const { state: ended, events } = passUntil(engine, banished, at(engine, "enemy", "day"));
    expect(ended.sides.enemy.backRank[1]).toBe(caller);
    // ▸Materialized fired: its figment took the next open position.
    expect(events).toContainEqual(expect.objectContaining({ kind: "materialized", instance: caller }));
    expect(ended.instances[ended.sides.enemy.backRank[2]!]?.printing.kind).toBe("figment");
  });

  it("stays banished when the prior controller's back rank is full", () => {
    const { state, ids } = board({ player: { hand: [ZONE.exile.id], energy: 1 }, enemy: { back: fullBack } });
    const target = ids.enemy.back[3]!;
    const blocked = structuredClone(play(state, "player", ids.player.hand[0], [[target]]).state);
    // Something else takes the open position before the return.
    const occupant = placeFigment(blocked, "enemy", { rank: "back", index: 3 }, warrior);
    const { state: ended, events } = passUntil(engine, blocked, at(engine, "enemy", "day"));
    expect(where(ended, target)).toBe("banished");
    expect(ended.sides.enemy.backRank[3]).toBe(occupant);
    expect(events).toContainEqual({ kind: "capacityReached", side: "enemy", instance: target, missing: 1 });
  });

  it("returns a card banished until its banisher leaves play as the banisher leaves", () => {
    const { state, ids } = board({ player: { hand: [ZONE.warden.id], energy: 2 }, enemy: { front: [v.vanilla2.id], hand: [DSL.dissolveEnemy.id] } });
    const target = ids.enemy.front[0]!;
    const warded = play(state, "player", ids.player.hand[0]).state;
    expect(where(warded, target)).toBe("banished");
    const warden = warded.sides.player.backRank[0]!;
    const returned = enemyDissolves(warded, warden).state;
    expect(where(returned, warden)).toBe("void");
    expect(returned.sides.enemy.backRank[0]).toBe(target);
  });

  it("returns a card banished until the next Day phase as that Day begins", () => {
    const { state, ids } = board({ player: { hand: [ZONE.dayExile.id], energy: 1 }, enemy: { back: [v.vanilla1.id] } });
    const target = ids.enemy.back[0]!;
    const banished = play(state, "player", ids.player.hand[0]).state;
    expect(where(passUntil(engine, banished, at(engine, "player", "night")).state, target)).toBe("banished");
    expect(where(passUntil(engine, banished, at(engine, "enemy", "day")).state, target)).toBe("play");
  });
});

describe("Offering, Reclaim, and Ephemeral", () => {
  it("plays an Offering card for 0● by banishing a card from hand, then banishes it during Ending", () => {
    const { state, ids } = board({ player: { hand: [ZONE.offeringDraw.id, v.vanilla1.id], energy: 0 } });
    const [offered, fodder] = ids.player.hand;
    const { state: after } = play(state, "player", offered);
    expect(where(after, fodder)).toBe("banished");
    expect(where(after, offered)).toBe("void");
    expect(after.instances[offered].status.offering).toBe(true);
    expect(after.sides.player.hand).toHaveLength(2);
    expect(where(passUntil(engine, after, at(engine, "enemy", "day")).state, offered)).toBe("banished");
    // With no other card to banish, Offering cannot pay.
    const alone = board({ player: { hand: [ZONE.offeringDraw.id], energy: 0 } });
    expect(engine.legalActions(alone.state, "player").some((action) => action.kind === "play")).toBe(false);
    // Nor is it offered as a route: the card's own costs are chosen without a prompt.
    const paying = board({ player: { hand: [ZONE.offeringDraw.id], energy: 3 } });
    expect(play(paying.state, "player", paying.ids.player.hand[0]).state.sides.player.currentEnergy).toBe(0);
  });

  it("offers the choice between Offering and the card's costs when both can be paid", () => {
    const { state, ids } = board({ player: { hand: [ZONE.offeringBrute.id, v.vanilla1.id], energy: 4 } });
    const [brute, fodder] = ids.player.hand;
    const paid = play(state, "player", brute, [0]).state;
    expect(paid.sides.player.currentEnergy).toBe(0);
    expect(where(paid, fodder)).toBe("hand");
    expect(where(passUntil(engine, paid, at(engine, "enemy", "day")).state, brute)).toBe("play");
    const offered = play(state, "player", brute, [1]).state;
    expect(offered.sides.player.currentEnergy).toBe(4);
    // It stays in play for the turn, then is banished during Ending.
    expect(where(offered, brute)).toBe("play");
    expect(where(passUntil(engine, offered, at(engine, "enemy", "day")).state, brute)).toBe("banished");
  });

  it("plays a Reclaim card from its owner's void for its reclaim cost; it is banished instead of leaving", () => {
    const { state, ids } = board({ player: { void: [ZONE.reclaimDraw.id, ZONE.reclaimer.id, v.vanilla1.id], energy: 2 } });
    const [event, character, plain] = ids.player.void;
    const legal = engine.legalActions(state, "player");
    expect(legal).toContainEqual({ kind: "play", card: event, from: "void" });
    expect(legal).toContainEqual({ kind: "play", card: character, from: "void" });
    expect(legal.some((action) => action.kind === "play" && action.card === plain)).toBe(false);
    expect(engine.legalActions(state, "enemy")).toEqual([]);
    const { state: after, events } = act(state, "player", { kind: "play", card: event, from: "void" });
    expect(events).toContainEqual({ kind: "leftVoid", instance: event, side: "player", to: "stack" });
    expect(after.sides.player.currentEnergy).toBe(1);
    expect(where(after, event)).toBe("banished");
    const reclaimed = act(after, "player", { kind: "play", card: character, from: "void" }).state;
    expect(reclaimed.instances[character]).toMatchObject({ zone: "play", status: { reclaimed: true } });
  });

  it("banishes Ephemeral cards still in hand during Ending, not those played", () => {
    const { state, ids } = board({ player: { hand: [ZONE.ephemeralDraw.id], energy: 1, deck: [v.vanilla0.id, v.vanilla1.id, ...deck] } });
    const drawn = play(state, "player", ids.player.hand[0]).state;
    const [first, second] = drawn.sides.player.hand;
    expect(drawn.instances[first].status.ephemeral).toBe(true);
    const played = play(drawn, "player", first).state;
    expect(played.instances[first].status.ephemeral).toBe(false);
    const ended = passUntil(engine, played, at(engine, "enemy", "day")).state;
    expect(where(ended, second)).toBe("banished");
    expect(where(ended, first)).toBe("play");
  });
});

describe("Phasing", () => {
  it("returns another character you control to hand and moves into its position", () => {
    const { state, ids } = board({ player: { front: [null, null, v.vanilla1.id], back: [v.vanilla2.id], hand: [ZONE.phaser.id], energy: 2 } });
    const front = ids.player.front[2]!;
    const { state: after } = play(state, "player", ids.player.hand[0], [[front]]);
    expect(after.sides.player.frontRank[2]).toBe(ids.player.hand[0]);
    expect(where(after, front)).toBe("hand");
    expect(after.sides.player.backRank[1]).toBeNull();
  });
});
