// The root fold state for the coop event-sourcing rules layer.
//
// `FoldState` is the single value every `GameEvent` folds over. It is pure
// data — no undo stack, no React, no Firebase — so the same event log always
// replays to the same state on every client (see design spec §Data model).
//
// This module must stay import-clean per the src/rules/ lint rails: no
// `firebase/*`, no `react`, no live clock/rng. All time arrives via
// `ctx.timestamp` and all randomness via `ctx.rng` in the reducer.

import type { Genesis } from "../eventlog/types";
import type { QuestState } from "../types/quest";

// The authoritative battle fold shape lives in `battle/fold.ts` (Task 18),
// which owns the cursor model that keeps the state closure-free. `FoldState`
// re-exports it so the root reducer / CAS policy keep depending on
// `state.battle.pendingPrompt.promptId` (a number = the opening event's seq).
export type { BattleFoldState, PendingPrompt } from "./battle/fold";
import type { BattleFoldState } from "./battle/fold";

export type FrontDoorPhase = "main" | "mainExiting" | "loading" | "tutorial";

export interface FrontDoorState {
  readonly phase: FrontDoorPhase;
  /** Stable identity shared by the automatic transitions for one journey. */
  readonly journeyId: string | null;
}

/**
 * The complete state folded from a room's event log: the quest slice plus an
 * optional in-battle slice. `battle` is null whenever no battle is active.
 */
export interface FoldState {
  readonly frontDoor: FrontDoorState;
  readonly quest: QuestState;
  readonly battle: BattleFoldState | null;
}

/**
 * Builds the pre-quest fold state a fresh room shows before `START_QUEST`.
 *
 * Mirrors legacy `createDefaultState()` (src/state/quest-context.tsx) — the
 * initial `questState` a newly created room seeded — with two adjustments:
 * `seed` is taken from `genesis.seed` so replays are deterministic per room,
 * and `battle` starts null. The values are inlined here (rather than imported
 * from quest-context.tsx) because that module pulls in React, which the
 * src/rules/ lint rails forbid.
 */
export function genesisFoldState(genesis: Genesis): FoldState {
  const entry = genesis.frontDoorEntry ?? "main";
  return {
    frontDoor: {
      phase: entry,
      journeyId: entry === "main" ? null : `genesis:${genesis.seed}`,
    },
    quest: genesisQuestState(genesis),
    battle: null,
  };
}

function genesisQuestState(genesis: Genesis): QuestState {
  return {
    runId: null,
    seed: genesis.seed,
    essence: 200,
    essenceCap: 500,
    maxDreamsigns: 12,
    deck: [],
    dreamcaller: null,
    resolvedPackage: null,
    cardSourceDebug: null,
    remainingDreamsignPool: [],
    dreamsigns: [],
    completionLevel: 0,
    atlas: {
      layers: [],
      nodes: {},
      startingNodeId: "",
      bossNodeId: "",
      bossIncarnationId: null,
      currentNodeId: null,
      knownDreamsignCarrierIds: [],
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "questStart" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: false,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };
}
