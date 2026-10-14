/** D20: live source costs and exact nth-play draw/discard composition. */
import { expect } from "vitest";
import { opponent } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import exile from "../cards/exile-8bf53fe6";
import surveyor from "../cards/resonance-surveyor-5b2b2188";

const EXILE = parseCardId(exile.id);
const SURVEYOR = parseCardId(surveyor.id);
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  for (const mode of ["controlled", "live", "floor"] as const) {
    const live = mode === "live";
    const floor = mode === "floor";
    scenarios.push({
      name: `${exile.id} ${side} ${mode} character count reduces its own payment and dissolves only the chosen enemy`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: {
            back: floor ? [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id] : [v.vanilla1.id],
            front: floor ? [v.vanilla1.id, v.vanilla1.id] : [],
            hand: live ? [v.vanilla0.id, EXILE] : [EXILE],
            energy: floor ? 0 : live ? 2 : 4,
          },
          [other]: { back: [v.vanilla1.id, v.vanilla2.id] },
        },
        steps: ids => live ? [
          { side, action: { kind: "play", card: ids[side].hand[0], from: "hand", slot: { rank: "back", index: 1 } } },
          playFromHand(ids, side, 1),
        ] : [playFromHand(ids, side)],
        answers: ids => [[ids[other].back[0]!]],
      },
      check: ({ state, start, ids, events }) => {
        const source = ids[side].hand[live ? 1 : 0];
        const chosen = ids[other].back[0]!;
        const untouched = ids[other].back[1]!;
        expect(state.sides[side].currentEnergy).toBe(mode === "controlled" ? 1 : 0);
        expect(state.instances[source]).toMatchObject({ zone: "void", owner: side, controller: side });
        expect(state.instances[chosen]).toMatchObject({ zone: "void", owner: other });
        expect(state.instances[untouched]).toEqual(start.instances[untouched]);
        expect(events.filter(event => event.kind === "dissolved")).toEqual([
          expect.objectContaining({ kind: "dissolved", side: other, instance: chosen,
            removal: { kind: "effect", controller: side, victimCost: 1 } }),
        ]);
        expect(events.filter(event => event.kind === "cardPlayed" && event.instance === source)).toEqual([
          { kind: "cardPlayed", side, instance: source },
        ]);
        expect(events.filter(event => event.kind === "resolved" && event.instance === source)).toHaveLength(1);
        for (const ally of [...ids[side].back, ...ids[side].front]) {
          if (ally !== null) expect(state.instances[ally]).toEqual(start.instances[ally]);
        }
        if (live) {
          const newcomer = ids[side].hand[0];
          const materialized = events.findIndex(event => event.kind === "materialized" && event.instance === newcomer);
          const played = events.findIndex(event => event.kind === "cardPlayed" && event.instance === source);
          expect(materialized).toBeGreaterThanOrEqual(0);
          expect(played).toBeGreaterThan(materialized);
          expect(state.instances[newcomer]).toMatchObject({ zone: "play", controller: side });
          expect(state.sides[side].backRank[1]).toBe(newcomer);
        }
        expect(state.stack).toEqual([]);
      },
    });
  }
  scenarios.push({
    name: `${surveyor.id} ${side} triggers only on its second play and permits discarding the newly drawn card`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { back: [SURVEYOR], hand: [v.event0.id, v.event1.id, v.event0.id],
          deck: [v.vanilla1.id, v.vanilla2.id], energy: 1 },
      },
      steps: ids => [0, 1, 2].map(index => playFromHand(ids, side, index)),
      answers: ids => [[ids[side].deck[0]]],
    },
    check: ({ state, ids, events }) => {
      const source = ids[side].back[0]!;
      const drawn = ids[side].deck[0];
      const queued = events.filter(event => event.kind === "triggerQueued" && event.source === source);
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ controller: side, subject: ids[side].hand[1], ability: 0 });
      expect(events.filter(event => event.kind === "triggerResolved" && event.source === source)).toEqual([
        expect.objectContaining({ controller: side, ability: 0, applied: true }),
      ]);
      const draws = events.filter(event => event.kind === "cardDrawn");
      const discards = events.filter(event => event.kind === "discarded");
      expect(draws).toEqual([{ kind: "cardDrawn", side, instance: drawn }]);
      expect(discards).toEqual([{ kind: "discarded", side, instance: drawn }]);
      expect(events.indexOf(draws[0])).toBeLessThan(events.indexOf(discards[0]));
      expect(events.filter(event => event.kind === "cardPlayed").map(event => event.instance)).toEqual(ids[side].hand);
      expect(state.instances[drawn]).toMatchObject({ zone: "void", owner: side });
      expect(state.sides[side].deck).toEqual([ids[side].deck[1]]);
      expect(state.sides[side].hand).toEqual([]);
      expect(state.sides[side].currentEnergy).toBe(0);
      expect(state.instances[source]).toMatchObject({ zone: "play", controller: side });
      expect(state.stack).toEqual([]);
    },
  });
}

export default { slug: "cards-ready-192", scenarios } satisfies ScenarioModule;
