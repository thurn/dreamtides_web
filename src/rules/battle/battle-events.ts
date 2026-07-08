// The `BEGIN_BATTLE` and `END_BATTLE` battle-lifecycle reducer cases.
//
// These are the two events that create and tear down the in-battle fold slice
// (`FoldState.battle`). They relocate the DOMAIN LOGIC of the legacy battle
// bridges into pure functions of `(state, payload[, ctx])`; the legacy
// transaction / actionLog / React wrappers are engine concerns handled by the
// eventlog engine and the root reducer, so they are dropped here.
//
//   - `BEGIN_BATTLE { siteId }` relocates `ensureBattleSession`'s init
//     construction (src/multiplayer/battle-service.ts) and its
//     `use-ensure-battle-session.ts` caller. "Battle has begun" becomes a
//     derivable fact of the log: the state carries the battle, so a reload
//     lands on the right screen with no client-local `begunEntryKey` latch and
//     no ensure-race. It bounces when a battle is already in progress.
//   - `END_BATTLE { result }` relocates `incrementCompletionLevel` (victory)
//     and the `setFailureSummary` battle-defeat path
//     (src/state/multiplayer-quest-context.tsx), plus the
//     `setCurrentDreamscape(null)` battle-completion bridge. It bounces when no
//     battle exists.
//
// The src/rules/ lint rails forbid Firebase, React, and any live clock/rng.
// Battle init reads TOML-sourced card / deck / dreamcaller data that only loads
// asynchronously, which the pure reducer cannot statically reach, so its
// construction is delegated to the injectable {@link BattleInitProvider} seam
// (mirroring `SiteContentProvider`): the reducer hands the provider a
// deterministic `(drawIndex) => number` rng derived from `ctx.rng` plus
// `ctx.timestamp`, so two clients folding the same `BEGIN_BATTLE` build a
// byte-identical battle. `END_BATTLE` needs no async content — its bookkeeping
// is pure quest-state math and lives entirely here.
//
// Cards / dreamcallers are keyed by UUID and deck entries by entry-id — never
// by name (AGENTS.md).

import type { EventContext } from "../../eventlog/types";
import type { BattleMutableState } from "../../battle/types";
import type {
  BattleModifier,
  QuestFailureBattleResult,
  QuestFailureReason,
  QuestFailureSummary,
  QuestState,
  Screen,
} from "../../types/quest";
import type { FoldState } from "../fold-state";
import type { BattleFoldState } from "./fold";

// ---------------------------------------------------------------------------
// Battle-init provider seam (BEGIN_BATTLE construction)
// ---------------------------------------------------------------------------

/**
 * The deterministic construction `BEGIN_BATTLE` needs to turn quest state into
 * a fresh {@link BattleFoldState}. The reducer resolves double-begin itself,
 * then delegates the board / dreamcaller / opponent-deck construction — which
 * reads async-loaded card, dreamcaller, and dreamwell data — to this provider,
 * handing it a deterministic rng derived from `ctx.rng` and `ctx.timestamp` so
 * two clients folding the same event produce byte-identical battles.
 *
 * SEAM (Task 26): real content registration is deferred to the integration task
 * that wires the reducer into src/coop/ and relocates the legacy
 * `createBattleInit` / `createInitialBattleState` construction behind this seam,
 * drawing every card from the injected `rng` instead of `Math.random` and every
 * timestamp from `timestamp` instead of `new Date()`. Until a provider is
 * registered, `BEGIN_BATTLE` bounces (a recorded no-op, never a throw).
 */
export interface BattleInitProvider {
  /**
   * Build the initial {@link BattleFoldState} for `siteId` deterministically
   * from `(quest, rng, timestamp)`, or `null` to bounce (e.g. the site is not a
   * battle, or its content is unavailable). Must not mutate `quest`. The result
   * must set `effectQueue: []` and `pendingPrompt: null`.
   */
  beginBattle(input: {
    quest: QuestState;
    siteId: string;
    rng: (drawIndex: number) => number;
    timestamp: string;
  }): BattleFoldState | null;
}

let battleInitProvider: BattleInitProvider | null = null;

/**
 * Register (or clear, with `null`) the deterministic battle-init provider
 * `BEGIN_BATTLE` delegates its construction to. Idempotent; the last
 * registration wins.
 */
export function registerBattleInitProvider(
  provider: BattleInitProvider | null,
): void {
  battleInitProvider = provider;
}

/** The currently registered provider, or `null` when none is wired. */
export function getBattleInitProvider(): BattleInitProvider | null {
  return battleInitProvider;
}

// ---------------------------------------------------------------------------
// BEGIN_BATTLE
// ---------------------------------------------------------------------------

/**
 * `BEGIN_BATTLE { siteId }`: construct the in-battle fold slice deterministically
 * from quest state. Returns the next {@link FoldState} on success, or `null` to
 * bounce when:
 *   - a battle is already in progress (`state.battle !== null`) — the
 *     ensure-race / `begunEntryKey` guard, now a pure derivable check;
 *   - the payload is malformed (missing/blank `siteId`);
 *   - no provider is registered (the Task 26 seam is not yet wired); or
 *   - the provider declines (non-battle site / unavailable content).
 */
export function beginBattle(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  if (state.battle !== null) {
    return null;
  }
  const siteId = payload.siteId;
  if (typeof siteId !== "string" || siteId.length === 0) {
    return null;
  }
  const provider = battleInitProvider;
  if (provider === null) {
    return null;
  }
  const battle = provider.beginBattle({
    quest: state.quest,
    siteId,
    rng: ctx.rng,
    timestamp: ctx.timestamp,
  });
  if (battle === null) {
    return null;
  }
  return { ...state, battle };
}

// ---------------------------------------------------------------------------
// END_BATTLE
// ---------------------------------------------------------------------------

/** The completion level at which a run finishes and routes to the end screen. */
const FINAL_COMPLETION_LEVEL = 7;

/**
 * `END_BATTLE { result }`: fold a victory or defeat into quest state and clear
 * the battle slice. Returns the next {@link FoldState}, or `null` to bounce when
 * no battle exists or `result` is not a recognized outcome.
 */
export function endBattle(
  state: FoldState,
  payload: Record<string, unknown>,
): FoldState | null {
  if (state.battle === null) {
    return null;
  }
  const result = payload.result;
  if (result === "victory") {
    return applyVictory(state);
  }
  if (result === "defeat") {
    return applyDefeat(state, state.battle.board);
  }
  return null;
}

/**
 * Victory bookkeeping (legacy `incrementCompletionLevel` + the
 * `setCurrentDreamscape(null)` battle-completion bridge): bump the completion
 * level, route to the post-battle screen, decrement each battle modifier and
 * drop those that reach zero — removing any temporary-bane deck entries a
 * dropped modifier introduced — and clear the current dreamscape. The battle
 * slice is torn down.
 */
function applyVictory(state: FoldState): FoldState {
  const quest = state.quest;
  const newLevel = quest.completionLevel + 1;
  const screen: Screen =
    newLevel >= FINAL_COMPLETION_LEVEL
      ? { type: "questComplete" }
      : { type: "atlas" };

  const droppedBaneEntryIds = new Set<string>();
  const battleModifiers: BattleModifier[] = [];
  for (const modifier of quest.battleModifiers) {
    const battlesRemaining = modifier.battlesRemaining - 1;
    if (battlesRemaining <= 0) {
      if (modifier.kind === "temporary_bane_grant") {
        for (const entryId of modifier.addedEntryIds) {
          droppedBaneEntryIds.add(entryId);
        }
      }
      continue;
    }
    battleModifiers.push({ ...modifier, battlesRemaining });
  }
  const deck =
    droppedBaneEntryIds.size === 0
      ? quest.deck
      : quest.deck.filter((entry) => !droppedBaneEntryIds.has(entry.entryId));

  return {
    ...state,
    quest: {
      ...quest,
      completionLevel: newLevel,
      screen,
      battleModifiers,
      deck,
      currentDreamscape: null,
    },
    battle: null,
  };
}

/**
 * Defeat bookkeeping (legacy `setFailureSummary` battle-defeat path): freeze a
 * {@link QuestFailureSummary} from the battle board + quest slice, route to the
 * `questFailed` screen, and tear down the battle slice.
 */
function applyDefeat(state: FoldState, board: BattleMutableState): FoldState {
  const quest = state.quest;
  return {
    ...state,
    quest: {
      ...quest,
      failureSummary: deriveFailureSummary(board, quest),
      screen: { type: "questFailed" },
    },
    battle: null,
  };
}

/**
 * Derive the failure summary from the terminal battle board and the quest
 * slice. `battleId`, `turnNumber`, and both scores come from the board; the
 * `siteId` / `dreamscapeIdOrNone` come from the active quest position.
 *
 * SEAM (Task 27, UI): `siteLabel` is a display string that needs async site
 * content the pure reducer cannot reach, so it defaults to the `siteId`; the UI
 * resolves the human-facing label when it renders the `questFailed` screen. The
 * failure `reason` is inferred structurally (`forcedResult` present →
 * `forced_result`, otherwise `score_target_reached`) because the fold board
 * does not carry the battle's turn limit.
 */
function deriveFailureSummary(
  board: BattleMutableState,
  quest: QuestState,
): QuestFailureSummary {
  const result: QuestFailureBattleResult =
    board.result === "draw" ? "draw" : "defeat";
  const reason: QuestFailureReason =
    board.forcedResult !== null ? "forced_result" : "score_target_reached";
  const siteId = quest.activeSiteId ?? "";
  return {
    battleId: board.battleId,
    result,
    reason,
    siteId,
    siteLabel: siteId,
    dreamscapeIdOrNone: quest.currentDreamscape,
    turnNumber: board.turnNumber,
    playerScore: board.sides.player.score,
    enemyScore: board.sides.enemy.score,
  };
}
