import type {
  CardKeywordModification,
  CardTypeChange,
  DreamAtlas,
  Dreamcaller,
  Dreamsign,
  TransfigurationType,
} from "../types/quest";
import type { BattleDebugEdit } from "./debug/commands";

export const BACK_RANK_SLOT_IDS = ["B0", "B1", "B2", "B3", "B4"] as const;
export const FRONT_RANK_SLOT_IDS = ["F0", "F1", "F2", "F3"] as const;

export type BattleSide = "player" | "enemy";
export type BackRankSlotId = (typeof BACK_RANK_SLOT_IDS)[number];
export type FrontRankSlotId = (typeof FRONT_RANK_SLOT_IDS)[number];
export type BattlefieldSlotId = BackRankSlotId | FrontRankSlotId;
export type BattleZoneId = "deck" | "hand" | "void" | "banished" | "backRank" | "frontRank" | "stack";
export type BattlefieldZone = "backRank" | "frontRank";
export type BrowseableZone = "deck" | "hand" | "void" | "banished";
export type MarkerDiffState = "set" | "cleared" | "unchanged";

export type BattlePhase =
  | "dreamwell"
  | "draw"
  | "dawn"
  | "day"
  | "dusk"
  | "night"
  | "challenge"
  | "ending";
export type BattleResult = "victory" | "defeat" | "draw";
export type BattleCardKind = "character" | "event";
export type BattleCardTiming = "standard" | "fast" | "interrupt";
export type BattleHistoryEntryKind =
  | "numeric-state"
  | "card-instance"
  | "zone-move"
  | "battlefield-position"
  | "visibility"
  | "battle-flow"
  | "result";
export type BattleResultReason = "score_target_reached" | "turn_limit_reached" | "forced_result";
export type BattleAiDecisionStage = "character" | "reposition" | "nonCharacter" | "endTurn";

/**
 * Actor responsible for producing a battle command. `player`/`enemy` reflect the
 * side that initiated a gameplay action, `debug` is the QA/debug UI, and `system`
 * covers engine-internal recomputations (e.g. clearing a forced result).
 */
export type BattleCommandActor = "player" | "enemy" | "debug" | "system";

/**
 * UI surface or auto-emitter that produced a command. The union is closed so the
 * metadata envelope stays self-describing for logs, selectors, and the compact
 * log drawer. `auto-system` is reserved for engine-internal emissions that don't
 * originate from a click.
 */
export type BattleCommandSourceSurface =
  | "action-bar"
  | "battlefield"
  | "hand-tray"
  | "opponent-hand-tray"
  | "inspector"
  | "zone-browser-deck"
  | "zone-browser-hand"
  | "zone-browser-void"
  | "zone-browser-banished"
  | "auto-system"
  | "foresee-overlay"
  | "deck-order-picker"
  | "note-editor"
  | "figment-creator"
  | "card-badges"
  | "side-summary"
  | "status-strip"
  | "dreamcaller-panel"
  | "pool-viewer"
  | "phase-controls";

/**
 * Narrowed pointer to the entity a command operates on. The `ref` string is a
 * free-form identifier scoped to `kind`: card instance id for `"card"`,
 * `"side:zone:slotId"` for `"slot"`, the side name for `"side"`, and
 * `"side:zone"` for `"zone"`.
 */
export interface BattleCommandTarget {
  kind: "card" | "slot" | "side" | "zone";
  ref: string;
}

/**
 * Emission context threaded from the reducer through engine helpers so log
 * events can report the originating surface and the selected card (when
 * applicable) without re-reading metadata.
 */
export interface BattleEngineEmissionContext {
  sourceSurface: BattleCommandSourceSurface;
  selectedCardId: string | null;
}

/**
 * Per-side visibility flags captured in the mutable state. Phase 2 handles
 * opponent-hand visibility per-card via `SET_CARD_VISIBILITY`; this interface
 * is reserved for global flags (e.g. reveal deck top, reveal void) if later
 * phases need them.
 */
export interface BattleSideVisibilityFlags {
  // Intentionally empty while no global visibility flag is modelled — bug-072.
  readonly _reserved?: never;
}

/**
 * Frozen mirror of a quest deck entry at battle-init time. Stored on
 * `BattleInit` so code that needs the original quest identity of a card (e.g.
 * ability-lookup helpers, debug labels) does not have to re-walk the mutable
 * battle state back out to the quest deck.
 */
export interface BattleQuestDeckEntry {
  entryId: string;
  cardNumber: number;
  transfiguration: TransfigurationType | null;
  typeChange?: CardTypeChange | null;
  keywordModification?: CardKeywordModification | null;
  isBane: boolean;
}

export interface BattleDeckCardDefinition {
  sourceDeckEntryId: string | null;
  /** Stable cards_v2 UUID of the source card. "" for synthetic definitions
   *  (figments, generated copies) that have no catalog card. */
  cardId: string;
  cardNumber: number;
  name: string;
  battleCardKind: BattleCardKind;
  subtype: string;
  energyCost: number;
  printedEnergyCost: number | null;
  printedSpark: number;
  isFast: boolean;
  timing?: BattleCardTiming;
  reclaimCost: number | null;
  renderedText: string;
  imageNumber: number;
  transfiguration: TransfigurationType | null;
  typeChange?: CardTypeChange | null;
  keywordModification?: CardKeywordModification | null;
  isBane: boolean;
}

/**
 * A single Dreamwell card frozen into the battle's shared Dreamwell deck
 * (rules §The Dreamwell and Energy). Both players draw from this one sequence,
 * one card per turn during the Dreamwell phase. `energyAdded` permanently
 * raises the drawing side's maximum ●; `renderedText` carries the bonus ability
 * (applied manually by the player) with the same symbol/glossary markup as
 * regular cards.
 */
export interface DreamwellCardDefinition {
  id: string;
  name: string;
  renderedText: string;
  energyAdded: number;
  order: number;
  cardNumber: number;
  imageNumber: number;
}

export interface BattleEnemyDescriptor {
  id: string;
  name: string;
  subtitle: string;
  imageNumber?: Dreamcaller["imageNumber"];
  portraitSeed: number;
  abilityText: string;
  /**
   * The concrete Dreamsigns the opponent brings to the battle, shown before
   * hands are dealt.
   */
  dreamsigns: readonly BattleDreamsignSummary[];
}

export interface BattleDreamcallerSummary {
  id: Dreamcaller["id"];
  name: Dreamcaller["name"];
  title: Dreamcaller["title"];
  renderedText: Dreamcaller["renderedText"];
  imageNumber: Dreamcaller["imageNumber"];
}

export interface BattleDreamsignSummary {
  name: Dreamsign["name"];
  effectDescription: Dreamsign["effectDescription"];
  isBane: Dreamsign["isBane"];
}

export interface BattleInit {
  battleId: string;
  battleEntryKey: string;
  seed: number;
  siteId: string;
  dreamscapeId: string | null;
  completionLevelAtStart: number;
  isMiniboss: boolean;
  isFinalBoss: boolean;
  essenceReward: number;
  /** Omens granted on victory, 1-3, scaling with completed dreamscapes. */
  omenReward: number;
  openingHandSize: number;
  scoreToWin: number;
  turnLimit: number;
  maxEnergyCap: number;
  // bug-039: widened from the Phase 1 literals (`"player"` / `true`) so tests
  // and future phases can exercise the no-skip and enemy-first paths. Runtime
  // invariants (B-6, C-10) are still enforced in `create-battle-init.ts`.
  startingSide: BattleSide;
  playerDrawSkipsTurnOne: boolean;
  questDeckEntries: readonly BattleQuestDeckEntry[];
  playerDeckOrder: readonly BattleDeckCardDefinition[];
  /**
   * The shared Dreamwell deck both players draw from, pre-shuffled within
   * numeric `order` groups and pre-cycled long enough to cover the battle
   * (rules §The Dreamwell and Energy). Order-0 cards lead the first cycle only;
   * each later cycle reshuffles orders 1-4. `BattleMutableState.dreamwellDeckIndex`
   * tracks the next card to draw.
   */
  dreamwellDeck: readonly DreamwellCardDefinition[];
  enemyDescriptor: BattleEnemyDescriptor;
  enemyDeckDefinition: readonly BattleDeckCardDefinition[];
  dreamcallerSummary: BattleDreamcallerSummary | null;
  dreamsignSummaries: readonly BattleDreamsignSummary[];
  atlasSnapshot: DreamAtlas;
}

/**
 * Per-card debug markers. Spec §Q-1 mentions "mark a card or action as
 * prevented or copied"; Phase 2 has no stack/timing model, so markers apply to
 * card instances only. An action-level marker would require a pending-action
 * surface that does not exist in Phase 2 — bug-098.
 */
export interface BattleCardMarkers {
  isPrevented: boolean;
  isCopied: boolean;
}

/**
 * Per-card-instance status state grouped into a single object so the
 * create/clone churn stays in one place. Every field defaults to a falsy /
 * zero value (see `createDefaultBattleCardStatus`). `counters` holds the ⧗
 * counters stored on this card and resets to 0 when the card leaves play. The
 * `granted*` flags record combat keywords an effect has granted to a non-figment
 * character; the resolver also text-scans printed keywords and reads figment
 * types, so these flags cover only the granted-by-effect case.
 */
export interface BattleCardStatus {
  isExhausted: boolean;
  counters: number;
  reclaimed: boolean;
  offering: boolean;
  ephemeral: boolean;
  /** Veil N● targeting tax; 0 = no veil. */
  veil: number;
  grantedUnstoppable: boolean;
  grantedVengeful: boolean;
  grantedPreeminence: boolean;
  grantedAwakened: boolean;
}

export type BattleCardNoteExpiry =
  | { kind: "manual" }
  | { kind: "atStartOfTurn"; side: BattleSide; turnNumber: number };

export interface BattleCardNote {
  noteId: string;
  text: string;
  createdAtTurnNumber: number;
  createdAtSide: BattleSide;
  createdAtMs: number;
  expiry: BattleCardNoteExpiry;
}

export type BattleCardProvenanceKind =
  | "quest-deck"
  | "generated-copy"
  | "generated-figment"
  | "generated-pool";

export interface BattleCardProvenance {
  kind: BattleCardProvenanceKind;
  sourceBattleCardId: string | null;
  chosenSpark: number | null;
  chosenSubtype: string | null;
  createdAtTurnNumber: number | null;
  createdAtSide: BattleSide | null;
  createdAtMs: number | null;
}

export interface BattleCardInstance {
  battleCardId: string;
  definition: BattleDeckCardDefinition;
  owner: BattleSide;
  controller: BattleSide;
  /**
   * For a figment stack (`provenance.kind === "generated-figment"`), the spark
   * of each member figment, kept sorted descending so the top of the stack is
   * index 0. Empty or `undefined` for non-figment cards. A figment's effective
   * spark is the sum of these values; its member count is the array length.
   */
  figments?: number[];
  sparkDelta: number;
  isRevealedToPlayer: boolean;
  status: BattleCardStatus;
  markers: BattleCardMarkers;
  notes: readonly BattleCardNote[];
  provenance: BattleCardProvenance;
}

export interface BattleSideMutableState {
  currentEnergy: number;
  maxEnergy: number;
  score: number;
  visibility: BattleSideVisibilityFlags;
  deck: string[];
  hand: string[];
  void: string[];
  banished: string[];
  backRank: Record<BackRankSlotId, string | null>;
  frontRank: Record<FrontRankSlotId, string | null>;
  /**
   * Number of Fatigue events this side has suffered this battle (rules
   * §Fatigue). Drawing or eroding from an empty deck awards the opponent
   * `2^fatigueCount` ⍟ and increments this counter, so the doubling sequence
   * (1⍟, 2⍟, 4⍟, …) is reproducible across the snapshot/undo model. Default 0.
   */
  fatigueCount: number;
  /**
   * Index into `BattleInit.dreamwellDeck` of the Dreamwell card this side is
   * currently showing (the most recent one it drew), or `null` before its first
   * Dreamwell phase. The Dreamwell display reads the definition at this index.
   */
  dreamwellCardIndex: number | null;
  /**
   * Turn number for which `dreamwellCardIndex` was drawn, or `null` if the side
   * has not drawn yet. The Dreamwell reveal fires once per turn by comparing
   * this against the active turn number.
   */
  dreamwellDrawnTurn: number | null;
}

export interface BattleStackEntry {
  stackEntryId: string;
  battleCardId: string;
  side: BattleSide;
  paidCost: number;
}

/**
 * Spec C-3 divides a battle session into immutable metadata (carried on
 * `BattleInit`) and a mutable runtime slice (this interface). `battleId` is
 * duplicated for cross-referencing invariants; the remainder of the spec's
 * metadata fields (`siteId`, `dreamscapeId`, `completionLevelAtStart`,
 * `enemyDescriptor`, `playerDreamcallerSummary`, `playerDreamsignSummaries`)
 * live on `BattleInit`. Code that needs both should read them from
 * `BattleInit` directly rather than re-denormalising them here (bug-034).
 *
 * The spec names `playerDreamcallerSummary` and `playerDreamsignSummaries`;
 * the codebase uses the shorter `dreamcallerSummary` / `dreamsignSummaries`
 * on `BattleInit` because Phase 2 only models the player side — the enemy has
 * no dreamcaller or dreamsigns, so the `player` prefix is implicit (bug-034).
 */
export interface BattleMutableState {
  battleId: string;
  activeSide: BattleSide;
  turnNumber: number;
  phase: BattlePhase;
  result: BattleResult | null;
  forcedResult: BattleResult | null;
  /** Next index to draw from the shared `BattleInit.dreamwellDeck`. */
  dreamwellDeckIndex: number;
  nextBattleCardOrdinal: number;
  nextStackEntryOrdinal?: number;
  stack?: BattleStackEntry[];
  sides: Record<BattleSide, BattleSideMutableState>;
  cardInstances: Record<string, BattleCardInstance>;
}

export interface BattleUiState {
  selectedCardId: string | null;
  selectedSide: BattleSide | null;
  openZone: { side: BattleSide; zone: BattleZoneId } | null;
  inspectorTab: "card" | "player" | "enemy" | "log";
}

export interface BattleFieldSlotAddress {
  side: BattleSide;
  zone: BattlefieldZone;
  slotId: BattlefieldSlotId;
}

export interface BattleHandCardLocation {
  side: BattleSide;
  zone: "hand";
  index: number;
}

export interface BattleZoneCardLocation {
  side: BattleSide;
  zone: Exclude<BattleZoneId, "hand" | "backRank" | "frontRank" | "stack">;
  index: number;
}

export interface BattleStackCardLocation {
  side: BattleSide;
  zone: "stack";
  index: number;
}

export interface BattleFieldCardLocation {
  side: BattleSide;
  zone: BattlefieldZone;
  slotId: BattlefieldSlotId;
}

export type BattleCardLocation =
  | BattleHandCardLocation
  | BattleZoneCardLocation
  | BattleStackCardLocation
  | BattleFieldCardLocation;

export interface BattleLaneJudgment {
  slotId: FrontRankSlotId;
  playerSpark: number;
  enemySpark: number;
  winner: BattleSide | null;
  scoreDelta: number;
}

export interface BattleJudgmentResolution {
  lanes: readonly BattleLaneJudgment[];
  playerScoreDelta: number;
  enemyScoreDelta: number;
}

export interface BattleResultEvaluation {
  result: BattleResult | null;
  reason: BattleResultReason | null;
}

export interface BattleFlowStep {
  side: BattleSide;
  phase: BattlePhase;
}

export interface BattleEnergyChange {
  at: BattleFlowStep;
  side: BattleSide;
  previousCurrentEnergy: number;
  currentEnergy: number;
  previousMaxEnergy: number;
  maxEnergy: number;
}

export interface BattleScoreChange {
  at: BattleFlowStep;
  side: BattleSide;
  previousScore: number;
  score: number;
  delta: number;
}

export interface BattleResultChange {
  at: BattleFlowStep;
  previousResult: BattleResult | null;
  result: BattleResult | null;
  reason: BattleResultReason | null;
}

export interface BattleAiChoiceTrace {
  stage: BattleAiDecisionStage;
  choice: "PLAY_CARD" | "MOVE_CARD" | "END_TURN";
  battleCardId: string | null;
  cardName: string | null;
  sourceHandIndex: number | null;
  sourceSlotId: BattlefieldSlotId | null;
  targetSlotId: BattlefieldSlotId | null;
  heuristicScoreBefore: number | null;
  heuristicScoreAfter: number | null;
  rationale?: string | null;
  targetBattleCardId?: string | null;
}

export interface BattleDeferredLogEvent {
  event: string;
  fields: Record<string, unknown>;
}

export interface BattleTransitionData {
  steps: BattleFlowStep[];
  energyChanges: BattleEnergyChange[];
  judgment: BattleJudgmentResolution | null;
  scoreChanges: BattleScoreChange[];
  resultChange: BattleResultChange | null;
  aiChoices: BattleAiChoiceTrace[];
  logEvents: BattleDeferredLogEvent[];
}

export interface BattleHistoryEntryMetadata {
  commandId: string;
  label: string;
  kind: BattleHistoryEntryKind;
  isComposite: boolean;
  actor: BattleCommandActor;
  sourceSurface: BattleCommandSourceSurface;
  targets: readonly BattleCommandTarget[];
  timestamp: number;
  /**
   * Spec §H-4 envelope slot for per-command arguments. Populated at dispatch
   * time by `createBattleCommandMetadata`. Optional because some entries carry
   * no user-facing arguments to preserve.
   */
  payload?: Record<string, unknown>;
  /**
   * Spec §H-4 reverse-delta slot. The Phase 1 battle module uses full-state
   * snapshots (`BattleHistoryEntry.before`) to drive undo (spec §H-6 "undo is
   * exact, records enough state to reverse"). Individual commands may still
   * attach a reverse delta here for debugging, inspector tooling, or future
   * non-snapshot undo; leave `null` when snapshot-based undo is sufficient.
   */
  undoPayload: Record<string, unknown> | null;
}

export interface BattleHistorySnapshot {
  mutable: BattleMutableState;
  lastTransition: BattleReducerTransition | null;
}

export interface BattleHistoryEntry {
  metadata: BattleHistoryEntryMetadata;
  before: BattleHistorySnapshot;
  after: BattleHistorySnapshot;
}

export interface BattleHistory {
  past: BattleHistoryEntry[];
  future: BattleHistoryEntry[];
}

export interface BattleReducerState {
  mutable: BattleMutableState;
  history: BattleHistory;
  lastTransition: BattleReducerTransition | null;
  transitionId: number;
  lastActivity: BattleActivity | null;
  activityId: number;
}

export interface BattleReducerTransition extends BattleTransitionData {
  metadata: BattleHistoryEntryMetadata;
}

export interface BattleCommandActivity {
  kind: "command";
  metadata: BattleHistoryEntryMetadata;
}

export interface BattleHistoryActivity {
  kind: "undo" | "redo";
  metadata: BattleHistoryEntryMetadata;
}

export type BattleActivity = BattleCommandActivity | BattleHistoryActivity;

export type BattleReducerAction =
  | {
    type: "DEBUG_EDIT";
    edit: BattleDebugEdit;
    metadata: BattleHistoryEntryMetadata;
    /**
     * AI choice trace(s) carried from the command envelope onto the resulting
     * transition's `aiChoices`. Omitted for human/debug commands.
     */
    aiChoices?: BattleAiChoiceTrace[];
  }
  | {
    type: "FORCE_RESULT";
    result: BattleResult;
    metadata: BattleHistoryEntryMetadata;
    aiChoices?: BattleAiChoiceTrace[];
  };
