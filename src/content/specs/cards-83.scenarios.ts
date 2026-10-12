/** D20: the abandonment's captured cost supplies Discover's strict bound, followed by materialization. */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import aperture from "../cards/temporal-aperture-d2c22fdc";

const SOURCE = parseCardId(aperture.id);
function scenario(side: Side, amplified: boolean, higher: boolean): NamedScenario {
  const other = side === "player" ? "enemy" : "player";
  return {
    name: `${aperture.id} ${side} ${amplified ? "amplified" : "base"} captures ${higher ? "1 with a higher-cost result" : "2 with no higher-cost result"}`,
    spec: {
      board: { active: side, phase: "day",
        [side]: { hand: [{ cardId: SOURCE, amplified }], back: [v.vanilla1.id, v.vanilla2.id], energy: (aperture.energyCost ?? 0) + 10,
          deck: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.event0.id] },
        [other]: { deck: [v.vanilla1.id, v.vanilla2.id] },
      },
      steps: ids => [playFromHand(ids, side)],
      answers: ids => [[ids[side].back[higher ? 0 : 1]!]],
    },
    check: ({ start, state, events, ids }) => {
      const source = ids[side].hand[0], paid = ids[side].back[higher ? 0 : 1]!, kept = ids[side].back[higher ? 1 : 0]!;
      const candidate = ids[side].deck[2];
      const abandoned = events.findIndex(e => e.kind === "abandoned" && e.instance === paid);
      const played = events.findIndex(e => e.kind === "cardPlayed" && e.instance === source);
      expect(abandoned).toBeGreaterThanOrEqual(0);
      expect(played).toBeGreaterThan(abandoned);
      expect(state.instances[paid].zone).toBe("void");
      expect(state.instances[kept].zone).toBe("play");
      expect(state.instances[source].zone).toBe("void");
      expect(events).toContainEqual(expect.objectContaining({ kind: "energyChanged", side, change: -(aperture.energyCost ?? 0), cause: "payment" }));
      expect(state.sides[side].currentEnergy).toBe(start.sides[side].currentEnergy - (aperture.energyCost ?? 0));
      const discovered = events.flatMap(e => e.kind === "cardDiscovered" ? [e.instance] : []);
      const entered = events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);
      expect(discovered).toEqual(higher ? [candidate] : []);
      expect(entered).toEqual(higher ? [candidate] : []);
      if (higher) {
        const discovery = events.findIndex(e => e.kind === "cardDiscovered" && e.instance === candidate);
        const materialized = events.findIndex(e => e.kind === "materialized" && e.instance === candidate);
        expect(discovery).toBeGreaterThan(played);
        expect(materialized).toBeGreaterThan(discovery);
        expect(state.instances[candidate]).toMatchObject({ controller: side, zone: "play", status: { exhausted: !amplified } });
      } else {
        for (const id of ids[side].deck) expect(state.instances[id].zone).toBe("deck");
      }
      expect(state.instances[ids[side].deck[0]].zone).toBe("deck");
      expect(state.instances[ids[side].deck[1]].zone).toBe("deck");
      expect(state.instances[ids[side].deck[3]].zone).toBe("deck");
      expect(state.stack).toEqual([]);
    },
  };
}

export default { slug: "cards-83", scenarios: (["player", "enemy"] as const).flatMap(side => [false, true].flatMap(amplified => [false, true].map(higher => scenario(side, amplified, higher)))) } satisfies ScenarioModule;
