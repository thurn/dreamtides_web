/**
 * Scenario specs for prim-when-play-from-void-trigger (D20): Graywatch's
 * ability works from its functional zone, the void. Played from hand and
 * dissolved, amplified Graywatch returns to play awakened when its owner
 * reclaims another card (RD-hv-umm2.93-1, RD-hv-umm2.93-2).
 */
import { expect } from "vitest";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import graywatch from "../cards/graywatch-3a59cd3d";
import reforgedConstruct from "../cards/reforged-construct-fa7dadd8";

const GRAYWATCH = parseCardId(graywatch.id);
const CONSTRUCT = parseCardId(reforgedConstruct.id);
const DECK = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);

export default {
  slug: "prim-when-play-from-void-trigger",
  scenarios: [
    {
      name: `${graywatch.id} amplified returns from the void to play awakened when another card is reclaimed`,
      spec: {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [{ cardId: GRAYWATCH, amplified: true }, SYNTHETIC.dissolveVictim.id], void: [CONSTRUCT], energy: 3, deck: DECK },
          enemy: { deck: DECK },
        },
        steps: (ids) => [
          { side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
          { side: "player", action: { kind: "play", card: ids.player.hand[1], from: "hand" } },
          { side: "player", action: { kind: "play", card: ids.player.void[0], from: "void" } },
        ],
      },
      check: ({ events, state, ids }) => {
        const [watcher] = ids.player.hand;
        const [construct] = ids.player.void;
        // Neither the hand plays nor the dissolve trigger it; the reclaim of Reforged Construct does, from the void.
        const queued = events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
        expect(queued).toEqual([watcher, construct]);
        expect(events.filter((entry) => entry.kind === "materialized").map((entry) => entry.instance)).toEqual([watcher, watcher, construct]);
        expect(state.instances[watcher]?.zone).toBe("play");
        expect(state.instances[watcher]?.status.exhausted).toBe(false);
        expect(state.instances[construct]?.zone).toBe("play");
      },
    },
  ],
} satisfies ScenarioModule;
