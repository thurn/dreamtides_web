/**
 * Scenario specs for the cards-43 batch (D20): Resilient Wanderer's two
 * abilities interact through its void. Its ▸Dissolved draw fires as it goes
 * there, and its ▸Dawn ability works only from the void, its functional zone,
 * where the intervening "if" lets its controller pay 1● to return it to hand
 * or decline and leave it there (RD-hv-7x4l.6-1, RD-hv-7x4l.6-2).
 */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule, ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import wanderer from "../cards/resilient-wanderer-831bc7cf";

const WANDERER = parseCardId(wanderer.id);
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const pass = (side: Side): ScenarioStep => ({ side, action: { kind: "pass" } });

const scenarios: NamedScenario[] = [true, false].map((pay) => ({
  name: `${wanderer.id} dissolved on the enemy's turn draws a card, then ${pay ? "pays 1● to return" : "declines and stays in the void"} at its controller's next Dawn`,
  spec: {
    board: {
      active: "enemy", phase: "day",
      player: { back: [WANDERER], energy: 2, deck },
      enemy: { hand: [SYNTHETIC.dissolveVictim.id], deck },
    },
    // The enemy dissolves it (the player holds no response), then the
    // enemy's Day, the player's Dusk window, and the enemy's Night lead
    // through the Challenge phase into the player's Dawn.
    steps: (ids) => [
      { side: "enemy", action: { kind: "play", card: ids.enemy.hand[0], from: "hand" } },
      pass("enemy"), pass("player"), pass("enemy"),
    ],
    // The dissolve's only legal target is chosen without a prompt.
    answers: () => [pay],
  },
  check: ({ state, ids, events }) => {
    const source = ids.player.back[0]!;
    const dissolved = events.findIndex((event) => event.kind === "dissolved" && event.instance === source);
    const dawn = events.findIndex((event) => event.kind === "phaseChanged" && event.phase === "dawn" && event.active === "player");
    const drawn = events.findIndex((event, index) => index > dissolved && event.kind === "cardDrawn" && event.side === "player");
    const returned = events.findIndex((event) => event.kind === "returnedToHand" && event.instance === source);
    const paid = events.flatMap((event) => event.kind === "energyChanged" && event.side === "player" && event.cause === "payment" ? [event.change] : []);
    expect(dissolved).toBeGreaterThanOrEqual(0);
    expect(drawn).toBeGreaterThan(dissolved);
    expect(drawn).toBeLessThan(dawn);
    expect(state.instances[source]?.zone).toBe(pay ? "hand" : "void");
    expect(paid).toEqual(pay ? [-1] : []);
    if (pay) expect(returned).toBeGreaterThan(dawn);
    else expect(returned).toBe(-1);
  },
}));

scenarios.push({
  name: `${wanderer.id} its void ▸Dawn ability does nothing while the card is in play`,
  spec: {
    board: {
      active: "enemy", phase: "night",
      player: { back: [WANDERER], energy: 3, deck },
      enemy: { deck },
    },
    steps: () => [pass("enemy")],
  },
  check: ({ state, ids, events }) => {
    expect(events.some((event) => event.kind === "phaseChanged" && event.phase === "dawn" && event.active === "player")).toBe(true);
    expect(events.some((event) => event.kind === "triggerQueued")).toBe(false);
    expect(events.some((event) => event.kind === "returnedToHand")).toBe(false);
    expect(state.instances[ids.player.back[0]!]?.zone).toBe("play");
  },
});

export default { slug: "cards-43", scenarios } satisfies ScenarioModule;
