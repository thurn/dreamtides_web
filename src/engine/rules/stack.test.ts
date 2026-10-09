import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { createEngine, IllegalAction } from "../engine";
import type { Action } from "./actions";
import type { CardId, InstanceId, Phase, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS } from "../steps/sources";
import { boardState, cardIdOf } from "../testing/board";
import { STACK, STACK_CARDS, SYNTHETIC_EMBLEMS } from "../testing/stack-cards";
import { SYNTHETIC, testCatalog } from "../testing/synthetic-cards";

const engine = createEngine(testCatalog(STACK_CARDS, SYNTHETIC_EMBLEMS));
const v = SYNTHETIC;

/** Moves a hand card onto the stack under its owner, as if played, and gives `priority` priority. */
function putOnStack(state: BattleState, id: InstanceId, priority: Side): void {
  const instance = state.instances[id];
  if (instance === undefined) throw new Error(`no ${id}`);
  state.sides[instance.owner].hand = state.sides[instance.owner].hand.filter((card) => card !== id);
  instance.zone = "stack";
  state.stack.push({ kind: "card", instance: id, controller: instance.owner, choices: [], x: null, optionalPaid: [] });
  state.priority = priority;
}

function apply(state: BattleState, side: Side, action: Action) {
  return engine.apply(state, side, action, NO_PROMPTS);
}

function play(state: BattleState, side: Side, card: InstanceId | undefined) {
  if (card === undefined) throw new Error("no card");
  return apply(state, side, { kind: "play", card, from: "hand" });
}

describe("D13 priority", () => {
  it("follows the worked example: each pass resolves the top item and hands priority to its controller", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [v.event1.id, v.interruptEvent.id, v.interruptEvent.id], energy: 3, deck: [v.vanilla1.id] },
      enemy: { hand: [v.interruptEvent.id, v.interruptEvent.id], energy: 2, deck: [v.vanilla1.id] },
    });
    const [a, c] = ids.player.hand;
    const [b] = ids.enemy.hand;
    // 1. I play A. You respond with B. I respond with C.
    let state = play(start, "player", a).state;
    expect(engine.decision(state)).toEqual({ kind: "respond", side: "enemy" });
    state = play(state, "enemy", b).state;
    expect(engine.decision(state)).toEqual({ kind: "respond", side: "player" });
    state = play(state, "player", c).state;
    expect(engine.decision(state)).toEqual({ kind: "respond", side: "enemy" });
    // 2. You pass, so C resolves.
    let result = apply(state, "enemy", { kind: "pass" });
    expect(result.events.filter((event) => event.kind === "resolved")).toEqual([{ kind: "resolved", instance: c }]);
    state = result.state;
    // 3. I get priority with B on top, and may play another Interrupt or pass.
    expect(state.stack.map((item) => item.kind === "card" && item.instance)).toEqual([a, b]);
    expect(engine.decision(state)).toEqual({ kind: "respond", side: "player" });
    expect(engine.legalActions(state, "player").map((action) => action.kind)).toEqual(["pass", "play"]);
    // 4. If I pass, B resolves and you get priority over A.
    result = apply(state, "player", { kind: "pass" });
    expect(result.events.filter((event) => event.kind === "resolved")).toEqual([{ kind: "resolved", instance: b }]);
    state = result.state;
    expect(state.stack.map((item) => item.kind === "card" && item.instance)).toEqual([a]);
    expect(engine.decision(state)).toEqual({ kind: "respond", side: "enemy" });
    // A single pass resolves A; play returns to the player's Day.
    state = apply(state, "enemy", { kind: "pass" }).state;
    expect(state.stack).toEqual([]);
    expect(state.priority).toBeNull();
    expect(state.turn.phase).toBe("day");
    expect(engine.decision(state)).toEqual({ kind: "main", side: "player" });
  });

  it("gives priority to the resolved item's controller even when that side's own item is next", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [v.event1.id, v.interruptEvent.id], deck: [v.vanilla1.id] },
      enemy: { hand: [v.interruptEvent.id], energy: 1, deck: [v.vanilla1.id] },
    });
    const [a, b] = ids.player.hand;
    putOnStack(start, a, "enemy");
    putOnStack(start, b, "enemy");
    // B resolves and the player receives priority over its own A, which it
    // cannot answer, so A resolves too without the enemy being asked again.
    const { state, events } = apply(start, "enemy", { kind: "pass" });
    expect(events.filter((event) => event.kind === "resolved")).toEqual([
      { kind: "resolved", instance: b },
      { kind: "resolved", instance: a },
    ]);
    expect(state.stack).toEqual([]);
    expect(engine.decision(state)).toEqual({ kind: "main", side: "player" });
  });

  it("passes automatically for a side with no legal response, resolving the whole stack (P1)", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [v.event1.id], energy: 1, deck: [v.vanilla1.id] },
      // An Interrupt the enemy cannot afford is not a response.
      enemy: { hand: [v.interruptEvent.id], back: [STACK.interruptDraw.id], energy: 0, deck: [v.vanilla1.id] },
    });
    const { state, events } = play(start, "player", ids.player.hand[0]);
    expect(events.map((event) => event.kind)).toContain("resolved");
    expect(state.stack).toEqual([]);
    expect(engine.decision(state)).toEqual({ kind: "main", side: "player" });
  });

  it("opens a response window for a side holding only an Interrupt-speed activated ability", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [v.event1.id], energy: 1, deck: [v.vanilla1.id] },
      enemy: { back: [STACK.interruptDraw.id], energy: 1, deck: [v.vanilla1.id] },
    });
    const state = play(start, "player", ids.player.hand[0]).state;
    expect(engine.decision(state)).toEqual({ kind: "respond", side: "enemy" });
    const source = ids.enemy.back[0];
    expect(engine.legalActions(state, "enemy")).toEqual([{ kind: "pass" }, { kind: "activate", source, ability: 0 }]);
  });
});

type Stack = "empty" | "opponentTop" | "ownTop";

const SPEED_CARDS: Record<EngineCardDefinition["speed"], { card: EngineCardDefinition; ability: EngineCardDefinition }> = {
  standard: { card: v.event1, ability: STACK.drawForEnergyAndExhaust },
  fast: { card: v.fastEvent, ability: STACK.fastPump },
  interrupt: { card: v.interruptEvent, ability: STACK.interruptDraw },
};

/** The speeds each side may use in each window (rules § Playing Cards and the Stack). */
const WINDOWS: readonly { phase: Phase; role: "active" | "nonActive"; stack: Stack; speeds: readonly string[] }[] = [
  { phase: "day", role: "active", stack: "empty", speeds: ["standard", "fast", "interrupt"] },
  { phase: "dusk", role: "active", stack: "empty", speeds: [] },
  { phase: "night", role: "active", stack: "empty", speeds: ["fast", "interrupt"] },
  { phase: "day", role: "nonActive", stack: "empty", speeds: [] },
  { phase: "dusk", role: "nonActive", stack: "empty", speeds: ["fast", "interrupt"] },
  { phase: "night", role: "nonActive", stack: "empty", speeds: [] },
  ...(["day", "dusk", "night"] as const).flatMap((phase) =>
    (["active", "nonActive"] as const).flatMap((role) => [
      { phase, role, stack: "opponentTop" as const, speeds: ["interrupt"] },
      { phase, role, stack: "ownTop" as const, speeds: [] },
    ]),
  ),
];

describe("timing windows", () => {
  it.each(WINDOWS)("$role side in $phase with $stack stack may use $speeds", ({ phase, role, stack, speeds }) => {
    const side: Side = role === "active" ? "player" : "enemy";
    const other = opponent(side);
    const speedList = ["standard", "fast", "interrupt"] as const;
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase,
      [side]: {
        hand: speedList.map((speed) => SPEED_CARDS[speed].card.id),
        back: speedList.map((speed) => SPEED_CARDS[speed].ability.id),
        energy: 5,
        deck: [v.vanilla1.id],
      },
      [other]: { hand: [v.event1.id], energy: 5, deck: [v.vanilla1.id] },
    });
    // The side's own stacked card is an extra hand card added after setup.
    if (stack === "opponentTop") putOnStack(state, ids[other].hand[0], side);
    if (stack === "ownTop") {
      const own = ids[side].hand[0];
      const id: InstanceId = `i${state.nextInstance}`;
      state.nextInstance += 1;
      const extra = { ...state.instances[own], id };
      state.instances[extra.id] = extra;
      state.sides[side].hand.push(extra.id);
      putOnStack(state, extra.id, side);
    }
    state.payable.push({ id: "e1", payer: side, cost: 1, source: ids[other].hand[0], affects: [] });

    const legal = engine.legalActions(state, side);
    const speedOf = (cardId: CardId) => speedList.find((speed) => SPEED_CARDS[speed].card.id === cardId || SPEED_CARDS[speed].ability.id === cardId);
    const played = legal.flatMap((action) =>
      action.kind === "play" ? [speedOf(cardIdOf(state, action.card))] : [],
    );
    const activated = legal.flatMap((action) =>
      action.kind === "activate" && typeof action.source === "string" ? [speedOf(cardIdOf(state, action.source))] : [],
    );
    expect(played).toEqual(speeds);
    expect(activated).toEqual(speeds);
    // Paying to end an effect is open exactly where a Fast card is, never as a response (C7).
    expect(legal.some((action) => action.kind === "payToEnd")).toBe(stack === "empty" && speeds.includes("fast"));
    // Only the side holding priority may act on a non-empty stack.
    if (stack !== "empty") expect(engine.legalActions(state, other)).toEqual([]);
    // A response window opens only while the side holds a legal response (P1).
    const decision = engine.decision(state);
    if (stack === "empty") {
      expect(decision?.side === side).toBe(speeds.length > 0);
    } else {
      expect(decision).toEqual(speeds.length > 0 ? { kind: "respond", side } : null);
    }
  });
});

describe("paying to end an effect (C7)", () => {
  function registered() {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [STACK.payableEffect.id, v.interruptEvent.id], energy: 1, deck: [v.vanilla1.id] },
      enemy: { energy: 3, deck: [v.vanilla1.id], back: [v.vanilla1.id] },
    });
    const { state, events } = play(start, "player", ids.player.hand[0]);
    return { state, events, ids };
  }

  it("registers a payable effect the opponent may end in its Dusk window, without using the stack", () => {
    const { state: day, events, ids } = registered();
    expect(day.payable).toEqual([{ id: "e1", payer: "enemy", cost: 2, source: ids.player.hand[0], affects: [ids.enemy.back[0]] }]);
    expect(events).toContainEqual({ kind: "payableEffectRegistered", effect: "e1", payer: "enemy", cost: 2, source: ids.player.hand[0], affects: [ids.enemy.back[0]] });
    // Not during the player's Day.
    expect(engine.legalActions(day, "enemy")).toEqual([]);
    const dusk = apply(day, "player", { kind: "pass" }).state;
    expect(dusk.turn.phase).toBe("dusk");
    expect(engine.legalActions(dusk, "enemy")).toContainEqual({ kind: "payToEnd", effect: "e1" });
    const { state, events: paid } = apply(dusk, "enemy", { kind: "payToEnd", effect: "e1" });
    expect(paid.map((event) => event.kind)).toEqual(["energyChanged", "payableEffectEnded"]);
    expect(state.payable).toEqual([]);
    expect(state.sides.enemy.currentEnergy).toBe(1);
    expect(state.stack).toEqual([]);
    expect(state.priority).toBeNull();
    expect(state.turn.phase).toBe("dusk");
    expect(engine.decision(state)).toEqual({ kind: "main", side: "enemy" });
    // Once ended it cannot be paid again.
    expect(() => apply(state, "enemy", { kind: "payToEnd", effect: "e1" })).toThrow(IllegalAction);
  });

  it("is unavailable without enough energy and to anyone but the payer", () => {
    const { state: day } = registered();
    const dusk = apply(day, "player", { kind: "pass" }).state;
    dusk.sides.enemy.currentEnergy = 1;
    expect(engine.legalActions(dusk, "enemy").some((action) => action.kind === "payToEnd")).toBe(false);
    day.payable = [{ ...day.payable[0], payer: "enemy" }];
    expect(engine.legalActions(day, "player").some((action) => action.kind === "payToEnd")).toBe(false);
  });
});
