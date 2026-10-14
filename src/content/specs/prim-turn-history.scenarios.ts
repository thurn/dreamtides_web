/** Current-turn physical membership in a functional void (D20). */
import { expect } from "vitest";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import wake from "../cards/wake-the-fallen-72debe2e";

export default {
  slug: "prim-turn-history",
  scenarios: [{
    name: `${wake.id} materializes only physical current-void characters that dissolved during this turn`,
    spec: {
      board: {
        active: "player", phase: "day",
        player: { hand: [SYNTHETIC.dissolveVictim.id, parseCardId(wake.id)], back: [SYNTHETIC.vanilla0.id, SYNTHETIC.vanilla1.id], void: [SYNTHETIC.vanilla2.id], energy: 4 },
      },
      steps: ids => [playFromHand(ids, "player", 0), playFromHand(ids, "player", 1)],
      answers: ids => [[ids.player.back[0]!]],
    },
    check: ({ state, ids, events }) => {
      const returned = ids.player.back[0]!, unrelated = ids.player.void[0];
      expect(events.filter(event => event.kind === "dissolved").map(event => event.instance)).toEqual([returned]);
      expect(events.filter(event => event.kind === "materialized").map(event => event.instance)).toEqual([returned]);
      expect(state.instances[returned].zone).toBe("play");
      expect(state.instances[returned].status.exhausted).toBe(true);
      expect(state.instances[unrelated].zone).toBe("void");
      expect(state.sides.player.backRank.slice(0, 2)).toEqual(ids.player.back);
    },
  }],
} satisfies ScenarioModule;
