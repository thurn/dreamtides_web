/** D20: source-linked return connects two printed departure/entry abilities. */
import { expect } from "vitest";
import { playFromHand } from "../../engine/testing/scenario";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import channeler from "../cards/lightning-channeler-c73f978e";
import regent from "../cards/lurking-regent-32f3d6f2";

const CHANNELER = parseCardId(channeler.id), REGENT = parseCardId(regent.id);
const deck = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);
const scenarios: NamedScenario[] = (["player", "enemy"] as const).flatMap((side) =>
  [false, true].map((amplified): NamedScenario => {
    const other = side === "player" ? "enemy" : "player";
    return {
      name: `${channeler.id} ${regent.id} ${side} ${amplified ? "amplified" : "base"} Regent departure draws before linked return re-triggers its banish`,
      spec: {
        board: { active: other, phase: "day",
          [side]: { hand: [{ cardId: CHANNELER, amplified: true }, amplified ? SYNTHETIC.vanilla5.id : SYNTHETIC.vanilla3.id, SYNTHETIC.dissolveVictim.id], energy: 9, deck },
          [other]: { hand: [{ cardId: REGENT, amplified }], energy: 3, deck },
        },
        steps: (ids) => [
          playFromHand(ids, other),
          { side: other, action: { kind: "pass" } }, { side, action: { kind: "pass" } }, { side: other, action: { kind: "pass" } },
          playFromHand(ids, side, 1), playFromHand(ids, side), playFromHand(ids, side, 2),
        ],
        answers: (ids) => [[ids[side].hand[0]]],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].hand[0], returned = ids[other].hand[0], target = ids[side].hand[1], drawn = ids[side].deck[1];
        const banished = events.findIndex((event) => event.kind === "banished" && event.instance === returned);
        const draw = events.findIndex((event) => event.kind === "cardDrawn" && event.instance === drawn && event.side === side);
        const departed = events.findIndex((event) => event.kind === "leftPlay" && event.instance === source);
        const reentered = events.findIndex((event, index) => index > departed && event.kind === "materialized" && event.instance === returned);
        const removed = events.findIndex((event) => event.kind === "banished" && event.instance === target);
        expect(banished).toBeGreaterThanOrEqual(0);
        expect(draw).toBeGreaterThan(banished);
        expect(departed).toBeGreaterThan(draw);
        expect(reentered).toBeGreaterThan(departed);
        expect(removed).toBeGreaterThan(reentered);
        expect(state.instances[source].zone).toBe("void");
        expect(state.instances[returned]).toMatchObject({ zone: "play", controller: other, variant: { amplified } });
        expect(state.instances[target].zone).toBe("banished");
        expect(state.sides[side].hand).toContain(drawn);
        expect(events.filter((event, index) => index > banished && event.kind === "cardDrawn" && event.side === side)).toHaveLength(1);
        expect(state.floating.some((effect) => effect.change.kind === "banishedUntil" && effect.change.instance === returned)).toBe(false);
      },
    };
  }),
);

export default { slug: "cards-28", scenarios } satisfies ScenarioModule;
