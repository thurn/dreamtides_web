// The policy worker's catalog and protocol, and the worker policy host, on
// synthetic cards.
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { createEngine, type Engine } from "../engine";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { energy, event } from "../dsl/builders";
import { discover } from "../effects/primitives";
import type { Prompt } from "../prompts/types";
import { battleSeed } from "../state/ids";
import type { BattleInit } from "../state/types";
import { boardState } from "../testing/board";
import { SYNTHETIC, SYNTHETIC_DREAMWELL, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { catalogManifest, manifestCatalog, type CatalogManifest } from "./catalog-manifest";
import { aiDecision, runPolicy, type PolicyRequest } from "./decide";
import { createInlinePolicyHost, createWorkerPolicyHost, PolicyHostError, type PolicyWorker, type Timers, type WorkerBoot } from "./host";
import { PolicyRandom } from "./random";
import { createPolicyWorkerHandler, type PolicyWorkerMessage, type PolicyWorkerReply } from "./worker-protocol";
import { weak, textless, engine, fold, ITERATIONS_ONLY, deck, entries, board, topLevelRequest, boardInit } from "./policy.fixtures";

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

  it("preserves public Discover choice bounds when a costly catalog card is absent from the battle manifest", () => {
    const omitted: EngineCardDefinition = { ...weak, id: syntheticId(0x4510), costs: [energy(127)] };
    const free: EngineCardDefinition = { ...SYNTHETIC.event1, id: syntheticId(0x4511), status: "authored", abilities: () => [event(discover({ cardType: "character" }, { chooseCost: true }))] };
    const source = createEngine(testCatalog([textless, weak, omitted, free]));
    const { init } = enemyRequest();
    const manifest = catalogManifest(source.catalog, init);
    expect(manifest.cards.some((card) => card.id === omitted.id)).toBe(false);
    const rebuilt = manifestCatalog(JSON.parse(JSON.stringify(manifest)) as CatalogManifest);
    expect(rebuilt.maximumFixedCost).toBe(source.catalog.maximumFixedCost);
    // Synthetic abilities are test-only: supply the same fixture definitions to both runners.
    const restored = createEngine({ ...rebuilt, card: (id) => source.catalog.card(id) });
    const pending = (candidate: Engine) => {
      const { state, ids } = boardState(candidate.catalog, { active: "player", phase: "day", player: { hand: [free.id], energy: 1, deck: [weak.id] }, enemy: { deck: [weak.id] } });
      const adapter = createFoldAdapter(candidate, { checkEventPrefix: true });
      const slice: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const outcome = adapter.reduce(slice, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
      if (outcome.kind !== "applied") throw new Error("bounced");
      const prompt = adapter.pending(outcome.slice)!.prompt;
      const done = adapter.reduce(outcome.slice, { kind: "answer", side: "player", promptId: prompt.id, value: 128 });
      return { prompt, done };
    };
    const main = pending(source);
    const worker = pending(restored);
    expect(worker.prompt).toEqual(main.prompt);
    expect(worker.done).toEqual(main.done);
    for (const maximumFixedCost of [-1, NaN, Infinity, 1.5]) expect(() => manifestCatalog({ ...manifest, maximumFixedCost })).toThrow();
  });

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
