// The `BEGIN_BATTLE` and `END_BATTLE` battle-lifecycle reducer cases.
//
// These are the two events that create and tear down the in-battle fold slice
// (`FoldState.battle`). They express the battle-lifecycle DOMAIN LOGIC as pure
// functions of `(state, payload[, ctx])`; transaction / log-append / React
// concerns are handled by the eventlog engine and the root reducer.
//
//   - `BEGIN_BATTLE { siteId }` builds the deterministic in-battle init.
//     "Battle has begun" is a derivable fact of the log: the state carries the
//     battle, so a reload lands on the right screen from fold state alone. It
//     bounces when a battle is already in progress.
//   - `END_BATTLE { result }` performs the completion-level bump (victory), the
//     failure-summary defeat path, and the `setCurrentDreamscape(null)`
//     battle-completion bookkeeping. It bounces when no battle exists.
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
import { isoTimestampToMs } from "./timestamp";
import type {
  BattleCardNoteExpiry,
  BattleEngineEmissionContext,
  BattleFieldSlotAddress,
  BattlePhase,
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
  planSupportRecompute,
} from "./battle-card-effects-table";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import {
  advanceEffectQueueWithStream,
  resolvePendingPromptWithStream,
} from "./driver";
import type { PromptResolution } from "./effect-runner-core";
import { dawnClearEdits } from "../../battle/engine/handoff";
import { forwardModelFromState } from "../../battle/ai/forward-model";
import { planDefense } from "../../battle/ai/defense";
import { actionToCommands } from "../../battle/ai/driver";
import { buildTrace } from "../../battle/ai/trace";
import { planBasicAutomationCommands } from "./basic-automation";
import {
  newEffectRun,
  type BattleFoldState,
  type EffectRun,
  type PendingPrompt,
} from "./fold";

// ---------------------------------------------------------------------------
// Battle-init provider seam (BEGIN_BATTLE construction)
// ---------------------------------------------------------------------------

/**
 * The deterministic construction `BEGIN_BATTLE` needs to turn quest state into
 * a fresh {@link BattleFoldState}. The reducer resolves double-begin itself,
 * then delegates the immutable `init` (`BattleInit`) plus board / dreamcaller /
 * opponent-deck construction — which reads async-loaded card, dreamcaller, and
 * dreamwell data — to this provider.
 *
 * The registered provider (`createBattleInitProvider`) constructs the battle
 * deterministically from folded quest state: `createBattleInit` derives all of
 * its randomness from a `BattleRng` stream keyed by
 * `deriveBattleSeed(quest.seed:battleEntryKey)`, and `createInitialBattleState`
 * is pure. That seed comes straight from the folded quest, so every client on
 * the room builds a byte-identical battle from the same quest seed and site.
 * Until a provider is registered, `BEGIN_BATTLE` bounces (a recorded no-op,
 * never a throw).
 *
 * DETERMINISM INVARIANT: like `SiteContentProvider`, this provider must be
 * registered IDENTICALLY on every client before `BEGIN_BATTLE`, which the app
 * does at bootstrap via `registerGameProviders`. If one client has a provider
 * and another does not, one client APPLIES the battle while the other BOUNCES,
 * diverging their folds. Registration is a global fact of the deployed build,
 * not per-client state.
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
    seedOverride: number | null;
    seq: number;
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
 * `BEGIN_BATTLE { siteId, seedOverride? }`: construct the in-battle fold slice deterministically
 * from quest state. Returns the next {@link FoldState} on success, or `null` to
 * bounce when:
 *   - a battle is already in progress (`state.battle !== null`) — a pure
 *     derivable check on fold state;
 *   - the payload is malformed (missing/blank `siteId`);
 *   - no provider is registered; or
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
  const rawSeedOverride = payload.seedOverride;
  const seedOverride = rawSeedOverride === undefined || rawSeedOverride === null
    ? null
    : typeof rawSeedOverride === "number"
      && Number.isSafeInteger(rawSeedOverride)
      && rawSeedOverride >= 0
      ? rawSeedOverride
      : null;
  if (rawSeedOverride !== undefined && rawSeedOverride !== null && seedOverride === null) {
    return null;
  }
  const provider = battleInitProvider;
  if (provider === null) {
    return null;
  }
  const battle = provider.beginBattle({
    quest: state.quest,
    siteId,
    seedOverride,
    seq: ctx.seq,
    rng: ctx.rng,
    timestamp: ctx.timestamp,
  });
  if (battle === null) {
    return null;
  }
  return {
    ...state,
    battle: { ...battle, basicAutomationEnabled: true },
  };
}

/** Keeps automation enabled when folding persisted automation-setting events. */
export function setBattleAutomation(
  state: FoldState,
  payload: Record<string, unknown>,
): FoldState | null {
  if (state.battle === null || typeof payload.enabled !== "boolean") {
    return null;
  }
  return {
    ...state,
    battle: { ...state.battle, basicAutomationEnabled: true },
  };
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
 * Victory bookkeeping: bump the completion level, route to the post-battle
 * screen, clear the current dreamscape, decrement each battle modifier and
 * drop those that reach zero — removing any temporary-bane deck entries a
 * dropped modifier introduced. The battle slice is torn down.
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
 * Defeat bookkeeping: freeze a
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

/** Both battle sides, in the fixed order the per-side reveal check iterates. */
const BATTLE_SIDES: readonly BattleSide[] = ["player", "enemy"];

/**
 * Folds ONE battle command through the full per-command trigger pipeline against
 * `battle`, returning the next {@link BattleFoldState} or `null` to bounce when a
 * prompt is already pending (root rule 4 also gates this; the guard is
 * defensive). The `seq`/`random`/`nowMs` are supplied by the caller so a SINGLE
 * continuing draw counter can span several commands folded in one event (a
 * `BATTLE_GESTURE`) without two commands colliding on an rng index.
 *
 * In order (design spec §Battle events):
 *   1. Apply the command (`DEBUG_EDIT` → `applyDebugEdit`; `FORCE_RESULT` /
 *      `SKIP_TO_REWARDS` → `forceBattleResult`).
 *   2. Dawn: when the edit advances into Dawn or hands off to a new active side,
 *      clear that side's exhaustion once for the turn.
 *   3. Dreamwell: for EACH side, when this edit LANDED that side's Dreamwell
 *      reveal (`dreamwellDrawnTurn` transitioned to `turnNumber`) during the
 *      `"dreamwell"` phase on `turnNumber > 1`, queue the revealed card's script
 *      — the card at `init.dreamwellDeck[dreamwellCardIndex]`. Checking both
 *      sides (not just the active one) fires a non-active-side extra draw's
 *      reveal (the Lily Lake case). The reveal edge is itself the once-per-turn
 *      guard.
 *   4. `advanceEffectQueue` until a prompt is pending or the queue empties.
 *   5. Support recompute AFTER the drain: run `planSupportRecompute` on the
 *      drained board and apply its edits, preserving the drain's
 *      `pendingPrompt`/`effectQueue`. A queued effect can move a supporter or
 *      supported card, so recomputing after the drain keeps `staticSparkBonus`
 *      correct; the recompute is diff-based and idempotent, so running it while a
 *      prompt is parked is safe.
 *
 * `nowMs` is `isoTimestampToMs(ctx.timestamp) ?? 0` throughout (no live clock), honoring the src/rules/
 * lint rails.
 */
function applyBattleCommandStep(
  battle: BattleFoldState,
  command: BattleCommand,
  seq: number,
  random: () => number,
  nowMs: number,
): BattleFoldState | null {
  if (battle.pendingPrompt !== null) {
    return null;
  }

  // Step 1 — apply the command's edit.
  const boardBefore = battle.board;
  const boardAfter = applyCommandToBoard(boardBefore, command);

  const queue: EffectRun[] = [...battle.effectQueue];

  let board = boardAfter;
  let dawnFired = battle.dawnFired;

  // Step 2 — structural Dawn bookend, fired exactly once per side and turn.
  // The incoming side's Dawn is due when this edit either:
  //   - crossed into the committed `dawn` phase (an explicit `SET_PHASE dawn`,
  //     e.g. from the inspector) — the "entered dawn" edge; or
  //   - handed the turn off by flipping the active side. The automation turn
  //     handoff (`SET_BATTLE_FLOW`) lands the incoming side on `dreamwell` and
  //     never crosses the dawn phase, so the handoff edge is what fires the
  //     incoming side's Dawn.
  // Turn 1 has no Dawn, and Dawn never fires once the battle has a result.
  const enteredDawn = boardBefore.phase !== "dawn" && boardAfter.phase === "dawn";
  const handedOff = boardBefore.activeSide !== boardAfter.activeSide;
  if (
    (enteredDawn || handedOff) &&
    boardAfter.turnNumber > 1 &&
    boardAfter.result === null &&
    dawnFired[boardAfter.activeSide] !== boardAfter.turnNumber
  ) {
    const side = boardAfter.activeSide;
    board = applyBoardEdits(board, dawnClearEdits(board, side));
    dawnFired = { ...dawnFired, [side]: boardAfter.turnNumber };
  }

  // Step 3 — Dreamwell reveal → queue the revealed card's script. Checked
  // per-side (not just the active side) so a manual extra draw for the
  // non-active side (Lily Lake) queues that side's revealed script too.
  for (const side of BATTLE_SIDES) {
    const revealLanded =
      boardBefore.sides[side].dreamwellDrawnTurn !== boardAfter.turnNumber &&
      boardAfter.sides[side].dreamwellDrawnTurn === boardAfter.turnNumber;
    if (
      !revealLanded ||
      boardAfter.phase !== "dreamwell" ||
      boardAfter.turnNumber <= 1 ||
      boardAfter.result !== null
    ) {
      continue;
    }
    const index = boardAfter.sides[side].dreamwellCardIndex;
    if (index === null) {
      continue;
    }
    const card = battle.init.dreamwellDeck[index];
    if (card === undefined) {
      continue;
    }
    const script = selectDreamwellEffectScript(card.id);
    if (script !== null && script.steps.length > 0) {
      queue.push(newEffectRun({ table: "dreamwell", id: card.id }, side));
    }
  }

  // Step 4 — advance the queue, continuing the SAME draw counter.
  const advanced = advanceEffectQueueWithStream(
    { ...battle, board, effectQueue: queue, pendingPrompt: null, dawnFired },
    seq,
    random,
    nowMs,
  );

  // Step 5 — Support recompute AFTER the drain (a queued effect may have moved a
  // supporter/supported card). Idempotent, so applying it to the drained board
  // while a prompt is parked is safe; preserve the drain's queue and prompt.
  return {
    ...advanced,
    board: applyBoardEdits(
      advanced.board,
      planSupportRecompute(advanced.board, true, random, nowMs),
    ),
  };
}

/**
 * `BATTLE_COMMAND { command }`: the single synchronous fold step for one battle
 * command. Applies the command through {@link applyBattleCommandStep} — its edit
 * plus structural Dawn, Dreamwell, Support, and force-result routing — so a
 * single event in yields a fully-triggered state
 * out and two clients folding the same (seed, seq) converge byte-for-byte.
 *
 * Returns the next {@link FoldState}, or `null` to bounce when there is no
 * battle, a prompt is already pending, or the command payload is malformed.
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
  const command = coerceBattleCommand(payload.command);
  if (command === null) {
    return null;
  }

  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const commands = planBasicAutomationCommands(battle.board, command, {
    maxEnergyCap: battle.init.maxEnergyCap,
    scoreToWin: battle.init.scoreToWin,
    dreamwellDeck: battle.init.dreamwellDeck,
  });
  const nowMs = isoTimestampToMs(ctx.timestamp) ?? 0;
  let current = battle;
  for (const plannedCommand of commands) {
    const next = applyBattleCommandStep(
      current,
      plannedCommand,
      ctx.seq,
      random,
      nowMs,
    );
    if (next === null) {
      return null;
    }
    current = next;
  }
  return { ...state, battle: current };
}

/**
 * `BATTLE_GESTURE { commands }`: one player gesture the automation planner
 * expanded into an ordered list of battle commands (a play that also spends
 * energy, a turn handoff that resolves the Challenge, ramps energy, and draws).
 * Folds each command through {@link applyBattleCommandStep} SEQUENTIALLY within
 * this one fold step, threading a SINGLE continuing draw counter so no two
 * commands collide on an rng index.
 *
 * ALL-OR-NOTHING: if the payload is not a non-empty command array, any element
 * fails validation, or a command's battle/prompt gate rejects mid-sequence, the
 * WHOLE event bounces (returns `null`) — no partial gesture can exist in the
 * log. Because every command's outcome is a pure function of the prefix, both
 * clients bounce or apply the identical whole gesture.
 */
export function battleGesture(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  const battle = state.battle;
  if (battle === null) {
    return null;
  }
  const rawCommands = payload.commands;
  if (!Array.isArray(rawCommands) || rawCommands.length === 0) {
    return null;
  }
  const commands: BattleCommand[] = [];
  for (const raw of rawCommands) {
    const command = coerceBattleCommand(raw);
    if (command === null) {
      return null;
    }
    commands.push(command);
  }

  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const nowMs = isoTimestampToMs(ctx.timestamp) ?? 0;

  let current = battle;
  for (const command of commands) {
    const next = applyBattleCommandStep(current, command, ctx.seq, random, nowMs);
    if (next === null) {
      return null;
    }
    current = next;
  }
  return { ...state, battle: current };
}

/**
 * Applies the AI defender's deterministic Dusk repositioning once per opposing
 * turn. The processed marker lives in the fold so remounts and reloads cannot
 * repeat the defense or suppress a needed retry.
 */
export function battleAiDefend(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  const battle = state.battle;
  const aiSide = payload.aiSide;
  if (
    battle === null ||
    (aiSide !== "player" && aiSide !== "enemy") ||
    battle.board.result !== null ||
    battle.board.phase !== "dusk" ||
    battle.board.activeSide === aiSide
  ) {
    return null;
  }

  const marker = battle.aiDefenseTurn;
  if (
    marker?.activeSide === battle.board.activeSide &&
    marker.turnNumber === battle.board.turnNumber
  ) {
    return null;
  }

  const commands: BattleCommand[] = [];
  const model = forwardModelFromState(battle.board, aiSide);
  for (const move of planDefense(model, { scoreToWin: battle.init.scoreToWin })) {
    const moveCommands = actionToCommands(move, aiSide);
    const [firstCommand, ...restCommands] = moveCommands;
    const tracedCommands = firstCommand === undefined
      ? moveCommands
      : [{ ...firstCommand, aiChoices: [buildTrace(move)] }, ...restCommands];
    commands.push(...tracedCommands);
  }

  let nextBattle = battle;
  if (commands.length > 0) {
    const applied = battleGesture(state, { commands }, ctx);
    if (applied === null || applied.battle === null) {
      return null;
    }
    nextBattle = applied.battle;
  }

  return {
    ...state,
    battle: {
      ...nextBattle,
      aiDefenseTurn: {
        activeSide: battle.board.activeSide,
        turnNumber: battle.board.turnNumber,
      },
    },
  };
}

/** Applies the command's board mutation, routing the three command ids
 *  (SKIP_TO_REWARDS aliases a forced victory). */
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
 * checked; an unknown `edit.kind` survives coercion (its `kind` is a string) but
 * `applyDebugEdit` produces no result for it, so `applyCommandToBoard` throws
 * reading `.state` of `undefined`. That throw propagates to the engine's fold
 * containment (`fold.ts`): a recorded bounce plus a `fold_error` report in
 * production, a rethrow in dev. A bounced BATTLE_COMMAND opened no prompt, so
 * the whole event bounces cleanly to the pre-event state with no wedge.
 */
function coerceBattleCommand(raw: unknown): BattleCommand | null {
  if (!isPlainRecord(raw)) {
    return null;
  }
  const id = raw.id;
  if (id === "DEBUG_EDIT") {
    const edit = coerceBattleDebugEdit(raw.edit);
    return edit === null ? null : { ...(raw as object), id, edit };
  }
  if (id === "FORCE_RESULT") {
    const result = raw.result;
    if (!isBattleResult(result)) {
      return null;
    }
    return { ...(raw as object), id, result };
  }
  if (id === "SKIP_TO_REWARDS") {
    return { ...(raw as object), id };
  }
  return null;
}

function coerceBattleDebugEdit(raw: unknown): BattleDebugEdit | null {
  if (!isPlainRecord(raw) || typeof raw.kind !== "string") return null;
  switch (raw.kind) {
    case "SET_SCORE":
    case "SET_CURRENT_ENERGY":
    case "SET_MAX_ENERGY":
      return isBattleSide(raw.side) && isFiniteNumber(raw.value) ? raw as unknown as BattleDebugEdit : null;
    case "INCREASE_MAX_ENERGY_AND_FILL":
    case "DRAW_CARD":
      return isBattleSide(raw.side) ? raw as unknown as BattleDebugEdit : null;
    case "ADJUST_SCORE":
    case "ADJUST_CURRENT_ENERGY":
    case "ADJUST_MAX_ENERGY":
    case "KINDLE":
      return isBattleSide(raw.side) && isFiniteNumber(raw.amount) ? raw as unknown as BattleDebugEdit : null;
    case "SET_CARD_SPARK":
    case "SET_CARD_SPARK_DELTA":
    case "SET_CARD_STATIC_SPARK_BONUS":
    case "SET_COUNTERS":
      return isNonEmptyString(raw.battleCardId) && isFiniteNumber(raw.value) ? raw as unknown as BattleDebugEdit : null;
    case "MOVE_CARD_TO_ZONE":
      return isNonEmptyString(raw.battleCardId) && isDebugZoneDestination(raw.destination)
        ? raw as unknown as BattleDebugEdit
        : null;
    case "SWAP_BATTLEFIELD_SLOTS":
      return isBattleFieldSlotAddress(raw.source) && isBattleFieldSlotAddress(raw.target)
        ? raw as unknown as BattleDebugEdit
        : null;
    case "DRAW_DREAMWELL_CARD":
      return isBattleSide(raw.side) && Number.isInteger(raw.turnNumber) && (raw.additional === undefined || typeof raw.additional === "boolean")
        ? raw as unknown as BattleDebugEdit
        : null;
    case "ERODE":
    case "REVEAL_DECK_TOP":
    case "HIDE_DECK_TOP":
      return isBattleSide(raw.side) && Number.isInteger(raw.count) ? raw as unknown as BattleDebugEdit : null;
    case "DISCARD_CARD":
    case "ABANDON":
    case "REMATERIALIZE":
    case "CLEAR_CARD_NOTES":
      return isNonEmptyString(raw.battleCardId) ? raw as unknown as BattleDebugEdit : null;
    case "SET_CARD_VISIBILITY":
      return isNonEmptyString(raw.battleCardId) && typeof raw.isRevealedToPlayer === "boolean" ? raw as unknown as BattleDebugEdit : null;
    case "SET_SIDE_HAND_VISIBILITY":
      return isBattleSide(raw.side) && typeof raw.isRevealedToPlayer === "boolean" ? raw as unknown as BattleDebugEdit : null;
    case "ADD_CARD_NOTE":
      return isNonEmptyString(raw.battleCardId) &&
        isNonEmptyString(raw.noteId) &&
        typeof raw.text === "string" &&
        isFiniteNumber(raw.createdAtMs) &&
        isBattleCardNoteExpiry(raw.expiry)
        ? raw as unknown as BattleDebugEdit
        : null;
    case "DISMISS_CARD_NOTE":
      return isNonEmptyString(raw.battleCardId) && isNonEmptyString(raw.noteId) ? raw as unknown as BattleDebugEdit : null;
    case "SET_CARD_MARKERS":
      return isNonEmptyString(raw.battleCardId) && isPlainRecord(raw.markers) ? raw as unknown as BattleDebugEdit : null;
    case "SET_CARD_STATUS":
      return isNonEmptyString(raw.battleCardId) && isPlainRecord(raw.status) ? raw as unknown as BattleDebugEdit : null;
    case "CREATE_CARD_COPY":
      return isNonEmptyString(raw.sourceBattleCardId) && isDebugZoneDestination(raw.destination) && isFiniteNumber(raw.createdAtMs)
        ? raw as unknown as BattleDebugEdit
        : null;
    case "ADD_FIGMENTS":
      return isNonEmptyString(raw.battleCardId) && Number.isInteger(raw.count) ? raw as unknown as BattleDebugEdit : null;
    case "CREATE_FIGMENT":
      return isBattleSide(raw.side) &&
        typeof raw.chosenSubtype === "string" &&
        isFiniteNumber(raw.chosenSpark) &&
        typeof raw.name === "string" &&
        isDebugZoneDestination(raw.destination) &&
        isFiniteNumber(raw.createdAtMs)
        ? raw as unknown as BattleDebugEdit
        : null;
    case "CREATE_CARD_FROM_DEFINITION":
      return isPlainRecord(raw.definition) && isDebugZoneDestination(raw.destination) && isFiniteNumber(raw.createdAtMs)
        ? raw as unknown as BattleDebugEdit
        : null;
    case "FILL_BATTLEFIELD_PREVIEW": {
      const definitions = raw.definitions;
      return isPlainRecord(definitions) &&
        isBattlefieldPreviewDefinitionList(definitions.player) &&
        isBattlefieldPreviewDefinitionList(definitions.enemy) &&
        isFiniteNumber(raw.createdAtMs)
        ? raw as unknown as BattleDebugEdit
        : null;
    }
    case "REORDER_DECK":
      return isBattleSide(raw.side) && Array.isArray(raw.order) && raw.order.every((id) => typeof id === "string")
        ? raw as unknown as BattleDebugEdit
        : null;
    case "FORESEE":
      return isBattleSide(raw.side) &&
        isStringArray(raw.viewedCardIds) &&
        isStringArray(raw.orderedCardIds) &&
        isStringArray(raw.voidCardIds)
        ? raw as unknown as BattleDebugEdit
        : null;
    case "PLAY_FROM_DECK_TOP":
      return isBattleSide(raw.side) && (raw.target === undefined || isBattleFieldSlotAddress(raw.target))
        ? raw as unknown as BattleDebugEdit
        : null;
    case "SET_PHASE":
      return isBattlePhase(raw.phase) ? raw as unknown as BattleDebugEdit : null;
    case "SET_BATTLE_FLOW":
      return isBattlePhase(raw.phase) && isBattleSide(raw.activeSide) && Number.isInteger(raw.turnNumber)
        ? raw as unknown as BattleDebugEdit
        : null;
    default:
      return null;
  }
}

function isBattleResult(value: unknown): value is BattleResult {
  return value === "victory" || value === "defeat" || value === "draw";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isBattleSide(value: unknown): value is BattleSide {
  return value === "player" || value === "enemy";
}

function isBattlePhase(value: unknown): value is BattlePhase {
  return (
    value === "dreamwell" ||
    value === "draw" ||
    value === "dawn" ||
    value === "day" ||
    value === "dusk" ||
    value === "night" ||
    value === "challenge" ||
    value === "ending"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBattlefieldPreviewDefinitionList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    (value.length === 9 || value.length === 14 || value.length === 25) &&
    value.every(isPlainRecord)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBattleFieldSlotAddress(value: unknown): value is BattleFieldSlotAddress {
  return (
    isPlainRecord(value) &&
    isBattleSide(value.side) &&
    (value.zone === "frontRank" || value.zone === "backRank") &&
    typeof value.slotId === "string" &&
    /^[FB]\d+$/.test(value.slotId)
  );
}

function isDebugZoneDestination(value: unknown): boolean {
  if (!isPlainRecord(value) || !isBattleSide(value.side)) return false;
  if (value.zone === "frontRank" || value.zone === "backRank") {
    return isBattleFieldSlotAddress(value);
  }
  if (value.zone === "hand" || value.zone === "void" || value.zone === "banished") {
    return true;
  }
  return value.zone === "deck" && (value.position === "top" || value.position === "bottom");
}

function isBattleCardNoteExpiry(value: unknown): value is BattleCardNoteExpiry {
  if (!isPlainRecord(value)) return false;
  if (value.kind === "manual") return true;
  return value.kind === "atStartOfTurn" && isBattleSide(value.side) && Number.isInteger(value.turnNumber);
}

// ---------------------------------------------------------------------------
// RESOLVE_PROMPT
// ---------------------------------------------------------------------------

/**
 * `RESOLVE_PROMPT { promptId, resolution }`: answer the single open prompt and
 * resume the parked automation run.
 *
 * This is the APPLY path for a resolve whose `promptId` MATCHES the open
 * prompt. The root CAS policy routes such an event here via its rule-2 fast
 * path (a matching resolve skips the intervening-window check and the prompt
 * gate, because the prompt's options were fixed at open time — nothing
 * intervening can change what the resolution means). A resolve whose `promptId`
 * does NOT match never reaches this function: rule 4 bounces it while a prompt
 * is open (both players answering the same prompt simultaneously — the first
 * closes it, the loser's stale resolve bounces). The re-check here is
 * defensive, so a direct/mis-routed call still bounces cleanly rather than
 * corrupting state.
 *
 * Delegates to {@link resolvePendingPrompt}, which applies the resolution's
 * edits (including the atomic ordering/void edit for `foresee`) and continues
 * advancing the queue until it parks on the next prompt
 * or empties. Returns the next {@link FoldState}, or `null` to bounce when:
 *   - there is no battle;
 *   - no prompt is pending;
 *   - `promptId` is not a finite number, or does not match the open prompt;
 *   - `resolution` is not a recognized {@link PromptResolution}; or
 *   - a resolution violates its prompt's candidate/count constraints, including
 *     an adjusted Foresee set that is not a complete live deck prefix.
 *
 * A candidate/count violation BOUNCES (rule 5); it does not clear the prompt, so
 * the prompt stays open for a valid retry.
 *
 * On success the queue is drained, then Support is recomputed on the drained
 * board (a resolution can move a supporter/supported card), continuing the same
 * draw counter — mirroring the `BATTLE_COMMAND` post-drain recompute.
 */
export function resolvePrompt(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  const battle = state.battle;
  if (battle === null) {
    return null;
  }
  const pending = battle.pendingPrompt;
  if (pending === null) {
    return null;
  }
  const promptId = payload.promptId;
  if (
    typeof promptId !== "number" ||
    !Number.isFinite(promptId) ||
    promptId !== pending.promptId
  ) {
    return null;
  }
  const resolution = coercePromptResolution(payload.resolution);
  if (resolution === null) {
    return null;
  }
  if (!promptResolutionIsValid(pending, resolution, battle.board)) {
    return null;
  }

  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const nowMs = isoTimestampToMs(ctx.timestamp) ?? 0;
  const resolved = resolvePendingPromptWithStream(
    battle,
    resolution,
    ctx.seq,
    random,
    nowMs,
  );
  const board = applyBoardEdits(
    resolved.board,
    planSupportRecompute(resolved.board, true, random, nowMs),
  );
  return { ...state, battle: { ...resolved, board } };
}

/**
 * Guards prompt resolutions against their live candidate sets. Foresee must
 * partition an exact top-of-deck prefix; pick-cards must use distinct recorded
 * candidates and stay within the prompt's min/max selection count.
 */
function promptResolutionIsValid(
  pending: PendingPrompt,
  resolution: PromptResolution,
  board: BattleMutableState,
): boolean {
  const options = pending.options;
  if (options.kind === "foresee") {
    if (resolution.kind !== "foresee") {
      return false;
    }
    if (
      resolution.orderedCardIds === undefined ||
      resolution.voidCardIds === undefined
    ) {
      return true;
    }
    const viewedCardIds = resolution.viewedCardIds ?? options.cardIds;
    const deck = board.sides[pending.run.side].deck;
    const resolvedIds = [
      ...resolution.orderedCardIds,
      ...resolution.voidCardIds,
    ];
    return (
      viewedCardIds.length >= Math.min(1, deck.length) &&
      viewedCardIds.length <= deck.length &&
      viewedCardIds.every((id, index) => deck[index] === id) &&
      resolvedIds.length === viewedCardIds.length &&
      new Set(resolvedIds).size === resolvedIds.length &&
      resolvedIds.every((id) => viewedCardIds.includes(id))
    );
  }
  if (options.kind === "choice") {
    return (
      resolution.kind === "choice" &&
      resolution.optionIndex >= 0 &&
      resolution.optionIndex < options.options.length
    );
  }
  if (resolution.kind !== "pick-cards") {
    return false;
  }
  const candidates = new Set(options.candidateIds);
  const chosen = resolution.chosenIds;
  for (const id of chosen) {
    if (!candidates.has(id)) {
      return false;
    }
  }
  if (new Set(chosen).size !== chosen.length) {
    return false;
  }
  const max = options.count;
  const min = options.optional
    ? 0
    : Math.min(options.count, options.candidateIds.length);
  return chosen.length >= min && chosen.length <= max;
}

/**
 * Validates a raw `payload.resolution` into a {@link PromptResolution}, or
 * `null` to bounce a malformed answer. `confirm` prompts are answered with a
 * `choice` resolution (option 0 = Yes, 1 = Skip), so there is no separate
 * `confirm` resolution variant.
 */
function coercePromptResolution(raw: unknown): PromptResolution | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const kind = (raw as { kind?: unknown }).kind;
  if (kind === "pick-cards") {
    const chosenIds = (raw as { chosenIds?: unknown }).chosenIds;
    if (!Array.isArray(chosenIds)) {
      return null;
    }
    const ids: string[] = chosenIds.filter(
      (id): id is string => typeof id === "string",
    );
    // A stray non-string entry means a malformed payload — bounce rather than
    // silently drop it.
    if (ids.length !== chosenIds.length) {
      return null;
    }
    return { kind: "pick-cards", chosenIds: ids };
  }
  if (kind === "choice") {
    const optionIndex = (raw as { optionIndex?: unknown }).optionIndex;
    if (typeof optionIndex !== "number" || !Number.isInteger(optionIndex)) {
      return null;
    }
    return { kind: "choice", optionIndex };
  }
  if (kind === "foresee") {
    const viewedCardIds = (raw as { viewedCardIds?: unknown }).viewedCardIds;
    const orderedCardIds = (raw as { orderedCardIds?: unknown }).orderedCardIds;
    const voidCardIds = (raw as { voidCardIds?: unknown }).voidCardIds;
    if (
      viewedCardIds === undefined &&
      orderedCardIds === undefined &&
      voidCardIds === undefined
    ) {
      return { kind: "foresee" };
    }
    if (
      (viewedCardIds !== undefined && !Array.isArray(viewedCardIds)) ||
      !Array.isArray(orderedCardIds) ||
      !Array.isArray(voidCardIds)
    ) {
      return null;
    }
    if (
      (viewedCardIds?.some((id) => typeof id !== "string") ?? false) ||
      orderedCardIds.some((id) => typeof id !== "string") ||
      voidCardIds.some((id) => typeof id !== "string")
    ) {
      return null;
    }
    return {
      kind: "foresee",
      ...(viewedCardIds === undefined
        ? {}
        : { viewedCardIds: viewedCardIds as string[] }),
      orderedCardIds: orderedCardIds as string[],
      voidCardIds: voidCardIds as string[],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// SET_CARD_NOTE
// ---------------------------------------------------------------------------

/**
 * `SET_CARD_NOTE { instanceId, note }`: attach a player annotation to an in-play
 * card, applying the `ADD_CARD_NOTE` edit for the card note editor.
 *
 * CAS-exempt (root rule 1): a note carries no game-rules meaning, so it applies
 * even through a partner's intervening window AND while a prompt is open — the
 * root reducer routes it straight to this case, skipping rules 2–4. It never
 * touches `pendingPrompt` or the effect queue, so annotating a card mid-prompt
 * does not resolve or disturb the prompt.
 *
 * The note's `createdAtMs` comes from `ctx.timestamp` (the event's
 * `clientTimestamp`), not a live clock — honoring the src/rules/ lint rails and
 * keeping two clients' folds byte-identical. `createdAtTurnNumber` /
 * `createdAtSide` are stamped from the board by `applyDebugEdit`.
 *
 * Returns the next {@link FoldState}, or `null` to bounce when:
 *   - there is no battle (no card to annotate);
 *   - `instanceId` is missing/blank, or names no live card instance; or
 *   - `note` is not a well-formed `{ noteId, text, expiry }` object.
 */
export function setCardNote(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  const battle = state.battle;
  if (battle === null) {
    return null;
  }
  const instanceId = payload.instanceId;
  if (typeof instanceId !== "string" || instanceId.length === 0) {
    return null;
  }
  if (battle.board.cardInstances[instanceId] === undefined) {
    return null;
  }
  const note = coerceCardNote(payload.note);
  if (note === null) {
    return null;
  }
  const board = applyDebugEdit(
    battle.board,
    {
      kind: "ADD_CARD_NOTE",
      battleCardId: instanceId,
      noteId: note.noteId,
      text: note.text,
      createdAtMs: isoTimestampToMs(ctx.timestamp) ?? 0,
      expiry: note.expiry,
    },
    EMISSION,
  ).state;
  return { ...state, battle: { ...battle, board } };
}

/**
 * Validates a raw `payload.note` into the `{ noteId, text, expiry }` shape the
 * `BattleCardNoteEditor` writes, or `null` to bounce a malformed note.
 */
function coerceCardNote(
  raw: unknown,
): { noteId: string; text: string; expiry: BattleCardNoteExpiry } | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const noteId = (raw as { noteId?: unknown }).noteId;
  const text = (raw as { text?: unknown }).text;
  if (typeof noteId !== "string" || noteId.length === 0) {
    return null;
  }
  if (typeof text !== "string") {
    return null;
  }
  const expiry = coerceNoteExpiry((raw as { expiry?: unknown }).expiry);
  if (expiry === null) {
    return null;
  }
  return { noteId, text, expiry };
}

/** Validates a raw note expiry into a {@link BattleCardNoteExpiry}, else `null`. */
function coerceNoteExpiry(raw: unknown): BattleCardNoteExpiry | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const kind = (raw as { kind?: unknown }).kind;
  if (kind === "manual") {
    return { kind: "manual" };
  }
  if (kind === "atStartOfTurn") {
    const side = (raw as { side?: unknown }).side;
    const turnNumber = (raw as { turnNumber?: unknown }).turnNumber;
    if (
      (side === "player" || side === "enemy") &&
      typeof turnNumber === "number" &&
      Number.isFinite(turnNumber)
    ) {
      return { kind: "atStartOfTurn", side, turnNumber };
    }
    return null;
  }
  return null;
}
