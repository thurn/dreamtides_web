/** D20: the printed entry and departure triggers share source-object memory. */
import { expect } from "vitest";
import type { ScenarioModule, NamedScenario } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import pilgrim from "../cards/mirrorsea-pilgrim-22239029";

const id = parseCardId(pilgrim.id);
const deck = [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id, SYNTHETIC.vanilla5.id, SYNTHETIC.event0.id];
const scenarios: NamedScenario[] = (["player", "enemy"] as const).map((side) => {
  const other = side === "player" ? "enemy" : "player";
  return { name: `${pilgrim.id} ${side} paired entry banishment returns to hand on dissolve without a draw`,
    spec: { board: { active: side, phase: "day", [side]: { hand: [id, SYNTHETIC.dissolveVictim.id], deck, energy: 9 }, [other]: { deck } },
      steps: (ids) => [playFromHand(ids, side), playFromHand(ids, side, 1)],
      answers: (ids) => [[ids[side].deck[2]]],
    },
    check: ({ state, ids, events }) => {
      const chosen = ids[side].deck[2], source = ids[side].hand[0];
      expect(state.instances[source]?.zone).toBe("void");
      expect(state.sides[side].hand).toEqual([chosen]);
      expect(state.sides[side].deck).toEqual(ids[side].deck.filter((card) => card !== chosen));
      expect(state.sides[side].banished).toEqual([]);
      expect(events.some((event) => event.kind === "banished" && event.instance === chosen)).toBe(true);
      expect(events.some((event) => event.kind === "cardTaken" && event.instance === chosen && event.side === side)).toBe(true);
      expect(events.some((event) => event.kind === "cardDrawn")).toBe(false);
    },
  };
});
export default { slug: "prim-look-banish-linked", scenarios } satisfies ScenarioModule;
