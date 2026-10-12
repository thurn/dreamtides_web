/** D20: own-entry materialization consumes the trigger limit, renewed each turn (RD-hv-7x4l.6-5). */
import { expect } from "vitest";
import { playFromHand } from "../../engine/testing/scenario";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import dawnblade from "../cards/dawnblade-a42fbd1b";

const DAWNBLADE = parseCardId(dawnblade.id);
const deck = Array.from({ length: 4 }, () => SYNTHETIC.vanilla0.id);
const scenarios: NamedScenario[] = (["player", "enemy"] as const).flatMap((side) =>
  [false, true].map((amplified): NamedScenario => {
    const other = side === "player" ? "enemy" : "player";
    return {
      name: `${dawnblade.id} ${side} ${amplified ? "amplified" : "base"} own entry counts once, opponent entry is ignored and the next turn renews the gain`,
      spec: {
        board: { active: side, phase: "day", [side]: { hand: [{ cardId: DAWNBLADE, amplified }, SYNTHETIC.vanilla0.id, SYNTHETIC.vanilla0.id], energy: 1, deck }, [other]: { hand: [SYNTHETIC.vanilla0.id], deck } },
        steps: (ids) => [
          playFromHand(ids, side), playFromHand(ids, side, 1),
          { side, action: { kind: "pass" } }, { side: other, action: { kind: "pass" } },
          { side, action: { kind: "pass" } },
          playFromHand(ids, other),
          { side: other, action: { kind: "pass" } }, { side, action: { kind: "pass" } },
          { side: other, action: { kind: "pass" } },
          playFromHand(ids, side, 2),
        ],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].hand[0];
        const ownTurn = events.findIndex((event) => event.kind === "turnStarted" && event.side === side);
        const opponentTurn = events.findIndex((event) => event.kind === "turnStarted" && event.side === other);
        const gains = events.flatMap((event, index) => event.kind === "energyChanged" && event.side === side && event.cause === "effect" ? [{ index, change: event.change }] : []);
        expect(gains.map((gain) => gain.change)).toEqual([amplified ? 2 : 1, amplified ? 2 : 1]);
        const entries = ids[side].hand.map((instance) => events.findIndex((event) => event.kind === "materialized" && event.instance === instance));
        expect(entries.every((index) => index >= 0)).toBe(true);
        expect(gains[0]?.index).toBeGreaterThan(entries[0]);
        expect(gains[0]?.index).toBeLessThan(entries[1]);
        expect(gains[0]?.index).toBeLessThan(opponentTurn);
        expect(opponentTurn).toBeGreaterThanOrEqual(0);
        expect(ownTurn).toBeGreaterThan(opponentTurn);
        expect(entries[2]).toBeGreaterThan(ownTurn);
        expect(gains[1]?.index).toBeGreaterThan(entries[2]);
        expect(events.filter((event) => event.kind === "triggerQueued" && event.source === source && event.controller === side)).toHaveLength(2);
        for (const instance of [...ids[side].hand, ids[other].hand[0]]) expect(state.instances[instance]?.zone).toBe("play");
        expect(state.instances[source]?.variant.amplified).toBe(amplified);
        expect(state.sides[side].currentEnergy).toBe(amplified ? 3 : 2);
        expect(events.filter((event) => event.kind === "energyChanged" && event.side === other && event.cause === "effect")).toEqual([]);
      },
    };
  }),
);

export default { slug: "cards-23", scenarios } satisfies ScenarioModule;
