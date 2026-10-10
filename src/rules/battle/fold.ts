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
  BattleAvatarSummary,
  BattleDeckCardDefinition,
  BattleEnemyDescriptor,
  BattleInit,
  BattleMutableState,
  BattlePhase,
  BattleSide,
  BattleTransitionData,
  BattleZoneId,
  FrontRankSlotId,
} from "../../battle/types";
import type { BattleInit as EngineBattleInit } from "../../engine";
import type { BattleIntent, BattleSlice } from "../../engine/fold/slice";
import type { Keyword } from "../../engine/dsl/types";
import type { Answer } from "../../engine/prompts/types";
import type { Action } from "../../engine/rules/actions";
import {
  BACK_RANK_SIZE,
  FRONT_RANK_SIZE,
  PHASES,
  SIDES,
  parseFigmentId,
  type AbilitySource,
  type InstanceId,
  type Side,
  type Slot,
  type Zone,
} from "../../engine/state/ids";
import type { BattleState, EndReason } from "../../engine/state/types";
import type { StepKind } from "../../engine/steps/kinds";
import { battleDeckCardDefinitionFromUnknown } from "../../battle/card-definition";
import type { TransfigurationType } from "../../types/journey";
import type { TutorialBattleAiActionOverride } from "../../types/tutorial";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import { selectBattleTriggeredEffectSteps } from "./battle-card-effects-table";
import type { ActivePrompt } from "./effect-runner-core";
import type { EffectStep } from "./effect-step";
import type { BattleCommand } from "../../battle/debug/commands";
import type { TutorialTriggerDefinition } from "../../types/tutorial";
import type { CardId } from "../../types/card-identity";
import { parseCardId, parseCardName } from "../../types/card-identity";
import type {
  AtlasNodeId,
  BattleCardId,
  BattleEffectScriptId,
  BattleId,
  DreamwellCardId,
  PresentationId,
  PromptId,
  SiteId,
  TutorialAiActionOverrideId,
  TutorialRunId,
  TutorialTriggerId,
} from "../../types/identifiers";
import {
  parseAtlasNodeId,
  parseAvatarId,
  parseBattleId,
  parseDreamsignId,
  parseDreamwellCardId,
  parseOpponentId,
  parsePromptId,
  parseSiteId,
} from "../../types/identifiers";

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
 * A journey battle. `init` is its journey side ({@link JourneyBattleInit}).
 * `engine` is the engine battle its `BATTLE_ACTION`, `BATTLE_ANSWER`, and
 * `BATTLE_CANCEL` intents fold, and `END_BATTLE` reads its result; its init
 * owns every game parameter. Both are plain data and never change identity
 * after `BEGIN_BATTLE`.
 */
export interface JourneyBattleFoldState {
  readonly mode: JourneyBattleMode;
  readonly init: JourneyBattleInit;
  readonly engine: EngineBattleFold;
}

/**
 * The IMMUTABLE journey side of a journey battle: its identity, the journey
 * position `END_BATTLE` hands off to, the reward a victory pays, and what the
 * battle screen displays. The engine init of the same battle owns the game
 * itself: the seed, both decks, the Dreamwell, the score target, the
 * starting side, and the next-battle effects.
 */
export interface JourneyBattleInit {
  readonly battleId: BattleId;
  readonly siteId: SiteId;
  /** The Atlas node the battle takes place in. */
  readonly nodeId: AtlasNodeId | null;
  readonly completionLevelAtStart: number;
  /** The essence a victory pays. */
  readonly essenceReward: number;
  /** Whether the opponent's Avatar ability is active at this layer. */
  readonly opponentAbilityActive: boolean;
  readonly enemyDescriptor: BattleEnemyDescriptor;
  readonly avatarSummary: BattleAvatarSummary | null;
  /**
   * The display definitions of the cards both decks deal: the player's deck
   * entries in a seeded shuffled order, then the opponent's deck. The battle
   * screen shows a card instance with the first definition of its card UUID
   * and transfiguration.
   */
  readonly cardDefinitions: readonly BattleDeckCardDefinition[];
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

// ---------------------------------------------------------------------------
// Loaded journey battles
// ---------------------------------------------------------------------------

/**
 * Validates a raw journey battle (a `LOAD_STATE` payload) into a
 * {@link JourneyBattleFoldState}, or `null` when any field is missing or
 * malformed: every {@link JourneyBattleInit} field, the engine init, and the
 * engine slice down to each committed-state record the battle screen and the
 * engine read. The committed state's zone lists, rank positions, stack cards,
 * and knowledge lists must name instances the state holds, in the zone each
 * list names.
 *
 * Content is not resolved: a well-formed card, Avatar, Dreamsign, or
 * Dreamwell UUID passes whether or not the live catalog holds it. The
 * in-flight step and the slice history are checked by kind and shape; the
 * engine's own error boundary contains a step that fails to replay. The
 * validated init and engine battle are kept as loaded.
 */
export function parseJourneyBattleFoldState(
  value: Record<string, unknown>,
): JourneyBattleFoldState | null {
  const engine = value.engine;
  if (
    !isPlainRecord(value.mode) ||
    value.mode.kind !== "journey" ||
    !isJourneyBattleInit(value.init) ||
    !isPlainRecord(engine) ||
    !isEngineBattleInit(engine.init) ||
    !isBattleSlice(engine.slice, true)
  ) {
    return null;
  }
  return {
    mode: { kind: "journey" },
    init: value.init,
    engine: engine as unknown as EngineBattleFold,
  };
}

type Guard = (value: unknown) => boolean;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayOf(value: unknown, guard: Guard): value is unknown[] {
  return Array.isArray(value) && value.every((item) => guard(item));
}

function optional(guard: Guard): Guard {
  return (value) => value === undefined || guard(value);
}

function nullable(guard: Guard): Guard {
  return (value) => value === null || guard(value);
}

function arrayOf(guard: Guard): Guard {
  return (value) => isArrayOf(value, guard);
}

/** Whether `parse` accepts `value`: a brand parser as a guard. */
function parses(parse: (value: unknown) => unknown): Guard {
  return (value) => {
    try {
      parse(value);
      return true;
    } catch {
      return false;
    }
  };
}

function oneOf<T extends string>(table: Readonly<Record<T, true>>): Guard {
  return (value) =>
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(table, value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isIndex(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

/**
 * A record with exactly the two sides as keys, each passing `guard`; with
 * `partial`, either side may be absent.
 */
function sideRecord(guard: Guard, partial = false): Guard {
  return (value) => {
    if (!isPlainRecord(value)) return false;
    if (!Object.keys(value).every((key) => sideFromUnknown(key) !== null)) {
      return false;
    }
    return SIDES.every((side) =>
      partial ? optional(guard)(value[side]) : guard(value[side]),
    );
  };
}

// --- journey side ----------------------------------------------------------

function isJourneyBattleInit(value: unknown): value is JourneyBattleInit {
  return (
    isPlainRecord(value) &&
    parses(parseBattleId)(value.battleId) &&
    parses(parseSiteId)(value.siteId) &&
    nullable(parses(parseAtlasNodeId))(value.nodeId) &&
    isInteger(value.completionLevelAtStart) &&
    isFiniteNumber(value.essenceReward) &&
    isBoolean(value.opponentAbilityActive) &&
    isBattleEnemyDescriptor(value.enemyDescriptor) &&
    nullable(isBattleAvatarSummary)(value.avatarSummary) &&
    isArrayOf(
      value.cardDefinitions,
      (definition) => battleDeckCardDefinitionFromUnknown(definition) !== null,
    )
  );
}

function isBattleEnemyDescriptor(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    parses(parseOpponentId)(value.id) &&
    optional(parses(parseAvatarId))(value.avatarId) &&
    isString(value.name) &&
    isString(value.subtitle) &&
    optional(isString)(value.imageNumber) &&
    isFiniteNumber(value.portraitSeed) &&
    isString(value.abilityText) &&
    isArrayOf(value.dreamsigns, isBattleDreamsignSummary) &&
    isArrayOf(value.signatureCards, isBattleSignatureCard)
  );
}

function isBattleDreamsignSummary(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    parses(parseDreamsignId)(value.id) &&
    isString(value.name) &&
    isString(value.effectDescription) &&
    optional(isString)(value.imageName) &&
    optional(isString)(value.imageAlt)
  );
}

function isBattleSignatureCard(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    parses(parseCardId)(value.cardId) &&
    isInteger(value.cardNumber) &&
    parses(parseCardName)(value.name)
  );
}

function isBattleAvatarSummary(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    (parses(parseAvatarId)(value.id) || parses(parseOpponentId)(value.id)) &&
    isString(value.name) &&
    isString(value.title) &&
    isString(value.renderedText) &&
    isString(value.imageNumber) &&
    optional(isPortraitFocus)(value.portraitFocus)
  );
}

function isPortraitFocus(value: unknown): boolean {
  return isPlainRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

// --- engine init -------------------------------------------------------------

const TRANSFIGURATION_TYPES = {
  Empowered: true,
  Amplified: true,
  Kindled: true,
  Inspired: true,
  Enduring: true,
  Hastened: true,
  Resonant: true,
  Attuned: true,
  Perfected: true,
} as const satisfies Record<TransfigurationType, true>;

const isCardKind = oneOf({ character: true, event: true });

function isEngineBattleInit(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isString(value.seed) &&
    isIndex(value.scoreToWin) &&
    optional(isSide)(value.startingSide) &&
    sideRecord(arrayOf(isEngineDeckEntry))(value.decks) &&
    isArrayOf(value.dreamwell, parses(parseDreamwellCardId)) &&
    optional(sideRecord(parses(parseAvatarId), true))(value.avatars) &&
    optional(sideRecord(arrayOf(parses(parseDreamsignId)), true))(
      value.dreamsigns,
    ) &&
    optional(sideRecord(isNextBattleEffects, true))(value.nextBattle)
  );
}

function isEngineDeckEntry(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    parses(parseCardId)(value.cardId) &&
    optional(isBoolean)(value.amplified) &&
    optional(arrayOf(oneOf(TRANSFIGURATION_TYPES)))(value.transfigurations) &&
    optional(isDeckMods)(value.deckMods)
  );
}

function isDeckMods(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isFiniteNumber(value.sparkBonus) &&
    isFiniteNumber(value.costReduction) &&
    isBoolean(value.fast) &&
    nullable(isFiniteNumber)(value.reclaim) &&
    nullable(
      (change) =>
        isPlainRecord(change) &&
        isCardKind(change.cardType) &&
        isString(change.subtype),
    )(value.typeChange)
  );
}

function isVariant(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isBoolean(value.amplified) &&
    optional(arrayOf(oneOf(TRANSFIGURATION_TYPES)))(value.transfigurations) &&
    optional(isDeckMods)(value.deckMods)
  );
}

function isCardFilter(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    optional(isCardKind)(value.cardType) &&
    optional(isString)(value.subtype)
  );
}

function isNextBattleEffects(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isArrayOf(
      value.openingHand,
      (draw) =>
        isPlainRecord(draw) &&
        isIndex(draw.count) &&
        nullable(isCardFilter)(draw.filter),
    ) &&
    isFiniteNumber(value.startingEnergy) &&
    isArrayOf(
      value.smallerHandAndCostDiscount,
      (discount) =>
        isPlainRecord(discount) &&
        isFiniteNumber(discount.openingHandDelta) &&
        isFiniteNumber(discount.costReduction),
    )
  );
}

// --- engine slice ------------------------------------------------------------

const STEP_KINDS = {
  activate: true,
  advancePhase: true,
  beginBattle: true,
  challengeLane: true,
  loopIteration: true,
  payToEnd: true,
  play: true,
  repeatLoop: true,
  reposition: true,
  resolveTop: true,
  resolveTrigger: true,
} as const satisfies Record<StepKind, true>;

function isBattleSlice(value: unknown, withHistory: boolean): boolean {
  return (
    isPlainRecord(value) &&
    isBattleState(value.committed) &&
    nullable(isInFlight)(value.inFlight) &&
    isIndex(value.publishedEvents) &&
    isIndex(value.attempt) &&
    (value.history === undefined || (withHistory && isSliceHistory(value.history)))
  );
}

function isInFlight(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isPlainRecord(value.step) &&
    oneOf(STEP_KINDS)(value.step.kind) &&
    isBoolean(value.automatic) &&
    isArrayOf(value.answers, isRecordedAnswer)
  );
}

function isRecordedAnswer(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isString(value.fingerprint) &&
    answerFromUnknown(value.value) !== null &&
    (value.auto === undefined || value.auto === true)
  );
}

function isSliceHistory(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isBattleSlice(value.base, false) &&
    isArrayOf(value.entries, isHistoryEntry)
  );
}

function isHistoryEntry(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if ("intent" in value) return battleIntentFromUnknown(value.intent) !== null;
  if ("debug" in value) {
    return isPlainRecord(value.debug) && isString(value.debug.kind);
  }
  return isIndex(value.attempt);
}

/** A slice-history intent as the slice records it, or `null` when malformed. */
function battleIntentFromUnknown(value: unknown): BattleIntent | null {
  if (!isPlainRecord(value)) return null;
  const side = sideFromUnknown(value.side);
  if (side === null) return null;
  if (value.kind === "battleAction") {
    const action = actionFromUnknown(value.action);
    return action === null ? null : { kind: "battleAction", side, action };
  }
  const promptId = promptIdFromUnknown(value.promptId);
  if (promptId === null) return null;
  if (value.kind === "cancel") return { kind: "cancel", side, promptId };
  const answer = answerFromUnknown(value.value);
  return value.kind !== "answer" || answer === null
    ? null
    : { kind: "answer", side, promptId, value: answer };
}

// --- engine committed state ----------------------------------------------------

const ZONES = {
  deck: true,
  hand: true,
  stack: true,
  play: true,
  void: true,
  banished: true,
} as const satisfies Record<Zone, true>;

const KEYWORDS = {
  vengeful: true,
  awakened: true,
  cannotBePrevented: true,
  cannotBeTargeted: true,
  veil: true,
  reclaim: true,
  offering: true,
} as const satisfies Record<Keyword, true>;

const END_REASONS = {
  score: true,
  winCondition: true,
  turnLimit: true,
  resolutionCap: true,
  mandatoryLoop: true,
} as const satisfies Record<EndReason, true>;

const isPhase = (value: unknown): boolean =>
  PHASES.some((phase) => phase === value);
const isSide = (value: unknown): boolean => sideFromUnknown(value) !== null;
const isInstanceId = (value: unknown): boolean =>
  instanceFromUnknown(value) !== null;
const isEffectId = (value: unknown): boolean =>
  idFromUnknown(value, "e") !== null;
const isAbilitySource = (value: unknown): boolean =>
  abilitySourceFromUnknown(value) !== null;
const isFigmentId = parses((value) =>
  parseFigmentId(isString(value) ? value : ""),
);

function isBattleState(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isIndex(value.version) &&
    isString(value.seed) &&
    isPlainRecord(value.rng) &&
    Object.values(value.rng).every(isIndex) &&
    isIndex(value.nextInstance) &&
    isIndex(value.clock) &&
    isBattleConfig(value.config) &&
    isTurnState(value.turn) &&
    sideRecord(isSideState)(value.sides) &&
    isInstances(value.instances) &&
    sideRecord(arrayOf(isInstanceId))(value.knownTo) &&
    isArrayOf(value.stack, isStackItem) &&
    nullable(isSide)(value.priority) &&
    isArrayOf(value.payable, isPayableEffect) &&
    isArrayOf(value.triggerQueue, isQueuedTrigger) &&
    isArrayOf(value.floating, isFloatingEffect) &&
    isTurnLog(value.turnLog) &&
    isIndex(value.nextEffect) &&
    isArrayOf(value.oncePerTurn, isString) &&
    isDreamwellState(value.dreamwell) &&
    nullable(isChallengeState)(value.challenge) &&
    isIndex(value.automaticSteps) &&
    isIndex(value.automaticChoices) &&
    isLoopTracker(value.loops) &&
    nullable(isBattleResult)(value.result) &&
    hasConsistentZones(value)
  );
}

function isBattleConfig(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    [
      value.scoreToWin,
      value.turnLimit,
      value.handLimit,
      value.resolutionCap,
      value.mandatoryLoopCheckFrom,
      value.mandatoryLoopWindow,
      value.loopIterationCap,
      value.loopHistoryActions,
      value.feasibilitySearchRuns,
    ].every(isIndex) &&
    sideRecord(isIndex)(value.openingHandSize) &&
    isSide(value.startingSide) &&
    isBoolean(value.skipFirstDraw) &&
    isBoolean(value.autoAnswerForcedPrompts) &&
    isPlainRecord(value.dreamwell) &&
    isArrayOf(value.dreamwell.recurringOrders, isInteger) &&
    isIndex(value.dreamwell.cardsPerRecurringOrder) &&
    isIndex(value.dreamwell.minimumConstructedLength)
  );
}

function isTurnState(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isIndex(value.round) &&
    isIndex(value.turnNumber) &&
    isSide(value.active) &&
    isPhase(value.phase) &&
    sideRecord(isIndex)(value.sideTurns) &&
    isBoolean(value.extra) &&
    isSide(value.lastNormal) &&
    isArrayOf(value.extraTurns, isSide) &&
    nullable(isIndex)(value.challengeLane) &&
    isBoolean(value.beginning)
  );
}

function isSideState(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.currentEnergy) &&
    isFiniteNumber(value.maxEnergy) &&
    isIndex(value.fatigueCount) &&
    isArrayOf(value.deck, isInstanceId) &&
    isArrayOf(value.hand, isInstanceId) &&
    isArrayOf(value.void, isInstanceId) &&
    isArrayOf(value.banished, isInstanceId) &&
    isArrayOf(value.backRank, nullable(isInstanceId)) &&
    value.backRank.length === BACK_RANK_SIZE &&
    isArrayOf(value.frontRank, nullable(isInstanceId)) &&
    value.frontRank.length === FRONT_RANK_SIZE &&
    nullable(
      (avatar) =>
        isPlainRecord(avatar) &&
        parses(parseAvatarId)(avatar.id) &&
        isBoolean(avatar.exhausted),
    )(value.avatar) &&
    isArrayOf(
      value.dreamsigns,
      (dreamsign) =>
        isPlainRecord(dreamsign) && parses(parseDreamsignId)(dreamsign.id),
    )
  );
}

function isInstances(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    Object.entries(value).every(
      ([id, instance]) =>
        isCardInstance(instance) &&
        (instance as Record<string, unknown>).id === id,
    )
  );
}

function isCardInstance(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isInstanceId(value.id) &&
    isPrinting(value.printing) &&
    isSide(value.owner) &&
    isSide(value.controller) &&
    oneOf(ZONES)(value.zone) &&
    isVariant(value.variant) &&
    isCardStatus(value.status) &&
    isIndex(value.enteredZoneAt)
  );
}

function isPrinting(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  switch (value.kind) {
    case "card":
      return parses(parseCardId)(value.cardId);
    case "figment":
      return isFigmentId(value.figment) && isFiniteNumber(value.spark);
    case "figmentCopy":
      return (
        parses(parseCardId)(value.cardId) && nullable(isFiniteNumber)(value.spark)
      );
    default:
      return false;
  }
}

function isCardStatus(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isBoolean(value.exhausted) &&
    isFiniteNumber(value.gainedSpark) &&
    isFiniteNumber(value.counters) &&
    isBoolean(value.created) &&
    isBoolean(value.reclaimed) &&
    isBoolean(value.offering) &&
    isBoolean(value.ephemeral) &&
    nullable(isFiniteNumber)(value.x)
  );
}

function isAbilityOrigin(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  switch (value.kind) {
    case "card":
      return parses(parseCardId)(value.cardId) && isVariant(value.variant);
    case "figment":
      return isFigmentId(value.id);
    case "avatar":
      return parses(parseAvatarId)(value.id);
    case "dreamsign":
      return parses(parseDreamsignId)(value.id);
    default:
      return false;
  }
}

function isEffectChoices(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isArrayOf(value.modes, isIndex) &&
    isArrayOf(value.targets, arrayOf(isInstanceId))
  );
}

function isStackItem(value: unknown): boolean {
  if (
    !isPlainRecord(value) ||
    !isSide(value.controller) ||
    !nullable(isInteger)(value.x) ||
    !isArrayOf(value.optionalPaid, isBoolean)
  ) {
    return false;
  }
  if (value.kind === "card") {
    return (
      isInstanceId(value.instance) &&
      isArrayOf(value.choices, isEffectChoices) &&
      optional((slot) => slotFromUnknown(slot) !== null)(value.slot)
    );
  }
  return (
    value.kind === "ability" &&
    isAbilitySource(value.source) &&
    isIndex(value.ability) &&
    isAbilityOrigin(value.origin) &&
    isEffectChoices(value.choices)
  );
}

function isPayableEffect(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isEffectId(value.id) &&
    isSide(value.payer) &&
    isFiniteNumber(value.cost) &&
    isAbilitySource(value.source) &&
    isArrayOf(value.affects, isInstanceId)
  );
}

function isExpiry(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  switch (value.at) {
    case "endOfTurn":
    case "nextDay":
    case "never":
      return true;
    case "turnStart":
      return isSide(value.side);
    case "sourceLeavesPlay":
      return isInstanceId(value.source);
    case "paid":
      return isEffectId(value.effect);
    default:
      return false;
  }
}

function isEffectRef(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isAbilityOrigin(value.origin) &&
    isIndex(value.ability) &&
    isIndex(value.node)
  );
}

function isFloatingChange(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  switch (value.kind) {
    case "allTypes":
    case "temporary":
      return isInstanceId(value.instance);
    case "keyword":
      return (
        isInstanceId(value.instance) &&
        oneOf(KEYWORDS)(value.keyword) &&
        isBoolean(value.gains)
      );
    case "baseSpark":
      return isInstanceId(value.instance) && isFiniteNumber(value.value);
    case "spark":
      return isInstanceId(value.instance) && isFiniteNumber(value.amount);
    case "cost":
      return (
        isSide(value.player) &&
        isCardFilter(value.filter) &&
        isFiniteNumber(value.amount) &&
        isBoolean(value.next)
      );
    case "trigger":
      return isEffectRef(value.ref) && isBoolean(value.once);
    case "disableTriggers":
      return isInstanceId(value.instance) && optional(isPlainRecord)(value.while);
    case "banishedUntil":
      return isInstanceId(value.instance) && isSide(value.side);
    default:
      return false;
  }
}

function isFloatingEffect(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isEffectId(value.id) &&
    isSide(value.controller) &&
    isAbilitySource(value.source) &&
    isIndex(value.timestamp) &&
    isExpiry(value.expiry) &&
    isFloatingChange(value.change)
  );
}

function isQueuedTrigger(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isAbilitySource(value.source) &&
    isSide(value.controller) &&
    isAbilityOrigin(value.origin) &&
    isIndex(value.ability) &&
    nullable(isIndex)(value.node) &&
    nullable(isInstanceId)(value.subject) &&
    optional(arrayOf(isSide))(value.subjectHiddenFrom) &&
    optional(
      (gain) =>
        isPlainRecord(gain) &&
        isFiniteNumber(gain.amount) &&
        isExpiry(gain.expiry),
    )(value.gain)
  );
}

function isTurnLog(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    sideRecord(
      arrayOf(
        (played) =>
          isPlainRecord(played) &&
          isInstanceId(played.instance) &&
          isCardKind(played.cardType) &&
          isString(played.subtype) &&
          isBoolean(played.allTypes),
      ),
    )(value.played) &&
    sideRecord(isIndex)(value.drawn)
  );
}

function isDreamwellState(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isArrayOf(value.deck, parses(parseDreamwellCardId)) &&
    isIndex(value.next) &&
    isArrayOf(value.catalog, parses(parseDreamwellCardId))
  );
}

function isChallengeState(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isArrayOf(value.challengers, isInstanceId) &&
    isPlainRecord(value.blockers) &&
    Object.entries(value.blockers).every(
      ([challenger, blocker]) =>
        isInstanceId(challenger) && isInstanceId(blocker),
    )
  );
}

function isLoopTracker(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    nullable(isPlainRecord)(value.scope) &&
    isArrayOf(value.checkpoints, isPlainRecord) &&
    isArrayOf(value.actions, isPlainRecord) &&
    nullable(isPlainRecord)(value.candidate) &&
    nullable(isPlainRecord)(value.run) &&
    isIndex(value.nextLoop) &&
    nullable(isPlainRecord)(value.cycle)
  );
}

function isBattleResult(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (value.kind === "victory") {
    return (
      isSide(value.winner) &&
      (value.reason === "score" || value.reason === "winCondition")
    );
  }
  return value.kind === "draw" && oneOf(END_REASONS)(value.reason);
}

/**
 * Every instance a zone list, rank position, stack card, or knowledge list
 * names exists, and the zone lists, ranks, and stack name it in its own zone.
 */
function hasConsistentZones(value: Record<string, unknown>): boolean {
  const state = value as unknown as BattleState;
  const inZone = (id: InstanceId, zone: Zone): boolean =>
    Object.prototype.hasOwnProperty.call(state.instances, id) &&
    state.instances[id].zone === zone;
  return (
    SIDES.every((side) => {
      const sideState = state.sides[side];
      return (
        (["deck", "hand", "void", "banished"] as const).every((zone) =>
          sideState[zone].every((id) => inZone(id, zone)),
        ) &&
        [...sideState.backRank, ...sideState.frontRank].every(
          (id) => id === null || inZone(id, "play"),
        ) &&
        state.knownTo[side].every((id) =>
          Object.prototype.hasOwnProperty.call(state.instances, id),
        )
      );
    }) &&
    state.stack.every(
      (item) => item.kind !== "card" || inZone(item.instance, "stack"),
    )
  );
}

// --- engine values -------------------------------------------------------------
// The engine intents' value decoders, shared by the intent payloads
// (`engine-battle.ts`) and the slice history above.

export function sideFromUnknown(value: unknown): Side | null {
  return value === "player" || value === "enemy" ? value : null;
}

export function promptIdFromUnknown(value: unknown): PromptId | null {
  return typeof value === "string" && /^\d+:\d+:\d+$/u.test(value) ? parsePromptId(value) : null;
}

function idFromUnknown<Prefix extends string>(value: unknown, prefix: Prefix): `${Prefix}${number}` | null {
  return typeof value === "string" && new RegExp(`^${prefix}\\d+$`, "u").test(value)
    ? (value as `${Prefix}${number}`)
    : null;
}

function instanceFromUnknown(value: unknown): InstanceId | null {
  return idFromUnknown(value, "i");
}

function slotFromUnknown(value: unknown): Slot | null {
  if (!isPlainRecord(value) || (value.rank !== "front" && value.rank !== "back") || !isIndex(value.index)) return null;
  return { rank: value.rank, index: value.index };
}

export function actionFromUnknown(value: unknown): Action | null {
  if (!isPlainRecord(value)) return null;
  switch (value.kind) {
    case "play": {
      const card = instanceFromUnknown(value.card);
      const slot = value.slot === undefined ? undefined : slotFromUnknown(value.slot);
      if (card === null || (value.from !== "hand" && value.from !== "void") || slot === null) return null;
      return { kind: "play", card, from: value.from, ...(slot === undefined ? {} : { slot }) };
    }
    case "activate": {
      const source = abilitySourceFromUnknown(value.source);
      return source === null || !isIndex(value.ability) ? null : { kind: "activate", source, ability: value.ability };
    }
    case "reposition": {
      const card = instanceFromUnknown(value.card);
      const to = slotFromUnknown(value.to);
      return card === null || to === null ? null : { kind: "reposition", card, to };
    }
    case "pass":
      return { kind: "pass" };
    case "payToEnd": {
      const effect = idFromUnknown(value.effect, "e");
      return effect === null ? null : { kind: "payToEnd", effect };
    }
    case "repeatLoop": {
      const loop = idFromUnknown(value.loop, "l");
      const count = value.count === "untilVictory" || isIndex(value.count) ? value.count : null;
      return loop === null || count === null ? null : { kind: "repeatLoop", loop, count };
    }
    default:
      return null;
  }
}

function abilitySourceFromUnknown(value: unknown): AbilitySource | null {
  const instance = instanceFromUnknown(value);
  if (instance !== null) return instance;
  if (!isPlainRecord(value)) return null;
  const side = sideFromUnknown(value.side);
  if (side === null) return null;
  if (value.kind === "avatar") return { kind: "avatar", side };
  return value.kind === "dreamsign" && isIndex(value.index) ? { kind: "dreamsign", side, index: value.index } : null;
}

export function answerFromUnknown(value: unknown): Answer | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (!Array.isArray(value)) return null;
  const cards: InstanceId[] = [];
  const arrangement: { card: InstanceId; to: "top" | "bottom" | "void" | "hand" }[] = [];
  for (const item of value as unknown[]) {
    const card = instanceFromUnknown(item);
    if (card !== null) {
      cards.push(card);
      continue;
    }
    if (!isPlainRecord(item)) return null;
    const placed = instanceFromUnknown(item.card);
    const to = item.to;
    if (placed === null || (to !== "top" && to !== "bottom" && to !== "void" && to !== "hand")) return null;
    arrangement.push({ card: placed, to });
  }
  if (cards.length > 0 && arrangement.length > 0) return null;
  return arrangement.length > 0 ? arrangement : cards;
}
