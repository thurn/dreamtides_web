/**
 * Scenario specs for the cards-46 batch (D20). Fractured Vessel's ▸Dawn
 * ability works only from the void, its functional zone, where its
 * intervening "if" returns it to hand (RD-hv-umm2.59-2, RD-hv-7x4l.6-2).
 * Veilpath Gatekeeper's combined ▸Materialized, ▸Dissolved trigger chooses
 * among the cost-bounded characters in its controller's void as it resolves
 * (RD-hv-7x4l.6-5), so the ▸Dissolved occasion may choose the Gatekeeper's
 * own card, which is in its owner's void by then (RD-hv-umm2.342-1).
 */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule, ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import vessel from "../cards/fractured-vessel-af739e3d";
import gatekeeper from "../cards/veilpath-gatekeeper-cc21a902";

const VESSEL = parseCardId(vessel.id);
const GATEKEEPER = parseCardId(gatekeeper.id);
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const pass = (side: Side): ScenarioStep => ({ side, action: { kind: "pass" } });

const scenarios: NamedScenario[] = [
  {
    name: `${vessel.id} its ▸Dawn ability returns it from the void to its controller's hand`,
    spec: {
      board: {
        active: "enemy", phase: "night",
        player: { void: [VESSEL], deck },
        enemy: { deck },
      },
      steps: () => [pass("enemy")],
    },
    check: ({ state, ids, events }) => {
      const source = ids.player.void[0];
      const dawn = events.findIndex((event) => event.kind === "phaseChanged" && event.phase === "dawn" && event.active === "player");
      const returned = events.findIndex((event) => event.kind === "returnedToHand" && event.instance === source);
      expect(dawn).toBeGreaterThanOrEqual(0);
      expect(returned).toBeGreaterThan(dawn);
      expect(state.instances[source]?.zone).toBe("hand");
      expect(state.sides.player.void).toEqual([]);
    },
  },
  {
    name: `${vessel.id} its void ▸Dawn ability does nothing while the card is in play`,
    spec: {
      board: {
        active: "enemy", phase: "night",
        player: { back: [VESSEL], deck },
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
  },
  {
    name: `${gatekeeper.id} dissolved returns its own card from the void, the only character within its ≤2● bound`,
    spec: {
      board: {
        active: "enemy", phase: "day",
        player: { back: [GATEKEEPER], void: [SYNTHETIC.vanilla3.id], deck },
        enemy: { hand: [SYNTHETIC.dissolveVictim.id], deck },
      },
      // The dissolve's only target and the trigger's only void card are
      // both chosen without a prompt.
      steps: (ids) => [{ side: "enemy", action: { kind: "play", card: ids.enemy.hand[0], from: "hand" } }],
    },
    check: ({ state, ids, events }) => {
      const source = ids.player.back[0]!;
      const dissolved = events.findIndex((event) => event.kind === "dissolved" && event.instance === source);
      const returned = events.findIndex((event) => event.kind === "returnedToHand" && event.instance === source);
      expect(dissolved).toBeGreaterThanOrEqual(0);
      expect(returned).toBeGreaterThan(dissolved);
      expect(state.instances[source]?.zone).toBe("hand");
      expect(state.sides.player.void).toEqual([ids.player.void[0]]);
    },
  },
  {
    name: `${gatekeeper.id} amplified ▸Materialized returns a ≤3● cost character and leaves a costlier one in the void`,
    spec: {
      board: {
        active: "player", phase: "day",
        player: { hand: [{ cardId: GATEKEEPER, amplified: true }], void: [SYNTHETIC.vanilla3.id, SYNTHETIC.vanilla5.id], energy: 2, deck },
        enemy: { deck },
      },
      // The ≤3● character is the only legal choice, chosen without a prompt.
      steps: (ids) => [{ side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }],
    },
    check: ({ state, ids }) => {
      const [cheap, costly] = ids.player.void;
      expect(state.instances[ids.player.hand[0]]?.zone).toBe("play");
      expect(state.sides.player.hand).toEqual([cheap]);
      expect(state.sides.player.void).toEqual([costly]);
    },
  },
];

export default { slug: "cards-46", scenarios } satisfies ScenarioModule;
