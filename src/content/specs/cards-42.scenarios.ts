/**
 * Scenario specs for the cards-42 batch (D20): Eruption's "When an enemy
 * scores ⍟" ability works from its owner's void, its functional zone. It
 * returns the card to hand on the first enemy that scores, and a second
 * scoring enemy in the same challenge finds the card gone and does nothing.
 * The owner's own characters scoring leave it in the void.
 */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import { opponent } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule, ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import eruption from "../cards/eruption-8a8af982";

const ERUPTION = parseCardId(eruption.id);
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);

/** The active side's Day, the defender's Dusk window, then the active side's Night into the Challenge phase. */
function toChallenge(active: Side): ScenarioStep[] {
  return [active, opponent(active), active].map((side) => ({ side, action: { kind: "pass" } }));
}

const scenarios: NamedScenario[] = [
  {
    name: `${eruption.id} returns from the void to hand once when two enemies score in one challenge`,
    spec: {
      board: {
        active: "enemy", phase: "day",
        player: { void: [ERUPTION, SYNTHETIC.vanilla2.id], deck },
        enemy: { front: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id], deck },
      },
      steps: () => toChallenge("enemy"),
    },
    check: ({ state, ids, events }) => {
      const [card, other] = ids.player.void;
      const scored = events.filter((event) => event.kind === "laneResolved" && event.scored > 0);
      expect(scored).toHaveLength(2);
      expect(state.instances[card]?.zone).toBe("hand");
      expect(state.sides.player.hand.filter((id) => id === card)).toHaveLength(1);
      expect(state.instances[other]?.zone).toBe("void");
      expect(events.filter((event) => event.kind === "triggerResolved" && event.source === card && event.applied)).toHaveLength(1);
    },
  },
  {
    name: `${eruption.id} stays in the void when its owner's character scores`,
    spec: {
      board: {
        active: "player", phase: "day",
        player: { front: [SYNTHETIC.vanilla2.id], void: [ERUPTION], deck },
        enemy: { deck },
      },
      steps: () => toChallenge("player"),
    },
    check: ({ state, ids, events }) => {
      const card = ids.player.void[0];
      expect(events.some((event) => event.kind === "laneResolved" && event.scored > 0)).toBe(true);
      expect(state.instances[card]?.zone).toBe("void");
      expect(events.some((event) => event.kind === "triggerQueued" && event.source === card)).toBe(false);
    },
  },
];

export default { slug: "cards-42", scenarios } satisfies ScenarioModule;
