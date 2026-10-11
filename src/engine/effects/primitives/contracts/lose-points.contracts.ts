import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { event, plus, times } from "../../../dsl/builders";
import type { PlayerRef, ValueExpr } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES } from "../../../state/ids";
import { boardState } from "../../../testing/board";
import { runScenario, playFromHand } from "../../../testing/scenario";
import { SYNTHETIC, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { ScriptedSource } from "../../../steps/sources";
import { losePoints } from "../lose-points";

const loss = (index: number, amount: ValueExpr, player: PlayerRef = "you"): EngineCardDefinition => ({
  ...SYNTHETIC.event0, id: syntheticId(index), status: "authored", abilities: () => [event(losePoints(amount, player))],
});
const zero = loss(1270, 0);
const five = loss(1271, 5, "opponent");
const dynamic = loss(1272, plus(times({ value: "handSize", player: "you" }, 2), 1), "opponent");
const refs = ["you", "opponent"] as const;
const relative = refs.map((ref, index) => loss(1273 + index, 2, ref));
const engine = createEngine(testCatalog([zero, five, dynamic, ...relative]));

describe("losePoints", () => {
  it("clamps loss to the available points, reports the actual negative effect, and emits nothing for zero change", () => {
    for (const score of [0, 2, 7]) {
      const result = runScenario(engine, {
        board: { active: "player", phase: "day", player: { hand: [five.id] }, enemy: { score } },
        steps: (ids) => [playFromHand(ids, "player")],
      });
      expect(result.state.sides.enemy.score).toBe(Math.max(0, score - 5));
      expect(result.state.sides.player.score).toBe(0);
      expect(result.events.filter((event) => event.kind === "pointsScored")).toEqual(score === 0 ? [] : [
        { kind: "pointsScored", side: "enemy", amount: -Math.min(score, 5), cause: "effect" },
      ]);
    }
    const result = runScenario(engine, {
      board: { active: "player", phase: "day", player: { score: 7, hand: [zero.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(result.state.sides.player.score).toBe(7);
    expect(result.events.some((event) => event.kind === "pointsScored")).toBe(false);
  });

  it("resolves both PlayerRefs for each controller", () => {
    for (const controller of SIDES) {
      for (const [index, ref] of refs.entries()) {
        const card = relative[index];
        const result = runScenario(engine, {
          board: { active: controller, phase: "day", player: { score: 6 }, enemy: { score: 6 }, [controller]: { score: 6, hand: [card.id] } },
          steps: (ids) => [playFromHand(ids, controller)],
        });
        const target = ref === "you" ? controller : opponent(controller);
        expect(result.state.sides[target].score).toBe(4);
        expect(result.state.sides[opponent(target)].score).toBe(6);
      }
    }
  });

  it("evaluates a composed ValueExpr, and replays to the same events and state", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "enemy", phase: "day", enemy: { hand: [dynamic.id, SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] }, player: { score: 9 },
    });
    const action = playFromHand(ids, "enemy").action;
    // The remaining two hand cards produce 2 * 2 + 1.
    const first = engine.apply(state, "enemy", action, new ScriptedSource([]));
    const again = engine.apply(deserializeState(serializeState(state)), "enemy", action, new ScriptedSource([]));
    expect(first.state.sides.player.score).toBe(4);
    expect(first.events).toContainEqual({ kind: "pointsScored", side: "player", amount: -5, cause: "effect" });
    expect(again.events).toEqual(first.events);
    expect(stateHash(again.state)).toBe(stateHash(first.state));
    expect(state.sides.player.score).toBe(9);
  });
});
