/** D20: paying the Challenge discard fires this source's separate spark trigger before scoring, then expires. */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule, type ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import siphoner from "../cards/smoke-siphoner-88994286";

const SIPHONER = parseCardId(siphoner.id);
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla0.id);
const pass = (side: Side): ScenarioStep => ({ side, action: { kind: "pass" } });
const scenarios: NamedScenario[] = (["player", "enemy"] as const).flatMap((side) =>
  [false, true].map((amplified): NamedScenario => {
    const other = side === "player" ? "enemy" : "player";
    return {
      name: `${siphoner.id} ${side} ${amplified ? "amplified" : "base"} Challenge payment draws, triggers its own temporary gain before scoring and expires at Ending`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: { hand: [{ cardId: SIPHONER, amplified }, SYNTHETIC.vanilla0.id], energy: 3, deck },
          [other]: { deck },
        },
        steps: (ids) => [
          playFromHand(ids, side),
          // The source enters exhausted and becomes ready at Ending; the next own Day permits advancement.
          pass(side), pass(other), pass(side), pass(other), pass(side), pass(other),
          { side, action: { kind: "reposition", card: ids[side].hand[0], to: { rank: "front", index: 0 } } },
          pass(side), pass(other), pass(side),
        ],
        answers: (ids) => [true, [ids[side].hand[1]]],
      },
      check: ({ state, events, ids }) => {
        const source = ids[side].hand[0], discarded = ids[side].hand[1];
        const amount = amplified ? 3 : 2;
        const payment = events.findIndex((event) => event.kind === "discarded" && event.instance === discarded && event.side === side);
        const draw = events.findIndex((event, index) => index > payment && event.kind === "cardDrawn" && event.side === side);
        const gain = events.findIndex((event) => event.kind === "sparkGained" && event.instance === source);
        const lane = events.findIndex((event) => event.kind === "laneResolved" && event.challenger === source);
        expect(payment).toBeGreaterThanOrEqual(0);
        expect(draw).toBeGreaterThan(payment);
        expect(gain).toBeGreaterThan(draw);
        expect(lane).toBeGreaterThan(gain);
        expect(events[gain]).toMatchObject({ kind: "sparkGained", instance: source, amount, expiry: { at: "endOfTurn" }, additional: false });
        expect(events[lane]).toMatchObject({ kind: "laneResolved", challenger: source, challengerSpark: 2 + amount, scored: 2 + amount });
        expect(events.filter((event) => event.kind === "triggerQueued" && event.source === source && event.ability === 1)).toHaveLength(1);
        expect(events.filter((event) => event.kind === "sparkGained" && event.instance === source)).toHaveLength(1);
        expect(events.some((event, index) => index > lane && event.kind === "effectEnded")).toBe(true);
        expect(state.floating).toEqual([]);
        expect(state.instances[source]).toMatchObject({ zone: "play", variant: { amplified }, status: { gainedSpark: 0 } });
        expect(state.instances[discarded]?.zone).toBe("void");
        expect(state.sides[side].hand).toContain(ids[side].deck[1]);
        expect(state.sides[side].score).toBe(2 + amount);
      },
    };
  }),
);

export default { slug: "cards-64", scenarios } satisfies ScenarioModule;
