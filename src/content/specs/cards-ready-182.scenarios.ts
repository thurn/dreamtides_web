/** D20: the source earns the counters its other ability spends; self-abandon stores nothing. */
import { expect } from "vitest";
import { opponent, parseFigmentId } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import recruiter from "../cards/grim-recruiter-cf173b05";
import warrior from "../figments/warrior-bb1a5acd";

const RECRUITER = parseCardId(recruiter.id);
const WARRIOR = parseFigmentId(warrior.id);
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  scenarios.push({
    name: `${recruiter.id} ${side} earns two counters and spends them with two energy for two Warriors`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { back: [RECRUITER, v.vanilla1.id, v.vanilla1.id], energy: 2, deck },
        [other]: { hand: [v.interruptEvent.id], energy: 1, deck },
      },
      steps: (ids) => [
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        { side: other, action: { kind: "pass" } },
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        { side: other, action: { kind: "pass" } },
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 1 } },
        { side: other, action: { kind: "pass" } },
      ],
      answers: (ids) => [[ids[side].back[1]!], [ids[side].back[2]!]],
    },
    check: ({ state, start, ids, events }) => {
      const source = ids[side].back[0]!;
      const victims = [ids[side].back[1]!, ids[side].back[2]!];
      expect(events.filter((event) => event.kind === "abandoned")).toEqual(victims.map((instance) => ({ kind: "abandoned", side, instance })));
      expect(events.filter((event) => event.kind === "countersChanged")).toEqual([1, 2, 0].map((counters) => ({ kind: "countersChanged", instance: source, counters })));
      expect(events.filter((event) => event.kind === "abilityActivated")).toEqual([0, 0, 1].map((ability) => ({ kind: "abilityActivated", side, source, ability })));
      expect(events.filter((event) => event.kind === "abilityResolved")).toEqual([0, 0, 1].map((ability) => ({ kind: "abilityResolved", side, source, ability })));
      expect(victims.map((id) => state.instances[id].zone)).toEqual(["void", "void"]);
      expect(state.instances[source]).toMatchObject({ zone: "play", controller: side, status: { counters: 0, exhausted: false } });
      expect(state.sides[side].currentEnergy).toBe(start.sides[side].currentEnergy - 2);
      expect(state.sides[other]).toEqual(start.sides[other]);
      const created = events.flatMap((event) => event.kind === "materialized" ? [event.instance] : []);
      expect(created).toHaveLength(2);
      expect(new Set(created).size).toBe(2);
      for (const id of created) expect(state.instances[id]).toMatchObject({
        printing: { kind: "figment", figment: WARRIOR, spark: 1 },
        controller: side, owner: side, zone: "play", status: { exhausted: true },
      });
      expect(state.stack).toEqual([]);
    },
  }, {
    name: `${recruiter.id} ${side} may pay with itself and stores nothing on its absent source`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { back: [RECRUITER, v.vanilla1.id], energy: 2, deck },
        [other]: { hand: [v.interruptEvent.id], energy: 1, deck },
      },
      steps: (ids) => [
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        { side: other, action: { kind: "pass" } },
      ],
      answers: (ids) => [[ids[side].back[0]!]],
    },
    check: ({ state, start, ids, events }) => {
      const source = ids[side].back[0]!;
      expect(events.filter((event) => event.kind === "abandoned")).toEqual([{ kind: "abandoned", side, instance: source }]);
      expect(events.filter((event) => event.kind === "countersChanged" || event.kind === "materialized")).toEqual([]);
      expect(events.filter((event) => event.kind === "abilityResolved")).toEqual([{ kind: "abilityResolved", side, source, ability: 0 }]);
      expect(state.instances[source]).toMatchObject({ zone: "void", status: { counters: 0 } });
      expect(state.instances[ids[side].back[1]!]).toEqual(start.instances[ids[side].back[1]!]);
      expect(state.sides[side].currentEnergy).toBe(start.sides[side].currentEnergy);
      expect(state.sides[other]).toEqual(start.sides[other]);
      expect(state.stack).toEqual([]);
    },
  });
}

export default { slug: "cards-ready-182", scenarios } satisfies ScenarioModule;
