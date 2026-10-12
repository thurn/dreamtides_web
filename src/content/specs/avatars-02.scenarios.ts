/** D20: live void count, normal-cost character play, and one shared allowance each turn. */
import { expect } from "vitest";
import { createEngine } from "../../engine/engine";
import { NO_PROMPTS } from "../../engine/steps/sources";
import type { BattleState } from "../../engine/state/types";
import type { Side } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseAvatarId } from "../../types/identifiers";
import kell from "../avatars/kell-tarn-133e22dd";

const KELL = parseAvatarId(kell.id);
const abilities = kell.abilities;
if (abilities === undefined) throw new Error("Scenario subject has no authored abilities");
const engine = createEngine(testCatalog([], { avatars: [{ id: KELL, status: "authored", abilities }] }));
const deck = Array.from({ length: 12 }, () => v.vanilla0.id);
const voidPlays = (state: BattleState, side: Side) => engine.legalActions(state, side).filter(action => action.kind === "play" && action.from === "void");
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = side === "player" ? "enemy" : "player";
  scenarios.push({
    name: `${kell.id} ${side} pays normal costs for one physical character each actual turn`,
    spec: {
      board: {
        active: side, phase: "day", scoreToWin: 100,
        [side]: { avatar: KELL, energy: 2, void: [v.vanilla1.id, v.vanilla1.id, v.vanilla5.id, ...Array.from({ length: 5 }, () => v.event0.id)], deck },
        [other]: { void: [v.vanilla1.id], deck },
      },
      steps: ids => [{ side, action: { kind: "play", card: ids[side].void[0], from: "void" } }],
    },
    check: ({ start, state, events, ids }) => {
      const [first, second, expensive] = ids[side].void;
      const action = { kind: "play", card: second, from: "void" } as const;
      expect(voidPlays(start, side)).toEqual([first, second].map(card => ({ kind: "play", card, from: "void" })));
      expect(voidPlays(start, other)).toEqual([]);
      expect(voidPlays(start, side).some(play => play.kind === "play" && play.card === expensive)).toBe(false);
      expect(state.instances[first]).toMatchObject({ owner: side, zone: "play", status: { reclaimed: false, playedViaReclaim: false } });
      expect(state.instances[second]?.zone).toBe("void");
      expect(state.sides[side].void).toHaveLength(7);
      expect(state.sides[side]).toMatchObject({ currentEnergy: 1, maxEnergy: 2, avatar: { id: KELL, exhausted: false } });
      expect(events.filter(event => event.kind === "energyChanged" && event.cause === "payment")).toEqual([
        expect.objectContaining({ side, current: 1, max: 2, change: -1, maxChange: 0 }),
      ]);
      expect(voidPlays(state, side)).toEqual([]);
      expect(() => engine.apply(state, side, action, NO_PROMPTS)).toThrow();
      const oppositeTurn = passUntil(engine, state, at(engine, other, "day"));
      expect(voidPlays(oppositeTurn.state, side)).toEqual([]);
      const renewed = passUntil(engine, oppositeTurn.state, at(engine, side, "day"));
      expect(renewed.state.turn.turnNumber).toBeGreaterThan(state.turn.turnNumber);
      expect(voidPlays(renewed.state, side)).toContainEqual(action);
      const played = engine.apply(renewed.state, side, action, NO_PROMPTS);
      const settled = passUntil(engine, played.state, next => next.stack.length === 0).state;
      expect(settled.instances[first]?.zone).toBe("play");
      expect(settled.instances[second]).toMatchObject({ owner: side, zone: "play", status: { reclaimed: false, playedViaReclaim: false } });
      expect(settled.sides[side].void).toHaveLength(6);
      expect(settled.sides[side].currentEnergy).toBe(1);
      expect(voidPlays(settled, side)).toEqual([]);
    },
  });
  scenarios.push({
    name: `${kell.id} ${side} follows the live all-card threshold across a normal event play`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { avatar: KELL, energy: 1, hand: [v.event0.id], void: [v.vanilla1.id, ...Array.from({ length: 5 }, () => v.event0.id)], deck },
        [other]: { void: Array.from({ length: 8 }, () => v.vanilla1.id), deck },
      },
      steps: ids => [{ side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } }],
    },
    check: ({ start, state, ids }) => {
      const character = ids[side].void[0];
      const action = { kind: "play", card: character, from: "void" } as const;
      expect(start.sides[side].void).toHaveLength(6);
      expect(voidPlays(start, side)).toEqual([]);
      expect(() => engine.apply(start, side, action, NO_PROMPTS)).toThrow();
      expect(state.sides[side].void).toHaveLength(7);
      expect(state.instances[ids[side].hand[0]]?.zone).toBe("void");
      expect(voidPlays(state, side)).toEqual([action]);
      const played = engine.apply(state, side, action, NO_PROMPTS);
      const settled = passUntil(engine, played.state, next => next.stack.length === 0).state;
      expect(settled.instances[character]?.zone).toBe("play");
      expect(settled.sides[side].void).toHaveLength(6);
      expect(settled.sides[side].currentEnergy).toBe(0);
      expect(voidPlays(settled, side)).toEqual([]);
    },
  });
}

export default { slug: "avatars-02", scenarios } satisfies ScenarioModule;
