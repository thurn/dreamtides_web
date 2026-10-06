/** The engine logging schema and its fold and fuzzer hosts. */
import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import type { EngineEvent } from "./events";
import { eventLogRecords, stepLogRecords, type EngineLogRecord } from "./log";
import { battleSeed } from "./state/ids";
import { fuzzEngineCatalog, fuzzGameLog, playFuzzGame, replayInteractively, type FuzzGame } from "./testing/fuzz";

const engine = createEngine(fuzzEngineCatalog());

/** The first seeded fuzz game with prompts and triggers. */
function promptingGame(): FuzzGame {
  for (let index = 0; index < 20; index++) {
    const game = playFuzzGame(engine, battleSeed(`log-${String(index)}`));
    const triggered = fuzzGameLog(engine, game).some((record) => record.event === "engine.trigger");
    if (game.prompts > 0 && triggered && game.result !== null) return game;
  }
  throw new Error("no seeded game with prompts and triggers");
}

const GAME = promptingGame();

/** The records both hosts derive from the engine's events and state changes. */
function derived(records: readonly EngineLogRecord[]): EngineLogRecord[] {
  return records.filter((record) => ["engine.trigger", "engine.loop", "engine.rng", "engine.battleEnded"].includes(record.event));
}

describe("engine log records", () => {
  it("maps triggers, loops, and the battle's end, leaving other events to replay", () => {
    const events: EngineEvent[] = [
      { kind: "triggerQueued", source: "i3", controller: "player", ability: 0, node: null, subject: null },
      { kind: "cardDrawn", side: "player", instance: "i4" },
      { kind: "loopEnded", side: "enemy", loop: "l1", iterations: 2, reason: "battleEnded" },
      { kind: "battleEnded", result: { kind: "draw", reason: "turnLimit" } },
    ];
    expect(eventLogRecords(events, 7)).toEqual([
      { event: "engine.trigger", version: 7, detail: events[0] },
      { event: "engine.loop", version: 7, detail: events[2] },
      { event: "engine.battleEnded", version: 7, result: { kind: "draw", reason: "turnLimit" } },
    ]);
  });

  it("records each random stream a step drew from", () => {
    const { state } = engine.createBattle(GAME.init, { answer: () => [] });
    const after = structuredClone(state);
    after.rng["random:discard"] = (after.rng["random:discard"] ?? 0) + 2;
    after.rng["shuffle:player"] = (after.rng["shuffle:player"] ?? 0) + 1;
    expect(stepLogRecords(state, after)).toEqual([
      { event: "engine.rng", version: state.version, stream: "random:discard", draws: 2 },
      { event: "engine.rng", version: state.version, stream: "shuffle:player", draws: 1 },
    ]);
  });
});

describe("fuzzer and fold hosts", () => {
  it("logs a fuzz game's init, policies, and actions with their answers, ending with the result", () => {
    const records = fuzzGameLog(engine, GAME);
    expect(records[0]).toMatchObject({ event: "engine.battleStarted", init: GAME.init, policies: { player: "random", enemy: "random" } });
    const actions = records.flatMap((record) => (record.event === "engine.action" ? [{ side: record.side, action: record.action, answers: record.answers }] : []));
    expect(actions).toEqual(GAME.actions);
    expect(records.filter((record) => record.event === "engine.battleEnded")).toEqual([expect.objectContaining({ result: GAME.result })]);
    expect(records.some((record) => record.event === "engine.rng")).toBe(true);
    expect(JSON.parse(JSON.stringify(records))).toEqual(records);
  });

  it("logs the same triggers, loops, draws, and end through the fold as inline, plus each prompt opened and answered", () => {
    const fold: EngineLogRecord[] = [];
    const replay = replayInteractively(engine, GAME, () => 0, (record) => fold.push(record));
    expect(replay.failure).toBeNull();
    expect(derived(fold)).toEqual(derived(fuzzGameLog(engine, GAME)));
    const opened = fold.flatMap((record) => (record.event === "engine.promptOpened" ? [record.promptId] : []));
    const answered = fold.flatMap((record) => (record.event === "engine.promptAnswered" ? [record.promptId] : []));
    expect(answered.length).toBeGreaterThan(0);
    expect(answered).toEqual(opened);
  });

  it("logs an engine error at the step that threw", () => {
    const first = GAME.actions[0];
    const broken: FuzzGame = { ...GAME, actions: [first, { ...first, action: { kind: "play", card: "i99999", from: "hand" } }] };
    const records = fuzzGameLog(engine, broken);
    expect(records[records.length - 1]).toMatchObject({ event: "engine.error", step: { kind: "play", card: "i99999" } });
  });
});
