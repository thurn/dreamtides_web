// The placeholder policies, their requests, the optional-chain bound, the
// worker's catalog and protocol, and the policy hosts, on synthetic cards.
import { describe, expect, it } from "vitest";

import { createCatalog, type EngineCardDefinition } from "../catalog";
import { createEngine, type Engine } from "../engine";
import { createFoldAdapter, decisionKeyOf, sidePending, type BattleSlice, type FoldAdapter } from "../fold/slice";
import { isLegalAnswer } from "../prompts/answers";
import type { ConfirmPrompt, Prompt } from "../prompts/types";
import { battleSeed, type Side } from "../state/ids";
import type { BattleInit, BattleState, DeckEntry } from "../state/types";
import { boardState, type BoardSetup } from "../testing/board";
import { CYCLE, CYCLE_CARDS } from "../testing/loop-cards";
import { PROMPT_LAB_DEFINITIONS, promptLabBattle, promptLabFixture } from "../testing/prompt-lab";
import { SYNTHETIC, SYNTHETIC_DREAMWELL, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { AI } from "../../content/ai";
import { catalogManifest, manifestCatalog, type CatalogManifest } from "./catalog-manifest";
import { aiDecision, runPolicy, type PolicyRequest } from "./decide";
import { createInlinePolicyHost, createWorkerPolicyHost, PolicyHostError, type PolicyWorker, type Timers, type WorkerBoot } from "./host";
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
    expect(handle({ type: "init", manifest })).toEqual({ type: "ready" });
    const reply = handle({ type: "decide", id: 2, request: structuredClone(request) });
    expect(reply).toEqual({ type: "decided", id: 2, result: runPolicy(engine, request) });
  });

  it("reports a policy that throws as a failed decision, and a manifest it cannot build as a failed init", () => {
    const { init, request } = enemyRequest();
    const handle = createPolicyWorkerHandler(() => 0);
    handle({ type: "init", manifest: catalogManifest(engine.catalog, init) });
    const broken: PolicyRequest = { ...request, decision: { kind: "prompt", prompt: undefined as unknown as Prompt } };
    expect(handle({ type: "decide", id: 3, request: broken })).toMatchObject({ type: "failed", id: 3 });
    const unbuilt = createPolicyWorkerHandler(() => 0);
    expect(unbuilt({ type: "init", manifest: {} as CatalogManifest })).toMatchObject({ type: "initFailed" });
    expect(unbuilt({ type: "decide", id: 4, request })).toMatchObject({ type: "failed", id: 4 });
  });
});

/**
 * A worker the test answers by hand. Like a module worker still evaluating
 * its modules, it loses every message that reaches it before it has loaded.
 */
class FakeWorker implements PolicyWorker {
  readonly posted: PolicyWorkerMessage[] = [];
  readonly lost: PolicyWorkerMessage[] = [];
  terminated = false;
  private loaded = false;
  onmessage: PolicyWorker["onmessage"] = null;
  onerror: PolicyWorker["onerror"] = null;
  postMessage(message: PolicyWorkerMessage): void {
    (this.loaded ? this.posted : this.lost).push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: PolicyWorkerReply): void {
    this.onmessage?.({ data });
  }
  load(): void {
    this.loaded = true;
    this.reply({ type: "loaded" });
  }
  ready(): void {
    this.reply({ type: "ready" });
  }
  /** Loads and reports ready to the `init` the host sends. */
  boot(): void {
    this.load();
    expect(this.posted[this.posted.length - 1]).toMatchObject({ type: "init" });
    this.ready();
  }
  /** The ids of the decisions sent to this worker. */
  decisions(): number[] {
    return this.posted.flatMap((message) => (message.type === "decide" ? [message.id] : []));
  }
  lastId(): number {
    const ids = this.decisions();
    const last = ids[ids.length - 1];
    if (last === undefined) throw new Error("no decide message");
    return last;
  }
}

/** Timers on a clock the test advances by hand. */
function manualClock(): Timers & { now(): number; advance(ms: number): void } {
  const pending = new Map<number, { at: number; callback: () => void }>();
  let time = 0;
  let next = 0;
  return {
    now: () => time,
    set: (callback, ms) => {
      next += 1;
      pending.set(next, { at: time + ms, callback });
      return next;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
    advance: (ms) => {
      const until = time + ms;
      for (;;) {
        const due = [...pending].filter(([, timer]) => timer.at <= until).sort(([, a], [, b]) => a.at - b.at)[0];
        if (due === undefined) break;
        pending.delete(due[0]);
        time = due[1].at;
        due[1].callback();
      }
      time = until;
    },
  };
}

/** A promise's outcome so far, read after `flush`. */
function observe<T>(promise: Promise<T>): { outcome: { kind: "pending" } | { kind: "resolved"; value: T } | { kind: "rejected"; error: unknown } } {
  const observed: ReturnType<typeof observe<T>> = { outcome: { kind: "pending" } };
  promise.then(
    (value) => {
      observed.outcome = { kind: "resolved", value };
    },
    (error: unknown) => {
      observed.outcome = { kind: "rejected", error };
    },
  );
  return observed;
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 3; turn += 1) await Promise.resolve();
}

describe("the worker policy host", () => {
  const { state } = board({ enemy: { hand: [weak.id], energy: 1, deck }, player: { deck } });
  const request = topLevelRequest(state, "enemy", "random", { player: entries(deck), enemy: entries([weak.id, ...deck]) }, { iterations: 8, wallClockMs: 500 });
  const result = runPolicy(engine, request);
  const manifest = catalogManifest(engine.catalog, boardInit);
  const GRACE_MS = 1000;
  const BOOT_TIMEOUT_MS = 20_000;
  /** The request's wall-clock budget plus grace. */
  const DEADLINE_MS = 500 + GRACE_MS;

  function host() {
    const clock = manualClock();
    const workers: FakeWorker[] = [];
    const boots: WorkerBoot[] = [];
    const created = createWorkerPolicyHost({
      manifest,
      graceMs: GRACE_MS,
      bootTimeoutMs: BOOT_TIMEOUT_MS,
      timers: clock,
      now: () => clock.now(),
      onBoot: (boot) => boots.push(boot),
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    function worker(index: number): FakeWorker {
      const found = workers[index];
      if (found === undefined) throw new Error(`no worker ${String(index)}`);
      return found;
    }
    return { host: created, workers, worker, boots, clock };
  }

  it("boots its worker when created, sending nothing before it loads, and resolves each decision by its id", async () => {
    const { host: subject, workers, worker } = host();
    expect(workers).toHaveLength(1);
    const first = subject.decide(request);
    const second = subject.decide(request);
    expect(worker(0).posted).toEqual([]);
    worker(0).load();
    expect(worker(0).posted).toEqual([{ type: "init", manifest }]);
    worker(0).ready();
    expect(worker(0).decisions()).toEqual([1, 2]);
    worker(0).reply({ type: "decided", id: 2, result });
    worker(0).reply({ type: "decided", id: 1, result });
    await expect(first).resolves.toEqual(result);
    await expect(second).resolves.toEqual(result);
    expect(worker(0).lost).toEqual([]);
    expect(workers).toHaveLength(1);
  });

  it("fails a decision the policy failed", async () => {
    const { host: subject, worker } = host();
    worker(0).boot();
    const decided = subject.decide(request);
    worker(0).reply({ type: "failed", id: worker(0).lastId(), message: "policy failed" });
    await expect(decided).rejects.toMatchObject({ reason: "policyError" });
  });

  it("starts a decision's deadline when its worker is ready, so a slow boot never times it out", async () => {
    const { host: subject, worker, boots, clock } = host();
    const first = observe(subject.decide(request));
    const second = observe(subject.decide(request));
    clock.advance(DEADLINE_MS * 2);
    worker(0).load();
    clock.advance(DEADLINE_MS * 2);
    await flush();
    expect(first.outcome.kind).toBe("pending");
    expect(second.outcome.kind).toBe("pending");
    worker(0).ready();
    expect(boots).toEqual([{ worker: 1, cause: "initial", outcome: "ready", ms: DEADLINE_MS * 4 }]);
    clock.advance(DEADLINE_MS - 1);
    worker(0).reply({ type: "decided", id: worker(0).lastId() - 1, result });
    await flush();
    expect(first.outcome).toEqual({ kind: "resolved", value: result });
    expect(second.outcome.kind).toBe("pending");
    // The worker is ready, so it still bounds every decision by its deadline.
    clock.advance(1);
    await flush();
    expect(second.outcome).toMatchObject({ kind: "rejected", error: { reason: "timeout" } });
    expect(worker(0).lost).toEqual([]);
  });

  it("fails a decision unanswered past its deadline and answers the next from a warm replacement", async () => {
    const { host: subject, workers, worker, boots, clock } = host();
    worker(0).boot();
    const decided = subject.decide(request);
    clock.advance(DEADLINE_MS);
    await expect(decided).rejects.toMatchObject({ reason: "timeout" });
    expect(worker(0).terminated).toBe(true);
    // The replacement boots at once, before the next decision asks.
    expect(workers).toHaveLength(2);
    worker(1).load();
    expect(worker(1).posted).toEqual([{ type: "init", manifest }]);
    const next = observe(subject.decide(request));
    expect(workers).toHaveLength(2);
    clock.advance(DEADLINE_MS * 2);
    worker(1).ready();
    // Late messages from the discarded worker change nothing.
    const late = { ...result, trace: { ...result.trace, determinizations: result.trace.determinizations + 1 } };
    worker(0).reply({ type: "decided", id: worker(1).lastId(), result: late });
    worker(0).ready();
    worker(0).onerror?.({ message: "late crash" });
    expect(worker(1).terminated).toBe(false);
    worker(1).reply({ type: "decided", id: worker(1).lastId(), result });
    await flush();
    expect(next.outcome).toEqual({ kind: "resolved", value: result });
    expect(boots.map(({ worker: ordinal, cause, outcome }) => ({ ordinal, cause, outcome }))).toEqual([
      { ordinal: 1, cause: "initial", outcome: "ready" },
      { ordinal: 2, cause: "replacement", outcome: "ready" },
    ]);
  });

  it("fails the decisions of a worker that does not boot in time, and starts a fresh worker for the next", async () => {
    const { host: subject, workers, worker, boots, clock } = host();
    const decided = subject.decide(request);
    worker(0).load();
    clock.advance(BOOT_TIMEOUT_MS);
    await expect(decided).rejects.toMatchObject({ reason: "bootTimeout" });
    expect(worker(0).terminated).toBe(true);
    expect(boots).toEqual([{ worker: 1, cause: "initial", outcome: "timeout", ms: BOOT_TIMEOUT_MS }]);
    expect(workers).toHaveLength(1);
    const next = subject.decide(request);
    expect(workers).toHaveLength(2);
    worker(1).boot();
    worker(1).reply({ type: "decided", id: worker(1).lastId(), result });
    await expect(next).resolves.toEqual(result);
    expect(boots[1]).toMatchObject({ worker: 2, cause: "demand", outcome: "ready" });
  });

  it("fails every decision of a worker that crashes or cannot build its engine, and starts a fresh worker for the next", async () => {
    const { host: subject, workers, worker, boots } = host();
    const crashed = subject.decide(request);
    worker(0).onerror?.({ message: "boom" });
    await expect(crashed).rejects.toMatchObject({ reason: "workerError" });
    expect(worker(0).terminated).toBe(true);
    expect(workers).toHaveLength(1);
    const unbuilt = subject.decide(request);
    worker(1).load();
    worker(1).reply({ type: "initFailed", message: "no catalog" });
    await expect(unbuilt).rejects.toMatchObject({ reason: "workerError" });
    expect(worker(1).terminated).toBe(true);
    const next = subject.decide(request);
    worker(2).boot();
    worker(2).onerror?.({ message: "mid-decision" });
    await expect(next).rejects.toMatchObject({ reason: "workerError" });
    expect(boots.map(({ cause, outcome }) => `${cause}:${outcome}`)).toEqual(["initial:failed", "demand:failed", "demand:ready"]);
    expect(workers).toHaveLength(3);
  });

  it("fails decisions once disposed, and when no worker can start", async () => {
    const { host: subject, workers, worker, boots, clock } = host();
    const decided = subject.decide(request);
    subject.dispose();
    await expect(decided).rejects.toMatchObject({ reason: "disposed" });
    expect(worker(0).terminated).toBe(true);
    await expect(subject.decide(request)).rejects.toMatchObject({ reason: "disposed" });
    clock.advance(BOOT_TIMEOUT_MS);
    expect(workers).toHaveLength(1);
    expect(boots).toEqual([]);
    const unavailable = createWorkerPolicyHost({
      manifest,
      graceMs: 0,
      bootTimeoutMs: 0,
      now: () => 0,
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
