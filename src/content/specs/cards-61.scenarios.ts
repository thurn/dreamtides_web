/** D20: a void activation returns the same physical card and preserves its played variant. */
import { expect } from "vitest";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import host from "../cards/corrupted-host-49641e8e";
import reaper from "../cards/immortal-reaper-fd355778";

const HOST = parseCardId(host.id), REAPER = parseCardId(reaper.id);
const deck = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);
const scenarios: NamedScenario[] = (["player", "enemy"] as const).flatMap((side) =>
  [false, true].map((amplified): NamedScenario => {
    const other = side === "player" ? "enemy" : "player";
    return {
      name: `${reaper.id} ${side} ${amplified ? "amplified" : "base"} returns its played physical card from the void after paying energy and banishing another card`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: { back: [HOST], hand: [{ cardId: REAPER, amplified }], void: [SYNTHETIC.vanilla2.id], energy: 5, deck },
          [other]: { deck },
        },
        steps: (ids) => [
          playFromHand(ids, side),
          { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
          { side, action: { kind: "activate", source: ids[side].hand[0], ability: 0 } },
        ],
        answers: (ids) => [[ids[side].void[0]]],
      },
      check: ({ state, events, ids }) => {
        const source = ids[side].hand[0], payer = ids[side].void[0];
        expect(state.instances[source]).toMatchObject({
          zone: "play", owner: side, controller: side, variant: { amplified },
          status: { exhausted: !amplified, reclaimed: false, playedViaReclaim: false },
        });
        expect(state.sides[side].backRank).toContain(source);
        expect(state.sides[side].void).toEqual([]);
        expect(state.sides[side].banished).toEqual([payer]);
        expect(state.sides[side].currentEnergy).toBe(0);
        expect(state.instances[payer]?.zone).toBe("banished");
        expect(events).toContainEqual({ kind: "abandoned", instance: source, side });
        expect(events).toContainEqual({ kind: "abilityActivated", source, side, ability: 0 });
        const departure = events.findIndex((event) => event.kind === "abandoned" && event.instance === source);
        const payment = events.findIndex((event, index) => index > departure && event.kind === "banished" && event.instance === payer);
        const returned = events.findIndex((event, index) => index > payment && event.kind === "materialized" && event.instance === source);
        expect(departure).toBeGreaterThanOrEqual(0);
        expect(payment).toBeGreaterThan(departure);
        expect(returned).toBeGreaterThan(payment);
      },
    };
  }),
);

export default { slug: "cards-61", scenarios } satisfies ScenarioModule;
