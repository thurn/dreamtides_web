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

/**
 * An open battle prompt awaiting a player's resolution.
 *
 * SEAM (Task 18): this is a minimal placeholder. Task 18 defines the full
 * battle fold state in `src/rules/battle/fold.ts` and will replace/extend
 * `BattleFoldState` (and this `PendingPrompt` shape) with the real prompt
 * model. The root reducer only depends on `pendingPrompt.promptId` today, so
 * any richer shape Task 18 introduces must keep a numeric `promptId` (the seq
 * of the event that opened the prompt) reachable at
 * `state.battle.pendingPrompt.promptId` — set it to `ctx.seq` when opening the
 * prompt — or update the CAS policy's rule 2 / rule 4 accessors accordingly.
 */
export interface PendingPrompt {
  /**
   * The seq of the event that opened this prompt (design spec §Data model).
   * A `number`, matched by a RESOLVE_PROMPT carrying the same value. Task 18's
   * real prompt model sets this to `ctx.seq` when opening the prompt.
   */
  readonly promptId: number;
}

/**
 * The in-battle slice of the fold state.
 *
 * SEAM (Task 18): placeholder shape. Only `pendingPrompt` is modelled here
 * because the root CAS policy (rules 2 and 4) is the sole consumer at this
 * layer. Task 18 owns the authoritative `BattleFoldState` and will widen this
 * interface with the battle board, stacks, players, etc. Keep `pendingPrompt`
 * (or a superset that still exposes an open prompt's id) when doing so.
 */
export interface BattleFoldState {
  /** The open prompt, or null when the battle is awaiting no resolution. */
  readonly pendingPrompt: PendingPrompt | null;
}

/**
 * The complete state folded from a room's event log: the quest slice plus an
 * optional in-battle slice. `battle` is null whenever no battle is active.
 */
export interface FoldState {
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
  return {
    quest: genesisQuestState(genesis),
    battle: null,
  };
}

function genesisQuestState(genesis: Genesis): QuestState {
  return {
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
