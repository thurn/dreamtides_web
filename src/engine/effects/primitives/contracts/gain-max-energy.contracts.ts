import { describe, expect, it } from "vitest";
import { event } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { opponent } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { SYNTHETIC, SYNTHETIC_DREAMWELL, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainMaxEnergy } from "../gain-max-energy";
import { deck, rampOne } from "./resources-support";

const opponentRamp = {
  ...rampOne,
  id: syntheticId(57101),
  abilities: () => [event(gainMaxEnergy(1, "opponent"))],
};
const reduceMaximum = {
  ...rampOne,
  id: syntheticId(57102),
  abilities: () => [event(gainMaxEnergy(-5))],
};
const zeroMaximum = {
  ...rampOne,
  id: syntheticId(57103),
  abilities: () => [event(gainMaxEnergy(0))],
};
const engine = createEngine(testCatalog([rampOne, opponentRamp, reduceMaximum, zeroMaximum]));

function energyEvents(events: readonly EngineEvent[], side: "player" | "enemy") {
  return events.filter((item) => item.kind === "energyChanged" && item.side === side);
}

describe("gainMaxEnergy", () => {
  it.each([
    { controller: "player", recipient: "you", current: 0 },
    { controller: "enemy", recipient: "you", current: 5 },
    { controller: "player", recipient: "opponent", current: 5 },
    { controller: "enemy", recipient: "opponent", current: 0 },
  ] as const)("changes only maximum for $controller / $recipient with current $current, until normal refresh", ({ controller, recipient, current }) => {
    const side = recipient === "you" ? controller : opponent(controller);
    const card = recipient === "you" ? rampOne : opponentRamp;
    const setup = { energy: 2, hand: [SYNTHETIC.vanilla1.id], deck };
    const { state: start, ids } = boardState(engine.catalog, {
      active: controller,
      phase: "day",
      player: setup,
      enemy: setup,
      [controller]: { ...setup, hand: [card.id, SYNTHETIC.vanilla1.id] },
    });
    start.sides[side].maxEnergy = 3;
    start.sides[side].currentEnergy = current;
    const well = SYNTHETIC_DREAMWELL[0];
    start.dreamwell = { deck: [well.id, well.id], next: 0, catalog: [well.id] };
    const before = structuredClone(start);
    const play = playFromHand(ids, controller);
    const cast = engine.apply(start, play.side, play.action, NO_PROMPTS);
    expect(start).toEqual(before);
    expect(cast.state.sides[side]).toMatchObject({ currentEnergy: current, maxEnergy: 4 });
    expect(cast.state.sides[opponent(side)]).toMatchObject({ currentEnergy: 2, maxEnergy: 2 });
    expect(energyEvents(cast.events, side)).toEqual([
      { kind: "energyChanged", side, current, max: 4, change: 0, maxChange: 1, cause: "effect" },
    ]);
    const payableCard = ids[side].hand[ids[side].hand.length - 1];
    const canPlay = (state: typeof start) => engine.legalActions(state, side).some((action) => action.kind === "play" && action.card === payableCard);
    // The active recipient has the same spendable choices immediately.
    if (side === controller) {
      expect(canPlay(start)).toBe(current > 0);
      expect(canPlay(cast.state)).toBe(current > 0);
    }
    let state = cast.state;
    const refreshEvents: EngineEvent[] = [];
    for (let passes = 0; passes < 12; passes++) {
      const decision = engine.decision(state);
      expect(decision).not.toBeNull();
      if (decision === null) throw new Error("missing turn decision");
      const next = engine.apply(state, decision.side, { kind: "pass" }, NO_PROMPTS);
      state = next.state;
      refreshEvents.push(...next.events);
      if (state.turn.active === side && state.turn.phase === "day") break;
    }
    expect(state.turn).toMatchObject({ active: side, phase: "day" });
    expect(energyEvents(refreshEvents, side)).toEqual([
      { kind: "energyChanged", side, current: 4, max: 4, change: 4 - current, maxChange: 0, cause: "refresh" },
      { kind: "energyChanged", side, current: 5, max: 5, change: 1, maxChange: 1, cause: "refresh" },
    ]);
    expect(state.sides[side]).toMatchObject({ currentEnergy: 5, maxEnergy: 5 });
    expect(canPlay(state)).toBe(true);
  });

  it.each([
    { card: reduceMaximum, max: 0, maxChange: -3 },
    { card: zeroMaximum, max: 3, maxChange: 0 },
  ])("keeps current independent when the maximum effect has delta $maxChange", ({ card, max, maxChange }) => {
    const { state, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [card.id], energy: 3, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player).toMatchObject({ currentEnergy: 3, maxEnergy: max });
    expect(energyEvents(events, "player")).toEqual([
      { kind: "energyChanged", side: "player", current: 3, max, change: 0, maxChange, cause: "effect" },
    ]);
  });
});
