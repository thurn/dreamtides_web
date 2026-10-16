import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createCatalog } from "../../src/engine/catalog";
import { createEngine } from "../../src/engine/engine";
import { energy, event } from "../../src/engine/dsl/builders";
import { triggered, atStartOfFirstTurn } from "../../src/engine/dsl/triggers";
import { discard } from "../../src/engine/effects/primitives/discard";
import { sequence } from "../../src/engine/effects/primitives/sequence";
import SETTINGS from "./catalog.json";
import { optional } from "../../src/engine/effects/primitives/optional";
import { draw } from "../../src/engine/effects/primitives/draw";
import { parseCardId } from "../../src/types/card-identity";
import { parseAvatarId, parseOpponentId, parseTideId } from "../../src/types/identifiers";
import { parseJourneySeed } from "../../src/types/journey-seed";
import { catalogManifest } from "../../src/engine/policy/catalog-manifest";
import { digest } from "./provenance";
import { schedule } from "./schedule";
import { decodePool } from "./pool";
import { options, budgetOption } from "./options";
import { playGame, replayGame } from "./game";
import { acquireRunLock, appendRecord, readJournal, outcomesDigest, type JournalHeader } from "./journal";
import { runBatch } from "./batch";
import { workerHandler } from "./worker";
import { winStatistics, eloEstimate } from "./statistics";
import type { DeckPool, GameRecord, TournamentConfig } from "./types";

const character = { id: parseCardId("5e5e5e5e-0000-4000-8000-00000000fa01"), cardType: "character" as const, costs: [energy(0)], spark: 3, subtype: "Warrior" as const, speed: "standard" as const, status: "vanilla" as const, abilities: () => [] };
const choosing = { ...character, id: parseCardId("5e5e5e5e-0000-4000-8000-00000000fa02"), cardType: "event" as const, spark: null, status: "authored" as const, abilities: () => [event(draw(1))] };
const avatarId = parseAvatarId("5e5e5e5e-0000-4000-8000-00000000fa03");
const tideId = parseTideId("5e5e5e5e-0000-4000-8000-00000000fa04");
const engine = createEngine(createCatalog([character, choosing], [], { avatars: [{ id: avatarId, status: "authored", abilities: () => [triggered(atStartOfFirstTurn(), sequence(discard(1), optional(draw(1))))] }] }));
const pool: DeckPool = { schemaVersion: 1, provenance: { generatedAt: "2026-01-01T00:00:00Z", reason: "synthetic contract", seed: parseJourneySeed("fixture"), sourceHash: digest("fixture"), apollyon: "hv-umm2.295" }, decks: [0, 1].map((index) => ({ id: parseOpponentId(`fixture-${String(index)}`), layer: 0, avatarId, abilityActive: false, dreamsigns: [], cards: Array.from({ length: 12 }, (_, entry) => entry % 3 === 0 ? choosing.id : character.id), archetypes: [tideId], affiliationId: null, poolSeed: index })) };
const config: TournamentConfig = { a: "random", b: "greedy", games: 4, seed: parseJourneySeed("contract"), budgets: { turnPlanning: { iterations: 8 }, response: { iterations: 8 } }, poolHash: digest(JSON.stringify(pool)), sourceHash: digest("synthetic source"), scheduleVersion: 1, runtime: { node: process.version, platform: process.platform, architecture: process.arch } };
const matches = schedule(config, pool, [], [3]);
const spec = matches[0];
if (spec === undefined) throw new Error("Missing synthetic match");
const manifest = catalogManifest(engine.catalog, spec.init);
const paths: string[] = [];
function directory(): string { const path = mkdtempSync(join(tmpdir(), "tournament-contract-")); paths.push(path); return path; }
const header: JournalHeader = { event: "tournament.started", config, fingerprint: digest(JSON.stringify(config)), timestamp: "2026-01-01T00:00:00Z", sourceFiles: [] };
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });

it("pairs the same deal and starting seat while each policy pilots each deck and moves first once", () => {
  for (const ordinal of [0, 2]) {
    const first = matches[ordinal], second = matches[ordinal + 1];
    if (first === undefined || second === undefined) throw new Error("Missing pair");
    expect(first.init).toEqual(second.init);
    expect(first.decks).toEqual(second.decks);
    expect(first.policies.player).toBe(second.policies.enemy);
    expect(first.policies.enemy).toBe(second.policies.player);
    const starting = first.init.startingSide;
    if (starting === undefined) throw new Error("Missing starting seat");
    expect(first.policies[starting]).not.toBe(second.policies[starting]);
  }
  expect(schedule({ ...config }, pool, [], [3])).toEqual(matches);
});
it("decodes repeated card UUID entries and rejects malformed, unknown, and duplicate deck identities", () => {
  expect(decodePool(JSON.parse(JSON.stringify(pool)), engine.catalog)).toEqual(pool);
  const first = pool.decks[0];
  expect(first?.cards.filter((id) => id === character.id).length).toBeGreaterThan(1);
  expect(() => decodePool({ ...pool, decks: [first, first] }, engine.catalog)).toThrow();
  expect(() => decodePool({ ...pool, decks: pool.decks.map((deck) => ({ ...deck, avatarId: "invalid" })) }, engine.catalog)).toThrow();
  expect(() => decodePool({ ...pool, decks: pool.decks.map((deck) => ({ ...deck, cards: [parseCardId("5e5e5e5e-0000-4000-8000-00000000ffff")] })) }, engine.catalog)).toThrow();
});
it("rejects odd games, unknown policies, unsafe destinations, and malformed budgets before runtime effects", () => {
  for (const args of [["--games", "3"], ["--a", "unknown"], ["--run-id", "../outside"], ["--budget", "scale:0"], ["--budget", "scale:1/0"], ["--resume"]]) expect(() => options(args)).toThrow();
  expect(budgetOption("iterations:7")).toEqual({ turnPlanning: { iterations: 7 }, response: { iterations: 7 } });
  expect(budgetOption("scale:1/2")).toEqual(budgetOption("scale:0.5"));
  expect(Object.values(budgetOption("scale:1/2")).every((budget) => !("wallClockMs" in budget))).toBe(true);
});
it("reproduces engine outcomes and recorded prompt answers without spending policy RNG on replay", () => {
  const promptSpec = { ...spec, init: { ...spec.init, scoreToWin: 100, avatars: { player: avatarId, enemy: avatarId } } };
  let observedPolicyViews = 0;
  const checkingEngine = { ...engine, view(state: Parameters<typeof engine.view>[0], side: Parameters<typeof engine.view>[1]) {
    const seen = engine.view(state, side);
    // The policy view must expose a prior mandatory discard within this same step.
    observedPolicyViews++;
    if (seen.sides[side].hand.count !== state.sides[side].hand.length) throw new Error("Policy view omits an earlier same-step discard");
    return seen;
  } };
  const played = playGame(checkingEngine, { init: promptSpec.init, policies: promptSpec.policies }, config.budgets);
  if (played.status !== "completed") throw new Error(played.failure);
  expect(played.status).toBe("completed");
  expect(replayGame(engine, promptSpec, played)).toBe(played.finalStateHash);
  expect(observedPolicyViews).not.toBe(0);
  const prompts = played.logs.filter((log) => log.event === "ai.decision" && log.decision.kind === "prompt");
  expect(new Set(prompts.filter((log) => log.event === "ai.decision" && log.decision.kind === "prompt" && log.decision.prompt.purpose.role === "discard").map((log) => log.event === "ai.decision" ? log.side : null))).toEqual(new Set(["player", "enemy"]));
  expect(prompts.some((log) => log.event === "ai.decision" && log.side === "enemy" && log.decision.kind === "prompt" && log.decision.prompt.purpose.role === "discard")).toBe(true);
  expect(prompts.some((log) => log.event === "ai.decision" && log.side === "enemy" && log.decision.kind === "prompt" && log.decision.prompt.purpose.role === "youMay")).toBe(true);
  expect([...played.startAnswers, ...played.actions.flatMap((action) => action.answers)].some((answer) => answer.auto !== true)).toBe(true);
  const repeated = playGame(engine, promptSpec, config.budgets);
  expect(repeated.status).toBe("completed");
  if (repeated.status !== "completed") throw new Error(repeated.failure);
  expect(repeated.result).toEqual(played.result);
  expect(repeated.finalStateHash).toBe(played.finalStateHash);
  expect(repeated.actions).toEqual(played.actions);
});

describe("durable resume", () => {
  const record = (): GameRecord => ({ event: "tournament.game", timestamp: "2026-01-01T00:00:00Z", ordinal: spec.ordinal, spec, outcome: playGame(engine, spec, config.budgets) });
  it("retains committed games across a partial tail and rejects duplicate or mismatched completed games", () => {
    const path = join(directory(), "run.jsonl");
    readJournal(path, header, matches, false);
    const game = record(); appendRecord(path, game);
    appendFileSync(path, '{"event":"partial');
    expect(readJournal(path, header, matches, true)).toEqual([game]);
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
    expect(() => readJournal(path, { ...header, fingerprint: digest("changed source") }, matches, true)).toThrow();
    const retained = readFileSync(path, "utf8");
    const altered = retained.trim().split("\n").map((line) => JSON.parse(line) as { event: string; outcome?: { finalStateHash: ReturnType<typeof digest> } });
    const entry = altered.find((line) => line.event === "tournament.game");
    if (entry?.outcome === undefined) throw new Error("Missing completed record");
    entry.outcome.finalStateHash = digest("corrupt outcome");
    writeFileSync(path, `${altered.map((line) => JSON.stringify(line)).join("\n")}\n`);
    expect(() => readJournal(path, header, matches, true)).toThrow();
    writeFileSync(path, retained);
    appendRecord(path, game);
    expect(() => readJournal(path, header, matches, true)).toThrow();
  });
  it("rejects malformed interior data without truncating its bytes", () => {
    const path = join(directory(), "run.jsonl");
    readJournal(path, header, matches, false); appendFileSync(path, "malformed\npartial");
    const bytes = readFileSync(path);
    expect(() => readJournal(path, header, matches, true)).toThrow();
    expect(readFileSync(path)).toEqual(bytes);
  });
  it("keeps failures eligible and excludes them from the outcome digest", () => {
    const path = join(directory(), "run.jsonl"); readJournal(path, header, matches, false);
    const game = record();
    const failed: GameRecord = { ...game, outcome: { status: "failed", failure: "synthetic failure", actions: [], startAnswers: [], logs: [], decisionMs: 0, decisionCount: 0 } };
    appendRecord(path, failed); appendRecord(path, game);
    expect(readJournal(path, header, matches, true)).toEqual([failed, game]);
    expect(outcomesDigest([failed, game])).toBe(outcomesDigest([game]));
  });
  it("refuses a live concurrent owner, recovers a dead same-host owner explicitly, and preserves a replacement lock", async () => {
    const path = join(directory(), "run.lock");
    const release = acquireRunLock(path);
    expect(() => acquireRunLock(path)).toThrow(); expect(() => acquireRunLock(path, true)).toThrow();
    const owned = readFileSync(path, "utf8"); release();
    const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" }); await once(child, "exit");
    writeFileSync(path, JSON.stringify({ pid: child.pid, host: hostname() }));
    expect(() => acquireRunLock(path)).toThrow();
    const recovered = acquireRunLock(path, true);
    writeFileSync(path, owned);
    recovered(); expect(readFileSync(path, "utf8")).toBe(owned);
  });
});

it("runs actual Node workers, resumes a one-leg prefix equivalently, and settles workers on failure", async ({ signal, onTestFinished }) => {
  // Each batch allows a catalog boot interval for startup and another for finite
  // synthetic game work. Four batch deadlines plus a settlement interval bound
  // this lifecycle check; these watchdogs do not assert execution speed.
  // Cancellation must join runBatch's worker/timer cleanup before Vitest moves on.
  let pending: ReturnType<typeof runBatch> | undefined;
  onTestFinished(async () => { await pending; }, SETTINGS.workerBootMs);
  const batch = (input: Omit<Parameters<typeof runBatch>[0], "batchMs" | "signal">, interrupt?: AbortSignal) => {
    signal.throwIfAborted();
    pending = runBatch({ ...input, batchMs: 2 * SETTINGS.workerBootMs, signal: interrupt === undefined ? signal : AbortSignal.any([signal, interrupt]) });
    return pending;
  };
  const baseline: GameRecord[] = [];
  const all = await batch({ manifest, matches, budgets: config.budgets, workers: 1, onGame: (game) => baseline.push(game) });
  expect(all.reason).toBe("complete"); expect(all.completed).toBe(matches.length); expect(all.workers).toBe(1);
  const partial: GameRecord[] = [], abort = new AbortController();
  const first = await batch({ manifest, matches, budgets: config.budgets, workers: 1, onGame(game) { partial.push(game); abort.abort(); } }, abort.signal);
  expect(first.reason).toBe("signal"); expect(partial).toHaveLength(1); expect(first.workers).toBe(1);
  const resumed = await batch({ manifest, matches: matches.filter((match) => !partial.some((game) => game.ordinal === match.ordinal)), budgets: config.budgets, workers: 2, onGame: (game) => partial.push(game) });
  expect(resumed.reason).toBe("complete"); expect(resumed.workers).toBe(2); expect(outcomesDigest(partial)).toBe(outcomesDigest(baseline));
  const missingCardId = parseCardId("5e5e5e5e-0000-4000-8000-00000000ffff");
  const bad = { ...spec, init: { ...spec.init, decks: { ...spec.init.decks, player: [{ cardId: missingCardId }] } } };
  const failed = await batch({ manifest, matches: [bad], budgets: config.budgets, workers: 1, onGame() { throw new Error("Failure must not be accepted as completed"); } });
  expect(failed.reason).toBe("failure"); expect(failed.completed).toBe(0); expect(failed.workers).toBe(1); expect(failed.unfinishedOrdinals).toEqual([bad.ordinal]);
  expect(failed.failure).toContain(missingCardId);
}, (4 * 2 + 1) * SETTINGS.workerBootMs);
it("reports worker request order errors without poisoning the next valid catalog boot", () => {
  const handle = workerHandler();
  expect(handle({ kind: "game", spec, budgets: config.budgets }).kind).toBe("error");
  expect(handle({ kind: "boot", manifest }).kind).toBe("ready");
  expect(handle({ kind: "boot", manifest }).kind).toBe("error");
});
it("scores draws as halves and fits symmetric, finite relative Elo estimates", () => {
  expect(winStatistics([1, 0, 0.5]).rate).toBe(0.5);
  expect(winStatistics([1, 0, 0.5]).wins).toBe(1);
  expect(winStatistics([]).rate).toBeNull();
  const even = eloEstimate([0.5, 0.5]); expect(even[0]).toBe(even[1]);
  const winning = eloEstimate([1, 1]), losing = eloEstimate([0, 0]);
  expect(winning.every(Number.isFinite)).toBe(true); expect(winning).toEqual([losing[1], losing[0]]);
});
