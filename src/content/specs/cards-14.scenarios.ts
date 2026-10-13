/** D20: a source's turn allowance and the conditional discard's pre-discard branch. */
import { expect } from "vitest";
import { playFromHand } from "../../engine/testing/scenario";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import firebrand from "../cards/firebrand-saboteur-382dafa1";
import observer from "../cards/silent-observer-b1bea643";

const FIREBRAND = parseCardId(firebrand.id), OBSERVER = parseCardId(observer.id);
const deck = Array.from({ length: 12 }, () => SYNTHETIC.vanilla0.id);
const scenarios: NamedScenario[] = (["player", "enemy"] as const).flatMap((side): NamedScenario[] => {
  const other = side === "player" ? "enemy" : "player";
  return [
    {
      name: `${observer.id} ${side} ignores own events and opposing characters, triggers once for opposing events and renews next turn`,
      spec: {
        board: { active: other, phase: "day", [side]: { back: [OBSERVER], hand: [SYNTHETIC.event0.id], deck }, [other]: { hand: [SYNTHETIC.vanilla0.id, SYNTHETIC.event0.id, SYNTHETIC.event0.id, SYNTHETIC.event0.id], deck } },
        steps: (ids) => [
          playFromHand(ids, other), playFromHand(ids, other, 1), playFromHand(ids, other, 2),
          { side: other, action: { kind: "pass" } }, { side, action: { kind: "pass" } }, { side: other, action: { kind: "pass" } },
          playFromHand(ids, side),
          { side, action: { kind: "pass" } }, { side: other, action: { kind: "pass" } }, { side, action: { kind: "pass" } },
          playFromHand(ids, other, 3),
        ],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].back[0];
        const triggers = events.filter((event) => event.kind === "triggerQueued" && event.source === source && event.controller === side);
        expect(triggers).toHaveLength(2);
        expect(triggers.map((event) => event.kind === "triggerQueued" ? event.subject : null)).toEqual([ids[other].hand[1], ids[other].hand[3]]);
        expect(events.filter((event) => event.kind === "triggerResolved" && event.source === source && event.controller === side)).toHaveLength(2);
        const draws = events.filter((event) => event.kind === "cardDrawn" && event.side === side);
        expect(draws.map((event) => event.kind === "cardDrawn" ? event.instance : null)).toEqual(ids[side].deck.slice(0, 3));
        expect(state.sides[side].hand).toEqual(ids[side].deck.slice(0, 3));
        expect(state.instances[source!]?.zone).toBe("play");
        expect(events.filter((event) => event.kind === "cardPlayed" && event.side === other)).toHaveLength(4);
        expect(events.filter((event) => event.kind === "turnStarted" && event.side === other)).toHaveLength(1);
      },
    },
    ...[false, true].flatMap((amplified): NamedScenario[] => [0, 1, 2].map((handCount): NamedScenario => ({
      name: `${firebrand.id} ${side} ${amplified ? "amplified" : "base"} opponent hand ${String(handCount)} selects the branch before any discard`,
      spec: {
        board: { active: side, phase: "day", [side]: { hand: [{ cardId: FIREBRAND, amplified }], energy: 2, deck }, [other]: { hand: Array.from({ length: handCount }, () => SYNTHETIC.vanilla0.id), deck } },
        steps: (ids) => [playFromHand(ids, side)],
        answers: (ids) => handCount === 2 ? [[ids[other].hand[1]]] : [],
      },
      check: ({ state, ids, events, answers }) => {
        const source = ids[side].hand[0], drawCount = handCount === 0 ? amplified ? 2 : 1 : 0;
        const discarded = handCount > 0 ? ids[other].hand[handCount === 2 ? 1 : 0] : null;
        expect(events.filter((event) => event.kind === "triggerQueued" && event.source === source && event.controller === side)).toHaveLength(1);
        expect(events.filter((event) => event.kind === "cardDrawn" && event.side === side).map((event) => event.kind === "cardDrawn" ? event.instance : null)).toEqual(ids[side].deck.slice(0, drawCount));
        expect(events.filter((event) => event.kind === "discarded").map((event) => event.kind === "discarded" ? { side: event.side, instance: event.instance } : null)).toEqual(discarded === null ? [] : [{ side: other, instance: discarded }]);
        expect(state.sides[side].hand).toEqual(ids[side].deck.slice(0, drawCount));
        expect(state.sides[other].hand).toEqual(ids[other].hand.filter((id) => id !== discarded));
        expect(state.sides[other].void).toEqual(discarded === null ? [] : [discarded]);
        expect(state.instances[source]?.zone).toBe("play");
        expect(state.instances[source]?.variant.amplified).toBe(amplified);
        if (handCount === 2) expect(answers.map((answer) => answer.value)).toEqual([[ids[other].hand[1]]]);
      },
    }))),
  ];
});

export default { slug: "cards-14", scenarios } satisfies ScenarioModule;
