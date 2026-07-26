// The authoritative in-battle slice of the coop fold state, plus the cursor
// model that lets it stay PURE DATA (design spec §Data model, §"FoldState must
// be pure data").
//
// The battle effect system is expressed today as `EffectStep[]` scripts whose
// steps hold `build(ctx)` / `candidates(ctx)` / `resolve(ids,ctx)` CLOSURES.
// Closures cannot live in fold state: `baseSnapshot` serializes the state and
// the sync tripwire hashes it, so a leaked function would either be silently
// dropped by JSON or break the byte-exact round-trip. The fold state therefore
// stores only a CURSOR — plain numbers — into the static script tables. The
// live scripts (code) are re-resolved from the tables at fold time via
// `resolveScript`; state carries ids and indices, never steps.

import type {
  BattleInit,
  BattleMutableState,
  BattlePhase,
  BattleSide,
  BattleTransitionData,
} from "../../battle/types";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import { selectBattleTriggeredEffectSteps } from "./battle-card-effects-table";
import type { ActivePrompt } from "./effect-runner-core";
import type { EffectStep } from "./effect-step";

// ---------------------------------------------------------------------------
// Cursor + run model
// ---------------------------------------------------------------------------

/** Key into a static effect-script table. `id` is a card UUID. */
export interface ScriptRef {
  table: "battle" | "dreamwell";
  id: string;
}

/**
 * A pending automation run, as PLAIN DATA.
 *
 * `cursor` is a PATH of indices into the (possibly nested) static script step
 * tree, not a single top-level `stepIndex`. `cursor[0]` indexes the script's
 * top-level `steps`; each subsequent index descends into the `onYes` branch of
 * the `confirm` prompt at the previous index. A single top-level index cannot
 * address a prompt that lives inside a `confirm.onYes` branch — and such nested
 * prompts DO exist in the live dreamwell table (Sunset's Last Gaze, The
 * Bastion, Ruin Tree, Luminous Enigma), so the path is required for
 * correctness. Because every element is a number, an `EffectRun` round-trips
 * through `JSON.parse(JSON.stringify(...))` byte-for-byte with no closure or
 * `EffectStep` ever entering the state.
 *
 * A fresh run starts at `cursor: [0]` (see {@link newEffectRun}); the driver
 * advances the cursor as steps dispatch and descends into `onYes` when a
 * `confirm` resolves affirmatively.
 */
export interface EffectRun {
  scriptRef: ScriptRef;
  cursor: number[];
  side: BattleSide;
  /** Persisted for compatibility with older queued runs. */
  sourceInstanceId?: string;
  /** Immutable, JSON-safe facts captured at the reducer edge that created the
   * run. In particular, leave-play scripts must not rediscover their source
   * after it has changed zones. */
  bindings?: EffectBindings;
}

/** Plain data carried from a trigger edge into a closure-backed registry script. */
export interface EffectBindings {
  trigger?: BattleScriptTrigger;
  sourceCardId?: string;
  sourceController?: BattleSide;
  sourceZone?: string;
  /** Targets selected as part of the semantic play intent.  They are instance
   * ids, captured before costs and carried through queued event resolution. */
  targetBattleCardIds?: readonly string[];
}

/** The battle lifecycle edges that an authored card script may subscribe to. */
export type BattleScriptTrigger =
  | "played"
  | "materialized"
  | "rematerialized"
  | "dawn"
  | "dissolved"
  | "abandoned";

/**
 * An open prompt awaiting a `RESOLVE_PROMPT`. Pure data: `options` is the
 * already-materialized {@link ActivePrompt} (candidate ids resolved from live
 * state at open time), so the UI needs no builder access, and `run` is the
 * parked cursor. `promptId` is the seq of the event that opened the prompt; the
 * root CAS policy matches a `RESOLVE_PROMPT` against it (reducer rules 2/4).
 */
export interface PendingPrompt {
  promptId: number;
  run: EffectRun;
  kind: "pick-cards" | "choice" | "confirm" | "foresee";
  options: ActivePrompt;
}

/**
 * The in-battle fold slice.
 *
 * - `init` is the IMMUTABLE per-battle metadata (`BattleInit`): `scoreToWin`,
 *   `turnLimit`, the shared `dreamwellDeck` array, `siteId`, `dreamscapeId`,
 *   `isFinalBoss`, and the enemy / dreamcaller / dreamsign summaries. The
 *   mutable `board` carries only INDICES into it (`dreamwellDeckIndex` /
 *   `dreamwellCardIndex`), so the deck array, the win/turn-limit thresholds,
 *   and the site/dreamscape identity are unreachable without it. Keeping it on
 *   the fold slice is what lets the driver key a dreamwell-reveal script by the
 *   card UUID at `dreamwellDeck[dreamwellDeckIndex]` (Task 20) and lets a
 *   defeat classify its `QuestFailureReason`. `BattleInit` is pure JSON
 *   (numbers, strings, frozen definition arrays, a `DreamAtlas`) with no
 *   closures, so it round-trips through the sync hash byte-for-byte like the
 *   rest of the slice. It never changes after `BEGIN_BATTLE`.
 * - `board` is today's `BattleMutableState`, relocated.
 * - `effectQueue` is the FIFO of pending automation runs.
 * - `pendingPrompt` is the single open prompt (or null).
 *
 * All four are plain data.
 */
export interface BattleFoldState {
  /**
   * The lifecycle that created this battle. Missing metadata on a persisted
   * legacy battle is normalized to the ordinary quest mode at the load seam.
   */
  mode?: BattleMode;
  init: BattleInit;
  board: BattleMutableState;
  effectQueue: EffectRun[];
  pendingPrompt: PendingPrompt | null;
  /**
   * A tutorial-only, event-log-owned presentation checkpoint. The driver may
   * schedule its completion locally, but no later automatic battle intent can
   * run until the matching completion event folds.
   */
  tutorialPresentation?: TutorialBattlePresentation | null;
  /**
   * The transition summary for the most recently folded semantic battle
   * intent. It is plain data so AI rationale supplied with BATTLE_PLAY_CARD
   * survives replay and is available to the battle log presentation.
   */
  lastTransition?: BattleTransitionData | null;
  /**
   * The persisted Challenge state machine. Each cursor step resolves exactly
   * one front-rank lane, then lets its leave-play scripts and static settlement
   * finish before the next lane is evaluated from the resulting board.
   */
  challengeCursor?: ChallengeCursor | null;
  /** Persisted automation marker. Battle command expansion is always enabled. */
  basicAutomationEnabled?: boolean;
  /** Last opponent Dusk for which the reducer applied AI defense. */
  aiDefenseTurn?: {
    activeSide: BattleSide;
    turnNumber: number;
  };
  /**
   * Per-side once-per-turn exhaustion-clear guard. The reducer stamps the
   * outgoing side's turn number when a committed handoff clears all in-play
   * characters. `null` means that side has not completed a turn this battle.
   */
  dawnFired: DawnFiredMarker;
  /** Once-per-controller-turn guard for authored Dawn scripts. */
  triggerDawnFired?: DawnFiredMarker;
}

/** One tangible tutorial reveal whose identity survives replay and remounts. */
export interface TutorialBattlePresentation {
  readonly id: string;
  readonly kind: "opponent-play";
  /** UUID of the catalog card shown at the presentation boundary. */
  readonly cardId: string;
  /** Physical battle-card identity for the card that was played. */
  readonly battleCardId: string;
  readonly cardKind: "character" | "event";
}

/** A deferred handoff requested before its outgoing Challenge has completed. */
export interface ChallengeHandoff {
  activeSide: BattleSide;
  phase: BattlePhase;
  turnNumber: number;
}

/** Plain-data cursor for authoritative F0 → F3 Challenge resolution. */
export interface ChallengeCursor {
  activeSide: BattleSide;
  /** The next front-rank lane index to resolve (0 through 4). */
  nextLane: number;
  /** A turn handoff to perform only after every Challenge lane settles. */
  handoff: ChallengeHandoff | null;
}

/** Metadata that distinguishes a normal quest battle from the tutorial handoff. */
export type BattleMode = QuestBattleMode | TutorialBattleMode;

export interface QuestBattleMode {
  kind: "quest";
}

export interface TutorialBattleMode {
  kind: "tutorial";
  tutorialRunId: string;
  driverClientId: string;
  restartNumber: number;
  resultConfig: {
    playerOnlyVictory: true;
    turnLimitDisabled: true;
  };
}

/** Treat snapshots written before mode metadata as ordinary quest battles. */
export function battleModeOf(battle: BattleFoldState): BattleMode {
  return battle.mode ?? { kind: "quest" };
}

/** Per-side last cleared turn marker (see {@link BattleFoldState.dawnFired}). */
export interface DawnFiredMarker {
  player: number | null;
  enemy: number | null;
}

/** The initial {@link DawnFiredMarker} for a fresh battle. */
export function emptyDawnFired(): DawnFiredMarker {
  return { player: null, enemy: null };
}

// ---------------------------------------------------------------------------
// Script resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a {@link ScriptRef} to its live `EffectStep[]`. Character effect runs
 * are retained as a stale-state compatibility case and resolve to no steps.
 */
export function resolveScript(ref: ScriptRef): EffectStep[] {
  if (ref.table === "battle") {
    return selectBattleTriggeredEffectSteps(ref.id) ?? [];
  }
  return selectDreamwellEffectScript(ref.id)?.steps ?? [];
}

/**
 * Constructs a fresh {@link EffectRun} positioned at the first step. Task 19-21
 * (BEGIN_BATTLE / BATTLE_COMMAND) mint runs through this so the initial cursor
 * convention (`[0]`) lives in one place.
 */
export function newEffectRun(
  scriptRef: ScriptRef,
  side: BattleSide,
  sourceInstanceId?: string,
  bindings?: EffectBindings,
): EffectRun {
  const run: EffectRun = { scriptRef, cursor: [0], side };
  if (sourceInstanceId !== undefined) run.sourceInstanceId = sourceInstanceId;
  if (bindings !== undefined) run.bindings = bindings;
  return run;
}
