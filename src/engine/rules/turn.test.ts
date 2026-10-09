import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../catalog";
import { all, characterYouControl, energy, enemyCharacter, event, noCardsIn, target, winCondition } from "../dsl/builders";
import type { Ability } from "../dsl/types";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { eventLogRecords } from "../log";
import { stateHash } from "../state/hash";
import type { BattleInit, BattleState } from "../state/types";
import type { Side } from "../state/ids";
import { battleSeed } from "../state/ids";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState } from "../testing/board";
import { DSL, DSL_CARDS } from "../testing/dsl-cards";
import { SYNTHETIC, SYNTHETIC_DREAMWELL, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { parseDreamsignId } from "../../types/identifiers";

const engine = createEngine(testCatalog());
const v = SYNTHETIC;
const dreamwell = SYNTHETIC_DREAMWELL.map((card) => card.id);

function init(overrides: Partial<BattleInit> = {}): BattleInit {
  return {
    seed: battleSeed("turn-test"),
    scoreToWin: 25,
    startingSide: "player",
    decks: {
      player: Array.from({ length: 20 }, () => ({ cardId: v.vanilla1.id })),
      enemy: Array.from({ length: 20 }, () => ({ cardId: v.vanilla2.id })),
    },
    dreamwell,
    ...overrides,
  };
}

/** Passes for whichever side holds the decision until `done` holds. */
function passUntil(
  state: BattleState,
  done: (state: BattleState) => boolean,
): { state: BattleState; events: EngineEvent[] } {
  const events: EngineEvent[] = [];
  for (let guard = 0; guard < 200 && !done(state) && state.result === null; guard++) {
    const pending = engine.decision(state);
    if (pending === null) throw new Error("no decision");
    const result = engine.apply(state, pending.side, { kind: "pass" }, NO_PROMPTS);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

function turnStarts(events: readonly EngineEvent[]): { side: Side; round: number; extra: boolean }[] {
  return events.flatMap((event) =>
    event.kind === "turnStarted" ? [{ side: event.side, round: event.round, extra: event.extra }] : [],
  );
}

describe("battle start and the phase machine", () => {
  it("deals opening hands and stops at the starting side's Day without a first draw", () => {
    const { state, events } = engine.createBattle(init(), NO_PROMPTS);
    expect(state.turn).toMatchObject({ active: "player", phase: "day", round: 1, turnNumber: 1 });
    expect(engine.decision(state)).toEqual({ kind: "main", side: "player" });
    expect(state.sides.player.hand).toHaveLength(5);
    expect(state.sides.enemy.hand).toHaveLength(5);
    expect(events.some((event) => event.kind === "dreamwellDrawn")).toBe(false);
  });

  it("gives Dusk to the non-active side and Night back to the active side", () => {
    let { state } = engine.createBattle(init(), NO_PROMPTS);
    state = engine.apply(state, "player", { kind: "pass" }, NO_PROMPTS).state;
    expect(state.turn.phase).toBe("dusk");
    expect(engine.decision(state)).toEqual({ kind: "main", side: "enemy" });
    state = engine.apply(state, "enemy", { kind: "pass" }, NO_PROMPTS).state;
    expect(state.turn.phase).toBe("night");
    expect(engine.decision(state)).toEqual({ kind: "main", side: "player" });
  });

  it("lets the second side draw on its first turn and starts the Dreamwell in round 2", () => {
    const start = engine.createBattle(init(), NO_PROMPTS).state;
    const enemyTurn = passUntil(start, (state) => state.turn.active === "enemy" && state.turn.phase === "day");
    expect(enemyTurn.state.sides.enemy.hand).toHaveLength(6);
    expect(enemyTurn.events.some((event) => event.kind === "dreamwellDrawn")).toBe(false);
    const roundTwo = passUntil(enemyTurn.state, (state) => state.turn.round === 2 && state.turn.phase === "day");
    const drawn = roundTwo.events.find((event) => event.kind === "dreamwellDrawn");
    expect(drawn?.kind === "dreamwellDrawn" && drawn.side).toBe("player");
    const added = drawn?.kind === "dreamwellDrawn" ? drawn.energyAdded : 0;
    expect(roundTwo.state.sides.player.maxEnergy).toBe(added);
    expect(roundTwo.state.sides.player.currentEnergy).toBe(added);
    expect(roundTwo.state.sides.player.hand).toHaveLength(6);
  });

  it("resets current energy to maximum at the start of the side's turn", () => {
    const { state: start } = boardState(engine.catalog, {
      active: "enemy",
      phase: "day",
      round: 3,
      player: { energy: 3, deck: [v.vanilla1.id, v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id, v.vanilla1.id] },
    });
    start.sides.player.currentEnergy = 0;
    const { state } = passUntil(start, (s) => s.turn.active === "player" && s.turn.phase === "day");
    expect(state.sides.player.currentEnergy).toBe(state.sides.player.maxEnergy);
    expect(state.sides.player.maxEnergy).toBeGreaterThanOrEqual(3);
  });

  it("clears exhaustion during Ending", () => {
    let { state } = engine.createBattle(
      init({ decks: { player: Array.from({ length: 20 }, () => ({ cardId: v.vanilla0.id })), enemy: init().decks.enemy } }),
      NO_PROMPTS,
    );
    const card = state.sides.player.hand[0];
    if (card === undefined) throw new Error("empty hand");
    state = engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS).state;
    expect(state.instances[card]).toMatchObject({ zone: "play", status: { exhausted: true } });
    expect(state.sides.player.backRank[0]).toBe(card);
    state = passUntil(state, (s) => s.turn.active === "enemy").state;
    expect(state.instances[card]?.status.exhausted).toBe(false);
  });

  it("counts a round when the second side's turn ends and draws at the turn limit", () => {
    const { state: start } = boardState(engine.catalog, {
      active: "enemy",
      phase: "night",
      round: 50,
      player: { deck: [v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id] },
    });
    start.turn.lastNormal = "enemy";
    const { state, events } = passUntil(start, () => false);
    expect(state.result).toEqual({ kind: "draw", reason: "turnLimit" });
    expect(turnStarts(events)).toEqual([]);
    const { state: earlier } = boardState(engine.catalog, {
      active: "enemy",
      phase: "night",
      round: 7,
      player: { deck: [v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id] },
    });
    const next = passUntil(earlier, (s) => s.turn.active === "player");
    expect(turnStarts(next.events)).toEqual([{ side: "player", round: 8, extra: false }]);
  });

  it("takes pending extra turns most recent first, outside the round count, with a Dreamwell draw", () => {
    const { state: start } = boardState(engine.catalog, {
      active: "player",
      phase: "night",
      round: 1,
      player: { deck: Array.from({ length: 5 }, () => v.vanilla1.id) },
      enemy: { deck: Array.from({ length: 5 }, () => v.vanilla1.id) },
    });
    start.dreamwell = { deck: dreamwell.slice(0, 10), next: 0, catalog: dreamwell };
    start.turn.extraTurns = ["enemy", "player"];
    const { events } = passUntil(start, (s) => s.turn.active === "player" && !s.turn.extra && s.turn.round === 2);
    expect(turnStarts(events)).toEqual([
      { side: "player", round: 1, extra: true },
      { side: "enemy", round: 1, extra: true },
      { side: "enemy", round: 1, extra: false },
      { side: "player", round: 2, extra: false },
    ]);
    const dreamwellDraws = events.flatMap((event) => (event.kind === "dreamwellDrawn" ? [event.side] : []));
    expect(dreamwellDraws.slice(0, 2)).toEqual(["player", "enemy"]);
  });

  it("awards Fatigue points to the opponent, doubling each time", () => {
    const { state: start } = boardState(engine.catalog, {
      active: "enemy",
      phase: "night",
      round: 3,
      player: { deck: [] },
      enemy: { deck: Array.from({ length: 5 }, () => v.vanilla1.id) },
    });
    let { state } = passUntil(start, (s) => s.turn.active === "player" && s.turn.phase === "day");
    expect(state.sides.enemy.score).toBe(1);
    state = passUntil(state, (s) => s.turn.active === "player" && s.turn.phase === "day" && s.sides.enemy.score > 1).state;
    expect(state.sides.enemy.score).toBe(3);
  });
});

describe("victory", () => {
  it("ends the battle when a side reaches the score threshold", () => {
    const { state: start } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      scoreToWin: 10,
      player: { score: 8, front: [v.vanilla3.id], deck: [v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id] },
    });
    const { state } = passUntil(start, () => false);
    expect(state.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    expect(engine.decision(state)).toBeNull();
    expect(engine.legalActions(state, "player")).toEqual([]);
  });

  it("is a draw when both sides are at the threshold in the same check", () => {
    const { state: start } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      scoreToWin: 10,
      player: { score: 10, deck: [v.vanilla1.id] },
      enemy: { score: 12, deck: [v.vanilla1.id] },
    });
    const { state } = engine.apply(start, "player", { kind: "pass" }, NO_PROMPTS);
    expect(state.result).toEqual({ kind: "draw", reason: "score" });
  });
});

function winFixture(index: number, cardType: "character" | "event", abilities: readonly Ability[]): EngineCardDefinition {
  return {
    id: syntheticId(0x980 + index),
    cardType,
    costs: [energy(0)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities: () => abilities,
  };
}

/** Conditional-victory fixtures (C15); test-local ids 0x980+. */
const WIN = {
  /** "If you have no cards in your hand, you win the game." */
  emptyHand: winFixture(0, "character", [winCondition(noCardsIn("hand"))]),
  /** "Draw a card. Dissolve each character you control." */
  drawThenDissolveOwn: winFixture(1, "event", [event(p.sequence(p.draw(1), p.dissolve(all(characterYouControl()))))]),
  /** "Discard a card. Draw a card." */
  discardThenDraw: winFixture(2, "event", [event(p.sequence(p.discard(1), p.draw(1)))]),
  /** "Gain control of an enemy character." */
  takeControl: winFixture(3, "event", [event(p.gainControl(target(enemyCharacter())))]),
} as const;

/** "If the opponent has no cards in their hand, you win the game." */
const emptyHandDreamsign: EngineDreamsignDefinition = {
  id: parseDreamsignId(`5e5e5e5e-0000-4000-8000-${(0x984).toString(16).padStart(12, "0")}`),
  status: "authored",
  abilities: () => [winCondition(noCardsIn("hand", "opponent"))],
};

const winEngine = createEngine(testCatalog([...DSL_CARDS, ...Object.values(WIN)], { dreamsigns: [emptyHandDreamsign] }));
const terminus = DSL.winWithEmptyDeck.id;

function endings(events: readonly EngineEvent[]): EngineEvent[] {
  return events.filter((event) => event.kind === "winConditionMet" || event.kind === "battleEnded");
}

describe("conditional victory (C15)", () => {
  it("wins for the controller of a card in play once its condition holds after a step, and logs the sources", () => {
    const { state: start, ids } = boardState(winEngine.catalog, {
      active: "player",
      phase: "day",
      player: { back: [terminus], hand: [DSL.drawThenEnergy.id], energy: 1, deck: [v.vanilla1.id] },
      enemy: { hand: [v.vanilla1.id], deck: [v.vanilla1.id] },
    });
    const source = ids.player.back[0]!;
    // The deck still holds a card, so the condition is false and nobody wins.
    const passed = winEngine.apply(start, "player", { kind: "reposition", card: source, to: { rank: "back", index: 1 } }, NO_PROMPTS);
    expect(passed.state.result).toBeNull();
    const { state, events } = winEngine.apply(passed.state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(state.sides.player.deck).toEqual([]);
    expect(state.result).toEqual({ kind: "victory", winner: "player", reason: "winCondition" });
    expect(endings(events)).toEqual([
      { kind: "winConditionMet", side: "player", sources: [source] },
      { kind: "battleEnded", result: state.result },
    ]);
    expect(eventLogRecords(events, passed.state.version).map((record) => record.event)).toEqual(["engine.winCondition", "engine.battleEnded"]);
    expect(winEngine.decision(state)).toBeNull();
  });

  it("recomputes the same win when the step replays from a reloaded state", () => {
    const { state: start, ids } = boardState(winEngine.catalog, {
      active: "player",
      phase: "day",
      player: { back: [terminus], hand: [DSL.drawThenEnergy.id], energy: 1, deck: [v.vanilla1.id] },
      enemy: { hand: [v.vanilla1.id], deck: [v.vanilla1.id] },
    });
    const action = { kind: "play", card: ids.player.hand[0], from: "hand" } as const;
    const first = winEngine.apply(start, "player", action, NO_PROMPTS);
    const reloaded = JSON.parse(JSON.stringify(start)) as BattleState;
    const replayed = winEngine.apply(reloaded, "player", action, new ScriptedSource(first.answers.map((answer) => answer.value)));
    expect(replayed.state.result).toEqual(first.state.result);
    expect(replayed.events).toEqual(first.events);
    expect(stateHash(replayed.state)).toBe(stateHash(first.state));
  });

  it("counts only cards in play: a source in hand or void, or one that leaves play in the step, never wins", () => {
    const idle = boardState(winEngine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [terminus], void: [terminus], deck: [] },
      enemy: { deck: [v.vanilla1.id] },
    });
    expect(winEngine.apply(idle.state, "player", { kind: "pass" }, NO_PROMPTS).state.result).toBeNull();

    const { state: start, ids } = boardState(winEngine.catalog, {
      active: "player",
      phase: "day",
      player: { back: [terminus], hand: [WIN.drawThenDissolveOwn.id], deck: [v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id] },
    });
    const { state, events } = winEngine.apply(start, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(state.sides.player.deck).toEqual([]);
    expect(state.sides.player.void).toContain(ids.player.back[0]);
    expect(state.result).toBeNull();
    expect(endings(events)).toEqual([]);
  });

  it("checks only at step boundaries: a condition true mid-step and false at the check does not win", () => {
    const { state: start, ids } = boardState(winEngine.catalog, {
      active: "player",
      phase: "day",
      player: { back: [WIN.emptyHand.id], hand: [WIN.discardThenDraw.id, v.vanilla1.id], deck: [v.vanilla1.id, v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id] },
    });
    const { state } = winEngine.apply(start, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(state.sides.player.void).toContain(ids.player.hand[1]);
    expect(state.sides.player.hand).toHaveLength(1);
    expect(state.result).toBeNull();
  });

  it("wins for a character's new controller after a control change", () => {
    const { state: start, ids } = boardState(winEngine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [WIN.takeControl.id], deck: [] },
      enemy: { back: [terminus], deck: [v.vanilla1.id] },
    });
    const stolen = ids.enemy.back[0]!;
    const { state, events } = winEngine.apply(start, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[stolen]]));
    expect(state.instances[stolen]?.controller).toBe("player");
    expect(state.result).toEqual({ kind: "victory", winner: "player", reason: "winCondition" });
    expect(endings(events)[0]).toEqual({ kind: "winConditionMet", side: "player", sources: [stolen] });
  });

  it("counts an emblem's win condition, read relative to its controller", () => {
    const { state: start } = boardState(winEngine.catalog, {
      active: "player",
      phase: "day",
      player: { dreamsigns: [emptyHandDreamsign.id], hand: [v.vanilla1.id], deck: [v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id] },
    });
    const { state, events } = winEngine.apply(start, "player", { kind: "pass" }, NO_PROMPTS);
    expect(state.result).toEqual({ kind: "victory", winner: "player", reason: "winCondition" });
    expect(endings(events)[0]).toEqual({ kind: "winConditionMet", side: "player", sources: [{ kind: "dreamsign", side: "player", index: 0 }] });
  });

  it.each([
    {
      name: "a win condition and the opponent's score draw",
      player: { back: [terminus], deck: [] },
      enemy: { score: 10, deck: [v.vanilla1.id] },
      result: { kind: "draw", reason: "winCondition" },
      met: ["player"],
    },
    {
      name: "both sides' win conditions draw",
      player: { back: [terminus], deck: [] },
      enemy: { back: [terminus], deck: [] },
      result: { kind: "draw", reason: "winCondition" },
      met: ["player", "enemy"],
    },
    {
      name: "a side meeting both its score and a win condition wins by score",
      player: { back: [terminus], score: 10, deck: [] },
      enemy: { deck: [v.vanilla1.id] },
      result: { kind: "victory", winner: "player", reason: "score" },
      met: ["player"],
    },
  ] as const)("$name", ({ player, enemy, result, met }) => {
    const { state: start } = boardState(winEngine.catalog, { active: "player", phase: "day", scoreToWin: 10, player, enemy });
    const { state, events } = winEngine.apply(start, "player", { kind: "pass" }, NO_PROMPTS);
    expect(state.result).toEqual(result);
    const sides = endings(events).flatMap((event) => (event.kind === "winConditionMet" ? [event.side] : []));
    expect(sides).toEqual(met);
  });
});

describe("playing cards, the stack, and capacity", () => {
  it("plays a character onto the stack, resolves it when the opponent cannot respond, and pays its cost", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [v.vanilla3.id], energy: 4, deck: [v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id] },
    });
    const card = ids.player.hand[0];
    const { state, events } = engine.apply(start, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS);
    expect(events.map((event) => event.kind)).toEqual(["energyChanged", "cardPlayed", "resolved", "materialized"]);
    expect(state.sides.player.currentEnergy).toBe(1);
    expect(state.sides.player.backRank[0]).toBe(card);
    expect(state.stack).toEqual([]);
    expect(state.priority).toBeNull();
  });

  it("gives the opponent a response window only while it holds a legal Interrupt", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [v.event1.id], energy: 1, deck: [v.vanilla1.id] },
      enemy: { hand: [v.interruptEvent.id], energy: 1, deck: [v.vanilla1.id] },
    });
    let state = engine.apply(start, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
    expect(engine.decision(state)).toEqual({ kind: "respond", side: "enemy" });
    state = engine.apply(state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, NO_PROMPTS).state;
    // The player has no Interrupt, so the response resolves and then the original event.
    expect(state.stack).toEqual([]);
    expect(state.sides.enemy.void).toEqual([ids.enemy.hand[0]]);
    expect(state.sides.player.void).toEqual([ids.player.hand[0]]);
    expect(engine.decision(state)).toEqual({ kind: "main", side: "player" });
  });

  it("forbids Standard cards outside the active side's Day and Fast cards outside its windows", () => {
    const { state } = boardState(engine.catalog, {
      active: "player",
      phase: "night",
      player: { hand: [v.vanilla1.id, v.fastEvent.id], energy: 5, deck: [v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id] },
    });
    const plays = engine.legalActions(state, "player").filter((action) => action.kind === "play");
    expect(plays).toHaveLength(1);
    expect(engine.legalActions(state, "enemy")).toEqual([]);
  });

  it("forbids a character once the back rank, counting characters already on the stack, is full", () => {
    const back = Array.from({ length: 9 }, () => v.vanilla0.id);
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { back, hand: [v.interruptCharacter.id, v.vanilla0.id], energy: 5, deck: [v.vanilla1.id] },
      enemy: { hand: [v.interruptEvent.id], energy: 2, deck: [v.vanilla1.id] },
    });
    expect(engine.legalActions(start, "player").filter((action) => action.kind === "play")).toHaveLength(2);
    const state = engine.apply(start, "player", { kind: "play", card: ids.player.hand[1], from: "hand" }, NO_PROMPTS).state;
    expect(engine.decision(state)).toEqual({ kind: "respond", side: "enemy" });
    const afterResponse = engine.apply(state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
    // Over the enemy's Interrupt, the player's Interrupt character is not a legal
    // response: its own character on the stack claims the last open position. So
    // the player passes automatically and the whole stack resolves.
    expect(afterResponse.events.filter((event) => event.kind === "cardPlayed")).toHaveLength(1);
    expect(afterResponse.state.stack).toEqual([]);
    expect(afterResponse.state.sides.player.hand).toEqual([ids.player.hand[0]]);
    expect(afterResponse.state.sides.player.backRank.every((slot) => slot !== null)).toBe(true);
  });

  it("swaps characters on reposition and never moves an exhausted character to the front rank", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { front: [v.vanilla1.id], back: [v.vanilla2.id, v.vanilla3.id], deck: [v.vanilla1.id] },
      enemy: { deck: [v.vanilla1.id] },
    });
    const exhausted = ids.player.back[1]!;
    start.instances[exhausted].status.exhausted = true;
    const moves = engine.legalActions(start, "player").filter((action) => action.kind === "reposition");
    expect(moves.some((move) => move.kind === "reposition" && move.card === exhausted && move.to.rank === "front")).toBe(false);
    // The front-rank character cannot swap with the exhausted one either.
    const front = ids.player.front[0]!;
    expect(moves.some((move) => move.kind === "reposition" && move.card === front && move.to.rank === "back" && move.to.index === 1)).toBe(false);
    const state = engine.apply(start, "player", { kind: "reposition", card: front, to: { rank: "back", index: 0 } }, NO_PROMPTS).state;
    expect(state.sides.player.backRank[0]).toBe(front);
    expect(state.sides.player.frontRank[0]).toBe(ids.player.back[0]);
  });
});
