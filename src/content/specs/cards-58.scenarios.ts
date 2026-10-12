/** D20: a Night ability returns its physical source only while in its void. */
import { expect } from "vitest";
import type {
  NamedScenario,
  ScenarioModule,
} from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import lookout from "../cards/wreckheap-lookout-1b341984";

const scenarios: NamedScenario[] = [];
for (const side of ["player", "enemy"] as const) {
  for (const accepted of [true, false]) {
    scenarios.push({
      name: `${lookout.id} ${side} ${accepted ? "pays for" : "declines"} its own Night return from the void`,
      spec: {
        board: {
          active: side,
          phase: "day",
          [side]: {
            front: [SYNTHETIC.vanilla1.id],
            void: [parseCardId(lookout.id)],
            energy: 3,
          },
        },
        steps: () => [
          { side, action: { kind: "pass" } },
          {
            side: side === "player" ? "enemy" : "player",
            action: { kind: "pass" },
          },
        ],
        answers: () => [accepted],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].void[0];
        expect(state.turn.phase).toBe("night");
        expect(state.instances[source]).toMatchObject({
          controller: side,
          zone: accepted ? "play" : "void",
        });
        expect(state.sides[side].currentEnergy).toBe(accepted ? 1 : 3);
        if (accepted) {
          expect(state.sides[side].backRank[0]).toBe(source);
          expect(state.instances[source].status.exhausted).toBe(true);
          expect(events).toContainEqual(
            expect.objectContaining({ kind: "materialized", instance: source }),
          );
        } else {
          expect(
            events.some(
              (e) => e.kind === "materialized" && e.instance === source,
            ),
          ).toBe(false);
        }
      },
    });
  }
  scenarios.push({
    name: `${lookout.id} ${side} retains its amplified variant across dissolution and returns awakened`,
    spec: {
      board: {
        active: side,
        phase: "day",
        [side]: {
          front: [SYNTHETIC.vanilla1.id],
          hand: [
            { cardId: parseCardId(lookout.id), amplified: true },
            SYNTHETIC.dissolveVictim.id,
          ],
          energy: 3,
        },
      },
      steps: (ids) => [
        {
          side,
          action: { kind: "play", card: ids[side].hand[0], from: "hand" },
        },
        {
          side,
          action: { kind: "play", card: ids[side].hand[1], from: "hand" },
        },
        { side, action: { kind: "pass" } },
        {
          side: side === "player" ? "enemy" : "player",
          action: { kind: "pass" },
        },
      ],
      answers: (ids) => [[ids[side].hand[0]], true],
    },
    check: ({ state, ids, events }) => {
      const source = ids[side].hand[0];
      expect(state.instances[source]).toMatchObject({
        zone: "play",
        variant: { amplified: true },
        status: { exhausted: false },
      });
      expect(state.sides[side].currentEnergy).toBe(0);
      expect(
        events.filter(
          (e) => e.kind === "materialized" && e.instance === source,
        ),
      ).toHaveLength(2);
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "dissolved", instance: source }),
      );
    },
  });
  scenarios.push({
    name: `${lookout.id} ${side} has no return without a challenger`,
    spec: {
      board: {
        active: side,
        phase: "day",
        [side]: { void: [parseCardId(lookout.id)], energy: 3 },
      },
      steps: () => [
        { side, action: { kind: "pass" } },
        {
          side: side === "player" ? "enemy" : "player",
          action: { kind: "pass" },
        },
      ],
    },
    check: ({ state, ids }) => {
      expect(state.instances[ids[side].void[0]].zone).toBe("void");
      expect(state.sides[side].currentEnergy).toBe(3);
    },
  });
}
export default { slug: "cards-58", scenarios } satisfies ScenarioModule;
