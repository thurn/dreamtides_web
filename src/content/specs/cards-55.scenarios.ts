/** D20: a Dawn abandonment triggers the same character's abandon ability, including when it abandons itself. */
import { expect } from "vitest";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import specter from "../cards/specter-of-silent-snow-4ccb9bb6";

const SPECTER = parseCardId(specter.id);
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);

const scenarios: NamedScenario[] = (["player", "enemy"] as const).flatMap((side) =>
  [false, true].map((abandonSelf): NamedScenario => {
    const other = side === "player" ? "enemy" : "player";
    return {
      name: `${specter.id} ${side} Dawn abandons ${abandonSelf ? "itself" : "another character"} and resolves its own abandon trigger`,
      spec: {
        board: {
          active: other,
          phase: "night",
          [side]: { back: [SPECTER, SYNTHETIC.vanilla1.id], deck },
          [other]: { deck },
        },
        steps: () => [{ side: other, action: { kind: "pass" } }],
        answers: (ids) => [[ids[side].back[abandonSelf ? 0 : 1]!]],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].back[0]!;
        const abandoned = ids[side].back[abandonSelf ? 0 : 1]!;
        const dawn = events.findIndex((event) => event.kind === "phaseChanged" && event.phase === "dawn" && event.active === side);
        const departure = events.findIndex((event) => event.kind === "abandoned" && event.instance === abandoned && event.side === side);
        const watch = events.findIndex((event) => event.kind === "triggerQueued" && event.source === source && event.ability === 1 && event.controller === side && event.subject === abandoned);
        expect(dawn).toBeGreaterThanOrEqual(0);
        expect(departure).toBeGreaterThan(dawn);
        expect(watch).toBeGreaterThan(departure);
        expect(events.filter((event) => event.kind === "abandoned").map((event) => event.instance)).toEqual([abandoned]);
        expect(events.flatMap((event) => event.kind === "triggerResolved" && event.source === source && event.controller === side && event.applied ? [event.ability] : [])).toEqual([0, 1]);
        // Draw phase supplies the first card; the abandon trigger supplies the second.
        const draws = events.flatMap((event, index) => event.kind === "cardDrawn" && event.side === side ? [{ instance: event.instance, index }] : []);
        expect(draws.map((event) => event.instance)).toEqual(ids[side].deck.slice(0, 2));
        expect(draws[0]?.index).toBeLessThan(dawn);
        expect(draws[1]?.index).toBeGreaterThan(watch);
        expect(state.sides[side].hand).toEqual(ids[side].deck.slice(0, 2));
        expect(state.sides[other].hand).toEqual([]);
        expect(state.instances[abandoned]?.zone).toBe("void");
        expect(state.instances[source]?.zone).toBe(abandonSelf ? "void" : "play");
        expect(state.instances[source]?.status.gainedSpark).toBe(abandonSelf ? 0 : 1);
        expect(events.filter((event) => event.kind === "sparkGained")).toHaveLength(abandonSelf ? 0 : 1);
      },
    };
  }),
);

export default { slug: "cards-55", scenarios } satisfies ScenarioModule;
