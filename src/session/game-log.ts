// Journey-log records for a local game. Each committed event becomes one
// `game_event` line carrying the log's own seq, plus an `event_bounced` or
// `fold_error` line when it did not apply, so a game's flow can be rebuilt
// from `logs/journey-log.jsonl` (development) or the game's exported log
// (every build) by seq. Lines carry UUIDs and seqs, never names.

import { settleDeferredOpponentLog } from "./providers/battle-init-provider";
import type { LocalLogRecord } from "../eventlog/local-log";
import {
  clearLogContext,
  createJourneyLogMirror,
  logEvent,
  setJourneyLogCapture,
  setLogContext,
  type JourneyLogMirror,
} from "../logging";
import type { FoldState } from "../rules/fold-state";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { LocalGame } from "./local-game";

const INVARIANT_CODE_PATTERN = /(?:Fold invariant violation: |; )([a-z0-9_]+) \(/g;

export interface AttachGameLogOptions {
  /** Journey-log transports for the event records. */
  mirror?: JourneyLogMirror;
  /** Receives every journey-log record while attached, for the game's stored log. */
  capture?: JourneyLogMirror;
  /** How the game was selected, for the `local_game_opened` entry. */
  selection?: LocalGameSelection;
}

/**
 * How a tab came to open a game: `created` new, `opened` by its `?game=` id,
 * or `resumed` as the most recent stored game.
 */
export type LocalGameSelection = "created" | "opened" | "resumed";

/**
 * Logs `game` while attached: stamps its id onto every `logEvent` entry,
 * mirrors one record per committed event, and hands every journey-log record
 * to `capture`. Returns the detach function.
 */
export function attachGameLog(
  game: LocalGame<FoldState>,
  {
    mirror = createJourneyLogMirror(),
    capture,
    selection,
  }: AttachGameLogOptions = {},
): () => void {
  const { gameId } = game;
  setLogContext({ gameId });
  setJourneyLogCapture(capture ?? null);
  logEvent("local_game_opened", {
    localPlayerId: game.localPlayerId,
    reducerVersion: game.genesis.reducerVersion,
    head: game.log.head(),
    ...(selection === undefined ? {} : { selection }),
    ...game.opened,
  });

  const unsubscribe = game.log.subscribe(
    (record: LocalLogRecord<FoldState>) => {
      const { seq, event, outcome } = record;
      mirror({
        event: "game_event",
        timestamp: event.clientTimestamp,
        gameId,
        seq,
        type: event.type,
        actor: event.actor,
        outcome,
        ...(event.intentKey === undefined ? {} : { intentKey: event.intentKey }),
      });
      if (outcome === "bounced") {
        mirror({
          event: "event_bounced",
          timestamp: event.clientTimestamp,
          gameId,
          seq,
          bounceReason: record.bounceReason ?? "invalid_action",
        });
      }
      if (record.error !== undefined) {
        const { message, stack } = record.error;
        mirror({
          event: "fold_error",
          timestamp: event.clientTimestamp,
          gameId,
          seq,
          type: event.type,
          actor: event.actor,
          intentKey: event.intentKey ?? null,
          message,
          invariantCodes: [...message.matchAll(INVARIANT_CODE_PATTERN)].map(
            (match) => match[1],
          ),
          stack: stack ?? null,
          stateHashBefore: GAME_ENGINE_CONFIG.hash(record.stateBefore),
          stateHashAfter: GAME_ENGINE_CONFIG.hash(record.stateAfter),
        });
        console.error("Game fold error", record.error);
      }
      if (event.type === "BEGIN_BATTLE") {
        settleDeferredOpponentLog(seq, outcome === "applied");
      }
      if (outcome === "applied" && event.type === "END_BATTLE") {
        logBattleVictory(seq, record.stateBefore, record.stateAfter);
      }
    },
  );

  return () => {
    unsubscribe();
    clearLogContext();
    setJourneyLogCapture(null);
  };
}

function logBattleVictory(
  seq: number,
  before: FoldState,
  after: FoldState,
): void {
  if (before.battle?.board.result !== "victory") return;
  const init = before.battle.init;
  const completedNode =
    init.nodeId === null
      ? undefined
      : before.journey.atlas.nodes[init.nodeId];
  const availableForwardIds = (completedNode?.forwardIds ?? []).filter(
    (nodeId) => after.journey.atlas.nodes[nodeId]?.state === "available",
  );
  logEvent("battle_victory_committed", {
    gameSeq: seq,
    battleId: init.battleId,
    siteId: init.siteId,
    dreamscapeId: init.nodeId,
    essenceReward: init.essenceReward,
    essenceBefore: before.journey.essence,
    essenceAfter: after.journey.essence,
    completionLevelBefore: before.journey.completionLevel,
    completionLevelAfter: after.journey.completionLevel,
    completedNodeState:
      init.nodeId === null
        ? null
        : (after.journey.atlas.nodes[init.nodeId]?.state ?? null),
    availableForwardIds,
    availableForwardDreamscapeIds: availableForwardIds.map(
      (nodeId) => after.journey.atlas.nodes[nodeId]?.dreamscapeId ?? null,
    ),
  });
}
