/** D20: rematerializing its own physical source preserves the paid exhaustion. */
import { expect } from "vitest";
import type {
  NamedScenario,
  ScenarioModule,
} from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { parseCardId } from "../../types/card-identity";
import rider from "../cards/duskmount-rider-58f0dba2";

const scenarios: NamedScenario[] = [];
for (const side of ["player", "enemy"] as const) {
  for (const amplified of [false, true]) {
    const gain = amplified ? 2 : 1;
    scenarios.push({
      name: `${rider.id} ${side} ${amplified ? "amplified" : "base"} self-rematerialization keeps its exhausted source and gains spark`,
      spec: {
        board: {
          active: side,
          phase: "day",
          [side]: {
            hand: [{ cardId: parseCardId(rider.id), amplified }],
            energy: 3,
          },
        },
        steps: (ids) => [
          playFromHand(ids, side),
          {
            side,
            action: { kind: "activate", source: ids[side].hand[0], ability: 1 },
          },
        ],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].hand[0];
        expect(state.instances[source]).toMatchObject({
          controller: side,
          zone: "play",
          variant: { amplified },
          status: { exhausted: true, gainedSpark: gain },
        });
        expect(state.sides[side].backRank[0]).toBe(source);
        expect(events.filter((event) => event.kind === "materialized")).toEqual(
          [
            {
              kind: "materialized",
              instance: source,
              side,
              slot: { rank: "back", index: 0 },
            },
            {
              kind: "materialized",
              instance: source,
              side,
              slot: { rank: "back", index: 0 },
              rematerialized: true,
            },
          ],
        );
        expect(events).toContainEqual({
          kind: "sparkGained",
          instance: source,
          amount: gain,
          expiry: { at: "never" },
          additional: false,
        });
        expect(events.filter((event) => event.kind === "leftPlay")).toEqual([]);
      },
    });
  }
}
export default { slug: "cards-63", scenarios } satisfies ScenarioModule;
