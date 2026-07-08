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
// (mirroring `SiteContentProvider`): the reducer forwards the provider
// `ctx.rng` (the deterministic `(drawIndex) => number` per-event stream) and
// `ctx.timestamp` unchanged, so two clients folding the same `BEGIN_BATTLE`
// build a byte-identical battle. `END_BATTLE` needs no async content — its
// bookkeeping is pure quest-state math and lives entirely here.
//
// Cards / dreamcallers are keyed by UUID and deck entries by entry-id — never
// by name (AGENTS.md).

import type { EventContext } from "../../eventlog/types";
import type {
  BattleEngineEmissionContext,
  BattleInit,
  BattleMutableState,
  BattleResult,
  BattleSide,
} from "../../battle/types";
import type { BattleCommand, BattleDebugEdit } from "../../battle/debug/commands";
import type {
  BattleModifier,
  QuestFailureBattleResult,
  QuestFailureReason,
  QuestFailureSummary,
  QuestState,
  Screen,
} from "../../types/quest";
import type { FoldState } from "../fold-state";
import { applyDebugEdit, forceBattleResult } from "./apply-debug-edit";
import {
  collectDawnTriggerEdits,
  dawnScriptIsInteractive,
  planSupportRecompute,
  selectBattleCardEffectScript,
} from "./battle-card-effects-table";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import { advanceEffectQueue } from "./driver";
import { dawnClearEdits } from "../../battle/engine/handoff";
import { alliesInPlay } from "./effect-step";
import {
  collectMaterializedRuns,
  inPlayInstanceIds,
  newEffectRun,
  type BattleFoldState,
  type EffectRun,
} from "./fold";

// ---------------------------------------------------------------------------
// Battle-init provider seam (BEGIN_BATTLE construction)
// ---------------------------------------------------------------------------

/**
 * The deterministic construction `BEGIN_BATTLE` needs to turn quest state into
 * a fresh {@link BattleFoldState}. The reducer resolves double-begin itself,
 * then delegates the immutable `init` (`BattleInit`) plus board / dreamcaller /
 * opponent-deck construction — which reads async-loaded card, dreamcaller, and
 * dreamwell data — to this provider, forwarding it `ctx.rng` (the per-event
 * `(drawIndex) => number` stream) and `ctx.timestamp` unchanged so two clients
 * folding the same event produce byte-identical battles.
 *
 * SEAM (Task 26): real content registration is deferred to the integration task
 * that wires the reducer into src/coop/ and relocates the legacy
 * `createBattleInit` / `createInitialBattleState` construction behind this seam,
 * drawing every card from the injected `rng` instead of `Math.random` and every
 * timestamp from `timestamp` instead of `new Date()`. Until a provider is
 * registered, `BEGIN_BATTLE` bounces (a recorded no-op, never a throw).
 *
 * DETERMINISM INVARIANT (Task 26 must enforce): like `SiteContentProvider`,
 * this provider must be registered IDENTICALLY on every client before
 * `BEGIN_BATTLE` is enabled. If one client has a provider and another does not
 * — or they build different init from the same rng — one client APPLIES the
 * battle while the other BOUNCES, diverging their folds. Registration is a
 * global fact of the deployed build, not per-client state.
 */
export interface BattleInitProvider {
  /**
   * Build the initial {@link BattleFoldState} for `siteId` deterministically
   * from `(quest, rng, timestamp)`, or `null` to bounce (e.g. the site is not a
   * battle, or its content is unavailable). Must not mutate `quest`. The result
   * must populate the immutable `init` (`BattleInit`) and set `effectQueue: []`
   * and `pendingPrompt: null`.
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
    return applyDefeat(state, state.battle);
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
function applyDefeat(state: FoldState, battle: BattleFoldState): FoldState {
  const quest = state.quest;
  return {
    ...state,
    quest: {
      ...quest,
      failureSummary: deriveFailureSummary(battle.init, battle.board, quest),
      screen: { type: "questFailed" },
    },
    battle: null,
  };
}

/**
 * Derive the failure summary from the immutable battle `init`, the terminal
 * `board`, and the quest slice. `battleId`, `turnNumber`, and both scores come
 * from the board; `dreamscapeIdOrNone` comes from the active quest position;
 * the win / turn-limit thresholds come from `init`.
 *
 * The failure `reason` mirrors the battle result evaluation:
 *   - a `forcedResult` (FORCE_RESULT / SKIP_TO_REWARDS) → `forced_result`;
 *   - otherwise a turn count at/over `init.turnLimit` with the player still
 *     short of `init.scoreToWin` → `turn_limit_reached`;
 *   - otherwise `score_target_reached`.
 *
 * SEAM (Task 27, UI): `siteLabel` is a display string that needs async site
 * content the pure reducer cannot reach (it is not on `BattleInit`), so it
 * defaults to the `siteId`; the UI resolves the human-facing label when it
 * renders the `questFailed` screen.
 */
function deriveFailureSummary(
  init: BattleInit,
  board: BattleMutableState,
  quest: QuestState,
): QuestFailureSummary {
  const result: QuestFailureBattleResult =
    board.result === "draw" ? "draw" : "defeat";
  let reason: QuestFailureReason;
  if (board.forcedResult !== null) {
    reason = "forced_result";
  } else if (
    board.turnNumber >= init.turnLimit &&
    board.sides.player.score < init.scoreToWin
  ) {
    reason = "turn_limit_reached";
  } else {
    reason = "score_target_reached";
  }
  const siteId = quest.activeSiteId ?? init.siteId;
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

// ---------------------------------------------------------------------------
// BATTLE_COMMAND
// ---------------------------------------------------------------------------

// The emission context is a display/log concern only — `applyDebugEdit` and
// `forceBattleResult` never read it when mutating state (they thread it solely
// into log-event / transition builders, which the pure fold discards). So a
// fixed constant keeps the fold's state output independent of it.
const EMISSION: BattleEngineEmissionContext = {
  sourceSurface: "auto-system",
  selectedCardId: null,
};

/**
 * `BATTLE_COMMAND { command }`: the single synchronous fold step that replaces
 * the orchestration of both effect-runner hooks (`use-battle-effect-runner.ts`,
 * `use-dreamwell-effect-runner.ts`) and the force-result routing of the legacy
 * `battleReducer` (`src/battle/state/reducer.ts`). It applies ONE command's edit
 * and, in the SAME step, fires every trigger that edit exposes, so a single
 * event in yields a fully-triggered state out — two clients folding the same
 * (seed, seq) converge byte-for-byte.
 *
 * In order (design spec §Battle events):
 *   1. Apply the command (`DEBUG_EDIT` → `applyDebugEdit`; `FORCE_RESULT` /
 *      `SKIP_TO_REWARDS` → `forceBattleResult`, mirroring legacy
 *      `applyBattleCommand`/`battleReducer`).
 *   2. ▸Materialized: diff the in-play instance-id set before/after this single
 *      edit; each newly-present id with a registered `"materialized"` script
 *      pushes an `EffectRun` (FIFO in `inPlayInstanceIds` order — back rank then
 *      front rank, player then enemy).
 *   3. ▸Dawn: when the edit ADVANCED the phase into Dawn (`phase` was not `dawn`
 *      and now is), on a turn that has a Dawn (`turnNumber > 1`), apply the
 *      deterministic Dawn edits (`dawnClearEdits` + `collectDawnTriggerEdits`)
 *      and queue any interactive Dawn scripts. The "entered dawn" EDGE is the
 *      once-per-(side, turn) guard: a turn enters Dawn exactly once, and
 *      re-issuing a Dawn phase edit while already in Dawn is a no-op edge, so no
 *      stored processed-set is needed (the deleted hook's `processedInteractive
 *      Dawn` key becomes a pure edge test on committed state).
 *   4. Dreamwell: when this edit LANDED the active side's Dreamwell reveal
 *      (`dreamwellDrawnTurn` transitioned to `turnNumber`) during the
 *      `"dreamwell"` phase on `turnNumber > 1`, queue the revealed card's script
 *      — the card at `init.dreamwellDeck[dreamwellCardIndex]` (now reachable via
 *      `init`). The reveal edge is the once-per-turn guard (the deleted runner's
 *      `lastRunKey`).
 *   5. Support: run `planSupportRecompute` unconditionally and apply its edits —
 *      it is diff-based and idempotent, so an immediate re-recompute yields `[]`.
 *   6. `advanceEffectQueue` until a prompt is pending or the queue empties.
 *
 * Returns the next {@link FoldState}, or `null` to bounce when there is no
 * battle, a prompt is already pending (root rule 4 also gates this; the guard is
 * defensive), or the command payload is malformed.
 *
 * A SINGLE `drawIndex` counter is threaded across the whole step: the Dawn (3)
 * and Support (5) edits draw from `random`, then `advanceEffectQueue` (6)
 * continues the SAME logical stream via an offset `ctx.rng` so no two
 * independent draws collide on the same index. `nowMs` is `ctx.timestamp`
 * throughout (no live clock), honoring the src/rules/ lint rails.
 */
export function battleCommand(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  const battle = state.battle;
  if (battle === null) {
    return null;
  }
  if (battle.pendingPrompt !== null) {
    return null;
  }
  const command = coerceBattleCommand(payload.command);
  if (command === null) {
    return null;
  }

  const nowMs = Date.parse(ctx.timestamp);
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);

  // Step 1 — apply the command's edit.
  const boardBefore = battle.board;
  const boardAfter = applyCommandToBoard(boardBefore, command);

  const queue: EffectRun[] = [...battle.effectQueue];

  // Step 2 — ▸Materialized: newly-present in-play ids with a materialized script.
  // Only the COMMAND edit is applied here (the driver applies queued dispatches),
  // so this detects materialization caused by the command edit itself. Cascades
  // from queued scripts' edits are detected inside the driver's drain (fold.ts
  // `collectMaterializedRuns` is called around each dispatch), so a card fires
  // exactly once regardless of which layer moved it into play.
  const inPlayBefore = new Set(inPlayInstanceIds(boardBefore));
  queue.push(...collectMaterializedRuns(inPlayBefore, boardAfter));

  let board = boardAfter;

  // Step 3 — ▸Dawn bookend + interactive Dawn on the "entered dawn" edge.
  const enteredDawn = boardBefore.phase !== "dawn" && boardAfter.phase === "dawn";
  if (enteredDawn && boardAfter.turnNumber > 1 && boardAfter.result === null) {
    const side = boardAfter.activeSide;
    board = applyBoardEdits(board, [
      ...dawnClearEdits(board, side),
      ...collectDawnTriggerEdits(board, side, random, nowMs),
    ]);
    for (const run of collectInteractiveDawnRuns(board, side)) {
      queue.push(run);
    }
  }

  // Step 4 — Dreamwell reveal → queue the revealed card's script.
  const revealSide = boardAfter.activeSide;
  const revealLanded =
    boardBefore.sides[revealSide].dreamwellDrawnTurn !== boardAfter.turnNumber &&
    boardAfter.sides[revealSide].dreamwellDrawnTurn === boardAfter.turnNumber;
  if (
    revealLanded &&
    boardAfter.phase === "dreamwell" &&
    boardAfter.turnNumber > 1 &&
    boardAfter.result === null
  ) {
    const index = boardAfter.sides[revealSide].dreamwellCardIndex;
    if (index !== null) {
      const card = battle.init.dreamwellDeck[index];
      if (card !== undefined) {
        const script = selectDreamwellEffectScript(card.id);
        if (script !== null && script.steps.length > 0) {
          queue.push(newEffectRun({ table: "dreamwell", id: card.id }, revealSide));
        }
      }
    }
  }

  // Step 5 — Support recompute (idempotent; unconditional).
  board = applyBoardEdits(board, planSupportRecompute(board, true, random, nowMs));

  // Step 6 — advance the queue, continuing the SAME draw counter.
  const queueCtx: EventContext = { ...ctx, rng: (index) => ctx.rng(drawIndex + index) };
  const advanced = advanceEffectQueue(
    { init: battle.init, board, effectQueue: queue, pendingPrompt: null },
    queueCtx,
  );
  return { ...state, battle: advanced };
}

/**
 * The interactive ▸Dawn runs for `side`'s in-play characters whose registered
 * `"dawn"` script needs player input (`dawnScriptIsInteractive`). Deterministic
 * Dawn scripts are NOT returned — their edits already ran in the bookend
 * (`collectDawnTriggerEdits`). Iteration follows `alliesInPlay` order (back rank
 * then front rank) for a deterministic queue. Relocates the deleted
 * `collectInteractiveDawnRuns` from `use-battle-effect-runner.ts`.
 */
function collectInteractiveDawnRuns(
  state: BattleMutableState,
  side: BattleSide,
): EffectRun[] {
  const runs: EffectRun[] = [];
  for (const id of alliesInPlay(state, side)) {
    const instance = state.cardInstances[id];
    if (instance === undefined) {
      continue;
    }
    const script = selectBattleCardEffectScript(instance.definition.cardId);
    if (script === null || script.trigger !== "dawn" || script.steps === undefined) {
      continue;
    }
    if (!dawnScriptIsInteractive(script)) {
      continue;
    }
    runs.push(newEffectRun({ table: "battle", id: instance.definition.cardId }, side, id));
  }
  return runs;
}

/** Applies the command's board mutation, routing the three command ids the way
 *  legacy `applyBattleCommand`/`battleReducer` did (SKIP_TO_REWARDS aliases a
 *  forced victory). */
function applyCommandToBoard(
  board: BattleMutableState,
  command: BattleCommand,
): BattleMutableState {
  switch (command.id) {
    case "DEBUG_EDIT":
      return applyDebugEdit(board, command.edit, EMISSION).state;
    case "FORCE_RESULT":
      return forceBattleResult(board, command.result, EMISSION).state;
    case "SKIP_TO_REWARDS":
      return forceBattleResult(board, "victory", EMISSION).state;
  }
}

/** Applies each deterministic edit in order via `applyDebugEdit`. */
function applyBoardEdits(
  board: BattleMutableState,
  edits: BattleDebugEdit[],
): BattleMutableState {
  let next = board;
  for (const edit of edits) {
    next = applyDebugEdit(next, edit, EMISSION).state;
  }
  return next;
}

/**
 * Validates a raw `payload.command` into a {@link BattleCommand}, or `null` to
 * bounce a malformed intent. Only the discriminants needed to route safely are
 * checked; an unknown `edit.kind` still bounces because `applyDebugEdit` returns
 * no state for it and the root reducer's try/catch converts the resulting throw
 * into a recorded no-op.
 */
function coerceBattleCommand(raw: unknown): BattleCommand | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const id = (raw as { id?: unknown }).id;
  if (id === "DEBUG_EDIT") {
    const edit = (raw as { edit?: unknown }).edit;
    if (typeof edit !== "object" || edit === null) {
      return null;
    }
    if (typeof (edit as { kind?: unknown }).kind !== "string") {
      return null;
    }
    return raw as BattleCommand;
  }
  if (id === "FORCE_RESULT") {
    const result = (raw as { result?: unknown }).result;
    if (!isBattleResult(result)) {
      return null;
    }
    return raw as BattleCommand;
  }
  if (id === "SKIP_TO_REWARDS") {
    return raw as BattleCommand;
  }
  return null;
}

function isBattleResult(value: unknown): value is BattleResult {
  return value === "victory" || value === "defeat" || value === "draw";
}
