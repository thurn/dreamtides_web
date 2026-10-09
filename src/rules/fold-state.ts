// The root fold state for the event-sourcing rules layer.
//
// `FoldState` is the single value every `GameEvent` folds over. It is pure
// data — no undo stack, no React — so the same event log always
// replays to the same state.
//
// This module must stay import-clean per the src/rules/ lint rails: no
// `react`, no live clock/rng. All time arrives via
// `ctx.timestamp` and all randomness via `ctx.rng` in the reducer.

import type { Genesis } from "../eventlog/types";
import type { JourneyState } from "../types/journey";
import type { JourneySeed } from "../types/journey-seed";
import type { TutorialPlaybackState } from "../types/tutorial";
import type { CardTutorialGuidancePresentation } from "./card-tutorial-guidance";

// The authoritative battle fold shape lives in `battle/fold.ts`,
// which owns the cursor model that keeps the state closure-free. `FoldState`
// re-exports it so the root reducer / CAS policy keep depending on
// `state.battle.pendingPrompt.promptId` (a number = the opening event's seq).
export type { BattleFoldState } from "./battle/fold";
import type { BattleFoldState } from "./battle/fold";
import { parseJourneyId } from "../types/identifiers";
import type {
  CardTutorialScreenKey,
  ClientId,
  JourneyId,
  TutorialTriggerId,
} from "../types/identifiers";

export type FrontDoorPhase =
  "main" | "mainExiting" | "loading" | "tutorial" | "journey";

export interface FrontDoorState {
  readonly phase: FrontDoorPhase;
  /** Stable identity shared by the automatic transitions for one journey. */
  readonly journeyId: JourneyId | null;
  /** Shared authored snapshot and cursor for the standalone tutorial. */
  readonly tutorial: TutorialPlaybackState | null;
}

export interface PlaytestControlState {
  readonly mode: "collaborative" | "single-controller";
  readonly controllerClientId: ClientId | null;
}

/**
 * The complete state folded from a game's event log: the journey slice plus an
 * optional in-battle slice. `battle` is null whenever no battle is active.
 */
export interface FoldState {
  readonly frontDoor: FrontDoorState;
  readonly playtestControl?: PlaytestControlState;
  readonly journey: JourneyState;
  readonly battle: BattleFoldState | null;
  /** First-occurrence tutorials already presented in this game. */
  readonly tutorialTriggerIdsSeen: readonly TutorialTriggerId[];
  /** Site-surface or draft-offer identities that presented one card tutorial. */
  readonly cardTutorialScreenKeysSeen: readonly CardTutorialScreenKey[];
  /** Shared card-and-speech journey currently presented over a site screen. */
  readonly cardTutorialPresentation: CardTutorialGuidancePresentation | null;
}

/** The pinned economy tunables a journey's initial state reads. */
export interface JourneyEconomy {
  readonly defaultStartingEssence: number;
  readonly dreamsignCap: number;
}

/**
 * Builds the pre-journey fold state a fresh game shows before `START_JOURNEY`:
 * the {@link initialJourneyState} for `seed`, no battle, no tutorial history,
 * and the front door on `frontDoorEntry`. Journey games omit the entry; they
 * start on the journey phase in collaborative control.
 */
export function initialFoldState(
  seed: JourneySeed,
  economy: JourneyEconomy,
  frontDoorEntry?: Genesis["frontDoorEntry"],
): FoldState {
  const entry = frontDoorEntry ?? "journey";
  return {
    frontDoor: {
      phase: entry,
      journeyId: entry === "main" ? null : parseJourneyId(`genesis:${seed}`),
      tutorial: null,
    },
    playtestControl: {
      mode: frontDoorEntry === undefined ? "collaborative" : "single-controller",
      controllerClientId: null,
    },
    journey: initialJourneyState(seed, economy),
    battle: null,
    tutorialTriggerIdsSeen: [],
    cardTutorialScreenKeysSeen: [],
    cardTutorialPresentation: null,
  };
}

/** The initial fold state of a game, from its genesis. */
export function genesisFoldState(genesis: Genesis): FoldState {
  return initialFoldState(
    genesis.seed,
    genesis.contentConfig,
    genesis.frontDoorEntry,
  );
}

/**
 * The journey slice a run starts from before an Avatar is chosen, on the
 * `journeyStart` screen with the pinned starting Essence and Dreamsign cap.
 */
export function initialJourneyState(
  seed: JourneySeed,
  economy: JourneyEconomy,
): JourneyState {
  return {
    runId: null,
    seed,
    essence: economy.defaultStartingEssence,
    maxDreamsigns: economy.dreamsignCap,
    deck: [],
    avatar: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: {
      layers: [],
      nodes: {},
      startingNodeId: null,
      bossNodeId: null,
      bossIncarnationId: null,
      currentNodeId: null,
      knownDreamsignCarrierIds: [],
    },
    currentDreamscape: null,
    siteRuntime: {},
    draftState: null,
    screen: { type: "journeyStart" },
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
      freeNextShopModifiers: [],
      freePurchaseModifiers: [],
    },
    siteOfferModifiers: [],
    dreamscapeModifiers: [],
  };
}
