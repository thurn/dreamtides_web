/** D20: live conditional permissions, independent reveal/play clauses, and arrival capacity. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine, IllegalAction } from "../../engine/engine";
import type { Action } from "../../engine/rules/actions";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { BACK_RANK_SIZE, opponent, type InstanceId, type Side } from "../../engine/state/ids";
import type { BattleState } from "../../engine/state/types";
import { NO_PROMPTS, ScriptedSource } from "../../engine/steps/sources";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { passUntil } from "../../engine/testing/trigger-harness";
import { parseCardId } from "../../types/card-identity";
import gloom from "../cards/gloomantler-041fafeb";
import petal from "../cards/petal-seer-28c3ef90";
import prism from "../cards/prism-caller-1521c06c";
import { SYNTHETIC_ABANDONER } from "./abandonment-fixture";

const GLOOM = parseCardId(gloom.id), PETAL = parseCardId(petal.id), PRISM = parseCardId(prism.id);
const engine = createEngine(testCatalog([gloom, petal, prism].map(engineCardFromContent).concat(SYNTHETIC_ABANDONER)));
const filler = Array.from({ length: 8 }, () => v.event0.id);
const scenarios: NamedScenario[] = [];
const play = (card: InstanceId, from: "hand" | "void" | "deck"): Action => ({ kind: "play", card, from });
const available = (state: BattleState, side: Side, card: InstanceId, from: "void" | "deck") =>
  engine.legalActions(state, side).some(action => action.kind === "play" && action.card === card && action.from === from);
const resolve = (state: BattleState) => passUntil(engine, state, next => next.stack.length === 0 && next.triggerQueue.length === 0).state;
const apply = (state: BattleState, side: Side, action: Action) => resolve(engine.apply(state, side, action, NO_PROMPTS).state);
function reload(state: BattleState): BattleState {
  const loaded = deserializeState(serializeState(state));
  expect(stateHash(loaded)).toBe(stateHash(state));
  for (const viewer of ["player", "enemy"] as const) expect(engine.view(loaded, viewer)).toEqual(engine.view(state, viewer));
  for (const actor of ["player", "enemy"] as const) expect(engine.legalActions(loaded, actor)).toEqual(engine.legalActions(state, actor));
  return loaded;
}
function refused(state: BattleState, side: Side, action: Action): void {
  const before = serializeState(state);
  expect(() => engine.apply(state, side, action, NO_PROMPTS)).toThrow(IllegalAction);
  expect(serializeState(state)).toBe(before);
}

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  for (const amplified of [false, true]) {
    const handBound = amplified ? 2 : 1;
    scenarios.push({
      name: `${gloom.id} ${side} ${amplified ? "amplified" : "base"} live hand boundary shares a committed allowance across physical void cards`,
      spec: {
        board: { active: side, phase: "day",
          [side]: { hand: [{ cardId: GLOOM, amplified }, ...Array.from({ length: handBound + 1 }, () => v.event0.id)],
            void: [v.vanilla1.id, v.vanilla1.id, v.event0.id], deck: filler, energy: 10 },
          [other]: { void: [v.vanilla1.id], deck: filler },
        },
        steps: ids => [playFromHand(ids, side)],
      },
      check: ({ state: started, ids }) => {
        const [first, second, wrongType] = ids[side].void;
        expect(first).not.toBe(second);
        let state = resolve(started);
        expect(state.sides[side].hand).toHaveLength(handBound + 1);
        expect(available(state, side, first, "void")).toBe(false);
        refused(state, side, play(first, "void"));
        state = apply(reload(state), side, play(ids[side].hand[1], "hand"));
        expect(state.sides[side].hand).toHaveLength(handBound);
        expect(available(state, side, first, "void")).toBe(true);
        expect(available(state, side, wrongType, "void")).toBe(false);
        expect(available(state, side, ids[other].void[0], "void")).toBe(false);
        const energy = state.sides[side].currentEnergy;
        state = apply(reload(state), side, play(first, "void"));
        expect(state.instances[first]).toMatchObject({ zone: "play", controller: side, status: { exhausted: true, playedViaReclaim: false } });
        expect(state.sides[side].currentEnergy).toBe(energy - 1);
        expect(state.sides[side].void).toContain(second);
        expect(available(state, side, second, "void")).toBe(false);
        refused(state, side, play(second, "void"));
        state = reload(state);
        for (const card of [...state.sides[side].hand]) state = apply(state, side, play(card, "hand"));
        expect(available(state, side, second, "void")).toBe(false);
        const turn = state.turn.turnNumber;
        state = passUntil(engine, state, next => next.turn.turnNumber > turn && next.turn.active === side && next.turn.phase === "day").state;
        expect(state.sides[side].hand.length).toBeLessThanOrEqual(handBound);
        expect(available(reload(state), side, second, "void")).toBe(true);
        state = apply(state, side, play(second, "void"));
        expect(state.instances[second]).toMatchObject({ zone: "play", controller: side, status: { playedViaReclaim: false } });
      },
    });
    scenarios.push({
      name: `${gloom.id} ${side} ${amplified ? "amplified" : "base"} two physical sources hold independent allowances`,
      spec: {
        board: { active: side, phase: "day",
          [side]: { hand: [{ cardId: GLOOM, amplified }, { cardId: GLOOM, amplified }], void: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id], energy: 12, deck: filler },
          [other]: { deck: filler },
        },
        steps: ids => [playFromHand(ids, side), playFromHand(ids, side, 1)],
      },
      check: ({ state: started, ids }) => {
        expect(ids[side].hand[0]).not.toBe(ids[side].hand[1]);
        const [first, second, third] = ids[side].void;
        let state = apply(resolve(started), side, play(first, "void"));
        expect(available(reload(state), side, second, "void")).toBe(true);
        state = apply(state, side, play(second, "void"));
        expect(available(reload(state), side, third, "void")).toBe(false);
        expect(state.instances[first].zone).toBe("play");
        expect(state.instances[second].zone).toBe("play");
      },
    });

    for (const above of [false, true]) scenarios.push({
      name: `${petal.id} ${side} ${amplified ? "amplified" : "base"} ${above ? "conditional reveal keeps independent learned-top play" : "unknown top below threshold cannot be announced"}`,
      spec: {
        board: { active: side, phase: "day",
          [side]: { hand: [{ cardId: PETAL, amplified }], back: above ? [SYNTHETIC_ABANDONER.id, ...(!amplified ? [v.vanilla0.id] : [])] : [],
            deck: [v.vanilla1.id, v.vanilla1.id, v.event0.id], energy: 10 },
          [other]: { deck: [v.vanilla1.id, v.event0.id] },
        },
        steps: ids => [playFromHand(ids, side)],
      },
      check: ({ state: started, ids }) => {
        let state = resolve(started);
        const [top, deeper] = ids[side].deck;
        expect(top).not.toBe(deeper);
        expect(available(state, side, deeper, "deck")).toBe(false);
        expect(available(state, side, ids[other].deck[0], "deck")).toBe(false);
        if (!above) {
          for (const viewer of [side, other]) expect(engine.view(state, viewer).sides[side].deck.known).toEqual([]);
          expect(available(reload(state), side, top, "deck")).toBe(false);
          refused(state, side, play(top, "deck"));
          return;
        }
        for (const viewer of [side, other]) expect(engine.view(state, viewer).sides[side].deck.known.map(card => card.id)).toEqual([top]);
        const abandoner = ids[side].back[0];
        const removed = amplified ? abandoner : ids[side].back[1];
        if (abandoner == null || removed == null) throw new Error("declared synthetic abandonment supports are absent");
        state = resolve(engine.apply(state, side, { kind: "activate", source: abandoner, ability: 0 }, new ScriptedSource([[removed]])).state);
        if (!amplified) state = resolve(engine.apply(state, side, { kind: "activate", source: abandoner, ability: 0 }, new ScriptedSource([[abandoner]])).state);
        expect(state.instances[abandoner].zone).toBe("void");
        expect(available(reload(state), side, top, "deck")).toBe(true);
        const energy = state.sides[side].currentEnergy;
        const announced = engine.apply(state, side, play(top, "deck"), NO_PROMPTS);
        const direct = resolve(announced.state);
        const loaded = resolve(deserializeState(serializeState(announced.state)));
        expect(stateHash(loaded)).toBe(stateHash(direct));
        state = direct;
        expect(state.instances[top]).toMatchObject({ zone: "play", controller: side, status: { exhausted: true, playedViaReclaim: false } });
        expect(state.sides[side].currentEnergy).toBe(energy - 1);
        expect(state.sides[side].deck).toEqual([deeper, ids[side].deck[2]]);
        refused(state, side, play(top, "deck"));
        expect(available(reload(state), side, deeper, "deck")).toBe(amplified);
        for (const viewer of [side, other]) expect(engine.view(state, viewer).sides[side].deck.known.map(card => card.id)).toEqual(amplified ? [deeper] : []);
      },
    });
  }
  for (const branch of ["small", "costly", "event", "empty", "full"] as const) {
    const top = branch === "costly" ? v.vanilla3.id : branch === "event" ? v.event0.id : v.vanilla2.id;
    scenarios.push({
      name: `${prism.id} ${side} ${branch} current top follows its resolving branch without deeper-card substitution`,
      spec: {
        board: { active: side, phase: "day",
          [side]: { hand: [PRISM], back: branch === "full" ? Array.from({ length: BACK_RANK_SIZE - 1 }, () => v.vanilla0.id) : [],
            deck: branch === "empty" ? [] : [top, v.vanilla2.id], energy: 10 },
          [other]: { deck: filler },
        },
        steps: ids => [playFromHand(ids, side)],
      },
      check: ({ state: started, ids, events }) => {
        const state = reload(resolve(started));
        const source = ids[side].hand[0], first = ids[side].deck[0], deeper = ids[side].deck[1];
        expect(state.instances[source]).toMatchObject({ zone: "play", controller: side, status: { exhausted: true } });
        expect(events.some(event => event.kind === "triggerQueued" && event.source === source)).toBe(true);
        expect(events.some(event => event.kind === "triggerResolved" && event.source === source && event.applied)).toBe(true);
        const draws = events.filter(event => event.kind === "cardDrawn");
        const materialized = events.filter(event => event.kind === "materialized" && event.instance !== source);
        if (branch === "small") {
          expect(first).not.toBe(deeper);
          expect(state.instances[first]).toMatchObject({ zone: "play", controller: side, status: { exhausted: true } });
          expect(materialized).toMatchObject([{ kind: "materialized", instance: first, side }]);
          expect(draws).toEqual([]);
          expect(state.sides[side].deck).toEqual([deeper]);
        } else if (branch === "costly" || branch === "event") {
          expect(draws).toEqual([{ kind: "cardDrawn", side, instance: first }]);
          expect(state.sides[side].hand).toEqual([first]);
          expect(materialized).toEqual([]);
          expect(state.sides[side].deck).toEqual([deeper]);
        } else {
          expect(draws).toEqual([]);
          expect(materialized).toEqual([]);
          expect(events.filter(event => event.kind === "fatigue")).toEqual([]);
          expect(state.sides[side].deck).toEqual(ids[side].deck);
        }
        for (const viewer of [side, other]) expect(engine.view(state, viewer).sides[side].deck.known).toEqual([]);
      },
    });
  }
}

export default { slug: "cards-38", scenarios } satisfies ScenarioModule;
