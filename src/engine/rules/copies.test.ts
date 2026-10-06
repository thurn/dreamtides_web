/**
 * Copies (D15, C3): a copy of a card on the stack is a created card directly
 * above the original that is not played, keeps X and paid optional costs,
 * lets its controller choose new targets through a prompt, and can be
 * prevented; created copies in a hand cease to exist instead of being
 * banished.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import type { Answer } from "../prompts/types";
import type { Action } from "./actions";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, type BoardSetup } from "../testing/board";
import { DSL } from "../testing/dsl-cards";
import { invariantViolations } from "../testing/invariants";
import { STACK } from "../testing/stack-cards";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { ZONE, zoneCatalog } from "../testing/zone-cards";

const engine = createEngine(zoneCatalog());
const v = SYNTHETIC;
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);

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

function copyOf(events: readonly EngineEvent[]): InstanceId {
  const copied = events.find((event) => event.kind === "cardCopied");
  if (copied?.kind !== "cardCopied") throw new Error("nothing was copied");
  return copied.copy;
}

describe("copies on the stack", () => {
  it("puts a copy above the original that resolves first, with new targets chosen through a prompt", () => {
    const { state, ids } = board({ player: { back: [ZONE.echo.id], hand: [DSL.dissolveEnemy.id], energy: 2 }, enemy: { back: [v.vanilla1.id, v.vanilla2.id] } });
    const [first, second] = ids.enemy.back;
    const { state: after, events, answers } = play(state, "player", ids.player.hand[0], [[first!], [second!]]);
    const copy = copyOf(events);
    const dissolved = events.flatMap((event) => (event.kind === "dissolved" ? [event.instance] : []));
    expect(dissolved).toEqual([second, first]);
    // The copy's controller chose its target in its own prompt.
    expect(answers.filter((answer) => answer.auto !== true)).toHaveLength(2);
    expect(after.instances[copy]).toBeUndefined();
    expect(events.filter((event) => event.kind === "cardPlayed")).toHaveLength(1);
    expect(after.turnLog.played.player.map((card) => card.instance)).toEqual([ids.player.hand[0]]);
    expect(after.sides.player.void).toEqual([ids.player.hand[0]]);
  });

  it("answers the copy's target choice automatically when there is no alternative", () => {
    const { state, ids } = board({ player: { back: [ZONE.echo.id], hand: [DSL.dissolveEnemy.id], energy: 2 }, enemy: { back: [v.vanilla1.id] } });
    const { events } = play(state, "player", ids.player.hand[0]);
    expect(events.some((event) => event.kind === "cardCopied")).toBe(true);
    // The original's only target was dissolved by the copy first.
    expect(events).toContainEqual(expect.objectContaining({ kind: "noLegalTarget", source: ids.player.hand[0] }));
  });

  it("keeps the original's X without paying again", () => {
    const { state, ids } = board({ player: { back: [ZONE.echo.id], hand: [DSL.fixedPlusXPoints.id], energy: 4 } });
    const { state: after } = play(state, "player", ids.player.hand[0], [3]);
    expect(after.sides.player.score).toBe(6);
    expect(after.sides.player.currentEnergy).toBe(0);
  });

  it("can be prevented, and then ceases to exist while the original still resolves", () => {
    const { state, ids } = board({ player: { back: [ZONE.echo.id], hand: [DSL.drawTwo.id], energy: 1 }, enemy: { hand: [STACK.preventEvent.id], energy: 1 } });
    const played = act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" });
    const copy = copyOf(played.events);
    expect(played.state.stack.map((item) => (item.kind === "card" ? item.instance : null))).toEqual([ids.player.hand[0], copy]);
    expect(played.state.priority).toBe("enemy");
    const { state: after, events } = play(played.state, "enemy", ids.enemy.hand[0], [[copy]]);
    expect(events).toContainEqual({ kind: "prevented", instance: copy, side: "player", to: null, zoneOf: null });
    expect(after.instances[copy]).toBeUndefined();
    expect(after.sides.player.hand).toHaveLength(2);
    expect(after.sides.player.void).toEqual([ids.player.hand[0]]);
  });

  it("copies an opponent's card for the copier, who gets its effect", () => {
    const { state, ids } = board({ player: { hand: [DSL.gainThreePoints.id], energy: 1 }, enemy: { hand: [ZONE.mirror.id], energy: 1 } });
    const played = act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }).state;
    const mirrored = play(played, "enemy", ids.enemy.hand[0]).state;
    const done = passUntil(engine, mirrored, (next) => next.stack.length === 0).state;
    expect(done.sides.enemy.score).toBe(3);
    expect(done.sides.player.score).toBe(3);
  });
});

describe("copies in hand", () => {
  it("creates an Ephemeral copy in hand that ceases to exist at Ending instead of being banished", () => {
    const { state, ids } = board({ player: { back: [v.vanilla2.id], hand: [ZONE.handEcho.id], energy: 1 } });
    const { state: after } = play(state, "player", ids.player.hand[0]);
    const [copy] = after.sides.player.hand;
    expect(after.instances[copy]).toMatchObject({ printing: { kind: "card", cardId: v.vanilla2.id }, owner: "player", status: { created: true, ephemeral: true } });
    const ended = passUntil(engine, after, at(engine, "enemy", "day")).state;
    expect(ended.instances[copy]).toBeUndefined();
    expect(ended.sides.player.banished).toEqual([]);
  });
});
