/**
 * Scenario specs for prim-when-reclaim-trigger (D20): Reforged Construct's
 * two abilities together. Its "When you reclaim this character" triggers
 * only through a play from the void by its own Reclaim 0●, never from hand,
 * and the spark it gains on the stack stays as it enters play
 * (RD-hv-umm2.91-1). Thornwood Delver in play sees the same reclaim first.
 */
import { expect } from "vitest";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import reforgedConstruct from "../cards/reforged-construct-fa7dadd8";
import thornwoodDelver from "../cards/thornwood-delver-c6d8a7cc";

const CONSTRUCT = parseCardId(reforgedConstruct.id);
const DELVER = parseCardId(thornwoodDelver.id);
const DECK = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);

export default {
  slug: "prim-when-reclaim-trigger",
  scenarios: [
    {
      name: `${reforgedConstruct.id} amplified gains +2✦ only when reclaimed from the void, after Thornwood Delver's once-per-turn trigger`,
      spec: {
        board: {
          active: "player",
          phase: "day",
          player: { back: [DELVER], hand: [{ cardId: CONSTRUCT, amplified: true }, SYNTHETIC.dissolveVictim.id], energy: 2, deck: DECK },
          enemy: { deck: DECK },
        },
        steps: (ids) => [
          { side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
          { side: "player", action: { kind: "play", card: ids.player.hand[1], from: "hand" } },
          { side: "player", action: { kind: "play", card: ids.player.hand[0], from: "void" } },
        ],
        answers: (ids) => [[ids.player.hand[0]]],
      },
      check: ({ events, state, ids }) => {
        const [construct] = ids.player.hand;
        const [delver] = ids.player.back;
        if (delver === null || delver === undefined) throw new Error("no Thornwood Delver in play");
        // Neither the play from hand nor the dissolve is a reclaim: the only triggers are the reclaim's.
        const queued = events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
        expect(queued).toEqual([delver, construct]);
        expect(state.instances[construct]?.zone).toBe("play");
        expect(state.instances[construct]?.status.reclaimed).toBe(true);
        expect(state.instances[construct]?.status.gainedSpark).toBe(2);
        // Thornwood Delver: 2⍟ for its 2✦ as its ability resolved, then +1✦.
        expect(state.sides.player.score).toBe(2);
        expect(state.instances[delver]?.status.gainedSpark).toBe(1);
      },
    },
  ],
} satisfies ScenarioModule;
