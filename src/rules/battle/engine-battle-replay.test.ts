// Replaying a journey battle from the event log (`replayEngineBattle`):
// every applied engine intent's batch is rebuilt to the fold's slice, across
// reloads from a checkpoint, debug undo, LOAD_STATE, a growing log, and
// budgeted steps, and a log that cannot reproduce the fold fails.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalLog, type LocalLog } from "../../eventlog/local-log";
import type { GameEvent } from "../../eventlog/types";
import { createFoldAdapter, type BattleIntent } from "../../engine/fold/slice";
import { stateHash } from "../../engine/state/hash";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { testEventActor } from "../../types/test-identities";
import type { FoldState } from "../fold-state";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import {
  AVATAR_ID,
  BATTLE_SITE_ID,
  FIXTURE_ENGINE,
  FIXTURE_POINTS_MODE,
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "../replay/fixture-providers";
import {
  pendingEnginePrompt,
  replayEngineBattle,
  type EngineBattleReplay,
  type EngineIntentBatch,
} from "./engine-battle";
import { journeyBattleOf } from "./fold";

const GENESIS = {
  seed: "fixture-battle",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
} as const;

function engineOf(state: FoldState) {
  const fold = journeyBattleOf(state.battle)?.engine;
  if (fold === undefined) throw new Error("no engine battle");
  return fold;
}

beforeEach(() => {
  registerReplayFixtureProviders();
});

afterEach(() => {
  clearReplayFixtureProviders();
});

describe("replay from the event log", () => {
  /** An applied intent's batch: its seq, its events' kinds, and the hashes of the states before and after it. */
  type Batch = { readonly seq: number; readonly kinds: readonly string[]; readonly before: string; readonly after: string };
  const derive = (batch: EngineIntentBatch): Batch[] => [
    {
      seq: batch.seq,
      kinds: batch.events.map((event) => event.kind),
      before: stateHash(batch.before),
      after: stateHash(batch.state),
    },
  ];

  /** A local game standing at the fixture battle's first decision; `published` gets each applied intent's events, recomputed from the fold. */
  function game() {
    const log = createLocalLog({ config: GAME_ENGINE_CONFIG, genesis: GENESIS as never, localActor: testEventActor("p1") });
    const published: Batch[] = [];
    const oracle = createFoldAdapter(FIXTURE_ENGINE);
    log.subscribe((record) => {
      const intent = intents.get(record.seq);
      const slice = journeyBattleOf(record.stateBefore.battle)?.engine.slice;
      if (record.outcome !== "applied" || intent === undefined || slice === undefined) return;
      const outcome = oracle.reduce(slice, intent);
      if (outcome.kind !== "applied") return;
      published.push({
        seq: record.seq,
        kinds: outcome.published.map((event) => event.kind),
        before: stateHash(oracle.pending(slice)?.display ?? slice.committed),
        after: stateHash(oracle.pending(outcome.slice)?.display ?? outcome.slice.committed),
      });
    });
    const intents = new Map<number, BattleIntent>();
    const append = (type: string, payload: Record<string, unknown>, intent?: BattleIntent) => {
      const at = log.head() + 1;
      if (intent !== undefined) intents.set(at, intent);
      return log.append({ type: type as GameEvent["type"], payload });
    };
    append("START_JOURNEY", { avatarId: AVATAR_ID });
    append("ENTER_SITE", { siteId: BATTLE_SITE_ID });
    append("BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
    const fold = () => engineOf(log.state());
    /** Plays the first card in hand; its draw-or-points prompt waits. */
    const playCard = () => {
      const card = fold().slice.committed.sides.player.hand[0];
      const action = { kind: "play" as const, card, from: "hand" as const };
      append("BATTLE_ACTION", { side: "player", action }, { kind: "battleAction", side: "player", action });
    };
    const answerPrompt = (value: number) => {
      const promptId = pendingEnginePrompt(log.state().battle, FIXTURE_ENGINE)?.prompt.id;
      if (promptId === undefined) throw new Error("no pending prompt");
      append("BATTLE_ANSWER", { side: "player", promptId, value }, { kind: "answer", side: "player", promptId, value });
    };
    /** Passes for whichever side decides, `count` times. */
    const pass = (count: number) => {
      for (let index = 0; index < count; index++) {
        const side = FIXTURE_ENGINE.decision(fold().slice.committed)?.side ?? "player";
        const action = { kind: "pass" as const };
        append("BATTLE_ACTION", { side, action }, { kind: "battleAction", side, action });
      }
    };
    /** Passes until the player's decision in the player's next turn. */
    const passToPlayer = () => {
      const turn = fold().slice.committed.turn.turnNumber;
      const ready = () => {
        const { committed } = fold().slice;
        return committed.turn.turnNumber > turn && committed.turn.active === "player" && FIXTURE_ENGINE.decision(committed)?.side === "player";
      };
      while (!ready()) pass(1);
    };
    const debug = (op: Record<string, unknown>) => append("BATTLE_DEBUG", { op });
    return { log, published, append, fold, playCard, answerPrompt, pass, passToPlayer, debug };
  }

  const battleOf = (log: LocalLog<FoldState>) => {
    const battle = journeyBattleOf(log.state().battle);
    if (battle === null) throw new Error("no journey battle");
    return battle;
  };

  /** The replay of `log`'s battle, which must reproduce its fold. */
  function replayed(log: LocalLog<FoldState>): EngineBattleReplay<Batch> {
    const progress = replayEngineBattle(FIXTURE_ENGINE, battleOf(log), log.events(), derive);
    if (progress.kind !== "done") throw new Error(`replay ${progress.kind}`);
    return progress.replay;
  }

  /** `log` reopened from a checkpoint at its head, encoded and decoded, with `tail` committed after it. */
  function reopened(log: LocalLog<FoldState>, tail: (log: LocalLog<FoldState>) => void): LocalLog<FoldState> {
    const checkpoint = log.checkpoint();
    const base = { ...checkpoint, state: GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(checkpoint.state)) };
    const history = [...log.events()];
    tail(log);
    return createLocalLog({
      config: GAME_ENGINE_CONFIG,
      genesis: GENESIS as never,
      localActor: testEventActor("p1"),
      base,
      history,
      events: log.events().slice(history.length),
    });
  }

  it("rebuilds every applied intent's events, and the same after a reload mid-prompt from a checkpoint and tail", () => {
    const { log, published, playCard, answerPrompt, pass, passToPlayer } = game();
    passToPlayer();
    playCard();
    expect(pendingEnginePrompt(log.state().battle, FIXTURE_ENGINE)).not.toBeNull();
    const reloaded = reopened(log, () => {
      answerPrompt(0);
      pass(4);
    });

    expect(published.length).toBeGreaterThan(5);
    expect(replayed(log).items).toEqual(published);
    expect(replayed(reloaded).items).toEqual(published);
    expect(replayed(reloaded).slice).toEqual(engineOf(reloaded.state()).slice);
  });

  it("finds the battle's start past a BEGIN_BATTLE that bounced, and keeps the log of a battle that ended", () => {
    const { log, published, append, playCard, answerPrompt, passToPlayer } = game();
    passToPlayer();
    append("BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
    playCard();
    answerPrompt(FIXTURE_POINTS_MODE);

    expect(engineOf(log.state()).slice.committed.result).not.toBeNull();
    expect(replayed(log).items).toEqual(published);
  });

  it("drops the undone intents' entries on a debug undo, after a reload too", () => {
    const { log, published, pass, debug } = game();
    pass(2);
    debug({ kind: "mark" });
    const marked = published.length;
    pass(3);
    debug({ kind: "undo", keep: 1 });
    pass(1);
    const kept = [...published.slice(0, marked), ...published.slice(-1)];

    expect(published.length).toBe(marked + 4);
    expect(replayed(log).items).toEqual(kept);
    expect(replayed(reopened(log, () => undefined)).items).toEqual(kept);
  });

  it("starts a battle a LOAD_STATE loaded from its slice, and undoes to that slice's own history", () => {
    const { log, published, append, pass, passToPlayer, debug } = game();
    passToPlayer();
    const battle = battleOf(log);
    const { history: _history, ...slice } = battle.engine.slice;
    const lab = { ...battle, engine: { ...battle.engine, slice: { ...slice, history: { base: slice, entries: [] } } } };
    const loaded = published.length;
    append("LOAD_STATE", { snapshot: log.state().journey, battle: lab });
    pass(2);
    const afterLoad = published.slice(loaded);

    expect(replayed(log).items).toEqual(afterLoad);
    debug({ kind: "undo", keep: 0 });
    expect(replayed(log).items).toEqual([]);
  });

  it("continues a replay as the log grows and in budgeted steps, to the same result", () => {
    const { log, published, playCard, answerPrompt, pass, passToPlayer } = game();
    passToPlayer();
    const early = replayed(log);
    playCard();
    answerPrompt(0);
    pass(2);
    const continued = replayEngineBattle(FIXTURE_ENGINE, battleOf(log), log.events(), derive, early);
    let stepped = replayEngineBattle(FIXTURE_ENGINE, battleOf(log), log.events(), derive, null, 1);
    while (stepped.kind === "partial") {
      stepped = replayEngineBattle(FIXTURE_ENGINE, battleOf(log), log.events(), derive, stepped.replay, 1);
    }

    expect(continued).toMatchObject({ kind: "done", folded: log.events().length - early.next });
    expect(continued.kind === "done" ? continued.replay.items : null).toEqual(published);
    expect(stepped.kind === "done" ? stepped.replay.items : null).toEqual(published);
  });

  it("fails when no start reproduces the fold's slice", () => {
    const { log, pass } = game();
    pass(2);
    const battle = battleOf(log);
    const events = log.events().slice(0, -1);

    expect(replayEngineBattle(FIXTURE_ENGINE, battle, events, derive).kind).toBe("failed");
    expect(replayEngineBattle(FIXTURE_ENGINE, battle, log.events().slice(0, 2), derive).kind).toBe("failed");
  });
});
