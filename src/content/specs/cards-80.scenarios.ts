/** D20: live qualifying costs, conditional draw/discard and Reclaim's own play history. */
import { expect } from "vitest";
import { opponent, parseFigmentId } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import call from "../cards/call-the-lost-2690912e";
import nexus from "../cards/nexus-wayfinder-fd5b3e85";
import shared from "../cards/shared-revelation-3fdf265c";
import shadow from "../figments/shadow-86125402";

const CALL = parseCardId(call.id), NEXUS = parseCardId(nexus.id), SHARED = parseCardId(shared.id);
const SHADOW = parseFigmentId(shadow.id);
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  scenarios.push({
    name: `${nexus.id} ${side} its paid materialization makes successive qualifying characters free while other plays pay`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { hand: [NEXUS, v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.event1.id, v.vanilla3.id], energy: (nexus.energyCost ?? 0) + 4 },
        [other]: { back: [v.vanilla1.id] },
      },
      steps: ids => ids[side].hand.map((_, index) => playFromHand(ids, side, index)),
    },
    check: ({ state, start, ids, events }) => {
      const hand = ids[side].hand;
      expect(state.sides[side].currentEnergy).toBe(0);
      for (const index of [0, 1, 2, 3, 5]) {
        expect(state.instances[hand[index]]).toMatchObject({ zone: "play", controller: side });
      }
      expect(state.instances[hand[4]]).toMatchObject({ zone: "void", controller: side });
      expect(state.instances[ids[other].back[0]!]).toEqual(start.instances[ids[other].back[0]!]);
      expect(events.filter(e => e.kind === "cardPlayed").map(e => e.instance)).toEqual(hand);
      expect(events.filter(e => e.kind === "resolved").map(e => e.instance)).toEqual(hand);
      expect(state.stack).toEqual([]);
    },
  });

  for (const prior of ["none", "character", "event", "same-printing"] as const) {
    const hasPrior = prior !== "none", samePrinting = prior === "same-printing";
    const discard = prior === "none" || prior === "character" || samePrinting;
    scenarios.push({
      name: `${shared.id} ${side} ${prior} prior play draws two before discarding only without another physical event`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: {
            hand: hasPrior ? [samePrinting ? SHARED : prior === "character" ? v.vanilla0.id : v.event0.id, SHARED, v.event0.id] : [SHARED, v.event0.id],
            deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id],
            energy: (shared.energyCost ?? 0) * 2,
          },
          [other]: { back: [v.vanilla1.id] },
        },
        steps: ids => hasPrior ? [playFromHand(ids, side), playFromHand(ids, side, 1)] : [playFromHand(ids, side)],
        answers: ids => discard ? [[ids[side].deck[0]]] : [],
      },
      check: ({ state, start, ids, events }) => {
        const sources = samePrinting ? ids[side].hand.slice(0, 2) : [ids[side].hand[hasPrior ? 1 : 0]];
        const drawn = ids[side].deck.slice(0, samePrinting ? 4 : 2);
        const draws = events.filter(e => e.kind === "cardDrawn");
        const discards = events.filter(e => e.kind === "discarded");
        expect(draws).toEqual(drawn.map(instance => ({ kind: "cardDrawn", side, instance })));
        expect(discards).toEqual(discard ? [{ kind: "discarded", side, instance: drawn[0] }] : []);
        if (discard) {
          expect(events.indexOf(discards[0])).toBeGreaterThan(events.indexOf(draws[1]));
          expect(state.instances[drawn[0]]).toMatchObject({ zone: "void", owner: side });
        }
        expect(state.sides[side].hand).toEqual([ids[side].hand[ids[side].hand.length - 1], ...drawn.slice(discard ? 1 : 0)]);
        expect(state.sides[side].deck).toEqual(ids[side].deck.slice(drawn.length));
        expect(state.sides[side].currentEnergy).toBe(samePrinting ? 0 : shared.energyCost);
        for (const source of sources) {
          expect(state.instances[source]).toMatchObject({ zone: "void", controller: side });
          expect(events.filter(e => e.kind === "resolved" && e.instance === source)).toHaveLength(1);
        }
        if (samePrinting) expect(sources[0]).not.toBe(sources[1]);
        expect(state.instances[ids[other].back[0]!]).toEqual(start.instances[ids[other].back[0]!]);
        expect(state.stack).toEqual([]);
      },
    });
  }

  for (const reclaimed of [false, true]) {
    scenarios.push({
      name: `${call.id} ${side} ${reclaimed ? "same physical Reclaim" : "first hand play"} counts its committed plays and materializes two-spark shadows`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: { hand: [CALL], energy: (call.energyCost ?? 0) + 2 },
          [other]: { back: [v.vanilla1.id] },
        },
        steps: ids => [playFromHand(ids, side), ...(reclaimed ? [{ side, action: { kind: "play" as const, card: ids[side].hand[0], from: "void" as const } }] : [])],
      },
      check: ({ state, start, ids, events }) => {
        const source = ids[side].hand[0], plays = reclaimed ? 2 : 1, count = reclaimed ? 3 : 1;
        const figments = Object.values(state.instances).filter(instance => instance.printing.kind === "figment");
        expect(figments).toHaveLength(count);
        for (const figment of figments) {
          expect(figment).toMatchObject({ owner: side, controller: side, zone: "play", printing: { kind: "figment", figment: SHADOW, spark: 2 } });
          expect(state.sides[side].backRank).toContain(figment.id);
        }
        expect(events.filter(e => e.kind === "cardPlayed" && e.instance === source)).toEqual(
          Array.from({ length: plays }, () => ({ kind: "cardPlayed", side, instance: source })),
        );
        expect(events.filter(e => e.kind === "resolved" && e.instance === source)).toHaveLength(plays);
        expect(events.filter(e => e.kind === "materialized" && figments.some(figment => figment.id === e.instance))).toHaveLength(count);
        expect(state.instances[source]).toMatchObject({ zone: reclaimed ? "banished" : "void", owner: side });
        expect(state.sides[side].currentEnergy).toBe(reclaimed ? 0 : 2);
        expect(state.instances[ids[other].back[0]!]).toEqual(start.instances[ids[other].back[0]!]);
        expect(state.stack).toEqual([]);
      },
    });
  }
}

export default { slug: "cards-80", scenarios } satisfies ScenarioModule;
