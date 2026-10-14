// Immutable battle display metadata and engine slices, plus load validation.
import { isNamedTrigger } from "../../engine/dsl/abilities";
import { isFixedChange } from "../../engine/view/knowledge";
import { BATTLE } from "../../content/battle";
import type { BattleAvatarSummary, BattleDeckCardDefinition, BattleEnemyDescriptor, BattleSide, FrontRankSlotId } from "../../battle/types";
import type { BattleInit as EngineBattleInit } from "../../engine";
import type { BattleIntent, BattleSlice } from "../../engine/fold/slice";
import type { CardFilter, Keyword } from "../../engine/dsl/types";
import type { Answer } from "../../engine/prompts/types";
import type { Action } from "../../engine/rules/actions";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, PHASES, SIDES, parseFigmentId, type AbilitySource, type InstanceId, type Side, type Slot, type Zone } from "../../engine/state/ids";
import type { BattleState, EndReason, FloatingChange } from "../../engine/state/types";
import type { StepKind } from "../../engine/steps/kinds";
import { battleDeckCardDefinitionFromUnknown } from "../../battle/card-definition";
import type { TransfigurationType } from "../../types/journey";
import type { TutorialTriggerDefinition } from "../../types/tutorial";
import type { CardId } from "../../types/card-identity";
import { parseCardId, parseCardName } from "../../types/card-identity";
import type { AtlasNodeId, BattleCardId, BattleId, DreamwellCardId, PresentationId, PromptId, SiteId, TutorialRunId, TutorialTriggerId } from "../../types/identifiers";
import { parseAtlasNodeId, parseAvatarId, parseApollyonIncarnationId, parseBattleId, parseDreamsignId, parseDreamwellCardId, parseOpponentId, parsePromptId, parseSiteId } from "../../types/identifiers";
import type { PolicyOverrideContext, PolicyOverrideSelection } from "../../engine/policy/overrides";

export type BattleFoldState = JourneyBattleFoldState | TutorialBattleFoldState;
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


/** One engine battle, regardless of its host screen. */
export interface EngineBattleFold {
  readonly init: EngineBattleInit;
  readonly slice: BattleSlice;
}

/** Display-only catalog and Avatar metadata for the standalone battle. */
export interface TutorialBattleDisplayInit extends JourneyBattleInit {
  readonly dreamwellDeck: readonly import("../../battle/types").DreamwellCardDefinition[];
  readonly tutorialTriggers: readonly TutorialTriggerDefinition[];
}

/** Durable playback frame; rules always read engine.slice instead. */
export interface TutorialCheckpoint {
  readonly presentation: TutorialBattlePresentation;
  readonly before: BattleState;
  readonly state: BattleState;
}

export interface TutorialBattleFoldState {
  readonly mode: TutorialBattleMode;
  readonly init: TutorialBattleDisplayInit;
  readonly engine: EngineBattleFold;
  readonly checkpoints: readonly TutorialCheckpoint[];
  readonly tutorialPresentation: TutorialBattlePresentation | null;
  readonly overrides: PolicyOverrideContext;
  readonly pendingOverride: PolicyOverrideSelection | null;
  readonly overrideCommits: readonly PolicyOverrideSelection[];
}

export type BattleMode = JourneyBattleMode | TutorialBattleMode;
export interface JourneyBattleMode { readonly kind: "journey" }
export interface TutorialBattleMode {
  readonly kind: "tutorial";
  readonly tutorialRunId: TutorialRunId;
  readonly restartNumber: number;
}

export function tutorialBattleOf(battle: BattleFoldState | null): TutorialBattleFoldState | null {
  return battle?.mode.kind === "tutorial" ? battle as TutorialBattleFoldState : null;
}
export function journeyBattleOf(battle: BattleFoldState | null): JourneyBattleFoldState | null {
  return battle?.mode.kind === "journey" ? battle as JourneyBattleFoldState : null;
}
export function engineBattleOf(battle: BattleFoldState | null): BattleFoldState | null { return battle; }
export function battleModeOf(battle: BattleFoldState): BattleMode { return battle.mode; }

export type TutorialBattlePresentation = OpponentPlayPresentation | DreamwellRevealPresentation | OpponentBlockPresentation | ChallengeResolvedPresentation | TutorialGuidancePresentation;

/** Validates engine snapshots and their immutable declared source pools. */
export function parseEngineBattleFold(value: unknown): EngineBattleFold | null {
  if (!isPlainRecord(value) || !isEngineBattleInit(value.init) || !isBattleSlice(value.slice, true)) return null;
  const fold = value as unknown as EngineBattleFold;
  return hasConsistentDraftPools(fold) ? fold : null;
}

function hasConsistentDraftPools(fold: EngineBattleFold): boolean {
  const expected = fold.init.draftPools;
  const states = [fold.slice.committed, ...(fold.slice.history === undefined ? [] : [fold.slice.history.base.committed])];
  return states.every((state) => {
    const actual = state.draftPools;
    if (expected === undefined || actual === undefined) return expected === actual;
    return SIDES.every((side) => expected[side].length === actual[side].length &&
      expected[side].every((cardId, index) => cardId === actual[side][index]));
  });
}

export function parseJourneyBattleFoldState(value: Record<string, unknown>): JourneyBattleFoldState | null {
  const engine = parseEngineBattleFold(value.engine);
  return isPlainRecord(value.mode) && value.mode.kind === "journey" && isJourneyBattleInit(value.init) && engine !== null
    ? { mode: { kind: "journey" }, init: value.init, engine } : null;
}
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

/** A queued Mira explanation and the exact battle work parked behind it. */
export interface TutorialGuidancePresentation {
  readonly id: PresentationId;
  readonly kind: "tutorial-guidance";
  readonly source: TutorialGuidanceSource;
  readonly messages: readonly TutorialGuidanceMessage[];
  readonly messageIndex: number;
  readonly automatic: boolean;
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
    optional(parses(parseApollyonIncarnationId))(value.incarnationId) &&
    optional(parses(parseAvatarId))(value.aspectId) &&
    ((value.incarnationId === undefined) === (value.aspectId === undefined)) &&
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
    optional(sideRecord(arrayOf(parses(parseCardId))))(value.draftPools) &&
    isArrayOf(value.dreamwell, parses(parseDreamwellCardId)) &&
    optional(sideRecord(parses(parseAvatarId), true))(value.avatars) &&
    optional(sideRecord(arrayOf(parses(parseDreamsignId)), true))(
      value.dreamsigns,
    ) &&
    optional(sideRecord(isNextBattleEffects, true))(value.nextBattle) &&
    optional(isVictorySides)(value.victorySides) &&
    optional(nullable(isPositiveIndex))(value.turnLimit) &&
    (value.setup === undefined || isEngineSetup(value.setup, value))
  );
}

function isPositiveIndex(value: unknown): value is number {
  return isIndex(value) && value > 0;
}

function isVictorySides(value: unknown): boolean {
  return isArrayOf(value, isSide) && value.length > 0 && Array.from(value).every(isSide) && new Set(value).size === value.length;
}

function hasOnlyFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return isPlainRecord(value) && Object.keys(value).every((key) => fields.includes(key));
}

function isNonnegativeNumber(value: unknown): boolean {
  return isFiniteNumber(value) && value >= 0;
}

/** Saved declarations are structural; catalog resolution belongs to engine initialization. */
function isEngineSetup(value: unknown, init: Record<string, unknown>): boolean {
  if (!hasOnlyFields(value, ["placements", "sides", "turn", "dreamwell"]) ||
      !isArrayOf(value.placements, isPlainRecord) || !sideRecord((resources) =>
        hasOnlyFields(resources, ["currentEnergy", "maxEnergy", "score"]) &&
        [resources.currentEnergy, resources.maxEnergy, resources.score].every(isNonnegativeNumber))(value.sides) ||
      !hasOnlyFields(value.turn, ["active", "phase", "round", "turnNumber", "sideTurns", "lastNormal"]) ||
      !hasOnlyFields(value.dreamwell, ["deck", "next"]) || !isArrayOf(value.dreamwell.deck, parses(parseDreamwellCardId)) ||
      !isIndex(value.dreamwell.next) || value.dreamwell.next > value.dreamwell.deck.length ||
      !isArrayOf(init.dreamwell, parses(parseDreamwellCardId)) ||
      !isPlainRecord(init.decks)) return false;
  const dreamwellCatalog = init.dreamwell;
  if (new Set(dreamwellCatalog).size !== dreamwellCatalog.length || !value.dreamwell.deck.every((id) => dreamwellCatalog.includes(id))) return false;
  const turn = value.turn;
  if (!isSide(turn.active) || turn.lastNormal !== turn.active || (turn.phase !== "draw" && turn.phase !== "dawn" && turn.phase !== "day") ||
      !isPositiveIndex(turn.round) || !isPositiveIndex(turn.turnNumber) || !sideRecord(isIndex)(turn.sideTurns) ||
      !isPlainRecord(turn.sideTurns)) return false;
  const first = init.startingSide ?? BATTLE.startingSide;
  const second = first === "player" ? "enemy" : "player";
  const limit = init.turnLimit === undefined ? BATTLE.turnLimit : init.turnLimit;
  if ((first !== "player" && first !== "enemy") || turn.sideTurns[first] !== Math.ceil(turn.turnNumber / 2) ||
      turn.sideTurns[second] !== Math.floor(turn.turnNumber / 2) || turn.round !== Math.ceil(turn.turnNumber / 2) ||
      turn.active !== (turn.turnNumber % 2 === 1 ? first : second) ||
      (limit !== null && (!isPositiveIndex(limit) || turn.round > limit))) return false;
  if (isPlainRecord(init.nextBattle) && Object.values(init.nextBattle).some((effects) =>
    !isPlainRecord(effects) || effects.startingEnergy !== 0 || !Array.isArray(effects.openingHand) || effects.openingHand.length !== 0 ||
    !isArrayOf(effects.smallerHandAndCostDiscount, (discount) => isPlainRecord(discount) && discount.openingHandDelta === 0))) return false;
  const copies = new Set<string>();
  const slots = new Set<string>();
  for (const placement of value.placements) {
    if (!hasOnlyFields(placement, ["side", "deckIndex", "zone", "slot", "exhausted"])) return false;
    const side = sideFromUnknown(placement.side);
    if (side === null || !isIndex(placement.deckIndex) || !Array.isArray(init.decks[side]) ||
        placement.deckIndex >= init.decks[side].length || (placement.zone !== "hand" && placement.zone !== "void" && placement.zone !== "play")) return false;
    const copy = `${side}:${placement.deckIndex}`;
    if (copies.has(copy)) return false;
    copies.add(copy);
    if (placement.zone !== "play") {
      if (placement.slot !== undefined || placement.exhausted !== undefined) return false;
      continue;
    }
    if (!hasOnlyFields(placement.slot, ["rank", "index"]) ||
        (placement.slot.rank !== "front" && placement.slot.rank !== "back") || !isIndex(placement.slot.index) ||
        placement.slot.index >= (placement.slot.rank === "front" ? FRONT_RANK_SIZE : BACK_RANK_SIZE) ||
        !optional(isBoolean)(placement.exhausted)) return false;
    const cell = `${side}:${placement.slot.rank}:${placement.slot.index}`;
    if (slots.has(cell)) return false;
    slots.add(cell);
  }
  return true;
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


const CARD_FILTER_VALIDATORS = {
  hasAbility: optional(isNamedTrigger),
  fast: optional((value) => value === true),
  cardType: optional(isCardKind),
  subtype: optional(isString),
  costAtMost: optional(isIndex),
  costAtLeast: optional(isIndex),
  sparkAtMost: optional(isFiniteNumber),
  sparkAtLeast: optional(isFiniteNumber),
} satisfies Record<keyof CardFilter, (value: unknown) => boolean>;

function isCardFilter(value: unknown): boolean {
  return isPlainRecord(value) && Object.entries(CARD_FILTER_VALIDATORS).every(([field, validate]) => validate(value[field]));
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
    (value.step.kind !== "beginBattle" || optional(oneOf({ draw: true, dawn: true, day: true }))(value.step.preparedPhase)) &&
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
    optional(sideRecord(arrayOf(parses(parseCardId))))(value.draftPools) &&
    isIndex(value.nextInstance) &&
    isIndex(value.clock) &&
    isBattleConfig(value.config) &&
    isTurnState(value.turn) &&
    sideRecord(isSideState)(value.sides) &&
    isInstances(value.instances) &&
    sideRecord(arrayOf(isInstanceId))(value.knownTo) &&
    (value.rememberedCards === undefined || sideRecord(arrayOf(isRememberedCard))(value.rememberedCards)) &&
    optional(arrayOf(isLinkedBanishedCards))(value.linkedBanished) &&
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
    hasConsistentZones(value) &&
    hasMirroredGainedAbilities(value) &&
    hasConsistentLinkedBanish(value) &&
    hasConsistentPoolCandidates(value) &&
    (() => {
      const state = value as unknown as BattleState;
      return state.triggerQueue.every(trigger => {
        for (let current: typeof trigger | undefined = trigger; current !== undefined; current = current.triggeringAbility?.occurrence) {
          if (current.discardedCount !== undefined && current.discardedCount >= state.nextInstance) return false;
        }
        return true;
      });
    })()
  );
}

/** An observed snapshot may be stale; only its physical ownership and fixed-effect targets remain structural references. */
function isRememberedCard(value: unknown): boolean {
  return isPlainRecord(value) && isInstanceId(value.instance) && isSide(value.owner) &&
    isPrinting(value.printing) && isVariant(value.variant) && isCardStatus(value.status) &&
    isArrayOf(value.effects, (effect) => isFloatingEffect(effect) && isPlainRecord(effect) &&
      isPlainRecord(effect.expiry) && effect.expiry.at === "never" && isPlainRecord(effect.change) &&
      effect.change.instance === value.instance && isString(effect.change.kind) && isFixedChange(effect.change.kind));
}

function isBattleConfig(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    [
      value.scoreToWin,
      value.handLimit,
      value.resolutionCap,
      value.mandatoryLoopCheckFrom,
      value.mandatoryLoopWindow,
      value.loopIterationCap,
      value.loopHistoryActions,
      value.feasibilitySearchRuns,
      value.discoverOptions,
    ].every(isIndex) &&
    nullable(isPositiveIndex)(value.turnLimit) &&
    optional(isVictorySides)(value.victorySides) &&
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
    isBoolean(value.beginning) &&
    (value.endingCleanup === undefined || value.endingCleanup === true)
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
    optional((domain) => Array.isArray(domain) && domain.length > 0 && domain.every(parses(parseCardId)))(value.poolCandidates) &&
    isCardStatus(value.status) &&
    isIndex(value.enteredZoneAt)
  );
}

/** Captured pool domains belong to created cards in surviving zones and preserve source copy bounds. */
function hasConsistentPoolCandidates(value: Record<string, unknown>): boolean {
  const state = value as unknown as BattleState;
  return Object.values(state.instances).every((instance) => {
    const candidates = instance.poolCandidates;
    if (candidates === undefined) return true;
    if (!instance.status.created || instance.printing.kind !== "card" || instance.variant.amplified ||
      instance.variant.transfigurations !== undefined || instance.variant.deckMods !== undefined ||
      !candidates.includes(instance.printing.cardId) || !["hand", "stack", "play"].includes(instance.zone)) return false;
    const available = [...(state.draftPools?.[instance.owner] ?? [])];
    for (const cardId of candidates) {
      const index = available.indexOf(cardId);
      if (index < 0) return false;
      available.splice(index, 1);
    }
    const cardId = instance.printing.cardId;
    return SIDES.every((side) => (state.rememberedCards?.[side] ?? []).every((record) =>
      record.instance !== instance.id || (record.owner === instance.owner && record.status.created &&
        record.printing.kind === "card" && record.printing.cardId === cardId && !record.variant.amplified &&
        record.variant.transfigurations === undefined && record.variant.deckMods === undefined)));
  });
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
    nullable(isFiniteNumber)(value.x) &&
    optional(isGainedAbilitiesList)(value.gainedAbilities) &&
    optional(isLostCount(value.gainedAbilities))(value.lostAbilities)
  );
}

/** A count of lost gained groups: at most the number of groups `gained` lists. */
function isLostCount(gained: unknown): (value: unknown) => boolean {
  return (value) => isIndex(value) && value <= (Array.isArray(gained) ? gained.length : 0);
}

/** One gained group: a card for its variant, or a figment type. */
function isGainedAbilities(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  return "figment" in value
    ? Object.keys(value).length === 1 && isFigmentId(value.figment)
    : parses(parseCardId)(value.cardId) && isVariant(value.variant);
}

/** A non-empty list of gained abilities: an empty one is absent instead. */
function isGainedAbilitiesList(value: unknown): boolean {
  return isArrayOf(value, isGainedAbilities) && value.length > 0;
}

function isAbilityOrigin(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  switch (value.kind) {
    case "card":
      return parses(parseCardId)(value.cardId) && isVariant(value.variant) && optional(isGainedAbilitiesList)(value.gained) &&
        optional(isLostCount(value.gained))(value.lost);
    case "figment":
      return isFigmentId(value.id) && optional((lost) => lost === true)(value.lost);
    case "avatar":
      return parses(parseAvatarId)(value.id);
    case "dreamsign":
      return parses(parseDreamsignId)(value.id);
    case "dreamwell":
      return parses(parseDreamwellCardId)(value.id);
    default:
      return false;
  }
}

function isAbandonedPosition(value: unknown): boolean {
  if (!isPlainRecord(value) || !isSide(value.side)) return false;
  const slot = slotFromUnknown(value.slot);
  return slot !== null && slot.index < (slot.rank === "front" ? FRONT_RANK_SIZE : BACK_RANK_SIZE);
}

function isEffectChoices(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isArrayOf(value.modes, isIndex) &&
    isArrayOf(value.targets, arrayOf(isInstanceId)) &&
    optional(isAbandonedPosition)(value.abandonedPosition)
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
    isEffectChoices(value.choices) &&
    optional((spark) => isFiniteNumber(spark) && spark >= 0)(value.lastKnownSourceSpark)
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

/** Saved-state validation for every floating change kind. */
const FLOATING_CHANGE_VALIDATORS: {
  readonly [K in FloatingChange["kind"]]: (value: Record<string, unknown>) => boolean;
} = {
  allTypes: (value) => isInstanceId(value.instance),
  temporary: (value) => isInstanceId(value.instance),
  keyword: (value) =>
    isInstanceId(value.instance) &&
    oneOf(KEYWORDS)(value.keyword) &&
    isBoolean(value.gains),
  subtype: (value) => isInstanceId(value.instance) && typeof value.subtype === "string",
  baseSpark: (value) => isInstanceId(value.instance) && isFiniteNumber(value.value),
  spark: (value) => isInstanceId(value.instance) && isFiniteNumber(value.amount),
  cost: (value) =>
    isSide(value.player) &&
    isCardFilter(value.filter) &&
    isFiniteNumber(value.amount) &&
    isBoolean(value.next),
  cardCost: (value) => isInstanceId(value.instance) && (value.mode === "set" || value.mode === "increase" || value.mode === "reduce") && isIndex(value.amount),
  trigger: (value) => isEffectRef(value.ref) && isBoolean(value.once) && optional(arrayOf(isInstanceId))(value.captured) &&
    optional((spark) => isFiniteNumber(spark) && spark >= 0)(value.lastKnownSourceSpark),
  disableTriggers: (value) => isInstanceId(value.instance) && optional(isPlainRecord)(value.while) &&
    optional(oneOf({ triggered: true, triggeredAndActivated: true }))(value.mode),
  banishedUntil: (value) => isInstanceId(value.instance) && isSide(value.side),
  banishedToHandUntil: (value) => isInstanceId(value.instance) && isIndex(value.banishedAt) && value.banishedAt > 0,
  additionalDrawPhaseCards: () => false, // Draw-phase instructions are static-only.
  ruleModifier: () => false, // Player rules are static-only.
  preserveEphemeralHand: () => false, // A static instruction never enters saved floating effects.
  revealDeckTop: () => false, // A static instruction never enters saved floating effects.
  playFrom: (value) =>
    isSide(value.player) &&
    (value.zone === "void" || (value.zone === "deck" && value.instance === null)) &&
    nullable(isInstanceId)(value.instance) &&
    isCardFilter(value.filter) &&
    isBoolean(value.next),
  cannotPlay: (value) =>
    nullable(isSide)(value.player) &&
    nullable(isInstanceId)(value.instance) &&
    isCardFilter(value.filter),
  playLimit: (value) => isSide(value.player) && isIndex(value.count),
  abilities: (value) => isInstanceId(value.instance) && ("figment" in value
    ? Object.keys(value).length === 3 && isFigmentId(value.figment)
    : parses(parseCardId)(value.cardId) && isVariant(value.variant)),
  loseAbilities: (value) => isInstanceId(value.instance),
  // This continuous change is made only by static abilities, not saved floating effects.
  reclaimNotBanished: () => false,
};

function isFloatingChangeKind(value: unknown): value is FloatingChange["kind"] {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FLOATING_CHANGE_VALIDATORS, value);
}

function isFloatingChange(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  const kind = value.kind;
  return isFloatingChangeKind(kind) && FLOATING_CHANGE_VALIDATORS[kind](value);
}

function isFloatingEffect(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isEffectId(value.id) &&
    isSide(value.controller) &&
    isAbilitySource(value.source) &&
    isIndex(value.timestamp) &&
    isExpiry(value.expiry) &&
    isFloatingChange(value.change) &&
    (value.sourceObservedBy === undefined || (isPlainRecord(value.change) && value.change.kind === "disableTriggers" && value.change.mode === "triggeredAndActivated" &&
      isArrayOf(value.sourceObservedBy, isSide) && new Set(value.sourceObservedBy).size === value.sourceObservedBy.length))
  );
}

/** History can name a ceased source, but visits are bounded by the battle clock and cells are unambiguous. */
function hasConsistentLinkedBanish(value: Record<string, unknown>): boolean {
  const state = value as unknown as BattleState;
  const records = state.linkedBanished ?? [];
  if (records.some((record, index) => record.enteredPlayAt > state.clock ||
    record.cards.some((member, index) => member.enteredBanishedAt > state.clock || record.cards.slice(0, index).some((earlier) => earlier.instance === member.instance && earlier.enteredBanishedAt === member.enteredBanishedAt)) ||
    records.slice(0, index).some((earlier) => earlier.source === record.source && earlier.enteredPlayAt === record.enteredPlayAt &&
      earlier.gainedFrom === record.gainedFrom && earlier.ability === record.ability))) return false;
  return state.triggerQueue.every(trigger => {
    for (let current: typeof trigger | undefined = trigger; current !== undefined; current = current.triggeringAbility?.occurrence) {
      if (current.linkedSource !== undefined && current.linkedSource.enteredPlayAt > state.clock) return false;
    }
    return true;
  });
}

function isLinkedSource(value: unknown): boolean {
  return isPlainRecord(value) && isInstanceId(value.source) && isIndex(value.enteredPlayAt) &&
    isIndex(value.ability) && optional(isEffectId)(value.gainedFrom);
}

function isLinkedBanishedCards(value: unknown): boolean {
  return isLinkedSource(value) && isPlainRecord(value) && isArrayOf(value.cards, (card) =>
    isPlainRecord(card) && isInstanceId(card.instance) && isIndex(card.enteredBanishedAt));
}

/** Exact captured hand-copy data carries no live-original existence requirement. */
function isHandCopyContext(value: unknown): boolean {
  return isPlainRecord(value) && Object.keys(value).every(key => ["printing", "variant", "ephemeral", "copier", "originalHiddenFrom"].includes(key)) &&
    isPlainRecord(value.printing) && Object.keys(value.printing).every(key => key === "kind" || key === "cardId") && value.printing.kind === "card" && parses(parseCardId)(value.printing.cardId) &&
    isVariant(value.variant) && isPlainRecord(value.variant) && Object.keys(value.variant).every(key => ["amplified", "transfigurations", "deckMods"].includes(key)) &&
    (value.variant.deckMods === undefined || isPlainRecord(value.variant.deckMods) && Object.keys(value.variant.deckMods).every(key => ["sparkBonus", "costReduction", "fast", "reclaim", "typeChange"].includes(key)) &&
      (value.variant.deckMods.typeChange === null || isPlainRecord(value.variant.deckMods.typeChange) && Object.keys(value.variant.deckMods.typeChange).every(key => key === "cardType" || key === "subtype"))) &&
    isBoolean(value.ephemeral) && isSide(value.copier) && isArrayOf(value.originalHiddenFrom, isSide) &&
    new Set(value.originalHiddenFrom).size === value.originalHiddenFrom.length;
}

function isQueuedTrigger(value: unknown): boolean {
  const ancestors = new Set<object>();
  let current = value;
  while (true) {
    if (!isPlainRecord(current) || ancestors.has(current) || !isQueuedTriggerRecord(current)) return false;
    ancestors.add(current);
    if (current.triggeringAbility === undefined) return true;
    const cause = current.triggeringAbility;
    if (current.kind !== undefined || current.subject !== null || !isPlainRecord(cause) ||
      Object.keys(cause).some(key => key !== "named" && key !== "occurrence" && key !== "observedBy" && key !== "readerObservedBy") || !isNamedTrigger(cause.named) ||
      (cause.observedBy !== undefined && (!isArrayOf(cause.observedBy, isSide) || new Set(cause.observedBy).size !== cause.observedBy.length)) ||
      (cause.readerObservedBy !== undefined && (!isArrayOf(cause.readerObservedBy, isSide) || new Set(cause.readerObservedBy).size !== cause.readerObservedBy.length)) ||
      !isPlainRecord(cause.occurrence) || cause.occurrence.kind !== undefined) return false;
    const original = cause.occurrence;
    if (!isPlainRecord(original.origin) || (typeof original.source === "string"
      ? original.origin.kind !== "card" && original.origin.kind !== "figment"
      : !isPlainRecord(original.source) || original.origin.kind !== original.source.kind)) return false;
    current = original;
  }
}

function isQueuedTriggerRecord(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (value.kind !== undefined && value.kind !== "dreamwellBonus" && value.kind !== "ruleReaction") return false;
  if (value.historyHiddenFrom !== undefined && (value.kind !== undefined || !isArrayOf(value.historyHiddenFrom, isSide) ||
    new Set(value.historyHiddenFrom).size !== value.historyHiddenFrom.length)) return false;
  if (value.repeated !== undefined && (value.kind !== undefined || !isPlainRecord(value.repeated) ||
    Object.keys(value.repeated).some(key => key !== "named" && key !== "observedBy" && key !== "visibleTo") || !isNamedTrigger(value.repeated.named) ||
    !isArrayOf(value.repeated.observedBy, isSide) || new Set(value.repeated.observedBy).size !== value.repeated.observedBy.length ||
    !isArrayOf(value.repeated.visibleTo, isSide) || new Set(value.repeated.visibleTo).size !== value.repeated.visibleTo.length)) return false;
  if (value.kind === "ruleReaction" && (
    !isPlainRecord(value.origin) || value.origin.kind === "dreamwell" || value.node !== null || value.subject !== null ||
    value.captured !== undefined || value.gain !== undefined || value.scored !== undefined || value.discardedCount !== undefined ||
    value.lastKnownSubjectCost !== undefined || value.lastKnownSubjectSpark !== undefined ||
    value.subjectHiddenFrom !== undefined || value.handCopy !== undefined || value.linkedSource !== undefined
  )) return false;
  if (isPlainRecord(value.origin) && value.origin.kind === "dreamwell" && value.node === null && value.kind !== "dreamwellBonus") return false;
  if (value.kind === "dreamwellBonus" && (
    !isPlainRecord(value.source) || value.source.kind !== "dreamwell" ||
    !isPlainRecord(value.origin) || value.origin.kind !== "dreamwell" ||
    value.source.id !== value.origin.id || value.source.side !== value.controller ||
    value.node !== null || value.subject !== null ||
    value.captured !== undefined || value.gain !== undefined || value.scored !== undefined || value.discardedCount !== undefined ||
    value.lastKnownSourceSpark !== undefined || value.lastKnownSubjectCost !== undefined || value.lastKnownSubjectSpark !== undefined || value.subjectHiddenFrom !== undefined || value.handCopy !== undefined
  )) return false;
  return (
    isPlainRecord(value) &&
    isAbilitySource(value.source) &&
    isSide(value.controller) &&
    isAbilityOrigin(value.origin) &&
    isIndex(value.ability) &&
    optional((context) => isLinkedSource(context) && (context as Record<string, unknown>).source === value.source)(value.linkedSource) &&
    nullable(isIndex)(value.node) &&
    nullable(isInstanceId)(value.subject) &&
    optional(isHandCopyContext)(value.handCopy) &&
    (value.handCopy === undefined || value.subject !== null && value.gain === undefined && value.scored === undefined && value.discardedCount === undefined && value.captured === undefined) &&
    optional(arrayOf(isSide))(value.subjectHiddenFrom) &&
    optional(arrayOf(isInstanceId))(value.captured) &&
    optional((spark) => isFiniteNumber(spark) && spark >= 0)(value.lastKnownSourceSpark) &&
    optional((cost) => isFiniteNumber(cost) && cost >= 0)(value.lastKnownSubjectCost) &&
    optional((spark) => isFiniteNumber(spark) && spark >= 0)(value.lastKnownSubjectSpark) &&
    optional((scored) => isFiniteNumber(scored) && scored >= 0)(value.scored) &&
    optional((count) => typeof count === "number" && Number.isSafeInteger(count) && count > 0)(value.discardedCount) &&
    (value.discardedCount === undefined || value.subject === null) &&
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
          isBoolean(played.allTypes) &&
          optional(arrayOf(isNamedTrigger))(played.namedTriggers) &&
          // A saved record may omit its captured cost, spark and speed.
          optional(isIndex)(played.cost) &&
          optional(oneOf({ standard: true, fast: true, interrupt: true }))(played.speed) &&
          optional(nullable(isIndex))(played.spark),
      ),
    )(value.played) &&
    sideRecord(isIndex)(value.drawn) &&
    optional((progress) => isPlainRecord(progress) && isIndex(progress.total) &&
      sideRecord((known) => isIndex(known) && known <= (progress.total as number))(progress.known))(value.dawnProgress) &&
    // A saved turn log may lack its materializations (TurnLog.materialized).
    optional(
      sideRecord(
        arrayOf(
          (materialized) =>
            isPlainRecord(materialized) &&
            isInstanceId(materialized.instance) &&
            isCardKind(materialized.cardType) &&
            isString(materialized.subtype) &&
            isBoolean(materialized.allTypes),
        ),
      ),
    )(value.materialized)
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
    (value.unpairedBlockers === undefined || isArrayOf(value.unpairedBlockers, isInstanceId)) &&
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
    isArrayOf(value.actions, isLoopAction) &&
    nullable((candidate) => isPlainRecord(candidate) && (candidate.actions === null || isArrayOf(candidate.actions, isLoopAction)))(value.candidate) &&
    nullable(isPlainRecord)(value.run) &&
    isIndex(value.nextLoop) &&
    nullable(isPlainRecord)(value.cycle)
  );
}

/** Optional prompt-time visibility is aligned with the step's recorded answers. */
function isLoopAction(value: unknown): boolean {
  return isPlainRecord(value) && isArrayOf(value.steps, (step) =>
    isPlainRecord(step) &&
    isPlainRecord(step.step) && oneOf(STEP_KINDS)(step.step.kind) &&
    isArrayOf(step.answers, isRecordedAnswer) &&
    (step.promptsVisibleToActor === undefined || (
      isArrayOf(step.promptsVisibleToActor, isBoolean) &&
      Array.isArray(step.answers) && step.promptsVisibleToActor.length === step.answers.length
    )),
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
 * Each stack-zone instance has exactly one card stack item; ability sources
 * are independent of card stack membership.
 */
function hasConsistentZones(value: Record<string, unknown>): boolean {
  const state = value as unknown as BattleState;
  const inZone = (id: InstanceId, zone: Zone): boolean =>
    Object.prototype.hasOwnProperty.call(state.instances, id) &&
    state.instances[id].zone === zone;
  const stackedCards = new Set<InstanceId>();
  for (const item of state.stack) {
    if (item.kind !== "card") continue;
    if (!inZone(item.instance, "stack") || stackedCards.has(item.instance)) return false;
    stackedCards.add(item.instance);
  }
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
        ) && (() => {
          const records = state.rememberedCards?.[side] ?? [];
          const ids = records.map((record) => record.instance);
          const effects = records.flatMap((record) => record.effects.map((effect) => effect.id));
          return new Set(ids).size === ids.length && new Set(effects).size === effects.length &&
            records.every((record) => state.instances[record.instance]?.owner === record.owner &&
              record.effects.every((effect) => typeof effect.source !== "string" || Number(effect.source.slice(1)) < state.nextInstance));
        })()
      );
    }) &&
    Object.values(state.instances).every(
      (instance) => instance.zone !== "stack" || stackedCards.has(instance.id),
    )
  );
}

/**
 * Whether each instance's `status.gainedAbilities` lists exactly its
 * `abilities` floating changes, in order, and each such change is a gain a
 * character in play made, lasting while it stays there
 * (RD-hv-umm2.110-2); and whether its `status.lostAbilities` counts the
 * gains made before its latest `loseAbilities` change, each such change
 * naming a character in play, since a loss ends as its character leaves
 * play (RD-hv-umm2.111-2). The instance's abilities read the mirrors, so a
 * state whose mirrors disagree with its effects would change what it can do.
 */
function hasMirroredGainedAbilities(value: Record<string, unknown>): boolean {
  const state = value as unknown as BattleState;
  const gained = new Map<InstanceId, unknown[]>();
  const lost = new Map<InstanceId, number>();
  for (const { source, expiry, change } of state.floating) {
    if (change.kind !== "abilities" && change.kind !== "loseAbilities") continue;
    if (!Object.prototype.hasOwnProperty.call(state.instances, change.instance) || state.instances[change.instance].zone !== "play") return false;
    if (change.kind === "loseAbilities") {
      lost.set(change.instance, gained.get(change.instance)?.length ?? 0);
      continue;
    }
    if (source !== change.instance || expiry.at !== "sourceLeavesPlay" || expiry.source !== change.instance) return false;
    const group = "figment" in change ? { figment: change.figment } : { cardId: change.cardId, variant: change.variant };
    gained.set(change.instance, [...(gained.get(change.instance) ?? []), group]);
  }
  return Object.values(state.instances).every(
    (instance) => JSON.stringify(instance.status.gainedAbilities ?? []) === JSON.stringify(gained.get(instance.id) ?? []) &&
      instance.status.lostAbilities === lost.get(instance.id),
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
      if (card === null || (value.from !== "hand" && value.from !== "void" && value.from !== "deck") || slot === null) return null;
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
  if (value.kind === "dreamwell" && parses(parseDreamwellCardId)(value.id)) {
    return { kind: "dreamwell", side, id: parseDreamwellCardId(String(value.id)) };
  }
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
