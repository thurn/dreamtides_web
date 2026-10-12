/** D20: a reclaimed self-copy resolves once with fresh play provenance, then ceases. */
import { expect } from "vitest";
import type { NamedScenario, ScenarioModule, ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import portal from "../cards/prismatic-portal-74e82d0d";

const PORTAL = parseCardId(portal.id);
const deck = Array.from({ length: 4 }, () => SYNTHETIC.vanilla0.id);
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = side === "player" ? "enemy" : "player";
  for (const from of ["hand", "void"] as const) {
    const reclaimed = from === "void";
    scenarios.push({
      name: `${portal.id} ${side} ${from} resolves its benefits and ${reclaimed ? "one finite self-copy" : "no self-copy"}`,
      spec: {
        board: { active: side, phase: "day", [side]: { [from]: [PORTAL], energy: 10, deck }, [other]: { deck } },
        steps: (ids): ScenarioStep[] => [
          { side, action: { kind: "play", card: ids[side][from][0], from } },
        ],
      },
      check: ({ start, state, events, ids }) => {
        const source = ids[side][from][0];
        const copies = events.filter((event) => event.kind === "cardCopied");
        expect(copies).toHaveLength(reclaimed ? 1 : 0);
        for (const copied of copies) {
          expect(copied).toMatchObject({ side, original: source });
          expect(state.instances[copied.copy]).toBeUndefined();
          expect(events).toContainEqual({ kind: "ceasedToExist", instance: copied.copy, side, from: "stack" });
          expect(events.filter((event) => event.kind === "resolved" && event.instance === copied.copy)).toHaveLength(1);
          expect(events.some((event) => event.kind === "cardPlayed" && event.instance === copied.copy)).toBe(false);
        }
        expect(events.filter((event) => event.kind === "cardPlayed" && event.instance === source)).toHaveLength(1);
        expect(events.filter((event) => event.kind === "resolved" && event.instance === source)).toHaveLength(1);
        expect(state.instances[source]).toMatchObject({ zone: reclaimed ? "banished" : "void", status: { playedViaReclaim: reclaimed } });
        const draws = reclaimed ? 2 : 1;
        expect(state.sides[side].hand).toEqual(ids[side].deck.slice(0, draws));
        expect(state.sides[side].deck).toEqual(ids[side].deck.slice(draws));
        expect(events.filter((event) => event.kind === "cardDrawn" && event.side === side)).toHaveLength(draws);
        expect(state.sides[side].currentEnergy).toBe(start.sides[side].currentEnergy - (reclaimed ? 6 : portal.energyCost!) + 2 * draws);
        expect(state.sides[other].currentEnergy).toBe(start.sides[other].currentEnergy);
        expect(state.stack).toEqual([]);
      },
    });
  }
}

export default { slug: "cards-77", scenarios } satisfies ScenarioModule;
