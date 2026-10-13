import "./overrides.contracts";
// The placeholder policies, their requests, the optional-chain bound, and
// aiDecision, on synthetic cards.
import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCardDefinition } from "../catalog";
import { createEngine, type Engine } from "../engine";
import { createFoldAdapter, decisionKeyOf, sidePending, type BattleSlice, type FoldAdapter } from "../fold/slice";
import { isLegalAnswer } from "../prompts/answers";
import { activated, energy, event } from "../dsl/builders";
import { discover, draw, gainEnergy, gainPoints } from "../effects/primitives";
import type { ConfirmPrompt, Prompt, PromptRole } from "../prompts/types";
import { onChallenge, onDusk, onNight, triggered } from "../dsl/triggers";
import { battleSeed, opponent, type InstanceId, type Side } from "../state/ids";
import type { BattleInit, BattleState } from "../state/types";
import { boardState } from "../testing/board";
import { CYCLE, LOOP } from "../testing/loop-cards";
import { PROMPT_LAB_DEFINITIONS, promptLabBattle, promptLabFixture } from "../testing/prompt-lab";
import { NO_PROMPTS } from "../steps/sources";
import { SYNTHETIC, SYNTHETIC_DREAMWELL, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { AI } from "../../content/ai";
import { aiDecision, runPolicy, type PolicyRequest } from "./decide";
import { declineAnswer, greedyAnswer, type CardInfo } from "./prompts";
import { RANDOM_POLICY } from "./random";
import type { PolicyId } from "./types";
import { weak, strong, textless, engine, fold, ITERATIONS_ONLY, deck, entries, board, topLevelRequest, boardInit } from "./policy.fixtures";

function sliceOf(state: BattleState): BattleSlice {
  return { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
}

function applied(slice: BattleSlice, intent: Parameters<FoldAdapter["reduce"]>[1]): BattleSlice {
  const outcome = fold.reduce(slice, intent);
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("intent failed");
  return outcome.slice;
}

/**
 * Plays the self-retriggering "you may" character for `side` and lets
 * `policy` answer every prompt through the fold; returns the answers given.
 */
function optionalChain(policy: PolicyId): boolean[] {
  const { state, ids } = board({ active: "enemy", enemy: { hand: [CYCLE.optionalEcho.id], energy: 1, deck }, player: { deck } });
  const card = ids.enemy.hand[0];
  if (card === undefined) throw new Error("no card");
  let slice = applied(sliceOf(state), { kind: "battleAction", side: "enemy", action: { kind: "play", card, from: "hand" } });
  const answers: boolean[] = [];
  for (let guard = 0; guard < 100; guard++) {
    const pending = fold.pending(slice);
    if (pending === null) return answers;
    const decision = aiDecision({ engine, init: boardInit, slice, pending, side: "enemy", policy, budgets: ITERATIONS_ONLY });
    if (decision === null) throw new Error("not the enemy's prompt");
    const { choice } = runPolicy(engine, decision.request);
    if (choice.kind !== "answer" || typeof choice.value !== "boolean") throw new Error("not a confirm answer");
    answers.push(choice.value);
    slice = applied(slice, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: choice.value });
  }
  throw new Error("the optional chain did not end");
}

describe("the optional-chain bound", () => {
  it("ends a self-retriggering optional ability that Greedy would otherwise accept forever", () => {
    const answers = optionalChain("greedy");
    const cap = AI.enginePolicy.optionalChainCap;
    expect(answers).toEqual([...Array.from({ length: cap }, () => true), false]);
  });

  it("ends it under Random, which declines once the chain is spent", () => {
    const answers = optionalChain("random");
    expect(answers.filter((answer) => answer).length).toBeLessThanOrEqual(AI.enginePolicy.optionalChainCap);
    expect(answers[answers.length - 1]).toBe(false);
  });

  it("makes both policies decline any optional prompt once the chain is spent", () => {
    const { state } = board({ enemy: { deck }, player: { deck } });
    const view = { ...engine.view(state, "enemy"), automaticChoices: AI.enginePolicy.optionalChainCap };
    const prompt: ConfirmPrompt = {
      kind: "confirm",
      side: "enemy",
      purpose: { source: null, cardId: null, ability: 0, role: "youMay" },
      cancellable: false,
    };
    for (const policy of ["random", "greedy"] as const) {
      for (let seed = 0; seed < 8; seed++) {
        const request: PolicyRequest = {
          ...topLevelRequest(state, "enemy", policy, { player: [], enemy: [] }),
          view,
          decision: { kind: "prompt", prompt },
          seed: battleSeed(`decline|${String(seed)}`),
        };
        const result = runPolicy(engine, request);
        expect(result.choice).toEqual({ kind: "answer", value: false });
        expect(result.trace.declined).toBe("optionalChain");
      }
    }
  });

  it("keeps Greedy paying a finite unless cost once the chain is spent, while declining loopable prompts", () => {
    const { state, ids } = board({ enemy: { back: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla1.id], deck }, player: { deck } });
    const [valuable, least] = ids.enemy.back;
    if (valuable === null || valuable === undefined || least === null || least === undefined) throw new Error("no characters");
    const view = { ...engine.view(state, "enemy"), automaticChoices: AI.enginePolicy.optionalChainCap };
    const base = (role: PromptRole) => ({ side: "enemy" as const, purpose: { source: null, cardId: null, ability: 0, role }, cancellable: false });
    const greedy = (prompt: Prompt) =>
      runPolicy(engine, { ...topLevelRequest(state, "enemy", "greedy", { player: [], enemy: [] }), view, decision: { kind: "prompt", prompt } });
    const cases: readonly { prompt: Prompt; value: unknown; declined: boolean }[] = [
      { prompt: { ...base("preventUnlessAbandons"), kind: "confirm" }, value: true, declined: false },
      { prompt: { ...base("abandon"), kind: "chooseCards", candidates: [valuable, least], min: 1, max: 1 }, value: [least], declined: false },
      { prompt: { ...base("keep"), kind: "chooseCards", candidates: [least, valuable], min: 1, max: 1 }, value: [valuable], declined: false },
      { prompt: { ...base("preventUnlessPays"), kind: "payOrDecline", energy: 1, payable: true }, value: true, declined: false },
      { prompt: { ...base("youMay"), kind: "confirm" }, value: false, declined: true },
      { prompt: { ...base("optionalPayment"), kind: "payOrDecline", energy: 1, payable: true }, value: false, declined: true },
    ];
    for (const { prompt, value, declined } of cases) {
      const result = greedy(prompt);
      expect(result.choice).toEqual({ kind: "answer", value });
      expect(result.trace.declined).toBe(declined ? "optionalChain" : undefined);
    }
  });

  it("declines with the least accepting legal answer", () => {
    const base = { side: "enemy" as const, purpose: { source: null, cardId: null, ability: 0, role: "target" as const }, cancellable: false };
    const prompts: Prompt[] = [
      { ...base, kind: "chooseTargets", candidates: ["i1", "i2", "i3"], min: 1, max: 3 },
      { ...base, kind: "chooseNumber", min: 2, max: 5 },
      { ...base, kind: "payOrDecline", energy: 2, payable: true },
      { ...base, kind: "confirm", allowed: [true] },
    ];
    expect(prompts.map(declineAnswer)).toEqual([["i1"], 2, false, true]);
    for (const prompt of prompts) expect(isLegalAnswer(prompt, declineAnswer(prompt))).toBe(true);
  });
});

describe("Greedy", () => {
  it("discovers its most valuable offered card while still giving up its least valuable for a discard", () => {
    const values: Readonly<Record<InstanceId, number>> = { i1: 2, i2: 5, i3: 1 };
    const info = (id: InstanceId): CardInfo => ({ mine: true, value: values[id] ?? 0 });
    const offer = (role: "discover" | "discard"): Prompt => ({
      kind: "chooseCards",
      side: "enemy",
      purpose: { source: null, cardId: null, ability: 0, role },
      cancellable: false,
      candidates: ["i1", "i2", "i3"],
      min: 1,
      max: 1,
    });
    expect(greedyAnswer(offer("discover"), info, () => new Set(), 0)).toEqual(["i2"]);
    expect(greedyAnswer(offer("discard"), info, () => new Set(), 0)).toEqual(["i3"]);
  });

  it("names a free Discover cost at which the deck its view samples holds a matching card", () => {
    const free: EngineCardDefinition = { ...SYNTHETIC.event1, id: syntheticId(0x4512), status: "authored", abilities: () => [event(discover({ cardType: "character" }, { chooseCost: true }))] };
    // The deck's costliest card is an event, which this character Discover cannot find.
    const costlyEvent: EngineCardDefinition = { ...SYNTHETIC.event1, id: syntheticId(0x4513), costs: [energy(5)] };
    const discovering = createEngine(testCatalog([free, costlyEvent]));
    const discoveringFold = createFoldAdapter(discovering);
    const enemyDeck = [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id, costlyEvent.id];
    const { state, ids } = boardState(discovering.catalog, { active: "enemy", phase: "day", enemy: { hand: [free.id], energy: 1, deck: enemyDeck }, player: { deck } });
    const init: BattleInit = { ...boardInit, decks: { player: entries(deck), enemy: entries([free.id, ...enemyDeck]) } };
    const card = ids.enemy.hand[0];
    if (card === undefined) throw new Error("no card");
    const outcome = discoveringFold.reduce(sliceOf(state), { kind: "battleAction", side: "enemy", action: { kind: "play", card, from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("play failed");
    const pending = discoveringFold.pending(outcome.slice);
    expect(pending?.prompt).toMatchObject({ kind: "chooseNumber", side: "enemy", purpose: { role: "discoverCost" } });
    const decision = aiDecision({ engine: discovering, init, slice: outcome.slice, pending, side: "enemy", policy: "greedy", budgets: ITERATIONS_ONLY });
    if (decision === null || pending === null) throw new Error("not the enemy's prompt");
    const { choice } = runPolicy(discovering, decision.request);
    // The vanilla 3● character is the costliest card the Discover can find.
    expect(choice).toEqual({ kind: "answer", value: 3 });
    const answered = discoveringFold.reduce(outcome.slice, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: 3 });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    expect(answered.slice.committed.sides.enemy.hand).toEqual([ids.enemy.deck[1]]);
  });

  it.each(["player", "enemy"] as const)("advances %s through Dusk despite an opponent's Challenge benefit, with legal replay after restart", (side) => {
    const challenger: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(0x4541), abilities: () => [triggered(onChallenge(), draw(2))] };
    const deciding = createEngine(testCatalog([challenger]));
    const active = opponent(side);
    const setup = { active, phase: "day" as const, [active]: { front: [challenger.id], deck }, [side]: { back: [SYNTHETIC.vanilla1.id], deck } };
    let current = deciding.apply(boardState(deciding.catalog, setup).state, active, { kind: "pass" }, NO_PROMPTS).state;
    const decklists = { [active]: entries([challenger.id, ...deck]), [side]: entries([SYNTHETIC.vanilla1.id, ...deck]) } as Record<Side, ReturnType<typeof entries>>;
    for (let step = 0; step < 4 && current.turn.phase === "dusk"; step++) {
      const decision = deciding.decision(current);
      if (decision?.side !== side) throw new Error("wrong Dusk actor");
      const legal = deciding.legalActions(current, side);
      const request: PolicyRequest = { policy: "greedy", side, key: decisionKeyOf(sliceOf(current)), view: deciding.view(current, side), decision: { kind: "topLevel", decision, legal }, decklists, seed: battleSeed("reposition-progress"), budget: { iterations: 128 } };
      const before = JSON.stringify(current);
      const result = runPolicy(deciding, request);
      expect(runPolicy(deciding, JSON.parse(JSON.stringify(request)) as PolicyRequest)).toEqual(result);
      expect(JSON.stringify(current)).toBe(before);
      expect(result.choice.kind).toBe("action");
      if (result.choice.kind !== "action") throw new Error("not an action");
      expect(legal).toContainEqual(result.choice.action);
      current = deciding.apply(current, side, result.choice.action, NO_PROMPTS).state;
    }
    expect(current.turn.phase).toBe("night");
    expect(current.sides[active].hand).toHaveLength(2);
  });

  it.each(["error", "non-settling"] as const)("keeps legal progress and its input intact under a %s simulated boundary continuation", (failure) => {
    const challenger: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(0x4543), abilities: () => [triggered(onChallenge(), draw(2))] };
    const deciding = createEngine(testCatalog([challenger]));
    const initial = boardState(deciding.catalog, { active: "player", phase: "day", player: { front: [challenger.id], deck }, enemy: { back: [SYNTHETIC.vanilla1.id], deck } }).state;
    const dusk = deciding.apply(initial, "player", { kind: "pass" }, NO_PROMPTS).state;
    const decision = deciding.decision(dusk);
    if (decision === null) throw new Error("no decision");
    // All real operations delegate to the engine; only the new simulation
    // continuation is faulted, after its candidate has produced a work state.
    const inContinuation = (current: BattleState) => current.turn.phase === "dusk" && current.version > dusk.version;
    const failing: Engine = {
      ...deciding,
      decision(current) {
        return failure === "non-settling" && inContinuation(current) ? { kind: "respond", side: "enemy" } : deciding.decision(current);
      },
      apply(current, side, action, answers, observe) {
        if (action.kind === "pass" && inContinuation(current)) {
          if (failure === "error") throw new Error("boundary failure");
          // Model a faulty continuation that makes no progress on its work
          // state; the real candidate and completed pass still use the engine.
          return { state: current, events: [], answers: [], bounded: [] };
        }
        return deciding.apply(current, side, action, answers, observe);
      },
    };
    const before = JSON.stringify(dusk);
    const result = runPolicy(failing, { policy: "greedy", side: "enemy", key: decisionKeyOf(sliceOf(dusk)), view: deciding.view(dusk, "enemy"), decision: { kind: "topLevel", decision, legal: deciding.legalActions(dusk, "enemy") }, decklists: { player: entries([challenger.id, ...deck]), enemy: entries([SYNTHETIC.vanilla1.id, ...deck]) }, seed: battleSeed("failed-boundary"), budget: { iterations: 128 } });
    expect(result.choice).toEqual({ kind: "action", action: { kind: "pass" } });
    expect(JSON.stringify(dusk)).toBe(before);
    expect(deciding.apply(dusk, "enemy", { kind: "pass" }, NO_PROMPTS).state.turn.phase).toBe("night");
  });

  it.each(["player", "enemy"] as const)("keeps %s's legal reposition that improves the phase-boundary outcome", (side) => {
    const blocker: EngineCardDefinition = {
      ...SYNTHETIC.vanilla1, id: syntheticId(0x4542),
      abilities: () => [triggered(onDusk(), gainPoints({ value: "count", of: { controller: "you", challenging: true } }))],
    };
    const deciding = createEngine(testCatalog([blocker]));
    const active = side;
    const setup = { active, phase: "day" as const, scoreToWin: 1, [opponent(side)]: { front: [SYNTHETIC.vanilla2.id], deck }, [side]: { back: [blocker.id], deck } };
    const day = boardState(deciding.catalog, setup).state;
    const decision = deciding.decision(day);
    if (decision?.side !== side) throw new Error("wrong main actor");
    const legal = deciding.legalActions(day, side);
    const decklists = { [opponent(side)]: entries([SYNTHETIC.vanilla2.id, ...deck]), [side]: entries([blocker.id, ...deck]) } as Record<Side, ReturnType<typeof entries>>;
    const request: PolicyRequest = { policy: "greedy", side, key: decisionKeyOf(sliceOf(day)), view: deciding.view(day, side), decision: { kind: "topLevel", decision, legal }, decklists, seed: battleSeed("useful-reposition"), budget: { iterations: 128 } };
    const result = runPolicy(deciding, request);
    if (result.choice.kind !== "action") throw new Error("not an action");
    expect(legal).toContainEqual(result.choice.action);
    expect(result.choice.action.kind).toBe("reposition");
    const moved = deciding.apply(day, side, result.choice.action, NO_PROMPTS).state;
    expect(moved.result).toBeNull();
    const finished = deciding.apply(moved, side, { kind: "pass" }, NO_PROMPTS).state;
    expect(finished.result).toMatchObject({ kind: "victory", winner: side });
    expect(deciding.apply(day, side, { kind: "pass" }, NO_PROMPTS).state.result).toBeNull();
  });

  it.each(["player", "enemy"] as const)("keeps %s's useful non-active Dusk move through the Night outcome", (side) => {
    // Named Night triggers belong to the active side; the reward reads the
    // opponent's blockers only after the real Dusk-ending designation.
    const challenger: EngineCardDefinition = {
      ...SYNTHETIC.vanilla2, id: syntheticId(0x4631),
      abilities: () => [triggered(onNight(), gainPoints({ value: "count", of: { controller: "opponent", blocking: true } }, "opponent"))],
    };
    const deciding = createEngine(testCatalog([challenger]));
    const active = opponent(side);
    const initial = boardState(deciding.catalog, { active, phase: "day", scoreToWin: 1, [active]: { front: [challenger.id], deck }, [side]: { back: [SYNTHETIC.vanilla1.id], deck } }).state;
    const dusk = deciding.apply(initial, active, { kind: "pass" }, NO_PROMPTS).state;
    expect(dusk.turn.phase).toBe("dusk");
    expect(dusk.turn.active).toBe(active);
    const decision = deciding.decision(dusk);
    if (decision?.side !== side) throw new Error("wrong Dusk actor");
    const legal = deciding.legalActions(dusk, side);
    const decklists = { [active]: entries([challenger.id, ...deck]), [side]: entries([SYNTHETIC.vanilla1.id, ...deck]) } as Record<Side, ReturnType<typeof entries>>;
    const request: PolicyRequest = { policy: "greedy", side, key: decisionKeyOf(sliceOf(dusk)), view: deciding.view(dusk, side), decision: { kind: "topLevel", decision, legal }, decklists, seed: battleSeed("useful-dusk-move"), budget: { iterations: 128 } };
    const before = JSON.stringify(dusk);
    const result = runPolicy(deciding, request);
    expect(runPolicy(deciding, JSON.parse(JSON.stringify(request)) as PolicyRequest)).toEqual(result);
    expect(JSON.stringify(dusk)).toBe(before);
    if (result.choice.kind !== "action") throw new Error("not an action");
    expect(legal).toContainEqual(result.choice.action);
    expect(result.choice.action.kind).toBe("reposition");
    const moved = deciding.apply(dusk, side, result.choice.action, NO_PROMPTS).state;
    expect(moved.turn.phase).toBe("dusk");
    expect(moved.result).toBeNull();
    const finished = deciding.apply(moved, side, { kind: "pass" }, NO_PROMPTS).state;
    expect(finished.turn.phase).toBe("night");
    expect(finished.result).toMatchObject({ kind: "victory", winner: side });
    const passed = deciding.apply(dusk, side, { kind: "pass" }, NO_PROMPTS).state;
    expect(passed.turn.phase).toBe("night");
    expect(passed.result).toBeNull();
    expect(passed.sides[side].score).toBe(dusk.sides[side].score);
  });

  it("plays the character that adds the most board spark", () => {
    const { state, ids } = board({ enemy: { hand: [weak.id, strong.id], energy: 1, deck }, player: { hand: [SYNTHETIC.vanilla1.id], deck } });
    const decklists = { player: entries([SYNTHETIC.vanilla1.id, ...deck]), enemy: entries([weak.id, strong.id, ...deck]) };
    const result = runPolicy(engine, topLevelRequest(state, "enemy", "greedy", decklists));
    expect(result.choice).toEqual({ kind: "action", action: { kind: "play", card: ids.enemy.hand[1], from: "hand" } });
    expect(result.trace.candidates[0]?.choice).toEqual(result.choice);
    expect(result.trace.determinizations).toBeGreaterThan(0);
  });

  it("decides from the view alone: hidden cards and the battle's seed never change its answer", () => {
    const decklists = { player: entries([strong.id, weak.id, ...deck]), enemy: entries([weak.id, strong.id, ...deck]) };
    const first = board({ enemy: { hand: [weak.id, strong.id], energy: 1, deck }, player: { hand: [strong.id], deck } });
    const second = board({ enemy: { hand: [weak.id, strong.id], energy: 1, deck }, player: { hand: [weak.id], deck } });
    const reseeded = { ...second.state, seed: battleSeed("another battle seed") };
    const answers = [first.state, second.state, reseeded].map((state) => runPolicy(engine, topLevelRequest(state, "enemy", "greedy", decklists)));
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  it("accepts a loop on offer that repeats to victory", () => {
    const { state, ids } = board({ enemy: { back: [LOOP.freePoints.id], deck }, player: { deck }, scoreToWin: 10 });
    const source = ids.enemy.back[0];
    if (source == null) throw new Error("no source");
    const once = engine.apply(state, "enemy", { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
    const loop = engine.legalActions(once, "enemy").find((action) => action.kind === "repeatLoop");
    expect(loop).toBeDefined();
    const decklists = { player: entries(deck), enemy: entries([LOOP.freePoints.id, ...deck]) };
    const result = runPolicy(engine, topLevelRequest(once, "enemy", "greedy", decklists));
    expect(result.choice).toEqual({ kind: "action", action: loop });
  });

  it.each([undefined, 1])("bounds a non-terminating loop with battle cap %s and keeps its offered actions", (battleCap) => {
    const energyLoop: EngineCardDefinition = { ...LOOP.freePoints, id: syntheticId(0x4514), abilities: () => [activated([], gainEnergy(1))] };
    const looping = createEngine(testCatalog([energyLoop]));
    const { state, ids } = boardState(looping.catalog, { active: "enemy", phase: "day", enemy: { back: [energyLoop.id], deck }, player: { deck } });
    const source = ids.enemy.back[0];
    if (source == null) throw new Error("no source");
    const activatedState = looping.apply(state, "enemy", { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
    const once = battleCap === undefined ? activatedState : { ...activatedState, config: { ...activatedState.config, loopIterationCap: battleCap } };
    const decision = looping.decision(once);
    if (decision === null) throw new Error("no decision");
    const legal = looping.legalActions(once, "enemy");
    const loop = legal.find((action) => action.kind === "repeatLoop");
    if (loop === undefined) throw new Error("no loop");
    expect(loop.count).toBe("untilVictory");
    const observed: { count: number | "untilVictory"; steps: number; iterations: number }[] = [];
    // This facade delegates every action to the real engine and observes its public steps/events.
    const observedEngine: Engine = {
      ...looping,
      apply(current, side, action, answers, observe) {
        if (action.kind !== "repeatLoop") return looping.apply(current, side, action, answers, observe);
        const run = { count: action.count, steps: 0, iterations: 0 };
        observed.push(run);
        const result = looping.apply(current, side, action, answers, (after, step, events) => {
          if (step.kind === "loopIteration") run.steps += 1;
          observe?.(after, step, events);
        });
        for (const event of result.events) {
          if (event.kind === "loopEnded" && event.loop === action.loop) run.iterations += event.iterations;
        }
        return result;
      },
    };
    const budget = { iterations: legal.length + 1 };
    const result = runPolicy(observedEngine, {
      policy: "greedy", side: "enemy", key: decisionKeyOf(sliceOf(once)), view: looping.view(once, "enemy"),
      decision: { kind: "topLevel", decision, legal },
      decklists: { player: entries(deck), enemy: entries([energyLoop.id, ...deck]) },
      seed: battleSeed("loop-budget"), budget,
    });
    const limit = AI.enginePolicy.greedy.loopIterationLimit;
    const effectiveLimit = Math.min(limit, once.config.loopIterationCap);
    expect(observed.length).toBeGreaterThan(0);
    for (const run of observed) {
      expect(run.steps).toBeLessThanOrEqual(effectiveLimit + 1);
      expect(run.iterations).toBeLessThanOrEqual(effectiveLimit);
      expect(typeof run.count).toBe("number");
      if (typeof run.count !== "number") throw new Error("unbounded simulated count");
      expect(run.count).toBeLessThanOrEqual(effectiveLimit);
      expect(run.iterations).toBeGreaterThan(0);
    }
    expect(result.trace.used.iterations).toBeLessThanOrEqual(budget.iterations);
    expect(result.trace.loopSimulation).toEqual({ iterationLimit: limit, simulations: observed.length, iterations: observed.reduce((sum, run) => sum + run.iterations, 0) });
    expect(result.choice.kind).toBe("action");
    if (result.choice.kind !== "action") throw new Error("not an action");
    expect(legal).toContainEqual(result.choice.action);
    if (result.choice.action.kind === "repeatLoop") expect(result.choice.action).toEqual(loop);
    expect(looping.legalActions(once, "enemy")).toEqual(legal);
    expect(once.result).toBeNull();
  });

  it("stops at its iteration budget and its wall-clock cap, keeping the best candidate it weighed", () => {
    const { state } = board({ enemy: { hand: [weak.id, strong.id], energy: 1, deck }, player: { deck } });
    const decklists = { player: entries(deck), enemy: entries([weak.id, strong.id, ...deck]) };
    const one = runPolicy(engine, topLevelRequest(state, "enemy", "greedy", decklists, { iterations: 1 }));
    expect(one.choice).toEqual({ kind: "action", action: { kind: "pass" } });
    expect(one.trace.used.iterations).toBe(1);
    const none = runPolicy(engine, topLevelRequest(state, "enemy", "greedy", decklists, { iterations: 0 }));
    expect(none.choice).toEqual({ kind: "action", action: { kind: "pass" } });
    expect(none.trace.candidates).toEqual([]);
    // A clock that jumps past the cap at once: nothing is simulated.
    let clock = 0;
    const late = runPolicy(engine, topLevelRequest(state, "enemy", "greedy", decklists, { iterations: 64, wallClockMs: 10 }), () => (clock += 100));
    expect(late.trace.used.iterations).toBe(0);
    expect(late.choice).toEqual({ kind: "action", action: { kind: "pass" } });
  });
});

describe("Random", () => {
  it("answers each request with a legal choice, the same every time", () => {
    const { state } = board({ enemy: { hand: [weak.id, strong.id], energy: 1, deck }, player: { deck } });
    const request = topLevelRequest(state, "enemy", "random", { player: entries(deck), enemy: entries([weak.id, strong.id, ...deck]) });
    const result = runPolicy(engine, request);
    expect(runPolicy(engine, request)).toEqual(result);
    expect(request.decision.kind === "topLevel" && request.decision.legal).toContainEqual(result.choice.kind === "action" ? result.choice.action : null);
    expect(RANDOM_POLICY.id).toBe("random");
  });
});

describe("aiDecision", () => {
  /** A battle on its first decision, started through the fold. */
  function started(): { init: BattleInit; slice: BattleSlice } {
    const init: BattleInit = {
      seed: battleSeed("ai-decision"),
      scoreToWin: 25,
      startingSide: "player",
      decks: { player: entries(Array.from({ length: 12 }, () => textless.id)), enemy: entries(Array.from({ length: 12 }, () => SYNTHETIC.vanilla2.id)) },
      dreamwell: SYNTHETIC_DREAMWELL.map((card) => card.id),
    };
    const outcome = fold.start(init);
    if (outcome.kind !== "applied") throw new Error("not started");
    return { init, slice: outcome.slice };
  }

  it("asks only the side that owes the decision, keyed by the decision and seeded by the battle", () => {
    const { init, slice } = started();
    const input = { engine, init, slice, pending: null, policy: "greedy" as const };
    expect(aiDecision({ ...input, side: "enemy" })).toBeNull();
    const decision = aiDecision({ ...input, side: "player" });
    expect(decision?.request.key).toBe(`${String(slice.committed.version)}:${String(slice.attempt)}:decision`);
    expect(decision?.request.seed).toContain(init.seed);
    expect(decision?.request.view).toEqual(engine.view(slice.committed, "player"));
    expect(decision?.request.budget).toEqual(AI.enginePolicy.budgets.turnPlanning);
    expect(aiDecision({ ...input, side: "player", slice: { ...slice, committed: { ...slice.committed, result: { kind: "draw", reason: "turnLimit" } } } })).toBeNull();
  });

  it("names a prompt-lab decision by the same key on the human's and the AI's paths", () => {
    const { cards, emblems, figments } = PROMPT_LAB_DEFINITIONS;
    const labEngine = createEngine(createCatalog(cards, [], emblems, figments));
    const lab = createFoldAdapter(labEngine);
    const owed = (name: string, side: Side) => {
      const fixture = promptLabFixture(name);
      if (fixture === null) throw new Error(`no fixture ${name}`);
      const { init, slice } = promptLabBattle(labEngine, fixture);
      const pending = lab.pending(slice);
      return {
        slice,
        pending,
        human: sidePending(labEngine, slice, pending, side),
        ai: aiDecision({ engine: labEngine, init, slice, pending, side, policy: "random", budgets: ITERATIONS_ONLY }),
      };
    };

    const prompt = owed("prevent", "player");
    expect(prompt.human.kind).toBe("prompt");
    expect(prompt.ai).toMatchObject({ kind: "prompt", promptId: prompt.pending?.prompt.id });
    expect(prompt.human.kind === "prompt" ? prompt.human.key : null).toBe(prompt.ai?.request.key);

    const decision = owed("respond", "player");
    expect(decision.human.kind).toBe("topLevel");
    expect(decision.ai?.kind).toBe("topLevel");
    expect(decision.human.kind === "topLevel" ? decision.human.key : null).toBe(decision.ai?.request.key);
    expect(decision.ai?.request.key).toBe(decisionKeyOf(decision.slice));

    const waiting = owed("ai-discard", "player");
    expect(waiting.ai).toBeNull();
    expect(waiting.human).toMatchObject({ kind: "waiting", owner: "enemy" });
    expect(owed("ai-discard", "enemy").ai?.request.key).toBe(waiting.pending?.prompt.id);
  });

  it("takes a decision with one legal action at once", () => {
    const { state } = board({ enemy: { deck }, player: { deck } });
    const decision = aiDecision({ engine, init: boardInit, slice: sliceOf(state), pending: null, side: "enemy", policy: "greedy" });
    expect(decision?.forced).toEqual({ kind: "action", action: { kind: "pass" } });
  });
});
