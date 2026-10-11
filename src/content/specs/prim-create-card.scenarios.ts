/** Production Seer clauses composed with controlled synthetic dissolve inputs (D20). */
import { expect } from "vitest";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import contemplation from "../cards/contemplation-69964b8e";
import seer from "../cards/seer-of-the-fallen-09e17f29";

const SEER = parseCardId(seer.id);
const CONTEMPLATION = parseCardId(contemplation.id);
const DECK = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);

function dissolves(amplified: boolean, victim: "ordinary" | "survivor" | "figment"): NamedScenario {
  const figment = victim === "figment";
  const expected = figment ? 0 : amplified && victim === "survivor" ? 2 : 1;
  return {
    name: `${seer.id} ${amplified ? "amplified" : "base"} ${victim} dissolution creates ${String(expected)} cards of ${contemplation.id}`,
    spec: {
      board: {
        active: "player", phase: "day",
        player: {
          back: [victim === "ordinary" ? SYNTHETIC.vanilla1.id : SYNTHETIC.survivorVictim.id],
          hand: [{ cardId: SEER, amplified }, figment ? SYNTHETIC.dissolveFigmentCopy.id : SYNTHETIC.dissolveVictim.id],
          energy: 20, deck: DECK,
        },
        enemy: { deck: DECK },
      },
      steps: (ids) => [playFromHand(ids, "player"), playFromHand(ids, "player", 1)],
      answers: (ids) => [[ids.player.back[0]!]],
    },
    check: ({ state, events, ids }) => {
      const made = events.flatMap((entry) => entry.kind === "cardCreated" && entry.zone === "hand" ? [entry.instance] : []);
      expect(made).toHaveLength(expected);
      expect(new Set(made).size).toBe(expected);
      expect(state.sides.player.hand).toEqual(made);
      for (const instance of made) {
        expect(state.instances[instance]).toMatchObject({
          printing: { kind: "card", cardId: CONTEMPLATION },
          owner: "player", controller: "player", zone: "hand", status: { created: true },
        });
      }
      const dissolved = events.filter((entry) => entry.kind === "dissolved").map((entry) => entry.instance);
      expect(dissolved).toHaveLength(1);
      if (figment) {
        expect(events).toContainEqual(expect.objectContaining({ kind: "cardCreated", instance: dissolved[0], zone: "play", printing: { kind: "figmentCopy", cardId: SYNTHETIC.survivorVictim.id, spark: null } }));
        expect(dissolved).not.toContain(ids.player.back[0]);
        expect(state.instances[dissolved[0]]).toBeUndefined();
        expect(state.instances[ids.player.back[0]!]?.zone).toBe("play");
      } else {
        expect(dissolved).toEqual([ids.player.back[0]]);
        expect(state.instances[ids.player.back[0]!]?.zone).toBe("void");
      }
      expect(state.instances[ids.player.hand[0]]?.zone).toBe("play");
    },
  };
}

export default {
  slug: "prim-create-card",
  scenarios: [false, true].flatMap((amplified) => (["ordinary", "survivor", "figment"] as const).map((victim) => dissolves(amplified, victim))),
} satisfies ScenarioModule;
