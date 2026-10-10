// The placeholder policies, their requests, the optional-chain bound, the
// worker's catalog and protocol, and the policy hosts, on synthetic cards.
import { describe, expect, it } from "vitest";

import type { EngineCardDefinition } from "../catalog";
import { createEngine, type Engine } from "../engine";
import { createFoldAdapter, type BattleSlice, type FoldAdapter } from "../fold/slice";
import { isLegalAnswer } from "../prompts/answers";
import type { ConfirmPrompt, Prompt } from "../prompts/types";
import { battleSeed, type Side } from "../state/ids";
import type { BattleInit, BattleState, DeckEntry } from "../state/types";
import { boardState, type BoardSetup } from "../testing/board";
import { CYCLE, CYCLE_CARDS } from "../testing/loop-cards";
import { SYNTHETIC, SYNTHETIC_DREAMWELL, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { AI } from "../../content/ai";
import { catalogManifest, manifestCatalog } from "./catalog-manifest";
import { aiDecision, runPolicy, type PolicyRequest } from "./decide";
import { createInlinePolicyHost, createWorkerPolicyHost, PolicyHostError, type PolicyWorker, type Timers } from "./host";
import { declineAnswer } from "./prompts";
import { RANDOM_POLICY, PolicyRandom } from "./random";
import type { PolicyBudget, PolicyId } from "./types";
import { createPolicyWorkerHandler, type PolicyWorkerMessage, type PolicyWorkerReply } from "./worker-protocol";

/** Two 1● characters that differ only in spark. */
const weak: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x4501) };
const strong: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x4502), spark: 4 };
/** A pending (text-less) character, as a loaded card the content modules lack plays (D36). */
const textless: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(0x4503), status: "pending" };

const engine: Engine = createEngine(testCatalog([weak, strong, textless, ...CYCLE_CARDS]));
const fold: FoldAdapter = createFoldAdapter(engine);

const ITERATIONS_ONLY: Readonly<Record<"turnPlanning" | "response", PolicyBudget>> = {
  turnPlanning: { iterations: 256 },
  response: { iterations: 64 },
};

const deck = Array.from({ length: 6 }, () => SYNTHETIC.vanilla1.id);
const entries = (ids: readonly EngineCardDefinition["id"][]): DeckEntry[] => ids.map((cardId) => ({ cardId }));

function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, { active: "enemy", phase: "day", ...setup });
}

/** A request for `side`'s top-level decision in a board state. */
function topLevelRequest(state: BattleState, side: Side, policy: PolicyId, decklists: Record<Side, DeckEntry[]>, budget: PolicyBudget = { iterations: 64 }): PolicyRequest {
  const decision = engine.decision(state);
  if (decision?.side !== side) throw new Error(`not ${side}'s decision`);
  return {
    policy,
    side,
    key: `${state.version}:0:decision`,
    view: engine.view(state, side),
    decision: { kind: "topLevel", decision, legal: engine.legalActions(state, side) },
    decklists,
    seed: battleSeed(`policy-test|${side}`),
    budget,
  };
}

function sliceOf(state: BattleState): BattleSlice {
  return { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
}

function applied(slice: BattleSlice, intent: Parameters<FoldAdapter["reduce"]>[1]): BattleSlice {
  const outcome = fold.reduce(slice, intent);
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("intent failed");
  return outcome.slice;
}

const boardInit: BattleInit = { seed: battleSeed("board"), scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] };

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

  it("takes a decision with one legal action at once", () => {
    const { state } = board({ enemy: { deck }, player: { deck } });
    const decision = aiDecision({ engine, init: boardInit, slice: sliceOf(state), pending: null, side: "enemy", policy: "greedy" });
    expect(decision?.forced).toEqual({ kind: "action", action: { kind: "pass" } });
  });
});

describe("the policy worker", () => {
  function enemyRequest(): { init: BattleInit; request: PolicyRequest } {
    const init: BattleInit = {
      seed: battleSeed("worker"),
      scoreToWin: 25,
      startingSide: "enemy",
      decks: { player: entries(Array.from({ length: 12 }, () => textless.id)), enemy: entries(Array.from({ length: 12 }, () => textless.id)) },
      dreamwell: SYNTHETIC_DREAMWELL.map((card) => card.id),
    };
    const outcome = fold.start(init);
    if (outcome.kind !== "applied") throw new Error("not started");
    const decision = aiDecision({ engine, init, slice: outcome.slice, pending: null, side: "enemy", policy: "greedy", budgets: ITERATIONS_ONLY });
    if (decision === null) throw new Error("no enemy decision");
    return { init, request: decision.request };
  }

  it("plays a text-less battle from its manifest exactly as the main thread's catalog does", () => {
    const { init, request } = enemyRequest();
    const manifest = catalogManifest(engine.catalog, init);
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
    const { abilities, ...plain } = manifestCatalog(manifest).card(textless.id);
    const { abilities: _abilities, ...expected } = textless;
    expect(plain).toEqual(expected);
    expect(abilities({ amplified: false })).toEqual([]);
    const handle = createPolicyWorkerHandler(() => 0);
    expect(handle({ type: "decide", id: 1, request })).toMatchObject({ type: "failed", id: 1 });
    expect(handle({ type: "init", manifest })).toBeNull();
    const reply = handle({ type: "decide", id: 2, request: structuredClone(request) });
    expect(reply).toEqual({ type: "decided", id: 2, result: runPolicy(engine, request) });
  });

  it("reports a policy that throws as a failed decision", () => {
    const { init, request } = enemyRequest();
    const handle = createPolicyWorkerHandler(() => 0);
    handle({ type: "init", manifest: catalogManifest(engine.catalog, init) });
    const broken: PolicyRequest = { ...request, decision: { kind: "prompt", prompt: undefined as unknown as Prompt } };
    expect(handle({ type: "decide", id: 3, request: broken })).toMatchObject({ type: "failed", id: 3 });
  });
});

/** A worker the test answers by hand. */
class FakeWorker implements PolicyWorker {
  readonly posted: PolicyWorkerMessage[] = [];
  terminated = false;
  onmessage: PolicyWorker["onmessage"] = null;
  onerror: PolicyWorker["onerror"] = null;
  postMessage(message: PolicyWorkerMessage): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: PolicyWorkerReply): void {
    this.onmessage?.({ data });
  }
  lastId(): number {
    const last = this.posted[this.posted.length - 1];
    if (last?.type !== "decide") throw new Error("no decide message");
    return last.id;
  }
}

/** Timers the test fires by hand. */
function manualTimers(): Timers & { fire(): void } {
  const pending = new Map<number, () => void>();
  let next = 0;
  return {
    set: (callback) => {
      next += 1;
      pending.set(next, callback);
      return next;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
    fire: () => {
      for (const [handle, callback] of [...pending]) {
        pending.delete(handle);
        callback();
      }
    },
  };
}

describe("the worker policy host", () => {
  const { state } = board({ enemy: { hand: [weak.id], energy: 1, deck }, player: { deck } });
  const request = topLevelRequest(state, "enemy", "random", { player: entries(deck), enemy: entries([weak.id, ...deck]) }, { iterations: 8, wallClockMs: 500 });
  const result = runPolicy(engine, request);
  const manifest = catalogManifest(engine.catalog, boardInit);

  function host(timers = manualTimers()) {
    const workers: FakeWorker[] = [];
    const created = createWorkerPolicyHost({
      manifest,
      graceMs: 1000,
      timers,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    return { host: created, workers, timers };
  }

  it("starts its worker with the manifest and resolves each decision by its id", async () => {
    const { host: subject, workers } = host();
    const first = subject.decide(request);
    const second = subject.decide(request);
    const worker = workers[0];
    if (worker === undefined) throw new Error("no worker");
    expect(worker.posted[0]).toEqual({ type: "init", manifest });
    worker.reply({ type: "decided", id: 2, result });
    worker.reply({ type: "decided", id: 1, result });
    await expect(first).resolves.toEqual(result);
    await expect(second).resolves.toEqual(result);
    expect(workers).toHaveLength(1);
  });

  it("fails a decision the policy failed", async () => {
    const { host: subject, workers } = host();
    const decided = subject.decide(request);
    workers[0]?.reply({ type: "failed", id: workers[0].lastId(), message: "policy failed" });
    await expect(decided).rejects.toMatchObject({ reason: "policyError" });
  });

  it("fails every decision of a crashed worker and starts a fresh worker for the next", async () => {
    const { host: subject, workers } = host();
    const decided = subject.decide(request);
    workers[0]?.onerror?.({ message: "boom" });
    await expect(decided).rejects.toMatchObject({ reason: "workerError" });
    expect(workers[0]?.terminated).toBe(true);
    const next = subject.decide(request);
    expect(workers).toHaveLength(2);
    expect(workers[1]?.posted[0]).toEqual({ type: "init", manifest });
    workers[1]?.reply({ type: "decided", id: workers[1].lastId(), result });
    await expect(next).resolves.toEqual(result);
  });

  it("fails a decision unanswered past its budget and grace, and discards that worker", async () => {
    const { host: subject, workers, timers } = host();
    const decided = subject.decide(request);
    timers.fire();
    await expect(decided).rejects.toMatchObject({ reason: "timeout" });
    expect(workers[0]?.terminated).toBe(true);
    // A late answer from the discarded worker changes nothing.
    workers[0]?.reply({ type: "decided", id: 1, result });
  });

  it("fails decisions once disposed, and when no worker can start", async () => {
    const { host: subject } = host();
    const decided = subject.decide(request);
    subject.dispose();
    await expect(decided).rejects.toMatchObject({ reason: "disposed" });
    await expect(subject.decide(request)).rejects.toMatchObject({ reason: "disposed" });
    const unavailable = createWorkerPolicyHost({
      manifest,
      graceMs: 0,
      createWorker: () => {
        throw new PolicyHostError("unavailable", "no workers");
      },
    });
    await expect(unavailable.decide(request)).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("runs the same policy inline", async () => {
    await expect(createInlinePolicyHost(engine).decide(request)).resolves.toEqual(result);
    expect(new PolicyRandom(request.seed).next()).toBe(new PolicyRandom(request.seed).next());
  });
});
