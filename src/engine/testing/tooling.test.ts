/** The card-lab setup solver and pending-entity semantics (D36). */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { contentCardDefinitions } from "../content-catalog";
import { createEngine } from "../engine";
import { NO_PROMPTS } from "../steps/sources";
import { DSL, DSL_CARDS } from "./dsl-cards";
import { labBoard } from "./lab-solver";
import { playFromHand, runScenario } from "./scenario";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";

/** A pending 1● event and a pending 2● 2✦ character. */
const pendingEvent: EngineCardDefinition = { ...SYNTHETIC.event1, id: syntheticId(904), status: "pending" };
const pendingCharacter: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(905), status: "pending" };
const pool = contentCardDefinitions();
const engine = createEngine(testCatalog([...DSL_CARDS, pendingEvent, pendingCharacter]));

describe("card-lab setup solver", () => {
  it("solves a playable board for every synthetic DSL card", () => {
    for (const card of DSL_CARDS) {
      expect(() => labBoard(engine, card.id, pool), card.id).not.toThrow();
    }
  });

  it("places targets on the side each selector names", () => {
    const { state } = labBoard(engine, DSL.dissolveEnemy.id, pool);
    expect(state.sides.enemy.backRank.filter((id) => id !== null)).toHaveLength(1);
    expect(state.sides.player.backRank.filter((id) => id !== null)).toHaveLength(0);
  });
});

describe("pending entities play text-less", () => {
  it("resolves a pending event with no effect and reports pendingAbility when played and drawn", () => {
    const { state, events, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [pendingEvent.id], energy: 1, deck: [pendingEvent.id] }, enemy: { deck: [SYNTHETIC.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player.void).toEqual([ids.player.hand[0]]);
    expect(events).toContainEqual(expect.objectContaining({ kind: "pendingAbility", reason: "played", cardId: pendingEvent.id }));
    // Pass until the player's next turn, whose Draw phase draws the pending card.
    let current = state;
    const later = [];
    while (!(current.turn.active === "player" && current.turn.phase === "day" && current.turn.turnNumber > state.turn.turnNumber)) {
      const decision = engine.decision(current);
      if (decision === null) throw new Error("no decision");
      const result = engine.apply(current, decision.side, { kind: "pass" }, NO_PROMPTS);
      later.push(...result.events);
      current = result.state;
    }
    expect(later).toContainEqual(expect.objectContaining({ kind: "pendingAbility", reason: "drawn", cardId: pendingEvent.id }));
  });

  it("plays a pending character with its printed cost and spark and no abilities", () => {
    const { state, ids, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [pendingCharacter.id], energy: 2, deck: [SYNTHETIC.vanilla1.id] }, enemy: { deck: [SYNTHETIC.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player.backRank[0]).toBe(ids.player.hand[0]);
    expect(state.sides.player.currentEnergy).toBe(0);
    expect(events.filter((event) => event.kind === "pendingAbility")).toHaveLength(1);
  });
});
