import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { event, scoredAmount, self } from "../../../dsl/builders";
import { triggered, whenOpponentScores, whenScores } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { cloneState } from "../../../state/clone";
import { effectiveSpark } from "../../../rules/spark";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { playFromHand } from "../../../testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { view } from "../../../view/view";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { losePoints } from "../lose-points";

const scorer: EngineCardDefinition = {
  ...v.vanilla3, id: syntheticId(1280), status: "authored", abilities: () => [
    triggered(whenScores(), gainSpark(self(), 10)),
    triggered(whenScores(), losePoints(scoredAmount(), "opponent")),
  ],
};
const observer: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1281), status: "authored",
  abilities: () => [triggered(whenOpponentScores(), gainPoints(scoredAmount()))],
};
const flat: EngineCardDefinition = {
  ...v.event0, id: syntheticId(1282), status: "authored", abilities: () => [event(gainPoints(2))],
};
const outside: EngineCardDefinition = {
  ...v.event0, id: syntheticId(1283), status: "authored", abilities: () => [event(losePoints(scoredAmount(), "opponent"))],
};
const zeroScorer: EngineCardDefinition = { ...scorer, id: syntheticId(1284), spark: 0 };
const engine = createEngine(testCatalog([scorer, observer, flat, outside, zeroScorer]));
const deck = Array.from({ length: 4 }, () => v.vanilla1.id);

function challenge(side: "player" | "enemy", blocked: boolean, score: number) {
  const defending = opponent(side);
  const { state, ids } = boardState(engine.catalog, {
    active: side, phase: "day",
    [side]: { front: [scorer.id], deck },
    [defending]: { front: blocked ? [v.vanilla2.id] : [], back: [observer.id], score, deck },
  });
  // The source belongs to the opposing player, while this side controls it.
  const source = ids[side].front[0]!;
  state.instances[source] = { ...state.instances[source], owner: defending };
  const result = passUntil(engine, state, at(engine, defending, "day"));
  return { ...result, ids, source };
}

describe("scoredAmount", () => {
  it("captures the actual blocked difference or unpaired award, for either controller, before earlier triggers change spark", () => {
    for (const side of SIDES) {
      for (const blocked of [true, false]) {
        const { state, events, source, ids } = challenge(side, blocked, 7);
        const amount = blocked ? 1 : 3;
        const defending = opponent(side);
        expect(effectiveSpark(state, engine.catalog, source)).toBe(13);
        expect(state.sides[side].score).toBe(amount);
        // The observer gains the same snapshot after the loss.
        expect(state.sides[defending].score).toBe(7);
        expect(events.filter((entry) => entry.kind === "pointsScored" && entry.cause === "effect")).toEqual([
          { kind: "pointsScored", side: defending, amount: -amount, cause: "effect" },
          { kind: "pointsScored", side: defending, amount, cause: "effect" },
        ]);
        expect(events.filter((entry) => entry.kind === "triggerQueued")).toEqual([
          expect.objectContaining({ source, controller: side, scored: amount }),
          expect.objectContaining({ source, controller: side, scored: amount }),
          expect.objectContaining({ source: ids[defending].back[0], controller: defending, scored: amount }),
        ]);
      }
    }
  });

  it("keeps a scoring snapshot through cloning, JSON reload, state hashing, public views, and trigger replay", () => {
    const result = challenge("player", true, 7);
    const queued = result.steps.find((step) => step.step.kind === "challengeLane" && step.state.triggerQueue.length > 0)!.state;
    const reloaded = deserializeState(serializeState(queued));
    expect(cloneState(queued)).toEqual(reloaded);
    expect(stateHash(reloaded)).toBe(stateHash(queued));
    const changed = cloneState(queued);
    changed.triggerQueue = changed.triggerQueue.map((trigger) => ({ ...trigger, scored: 2 }));
    expect(stateHash(changed)).not.toBe(stateHash(queued));
    for (const side of SIDES) expect(view(reloaded, side, engine.catalog).triggerQueue.map((trigger) => trigger.scored)).toEqual([1, 1, 1]);
    const drain = (start: BattleState) => {
      let state = start;
      const events = [];
      while (state.triggerQueue.length > 0) {
        const step = runStep(state, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog);
        if (step.kind !== "done") throw new Error("a scoring trigger suspended");
        state = step.state;
        events.push(...step.events);
      }
      return { state, events };
    };
    const original = drain(queued);
    const replay = drain(reloaded);
    expect(replay.events).toEqual(original.events);
    expect(stateHash(replay.state)).toBe(stateHash(original.state));
    expect(replay.events).toContainEqual({ kind: "pointsScored", side: "enemy", amount: -1, cause: "effect" });
  });

  it("floors a scoring loss at zero and does not report a zero loss", () => {
    const result = challenge("enemy", false, 0);
    expect(result.state.sides.enemy.score).toBe(3);
    expect(result.events.filter((event) => event.kind === "pointsScored" && event.amount < 0)).toEqual([]);
  });

  it("ignores flat point gain, fatigue, and zero-point lanes, and reads zero outside a scoring trigger", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { front: [zeroScorer.id], hand: [flat.id, outside.id] },
      enemy: { back: [observer.id], score: 5, deck },
    });
    const gain = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
    const unbound = engine.apply(gain.state, "player", playFromHand(ids, "player", 1).action, NO_PROMPTS);
    const next = passUntil(engine, unbound.state, at(engine, "enemy", "day"));
    expect(gain.state.sides.player.score).toBe(2);
    expect(unbound.state.sides.enemy.score).toBe(5);
    expect(next.events).toContainEqual(expect.objectContaining({ kind: "laneResolved", scored: 0 }));
    expect([...gain.events, ...unbound.events, ...next.events].some((entry) => entry.kind === "triggerQueued")).toBe(false);
    const fatigue = passUntil(engine, next.state, at(engine, "player", "day"));
    expect(fatigue.events).toContainEqual(expect.objectContaining({ kind: "pointsScored", cause: "fatigue" }));
    expect(fatigue.events.some((entry) => entry.kind === "triggerQueued")).toBe(false);
  });
});
