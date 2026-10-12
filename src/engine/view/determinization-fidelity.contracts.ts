/** Floating-effect fidelity compares observable data, including ordered captured cohorts and source look-back. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import { battleSeed, SIDES, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState } from "../testing/board";
import { CAPTURE, CAPTURE_CARDS, CAPTURE_FIGMENT } from "../testing/captured-figment-cards";
import { determinizationDivergences } from "../testing/determinization-fidelity";
import { invariantViolations } from "../testing/invariants";
import { testCatalog } from "../testing/synthetic-cards";
import { passUntil } from "../testing/trigger-harness";
import type { Decklists } from "./determinize";

const engine = createEngine(testCatalog(CAPTURE_CARDS, {}, [CAPTURE_FIGMENT]));
const seed = battleSeed("floating-effect-record-fidelity");

function delayedCohort(side: Side): { state: BattleState; decklists: Decklists } {
  const { state, ids } = boardState(engine.catalog, {
    active: side, phase: "day", [side]: { back: [CAPTURE.caller.id], hand: [CAPTURE.kill.id] },
  });
  const source = ids[side].back[0]!;
  const activatedState = engine.apply(state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
  const raised = passUntil(engine, activatedState, (next) => next.stack.length === 0 && next.triggerQueue.length === 0).state;
  const departing = engine.apply(raised, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, new ScriptedSource([[source]])).state;
  const resolved = passUntil(engine, departing, (next) => next.stack.length === 0 && next.triggerQueue.length === 0).state;
  expect(resolved.instances[source].zone).toBe("void");
  expect(invariantViolations(resolved, engine.catalog)).toEqual([]);
  const delayed = resolved.floating.find((effect) => effect.change.kind === "trigger");
  if (delayed?.change.kind !== "trigger") throw new Error("missing delayed cohort");
  expect(delayed.source).toBe(source);
  expect(delayed.controller).toBe(side);
  expect(delayed.change.lastKnownSourceSpark).toBe(1);
  expect(delayed.change.captured).toHaveLength(2);
  expect(delayed.change.captured?.map((id) => resolved.instances[id].zone)).toEqual(["play", "play"]);
  const entries = [{ cardId: CAPTURE.caller.id }, { cardId: CAPTURE.kill.id }];
  return { state: resolved, decklists: { player: side === "player" ? entries : [], enemy: side === "enemy" ? entries : [] } };
}

describe("floating-effect record fidelity", () => {
  it.each(SIDES)("preserves a captured cohort and source look-back after the %s source departs", (side) => {
    const { state, decklists } = delayedCohort(side);
    expect(determinizationDivergences(engine, state, decklists, seed, 0)).toEqual([]);
  });

  it.each(["captured order", "source look-back"] as const)("detects changed %s for both viewers", (corruption) => {
    const { state, decklists } = delayedCohort("player");
    const corrupted = {
      ...engine,
      determinize: (...args: Parameters<typeof engine.determinize>) => {
        const sampled = engine.determinize(...args);
        sampled.floating = sampled.floating.map((effect) => {
          if (effect.change.kind !== "trigger") return effect;
          const change = effect.change;
          return { ...effect, change: corruption === "captured order"
            ? { ...change, captured: [...(change.captured ?? [])].reverse() }
            : { ...change, lastKnownSourceSpark: (change.lastKnownSourceSpark ?? 0) + 1 } };
        });
        return sampled;
      },
    };
    const problems = determinizationDivergences(corrupted, state, decklists, seed, 0);
    for (const viewer of SIDES) {
      expect(problems.some((problem) => problem.startsWith(`${viewer}'s determinization: floating effect`))).toBe(true);
    }
  });
});
