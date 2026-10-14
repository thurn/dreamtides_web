/** D20: Normal character plays fund the same source's counter-and-abandon activation. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine, IllegalAction } from "../../engine/engine";
import type { EngineEvent } from "../../engine/events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../engine/fold/slice";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { SIDES, opponent } from "../../engine/state/ids";
import { NO_PROMPTS, ScriptedSource } from "../../engine/steps/sources";
import { invariantViolations } from "../../engine/testing/invariants";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import subject from "../cards/twilight-suppressor-60feb0d0";

const cardId = parseCardId(subject.id);
const engine = createEngine(testCatalog([engineCardFromContent(subject)]));
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected applied intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
function before(events: readonly EngineEvent[], first: EngineEvent["kind"], second: EngineEvent["kind"]): void {
  const a = events.findIndex((event) => event.kind === first);
  const b = events.findIndex((event) => event.kind === second);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThanOrEqual(0);
  expect(a).toBeLessThan(b);
}

const scenarios: NamedScenario[] = SIDES.flatMap((side): NamedScenario[] => {
  const other = opponent(side);
  return [{
    name: `${subject.id} ${side} earns, cancels, reloads, spends and self-abandons its counters`,
    spec: {
      board: { active: side, phase: "day", [side]: { hand: [cardId, v.event0.id, v.vanilla1.id, v.vanilla2.id], energy: 12 }, [other]: { back: [v.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, side)],
    },
    check: ({ state, ids }) => {
      const [source, event, paid, next] = ids[side].hand;
      const foreign = ids[other].back[0]!;
      const action = { kind: "activate" as const, source, ability: 1 };
      expect(state.instances[source].status.counters).toBe(0);
      const initial = serializeState(state);
      expect(() => engine.apply(state, side, action, NO_PROMPTS)).toThrow(IllegalAction);
      expect(serializeState(state)).toBe(initial);
      let result = engine.apply(state, side, { kind: "play", card: event, from: "hand" }, NO_PROMPTS);
      expect(result.state.instances[source].status.counters).toBe(0);
      result = engine.apply(result.state, side, { kind: "play", card: paid, from: "hand" }, NO_PROMPTS);
      expect(result.state.instances[source].status.counters).toBe(1);
      expect(result.events.filter((e) => e.kind === "countersChanged" && e.instance === source)).toHaveLength(1);
      const committed = deserializeState(serializeState(result.state));
      expect(stateHash(committed)).toBe(stateHash(result.state));
      const fold = createFoldAdapter(engine);
      const slice: BattleSlice = { committed, inFlight: null, publishedEvents: 0, attempt: 0 };
      const waiting = applied(fold.reduce(slice, { kind: "battleAction", side, action }));
      const pending = fold.pending(waiting)!;
      expect(pending.prompt).toMatchObject({ kind: "chooseCards", side, purpose: { role: "abandonCost" } });
      if (pending.prompt.kind !== "chooseCards") throw new Error("Expected a character payment choice");
      expect(new Set(pending.prompt.candidates)).toEqual(new Set([source, paid]));
      expect(waiting.committed).toEqual(committed);
      const restored = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
      const fresh = createFoldAdapter(createEngine(engine.catalog));
      expect(fresh.pending(restored)).toEqual(pending);
      expect(fresh.reduce(restored, { kind: "answer", side, promptId: pending.prompt.id, value: [foreign] }).kind).toBe("bounced");
      expect(fresh.reduce(restored, { kind: "answer", side: other, promptId: pending.prompt.id, value: [paid] }).kind).toBe("bounced");
      expect(restored.committed).toEqual(committed);
      const cancelled = applied(fresh.reduce(restored, { kind: "cancel", side, promptId: pending.prompt.id }));
      expect(cancelled.committed).toEqual(committed);
      const finished = applied(fresh.reduce(restored, { kind: "answer", side, promptId: pending.prompt.id, value: [paid] }));
      expect(finished.committed.instances[source].status.counters).toBe(0);
      expect(finished.committed.instances[paid].zone).toBe("void");
      expect(finished.committed.instances[foreign].zone).toBe("play");
      expect(finished.committed.sides[side].score).toBe(1);
      expect(finished.committed.sides[other].score).toBe(0);
      const answers = new ScriptedSource([[paid]]);
      const inline = engine.apply(committed, side, action, answers);
      answers.assertExhausted();
      expect(stateHash(finished.committed)).toBe(stateHash(inline.state));
      before(inline.events, "countersChanged", "abandoned");
      before(inline.events, "abandoned", "pointsScored");
      expect(() => engine.apply(finished.committed, side, action, NO_PROMPTS)).toThrow(IllegalAction);
      result = engine.apply(deserializeState(serializeState(finished.committed)), side, { kind: "play", card: next, from: "hand" }, NO_PROMPTS);
      expect(result.state.instances[source].status.counters).toBe(1);
      const selfAnswers = new ScriptedSource([[source]]);
      const self = engine.apply(result.state, side, action, selfAnswers);
      selfAnswers.assertExhausted();
      expect(self.state.instances[source]).toMatchObject({ zone: "void", status: { counters: 0 } });
      expect(self.state.instances[next].zone).toBe("play");
      expect(self.state.sides[side].score).toBe(2);
      expect(self.state.sides[other].score).toBe(0);
      before(self.events, "countersChanged", "abandoned");
      before(self.events, "abandoned", "pointsScored");
      expect(() => engine.apply(self.state, side, action, NO_PROMPTS)).toThrow(IllegalAction);
      expect(invariantViolations(self.state, engine.catalog)).toEqual([]);
    },
  }, {
    name: `${subject.id} ${side} gains points after its created source self-abandons and ceases`,
    spec: {
      board: { active: side, phase: "day", [side]: { figments: [{ slot: { rank: "back", index: 0 }, printing: { kind: "figmentCopy", cardId, spark: 1 } }], hand: [v.vanilla0.id] } },
      steps: (ids) => [playFromHand(ids, side), { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 1 } }],
      answers: (ids) => [[ids[side].back[0]!]],
    },
    check: ({ state, ids, events }) => {
      const source = ids[side].back[0]!;
      expect(events.filter((e) => e.kind === "countersChanged" && e.instance === source)).toHaveLength(2);
      before(events, "abandoned", "ceasedToExist");
      before(events, "ceasedToExist", "pointsScored");
      expect(state.instances[source]).toBeUndefined();
      expect(state.instances[ids[side].hand[0]].zone).toBe("play");
      expect(state.sides[side].score).toBe(1);
      expect(state.sides[other].score).toBe(0);
      expect(engine.legalActions(state, side).some((a) => a.kind === "activate" && a.source === source)).toBe(false);
      expect(invariantViolations(state, engine.catalog)).toEqual([]);
    },
  }, {
    name: `${subject.id} ${side} ignores the opponent's character play`,
    spec: {
      board: { active: other, phase: "day", [side]: { back: [cardId] }, [other]: { hand: [v.vanilla1.id], energy: 1 } },
      steps: (ids) => [playFromHand(ids, other)],
    },
    check: ({ state, ids, events }) => {
      expect(state.instances[ids[side].back[0]!].status.counters).toBe(0);
      expect(events.filter((e) => e.kind === "countersChanged")).toHaveLength(0);
      expect(state.sides[side].score).toBe(0);
      expect(state.sides[other].score).toBe(0);
    },
  }];
});

export default { slug: "cards-ready-183", scenarios } satisfies ScenarioModule;
