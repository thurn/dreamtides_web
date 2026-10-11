/**
 * Scenario specs for prim-when-put-into-void-trigger (D20): The Annihilator's
 * ▸Dawn feeds its own "when a ≤2● cost character is put into your void"
 * ability, once for the abandoned character and once for each eroded one
 * that matches (RD-hv-umm2.77-1).
 */
import { expect } from "vitest";
import type { EngineEvent } from "../../engine/events";
import type { InstanceId } from "../../engine/state/ids";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import theAnnihilator from "../cards/the-annihilator-b6bad2a1";

const ANNIHILATOR = parseCardId(theAnnihilator.id);
const SMALL = SYNTHETIC.vanilla2.id;
const LARGE = SYNTHETIC.vanilla3.id;

/** The subjects of the triggers `source` queued, in order. */
function triggeredBy(events: readonly EngineEvent[], source: InstanceId | null | undefined): (InstanceId | null)[] {
  return events.flatMap((event) => (event.kind === "triggerQueued" && event.source === source ? [event.subject] : []));
}

/** The cards eroded from the player's deck, in order. */
function eroded(events: readonly EngineEvent[]): InstanceId[] {
  return events.flatMap((event) => (event.kind === "eroded" && event.side === "player" ? [event.instance] : []));
}

export default {
  slug: "prim-when-put-into-void-trigger",
  scenarios: [
    {
      name: `${theAnnihilator.id} its Dawn abandon and erode each put a ≤2● cost character into its controller's void, and each draws a card`,
      spec: {
        board: {
          active: "enemy",
          phase: "night",
          player: { back: [ANNIHILATOR, SMALL], deck: [SMALL, SMALL, SMALL, SMALL, SMALL] },
          enemy: { deck: [SMALL, SMALL, SMALL] },
        },
        // The enemy's turn ends; the player's Dawn abandons the small character.
        steps: () => [{ side: "enemy", action: { kind: "pass" } }],
        answers: (ids) => [[ids.player.back[1]!]],
      },
      check: ({ events, state, ids }) => {
        const [annihilator, small] = ids.player.back;
        const [erodedCard] = eroded(events);
        expect(erodedCard).toBeDefined();
        expect(triggeredBy(events, annihilator)).toEqual([null, small, erodedCard]);
        expect(state.instances[small!]?.zone).toBe("void");
        expect(state.instances[erodedCard]?.zone).toBe("void");
        expect(state.instances[annihilator!]?.zone).toBe("play");
        const drawn = events.filter((event) => event.kind === "cardDrawn" && event.side === "player").length;
        expect(state.sides.player.hand).toHaveLength(drawn);
        expect(drawn).toBeGreaterThanOrEqual(2);
      },
    },
    {
      name: `${theAnnihilator.id} a ≥3● cost character abandoned or eroded draws nothing, and abandoning itself sees nothing`,
      spec: {
        board: {
          active: "enemy",
          phase: "night",
          player: { back: [ANNIHILATOR], deck: [LARGE, LARGE, LARGE, LARGE] },
          enemy: { deck: [SMALL, SMALL, SMALL] },
        },
        // The Annihilator is the only character, so its own Dawn abandons it.
        steps: () => [{ side: "enemy", action: { kind: "pass" } }],
      },
      check: ({ events, state, ids }) => {
        const [annihilator] = ids.player.back;
        expect(state.instances[annihilator!]?.zone).toBe("void");
        expect(eroded(events)).toHaveLength(1);
        expect(triggeredBy(events, annihilator)).toEqual([null]);
      },
    },
  ],
} satisfies ScenarioModule;
