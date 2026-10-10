// The authoritative in-battle slice of the fold state: a journey battle,
// which is an engine battle (`engine-battle.ts`), or the standalone tutorial
// battle on its sandbox board, plus the cursor model that lets the sandbox
// stay PURE DATA (design spec §Data model, §"FoldState must be pure data").
//
// tutorial-only until Phase 6: the cursor and run model, the tutorial
// presentations, and script resolution below. The sandbox's effect system is
// expressed as `EffectStep[]` scripts whose steps hold `build(ctx)` /
// `candidates(ctx)` / `resolve(ids,ctx)` CLOSURES. Closures cannot live in
// fold state: `baseSnapshot` serializes the state and the sync tripwire
// hashes it, so a leaked function would either be silently dropped by JSON or
// break the byte-exact round-trip. The fold state therefore stores only a
// CURSOR — plain numbers — into the static script tables. The live scripts
// (code) are re-resolved from the tables at fold time via `resolveScript`;
// state carries ids and indices, never steps.

import type {
  BattleInit,
  BattleMutableState,
  BattlePhase,
  BattleSide,
  BattleTransitionData,
  BattleZoneId,
  FrontRankSlotId,
} from "../../battle/types";
import type { BattleInit as EngineBattleInit } from "../../engine";
import type { BattleSlice } from "../../engine/fold/slice";
import type { TutorialBattleAiActionOverride } from "../../types/tutorial";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import { selectBattleTriggeredEffectSteps } from "./battle-card-effects-table";
import type { ActivePrompt } from "./effect-runner-core";
import type { EffectStep } from "./effect-step";
import type { BattleCommand } from "../../battle/debug/commands";
import type { TutorialTriggerDefinition } from "../../types/tutorial";
import type { CardId } from "../../types/card-identity";
import type {
  BattleCardId,
  BattleEffectScriptId,
  DreamwellCardId,
  PresentationId,
  TutorialAiActionOverrideId,
  TutorialRunId,
  TutorialTriggerId,
} from "../../types/identifiers";
import { parseDreamwellCardId } from "../../types/identifiers";

// ---------------------------------------------------------------------------
// Cursor + run model
// ---------------------------------------------------------------------------

/** Key into a static effect-script table. `id` is a card UUID. */
export interface ScriptRef {
  table: "battle" | "dreamwell";
  id: BattleEffectScriptId;
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
  sourceInstanceId?: BattleCardId;
  /** Immutable, JSON-safe facts captured at the reducer edge that created the
   * run. In particular, leave-play scripts must not rediscover their source
   * after it has changed zones. */
  bindings?: EffectBindings;
}

/** Plain data carried from a trigger edge into a closure-backed registry script. */
export interface EffectBindings {
  trigger?: BattleScriptTrigger;
  sourceCardId?: CardId;
  sourceController?: BattleSide;
  sourceZone?: BattleZoneId;
  /** Targets selected as part of the semantic play intent.  They are instance
   * ids, captured before costs and carried through queued event resolution. */
  targetBattleCardIds?: readonly BattleCardId[];
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
 * The in-battle fold slice: a journey battle, which plays its engine battle,
 * or the standalone tutorial battle, which plays the frozen tutorial sandbox
 * board. {@link BattleFoldState.mode} tells them apart.
 */
export type BattleFoldState = JourneyBattleFoldState | TutorialBattleFoldState;

/**
 * A journey battle. `init` is the IMMUTABLE per-battle metadata the journey
 * built (`BattleInit`): the opponent, the score target, the reward, the
 * site and dreamscape identity, and the display definitions of both decks.
 * `engine` is the engine battle its `BATTLE_ACTION`, `BATTLE_ANSWER`, and
 * `BATTLE_CANCEL` intents fold, and `END_BATTLE` reads its result. Both are
 * plain data and never change identity after `BEGIN_BATTLE`.
 */
export interface JourneyBattleFoldState {
  readonly mode: JourneyBattleMode;
  readonly init: BattleInit;
  readonly engine: EngineBattleFold;
}

// tutorial-only until Phase 6
/**
 * The standalone tutorial battle on its sandbox board.
 *
 * - `init` is the IMMUTABLE per-battle metadata (`BattleInit`): `scoreToWin`,
 *   `turnLimit`, the shared `dreamwellDeck` array, `siteId`, and the enemy /
 *   avatar summaries. The mutable `board` carries only INDICES into it
 *   (`dreamwellDeckIndex` / `dreamwellCardIndex`), so the driver keys a
 *   dreamwell-reveal script by the card UUID at
 *   `dreamwellDeck[dreamwellDeckIndex]`.
 * - `board` is the sandbox `BattleMutableState`.
 * - `effectQueue` is the FIFO of pending automation runs.
 * - `pendingPrompt` is the single open prompt (or null).
 *
 * All of it is plain data.
 */
export interface TutorialBattleFoldState {
  mode: TutorialBattleMode;
  init: BattleInit;
  board: BattleMutableState;
  effectQueue: EffectRun[];
  pendingPrompt: PendingPrompt | null;
  /**
   * An event-log-owned presentation checkpoint. The driver may schedule its
   * completion locally, but no later automatic battle intent can run until
   * the matching completion event folds.
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
  /** Last opponent Dusk for which the reducer applied AI blocking. */
  aiBlockingTurn?: {
    activeSide: BattleSide;
    turnNumber: number;
  };
  /** Authored one-shot actions which may preempt tutorial heuristic planning. */
  tutorialAiActionOverrides?: readonly TutorialBattleAiActionOverride[];
  /** Override ids committed by their matching semantic battle action. */
  consumedTutorialAiActionOverrideIds?: readonly TutorialAiActionOverrideId[];
  /**
   * Per-side once-per-turn exhaustion-clear guard. The reducer stamps the
   * outgoing side's turn number when a committed handoff clears all in-play
   * characters. `null` means that side has not completed a turn this battle.
   */
  dawnFired: DawnFiredMarker;
  /** Once-per-controller-turn guard for authored Dawn scripts. */
  triggerDawnFired?: DawnFiredMarker;
}

/** The standalone tutorial battle of `battle`, or `null` for a journey battle or none. */
export function tutorialBattleOf(battle: BattleFoldState | null): TutorialBattleFoldState | null {
  return battle !== null && battle.mode.kind === "tutorial" ? (battle as TutorialBattleFoldState) : null;
}

/** The journey battle of `battle`, or `null` for the tutorial battle or none. */
export function journeyBattleOf(battle: BattleFoldState | null): JourneyBattleFoldState | null {
  return battle !== null && battle.mode.kind === "journey" ? (battle as JourneyBattleFoldState) : null;
}

/** A journey battle's engine battle: plain data, so it persists and replays with the fold. */
export interface EngineBattleFold {
  /** The init the engine battle started from; it never changes. */
  readonly init: EngineBattleInit;
  /** The committed state, the in-flight step, and its recorded answers (D31). */
  readonly slice: BattleSlice;
}

/** One tangible tutorial reveal whose identity survives replay and remounts. */
export type TutorialBattlePresentation =
  | OpponentPlayPresentation
  | DreamwellRevealPresentation
  | OpponentBlockPresentation
  | ChallengeResolvedPresentation
  | TutorialGuidancePresentation;

export interface TutorialGuidanceMessage {
  readonly triggerId: TutorialTriggerId;
  readonly speaker: TutorialTriggerDefinition["speaker"];
  readonly text: string;
  readonly delay?: number;
  readonly duration: number;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly bubbleWidth: number;
}

export type TutorialGuidanceSource =
  | {
      readonly kind: "card";
      readonly cardId: CardId;
      readonly battleCardId: BattleCardId;
      readonly cardKind: "character" | "event";
      readonly side: BattleSide;
    }
  | {
      readonly kind: "dreamwell";
      readonly cardId: DreamwellCardId;
      readonly side: BattleSide;
    }
  | {
      readonly kind: "figment";
      readonly cardId: CardId;
      readonly battleCardId: BattleCardId;
      readonly side: BattleSide;
    }
  | {
      readonly kind: "challenge";
      readonly activeSide: BattleSide;
      readonly turnNumber: number;
      readonly slotId: FrontRankSlotId;
    }
  | {
      readonly kind: "battle";
      readonly activeSide: BattleSide;
      readonly turnNumber: number;
    };

export type TutorialGuidanceContinuation =
  | {
      readonly kind: "commands";
      readonly commands: readonly BattleCommand[];
    }
  | {
      readonly kind: "resume-effects";
      readonly commands: readonly BattleCommand[];
    }
  | {
      readonly kind: "play-card";
      readonly payload: Readonly<Record<string, unknown>>;
      readonly automatic: boolean;
    };

/** A queued Mira explanation and the exact battle work parked behind it. */
export interface TutorialGuidancePresentation {
  readonly id: PresentationId;
  readonly kind: "tutorial-guidance";
  readonly source: TutorialGuidanceSource;
  readonly messages: readonly TutorialGuidanceMessage[];
  readonly messageIndex: number;
  readonly continuation: TutorialGuidanceContinuation;
}

export interface OpponentPlayPresentation {
  readonly id: PresentationId;
  readonly kind: "opponent-play";
  /** UUID of the catalog card shown at the presentation boundary. */
  readonly cardId: CardId;
  /** Physical battle-card identity for the card that was played. */
  readonly battleCardId: BattleCardId;
  readonly cardKind: "character" | "event";
}

/** A Dreamwell source card that must be seen before its effect can prompt. */
export interface DreamwellRevealPresentation {
  readonly id: PresentationId;
  readonly kind: "dreamwell-reveal";
  /** UUID of the revealed Dreamwell card. */
  readonly cardId: DreamwellCardId;
  readonly side: BattleSide;
  readonly turnNumber: number;
}

/**
 * The two paced beats that make an opposed Challenge readable in the tutorial.
 *
 * Blocking and its resolution are a single fold step apart, so without a beat
 * between them a blocker enters its lane and dissolves inside one frame. Each
 * beat parks tutorial automation exactly as the other presentations do, holding
 * the board still long enough for the shared-layout travel to play and be read.
 */
export interface OpponentBlockPresentation {
  readonly id: PresentationId;
  readonly kind: "opponent-block";
  /** The side whose challengers are being blocked. */
  readonly activeSide: BattleSide;
  /** Every blocker that moved into a lane already holding a challenger. */
  readonly blockers: readonly OpponentBlockEntry[];
}

export interface OpponentBlockEntry {
  readonly battleCardId: BattleCardId;
  readonly slotId: FrontRankSlotId;
  /** The challenger this blocker moved to oppose. */
  readonly challengerBattleCardId: BattleCardId;
}

/** One resolved Challenge lane, held while its result animation plays. */
export interface ChallengeResolvedPresentation {
  readonly id: PresentationId;
  readonly kind: "challenge-resolved";
  readonly activeSide: BattleSide;
  readonly slotId: FrontRankSlotId;
  /** The active-side character whose Challenge produced this result. */
  readonly challengerBattleCardId: BattleCardId;
  /** The opposing character in the lane, or null for an unpaired Challenge. */
  readonly blockerBattleCardId: BattleCardId | null;
  /** Points scored by a character in this lane, or null when no character scored. */
  readonly scored: ChallengeScoredEntry | null;
  /** Every character this lane dissolved, in resolution order. */
  readonly dissolved: readonly ChallengeDissolvedEntry[];
}

export interface ChallengeScoredEntry {
  readonly battleCardId: BattleCardId;
  readonly side: BattleSide;
  readonly points: number;
}

export interface ChallengeDissolvedEntry {
  readonly battleCardId: BattleCardId;
  readonly side: BattleSide;
}

/** A deferred handoff requested before its outgoing Challenge has completed. */
export interface ChallengeHandoff {
  activeSide: BattleSide;
  phase: BattlePhase;
  turnNumber: number;
}

/** Plain-data cursor for authoritative F0 → F8 Challenge resolution. */
export interface ChallengeCursor {
  activeSide: BattleSide;
  /** The next front-rank lane index to resolve (0 through 8). */
  nextLane: number;
  /** A turn handoff to perform only after every Challenge lane settles. */
  handoff: ChallengeHandoff | null;
  /**
   * The result of the lane that just settled. A prompt or trigger may finish
   * before this checkpoint opens, after which presentation completion resumes
   * the cursor at the next lane.
   */
  pendingPresentation?: ChallengeResolvedPresentation | null;
}

/** Metadata that distinguishes a normal journey battle from the tutorial handoff. */
export type BattleMode = JourneyBattleMode | TutorialBattleMode;

export interface JourneyBattleMode {
  kind: "journey";
}

export interface TutorialBattleMode {
  kind: "tutorial";
  tutorialRunId: TutorialRunId;
  restartNumber: number;
  resultConfig: {
    playerOnlyVictory: true;
    turnLimitDisabled: true;
  };
}

/** The lifecycle that created `battle`. */
export function battleModeOf(battle: BattleFoldState): BattleMode {
  return battle.mode;
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
  return selectDreamwellEffectScript(parseDreamwellCardId(ref.id))?.steps ?? [];
}

/**
 * Constructs a fresh {@link EffectRun} positioned at the first step. Task 19-21
 * (BEGIN_BATTLE / BATTLE_COMMAND) mint runs through this so the initial cursor
 * convention (`[0]`) lives in one place.
 */
export function newEffectRun(
  scriptRef: ScriptRef,
  side: BattleSide,
  sourceInstanceId?: BattleCardId,
  bindings?: EffectBindings,
): EffectRun {
  const run: EffectRun = { scriptRef, cursor: [0], side };
  if (sourceInstanceId !== undefined) run.sourceInstanceId = sourceInstanceId;
  if (bindings !== undefined) run.bindings = bindings;
  return run;
}
