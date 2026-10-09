/**
 * Triggers (D14; rules § Ability Types → Triggered abilities): the queue and
 * its fixed order, named triggers, "when" patterns, functional zones,
 * intervening conditions, once-per-turn, floating and delayed triggers,
 * triggerAbility, disabled triggers, and prompts raised by triggers through
 * the fold.
 */
import { describe, expect, it } from "vitest";
import type { EngineAvatarDefinition, EngineCardDefinition, EngineDreamsignDefinition } from "../catalog";
import { all, characterYouControl, energy, event, self, target } from "../dsl/builders";
import {
  atStartOfTurn,
  onDawn,
  onDissolved,
  onMaterialized,
  triggered,
  triggeringCard,
  untilOpponentPays,
  whenDraw,
  whenGainsSpark,
  whenLeavesPlay,
  whenOpponentPlays,
  whenYouPlay,
} from "../dsl/triggers";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import { eventVisibleTo, type EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { effectiveSpark } from "../rules/spark";
import { deserializeState, stateHash } from "../state/hash";
import type { AbilitySource, CardId, InstanceId, Side } from "../state/ids";
import { battleSeed, opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { runStep } from "../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { Answer, PromptPurpose } from "../prompts/types";
import { boardState, type BoardSetup } from "../testing/board";
import { CONTINUOUS } from "../testing/continuous-cards";
import { invariantViolations } from "../testing/invariants";
import { STACK } from "../testing/stack-cards";
import { DSL } from "../testing/dsl-cards";
import { SYNTHETIC, syntheticId } from "../testing/synthetic-cards";
import { TRIGGER, TRIGGER_AVATAR, TRIGGER_DREAMSIGN } from "../testing/trigger-cards";
import { at, passUntil, triggerCatalog } from "../testing/trigger-harness";
import { parseAvatarId, parseDreamsignId } from "../../types/identifiers";

const v = SYNTHETIC;
const t = TRIGGER;
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);

function local(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], spark = 1): EngineCardDefinition {
  return {
    id: syntheticId(800 + index),
    cardType,
    costs: [energy(0)],
    spark: cardType === "character" ? spark : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const watching = () => [
  triggered(whenYouPlay(), p.gainEnergy(1), { zone: "any" }),
  triggered(whenOpponentPlays(), p.gainEnergy(1), { zone: "any" }),
];
const L = {
  /** "When you play a card, gain 1●. When the opponent plays a card, gain 1●." — in every zone. */
  watcher: local(1, "character", watching),
  dissolvedDraw: local(2, "character", () => [triggered(onDissolved(), p.draw(1))]),
  dissolvedEnergy: local(3, "character", () => [triggered(onDissolved(), p.gainEnergy(1))]),
  drawPoints: local(4, "character", () => [triggered(whenDraw(), p.gainPoints(1))], 2),
  /** "Dissolve each character you control with ✦ ≤ 1." */
  sweep: local(5, "event", () => [event(p.dissolve(all(characterYouControl({ sparkAtMost: 1 }))))]),
  /** "▸Materialized: Trigger this character's ▸Materialized ability." — a mandatory cycle. */
  echo: local(7, "character", () => [triggered(onMaterialized(), p.triggerAbility(self(), "materialized"))]),
  /** "If this card is in your void, when a character you control leaves play, gain 1●." */
  voidLeavesWatcher: local(8, "character", () => [triggered(whenLeavesPlay(characterYouControl()), p.gainEnergy(1), { zone: "void" })]),
  /** "▸Dawn: If you control 2 or more warriors, gain 1⍟." */
  ifTwoWarriors: local(6, "character", () => [
    triggered(onDawn(), p.gainPoints(1), { condition: { cond: "controls", selector: characterYouControl({ subtype: "Warrior" }), atLeast: 2 } }),
  ]),
  /** "When you play a Mage, gain 1●. When you play your second Mage in a turn, gain 1⍟." */
  mageWatcher: local(9, "character", () => [
    triggered(whenYouPlay({ subtype: "Mage" }), p.gainEnergy(1)),
    triggered(whenYouPlay({ subtype: "Mage" }, 2), p.gainPoints(1)),
  ]),
  /** A vanilla Warrior. */
  warrior: local(10, "character", () => []),
  /** "A character you control gains +0✦." */
  gainZero: local(11, "event", () => [event(p.gainSpark(target(characterYouControl()), 0))]),
  /** "A character you control gains −1✦." */
  shrinkAlly: local(12, "event", () => [event(p.gainSpark(target(characterYouControl()), -1))]),
  /** "A character you control gains +1✦ until the opponent pays 1●." */
  pumpUntilPays: local(13, "event", () => [event(p.gainSpark(target(characterYouControl()), 1, untilOpponentPays(1)))]),
  /** "When the opponent plays a card, this character gains +1✦." */
  opponentPlaysPump: local(14, "character", () => [triggered(whenOpponentPlays(), p.gainSpark(self(), 1))]),
  /** "A character you control gains 1 additional ✦" outside a gain trigger: a definition error. */
  strayAdditional: local(15, "event", () => [event(p.gainAdditionalSpark(target(characterYouControl()), 1))]),
  /** "Once per turn, when a character you control gains ✦, it gains 1 additional ✦." */
  additionalOnce: local(16, "character", () => [triggered(whenGainsSpark(), p.gainAdditionalSpark(triggeringCard(), 1), { oncePerTurn: true })]),
  /** "When a character you control gains ✦, gain 1●." */
  gainWatcher: local(17, "character", () => [triggered(whenGainsSpark(), p.gainEnergy(1))]),
} as const;
const WATCHER_AVATAR: EngineAvatarDefinition = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000000391"), status: "authored", abilities: watching };
const WATCHER_SIGN: EngineDreamsignDefinition = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000392"), status: "authored", abilities: watching };
/** "At the start of your turn, you may gain 1⍟." — a prompt while the turn is beginning. */
const START_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000394"),
  status: "authored",
  abilities: () => [triggered(atStartOfTurn(), p.optional(p.gainPoints(1)))],
};
/** "When you draw a card, gain 1●." */
const DRAW_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000395"),
  status: "authored",
  abilities: () => [triggered(whenDraw(), p.gainEnergy(1))],
};
/** "▸Dawn: Dissolve a character you control." */
const DAWN_AVATAR: EngineAvatarDefinition = {
  id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000000393"),
  status: "authored",
  abilities: () => [triggered(onDawn(), p.dissolve(target(characterYouControl())))],
};

/** "When a character you control gains ✦, return it to its owner's hand." */
const BOUNCE_GAINER_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000396"),
  status: "authored",
  abilities: () => [triggered(whenGainsSpark(), p.returnToHand(triggeringCard()))],
};
/** "When a character you control gains ✦, return each character you control with ✦ ≤ 1 to its owner's hand." */
const BOUNCE_SMALL_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000397"),
  status: "authored",
  abilities: () => [triggered(whenGainsSpark(), p.returnToHand(all(characterYouControl({ sparkAtMost: 1 }))))],
};
/** "When a character the opponent controls gains ✦, gain control of it." */
const STEAL_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000398"),
  status: "authored",
  abilities: () => [triggered(whenGainsSpark({ controller: "opponent" }), p.gainControl(triggeringCard()))],
};

const C = CONTINUOUS;
const engine = createEngine(
  triggerCatalog([...Object.values(L), C.warriorAnthem, C.supporter, C.spiritBond], {
    avatars: [WATCHER_AVATAR, DAWN_AVATAR],
    dreamsigns: [WATCHER_SIGN, START_SIGN, DRAW_SIGN, BOUNCE_GAINER_SIGN, BOUNCE_SMALL_SIGN, STEAL_SIGN],
  }),
);

function board(setup: Omit<BoardSetup, "phase" | "active"> & Partial<Pick<BoardSetup, "phase" | "active">>) {
  return boardState(engine.catalog, { active: "player", phase: "day", ...setup });
}

function play(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  const source = new ScriptedSource(answers);
  const result = engine.apply(state, side, { kind: "play", card, from: "hand" }, answers.length === 0 ? NO_PROMPTS : source);
  if (answers.length > 0) source.assertExhausted();
  return result;
}

function resolvedSources(events: readonly EngineEvent[]): AbilitySource[] {
  return events.flatMap((entry) => (entry.kind === "triggerResolved" ? [entry.source] : []));
}

function queuedCount(events: readonly EngineEvent[], source: AbilitySource): number {
  return events.filter((entry) => entry.kind === "triggerQueued" && JSON.stringify(entry.source) === JSON.stringify(source)).length;
}

/** Every string in a value, keys included. */
function strings(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    into.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) strings(entry, into);
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      into.add(key);
      strings(entry, into);
    }
  }
  return into;
}

describe("trigger order (D14)", () => {
  for (const active of ["player", "enemy"] as const) {
    it(`queues one event's matches with ${active} first: avatar, dreamsigns, B0→B9, F0→F8, then void, hand, deck`, () => {
      const other = opponent(active);
      const w = L.watcher.id;
      const { state, ids } = boardState(engine.catalog, {
        active,
        phase: "day",
        [active]: {
          avatar: WATCHER_AVATAR.id,
          dreamsigns: [WATCHER_SIGN.id, WATCHER_SIGN.id],
          front: [null, null, w],
          back: [w, null, null, null, null, w],
          hand: [v.event0.id, w, w],
          deck: [w],
          void: [w, w],
        },
        [other]: { avatar: WATCHER_AVATAR.id, dreamsigns: [WATCHER_SIGN.id], front: [w], back: [null, w], hand: [w], deck: [w], void: [w] },
      });
      const mine = ids[active];
      const theirs = ids[other];
      // Within a zone, cards go in the order they were created, not zone order.
      state.sides[active].void.reverse();
      const result = runStep(state, { kind: "play", from: "hand", card: mine.hand[0] }, NO_PROMPTS, engine.catalog);
      if (result.kind !== "done") throw new Error("suspended");
      const queue = result.state.triggerQueue.map((entry) => [entry.source, entry.ability]);
      expect(queue).toEqual([
        [{ kind: "avatar", side: active }, 0],
        [{ kind: "dreamsign", side: active, index: 0 }, 0],
        [{ kind: "dreamsign", side: active, index: 1 }, 0],
        [mine.back[0], 0],
        [mine.back[5], 0],
        [mine.front[2], 0],
        [mine.void[0], 0],
        [mine.void[1], 0],
        [mine.hand[1], 0],
        [mine.hand[2], 0],
        [mine.deck[0], 0],
        [{ kind: "avatar", side: other }, 1],
        [{ kind: "dreamsign", side: other, index: 0 }, 1],
        [theirs.back[1], 1],
        [theirs.front[0], 1],
        [theirs.void[0], 1],
        [theirs.hand[0], 1],
        [theirs.deck[0], 1],
      ]);
      // Nobody decides while triggers wait.
      expect(engine.decision(result.state)).toBeNull();
      expect(engine.legalActions(result.state, other)).toEqual([]);
    });
  }

  it("resolves separate events' triggers in event order, and appends triggers fired while resolving", () => {
    const { state, ids } = board({
      player: { back: [L.dissolvedDraw.id, L.dissolvedEnergy.id, L.drawPoints.id], hand: [L.sweep.id], deck },
      enemy: { deck },
    });
    const result = play(state, "player", ids.player.hand[0]);
    // ▸Dissolved fires from the void; the draw's trigger joins the end of the queue.
    expect(resolvedSources(result.events)).toEqual([ids.player.back[0], ids.player.back[1], ids.player.back[2]]);
    expect(result.state.sides.player.score).toBe(1);
    expect(result.state.sides.player.currentEnergy).toBe(1);
  });

  it("orders a card that has just left play by the zone it went to, while its trigger sees it as it was", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [t.leavesPlayEnergy.id, t.leavesPlayEnergy.id], deck },
      enemy: { hand: [DSL.dissolveEnemy.id], energy: 2, deck },
    });
    const departing = ids.player.back[0]!;
    const result = play(state, "enemy", ids.enemy.hand[0], [[departing]]);
    expect(result.state.instances[departing]?.zone).toBe("void");
    // B1 is still in play; B0 went to the void, which comes after every character in play.
    const queued = result.events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
    expect(queued).toEqual([ids.player.back[1], departing]);
    expect(result.state.sides.player.currentEnergy).toBe(2);
  });

  it("orders a card banished from play after its controller's deck", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [t.leavesPlayEnergy.id, t.leavesPlayEnergy.id], void: [L.voidLeavesWatcher.id], deck },
      enemy: { hand: [DSL.banishEnemyWithSparkAtMostTwo.id], energy: 1, deck },
    });
    const departing = ids.player.back[0]!;
    const result = play(state, "enemy", ids.enemy.hand[0], [[departing]]);
    expect(result.state.instances[departing]?.zone).toBe("banished");
    const queued = result.events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
    expect(queued).toEqual([ids.player.back[1], ids.player.void[0], departing]);
  });

  it("waits until the effect finishes, then resolves one trigger per step before priority", () => {
    const { state, ids } = board({
      player: { avatar: TRIGGER_AVATAR.eventDraw.id, back: [t.secondDrawEnergy.id], hand: [DSL.drawTwo.id], energy: 1, deck },
      enemy: { hand: [v.interruptEvent.id], energy: 1, deck },
    });
    const steps: { kind: string; events: readonly EngineEvent[]; state: BattleState }[] = [];
    let current = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS, (next, step, events) => {
      steps.push({ kind: step.kind, events, state: next });
    }).state;
    // The avatar's "when you play an event" resolves before the enemy may respond.
    expect(steps.map((step) => step.kind)).toEqual(["play", "resolveTrigger"]);
    expect(steps[0]?.state.triggerQueue).toHaveLength(1);
    // The enemy could respond, but nobody decides while the trigger waits.
    expect(engine.decision(steps[0].state)).toBeNull();
    expect(engine.legalActions(steps[0].state, "enemy")).toEqual([]);
    expect(engine.decision(current)).toEqual({ kind: "respond", side: "enemy" });
    steps.length = 0;
    current = engine.apply(current, "enemy", { kind: "pass" }, NO_PROMPTS, (next, step, events) => {
      steps.push({ kind: step.kind, events, state: next });
    }).state;
    // The second draw triggers mid-effect, but resolves only after the event finishes.
    expect(steps.map((step) => step.kind)).toEqual(["resolveTop", "resolveTrigger"]);
    expect(steps[0]?.events.filter((entry) => entry.kind === "cardDrawn")).toHaveLength(2);
    expect(steps[0]?.state.sides.player.currentEnergy).toBe(0);
    expect(current.sides.player.currentEnergy).toBe(1);
  });
});

describe("named triggers", () => {
  it("fires ▸Dawn, ▸Dusk, ▸Night, and ▸Challenge in their controller's phases, ▸Challenge only for challengers", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [t.dawnEnergy.id, t.duskPoints.id, t.challengeShrink.id], front: [t.challengeShrink.id, t.nightPump.id], deck },
      enemy: { back: [t.dawnEnergy.id, v.vanilla1.id], deck },
    });
    const mine = ids.player;
    const toDay = passUntil(engine, state, at(engine, "player", "day"));
    expect(resolvedSources(toDay.events)).toEqual([mine.back[0]]);
    const toNight = passUntil(engine, toDay.state, at(engine, "player", "night"), new ScriptedSource([[ids.enemy.back[1]!]]));
    // Dusk, then Night: the challengers' ▸Challenge (F0) before ▸Night (F1); B2 is no challenger.
    expect(resolvedSources(toNight.events)).toEqual([mine.back[1], mine.front[0], mine.front[1]]);
    expect(toNight.state.sides.player.score).toBe(1);
    expect(effectiveSpark(toNight.state, engine.catalog, ids.enemy.back[1]!)).toBe(0);
    expect(effectiveSpark(toNight.state, engine.catalog, mine.front[1]!)).toBe(2);
  });

  it("fires combined ▸Materialized, ▸Dawn on both occasions, and triggerAbility queues a named trigger outside its occasion", () => {
    const { state, ids } = board({
      player: { back: [t.materializedDraw.id], hand: [t.materializedOrDawn.id, t.retrigger.id], energy: 4, deck },
      enemy: { deck },
    });
    let current = play(state, "player", ids.player.hand[0]).state;
    expect(current.sides.player.currentEnergy).toBe(3);
    const handBefore = current.sides.player.hand.length;
    current = play(current, "player", ids.player.hand[1], [[ids.player.back[0]!]]).state;
    expect(current.sides.player.hand.length).toBe(handBefore);
    const enemyDay = passUntil(engine, current, at(engine, "enemy", "day"));
    const toDawn = passUntil(engine, enemyDay.state, at(engine, "player", "day"));
    expect(queuedCount(toDawn.events, current.sides.player.backRank[1]!)).toBe(1);
  });
});

describe("when patterns", () => {
  it("counts the nth card played this turn, and resets the count each turn", () => {
    const { state, ids } = board({ player: { back: [t.secondCardPoints.id], hand: [v.event0.id, v.event0.id, v.event0.id], deck }, enemy: { deck } });
    let current = state;
    const scores: number[] = [];
    for (const card of ids.player.hand) {
      current = play(current, "player", card).state;
      scores.push(current.sides.player.score);
    }
    expect(scores).toEqual([0, 1, 1]);
    expect(current.turnLog.played.player.map((entry) => entry.instance)).toEqual(ids.player.hand);
    const next = passUntil(engine, current, at(engine, "enemy", "day")).state;
    expect(next.turnLog.played.player).toEqual([]);
  });

  it("matches a played card by the types it had as it was played, including all character types", () => {
    const { state, ids } = board({ player: { back: [L.mageWatcher.id], hand: [L.warrior.id, L.warrior.id, L.warrior.id], deck }, enemy: { deck } });
    const [first, plain, last] = ids.player.hand;
    if (first === undefined || plain === undefined || last === undefined) throw new Error("no card");
    // As a resolved "gains all character types" effect leaves it: a floating type change that follows the card into hand.
    const withAllTypes = (current: BattleState, instance: InstanceId): BattleState => ({
      ...current,
      nextEffect: current.nextEffect + 1,
      floating: [
        ...current.floating,
        { id: `e${current.nextEffect}`, controller: "player", source: { kind: "avatar", side: "player" }, timestamp: 0, expiry: { at: "endOfTurn" }, change: { kind: "allTypes", instance } },
      ],
    });
    let current = play(withAllTypes(state, first), "player", first).state;
    expect(current.sides.player.currentEnergy).toBe(1);
    expect(current.sides.player.score).toBe(0);
    // The first card's type change ends; it still counts as a Mage played this turn.
    current = { ...current, floating: current.floating.filter((effect) => effect.change.kind !== "allTypes") };
    current = play(current, "player", plain).state;
    expect(current.sides.player.currentEnergy).toBe(1);
    expect(current.sides.player.score).toBe(0);
    current = play(withAllTypes(current, last), "player", last).state;
    expect(current.sides.player.currentEnergy).toBe(2);
    expect(current.sides.player.score).toBe(1);
  });

  it("triggers a once-per-turn ability once each turn", () => {
    const { state, ids } = board({ player: { back: [t.warriorEnergyOnce.id], hand: [v.vanilla0.id, v.vanilla0.id], deck }, enemy: { deck } });
    const first = play(state, "player", ids.player.hand[0]);
    const second = play(first.state, "player", ids.player.hand[1]);
    expect(second.state.sides.player.currentEnergy).toBe(1);
    expect(queuedCount([...first.events, ...second.events], ids.player.back[0]!)).toBe(1);
    const next = passUntil(engine, second.state, at(engine, "enemy", "day")).state;
    expect(next.oncePerTurn).toEqual([]);
  });

  it("matches draws by count, discards, abandons, and leaving play", () => {
    const drawn = board({ player: { back: [t.secondDrawEnergy.id], hand: [DSL.drawTwo.id], energy: 1, deck }, enemy: { deck } });
    expect(play(drawn.state, "player", drawn.ids.player.hand[0]).state.sides.player.currentEnergy).toBe(1);
    const discarded = board({ player: { avatar: TRIGGER_AVATAR.discardEnergy.id, hand: [DSL.discardTwo.id, v.vanilla1.id, v.vanilla1.id], deck }, enemy: { deck } });
    expect(play(discarded.state, "player", discarded.ids.player.hand[0]).state.sides.player.currentEnergy).toBe(2);
    const { state, ids } = board({ player: { back: [STACK.abandonToDraw.id, t.abandonDraw.id, t.leavesPlayEnergy.id, v.vanilla1.id], deck }, enemy: { deck } });
    const source = new ScriptedSource([[ids.player.back[3]!]]);
    const result = engine.apply(state, "player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }, source);
    // Leaving play is announced before the abandon itself.
    expect(resolvedSources(result.events)).toEqual([ids.player.back[2], ids.player.back[1]]);
    expect(result.state.sides.player.currentEnergy).toBe(1);
    expect(result.state.sides.player.hand).toHaveLength(3);
  });

  it("fires when a card leaves your void", () => {
    const { state, ids } = board({
      player: { dreamsigns: [TRIGGER_DREAMSIGN.voidLeaves.id], hand: [STACK.banishVoidToDraw.id], void: [v.vanilla1.id, v.vanilla1.id], deck },
      enemy: { deck },
    });
    expect(play(state, "player", ids.player.hand[0]).state.sides.player.currentEnergy).toBe(2);
  });

  it("fires on challenger designation for 'challenge with N', and on scoring for both sides", () => {
    const setup = (front: readonly CardId[]) =>
      board({ player: { back: [t.challengeWithTwo.id], front, deck }, enemy: { back: [t.opponentScoresEnergy.id], deck } });
    const two = setup([t.scoresDraw.id, v.vanilla1.id]);
    const dusk = passUntil(engine, two.state, (state) => state.turn.phase === "dusk");
    expect(resolvedSources(dusk.events)).toEqual([two.ids.player.back[0]]);
    expect(dusk.state.sides.player.currentEnergy).toBe(1);
    const scored = passUntil(engine, dusk.state, at(engine, "enemy", "day"));
    const challenge = scored.steps.filter((step) => step.step.kind === "challengeLane").flatMap((step) => step.events);
    expect(resolvedSources(challenge)).toEqual([]);
    // Each scoring challenger fires "when this scores" (its controller) and "when the opponent scores".
    const scoring = scored.events.filter((entry) => entry.kind === "triggerResolved");
    expect(scoring.map((entry) => entry.kind === "triggerResolved" && entry.source)).toEqual([
      two.ids.player.front[0],
      two.ids.enemy.back[0],
      two.ids.enemy.back[0],
    ]);
    const one = setup([t.scoresDraw.id]);
    expect(resolvedSources(passUntil(engine, one.state, (state) => state.turn.phase === "dusk").events)).toEqual([]);
  });

  it("fires at the start of each turn, and at the start of each side's own first turn", () => {
    const init = {
      seed: battleSeed("first-turn"),
      scoreToWin: 25,
      startingSide: "player" as const,
      decks: { player: deck.map((cardId) => ({ cardId })), enemy: deck.map((cardId) => ({ cardId })) },
      dreamwell: [],
      dreamsigns: { player: [TRIGGER_DREAMSIGN.firstTurnDraw.id, TRIGGER_DREAMSIGN.turnEnergy.id], enemy: [TRIGGER_DREAMSIGN.firstTurnDraw.id] },
    };
    const start = engine.createBattle(init, NO_PROMPTS);
    const sign = (side: Side, index: number): AbilitySource => ({ kind: "dreamsign", side, index });
    expect(resolvedSources(start.events)).toEqual([sign("player", 0), sign("player", 1)]);
    const enemyTurn = passUntil(engine, start.state, at(engine, "enemy", "day"));
    expect(resolvedSources(enemyTurn.events)).toEqual([sign("enemy", 0)]);
    const secondTurn = passUntil(engine, enemyTurn.state, at(engine, "player", "day"));
    expect(resolvedSources(secondTurn.events)).toEqual([sign("player", 1)]);
  });

  it("does not fire on the opening-hand draws, before the first turn begins", () => {
    const init = {
      seed: battleSeed("opening-draws"),
      scoreToWin: 25,
      startingSide: "enemy" as const,
      decks: { player: deck.map((cardId) => ({ cardId })), enemy: deck.map((cardId) => ({ cardId })) },
      dreamwell: [],
      dreamsigns: { player: [DRAW_SIGN.id], enemy: [] },
    };
    const start = engine.createBattle(init, NO_PROMPTS);
    expect(start.events.filter((entry) => entry.kind === "cardDrawn" && entry.side === "player").length).toBeGreaterThan(0);
    expect(queuedCount(start.events, { kind: "dreamsign", side: "player", index: 0 })).toBe(0);
    // The player's first draw, in its own first turn, is the first to trigger.
    const playerTurn = passUntil(engine, start.state, at(engine, "player", "day"));
    expect(queuedCount(playerTurn.events, { kind: "dreamsign", side: "player", index: 0 })).toBe(1);
  });

  it("resolves a start-of-turn trigger as the turn begins, before its Dreamwell phase", () => {
    const { state } = board({ active: "enemy", player: { dreamsigns: [TRIGGER_DREAMSIGN.turnEnergy.id], deck }, enemy: { deck } });
    const { events, steps } = passUntil(engine, state, at(engine, "player", "day"));
    const begins = events.findIndex((entry) => entry.kind === "turnStarted" && entry.side === "player");
    const resolved = events.findIndex((entry) => entry.kind === "triggerResolved");
    const dreamwell = events.findIndex((entry) => entry.kind === "phaseChanged" && entry.phase === "dreamwell" && entry.active === "player");
    expect(begins).toBeGreaterThanOrEqual(0);
    expect(resolved).toBeGreaterThan(begins);
    expect(dreamwell).toBeGreaterThan(resolved);
    // Nothing of the Dreamwell phase (its energy refill or draw) happens before the trigger resolves.
    const beforeResolving = events.slice(begins, resolved).map((entry) => entry.kind);
    expect(beforeResolving.filter((kind) => kind === "energyChanged" || kind === "dreamwellDrawn" || kind === "phaseChanged")).toEqual([]);
    // The Dreamwell phase is its own automatic step once the queue is empty.
    const kinds = steps.map((step) => step.step.kind);
    const trigger = kinds.indexOf("resolveTrigger");
    expect(kinds[trigger + 1]).toBe("advancePhase");
    expect(steps[trigger]?.state.triggerQueue).toEqual([]);
    for (const step of steps) expect(invariantViolations(step.state, engine.catalog)).toEqual([]);
  });

  it("suspends a start-of-turn prompt through the fold while the turn is beginning, then enters the Dreamwell phase", () => {
    const { state } = board({ active: "enemy", phase: "night", player: { dreamsigns: [START_SIGN.id], deck }, enemy: { deck } });
    const inline = engine.apply(state, "enemy", { kind: "pass" }, new ScriptedSource([true])).state;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = fold.reduce(start, { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (opened.kind !== "applied") throw new Error("bounced");
    // Reloading while the trigger waits reaches the same prompt, with the turn still beginning.
    const reloaded: BattleSlice = { ...opened.slice, committed: deserializeState(JSON.stringify(opened.slice.committed)) };
    expect(reloaded.committed.turn).toMatchObject({ active: "player", phase: "dreamwell", beginning: true });
    expect(reloaded.inFlight?.step).toEqual({ kind: "resolveTrigger" });
    const pending = fold.pending(reloaded);
    if (pending === null) throw new Error("no prompt");
    expect(pending.prompt).toMatchObject({
      side: "player",
      purpose: { source: { kind: "dreamsign", side: "player", index: 0, id: START_SIGN.id }, cardId: null, ability: 0, role: "youMay" },
    });
    const outcome = fold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true });
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("answer failed");
    expect(outcome.slice.inFlight).toBeNull();
    expect(outcome.slice.committed.turn).toMatchObject({ active: "player", phase: "day", beginning: false });
    expect(outcome.slice.committed.sides.player.score).toBe(1);
    expect(stateHash(outcome.slice.committed)).toBe(stateHash(inline));
  });

  it("never enters the Dreamwell phase when a start-of-turn trigger ends the battle", () => {
    const { state } = board({ active: "enemy", phase: "night", scoreToWin: 25, player: { score: 24, dreamsigns: [START_SIGN.id], deck }, enemy: { deck } });
    const result = engine.apply(state, "enemy", { kind: "pass" }, new ScriptedSource([true]));
    expect(result.state.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    expect(result.events.some((entry) => entry.kind === "phaseChanged" && entry.phase === "dreamwell")).toBe(false);
    expect(engine.decision(result.state)).toBeNull();
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("refers to the triggering card as 'it'", () => {
    const { state, ids } = board({ player: { back: [t.materializePumpsIt.id], hand: [v.vanilla1.id], energy: 1, deck }, enemy: { deck } });
    const current = play(state, "player", ids.player.hand[0]).state;
    expect(effectiveSpark(current, engine.catalog, ids.player.hand[0])).toBe(2);
    expect(effectiveSpark(current, engine.catalog, ids.player.back[0]!)).toBe(1);
  });
});

describe("functional zones and intervening conditions", () => {
  it("fires a void ability only while the card is in the void", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [t.voidDawnPoints.id], hand: [t.voidDawnPoints.id], void: [t.voidDawnPoints.id], deck: [v.vanilla1.id, t.voidDawnPoints.id] },
      enemy: { deck },
    });
    const day = passUntil(engine, state, at(engine, "player", "day"));
    expect(resolvedSources(day.events)).toEqual([ids.player.void[0]]);
    expect(day.state.sides.player.score).toBe(1);
  });

  it("names the avatar whose trigger asks for its target", () => {
    const { state, ids } = board({ active: "enemy", player: { avatar: DAWN_AVATAR.id, back: [v.vanilla1.id, v.vanilla1.id], deck }, enemy: { deck } });
    const purposes: PromptPurpose[] = [];
    const scripted = new ScriptedSource([[ids.player.back[1]!]]);
    passUntil(engine, state, at(engine, "player", "day"), {
      answer(prompt) {
        purposes.push(prompt.purpose);
        return scripted.answer(prompt);
      },
    });
    expect(purposes).toEqual([{ source: { kind: "avatar", side: "player", id: DAWN_AVATAR.id }, cardId: null, ability: 0, role: "target" }]);
  });

  it("checks an intervening 'if' when the ability triggers and again as it resolves", () => {
    const setup = (back: readonly CardId[]) => board({ active: "enemy", player: { avatar: DAWN_AVATAR.id, back, deck }, enemy: { deck } });
    const two = setup([L.ifTwoWarriors.id, v.vanilla1.id]);
    // The avatar's ▸Dawn resolves first and dissolves the second warrior.
    const day = passUntil(engine, two.state, at(engine, "player", "day"), new ScriptedSource([[two.ids.player.back[1]!]]));
    const resolutions = day.events.filter((entry) => entry.kind === "triggerResolved");
    expect(resolutions.map((entry) => entry.kind === "triggerResolved" && [entry.source, entry.applied])).toEqual([
      [{ kind: "avatar", side: "player" }, true],
      [two.ids.player.back[0], false],
    ]);
    expect(day.state.sides.player.score).toBe(0);
    // With one warrior at Dawn, it never triggers.
    const one = setup([L.ifTwoWarriors.id]);
    const alone = passUntil(engine, one.state, at(engine, "player", "day"), new ScriptedSource([[one.ids.player.back[0]!]]));
    expect(queuedCount(alone.events, one.ids.player.back[0]!)).toBe(0);
  });
});

describe("floating, delayed, and disabled triggers", () => {
  it("triggers a floating trigger each time until end of turn", () => {
    const { state, ids } = board({ player: { hand: [t.floatingDraw.id, v.vanilla0.id, v.vanilla0.id, v.vanilla0.id], energy: 1, deck }, enemy: { deck } });
    let current = play(state, "player", ids.player.hand[0]).state;
    current = play(current, "player", ids.player.hand[1]).state;
    current = play(current, "player", ids.player.hand[2]).state;
    expect(current.sides.player.hand).toHaveLength(3);
    const ended = passUntil(engine, current, at(engine, "enemy", "day"));
    expect(ended.state.floating).toEqual([]);
    expect(ended.events.some((entry) => entry.kind === "effectEnded")).toBe(true);
  });

  it("triggers a delayed trigger once, and ends an unfired one with its duration", () => {
    const { state, ids } = board({ player: { hand: [t.delayedPoints.id, v.event0.id, v.event0.id, t.delayedPoints.id], deck }, enemy: { deck } });
    let current = play(state, "player", ids.player.hand[0]).state;
    current = play(current, "player", ids.player.hand[1]).state;
    expect(current.sides.player.score).toBe(2);
    expect(current.floating).toEqual([]);
    current = play(current, "player", ids.player.hand[2]).state;
    expect(current.sides.player.score).toBe(2);
    current = play(current, "player", ids.player.hand[3]).state;
    expect(current.floating).toHaveLength(1);
    expect(passUntil(engine, current, at(engine, "enemy", "day")).state.floating).toEqual([]);
  });

  it("creates a delayed trigger from a triggered ability's effect", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [t.delayedByTrigger.id, DSL.returnAnyToHand.id], energy: 2, deck }, enemy: { deck } });
    let current = play(state, "player", ids.player.hand[0]).state;
    expect(current.floating.map((effect) => effect.change.kind)).toEqual(["trigger"]);
    current = play(current, "player", ids.player.hand[1], [[ids.player.back[0]!]]).state;
    expect(current.sides.player.currentEnergy).toBe(2);
    expect(current.floating).toEqual([]);
  });

  it("keeps a delayed trigger made by a card in a hidden hand private to that hand's holder", () => {
    const { state, ids } = board({ player: { hand: [v.event0.id], deck }, enemy: { hand: [t.handDelayed.id], deck } });
    const hidden = ids.enemy.hand[0];
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.state.floating.map((effect) => effect.source)).toEqual([hidden]);
    expect(result.events.some((entry) => entry.kind === "effectStarted")).toBe(true);
    const seenBy = (viewer: Side) =>
      strings([result.events.filter((entry) => eventVisibleTo(entry, viewer, result.state)), engine.view(result.state, viewer)]);
    const player = seenBy("player");
    expect(player.has(hidden)).toBe(false);
    expect(player.has(t.handDelayed.id)).toBe(false);
    const enemy = seenBy("enemy");
    expect(enemy.has(hidden)).toBe(true);
    expect(enemy.has(t.handDelayed.id)).toBe(true);
  });

  it("suppresses a disabled character's triggers until the duration ends", () => {
    const { state, ids } = board({
      player: { hand: [t.silenceEnemy.id, DSL.dissolveEnemy.id], energy: 2, deck },
      enemy: { back: [t.dissolvedRevenge.id], deck },
    });
    let current = play(state, "player", ids.player.hand[0]).state;
    expect(current.floating.map((effect) => effect.change.kind)).toEqual(["disableTriggers"]);
    const dissolved = play(current, "player", ids.player.hand[1]);
    expect(queuedCount(dissolved.events, ids.enemy.back[0]!)).toBe(0);
    current = passUntil(engine, dissolved.state, at(engine, "enemy", "day")).state;
    expect(current.floating).toEqual([]);
  });
});

describe("prompts raised by triggers", () => {
  const setup = () =>
    board({
      player: { back: [t.dissolvedRevenge.id, t.dissolvedRevenge.id], hand: [L.sweep.id], deck },
      enemy: { back: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck },
    });

  it("suspend and resume through the fold, trigger by trigger, matching the inline run", () => {
    const { state, ids } = setup();
    const answers: Answer[] = [[ids.enemy.back[0]!], [ids.enemy.back[2]!]];
    const inline = play(state, "player", ids.player.hand[0], answers).state;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (opened.kind !== "applied") throw new Error("bounced");
    let slice = opened.slice;
    const sources: PromptPurpose["source"][] = [];
    const firstId = fold.pending(slice)?.prompt.id;
    for (const answer of answers) {
      // Reloading mid-sequence reaches the identical prompt.
      const reloaded: BattleSlice = { ...slice, committed: deserializeState(JSON.stringify(slice.committed)) };
      const pending = fold.pending(reloaded);
      if (pending === null) throw new Error("no prompt");
      expect(pending.prompt).toEqual(fold.pending(slice)?.prompt);
      expect(slice.inFlight?.step).toEqual({ kind: "resolveTrigger" });
      sources.push(pending.prompt.purpose.source);
      expect(pending.prompt.cancellable).toBe(false);
      expect(fold.reduce(reloaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: answer })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      if (pending.prompt.id !== firstId && firstId !== undefined) {
        // An answer to the committed first trigger's prompt is stale.
        expect(fold.reduce(reloaded, { kind: "answer", side: "player", promptId: firstId, value: answer })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      }
      const outcome = fold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: answer });
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("answer failed");
      slice = outcome.slice;
    }
    // The first trigger committed before the second asked; each prompt names its own source.
    expect(sources).toEqual([ids.player.back[0], ids.player.back[1]]);
    expect(slice.inFlight).toBeNull();
    expect(stateHash(slice.committed)).toBe(stateHash(inline));
    expect(inline.sides.enemy.backRank.filter((id) => id !== null)).toEqual([ids.enemy.back[1]]);
  });

  it("does nothing when a trigger's required target has no candidates", () => {
    const { state, ids } = board({ player: { back: [t.dissolvedRevenge.id], hand: [L.sweep.id], deck }, enemy: { deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.events.some((entry) => entry.kind === "noLegalTarget")).toBe(true);
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
  });
});

describe("required trigger targets with too few candidates", () => {
  it("does nothing, without a prompt, when a required two-target trigger has one candidate", () => {
    const { state, ids } = board({ player: { back: [t.dissolvedTwo.id], hand: [L.sweep.id], deck }, enemy: { back: [v.vanilla1.id], deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.events.some((entry) => entry.kind === "noLegalTarget")).toBe(true);
    expect(result.events.some((entry) => entry.kind === "dissolved" && entry.instance === ids.enemy.back[0])).toBe(false);
    expect(result.state.sides.enemy.backRank[0]).toBe(ids.enemy.back[0]);
    expect(result.answers.filter((answer) => answer.auto === true)).toEqual([]);
  });

  it("does nothing, without a prompt, when a trigger's only candidate cannot be targeted", () => {
    const { state, ids } = board({ player: { back: [t.dissolvedRevenge.id], hand: [L.sweep.id], deck }, enemy: { back: [DSL.untargetableCharacter.id], deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.events).toContainEqual({ kind: "noLegalTarget", source: ids.player.back[0] });
    expect(result.state.sides.enemy.backRank[0]).toBe(ids.enemy.back[0]);
    expect(result.answers).toEqual([]);
  });

  it("chooses both targets when a required two-target trigger has enough candidates", () => {
    const { state, ids } = board({ player: { back: [t.dissolvedTwo.id], hand: [L.sweep.id], deck }, enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.events.some((entry) => entry.kind === "noLegalTarget")).toBe(false);
    expect(result.state.sides.enemy.backRank.filter((id) => id !== null)).toEqual([]);
  });
});

describe("trigger failure paths", () => {
  it("stops resolving queued triggers once the battle ends", () => {
    const { state } = board({ active: "player", phase: "day", scoreToWin: 25, player: { score: 24, back: [t.duskPoints.id, t.duskPoints.id], deck }, enemy: { deck } });
    const result = engine.apply(state, "player", { kind: "pass" }, NO_PROMPTS);
    expect(result.state.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    expect(result.events.filter((entry) => entry.kind === "triggerResolved")).toHaveLength(1);
    expect(result.state.triggerQueue).toHaveLength(1);
    expect(engine.decision(result.state)).toBeNull();
  });

  it("releases priority when a trigger prevents the last card on the stack", () => {
    const { state, ids } = board({ player: { hand: [v.event0.id], deck }, enemy: { back: [t.preventOnPlay.id], deck } });
    const steps: BattleState[] = [];
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS, (next) => {
      steps.push(next);
    });
    expect(result.events.some((entry) => entry.kind === "prevented")).toBe(true);
    expect(result.state.stack).toEqual([]);
    expect(result.state.priority).toBeNull();
    for (const step of steps) expect(invariantViolations(step, engine.catalog)).toEqual([]);
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
  });

  it("ends a trigger cycle nobody can stop, which repeats a state exactly, in a draw", () => {
    const { state, ids } = board({ player: { hand: [L.echo.id], deck }, enemy: { deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
  });

  it("throws, leaving the committed state alone, for an empty queue or a queued ability that is not a trigger", () => {
    const { state, ids } = board({ player: { back: [STACK.fastPump.id], deck }, enemy: { deck } });
    const before = stateHash(state);
    expect(() => runStep(state, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog)).toThrow();
    const source = ids.player.back[0]!;
    const corrupt: BattleState = {
      ...state,
      triggerQueue: [{ source, controller: "player", origin: { kind: "card", cardId: STACK.fastPump.id, variant: { amplified: false } }, ability: 0, node: null, subject: null }],
    };
    expect(() => runStep(corrupt, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog)).toThrow();
    expect(stateHash(state)).toBe(before);
  });
});

describe("additional spark (C17)", () => {
  const gains = (events: readonly EngineEvent[]) => events.flatMap((entry) => (entry.kind === "sparkGained" ? [entry] : []));

  it("adds 1✦ to each permanent gain once per source, stacking two sources without retriggering", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [DSL.pumpPermanently.id], dreamsigns: [TRIGGER_DREAMSIGN.additionalSpark.id], energy: 1, deck },
      enemy: { deck },
    });
    const ally = ids.player.back[1]!;
    const sign: AbilitySource = { kind: "dreamsign", side: "player", index: 0 };
    const result = play(state, "player", ids.player.hand[0], [[ally]]);
    expect(result.state.instances[ally]?.status.gainedSpark).toBe(3);
    expect(gains(result.events).map((entry) => [entry.instance, entry.amount, entry.expiry, entry.additional])).toEqual([
      [ally, 1, { at: "never" }, false],
      [ally, 1, { at: "never" }, true],
      [ally, 1, { at: "never" }, true],
    ]);
    const queued = result.events.flatMap((entry) => (entry.kind === "triggerQueued" ? [[entry.source, entry.subject, entry.gain]] : []));
    expect(queued).toEqual([
      [sign, ally, { amount: 1, expiry: { at: "never" } }],
      [ids.player.back[0], ally, { amount: 1, expiry: { at: "never" } }],
    ]);
    expect(result.state.triggerQueue).toEqual([]);
  });

  it("triggers no 'when … gains ✦' ability with an additional gain", () => {
    const { state, ids } = board({ player: { back: [L.additionalOnce.id, L.gainWatcher.id, v.vanilla1.id], hand: [DSL.pumpPermanently.id], energy: 1, deck }, enemy: { deck } });
    const ally = ids.player.back[2]!;
    const result = play(state, "player", ids.player.hand[0], [[ally]]);
    expect(result.state.instances[ally]?.status.gainedSpark).toBe(2);
    expect(queuedCount(result.events, ids.player.back[1]!)).toBe(1);
    expect(result.state.sides.player.currentEnergy).toBe(1);
  });

  it("gives each gain with a duration its additional ✦ with the same expiry, ending with it", () => {
    const { state, ids } = board({ player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [DSL.pumpUntilEndOfTurn.id], energy: 1, deck }, enemy: { deck } });
    const ally = ids.player.back[1]!;
    const pumped = play(state, "player", ids.player.hand[0], [[ally]]).state;
    expect(pumped.floating.map((effect) => [effect.change, effect.expiry])).toEqual([
      [{ kind: "spark", instance: ally, amount: 3 }, { at: "endOfTurn" }],
      [{ kind: "spark", instance: ally, amount: 1 }, { at: "endOfTurn" }],
    ]);
    expect(effectiveSpark(pumped, engine.catalog, ally)).toBe(5);
    const after = passUntil(engine, pumped, at(engine, "enemy", "day")).state;
    expect(after.floating).toEqual([]);
    expect(effectiveSpark(after, engine.catalog, ally)).toBe(1);
  });

  it("ends the additional ✦ of a 'while this is in play' gain as that gain's source leaves play", () => {
    const { state, ids } = board({ player: { back: [t.additionalSpark.id, v.vanilla2.id], hand: [t.whilePresentPump.id, L.sweep.id], energy: 2, deck }, enemy: { deck } });
    const ally = ids.player.back[1]!;
    const source = ids.player.hand[0];
    const pumped = play(state, "player", source, [[ally]]).state;
    expect(pumped.floating.map((effect) => effect.expiry)).toEqual([
      { at: "sourceLeavesPlay", source },
      { at: "sourceLeavesPlay", source },
    ]);
    expect(effectiveSpark(pumped, engine.catalog, ally)).toBe(5);
    const swept = play(pumped, "player", ids.player.hand[1]).state;
    expect(swept.instances[source]?.zone).toBe("void");
    expect(swept.floating).toEqual([]);
    expect(effectiveSpark(swept, engine.catalog, ally)).toBe(2);
  });

  it("links the additional ✦ of an 'until the opponent pays' gain to the same payable effect", () => {
    const { state, ids } = board({ player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [L.pumpUntilPays.id], deck }, enemy: { energy: 1, deck } });
    const ally = ids.player.back[1]!;
    let current = play(state, "player", ids.player.hand[0], [[ally]]).state;
    const [payable] = current.payable;
    expect(current.payable).toHaveLength(1);
    expect(current.floating.map((effect) => effect.expiry)).toEqual([
      { at: "paid", effect: payable.id },
      { at: "paid", effect: payable.id },
    ]);
    expect(effectiveSpark(current, engine.catalog, ally)).toBe(3);
    current = passUntil(engine, current, at(engine, "enemy", "day")).state;
    current = engine.apply(current, "enemy", { kind: "payToEnd", effect: payable.id }, NO_PROMPTS).state;
    expect(current.floating).toEqual([]);
    expect(effectiveSpark(current, engine.catalog, ally)).toBe(1);
  });

  it("does not trigger on spark a character has from anthems, Support, or a resolving 'have' effect", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id], front: [v.vanilla1.id], hand: [C.warriorAnthem.id, C.supporter.id, C.spiritBond.id], energy: 5, deck },
      enemy: { deck },
    });
    const events: EngineEvent[] = [];
    let current = state;
    for (const card of ids.player.hand) {
      const result = play(current, "player", card);
      events.push(...result.events);
      current = result.state;
    }
    expect(effectiveSpark(current, engine.catalog, ids.player.front[0]!)).toBeGreaterThan(1);
    expect(effectiveSpark(current, engine.catalog, ids.player.back[0]!)).toBeGreaterThan(2);
    expect(gains(events)).toEqual([]);
    expect(queuedCount(events, ids.player.back[0]!)).toBe(0);
  });

  it("does not trigger on a gain of +0✦ or −1✦", () => {
    const { state, ids } = board({ player: { back: [t.additionalSpark.id, v.vanilla2.id], hand: [L.gainZero.id, L.shrinkAlly.id], deck }, enemy: { deck } });
    const ally = ids.player.back[1]!;
    const zero = play(state, "player", ids.player.hand[0], [[ally]]);
    const shrunk = play(zero.state, "player", ids.player.hand[1], [[ally]]);
    expect(gains([...zero.events, ...shrunk.events]).map((entry) => entry.amount)).toEqual([0, -1]);
    expect(queuedCount([...zero.events, ...shrunk.events], ids.player.back[0]!)).toBe(0);
    expect(shrunk.state.instances[ally]?.status.gainedSpark).toBe(-1);
  });

  it("does nothing when the character leaves play before the trigger resolves, and keeps the original gain", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [DSL.pumpPermanently.id], dreamsigns: [BOUNCE_GAINER_SIGN.id], energy: 1, deck },
      enemy: { deck },
    });
    const ally = ids.player.back[1]!;
    const result = play(state, "player", ids.player.hand[0], [[ally]]);
    expect(queuedCount(result.events, ids.player.back[0]!)).toBe(1);
    expect(result.state.instances[ally]?.zone).toBe("hand");
    expect(result.state.instances[ally]?.status.gainedSpark).toBe(1);
    expect(gains(result.events).filter((entry) => entry.additional)).toEqual([]);
  });

  it("does nothing when the gain's duration ends before the trigger resolves", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id, v.vanilla2.id], hand: [t.whilePresentPump.id], dreamsigns: [BOUNCE_SMALL_SIGN.id], energy: 2, deck },
      enemy: { deck },
    });
    const ally = ids.player.back[1]!;
    const source = ids.player.hand[0];
    const result = play(state, "player", source, [[ally]]);
    expect(queuedCount(result.events, ids.player.back[0]!)).toBe(1);
    expect(result.state.instances[source]?.zone).toBe("hand");
    expect(result.state.floating).toEqual([]);
    expect(gains(result.events).filter((entry) => entry.additional)).toEqual([]);
    expect(effectiveSpark(result.state, engine.catalog, ally)).toBe(2);
  });

  it("still adds the additional ✦ when the character changes control before the trigger resolves", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [L.opponentPlaysPump.id, t.additionalSpark.id], deck },
      enemy: { hand: [v.event0.id], dreamsigns: [STEAL_SIGN.id], deck },
    });
    const pump = ids.player.back[0]!;
    const result = play(state, "enemy", ids.enemy.hand[0]);
    expect(result.state.instances[pump]?.controller).toBe("enemy");
    expect(result.state.instances[pump]?.status.gainedSpark).toBe(2);
    expect(gains(result.events).map((entry) => entry.additional)).toEqual([false, true]);
  });

  it("replays a queued additional-spark trigger identically after a reload, and shows its gain", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [DSL.pumpUntilEndOfTurn.id], dreamsigns: [TRIGGER_DREAMSIGN.additionalSpark.id], energy: 1, deck },
      enemy: { deck },
    });
    const ally = ids.player.back[1]!;
    const committed: BattleState[] = [];
    engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[ally]]), (next) => {
      committed.push(next);
    });
    const queued = committed.find((next) => next.triggerQueue.length === 2);
    if (queued === undefined) throw new Error("no queued triggers observed");
    const gain = { amount: 3, expiry: { at: "endOfTurn" } };
    expect(queued.triggerQueue.map((trigger) => trigger.gain)).toEqual([gain, gain]);
    expect(engine.view(queued, "enemy").triggerQueue.map((trigger) => trigger.gain)).toEqual([gain, gain]);
    const reloaded = deserializeState(JSON.stringify(queued));
    const first = runStep(queued, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog);
    const again = runStep(reloaded, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog);
    if (first.kind !== "done" || again.kind !== "done") throw new Error("suspended");
    expect(stateHash(again.state)).toBe(stateHash(first.state));
    expect(again.state.floating).toEqual(first.state.floating);
  });

  it("throws, leaving the committed state alone, when an additional gain resolves outside a gain trigger", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [L.strayAdditional.id], deck }, enemy: { deck } });
    const before = stateHash(state);
    expect(() => play(state, "player", ids.player.hand[0], [[ids.player.back[0]!]])).toThrow();
    expect(stateHash(state)).toBe(before);
  });
});
