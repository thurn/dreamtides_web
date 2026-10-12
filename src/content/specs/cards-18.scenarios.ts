/** D20: compound source payment and a self-abandonment's own Dissolved trigger. */
import { expect } from "vitest";
import { playFromHand } from "../../engine/testing/scenario";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import catalyst from "../cards/gilded-catalyst-0bddeb19";
import commando from "../cards/night-raid-commando-1cbbfd57";

const CATALYST = parseCardId(catalyst.id), COMMANDO = parseCardId(commando.id);
const deck = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);
const scenarios: NamedScenario[] = (["player", "enemy"] as const).flatMap((side) =>
  [false, true].flatMap((amplified): NamedScenario[] => {
    const other = side === "player" ? "enemy" : "player";
    return [
      {
        name: `${catalyst.id} ${side} ${amplified ? "amplified" : "base"} exhausts, discards its whole nonempty hand and abandons before gaining energy`,
        spec: {
          board: { active: side, phase: "day", [side]: { hand: [{ cardId: CATALYST, amplified }, SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], energy: 1, deck }, [other]: { deck } },
          steps: (ids) => [
            playFromHand(ids, side),
            // Characters enter exhausted: normal phase progression clears it at Ending.
            { side, action: { kind: "pass" } }, { side: other, action: { kind: "pass" } },
            { side, action: { kind: "pass" } }, { side: other, action: { kind: "pass" } },
            { side, action: { kind: "pass" } }, { side: other, action: { kind: "pass" } },
            { side, action: { kind: "activate", source: ids[side].hand[0], ability: 0 } },
          ],
        },
        check: ({ state, ids, events }) => {
          const source = ids[side].hand[0];
          const abandoned = events.findIndex((event) => event.kind === "abandoned" && event.instance === source);
          const readied = events.findIndex((event) => event.kind === "turnStarted" && event.side === side);
          const exhausted = events.findIndex((event, index) => index > readied && event.kind === "exhaustionChanged" && event.instance === source && event.exhausted);
          const gained = events.findIndex((event) => event.kind === "energyChanged" && event.side === side && event.cause === "effect");
          expect(readied).toBeGreaterThanOrEqual(0);
          expect(exhausted).toBeGreaterThan(readied);
          expect(abandoned).toBeGreaterThan(exhausted);
          expect(gained).toBeGreaterThan(abandoned);
          for (const discarded of [...ids[side].hand.slice(1), ids[side].deck[0]]) {
            const index = events.findIndex((event) => event.kind === "discarded" && event.instance === discarded && event.side === side);
            expect(index).toBeGreaterThan(exhausted);
            expect(index).toBeLessThan(abandoned);
          }
          expect(events.filter((event) => event.kind === "discarded" && event.side === side)).toHaveLength(3);
          expect(state.sides[side].hand).toEqual([]);
          expect(state.sides[side].void).toHaveLength(4);
          expect(state.sides[side].void).toEqual(expect.arrayContaining([...ids[side].hand, ids[side].deck[0]]));
          expect(state.instances[source]?.zone).toBe("void");
          expect(state.sides[side].currentEnergy).toBe(amplified ? 5 : 4);
          expect(state.sides[other].currentEnergy).toBe(0);
        },
      },
      {
        name: `${commando.id} ${side} ${amplified ? "amplified" : "base"} own Dissolved draw precedes the abandoned source's activated energy gain`,
        spec: {
          board: { active: side, phase: "day", [side]: { hand: [{ cardId: COMMANDO, amplified }], energy: 2, deck }, [other]: { deck } },
          steps: (ids) => [playFromHand(ids, side), { side, action: { kind: "activate", source: ids[side].hand[0], ability: 0 } }],
        },
        check: ({ state, ids, events }) => {
          const source = ids[side].hand[0], drawn = ids[side].deck[0];
          const dissolved = events.findIndex((event) => event.kind === "dissolved" && event.instance === source);
          const draw = events.findIndex((event) => event.kind === "cardDrawn" && event.instance === drawn && event.side === side);
          const gain = events.findIndex((event) => event.kind === "energyChanged" && event.side === side && event.cause === "effect");
          expect(dissolved).toBeGreaterThanOrEqual(0);
          expect(draw).toBeGreaterThan(dissolved);
          expect(gain).toBeGreaterThan(draw);
          expect(events.filter((event) => event.kind === "triggerQueued" && event.source === source && event.controller === side && event.ability === 1)).toHaveLength(1);
          expect(events.filter((event) => event.kind === "cardDrawn" && event.side === side)).toHaveLength(1);
          expect(state.instances[source]?.zone).toBe("void");
          expect(state.instances[source]?.variant.amplified).toBe(amplified);
          expect(state.sides[side].hand).toEqual([drawn]);
          expect(state.sides[side].void).toEqual([source]);
          expect(state.sides[side].currentEnergy).toBe(amplified ? 2 : 1);
          expect(state.sides[other].hand).toEqual([]);
          expect(state.sides[other].currentEnergy).toBe(0);
        },
      },
    ];
  }),
);

export default { slug: "cards-18", scenarios } satisfies ScenarioModule;
