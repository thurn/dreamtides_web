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
//   - `END_BATTLE {}` derives the terminal outcome from the folded board. A
//     journey victory commits the reward, Battle-site completion, Atlas
//     advancement, route, modifier expiry, and battle teardown atomically.
//     Defeat/draw freezes the failure summary and tears down the battle.
//
// The src/rules/ lint rails forbid Firebase, React, and any live clock/rng.
// Battle init reads TOML-sourced card / deck / dreamAvatar data that only loads
// asynchronously, which the pure reducer cannot statically reach, so its
// construction is delegated to the injectable {@link BattleInitProvider} seam
// (mirroring `SiteContentProvider`): the reducer forwards the provider
// `ctx.rng` (the deterministic `(drawIndex) => number` per-event stream) and
// `ctx.timestamp` unchanged, so two clients folding the same `BEGIN_BATTLE`
// build a byte-identical battle. Atlas advancement needs loaded dreamscape
// content, so `END_BATTLE` delegates that one deterministic calculation to
// {@link BattleCompletionProvider}; all state bookkeeping remains here.
//
// Cards / dreamAvatars are keyed by UUID and deck entries by entry-id — never
// by name (AGENTS.md).

import type { EventActor, EventContext } from "../../eventlog/types";
import { tutorialAiEventActor } from "../../eventlog/types";
import { isoTimestampToMs } from "./timestamp";
import type {
  BattleCardMarkers,
  BattleCardNoteExpiry,
  BattleCardStatus,
  BattleCardInstance,
  BattleAiChoiceTrace,
  BattleDeferredLogEvent,
  BattleEngineEmissionContext,
  BattleFieldSlotAddress,
  BattlefieldZone,
  BattlePhase,
  BattleInit,
  BattleMutableState,
  BattleResult,
  BattleSide,
  BattleTransitionData,
  BattleZoneId,
} from "../../battle/types";
import {
  FRONT_RANK_SLOTS,
  frontRankSlotId,
  rankSlotIds,
} from "../../battle/types";
import type {
  BattleCommand,
  BattleDebugEdit,
} from "../../battle/debug/commands";
import { automaticBattleIntentKey } from "../../battle/automatic-intent-key";
import type {
  BattleModifier,
  JourneyFailureBattleResult,
  JourneyFailureReason,
  JourneyFailureSummary,
  JourneyState,
  Screen,
  DreamAtlas,
} from "../../types/journey";
import type { FoldState } from "../fold-state";
import type { ClientId } from "../../types/identifiers";
import {
  battleCardIdFromUnknown,
  dreamwellCardIdFromUnknown,
  noteIdFromUnknown,
} from "../../types/identifiers";
import {
  cardIdFromUnknown,
  cardSubtypeFromUnknown,
  parseCardName,
} from "../../types/card-identity";
import { battleDeckCardDefinitionFromUnknown } from "../../battle/card-definition";
import { applyDebugEdit, forceBattleResult } from "./apply-debug-edit";
import { createEmptyTransitionData } from "../../battle/engine/result";
import {
  battleTriggerScriptId,
  planStaticContributionSettlement,
} from "./battle-card-effects-table";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import {
  advanceEffectQueueWithStream,
  resolvePendingPromptWithStream,
} from "./driver";
import type { PromptResolution } from "./effect-runner-core";
import { endOfTurnExhaustionClearEdits } from "../../battle/engine/handoff";
import { forwardModelFromState } from "../../battle/ai/forward-model";
import { planBlockingWithDecision } from "../../battle/ai/blocking";
import { actionToCommands } from "../../battle/ai/driver";
import { buildTrace } from "../../battle/ai/trace";
import { planBasicAutomationCommands } from "./basic-automation";
import { resolveChallengeLane } from "../../battle/engine/challenge";
import {
  newEffectRun,
  battleModeOf,
  emptyDawnFired,
  type BattleFoldState,
  type ChallengeCursor,
  type ChallengeResolvedPresentation,
  type ChallengeScoredEntry,
  type OpponentBlockEntry,
  type OpponentBlockPresentation,
  type TutorialBattleMode,
  type TutorialGuidanceContinuation,
  type TutorialGuidanceSource,
  type EffectRun,
  type PendingPrompt,
} from "./fold";
import { matchTutorialGuidance } from "./tutorial-guidance";
import { tutorialSpeechBubbleDelaySeconds } from "../../data/tutorial-speech-bubble";
import {
  isBattleFieldSlotAddressValid,
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
} from "../../battle/state/selectors";
import { hasTemporaryReclaimEligibility } from "./temporary-effects";
import { planTutorialCharacterReposition } from "./tutorial-reposition";
import type {
  TutorialAction,
  TutorialTriggerEvent,
} from "../../types/tutorial";
import {
  consumeTutorialAiActionOverride,
  resolveTutorialAiPlayCardOverride,
} from "../../battle/tutorial-ai-action-overrides";
import {
  isBattleCardSemanticPlayAutomated,
  semanticPlayTargetsAreLegal,
} from "../../battle/semantic-play";
import {
  selectStarterCardLegalTargetIds,
  starterCardRequiresTarget,
} from "../../battle/starter-card-targets";
import { configuredTutorialJourneyDreamAvatarId } from "../front-door";
import { resetJourney } from "../journey/lifecycle";
import { canVisitSite, completeJourneySite, findSite } from "../journey/sites";
import type {
  BattleCardId,
  BattleEffectScriptId,
  DeckEntryId,
  IntentKey,
  NoteId,
  SiteId,
  TutorialAiActionOverrideId,
  TutorialRunId,
} from "../../types/identifiers";
import { identityKeys, parseBattleCardId, parseBattleEffectScriptId, parseNoteId, parsePresentationId, parseSiteId, tutorialAiActionOverrideIdFromUnknown } from "../../types/identifiers";
import { parseTutorialRunId } from "../../types/identifiers";
import { parseCardId } from "../../types/card-identity";

// ---------------------------------------------------------------------------
// Battle-init provider seam (BEGIN_BATTLE construction)
// ---------------------------------------------------------------------------

/**
 * The deterministic construction `BEGIN_BATTLE` needs to turn journey state into
 * a fresh {@link BattleFoldState}. The reducer resolves double-begin itself,
 * then delegates the immutable `init` (`BattleInit`) plus board / dreamAvatar /
 * opponent-deck construction — which reads async-loaded card, dreamAvatar, and
 * dreamwell data — to this provider.
 *
 * The registered provider (`createBattleInitProvider`) constructs the battle
 * deterministically from folded journey state: `createBattleInit` derives all of
 * its randomness from a `BattleRng` stream keyed by
 * `deriveBattleSeed(journey.seed:battleEntryKey)`, and `createInitialBattleState`
 * is pure. That seed comes straight from the folded journey, so every client on
 * the room builds a byte-identical battle from the same journey seed and site.
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
   * from `(journey, rng, timestamp)`, or `null` to bounce (e.g. the site is not a
   * battle, or its content is unavailable). Must not mutate `journey`. The result
   * must populate the immutable `init` (`BattleInit`) and set `effectQueue: []`
   * and `pendingPrompt: null`.
   */
  beginBattle(input: {
    journey: JourneyState;
    siteId: SiteId;
    seedOverride: number | null;
    seq: number;
    rng: (drawIndex: number) => number;
    timestamp: string;
  }): BattleFoldState | null;
}

/**
 * Loaded-content seam used by a journey victory to reveal the next Atlas
 * frontier. The reducer owns the complete transition and delegates only the
 * content-dependent Atlas generation step.
 */
export interface BattleCompletionProvider {
  advanceAtlas(input: {
    journey: JourneyState;
    battle: BattleFoldState;
    completionLevel: number;
    rng: (drawIndex: number) => number;
  }): DreamAtlas | null;
}

/** Deterministic construction seam for the authored tutorial handoff. */
export interface TutorialBattleInitProvider {
  beginTutorialBattle(input: {
    journey: JourneyState;
    actions: readonly TutorialAction[];
    tutorialRunId: TutorialRunId;
    restartNumber: number;
    seq: number;
    rng: (drawIndex: number) => number;
    timestamp: string;
  }): BattleFoldState | null;
}

let battleInitProvider: BattleInitProvider | null = null;
let battleCompletionProvider: BattleCompletionProvider | null = null;
let tutorialBattleInitProvider: TutorialBattleInitProvider | null = null;

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

/** Register the loaded-content Atlas advancement used by `END_BATTLE`. */
export function registerBattleCompletionProvider(
  provider: BattleCompletionProvider | null,
): void {
  battleCompletionProvider = provider;
}

/** Register the deterministic provider for the tutorial's canonical battle. */
export function registerTutorialBattleInitProvider(
  provider: TutorialBattleInitProvider | null,
): void {
  tutorialBattleInitProvider = provider;
}

// ---------------------------------------------------------------------------
// BEGIN_BATTLE
// ---------------------------------------------------------------------------

/**
 * `BEGIN_BATTLE { siteId, seedOverride? }`: construct the in-battle fold slice deterministically
 * from journey state. Returns the next {@link FoldState} on success, or `null` to
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
  if (
    state.journey.screen.type !== "site" ||
    state.journey.screen.siteId !== siteId ||
    state.journey.activeSiteId !== siteId ||
    findSite(state.journey, parseSiteId(siteId))?.type !== "Battle" ||
    !canVisitSite(state.journey, parseSiteId(siteId))
  ) {
    return null;
  }
  const rawSeedOverride = payload.seedOverride;
  const seedOverride =
    rawSeedOverride === undefined || rawSeedOverride === null
      ? null
      : typeof rawSeedOverride === "number" &&
          Number.isSafeInteger(rawSeedOverride) &&
          rawSeedOverride >= 0
        ? rawSeedOverride
        : null;
  if (
    rawSeedOverride !== undefined &&
    rawSeedOverride !== null &&
    seedOverride === null
  ) {
    return null;
  }
  const provider = battleInitProvider;
  if (provider === null) {
    return null;
  }
  const battle = provider.beginBattle({
    journey: state.journey,
    siteId: parseSiteId(siteId),
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
    battle: {
      ...battle,
      mode: battle.mode ?? { kind: "journey" },
      basicAutomationEnabled: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Tutorial battle lifecycle
// ---------------------------------------------------------------------------

function nonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Materialize the durable battle immediately after the final authored tutorial
 * action. The terminal cursor and absent battle slice make repeated delivery a
 * deterministic no-op; the event's logical key makes normal client retries
 * idempotent at the log boundary as well.
 */
export function beginTutorialBattle(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  _actor: EventActor,
): FoldState | null {
  const tutorial = state.frontDoor.tutorial;
  const tutorialRunId = payload.tutorialRunId;
  if (
    state.battle !== null ||
    state.frontDoor.phase !== "tutorial" ||
    tutorial === null ||
    tutorial.currentActionIndex !== null ||
    !nonBlankString(tutorialRunId) ||
    tutorialRunId !== tutorial.runId
  ) {
    return null;
  }
  return buildTutorialBattle(state, parseTutorialRunId(tutorialRunId), 0, ctx);
}

/** Rebuild the original authored handoff with a fresh deterministic restart stream. */
export function restartTutorialBattle(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  actor: EventActor,
): FoldState | null {
  const battle = state.battle;
  const battleId = payload.battleId;
  const controllerClientId = state.playtestControl?.controllerClientId ?? null;
  if (
    battle === null ||
    !nonBlankString(battleId) ||
    battleId !== battle.board.battleId ||
    !nonBlankString(controllerClientId) ||
    controllerClientId !== actor
  ) {
    return null;
  }
  const mode = battleModeOf(battle);
  if (mode.kind !== "tutorial") {
    return null;
  }
  return buildTutorialBattle(
    state,
    mode.tutorialRunId,
    mode.restartNumber + 1,
    ctx,
  );
}

/** Hand a completed tutorial battle into the fixed tutorial journey-start offer. */
export function exitTutorialBattle(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  actor: EventActor,
): FoldState | null {
  const battleId = payload.battleId;
  const mode = state.battle === null ? null : battleModeOf(state.battle);
  if (
    state.battle === null ||
    !nonBlankString(battleId) ||
    battleId !== state.battle.board.battleId ||
    mode?.kind !== "tutorial" ||
    state.playtestControl?.controllerClientId !== actor
  ) {
    return null;
  }
  const reset = resetJourney(state, ctx);
  const tutorialDreamAvatarId = configuredTutorialJourneyDreamAvatarId();
  if (tutorialDreamAvatarId === null) return null;
  return {
    ...reset,
    frontDoor: { phase: "journey", journeyId: null, tutorial: null },
    playtestControl: state.playtestControl,
    journey: {
      ...reset.journey,
      screen: {
        type: "journeyStart",
        tutorialDreamAvatarId: tutorialDreamAvatarId,
      },
    },
  };
}

function buildTutorialBattle(
  state: FoldState,
  tutorialRunId: TutorialRunId,
  restartNumber: number,
  ctx: EventContext,
): FoldState | null {
  const provider = tutorialBattleInitProvider;
  if (provider === null) return null;
  const battle = provider.beginTutorialBattle({
    journey: state.journey,
    actions: state.frontDoor.tutorial?.actions ?? [],
    tutorialRunId,
    restartNumber,
    seq: ctx.seq,
    rng: ctx.rng,
    timestamp: ctx.timestamp,
  });
  if (battle === null) return null;
  const mode: TutorialBattleMode = {
    kind: "tutorial",
    tutorialRunId,
    restartNumber,
    resultConfig: { playerOnlyVictory: true, turnLimitDisabled: true },
  };
  return {
    ...state,
    battle: { ...battle, mode, basicAutomationEnabled: true },
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
 * `END_BATTLE {}`: derive the terminal result from the folded battle board and
 * commit the complete journey handoff. Returns `null` while the battle is not
 * terminal or when its durable identity no longer matches the journey state.
 */
export function endBattle(
  state: FoldState,
  _payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  const battle = state.battle;
  if (battle === null || battleModeOf(battle).kind !== "journey") {
    return null;
  }
  if (battle.board.result === "victory") {
    return applyVictory(state, battle, ctx);
  }
  return battle.board.result === "defeat" || battle.board.result === "draw"
    ? applyDefeat(state, battle)
    : null;
}

/**
 * Victory bookkeeping: bump the completion level, route to the post-battle
 * screen, clear the current dreamscape, decrement each battle modifier and
 * drop those that reach zero — removing any temporary-Nightmare deck entries a
 * dropped modifier introduced. The battle slice is torn down.
 */
function applyVictory(
  state: FoldState,
  battle: BattleFoldState,
  ctx: EventContext,
): FoldState | null {
  const journey = state.journey;
  const init = battle.init;
  const dreamscapeId = init.dreamscapeId;
  if (
    dreamscapeId === null ||
    journey.currentDreamscape !== dreamscapeId ||
    journey.completionLevel !== init.completionLevelAtStart ||
    journey.activeSiteId !== init.siteId ||
    journey.atlas.nodes[dreamscapeId] === undefined ||
    findSite(journey, init.siteId)?.type !== "Battle" ||
    !canVisitSite(journey, init.siteId)
  ) {
    return null;
  }
  const newLevel = journey.completionLevel + 1;
  const screen: Screen =
    newLevel >= FINAL_COMPLETION_LEVEL
      ? { type: "journeyComplete" }
      : { type: "atlas" };
  const completedJourney = completeJourneySite(journey, init.siteId);
  const provider = battleCompletionProvider;
  if (provider === null) return null;
  const atlas = provider.advanceAtlas({
    journey: completedJourney,
    battle,
    completionLevel: newLevel,
    rng: ctx.rng,
  });
  if (atlas === null) return null;

  const droppedNightmareEntryIds = new Set<DeckEntryId>();
  const battleModifiers: BattleModifier[] = [];
  for (const modifier of journey.battleModifiers) {
    const battlesRemaining = modifier.battlesRemaining - 1;
    if (battlesRemaining <= 0) {
      if (modifier.kind === "temporary_nightmare_grant") {
        for (const entryId of modifier.addedEntryIds) {
          droppedNightmareEntryIds.add(entryId);
        }
      }
      continue;
    }
    battleModifiers.push({ ...modifier, battlesRemaining });
  }
  const deck =
    droppedNightmareEntryIds.size === 0
      ? journey.deck
      : journey.deck.filter(
          (entry) => !droppedNightmareEntryIds.has(entry.entryId),
        );

  return {
    ...state,
    journey: {
      ...completedJourney,
      completionLevel: newLevel,
      screen,
      activeSiteId: null,
      atlas,
      essence: completedJourney.essence + init.essenceReward,
      battleModifiers,
      deck,
      currentDreamscape: null,
    },
    battle: null,
  };
}

/**
 * Defeat bookkeeping: freeze a
 * {@link JourneyFailureSummary} from the battle board + journey slice, route to the
 * `journeyFailed` screen, and tear down the battle slice.
 */
function applyDefeat(state: FoldState, battle: BattleFoldState): FoldState {
  const journey = state.journey;
  return {
    ...state,
    journey: {
      ...journey,
      failureSummary: deriveFailureSummary(battle.init, battle.board, journey),
      screen: { type: "journeyFailed" },
      activeSiteId: null,
    },
    battle: null,
  };
}

/**
 * Derive the failure summary from the immutable battle `init`, the terminal
 * `board`, and the journey slice. `battleId`, `turnNumber`, and both scores come
 * from the board; `dreamscapeIdOrNone` comes from the active journey position;
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
 * renders the `journeyFailed` screen.
 */
function deriveFailureSummary(
  init: BattleInit,
  board: BattleMutableState,
  journey: JourneyState,
): JourneyFailureSummary {
  const result: JourneyFailureBattleResult =
    board.result === "draw" ? "draw" : "defeat";
  let reason: JourneyFailureReason;
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
  const siteId = journey.activeSiteId ?? init.siteId;
  return {
    battleId: board.battleId,
    result,
    reason,
    siteId,
    siteLabel: siteId,
    dreamscapeIdOrNone: journey.currentDreamscape,
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
const DISCOVER_ANY_LOW_COST_SCRIPT_ID = parseBattleEffectScriptId(
  "f61431f3-33bd-42ff-a229-b4013582e86e",
);
const DISCOVER_CHARACTER_SCRIPT_IDS = new Set<BattleEffectScriptId>([
  parseBattleEffectScriptId("8f5f2e26-44b5-447b-90d0-eaf22ab29fed"),
  parseBattleEffectScriptId("910b4cf9-dec7-4e03-af4f-7d5ae342eeba"),
]);
const DISCOVER_CHARACTER_SOURCE_CARD_ID = parseCardId(
  "910b4cf9-dec7-4e03-af4f-7d5ae342eeba",
);

function openTutorialGuidance(
  state: FoldState,
  battle: BattleFoldState,
  event: TutorialTriggerEvent,
  source: TutorialGuidanceSource,
  renderedText: string,
  cardKind: "character" | "event" | undefined,
  continuation: TutorialGuidanceContinuation,
): FoldState | null {
  const seen = new Set(state.tutorialTriggerIdsSeen ?? []);
  const sourceCardId =
    source.kind === "card" ||
    source.kind === "dreamwell" ||
    source.kind === "figment"
      ? source.cardId
      : undefined;
  const matches = matchTutorialGuidance(battle.init.tutorialTriggers ?? [], {
    event,
    cardId: sourceCardId,
    renderedText,
    cardKind,
    seenTriggerIds: seen,
  });
  if (matches.length === 0) return null;
  for (const match of matches) seen.add(match.id);
  const sourceIdentity =
    source.kind === "dreamwell"
      ? `${source.side}:${source.cardId}`
      : source.kind === "challenge"
        ? `${source.activeSide}:${String(source.turnNumber)}:${source.slotId}`
        : source.kind === "battle"
          ? `${source.activeSide}:${String(source.turnNumber)}`
          : `${source.side}:${source.battleCardId}`;
  return {
    ...state,
    tutorialTriggerIdsSeen: [...seen],
    battle: {
      ...battle,
      tutorialPresentation: {
        id: parsePresentationId(
          `tutorial-guidance:${event}:${sourceIdentity}:${matches
            .map((match) => match.id)
            .join("+")}`,
        ),
        kind: "tutorial-guidance",
        source,
        messages: matches.map((match) => ({
          triggerId: match.id,
          speaker: match.speaker,
          text: match.text,
          delay: tutorialSpeechBubbleDelaySeconds(match, event),
          duration: match.duration,
          horizontalOffset: match.horizontalOffset,
          verticalOffset: match.verticalOffset,
          bubbleWidth: match.bubbleWidth,
        })),
        messageIndex: 0,
        continuation,
      },
    },
  };
}

function openFigmentCreatedGuidance(
  state: FoldState,
  before: BattleFoldState,
  after: BattleFoldState,
): FoldState | null {
  if ((after.tutorialPresentation ?? null) !== null) return null;
  const createdFigment = Object.values(after.board.cardInstances).find(
    (instance) => {
      if (instance.provenance.kind !== "generated-figment") return false;
      const previous = before.board.cardInstances[instance.battleCardId];
      const previousCount =
        previous?.provenance.kind === "generated-figment"
          ? (previous.figments?.length ?? 1)
          : 0;
      return (instance.figments?.length ?? 1) > previousCount;
    },
  );
  if (createdFigment === undefined) return null;
  return openTutorialGuidance(
    { ...state, battle: after },
    after,
    "figment-created",
    {
      kind: "figment",
      cardId: createdFigment.definition.cardId,
      battleCardId: createdFigment.battleCardId,
      side: createdFigment.controller,
    },
    createdFigment.definition.renderedText,
    undefined,
    { kind: "commands", commands: [] },
  );
}

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
 *   2. Ending: when the edit hands off to a new active side, clear exhaustion
 *      from every in-play character once for the turn.
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

  const terminal = scoreOrTurnLimitResult(battle, boardAfter);
  if (terminal !== null) {
    return {
      ...battle,
      board: forceBattleResult(boardAfter, terminal, EMISSION).state,
      effectQueue: [],
      pendingPrompt: null,
    };
  }

  const queue: EffectRun[] = [...battle.effectQueue];

  let board = boardAfter;
  let dawnFired = battle.dawnFired;
  let triggerDawnFired = battle.triggerDawnFired ?? emptyDawnFired();

  // Step 2 — structural Ending exhaustion clear, fired exactly once when the
  // active side flips.
  const handedOff = boardBefore.activeSide !== boardAfter.activeSide;
  if (
    handedOff &&
    boardAfter.result === null &&
    dawnFired[boardBefore.activeSide] !== boardBefore.turnNumber
  ) {
    const outgoingSide = boardBefore.activeSide;
    for (const side of BATTLE_SIDES) {
      board = applyBoardEdits(
        board,
        endOfTurnExhaustionClearEdits(board, side),
      );
    }
    dawnFired = {
      ...dawnFired,
      [outgoingSide]: boardBefore.turnNumber,
    };
  }

  // Ending also expires turn-bounded Dreamwell effects. Restore moves are
  // applied through the same observed-edge scheduler as every other zone move,
  // so materialization scripts and the subsequent static settlement run once.
  if (handedOff && boardAfter.result === null) {
    for (const endingEdit of settleTemporaryDreamwellEffects(
      board,
      boardBefore.activeSide,
      boardBefore.turnNumber,
    )) {
      const beforeEndingEdit = board;
      board = applyBoardEdits(board, [endingEdit]);
      scheduleBattleTriggerEdges(queue, beforeEndingEdit, board, {
        id: "DEBUG_EDIT",
        edit: endingEdit,
        sourceSurface: "auto-system",
      });
    }
  }

  scheduleBattleTriggerEdges(queue, boardBefore, boardAfter, command);

  // Dawn is an authoritative board edge, not a component mount concern. A
  // marker on the fold makes the once-per-controller-turn rule replay-safe.
  if (
    boardAfter.phase === "dawn" &&
    boardAfter.result === null &&
    triggerDawnFired[boardAfter.activeSide] !== boardAfter.turnNumber
  ) {
    forEachInPlay(boardAfter, boardAfter.activeSide, (battleCardId) => {
      enqueueBattleTrigger(queue, boardAfter, battleCardId, "dawn");
    });
    triggerDawnFired = {
      ...triggerDawnFired,
      [boardAfter.activeSide]: boardAfter.turnNumber,
    };
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
      queue.push(
        newEffectRun(
          { table: "dreamwell", id: parseBattleEffectScriptId(card.id) },
          side,
        ),
      );
    }
  }

  const tutorialMode = battleModeOf(battle);
  if (tutorialMode.kind === "tutorial") {
    const revealedSide = BATTLE_SIDES.find(
      (side) =>
        boardBefore.sides[side].dreamwellDrawnTurn !== boardAfter.turnNumber &&
        boardAfter.sides[side].dreamwellDrawnTurn === boardAfter.turnNumber,
    );
    if (revealedSide !== undefined) {
      const index = boardAfter.sides[revealedSide].dreamwellCardIndex;
      const card =
        index === null ? undefined : battle.init.dreamwellDeck[index];
      if (card !== undefined) {
        return {
          ...battle,
          board,
          effectQueue: queue,
          pendingPrompt: null,
          dawnFired,
          triggerDawnFired,
          tutorialPresentation: {
            id: parsePresentationId(
              `dreamwell-reveal:${revealedSide}:${String(boardAfter.turnNumber)}:${card.id}`,
            ),
            kind: "dreamwell-reveal",
            cardId: card.id,
            side: revealedSide,
            turnNumber: boardAfter.turnNumber,
          },
        };
      }
    }
  }

  // Step 4 — advance the queue, continuing the SAME draw counter.
  const advanced = advanceEffectQueueWithStream(
    {
      ...battle,
      board,
      effectQueue: queue,
      pendingPrompt: null,
      dawnFired,
      triggerDawnFired,
    },
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
      planStaticContributionSettlement(advanced.board, true, random, nowMs),
    ),
  };
}

/**
 * `BATTLE_COMMAND { command }`: the single synchronous fold step for one battle
 * command. Applies the command through {@link applyBattleCommandStep} — its edit
 * plus structural Ending, Dreamwell, Support, and force-result routing — so a
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
  actor?: EventActor,
): FoldState | null {
  return battleCommandInternal(state, payload, ctx, actor, false);
}

/**
 * Recognizes the two journey-battle lifecycle handoffs that every connected
 * client observes and may race to append. Hosted observers remain unable to
 * submit player or debug decisions: the command envelope, intent key, and
 * folded prerequisites must all exactly match the automatic transition.
 */
export function isPassiveHostedBattleHandoff(
  state: FoldState,
  payload: Record<string, unknown>,
  intentKey: IntentKey | undefined,
): boolean {
  const battle = state.battle;
  if (
    battle === null ||
    battleModeOf(battle).kind !== "journey" ||
    typeof intentKey !== "string"
  ) {
    return false;
  }
  const command = coerceBattleCommand(payload.command);
  if (
    command === null ||
    command.id !== "DEBUG_EDIT" ||
    command.actor !== "system" ||
    command.sourceSurface !== "auto-system" ||
    automaticBattleIntentKey(battle.init.battleId, battle.board, command) !==
      intentKey
  ) {
    return false;
  }

  const { board } = battle;
  if (board.result !== null || board.phase !== "dreamwell") {
    return false;
  }
  if (command.edit.kind === "DRAW_DREAMWELL_CARD") {
    return (
      command.edit.additional !== true &&
      command.edit.side === board.activeSide &&
      command.edit.turnNumber === board.turnNumber
    );
  }
  return (
    command.edit.kind === "SET_PHASE" &&
    command.edit.phase === "day" &&
    board.turnNumber === 1 &&
    board.sides[board.activeSide].dreamwellDrawnTurn === board.turnNumber
  );
}

function battleCommandInternal(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  actor: EventActor | undefined,
  suppressGuidance: boolean,
): FoldState | null {
  const battle = state.battle;
  if (battle === null) {
    return null;
  }
  const command = coerceBattleCommand(payload.command);
  if (command === null) {
    return null;
  }
  if (
    !tutorialCommandIsAuthorized(
      battle,
      command,
      actor,
      state.playtestControl?.controllerClientId ?? null,
    )
  )
    return null;
  if (!voidPlaySourceIsLegal(battle.board, command)) return null;

  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const nowMs = isoTimestampToMs(ctx.timestamp) ?? 0;
  const challengeStart = challengeStartFor(command, battle);
  if (challengeStart !== null) {
    const started = applyBattleCommandStep(
      battle,
      challengeStart.command,
      ctx.seq,
      random,
      nowMs,
    );
    if (started === null) return null;
    return {
      ...state,
      battle: driveChallengeCursor(
        { ...started, challengeCursor: challengeStart.cursor },
        ctx.seq,
        random,
        nowMs,
      ),
    };
  }
  const commands = isChallengeEntryCommand(command)
    ? [command]
    : planBasicAutomationCommands(battle.board, command, {
        maxEnergyCap: battle.init.maxEnergyCap,
        scoreToWin: battle.init.scoreToWin,
        handLimit: battle.init.handLimit,
        dreamwellDeck: battle.init.dreamwellDeck,
      });
  if (
    !suppressGuidance &&
    command.id === "DEBUG_EDIT" &&
    command.edit.kind === "MOVE_CARD_TO_ZONE" &&
    "slotId" in command.edit.destination
  ) {
    const location = selectBattleCardLocation(
      battle.board,
      command.edit.battleCardId,
    );
    const instance = battle.board.cardInstances[command.edit.battleCardId];
    if (location?.zone === "hand" && instance !== undefined) {
      const guidance = openTutorialGuidance(
        state,
        battle,
        "card-play",
        {
          kind: "card",
          cardId: instance.definition.cardId,
          battleCardId: command.edit.battleCardId,
          cardKind: instance.definition.battleCardKind,
          side: instance.controller,
        },
        instance.definition.renderedText,
        instance.definition.battleCardKind,
        { kind: "commands", commands },
      );
      if (guidance !== null) return guidance;
    }
  }
  const dreamwellRevealCommand = commands.find(
    (
      candidate,
    ): candidate is BattleCommand & {
      id: "DEBUG_EDIT";
      edit: Extract<BattleDebugEdit, { kind: "DRAW_DREAMWELL_CARD" }>;
    } =>
      candidate.id === "DEBUG_EDIT" &&
      candidate.edit.kind === "DRAW_DREAMWELL_CARD",
  );
  if (
    !suppressGuidance &&
    dreamwellRevealCommand !== undefined &&
    battle.init.dreamwellDeck.length > 0
  ) {
    const definition =
      battle.init.dreamwellDeck[
        battle.board.dreamwellDeckIndex % battle.init.dreamwellDeck.length
      ];
    if (definition !== undefined) {
      const guidance = openTutorialGuidance(
        state,
        battle,
        "dreamwell-resolve",
        {
          kind: "dreamwell",
          cardId: definition.id,
          side: dreamwellRevealCommand.edit.side,
        },
        definition.renderedText,
        undefined,
        { kind: "commands", commands },
      );
      if (guidance !== null) return guidance;
    }
  }
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
  const completed = driveChallengeCursor(current, ctx.seq, random, nowMs);
  if (!suppressGuidance) {
    const openedPlayerNightPhase =
      command.id === "DEBUG_EDIT" &&
      command.edit.kind === "SET_PHASE" &&
      command.edit.phase === "night" &&
      battle.board.activeSide === "player" &&
      battle.board.phase === "dusk" &&
      completed.board.activeSide === "player" &&
      completed.board.phase === "night";
    if (openedPlayerNightPhase) {
      const guidance = openTutorialGuidance(
        { ...state, battle: completed },
        completed,
        "player-night-phase",
        {
          kind: "battle",
          activeSide: completed.board.activeSide,
          turnNumber: completed.board.turnNumber,
        },
        "",
        undefined,
        { kind: "commands", commands: [] },
      );
      if (guidance !== null) return guidance;
    }
    const openedOpponentRepositionOpportunity =
      command.id === "DEBUG_EDIT" &&
      command.edit.kind === "SET_PHASE" &&
      command.edit.phase === "dusk" &&
      battle.board.activeSide === "player" &&
      battle.board.phase === "day";
    if (openedOpponentRepositionOpportunity) {
      const guidance = openTutorialGuidance(
        { ...state, battle: completed },
        completed,
        "opponent-reposition-opportunity",
        {
          kind: "battle",
          activeSide: completed.board.activeSide,
          turnNumber: completed.board.turnNumber,
        },
        "",
        undefined,
        { kind: "commands", commands: [] },
      );
      if (guidance !== null) return guidance;
    }
    const guidance = openFigmentCreatedGuidance(state, battle, completed);
    if (guidance !== null) return guidance;
  }
  return { ...state, battle: completed };
}

/**
 * Semantic tutorial intent for moving one character to one exact battlefield
 * cell. The reducer owns legality and translates the accepted intent into the
 * existing deterministic battle-edit pipeline.
 */
export function battleRepositionCharacter(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  actor?: EventActor,
): FoldState | null {
  const battle = state.battle;
  if (battle === null || battleModeOf(battle).kind !== "tutorial") return null;
  if (
    !tutorialActorIsAuthorized(
      battle,
      actor,
      false,
      state.playtestControl?.controllerClientId ?? null,
    )
  )
    return null;
  const battleCardId = payload.battleCardId;
  const candidate = payload.destination;
  if (
    typeof battleCardId !== "string" ||
    typeof candidate !== "object" ||
    candidate === null
  ) {
    return null;
  }
  const raw = candidate as {
    readonly side?: unknown;
    readonly zone?: unknown;
    readonly slotId?: unknown;
  };
  if (
    raw.side !== "player" ||
    (raw.zone !== "backRank" && raw.zone !== "frontRank") ||
    typeof raw.slotId !== "string"
  ) {
    return null;
  }
  const destination = {
    side: raw.side,
    zone: raw.zone,
    slotId: raw.slotId,
  } as BattleFieldSlotAddress;
  if (!isBattleFieldSlotAddressValid(destination)) return null;
  const edit = planTutorialCharacterReposition(
    battle.board,
    parseBattleCardId(battleCardId),
    destination,
  );
  if (edit === null) return null;
  return battleCommand(
    state,
    {
      command: {
        id: "DEBUG_EDIT",
        edit,
        sourceSurface: "tutorial-player",
      },
    },
    ctx,
  );
}

/** Semantic source legality for moves that are actually plays from a void. */
function voidPlaySourceIsLegal(
  board: BattleMutableState,
  command: BattleCommand,
): boolean {
  if (command.id !== "DEBUG_EDIT" || command.edit.kind !== "MOVE_CARD_TO_ZONE")
    return true;
  if (!("slotId" in command.edit.destination)) return true;
  const location = selectBattleCardLocation(board, command.edit.battleCardId);
  if (location?.zone !== "void") return true;
  const instance = board.cardInstances[command.edit.battleCardId];
  if (instance === undefined) return false;
  if (
    instance.definition.reclaimCost === null &&
    !hasTemporaryReclaimEligibility(board, instance)
  )
    return false;
  if (
    board.sides[instance.controller].currentEnergy <
    instance.definition.energyCost
  )
    return false;
  if (!instance.definition.isFast) {
    return board.activeSide === instance.controller && board.phase === "day";
  }
  return board.activeSide === instance.controller
    ? board.phase === "day" || board.phase === "night"
    : board.phase === "dusk";
}

/** Tutorial events are driver-owned; automation may only use its bound actor. */
function tutorialActorIsAuthorized(
  battle: BattleFoldState,
  actor: EventActor | undefined,
  automatic: boolean,
  controllerClientId: ClientId | null,
): boolean {
  const mode = battleModeOf(battle);
  if (mode.kind !== "tutorial") return true;
  if (actor === undefined) return true;
  if (controllerClientId === null) return false;
  return automatic
    ? actor === `tutorial-ai:${controllerClientId}`
    : actor === controllerClientId;
}

/** Limits driver gestures to the tutorial's declared player controls. */
function tutorialCommandIsAuthorized(
  battle: BattleFoldState,
  command: BattleCommand,
  actor: EventActor | undefined,
  controllerClientId: ClientId | null,
): boolean {
  const mode = battleModeOf(battle);
  if (mode.kind !== "tutorial") return true;
  if (actor === undefined) return true;
  if (
    controllerClientId !== null &&
    actor === `tutorial-ai:${controllerClientId}`
  )
    return true;
  if (
    !tutorialActorIsAuthorized(battle, actor, false, controllerClientId) ||
    command.id !== "DEBUG_EDIT"
  )
    return false;
  const edit = command.edit;
  if (edit.kind === "SET_PHASE") {
    return (
      (battle.board.activeSide === "player" &&
        battle.board.phase === "day" &&
        edit.phase === "dusk") ||
      (battle.board.activeSide === "player" &&
        battle.board.phase === "night" &&
        edit.phase === "challenge") ||
      (battle.board.activeSide === "enemy" &&
        battle.board.phase === "dusk" &&
        edit.phase === "night")
    );
  }
  if (edit.kind === "SWAP_BATTLEFIELD_SLOTS") {
    const battleCardId = selectBattlefieldSlotOccupant(
      battle.board,
      edit.source,
    );
    if (battleCardId === null) return false;
    const planned = planTutorialCharacterReposition(
      battle.board,
      battleCardId,
      edit.target,
    );
    return (
      planned?.kind === "SWAP_BATTLEFIELD_SLOTS" &&
      planned.source.side === edit.source.side &&
      planned.source.zone === edit.source.zone &&
      planned.source.slotId === edit.source.slotId
    );
  }
  if (edit.kind !== "MOVE_CARD_TO_ZONE" || !("slotId" in edit.destination))
    return false;
  return (
    planTutorialCharacterReposition(
      battle.board,
      edit.battleCardId,
      edit.destination,
    )?.kind === "MOVE_CARD_TO_ZONE"
  );
}

interface BattlePlayCardIntent {
  battleCardId: BattleCardId;
  targetBattleCardIds: BattleCardId[];
  aiChoices: BattleAiChoiceTrace[];
  characterDestination:
    import("../../battle/types").BattleFieldSlotAddress | null;
  tutorialAiActionOverrideId: TutorialAiActionOverrideId | null;
}

/** Semantic, all-or-nothing Starter-card play for tutorial and AI clients. */
export function battlePlayCard(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  actor?: EventActor,
): FoldState | null {
  return battlePlayCardInternal(state, payload, ctx, actor, false);
}

function battlePlayCardInternal(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  actor: EventActor | undefined,
  suppressGuidance: boolean,
): FoldState | null {
  const battle = state.battle;
  const intent = coerceBattlePlayCardIntent(payload);
  const mode = battle === null ? null : battleModeOf(battle);
  const controllerClientId = state.playtestControl?.controllerClientId ?? null;
  const automatic =
    mode?.kind === "tutorial" &&
    controllerClientId !== null &&
    actor === `tutorial-ai:${controllerClientId}`;
  if (
    battle === null ||
    intent === null ||
    battle.pendingPrompt !== null ||
    battle.board.result !== null ||
    !tutorialActorIsAuthorized(battle, actor, automatic, controllerClientId)
  )
    return null;
  const before = battle.board;
  const instance = before.cardInstances[intent.battleCardId];
  const location = selectBattleCardLocation(before, intent.battleCardId);
  const scriptedOverride =
    intent.tutorialAiActionOverrideId === null
      ? null
      : automatic || suppressGuidance
        ? resolveTutorialAiPlayCardOverride(
            battle,
            intent.tutorialAiActionOverrideId,
            intent.battleCardId,
          )
        : null;
  if (
    instance === undefined ||
    location?.zone !== "hand" ||
    location.side !== instance.controller ||
    !isBattleCardSemanticPlayAutomated(instance.definition.cardId) ||
    (intent.tutorialAiActionOverrideId !== null && scriptedOverride === null) ||
    before.activeSide !== instance.controller ||
    before.phase !== "day" ||
    instance.definition.isFast ||
    before.sides[instance.controller].currentEnergy <
      instance.definition.energyCost
  )
    return null;
  const targetsAreLegal = semanticPlayTargetsAreLegal(
    before,
    instance.controller,
    instance.definition.cardId,
    intent.targetBattleCardIds,
  );
  if (!targetsAreLegal) {
    const attemptedWithNoAvailableTargets =
      !suppressGuidance &&
      intent.targetBattleCardIds.length === 0 &&
      starterCardRequiresTarget(instance.definition.cardId) &&
      selectStarterCardLegalTargetIds(before, intent.battleCardId).length === 0;
    if (!attemptedWithNoAvailableTargets) return null;
    return openTutorialGuidance(
      state,
      battle,
      "card-no-valid-targets",
      {
        kind: "card",
        cardId: instance.definition.cardId,
        battleCardId: intent.battleCardId,
        cardKind: instance.definition.battleCardKind,
        side: instance.controller,
      },
      instance.definition.renderedText,
      instance.definition.battleCardKind,
      { kind: "commands", commands: [] },
    );
  }

  const character = instance.definition.battleCardKind === "character";
  let destination: import("../../battle/debug/commands").BattleDebugZoneDestination;
  if (character) {
    const requested = intent.characterDestination;
    if (requested !== null) {
      if (
        requested.side !== instance.controller ||
        requested.zone !== "backRank" ||
        before.sides[requested.side].backRank[
          requested.slotId as `B${number}`
        ] != null
      )
        return null;
      destination = requested;
    } else {
      const slotId = rankSlotIds(
        before.sides[instance.controller].backRank,
      ).find(
        (candidate) =>
          before.sides[instance.controller].backRank[candidate] === null,
      );
      if (slotId === undefined) return null;
      destination = { side: instance.controller, zone: "backRank", slotId };
    }
  } else if (instance.definition.battleCardKind === "event") {
    destination = { side: instance.controller, zone: "void" };
  } else return null;

  if (!suppressGuidance) {
    const guidance = openTutorialGuidance(
      state,
      battle,
      "card-play",
      {
        kind: "card",
        cardId: instance.definition.cardId,
        battleCardId: intent.battleCardId,
        cardKind: instance.definition.battleCardKind,
        side: instance.controller,
      },
      instance.definition.renderedText,
      instance.definition.battleCardKind,
      {
        kind: "play-card",
        payload: { ...payload },
        automatic,
      },
    );
    if (guidance !== null) return guidance;
  }

  // Work on a local board so every validation finishes before the cost becomes
  // observable. Queue draining happens only after movement and cost coexist.
  const move = {
    kind: "MOVE_CARD_TO_ZONE" as const,
    battleCardId: intent.battleCardId,
    destination,
  };
  let board = applyBoardEdits(before, [
    {
      kind: "ADJUST_CURRENT_ENERGY",
      side: instance.controller,
      amount: -instance.definition.energyCost,
    },
    move,
    ...(character
      ? [
          {
            kind: "SET_CARD_STATUS" as const,
            battleCardId: intent.battleCardId,
            status: { isExhausted: true },
          },
        ]
      : []),
  ]);
  const queue = [...battle.effectQueue];
  scheduleBattleTriggerEdges(
    queue,
    before,
    board,
    { id: "DEBUG_EDIT", edit: move, sourceSurface: "auto-system" },
    intent.targetBattleCardIds,
  );
  // The tutorial opponent's card remains the authoritative presentation focus
  // before any of its triggered work is drained. The follow-up event resumes
  // this exact queued state, so a remount cannot skip or duplicate effects.
  if (!suppressGuidance && automatic && instance.controller === "enemy") {
    const transition = battlePlayCardTransition(
      battle,
      intent,
      instance,
      scriptedOverride,
    );
    return {
      ...state,
      battle: consumeTutorialAiActionOverride(
        {
          ...battle,
          board,
          effectQueue: queue,
          pendingPrompt: null,
          tutorialPresentation: {
            id: parsePresentationId(`opponent-play:${intent.battleCardId}`),
            kind: "opponent-play",
            cardId: instance.definition.cardId,
            battleCardId: intent.battleCardId,
            cardKind: instance.definition.battleCardKind,
          },
          lastTransition: transition,
        },
        scriptedOverride?.id ?? null,
      ),
    };
  }
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const nowMs = isoTimestampToMs(ctx.timestamp) ?? 0;
  const advanced = advanceEffectQueueWithStream(
    { ...battle, board, effectQueue: queue, pendingPrompt: null },
    ctx.seq,
    random,
    nowMs,
  );
  board = applyBoardEdits(
    advanced.board,
    planStaticContributionSettlement(advanced.board, true, random, nowMs),
  );
  return {
    ...state,
    battle: consumeTutorialAiActionOverride(
      {
        ...advanced,
        board,
        lastTransition: battlePlayCardTransition(
          battle,
          intent,
          instance,
          scriptedOverride,
        ),
      },
      scriptedOverride?.id ?? null,
    ),
  };
}

function battlePlayCardTransition(
  battle: BattleFoldState,
  intent: BattlePlayCardIntent,
  instance: BattleCardInstance,
  scriptedOverride: ReturnType<typeof resolveTutorialAiPlayCardOverride>,
): BattleTransitionData {
  return {
    ...createEmptyTransitionData(),
    aiChoices: intent.aiChoices,
    logEvents:
      scriptedOverride === null
        ? []
        : [
            {
              event: "battle_ai_action_override_applied",
              fields: {
                battleId: battle.board.battleId,
                overrideId: scriptedOverride.id,
                triggerKind: scriptedOverride.trigger.kind,
                triggerCardId: scriptedOverride.trigger.cardId,
                actionKind: scriptedOverride.action.kind,
                actionCardId: scriptedOverride.action.cardId,
                battleCardId: instance.battleCardId,
                side: instance.controller,
                turnNumber: battle.board.turnNumber,
              },
            },
          ],
  };
}

/**
 * Clears one persisted tutorial reveal and resumes its queued rule effects.
 * The UI timer only submits this intent; the matching presentation id in the
 * fold remains the sole gate on shared automatic progression.
 */
export function completeTutorialBattlePresentation(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  actor?: EventActor,
): FoldState | null {
  const battle = state.battle;
  const presentation = battle?.tutorialPresentation ?? null;
  const mode = battle === null ? null : battleModeOf(battle);
  const controllerClientId = state.playtestControl?.controllerClientId ?? null;
  const presentationActorIsAuthorized =
    mode?.kind !== "tutorial" ||
    (controllerClientId !== null &&
      (actor === controllerClientId ||
        actor === `tutorial-ai:${controllerClientId}`));
  if (
    battle !== null &&
    presentationActorIsAuthorized &&
    presentation?.kind === "tutorial-guidance" &&
    typeof payload.presentationId === "string" &&
    payload.presentationId === presentation.id &&
    payload.messageIndex === presentation.messageIndex
  ) {
    const nextMessageIndex = presentation.messageIndex + 1;
    if (nextMessageIndex < presentation.messages.length) {
      return {
        ...state,
        battle: {
          ...battle,
          tutorialPresentation: {
            ...presentation,
            messageIndex: nextMessageIndex,
          },
        },
      };
    }
    const cleared: BattleFoldState = {
      ...battle,
      tutorialPresentation: null,
    };
    if (presentation.continuation.kind === "play-card") {
      const controllerClientId =
        state.playtestControl?.controllerClientId ?? null;
      return battlePlayCardInternal(
        { ...state, battle: cleared },
        { ...presentation.continuation.payload },
        ctx,
          presentation.continuation.automatic &&
          mode?.kind === "tutorial" &&
          controllerClientId !== null
          ? tutorialAiEventActor(controllerClientId)
          : undefined,
        true,
      );
    }
    let drawIndex = 0;
    const random = (): number => ctx.rng(drawIndex++);
    const nowMs = isoTimestampToMs(ctx.timestamp) ?? 0;
    let current = cleared;
    for (const command of presentation.continuation.commands) {
      const next = applyBattleCommandStep(
        current,
        command,
        ctx.seq,
        random,
        nowMs,
      );
      if (next === null) return null;
      current = next;
    }
    if (current.tutorialPresentation?.kind === "dreamwell-reveal") {
      const advanced = advanceEffectQueueWithStream(
        { ...current, tutorialPresentation: null },
        ctx.seq,
        random,
        nowMs,
      );
      current = {
        ...advanced,
        board: applyBoardEdits(
          advanced.board,
          planStaticContributionSettlement(advanced.board, true, random, nowMs),
        ),
      };
    }
    const figmentGuidance = openFigmentCreatedGuidance(state, battle, current);
    if (figmentGuidance !== null) return figmentGuidance;
    return {
      ...state,
      battle: driveChallengeCursor(current, ctx.seq, random, nowMs),
    };
  }
  if (
    battle === null ||
    mode?.kind !== "tutorial" ||
    actor !== `tutorial-ai:${controllerClientId ?? ""}` ||
    typeof payload.presentationId !== "string" ||
    presentation === null ||
    payload.presentationId !== presentation.id
  ) {
    return null;
  }
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const nowMs = isoTimestampToMs(ctx.timestamp) ?? 0;
  const advanced = advanceEffectQueueWithStream(
    { ...battle, tutorialPresentation: null },
    ctx.seq,
    random,
    nowMs,
  );
  const board = applyBoardEdits(
    advanced.board,
    planStaticContributionSettlement(advanced.board, true, random, nowMs),
  );
  const settled = { ...advanced, board };
  const figmentGuidance = openFigmentCreatedGuidance(state, battle, settled);
  if (figmentGuidance !== null) return figmentGuidance;
  if (presentation.kind === "challenge-resolved") {
    const challengeGuidance = openTutorialGuidance(
      { ...state, battle: settled },
      settled,
      "challenge-resolved",
      {
        kind: "challenge",
        activeSide: presentation.activeSide,
        turnNumber: settled.board.turnNumber,
        slotId: presentation.slotId,
      },
      "",
      undefined,
      { kind: "commands", commands: [] },
    );
    if (challengeGuidance !== null) return challengeGuidance;
  }
  // A paced Challenge beat parks its cursor rather than clearing it, so the
  // cursor is driven again here: the settled-Challenge beat resumes into its
  // deferred turn handoff. A presentation folded with no cursor is unaffected.
  return {
    ...state,
    battle: driveChallengeCursor(settled, ctx.seq, random, nowMs),
  };
}

function coerceBattlePlayCardIntent(
  raw: Record<string, unknown>,
): BattlePlayCardIntent | null {
  const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
  const targetBattleCardIds = battleCardIdArrayFromUnknown(
    raw.targetBattleCardIds,
  );
  if (battleCardId === null || targetBattleCardIds === null) return null;
  if (new Set(targetBattleCardIds).size !== targetBattleCardIds.length) return null;
  const aiChoices =
    raw.aiChoices === undefined ? [] : coerceAiChoices(raw.aiChoices);
  if (aiChoices === null) return null;
  const characterDestination = coerceCharacterDestination(
    raw.characterDestination,
  );
  if (characterDestination === undefined) return null;
  const tutorialAiActionOverrideId =
    raw.tutorialAiActionOverrideId === undefined
      ? null
      : isNonEmptyString(raw.tutorialAiActionOverrideId)
        ? tutorialAiActionOverrideIdFromUnknown(raw.tutorialAiActionOverrideId)
        : undefined;
  if (tutorialAiActionOverrideId === undefined) return null;
  return {
    battleCardId,
    targetBattleCardIds,
    aiChoices,
    characterDestination,
    tutorialAiActionOverrideId: tutorialAiActionOverrideId,
  };
}

function coerceCharacterDestination(
  raw: unknown,
): import("../../battle/types").BattleFieldSlotAddress | null | undefined {
  if (raw === undefined) return null;
  if (
    !isPlainRecord(raw) ||
    (raw.side !== "player" && raw.side !== "enemy") ||
    raw.zone !== "backRank" ||
    typeof raw.slotId !== "string"
  )
    return undefined;
  const destination = {
    side: raw.side,
    zone: raw.zone,
    slotId: raw.slotId,
  } as import("../../battle/types").BattleFieldSlotAddress;
  return isBattleFieldSlotAddressValid(destination) ? destination : undefined;
}

function coerceAiChoices(raw: unknown): BattleAiChoiceTrace[] | null {
  if (!Array.isArray(raw)) return null;
  const choices: BattleAiChoiceTrace[] = [];
  for (const value of raw) {
    if (!isPlainRecord(value)) return null;
    const {
      stage,
      choice,
      battleCardId,
      cardName,
      sourceHandIndex,
      sourceSlotId,
      targetSlotId,
      heuristicScoreBefore,
      heuristicScoreAfter,
      rationale,
      targetBattleCardId,
    } = value;
    if (
      (stage !== "character" &&
        stage !== "reposition" &&
        stage !== "nonCharacter" &&
        stage !== "endTurn") ||
      (choice !== "PLAY_CARD" &&
        choice !== "MOVE_CARD" &&
        choice !== "END_TURN") ||
      !isNullableString(battleCardId) ||
      !isNullableString(cardName) ||
      !isNullableInteger(sourceHandIndex) ||
      !isNullableString(sourceSlotId) ||
      !isNullableString(targetSlotId) ||
      !isNullableFiniteNumber(heuristicScoreBefore) ||
      !isNullableFiniteNumber(heuristicScoreAfter) ||
      !isNullableString(rationale) ||
      !isNullableString(targetBattleCardId)
    )
      return null;
    choices.push({
      stage,
      choice,
      battleCardId: battleCardIdFromUnknown(battleCardId),
      cardName: cardName === null ? null : parseCardName(cardName),
      sourceHandIndex,
      sourceSlotId: sourceSlotId as BattleAiChoiceTrace["sourceSlotId"],
      targetSlotId: targetSlotId as BattleAiChoiceTrace["targetSlotId"],
      heuristicScoreBefore,
      heuristicScoreAfter,
      rationale,
      targetBattleCardId: battleCardIdFromUnknown(targetBattleCardId),
    });
  }
  return choices;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableInteger(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isInteger(value))
  );
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

/**
 * `BATTLE_GESTURE { commands }`: one player gesture the automation planner
 * expanded into an ordered list of battle commands (a play that also spends
 * energy, or a turn handoff that resolves the Challenge and Ending cleanup).
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
  actor?: EventActor,
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
  if (
    !commands.every((command) =>
      tutorialCommandIsAuthorized(
        battle,
        command,
        actor,
        state.playtestControl?.controllerClientId ?? null,
      ),
    )
  )
    return null;
  const playedCardCommand = commands.find(
    (candidate) =>
      candidate.id === "DEBUG_EDIT" &&
      candidate.edit.kind === "MOVE_CARD_TO_ZONE" &&
      "slotId" in candidate.edit.destination &&
      selectBattleCardLocation(battle.board, candidate.edit.battleCardId)
        ?.zone === "hand",
  );
  if (
    playedCardCommand?.id === "DEBUG_EDIT" &&
    playedCardCommand.edit.kind === "MOVE_CARD_TO_ZONE"
  ) {
    const instance =
      battle.board.cardInstances[playedCardCommand.edit.battleCardId];
    if (instance !== undefined) {
      const guidance = openTutorialGuidance(
        state,
        battle,
        "card-play",
        {
          kind: "card",
          cardId: instance.definition.cardId,
          battleCardId: instance.battleCardId,
          cardKind: instance.definition.battleCardKind,
          side: instance.controller,
        },
        instance.definition.renderedText,
        instance.definition.battleCardKind,
        { kind: "commands", commands },
      );
      if (guidance !== null) return guidance;
    }
  }
  const dreamwellCommand = commands.find(
    (
      candidate,
    ): candidate is BattleCommand & {
      id: "DEBUG_EDIT";
      edit: Extract<BattleDebugEdit, { kind: "DRAW_DREAMWELL_CARD" }>;
    } =>
      candidate.id === "DEBUG_EDIT" &&
      candidate.edit.kind === "DRAW_DREAMWELL_CARD",
  );
  if (dreamwellCommand !== undefined && battle.init.dreamwellDeck.length > 0) {
    const definition =
      battle.init.dreamwellDeck[
        battle.board.dreamwellDeckIndex % battle.init.dreamwellDeck.length
      ];
    if (definition !== undefined) {
      const guidance = openTutorialGuidance(
        state,
        battle,
        "dreamwell-resolve",
        {
          kind: "dreamwell",
          cardId: definition.id,
          side: dreamwellCommand.edit.side,
        },
        definition.renderedText,
        undefined,
        { kind: "commands", commands },
      );
      if (guidance !== null) return guidance;
    }
  }

  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const nowMs = isoTimestampToMs(ctx.timestamp) ?? 0;

  let current = battle;
  for (const command of commands) {
    const next = applyBattleCommandStep(
      current,
      command,
      ctx.seq,
      random,
      nowMs,
    );
    if (next === null) {
      return null;
    }
    current = next;
  }
  const guidance = openFigmentCreatedGuidance(state, battle, current);
  if (guidance !== null) return guidance;
  return { ...state, battle: current };
}

/**
 * Applies the AI blocker's deterministic Dusk repositioning once per opposing
 * turn. The processed marker lives in the fold so remounts and reloads cannot
 * repeat the blocking or suppress a needed retry.
 */
export function battleAiBlock(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  actor?: EventActor,
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
  if (
    !tutorialActorIsAuthorized(
      battle,
      actor,
      true,
      state.playtestControl?.controllerClientId ?? null,
    )
  )
    return null;

  const marker = battle.aiBlockingTurn;
  if (
    marker?.activeSide === battle.board.activeSide &&
    marker.turnNumber === battle.board.turnNumber
  ) {
    return null;
  }

  const commands: BattleCommand[] = [];
  const model = forwardModelFromState(battle.board, aiSide);
  const blocking = planBlockingWithDecision(model, {
    scoreToWin: battle.init.scoreToWin,
  });
  for (const move of blocking.actions) {
    const moveCommands = actionToCommands(move, aiSide);
    const [firstCommand, ...restCommands] = moveCommands;
    const tracedCommands =
      firstCommand === undefined
        ? moveCommands
        : [{ ...firstCommand, aiChoices: [buildTrace(move)] }, ...restCommands];
    commands.push(...tracedCommands);
  }

  let nextBattle = battle;
  if (commands.length > 0) {
    const applied = battleGesture(state, { commands }, ctx, actor);
    if (applied === null || applied.battle === null) {
      return null;
    }
    nextBattle = applied.battle;
  }

  const blockers = declaredBlockers(battle.board, nextBattle.board, aiSide);
  const transition = nextBattle.lastTransition ?? createEmptyTransitionData();
  // The blocker's move into a contested lane and that lane's resolution are one
  // fold step apart, so the tutorial parks here. Without the beat the blocker
  // enters and dissolves inside a single frame and the player only ever sees the
  // void. Other battle modes keep resolving without a pause.
  const pacedBlock =
    battleModeOf(battle).kind === "tutorial" &&
    blockers.length > 0 &&
    (nextBattle.tutorialPresentation ?? null) === null;
  return {
    ...state,
    battle: {
      ...nextBattle,
      ...(pacedBlock
        ? {
            tutorialPresentation: {
              id: parsePresentationId(
                `opponent-block:${battle.board.activeSide}:${String(battle.board.turnNumber)}`,
              ),
              kind: "opponent-block",
              activeSide: battle.board.activeSide,
              blockers,
            } satisfies OpponentBlockPresentation,
          }
        : {}),
      lastTransition: {
        ...transition,
        logEvents: [
          ...transition.logEvents,
          {
            event: "battle_ai_blocking_decision",
            fields: { ...blocking.decision },
          } satisfies BattleDeferredLogEvent,
          ...(blockers.length === 0
            ? []
            : [
                {
                  event: "battle_ai_blockers_declared",
                  fields: {
                    aiSide,
                    activeSide: battle.board.activeSide,
                    turnNumber: battle.board.turnNumber,
                    paced: pacedBlock,
                    blockers: blockers.map((blocker) => ({ ...blocker })),
                  },
                } satisfies BattleDeferredLogEvent,
              ]),
        ],
      },
      aiBlockingTurn: {
        activeSide: battle.board.activeSide,
        turnNumber: battle.board.turnNumber,
      },
    },
  };
}

/**
 * Every blocker that entered a front-rank lane already holding an opposing
 * challenger. A blocker moving into an unopposed lane is repositioning, not
 * blocking, so only contested lanes are reported.
 */
function declaredBlockers(
  before: BattleMutableState,
  after: BattleMutableState,
  aiSide: BattleSide,
): readonly OpponentBlockEntry[] {
  const activeSide: BattleSide = aiSide === "player" ? "enemy" : "player";
  const blockers: OpponentBlockEntry[] = [];
  for (const slotId of rankSlotIds(after.sides[aiSide].frontRank)) {
    const blockerId = after.sides[aiSide].frontRank[slotId];
    const challengerId = after.sides[activeSide].frontRank[slotId];
    if (blockerId === null || challengerId === null) continue;
    if (before.sides[aiSide].frontRank[slotId] === blockerId) continue;
    blockers.push({
      battleCardId: blockerId,
      slotId,
      challengerBattleCardId: challengerId,
    });
  }
  return blockers;
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

/** Resolves the temporary, serialized Dreamwell state attached to cards. */
function settleTemporaryDreamwellEffects(
  board: BattleMutableState,
  activeSide: BattleSide,
  turnNumber: number,
): BattleDebugEdit[] {
  const edits: BattleDebugEdit[] = [];
  for (const battleCardId of identityKeys(board.cardInstances).sort()) {
    const instance = board.cardInstances[battleCardId];
    if (instance === undefined) continue;
    const reclaim = instance.status.temporaryReclaimUntilEnding;
    if (
      reclaim?.activeSide === activeSide &&
      reclaim.turnNumber === turnNumber
    ) {
      edits.push({
        kind: "SET_CARD_STATUS",
        battleCardId,
        status: { temporaryReclaimUntilEnding: null },
      });
    }

    const banish = instance.status.temporaryBanishUntilEnding;
    if (banish?.activeSide !== activeSide || banish.turnNumber !== turnNumber)
      continue;
    const location = selectBattleCardLocation(
      board,
      battleCardId,
    );
    if (location?.zone !== "banished") continue;
    const backRank = board.sides[banish.priorController].backRank;
    const slotId = rankSlotIds(backRank).find(
      (candidate) => backRank[candidate] === null,
    );
    // A full materialized back rank leaves the card banished. The persisted
    // marker records the deterministic reason/source for battle inspection.
    if (slotId === undefined) continue;
    edits.push(
      {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId,
        destination: { side: banish.priorController, zone: "backRank", slotId },
      },
      {
        kind: "SET_CARD_STATUS",
        battleCardId,
        status: { temporaryBanishUntilEnding: null },
      },
    );
  }
  return edits;
}

/** Every fixed front-rank lane the authoritative Challenge traverses. */
const CHALLENGE_LANE_COUNT = FRONT_RANK_SLOTS;

/**
 * Converts an intent that enters Challenge into the first cursor step. A direct
 * handoff enters Challenge first and records its flow edit as a continuation;
 * that continuation is evaluated only after the live board has settled every
 * lane. This keeps a prompt or a dissolved trigger from being bypassed by a
 * precomputed all-lane command plan.
 */
function challengeStartFor(
  command: BattleCommand,
  battle: BattleFoldState,
): { command: BattleCommand; cursor: ChallengeCursor } | null {
  if (battle.challengeCursor !== null && battle.challengeCursor !== undefined)
    return null;
  if (command.id !== "DEBUG_EDIT") return null;
  const { edit } = command;
  if (
    edit.kind === "SET_PHASE" &&
    edit.phase === "challenge" &&
    battle.board.phase !== "challenge"
  ) {
    return {
      command,
      cursor: {
        activeSide: battle.board.activeSide,
        nextLane: 0,
        handoff: null,
      },
    };
  }
  if (edit.kind !== "SET_BATTLE_FLOW") return null;
  if (edit.activeSide === battle.board.activeSide) {
    if (edit.phase !== "challenge" || battle.board.phase === "challenge")
      return null;
    return {
      command,
      cursor: {
        activeSide: battle.board.activeSide,
        nextLane: 0,
        handoff: null,
      },
    };
  }
  if (battle.board.phase === "challenge") return null;
  return {
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "challenge" },
      sourceSurface: "auto-system",
    },
    cursor: {
      activeSide: battle.board.activeSide,
      nextLane: 0,
      handoff: {
        activeSide: edit.activeSide,
        phase: edit.phase,
        turnNumber: edit.turnNumber,
      },
    },
  };
}

/** True for a repeat Challenge phase intent, which must never score it again. */
function isChallengeEntryCommand(command: BattleCommand): boolean {
  return (
    command.id === "DEBUG_EDIT" &&
    ((command.edit.kind === "SET_PHASE" &&
      command.edit.phase === "challenge") ||
      (command.edit.kind === "SET_BATTLE_FLOW" &&
        command.edit.phase === "challenge"))
  );
}

/**
 * Resolves the persisted Challenge cursor from left to right. Every lane starts
 * from the latest folded board; `applyBattleCommandStep` drains its effects and
 * performs static settlement before this loop can read the next lane. A prompt
 * simply returns the parked cursor, and `resolvePrompt` calls this function
 * again after its queue resumes.
 */
function driveChallengeCursor(
  battle: BattleFoldState,
  seq: number,
  random: () => number,
  nowMs: number,
): BattleFoldState {
  let current = battle;
  while (
    current.challengeCursor !== null &&
    current.challengeCursor !== undefined
  ) {
    const cursor = current.challengeCursor;
    const pendingPresentation = cursor.pendingPresentation ?? null;
    if (pendingPresentation !== null) {
      if (
        battleModeOf(current).kind === "tutorial" &&
        (current.tutorialPresentation ?? null) === null
      ) {
        return {
          ...current,
          challengeCursor: { ...cursor, pendingPresentation: null },
          tutorialPresentation: pendingPresentation,
        };
      }
      current = {
        ...current,
        challengeCursor: { ...cursor, pendingPresentation: null },
      };
      continue;
    }
    if (current.board.result !== null) {
      return { ...current, challengeCursor: null };
    }
    if (current.pendingPrompt !== null || current.effectQueue.length > 0)
      return current;

    if (cursor.nextLane >= CHALLENGE_LANE_COUNT) {
      current = { ...current, challengeCursor: null };
      if (cursor.handoff === null) return current;
      const handoff: BattleCommand = {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_BATTLE_FLOW",
          activeSide: cursor.handoff.activeSide,
          phase: cursor.handoff.phase,
          turnNumber: cursor.handoff.turnNumber,
        },
        sourceSurface: "auto-system",
      };
      const commands = planBasicAutomationCommands(current.board, handoff, {
        maxEnergyCap: current.init.maxEnergyCap,
        scoreToWin: current.init.scoreToWin,
        handLimit: current.init.handLimit,
        dreamwellDeck: current.init.dreamwellDeck,
      });
      for (const command of commands) {
        const next = applyBattleCommandStep(
          current,
          command,
          seq,
          random,
          nowMs,
        );
        if (next === null) return current;
        current = next;
        if (current.board.result !== null || current.pendingPrompt !== null)
          return current;
      }
      return current;
    }

    const slotId = frontRankSlotId(cursor.nextLane);
    const opposingSide: BattleSide =
      cursor.activeSide === "player" ? "enemy" : "player";
    const challengerBattleCardId =
      current.board.sides[cursor.activeSide].frontRank[slotId] ?? null;
    const blockerBattleCardId =
      current.board.sides[opposingSide].frontRank[slotId] ?? null;
    const resolution = resolveChallengeLane({
      state: current.board,
      activeSide: cursor.activeSide,
      slotId,
    });
    const presentation =
      challengerBattleCardId === null
        ? null
        : challengeResolvedPresentation({
            activeSide: cursor.activeSide,
            turnNumber: current.board.turnNumber,
            slotId,
            challengerBattleCardId,
            blockerBattleCardId,
            playerScoreDelta: resolution.playerScoreDelta,
            enemyScoreDelta: resolution.enemyScoreDelta,
            dissolved: resolution.dissolved,
          });
    // The score/move edits for this lane are now committed. If a dissolved
    // trigger opens a prompt, resume at the next lane only after that prompt's
    // run drains and static support has been recomputed, then present this
    // lane's settled result before continuing.
    current = {
      ...current,
      challengeCursor: {
        ...cursor,
        nextLane: cursor.nextLane + 1,
        pendingPresentation: presentation,
      },
    };
    for (const edit of resolution.edits) {
      const next = applyBattleCommandStep(
        current,
        { id: "DEBUG_EDIT", edit, sourceSurface: "auto-system" },
        seq,
        random,
        nowMs,
      );
      if (next === null) return current;
      current = next;
      if (current.board.result !== null || current.pendingPrompt !== null)
        break;
    }
  }
  return current;
}

function challengeResolvedPresentation(input: {
  activeSide: BattleSide;
  turnNumber: number;
  slotId: ReturnType<typeof frontRankSlotId>;
  challengerBattleCardId: BattleCardId;
  blockerBattleCardId: BattleCardId | null;
  playerScoreDelta: number;
  enemyScoreDelta: number;
  dissolved: readonly { battleCardId: BattleCardId; side: BattleSide }[];
}): ChallengeResolvedPresentation | null {
  const scored: ChallengeScoredEntry | null =
    input.playerScoreDelta > 0
      ? {
          battleCardId:
            input.activeSide === "player"
              ? input.challengerBattleCardId
              : (input.blockerBattleCardId ?? input.challengerBattleCardId),
          side: "player",
          points: input.playerScoreDelta,
        }
      : input.enemyScoreDelta > 0
        ? {
            battleCardId:
              input.activeSide === "enemy"
                ? input.challengerBattleCardId
                : (input.blockerBattleCardId ?? input.challengerBattleCardId),
            side: "enemy",
            points: input.enemyScoreDelta,
          }
        : null;
  if (input.blockerBattleCardId === null && scored === null) return null;
  return {
    id: parsePresentationId(
      `challenge-resolved:${input.activeSide}:${String(input.turnNumber)}:${input.slotId}`,
    ),
    kind: "challenge-resolved",
    activeSide: input.activeSide,
    slotId: input.slotId,
    challengerBattleCardId: input.challengerBattleCardId,
    blockerBattleCardId: input.blockerBattleCardId,
    scored,
    dissolved: input.dissolved.map((entry) => ({ ...entry })),
  };
}

/** Applies the result policy at every authoritative score-changing seam. */
function scoreOrTurnLimitResult(
  battle: BattleFoldState,
  board: BattleMutableState,
): BattleResult | null {
  if (board.result !== null) return null;
  if (board.sides.player.score >= battle.init.scoreToWin) return "victory";
  if (battleModeOf(battle).kind === "journey") {
    if (board.sides.enemy.score >= battle.init.scoreToWin) return "defeat";
    if (board.turnNumber > battle.init.turnLimit) return "draw";
  }
  return null;
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
      return isBattleSide(raw.side) && isFiniteNumber(raw.value)
        ? { kind: raw.kind, side: raw.side, value: raw.value }
        : null;
    case "INCREASE_MAX_ENERGY_AND_FILL":
    case "DRAW_CARD":
      return isBattleSide(raw.side)
        ? { kind: raw.kind, side: raw.side }
        : null;
    case "ADJUST_SCORE":
    case "ADJUST_CURRENT_ENERGY":
    case "ADJUST_MAX_ENERGY":
      return isBattleSide(raw.side) && isFiniteNumber(raw.amount)
        ? { kind: raw.kind, side: raw.side, amount: raw.amount }
        : null;
    case "KINDLE": {
      const preferredBattleCardId =
        raw.preferredBattleCardId === undefined ||
        raw.preferredBattleCardId === null
          ? raw.preferredBattleCardId
          : battleCardIdFromUnknown(raw.preferredBattleCardId);
      if (
        !isBattleSide(raw.side) ||
        !isFiniteNumber(raw.amount) ||
        (preferredBattleCardId === null && raw.preferredBattleCardId !== null)
      ) {
        return null;
      }
      return {
        kind: "KINDLE",
        side: raw.side,
        amount: raw.amount,
        ...(preferredBattleCardId === undefined
          ? {}
          : { preferredBattleCardId }),
      };
    }
    case "SET_CARD_SPARK":
    case "SET_CARD_SPARK_DELTA":
    case "SET_CARD_STATIC_SPARK_BONUS":
    case "SET_COUNTERS": {
      const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
      return battleCardId !== null && isFiniteNumber(raw.value)
        ? { kind: raw.kind, battleCardId, value: raw.value }
        : null;
    }
    case "MOVE_CARD_TO_ZONE": {
      const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
      return battleCardId !== null && isDebugZoneDestination(raw.destination)
        ? {
            kind: "MOVE_CARD_TO_ZONE",
            battleCardId,
            destination: raw.destination,
          }
        : null;
    }
    case "SWAP_BATTLEFIELD_SLOTS":
      return isBattleFieldSlotAddress(raw.source) &&
        isBattleFieldSlotAddress(raw.target)
        ? {
            kind: "SWAP_BATTLEFIELD_SLOTS",
            source: raw.source,
            target: raw.target,
          }
        : null;
    case "DRAW_DREAMWELL_CARD":
      return isBattleSide(raw.side) &&
        isIntegerNumber(raw.turnNumber) &&
        (raw.additional === undefined || typeof raw.additional === "boolean")
        ? {
            kind: "DRAW_DREAMWELL_CARD",
            side: raw.side,
            turnNumber: raw.turnNumber,
            ...(raw.additional === undefined
              ? {}
              : { additional: raw.additional }),
          }
        : null;
    case "ERODE":
    case "REVEAL_DECK_TOP":
    case "HIDE_DECK_TOP":
      return isBattleSide(raw.side) &&
        isIntegerNumber(raw.count) &&
        (raw.viewer === undefined || isBattleSide(raw.viewer))
        ? {
            kind: raw.kind,
            side: raw.side,
            count: raw.count,
            ...(raw.viewer === undefined ? {} : { viewer: raw.viewer }),
          }
        : null;
    case "DISCARD_CARD":
    case "ABANDON":
    case "REMATERIALIZE":
    case "CLEAR_CARD_NOTES":
    case "REVEAL_HAND_CARD": {
      const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
      return battleCardId === null
        ? null
        : { kind: raw.kind, battleCardId };
    }
    case "SET_CARD_VISIBILITY": {
      const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
      return battleCardId !== null &&
        (raw.viewer === undefined || isBattleSide(raw.viewer)) &&
        (typeof raw.isRevealed === "boolean" ||
          typeof raw.isRevealedToPlayer === "boolean")
        ? {
            kind: "SET_CARD_VISIBILITY",
            battleCardId,
            ...(raw.viewer === undefined ? {} : { viewer: raw.viewer }),
            ...(typeof raw.isRevealed === "boolean"
              ? { isRevealed: raw.isRevealed }
              : {}),
            ...(typeof raw.isRevealedToPlayer === "boolean"
              ? { isRevealedToPlayer: raw.isRevealedToPlayer }
              : {}),
          }
        : null;
    }
    case "SET_SIDE_HAND_VISIBILITY":
      return isBattleSide(raw.side) &&
        (raw.viewer === undefined || isBattleSide(raw.viewer)) &&
        (typeof raw.isRevealed === "boolean" ||
          typeof raw.isRevealedToPlayer === "boolean")
        ? {
            kind: "SET_SIDE_HAND_VISIBILITY",
            side: raw.side,
            ...(raw.viewer === undefined ? {} : { viewer: raw.viewer }),
            ...(typeof raw.isRevealed === "boolean"
              ? { isRevealed: raw.isRevealed }
              : {}),
            ...(typeof raw.isRevealedToPlayer === "boolean"
              ? { isRevealedToPlayer: raw.isRevealedToPlayer }
              : {}),
          }
        : null;
    case "ADD_CARD_NOTE": {
      const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
      const noteId = noteIdFromUnknown(raw.noteId);
      return battleCardId !== null &&
        noteId !== null &&
        typeof raw.text === "string" &&
        isFiniteNumber(raw.createdAtMs) &&
        isBattleCardNoteExpiry(raw.expiry)
        ? {
            kind: "ADD_CARD_NOTE",
            battleCardId,
            noteId,
            text: raw.text,
            createdAtMs: raw.createdAtMs,
            expiry: raw.expiry,
          }
        : null;
    }
    case "DISMISS_CARD_NOTE": {
      const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
      const noteId = noteIdFromUnknown(raw.noteId);
      return battleCardId !== null && noteId !== null
        ? { kind: "DISMISS_CARD_NOTE", battleCardId, noteId }
        : null;
    }
    case "SET_CARD_MARKERS": {
      const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
      const markers = battleCardMarkersFromUnknown(raw.markers);
      return battleCardId !== null && markers !== null
        ? { kind: "SET_CARD_MARKERS", battleCardId, markers }
        : null;
    }
    case "SET_CARD_STATUS": {
      const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
      const status = partialBattleCardStatusFromUnknown(raw.status);
      return battleCardId !== null && status !== null
        ? { kind: "SET_CARD_STATUS", battleCardId, status }
        : null;
    }
    case "CREATE_CARD_COPY": {
      const sourceBattleCardId = battleCardIdFromUnknown(raw.sourceBattleCardId);
      return sourceBattleCardId !== null &&
        isDebugZoneDestination(raw.destination) &&
        isFiniteNumber(raw.createdAtMs)
        ? {
            kind: "CREATE_CARD_COPY",
            sourceBattleCardId,
            destination: raw.destination,
            createdAtMs: raw.createdAtMs,
          }
        : null;
    }
    case "ADD_FIGMENTS": {
      const battleCardId = battleCardIdFromUnknown(raw.battleCardId);
      return battleCardId !== null && isIntegerNumber(raw.count)
        ? { kind: "ADD_FIGMENTS", battleCardId, count: raw.count }
        : null;
    }
    case "CREATE_FIGMENT":
      {
        const chosenFigmentId =
          raw.chosenFigmentId === undefined
            ? undefined
            : cardIdFromUnknown(raw.chosenFigmentId);
        const chosenSubtype = cardSubtypeFromUnknown(raw.chosenSubtype);
        if (chosenFigmentId === null) return null;
        return isBattleSide(raw.side) &&
        (raw.count === undefined ||
          (typeof raw.count === "number" &&
            Number.isInteger(raw.count) &&
            raw.count > 0 &&
            raw.count <= 10)) &&
        chosenSubtype !== null &&
        isFiniteNumber(raw.chosenSpark) &&
        typeof raw.name === "string" &&
        isDebugZoneDestination(raw.destination) &&
        isFiniteNumber(raw.createdAtMs)
        ? {
            kind: "CREATE_FIGMENT",
            side: raw.side,
            ...(chosenFigmentId === undefined
              ? {}
              : { chosenFigmentId }),
            ...(raw.count === undefined ? {} : { count: raw.count }),
            chosenSubtype,
            chosenSpark: raw.chosenSpark,
            name: parseCardName(raw.name),
            destination: raw.destination,
            createdAtMs: raw.createdAtMs,
          }
        : null;
      }
    case "CREATE_CARD_FROM_DEFINITION": {
      const definition = battleDeckCardDefinitionFromUnknown(raw.definition);
      return definition !== null &&
        isDebugZoneDestination(raw.destination) &&
        isFiniteNumber(raw.createdAtMs)
        ? {
            kind: "CREATE_CARD_FROM_DEFINITION",
            definition,
            destination: raw.destination,
            createdAtMs: raw.createdAtMs,
          }
        : null;
    }
    case "FILL_BATTLEFIELD_PREVIEW": {
      const definitions = raw.definitions;
      if (!isPlainRecord(definitions) || !isFiniteNumber(raw.createdAtMs)) {
        return null;
      }
      const player = battlefieldPreviewDefinitionListFromUnknown(
        definitions.player,
      );
      const enemy = battlefieldPreviewDefinitionListFromUnknown(
        definitions.enemy,
      );
      return player === null || enemy === null
        ? null
        : {
            kind: "FILL_BATTLEFIELD_PREVIEW",
            definitions: { player, enemy },
            createdAtMs: raw.createdAtMs,
          };
    }
    case "REORDER_DECK": {
      const order = battleCardIdArrayFromUnknown(raw.order);
      return isBattleSide(raw.side) && order !== null
        ? { kind: "REORDER_DECK", side: raw.side, order }
        : null;
    }
    case "FORESEE": {
      const viewedCardIds = battleCardIdArrayFromUnknown(raw.viewedCardIds);
      const orderedCardIds = battleCardIdArrayFromUnknown(raw.orderedCardIds);
      const voidCardIds = battleCardIdArrayFromUnknown(raw.voidCardIds);
      return isBattleSide(raw.side) &&
        (raw.viewer === undefined || isBattleSide(raw.viewer)) &&
        viewedCardIds !== null &&
        orderedCardIds !== null &&
        voidCardIds !== null
        ? {
            kind: "FORESEE",
            side: raw.side,
            ...(raw.viewer === undefined ? {} : { viewer: raw.viewer }),
            viewedCardIds,
            orderedCardIds,
            voidCardIds,
          }
        : null;
    }
    case "PLAY_FROM_DECK_TOP":
      return isBattleSide(raw.side) &&
        (raw.target === undefined || isBattleFieldSlotAddress(raw.target))
        ? {
            kind: "PLAY_FROM_DECK_TOP",
            side: raw.side,
            ...(raw.target === undefined ? {} : { target: raw.target }),
          }
        : null;
    case "SET_PHASE":
      return isBattlePhase(raw.phase)
        ? { kind: "SET_PHASE", phase: raw.phase }
        : null;
    case "SET_BATTLE_FLOW":
      return isBattlePhase(raw.phase) &&
        isBattleSide(raw.activeSide) &&
        isIntegerNumber(raw.turnNumber)
        ? {
            kind: "SET_BATTLE_FLOW",
            phase: raw.phase,
            activeSide: raw.activeSide,
            turnNumber: raw.turnNumber,
          }
        : null;
    default:
      return null;
  }
}

function isBattleResult(value: unknown): value is BattleResult {
  return value === "victory" || value === "defeat" || value === "draw";
}

function battleCardIdArrayFromUnknown(
  value: unknown,
): import("../../types/identifiers").BattleCardId[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map(battleCardIdFromUnknown);
  return ids.some((id) => id === null)
    ? null
    : ids.filter((id): id is NonNullable<typeof id> => id !== null);
}

function battleCardMarkersFromUnknown(
  value: unknown,
): BattleCardMarkers | null {
  if (
    !isPlainRecord(value) ||
    typeof value.isPrevented !== "boolean" ||
    typeof value.isCopied !== "boolean"
  ) {
    return null;
  }
  return {
    isPrevented: value.isPrevented,
    isCopied: value.isCopied,
  };
}

function partialBattleCardStatusFromUnknown(
  value: unknown,
): Partial<BattleCardStatus> | null {
  if (!isPlainRecord(value)) return null;
  const status: Partial<BattleCardStatus> = {};
  const booleanFields = [
    "isExhausted",
    "reclaimed",
    "offering",
    "ephemeral",
    "veil",
    "grantedVengeful",
    "grantedAwakened",
  ] as const;
  for (const field of booleanFields) {
    const fieldValue = value[field];
    if (fieldValue === undefined) continue;
    if (typeof fieldValue !== "boolean") return null;
    status[field] = fieldValue;
  }
  if (value.counters !== undefined) {
    if (!isFiniteNumber(value.counters)) return null;
    status.counters = value.counters;
  }

  if (value.temporaryReclaimUntilEnding !== undefined) {
    if (value.temporaryReclaimUntilEnding === null) {
      status.temporaryReclaimUntilEnding = null;
    } else {
      const ending = temporaryReclaimStatusFromUnknown(
        value.temporaryReclaimUntilEnding,
      );
      if (ending === null) return null;
      status.temporaryReclaimUntilEnding = ending;
    }
  }
  if (value.temporaryBanishUntilEnding !== undefined) {
    if (value.temporaryBanishUntilEnding === null) {
      status.temporaryBanishUntilEnding = null;
    } else {
      const ending = temporaryBanishStatusFromUnknown(
        value.temporaryBanishUntilEnding,
      );
      if (ending === null) return null;
      status.temporaryBanishUntilEnding = ending;
    }
  }
  return status;
}

function temporaryReclaimStatusFromUnknown(
  value: unknown,
): NonNullable<BattleCardStatus["temporaryReclaimUntilEnding"]> | null {
  if (!isPlainRecord(value)) return null;
  const sourceId = dreamwellCardIdFromUnknown(value.sourceId);
  if (
    !isBattleSide(value.activeSide) ||
    !isIntegerNumber(value.turnNumber) ||
    sourceId === null
  ) {
    return null;
  }
  return { activeSide: value.activeSide, turnNumber: value.turnNumber, sourceId };
}

function temporaryBanishStatusFromUnknown(
  value: unknown,
): NonNullable<BattleCardStatus["temporaryBanishUntilEnding"]> | null {
  if (!isPlainRecord(value)) return null;
  const sourceId = dreamwellCardIdFromUnknown(value.sourceId);
  if (
    !isBattleSide(value.activeSide) ||
    !isIntegerNumber(value.turnNumber) ||
    !isBattleSide(value.priorOwner) ||
    !isBattleSide(value.priorController) ||
    sourceId === null
  ) {
    return null;
  }
  return {
    activeSide: value.activeSide,
    turnNumber: value.turnNumber,
    priorOwner: value.priorOwner,
    priorController: value.priorController,
    sourceId,
  };
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

function isIntegerNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function battlefieldPreviewDefinitionListFromUnknown(
  value: unknown,
): import("../../battle/types").BattleDeckCardDefinition[] | null {
  if (
    !Array.isArray(value) ||
    !(
      value.length === 9 ||
      value.length === 14 ||
      value.length === 24 ||
      value.length === 25
    )
  ) {
    return null;
  }
  const definitions = value.map(battleDeckCardDefinitionFromUnknown);
  return definitions.some((definition) => definition === null)
    ? null
    : definitions.filter(
        (definition): definition is NonNullable<typeof definition> =>
          definition !== null,
      );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBattleFieldSlotAddress(
  value: unknown,
): value is BattleFieldSlotAddress {
  return (
    isPlainRecord(value) &&
    isBattleSide(value.side) &&
    (value.zone === "frontRank" || value.zone === "backRank") &&
    typeof value.slotId === "string" &&
    /^[FB]\d+$/.test(value.slotId)
  );
}

function isDebugZoneDestination(
  value: unknown,
): value is import("../../battle/debug/commands").BattleDebugZoneDestination {
  if (!isPlainRecord(value) || !isBattleSide(value.side)) return false;
  if (value.zone === "frontRank" || value.zone === "backRank") {
    return isBattleFieldSlotAddress(value);
  }
  if (
    value.zone === "hand" ||
    value.zone === "void" ||
    value.zone === "banished"
  ) {
    return true;
  }
  return (
    value.zone === "deck" &&
    (value.position === "top" || value.position === "bottom")
  );
}

function isBattleCardNoteExpiry(value: unknown): value is BattleCardNoteExpiry {
  if (!isPlainRecord(value)) return false;
  if (value.kind === "manual") return true;
  return (
    value.kind === "atStartOfTurn" &&
    isBattleSide(value.side) &&
    Number.isInteger(value.turnNumber)
  );
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
  actor?: EventActor,
): FoldState | null {
  const battle = state.battle;
  if (battle === null) {
    return null;
  }
  if (
    !tutorialActorIsAuthorized(
      battle,
      actor,
      battle.pendingPrompt?.run.side === "enemy",
      state.playtestControl?.controllerClientId ?? null,
    )
  )
    return null;
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
    planStaticContributionSettlement(resolved.board, true, random, nowMs),
  );
  return {
    ...state,
    battle: driveChallengeCursor(
      { ...resolved, board },
      ctx.seq,
      random,
      nowMs,
    ),
  };
}

/** Schedules lifecycle scripts from an observed reducer edge, never from UI. */
function scheduleBattleTriggerEdges(
  queue: EffectRun[],
  before: BattleMutableState,
  after: BattleMutableState,
  command: BattleCommand,
  targetBattleCardIds?: readonly BattleCardId[],
): void {
  if (command.id !== "DEBUG_EDIT") return;
  const edit = command.edit;

  if (edit.kind === "REMATERIALIZE") {
    const location = selectBattleCardLocation(before, edit.battleCardId);
    if (location !== null && isBattlefieldZone(location.zone)) {
      enqueueBattleTrigger(
        queue,
        before,
        edit.battleCardId,
        "rematerialized",
        targetBattleCardIds,
      );
    }
    return;
  }

  const movedId =
    edit.kind === "MOVE_CARD_TO_ZONE"
      ? edit.battleCardId
      : edit.kind === "ABANDON"
        ? edit.battleCardId
        : null;
  if (movedId === null) return;
  const source = selectBattleCardLocation(before, movedId);
  const destination = selectBattleCardLocation(after, movedId);
  const instance = before.cardInstances[movedId];
  if (source === null || destination === null || instance === undefined) return;

  const sourceInPlay = isBattlefieldZone(source.zone);
  const destinationInPlay = isBattlefieldZone(destination.zone);
  if (
    source.zone === "hand" &&
    instance.definition.battleCardKind === "event"
  ) {
    enqueueBattleTrigger(queue, before, movedId, "played", targetBattleCardIds);
  }
  if (!sourceInPlay && destinationInPlay) {
    enqueueBattleTrigger(
      queue,
      before,
      movedId,
      "materialized",
      targetBattleCardIds,
    );
  }
  if (sourceInPlay && destination.zone === "void") {
    enqueueBattleTrigger(
      queue,
      before,
      movedId,
      edit.kind === "ABANDON" ? "abandoned" : "dissolved",
      targetBattleCardIds,
    );
  }
}

function isBattlefieldZone(zone: BattleZoneId): zone is BattlefieldZone {
  return zone === "backRank" || zone === "frontRank";
}

function enqueueBattleTrigger(
  queue: EffectRun[],
  board: BattleMutableState,
  battleCardId: BattleCardId,
  trigger: import("./fold").BattleScriptTrigger,
  targetBattleCardIds?: readonly BattleCardId[],
): void {
  const instance = board.cardInstances[battleCardId];
  if (instance === undefined) return;
  queue.push(
    newEffectRun(
      {
        table: "battle",
        id: battleTriggerScriptId(instance.definition.cardId, trigger),
      },
      instance.controller,
      battleCardId,
      {
        trigger,
        sourceCardId: instance.definition.cardId,
        sourceController: instance.controller,
        sourceZone: selectBattleCardLocation(board, battleCardId)?.zone,
        ...(targetBattleCardIds === undefined ? {} : { targetBattleCardIds }),
      },
    ),
  );
}

function forEachInPlay(
  board: BattleMutableState,
  side: BattleSide,
  visit: (battleCardId: BattleCardId) => void,
): void {
  for (const zone of [
    board.sides[side].backRank,
    board.sides[side].frontRank,
  ]) {
    for (const battleCardId of Object.values(zone)) {
      if (battleCardId !== null) visit(battleCardId);
    }
  }
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
  const isCharacterDiscover =
    pending.run.bindings?.sourceCardId === DISCOVER_CHARACTER_SOURCE_CARD_ID ||
    DISCOVER_CHARACTER_SCRIPT_IDS.has(pending.run.scriptRef.id);
  const isLowCostDiscover =
    pending.run.scriptRef.id === DISCOVER_ANY_LOW_COST_SCRIPT_ID;
  if (isCharacterDiscover || isLowCostDiscover) {
    // Discover stores its sampled ids on the prompt, but selection still needs
    // a live deck character. This makes a stale/corrupt parked prompt bounce
    // instead of moving a card from an unrelated zone during resolution.
    if (
      !chosen.every(
        (id) =>
          board.sides[pending.run.side].deck.includes(id) &&
          (isCharacterDiscover
            ? board.cardInstances[id]?.definition.battleCardKind === "character"
            : (board.cardInstances[id]?.definition.energyCost ?? Infinity) <=
              2),
      )
    ) {
      return false;
    }
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
    return { kind: "pick-cards", chosenIds: ids.map(parseBattleCardId) };
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
        : { viewedCardIds: (viewedCardIds as string[]).map(parseBattleCardId) }),
      orderedCardIds: (orderedCardIds as string[]).map(parseBattleCardId),
      voidCardIds: (voidCardIds as string[]).map(parseBattleCardId),
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
  const battleCardId = parseBattleCardId(instanceId);
  if (battle.board.cardInstances[battleCardId] === undefined) {
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
      battleCardId,
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
): { noteId: NoteId; text: string; expiry: BattleCardNoteExpiry } | null {
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
  return { noteId: parseNoteId(noteId), text, expiry };
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
