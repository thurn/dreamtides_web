/** D20: the hand materialization and both physical void returns settle as one cascade. */
import { expect } from "vitest";
import { playFromHand, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import aether from "../cards/aether-diver-87f075b1";
import deathsworn from "../cards/the-deathsworn-1ce0f0f2";
import veil from "../cards/veil-of-the-wastes-409147ec";

const AETHER = parseCardId(aether.id), DEATHSWORN = parseCardId(deathsworn.id), VEIL = parseCardId(veil.id);
const deck = [v.vanilla3.id, v.vanilla3.id];
export default {
  slug: "cards-36",
  scenarios: (["player", "enemy"] as const).flatMap(side => ([false, true] as const).map(amplified => {
    const other = side === "player" ? "enemy" : "player";
    return {
      name: `${AETHER} ${side} ${amplified ? "amplified" : "base"} chosen hand arrival and coupled void returns`,
      spec: {
        board: { active: side, phase: "day" as const, [side]: { hand: [{ cardId: AETHER, amplified }, v.vanilla2.id, v.vanilla2.id], void: [DEATHSWORN, VEIL], energy: 1, deck }, [other]: { void: [DEATHSWORN, VEIL], deck } },
        steps: ids => [playFromHand(ids, side)],
        answers: ids => [true, [ids[side].hand[2]]],
      },
      check: ({ start, state, events, answers, ids }) => {
        const source = ids[side].hand[0], chosen = ids[side].hand[2];
        for (const id of [source, chosen, ...ids[side].void]) {
          expect(state.instances[id]).toMatchObject({ owner: side, controller: side, zone: "play", status: { exhausted: true } });
          expect(events.filter(event => event.kind === "materialized" && event.instance === id)).toHaveLength(1);
        }
        expect(state.instances[ids[side].hand[1]].zone).toBe("hand");
        for (const id of ids[other].void) expect(state.instances[id].zone).toBe("void");
        expect(events.filter(event => event.kind === "cardPlayed").map(event => event.instance)).toEqual([source]);
        expect(state.sides[side].currentEnergy).toBe(start.sides[side].currentEnergy - 1);
        expect(answers.map(answer => answer.value)).toEqual([true, [chosen]]);
        expect(events.filter(event => event.kind === "triggerQueued" && event.source === source)).toHaveLength(1);
        for (const id of ids[side].void) expect(events.some(event => event.kind === "triggerResolved" && event.source === id)).toBe(true);
        expect(state.stack).toEqual([]);
        expect(state.triggerQueue).toEqual([]);
        expect(state.result).toBeNull();
      },
    };
  })),
} satisfies ScenarioModule;
