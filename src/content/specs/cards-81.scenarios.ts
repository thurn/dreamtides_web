/** Current-turn counts and a self-discarded event's functional void (D20). */
import { expect } from "vitest";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import call from "../cards/ethereal-call-2d0a7c62";
import encounter from "../cards/first-encounter-70306382";
import illumination from "../cards/illumination-of-glory-d217303e";
import soloist from "../cards/storm-soloist-2305722e";
import ethereal from "../figments/ethereal-3eddb1b8";

const scenarios: NamedScenario[] = [];
for (const side of ["player", "enemy"] as const) {
  for (const amplified of [false, true]) {
    scenarios.push({
      name: `${call.id} ${side} ${amplified ? "amplified" : "base"} counts its own play and earlier character and event plays`,
      spec: {
        board: {
          active: side, phase: "day", scoreToWin: 100,
          [side]: { hand: [SYNTHETIC.vanilla0.id, SYNTHETIC.event0.id, { cardId: parseCardId(call.id), amplified }], energy: 2 },
        },
        steps: ids => [playFromHand(ids, side, 0), playFromHand(ids, side, 1), playFromHand(ids, side, 2)],
      },
      check: ({ state, ids, events }) => {
        const figments = Object.values(state.instances).filter(instance => instance.printing.kind === "figment");
        expect(figments).toHaveLength(3);
        expect(figments.map(instance => instance.printing)).toEqual(Array.from({ length: 3 }, () => ({ kind: "figment", figment: ethereal.id, spark: amplified ? 2 : 1 })));
        expect(figments.every(instance => instance.zone === "play" && instance.controller === side && instance.status.exhausted)).toBe(true);
        expect(events.filter(event => event.kind === "cardPlayed").map(event => event.instance)).toEqual(ids[side].hand);
        expect(events.filter(event => event.kind === "materialized").map(event => event.instance)).toEqual([ids[side].hand[0], ...figments.map(instance => instance.id)]);
        expect(state.instances[ids[side].hand[2]].zone).toBe("void");
      },
    });
  }
  scenarios.push({
    name: `${illumination.id} ${side} gains points for its own play and earlier character and event plays`,
    spec: {
      board: { active: side, phase: "day", scoreToWin: 100, [side]: { hand: [SYNTHETIC.vanilla0.id, SYNTHETIC.event0.id, parseCardId(illumination.id)], energy: 4 } },
      steps: ids => [playFromHand(ids, side, 0), playFromHand(ids, side, 1), playFromHand(ids, side, 2)],
    },
    check: ({ state, ids, events }) => {
      expect(state.sides[side].score).toBe(6);
      expect(events.filter(event => event.kind === "pointsScored").map(event => event.amount)).toEqual([6]);
      expect(state.instances[ids[side].hand[2]].zone).toBe("void");
    },
  });
  for (const playedSource of [false, true]) {
    scenarios.push({
      name: `${soloist.id} ${side} excludes each triggering play${playedSource ? " and counts its own earlier play" : " starting with zero other plays"}`,
      spec: {
        board: {
          active: side, phase: "day", scoreToWin: 100,
          [side]: {
            back: playedSource ? [] : [parseCardId(soloist.id)],
            hand: [...(playedSource ? [parseCardId(soloist.id)] : []), SYNTHETIC.event0.id, SYNTHETIC.event1.id],
            energy: playedSource ? 4 : 1,
          },
        },
        steps: ids => ids[side].hand.map((_, index) => playFromHand(ids, side, index)),
      },
      check: ({ state, ids, events }) => {
        const source = playedSource ? ids[side].hand[0] : ids[side].back[0];
        expect(state.sides[side].score).toBe(playedSource ? 3 : 1);
        expect(events.filter(event => event.kind === "triggerResolved").map(event => event.source)).toEqual([source, source]);
        expect(events.filter(event => event.kind === "pointsScored").map(event => event.amount)).toEqual(playedSource ? [1, 2] : [1]);
      },
    });
  }
  scenarios.push({
    name: `${encounter.id} ${side} self-discard grants zero-cost Reclaim and materializes only this turn's discarded physical characters`,
    spec: {
      board: {
        active: side, phase: "day", scoreToWin: 100,
        [side]: {
          back: [SYNTHETIC.discardOne.id],
          hand: [SYNTHETIC.vanilla0.id, SYNTHETIC.vanilla0.id, SYNTHETIC.event0.id, parseCardId(encounter.id)],
          void: [SYNTHETIC.vanilla1.id], energy: 0,
        },
      },
      steps: ids => [
        ...ids[side].hand.map(() => ({ side, action: { kind: "activate" as const, source: ids[side].back[0]!, ability: 0 } })),
        { side, action: { kind: "play", card: ids[side].hand[3], from: "void" } },
      ],
      answers: ids => ids[side].hand.slice(0, 3).map(id => [id]),
    },
    check: ({ state, ids, events }) => {
      const [first, second, discardedEvent, source] = ids[side].hand;
      expect(events.filter(event => event.kind === "discarded").map(event => event.instance)).toEqual(ids[side].hand);
      expect(events.filter(event => event.kind === "materialized").map(event => event.instance)).toEqual([second, first]);
      expect(state.sides[side].backRank.slice(0, 3)).toEqual([ids[side].back[0], second, first]);
      expect([first, second].every(id => state.instances[id].zone === "play" && state.instances[id].status.exhausted)).toBe(true);
      expect(state.instances[discardedEvent].zone).toBe("void");
      expect(state.instances[ids[side].void[0]].zone).toBe("void");
      expect(state.instances[source].zone).toBe("banished");
      expect(state.sides[side].currentEnergy).toBe(0);
      expect(events.filter(event => event.kind === "triggerResolved").map(event => event.source)).toEqual([source]);
      expect(events.filter(event => event.kind === "cardPlayed").map(event => event.instance)).toEqual([source]);
    },
  });
}

export default { slug: "cards-81", scenarios } satisfies ScenarioModule;
