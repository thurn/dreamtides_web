// Journey-log records for a local game. Each committed event becomes one
// `game_event` line carrying the log's own seq, plus an `event_bounced` or
// `fold_error` line when it did not apply, so a game's flow can be rebuilt
// from `logs/journey-log.jsonl` (development) by seq. Lines carry UUIDs and
// seqs, never names.

import { settleDeferredOpponentLog } from "../coop/providers/battle-init-provider";
import type { LocalLogRecord } from "../eventlog/local-log";
import {
  clearLogContext,
  createJourneyLogMirror,
  logEvent,
  setLogContext,
  type JourneyLogMirror,
} from "../logging";
import type { FoldState } from "../rules/fold-state";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { LocalGame } from "./local-game";

const INVARIANT_CODE_PATTERN = /(?:Fold invariant violation: |; )([a-z0-9_]+) \(/g;

/**
 * Logs `game` while attached: stamps its id onto every `logEvent` entry and
 * mirrors one record per committed event. Returns the detach function.
 */
export function attachGameLog(
  game: LocalGame<FoldState>,
  mirror: JourneyLogMirror = createJourneyLogMirror(),
): () => void {
  const { gameId } = game;
  setLogContext({ gameId });
  logEvent("local_game_opened", {
    localPlayerId: game.localPlayerId,
    reducerVersion: game.genesis.reducerVersion,
    head: game.log.head(),
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
    init.dreamscapeId === null
      ? undefined
      : before.journey.atlas.nodes[init.dreamscapeId];
  const availableForwardIds = (completedNode?.forwardIds ?? []).filter(
    (nodeId) => after.journey.atlas.nodes[nodeId]?.state === "available",
  );
  logEvent("battle_victory_committed", {
    gameSeq: seq,
    battleId: init.battleId,
    siteId: init.siteId,
    dreamscapeId: init.dreamscapeId,
    essenceReward: init.essenceReward,
    essenceBefore: before.journey.essence,
    essenceAfter: after.journey.essence,
    completionLevelBefore: before.journey.completionLevel,
    completionLevelAfter: after.journey.completionLevel,
    completedNodeState:
      init.dreamscapeId === null
        ? null
        : (after.journey.atlas.nodes[init.dreamscapeId]?.state ?? null),
    availableForwardIds,
    availableForwardDreamscapeIds: availableForwardIds.map(
      (nodeId) => after.journey.atlas.nodes[nodeId]?.dreamscapeId ?? null,
    ),
  });
}
