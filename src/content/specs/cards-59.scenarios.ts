/** Pyreling's own abandonment cost fires its trigger before its captured draw ability resolves (D20). */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import pyreling from "../cards/pyreling-0637b453";

const PYRELING = parseCardId(pyreling.id);
const DECK = [v.event0.id, v.vanilla2.id, v.vanilla1.id];
function scenario(side: Side, amplified: boolean, selfPayment: boolean): NamedScenario {
  const other: Side = side === "player" ? "enemy" : "player";
  const amount = amplified ? 2 : 1;
  return {
    name: `${pyreling.id} ${side} ${amplified ? "amplified" : "base"} abandons ${selfPayment ? "itself" : "another character"} to draw`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { hand: [{ cardId: PYRELING, amplified }], back: [v.vanilla1.id], energy: 4, deck: DECK },
        [other]: { energy: 0, deck: DECK },
      },
      steps: (ids) => [
        { side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } },
        { side, action: { kind: "activate", source: ids[side].hand[0], ability: 1 } },
      ],
      answers: (ids) => [[selfPayment ? ids[side].hand[0] : ids[side].back[0]!]],
    },
    check: ({ state, events, ids }) => {
      const source = ids[side].hand[0];
      const paid = selfPayment ? source : ids[side].back[0]!;
      const drawn = ids[side].deck[0];
      expect(state.sides[side].currentEnergy).toBe(0);
      expect(events).toContainEqual(expect.objectContaining({ kind: "energyChanged", side, change: -3, cause: "payment" }));
      expect(events).toContainEqual({ kind: "abandoned", instance: paid, side });
      expect(state.instances[paid].zone).toBe("void");
      expect(state.instances[source].zone).toBe(selfPayment ? "void" : "play");
      expect(state.instances[source].status.gainedSpark).toBe(selfPayment ? 0 : amount);
      const queued = events.filter(event => event.kind === "triggerQueued" && event.source === source);
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ subject: paid });
      expect(events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source, applied: true }));
      const gains = events.flatMap(event => event.kind === "sparkGained" && event.instance === source ? [event.amount] : []);
      expect(gains).toEqual(selfPayment ? [] : [amount]);
      expect(events).toContainEqual(expect.objectContaining({ kind: "abilityResolved", source, side }));
      expect(events.filter(event => event.kind === "cardDrawn")).toEqual([{ kind: "cardDrawn", side, instance: drawn }]);
      const abandonedAt = events.findIndex(event => event.kind === "abandoned" && event.instance === paid);
      const queuedAt = events.findIndex(event => event.kind === "triggerQueued" && event.source === source);
      const triggeredAt = events.findIndex(event => event.kind === "triggerResolved" && event.source === source);
      const drawnAt = events.findIndex(event => event.kind === "cardDrawn" && event.instance === drawn);
      expect(queuedAt).toBeGreaterThan(abandonedAt);
      expect(triggeredAt).toBeGreaterThan(queuedAt);
      expect(drawnAt).toBeGreaterThan(triggeredAt);
      expect(state.sides[side].hand).toEqual([drawn]);
      expect(state.instances[ids[side].back[0]!].zone).toBe(selfPayment ? "play" : "void");
      expect(state.stack).toEqual([]);
    },
  };
}

export default {
  slug: "cards-59",
  scenarios: (["player", "enemy"] as const).flatMap(side => [false, true].flatMap(amplified => [false, true].map(selfPayment => scenario(side, amplified, selfPayment)))),
} satisfies ScenarioModule;
