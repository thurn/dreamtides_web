/** Floating-effect fidelity compares observable data, including ordered captured cohorts and source look-back. */
import { describe, expect, it } from "vitest";
import { abandonCost, activated, characterYouControl, event, target } from "../dsl/builders";
import { gainSpark, grant } from "../effects/primitives";
import { createEngine, IllegalAction } from "../engine";
import { eventSeenBy, type EngineEvent } from "../events";
import { hasKeyword } from "../rules/keywords";
import { battleSeed, SIDES, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState } from "../testing/board";
import { CAPTURE, CAPTURE_CARDS, CAPTURE_FIGMENT } from "../testing/captured-figment-cards";
import { determinizationDivergences } from "../testing/determinization-fidelity";
import { invariantViolations } from "../testing/invariants";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { at, passUntil } from "../testing/trigger-harness";
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

const protectedActivator = {
  ...SYNTHETIC.vanilla1, id: syntheticId(0x56501),
  abilities: () => [activated([abandonCost({ another: true })], gainSpark(target(characterYouControl()), 1))],
};
const protection = {
  ...SYNTHETIC.event0, id: syntheticId(0x56502),
  abilities: () => [event(grant(target(characterYouControl()), "cannotBeTargeted", "untilEndOfTurn"))],
};
const protectionEngine = createEngine(testCatalog([protectedActivator, protection]));
const protectionCases = SIDES.flatMap((controller) => (["ceased", "hidden"] as const).map((source) => ({ controller, source })));

describe("finite targeting protection fidelity", () => {
  it.each(protectionCases)("preserves $controller legality with a $source independent source through expiry", ({ controller, source }) => {
    const deck = Array.from({ length: 4 }, () => SYNTHETIC.vanilla0.id);
    const setup = { back: [protectedActivator.id, SYNTHETIC.vanilla1.id], deck,
      ...(source === "ceased" ? { hand: [protection.id] } : {}) };
    const initial = boardState(protectionEngine.catalog, {
      active: controller, phase: "day", player: { deck }, enemy: { deck }, [controller]: setup,
    });
    const protectedCard = initial.ids[controller].back[0]!;
    let state = initial.state;
    let started: EngineEvent;
    if (source === "ceased") {
      const card = initial.ids[controller].hand[0];
      state.instances[card].status.created = true;
      const played = protectionEngine.apply(state, controller, { kind: "play", card, from: "hand" }, new ScriptedSource([[protectedCard]]));
      const resolved = passUntil(protectionEngine, played.state, (next) => next.stack.length === 0);
      state = resolved.state;
      expect(state.instances[card]).toBeUndefined();
      const effect = [...played.events, ...resolved.events].find((entry) => entry.kind === "effectStarted");
      if (effect === undefined) throw new Error("missing protection event");
      started = effect;
    } else {
      const effect = { id: `e${state.nextEffect}` as const, timestamp: state.clock, controller,
        source: initial.ids[controller].deck[0], expiry: { at: "endOfTurn" } as const,
        change: { kind: "keyword", instance: protectedCard, keyword: "cannotBeTargeted", gains: true } as const };
      state.floating.push(effect);
      state.nextEffect += 1;
      started = { kind: "effectStarted", effect: effect.id, controller, source: effect.source, expiry: effect.expiry, change: effect.change };
    }
    const decklists: Decklists = {
      player: [...deck, ...(controller === "player" ? setup.back : [])].map((cardId) => ({ cardId })),
      enemy: [...deck, ...(controller === "enemy" ? setup.back : [])].map((cardId) => ({ cardId })),
    };
    const activate = { kind: "activate", source: protectedCard, ability: 0 } as const;
    expect(hasKeyword(state, protectionEngine.catalog, protectedCard, "cannotBeTargeted")).toBe(true);
    expect(protectionEngine.legalActions(state, controller)).not.toContainEqual(activate);
    const before = structuredClone(state);
    expect(() => protectionEngine.apply(state, controller, activate, NO_PROMPTS)).toThrow(IllegalAction);
    expect(state).toEqual(before);
    for (const viewer of SIDES) {
      const seen = protectionEngine.view(state, viewer);
      expect(seen.floating).toContainEqual({ ...state.floating[0], source: null });
      expect(eventSeenBy(started, viewer, state)).toEqual({ ...started, source: null });
      const sampled = protectionEngine.determinize(seen, decklists, () => 0.5);
      expect(hasKeyword(sampled, protectionEngine.catalog, protectedCard, "cannotBeTargeted")).toBe(true);
      expect(protectionEngine.legalActions(sampled, controller)).toEqual(protectionEngine.legalActions(state, controller));
      const sampledExpired = passUntil(protectionEngine, sampled, (next) => next.turn.turnNumber > sampled.turn.turnNumber && at(protectionEngine, controller, "day")(next)).state;
      expect(sampledExpired.floating).toEqual([]);
      expect(hasKeyword(sampledExpired, protectionEngine.catalog, protectedCard, "cannotBeTargeted")).toBe(false);
      expect(protectionEngine.legalActions(sampledExpired, controller)).toContainEqual(activate);
    }
    const expired = passUntil(protectionEngine, state, (next) => next.turn.turnNumber > state.turn.turnNumber && at(protectionEngine, controller, "day")(next)).state;
    expect(expired.floating).toEqual([]);
    expect(hasKeyword(expired, protectionEngine.catalog, protectedCard, "cannotBeTargeted")).toBe(false);
    expect(protectionEngine.legalActions(expired, controller)).toContainEqual(activate);
    expect(determinizationDivergences(protectionEngine, state, decklists, seed, 1)).toEqual([]);
    expect(determinizationDivergences(protectionEngine, expired, decklists, seed, 2)).toEqual([]);
  });
});
