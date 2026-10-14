/** D20: current-turn plays compose with a drawn cohort and a chosen recipient. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { adjustedEnergy, costModifier } from "../../engine/continuous/costs";
import { createEngine } from "../../engine/engine";
import { opponent, type InstanceId, type Side } from "../../engine/state/ids";
import type { BattleState } from "../../engine/state/types";
import { ScriptedSource } from "../../engine/steps/sources";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseCardId } from "../../types/card-identity";
import horror from "../cards/blooming-horror-29d25251";
import echoes from "../cards/echoes-of-the-journey-874d5e8f";

const ECHOES = parseCardId(echoes.id), HORROR = parseCardId(horror.id);
const engine = createEngine(testCatalog([echoes, horror].map(engineCardFromContent)));
const filler = Array.from({ length: 20 }, () => v.event0.id);
const scenarios: NamedScenario[] = [];

function cost(state: BattleState, card: InstanceId, side: Side, base: number): number {
  return adjustedEnergy(base, costModifier(state, engine.catalog, card, side));
}

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  scenarios.push({
    name: `${echoes.id} ${side} discounts only its actual draw cohort and expires both unplayed and played members`,
    spec: {
      board: { active: side, phase: "day", scoreToWin: 100,
        [side]: { hand: [v.event0.id, v.event0.id, ECHOES, v.vanilla5.id],
          deck: [v.vanilla3.id, v.vanilla3.id, v.vanilla3.id, ...filler], energy: 5 }, [other]: { deck: filler } },
      steps: (ids) => [0, 1, 2].map((index) => playFromHand(ids, side, index)),
    },
    check: ({ state, ids, events }) => {
      const drawn = ids[side].deck.slice(0, 3), held = ids[side].hand[3];
      expect(events.flatMap((event) => event.kind === "cardDrawn" && event.side === side ? [event.instance] : [])).toEqual(drawn);
      expect(state.sides[side].hand).toEqual([held, ...drawn]);
      expect(state.sides[side].currentEnergy).toBe(0);
      expect(state.turnLog.played[side].map((play) => play.instance)).toEqual(ids[side].hand.slice(0, 3));
      expect(state.instances[held].status.ephemeral).toBe(false);
      expect(cost(state, held, side, 5)).toBe(5);
      for (const id of drawn) {
        expect(state.instances[id]).toMatchObject({ zone: "hand", status: { ephemeral: true } });
        expect(cost(state, id, side, 3)).toBe(0);
      }
      const grants = events.filter((event) => event.kind === "effectStarted");
      expect(grants.map((event) => event.change)).toEqual(drawn.map((instance) => ({ kind: "cardCost", instance, mode: "set", amount: 0 })));
      expect(grants.every((event) => event.source === ids[side].hand[2] && event.expiry.at === "endOfTurn")).toBe(true);
      expect(engine.legalActions(state, side)).toContainEqual({ kind: "play", card: drawn[0], from: "hand" });
      const played = engine.apply(state, side, { kind: "play", card: drawn[0], from: "hand" }, new ScriptedSource([]));
      expect(played.state.sides[side].currentEnergy).toBe(0);
      expect(played.state.instances[drawn[0]]).toMatchObject({ zone: "play", status: { ephemeral: false } });
      expect(cost(played.state, drawn[0], side, 3)).toBe(0);
      const ended = passUntil(engine, played.state, at(engine, other, "day"));
      expect(ended.state.instances[drawn[0]].zone).toBe("play");
      for (const id of drawn.slice(1)) expect(ended.state.instances[id]).toMatchObject({ zone: "banished", status: { ephemeral: false } });
      expect(ended.state.instances[held].zone).toBe("hand");
      for (const grant of grants) expect(ended.events).toContainEqual({ kind: "effectEnded", effect: grant.effect });
      for (const id of drawn) expect(cost(ended.state, id, side, 3)).toBe(3);
      expect(ended.state.floating).toEqual([]);
    },
  });

  for (const short of [false, true]) scenarios.push({
    name: `${echoes.id} ${side} ${short ? "keeps only a short deck's successful arrival" : "counts itself as the first play against an empty deck"}`,
    spec: {
      board: { active: side, phase: "day", scoreToWin: 100,
        [side]: { hand: [...(short ? [v.event0.id, v.event0.id] : []), ECHOES, v.vanilla5.id],
          deck: short ? [v.vanilla3.id] : [], energy: 5 }, [other]: { deck: filler } },
      steps: (ids) => Array.from({ length: short ? 3 : 1 }, (_, index) => playFromHand(ids, side, index)),
    },
    check: ({ state, ids, events }) => {
      const held = ids[side].hand[short ? 3 : 1];
      expect(events.filter((event) => event.kind === "cardDrawn").map((event) => event.instance)).toEqual(ids[side].deck);
      expect(state.turnLog.played[side]).toHaveLength(short ? 3 : 1);
      expect(state.sides[side].fatigueCount).toBe(short ? 2 : 1);
      expect(events.filter((event) => event.kind === "fatigue").map((event) => event.points)).toEqual(short ? [1, 2] : [1]);
      expect(state.sides[other].score).toBe(short ? 3 : 1);
      expect(state.sides[side].hand).toEqual([held, ...ids[side].deck]);
      expect(state.instances[held].status.ephemeral).toBe(false);
      expect(cost(state, held, side, 5)).toBe(5);
      const grants = events.filter((event) => event.kind === "effectStarted");
      expect(grants).toHaveLength(short ? 1 : 0);
      if (short) {
        const drawn = ids[side].deck[0];
        expect(state.instances[drawn]).toMatchObject({ zone: "hand", status: { ephemeral: true } });
        expect(cost(state, drawn, side, 3)).toBe(0);
        expect(grants[0].change).toEqual({ kind: "cardCost", instance: drawn, mode: "set", amount: 0 });
      }
    },
  });

  for (const chosen of [side, other]) scenarios.push({
    name: `${horror.id} ${side} counts its controller's three plays while choosing ${chosen}`,
    spec: {
      board: { active: side, phase: "day", scoreToWin: 100,
        [side]: { hand: [v.event0.id, v.event0.id, HORROR], deck: filler, energy: 2 }, [other]: { deck: filler } },
      steps: (ids) => [0, 1, 2].map((index) => playFromHand(ids, side, index)),
      answers: () => [chosen === side ? 0 : 1],
    },
    check: ({ state, ids, events, answers }) => {
      const eroded = ids[chosen].deck.slice(0, 6), unchosen = opponent(chosen);
      expect(events.filter((event) => event.kind === "eroded").map((event) => [event.side, event.instance])).toEqual(eroded.map((instance) => [chosen, instance]));
      expect(state.sides[chosen].deck).toEqual(ids[chosen].deck.slice(6));
      for (const id of eroded) expect(state.instances[id].zone).toBe("void");
      expect(state.sides[unchosen].deck).toEqual(ids[unchosen].deck);
      expect(state.turnLog.played[side]).toHaveLength(3);
      expect(state.turnLog.played[other]).toEqual([]);
      expect(events.filter((event) => event.kind === "fatigue")).toEqual([]);
      expect(answers.filter((answer) => answer.auto !== true).map((answer) => answer.value)).toEqual([chosen === side ? 0 : 1]);
    },
  });

  scenarios.push({
    name: `${horror.id} ${side} starts its next play count afresh after the intervening turns`,
    spec: {
      board: { active: side, phase: "day", scoreToWin: 100,
        [side]: { hand: [v.event0.id, HORROR, HORROR], deck: filler, energy: 4 }, [other]: { deck: filler } },
      steps: (ids) => [0, 1].map((index) => playFromHand(ids, side, index)),
      answers: () => [1],
    },
    check: ({ state, ids, events }) => {
      expect(events.filter((event) => event.kind === "eroded")).toHaveLength(4);
      expect(state.turnLog.played[side]).toHaveLength(2);
      const away = passUntil(engine, state, at(engine, other, "day"));
      const next = passUntil(engine, away.state, at(engine, side, "day"));
      expect(next.state.turnLog.played[side]).toEqual([]);
      const top = next.state.sides[other].deck.slice(0, 2);
      const played = engine.apply(next.state, side, { kind: "play", card: ids[side].hand[2], from: "hand" }, new ScriptedSource([1]));
      expect(played.events.filter((event) => event.kind === "eroded").map((event) => event.instance)).toEqual(top);
      expect(played.state.turnLog.played[side].map((play) => play.instance)).toEqual([ids[side].hand[2]]);
      expect(played.state.sides[other].deck).toEqual(next.state.sides[other].deck.slice(2));
    },
  });
}

export default { slug: "cards-78", scenarios } satisfies ScenarioModule;
