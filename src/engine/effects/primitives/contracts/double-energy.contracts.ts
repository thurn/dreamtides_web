import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { energy, event } from "../../../dsl/builders";
import type { PlayerRef } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { doubleEnergy } from "../double-energy";
import { gainEnergy } from "../gain-energy";

const doubling = (id: number, player: PlayerRef = "you"): EngineCardDefinition => ({
  id: syntheticId(id), cardType: "event", costs: [], spark: null, subtype: "",
  speed: "standard", status: "authored", abilities: () => [event(doubleEnergy(player))],
});
const self = doubling(7100);
const other = doubling(7101, "opponent");
const paid: EngineCardDefinition = { ...doubling(7102), costs: [energy(1)] };
const response: EngineCardDefinition = {
  ...doubling(7103), costs: [energy(1)], speed: "interrupt",
  abilities: () => [event(gainEnergy(3, "opponent"))],
};
const catalog = testCatalog([self, other, paid, response]);
const engine = createEngine(catalog);

describe("doubleEnergy", () => {
  for (const controller of ["player", "enemy"] as const) {
    for (const player of ["you", "opponent"] as const) {
      it.each([0, 1, 4, 9])(`doubles %i current energy for ${player} relative to ${controller}, preserving both maxima`, (current) => {
        const side = player === "you" ? controller : opponent(controller);
        const definition = player === "you" ? self : other;
        const { state, events, answers } = runScenario(engine, {
          board: {
            active: controller, phase: "day",
            [controller]: { hand: [definition.id], energy: side === controller ? current : 7 },
            [opponent(controller)]: { energy: side === controller ? 7 : current },
          },
          steps: (ids) => [playFromHand(ids, controller)],
        });
        expect(state.sides[side]).toMatchObject({ currentEnergy: current * 2, maxEnergy: current });
        expect(state.sides[opponent(side)]).toMatchObject({ currentEnergy: 7, maxEnergy: 7 });
        expect(events.filter((item) => item.kind === "energyChanged")).toEqual([
          { kind: "energyChanged", side, current: current * 2, max: current, change: current, maxChange: 0, cause: "effect" },
        ]);
        expect(answers).toEqual([]);
        expect(invariantViolations(state, catalog)).toEqual([]);
      });
    }
  }

  it.each(["player", "enemy"] as const)("pays the cost before doubling for %s, allowing current energy above maximum", (controller) => {
    const { state, events, ids } = runScenario(engine, {
      board: { active: controller, phase: "day", [controller]: { hand: [paid.id], energy: 5 } },
      steps: (ids) => [playFromHand(ids, controller)],
    });
    expect(state.sides[controller]).toMatchObject({ currentEnergy: 8, maxEnergy: 5 });
    expect(events.filter((item) => item.kind === "energyChanged")).toEqual([
      { kind: "energyChanged", side: controller, current: 4, max: 5, change: -1, maxChange: 0, cause: "payment" },
      { kind: "energyChanged", side: controller, current: 8, max: 5, change: 4, maxChange: 0, cause: "effect" },
    ]);
    expect(state.sides[controller].void).toEqual([ids[controller].hand[0]]);
    expect(state.stack).toEqual([]);
  });

  it("reads energy after a response resolves and replays the same serialized stack deterministically", () => {
    const { state: start, ids } = boardState(catalog, {
      active: "player", phase: "day",
      player: { hand: [paid.id], energy: 5 },
      enemy: { hand: [response.id], energy: 3 },
    });
    const first = engine.apply(start, "player", playFromHand(ids, "player").action, NO_PROMPTS);
    expect(first.state.sides.player).toMatchObject({ currentEnergy: 4, maxEnergy: 5 });
    expect(first.state.stack).toHaveLength(1);
    expect(first.events.some((item) => item.kind === "energyChanged" && item.cause === "effect")).toBe(false);

    const before = stateHash(first.state);
    const action = playFromHand(ids, "enemy").action;
    const result = engine.apply(first.state, "enemy", action, NO_PROMPTS);
    expect(result.events.filter((item) => item.kind === "energyChanged" && item.side === "player")).toEqual([
      { kind: "energyChanged", side: "player", current: 7, max: 5, change: 3, maxChange: 0, cause: "effect" },
      { kind: "energyChanged", side: "player", current: 14, max: 5, change: 7, maxChange: 0, cause: "effect" },
    ]);
    expect(result.state.sides.player).toMatchObject({ currentEnergy: 14, maxEnergy: 5 });
    expect(result.state.sides.enemy).toMatchObject({ currentEnergy: 2, maxEnergy: 3 });
    expect(result.state.stack).toEqual([]);
    expect(result.state.sides.player.void).toEqual(ids.player.hand);
    expect(result.state.sides.enemy.void).toEqual(ids.enemy.hand);
    expect(invariantViolations(result.state, catalog)).toEqual([]);

    const replay = createEngine(catalog).apply(deserializeState(serializeState(first.state)), "enemy", action, NO_PROMPTS);
    expect(replay.events).toEqual(result.events);
    expect(stateHash(replay.state)).toBe(stateHash(result.state));
    expect(stateHash(first.state)).toBe(before);
  });
});
