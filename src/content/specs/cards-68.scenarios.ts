/** D20: functional-zone triggers restore these cards, with their own entry and static abilities. */
import { expect } from "vitest";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import pinnacle from "../cards/pinnacle-ascendant-e4e8d3b9";
import explorer from "../cards/ridge-vortex-explorer-06a4709d";

const PINNACLE = parseCardId(pinnacle.id);
const EXPLORER = parseCardId(explorer.id);
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  for (const eroded of [false, true]) {
    scenarios.push({
      name: `${pinnacle.id} ${side} ${eroded ? "eroded" : "discarded"} grants zero-cost reclaim and awakens its own and allied arrivals while in play`,
      spec: {
        board: {
          active: side,
          phase: "day",
          [side]: {
            back: eroded ? [] : [SYNTHETIC.discardOne.id],
            hand: [eroded ? SYNTHETIC.erodeOne.id : PINNACLE, SYNTHETIC.vanilla0.id, SYNTHETIC.dissolveVictim.id, SYNTHETIC.vanilla0.id],
            deck: eroded ? [PINNACLE] : [],
            energy: 0,
          },
        },
        steps: (ids) => {
          const source = eroded ? ids[side].deck[0] : ids[side].hand[0];
          return [
            eroded ? playFromHand(ids, side) : { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
            { side, action: { kind: "play", card: source, from: "void" } },
            { side, action: { kind: "reposition", card: source, to: { rank: "front", index: 0 } } },
            playFromHand(ids, side, 1),
            playFromHand(ids, side, 2),
            playFromHand(ids, side, 3),
          ];
        },
        answers: (ids) => {
          const source = eroded ? ids[side].deck[0] : ids[side].hand[0];
          return eroded ? [[source]] : [[source], [source]];
        },
      },
      check: ({ state, ids, events }) => {
        const source = eroded ? ids[side].deck[0] : ids[side].hand[0];
        const ally = ids[side].hand[1];
        const later = ids[side].hand[3];
        expect(events).toContainEqual(expect.objectContaining({ kind: eroded ? "eroded" : "discarded", instance: source, side }));
        expect(events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source, controller: side, ability: 1, subject: source }));
        expect(events).toContainEqual(expect.objectContaining({ kind: "effectStarted", source, change: { kind: "keyword", instance: source, keyword: "reclaim", gains: true, reclaimCosts: [{ cost: "energy", amount: 0 }] } }));
        // With no energy left, only the granted zero-cost Reclaim can play it.
        expect(state.sides[side].currentEnergy).toBe(0);
        expect(events).toContainEqual(expect.objectContaining({ kind: "materialized", instance: source, side }));
        // The front-rank advance is legal only for a ready character.
        expect(events).toContainEqual(expect.objectContaining({ kind: "repositioned", instance: source, to: { rank: "front", index: 0 } }));
        expect(state.instances[source]?.zone).toBe("banished");
        expect(state.instances[ally]).toMatchObject({ zone: "play", status: { exhausted: false } });
        expect(state.instances[later]).toMatchObject({ zone: "play", status: { exhausted: true } });
      },
    });
  }

  for (const amplified of [false, true]) {
    scenarios.push({
      name: `${explorer.id} ${side} discarded ${amplified ? "amplified" : "base"} card materializes ${amplified ? "ready" : "exhausted"} without play or reclaim`,
      spec: {
        board: { active: side, phase: "day", [side]: { back: [SYNTHETIC.discardOne.id], hand: [{ cardId: EXPLORER, amplified }] } },
        steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].hand[0];
        expect(state.instances[source]).toMatchObject({ zone: "play", controller: side, variant: { amplified }, status: { exhausted: !amplified, reclaimed: false } });
        expect(events).toContainEqual(expect.objectContaining({ kind: "discarded", instance: source, side }));
        expect(events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source, controller: side, subject: source }));
        expect(events.filter((event) => event.kind === "materialized" && event.instance === source)).toHaveLength(1);
        expect(events.filter((event) => event.kind === "cardPlayed" && event.instance === source)).toEqual([]);
        expect(state.sides[side].currentEnergy).toBe(0);
      },
    });
  }

  scenarios.push({
    name: `${explorer.id} ${side} amplified normal hand play enters exhausted because its awakened entry belongs to the discard effect`,
    spec: {
      board: { active: side, phase: "day", [side]: { hand: [{ cardId: EXPLORER, amplified: true }], energy: 2 } },
      steps: (ids) => [playFromHand(ids, side)],
    },
    check: ({ state, ids, events }) => {
      expect(state.instances[ids[side].hand[0]]).toMatchObject({ zone: "play", status: { exhausted: true } });
      expect(events.filter((event) => event.kind === "triggerQueued")).toEqual([]);
    },
  });
}

export default { slug: "cards-68", scenarios } satisfies ScenarioModule;
