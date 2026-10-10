// The journey battle lifecycle: the `BEGIN_BATTLE` and `END_BATTLE` reducer
// cases and the provider seams they delegate to.
//
// These are the two events that create and tear down the in-battle fold slice
// (`FoldState.battle`) of a journey battle. They express the battle-lifecycle
// DOMAIN LOGIC as pure functions of `(state, payload[, ctx])`; transaction /
// log-append / React concerns are handled by the eventlog engine and the root
// reducer.
//
//   - `BEGIN_BATTLE { siteId }` builds the deterministic in-battle init.
//     "Battle has begun" is a derivable fact of the log: the state carries the
//     battle, so a reload lands on the right screen from fold state alone. It
//     bounces when a battle is already in progress.
//   - `END_BATTLE {}` derives the terminal outcome from the journey battle's
//     engine battle. A victory commits the reward, Battle-site completion,
//     Atlas advancement, route, modifier expiry, and battle teardown
//     atomically. Defeat/draw freezes the failure summary and tears down the
//     battle.
//
// The src/rules/ lint rails forbid React and any live clock/rng.
// Battle init reads catalog-sourced card / deck / avatar data that only loads
// asynchronously, which the pure reducer cannot statically reach, so its
// construction is delegated to the injectable {@link BattleInitProvider} seam
// (mirroring `SiteContentProvider`): the reducer forwards the provider
// `ctx.rng` (the deterministic `(drawIndex) => number` per-event stream) and
// `ctx.timestamp` unchanged, so two clients folding the same `BEGIN_BATTLE`
// build a byte-identical battle. Atlas advancement needs loaded dreamscape
// content, so `END_BATTLE` delegates that one deterministic calculation to
// {@link BattleCompletionProvider}; all state bookkeeping remains here.
//
// Cards / avatars are keyed by UUID and deck entries by entry-id — never
// by name (AGENTS.md).

import type { EventContext } from "../../eventlog/types";
import type {
  BattleModifier,
  DreamAtlas,
  JourneyFailureReason,
  JourneyState,
  Screen,
} from "../../types/journey";
import type { FoldState } from "../fold-state";
import type { DeckEntryId, SiteId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { journeyBattleOf, type JourneyBattleFoldState, type JourneyBattleInit } from "./fold";
import { engineBattleResult, startEngineBattle } from "./engine-battle";
import type { Engine } from "../../engine";
import type {
  BattleInit as EngineBattleInit,
  BattleResult as EngineBattleResult,
} from "../../engine";
import {
  activeSiteIdOf,
  canVisitSite,
  completeJourneySite,
  findSite,
} from "../journey/sites";

// ---------------------------------------------------------------------------
// Battle-init provider seam (BEGIN_BATTLE construction)
// ---------------------------------------------------------------------------

/**
 * The deterministic construction `BEGIN_BATTLE` needs to turn journey state into
 * a fresh {@link JourneyBattleFoldState}. The reducer resolves double-begin itself,
 * then delegates the immutable journey init ({@link JourneyBattleInit}) and the
 * engine init of the same battle — which read async-loaded card, avatar, and
 * dreamwell data — to this provider.
 *
 * The registered provider (`createBattleInitProvider`) constructs the battle
 * deterministically from folded journey state: `createBattleInit` derives all of
 * its randomness from a `BattleRng` stream keyed by
 * `deriveBattleSeed(journey.seed:battleEntryKey)`. That seed comes straight
 * from the folded journey, so every client builds a byte-identical battle
 * from the same journey seed and site.
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
   * The engine that plays journey battles: `BEGIN_BATTLE` starts each
   * battle's engine battle on it, and the engine intents fold over it.
   */
  readonly engine: Engine;
  /**
   * Build the immutable journey init for `siteId` deterministically from
   * `(journey, rng, timestamp)`, with the engine init of the same battle, or `null` to bounce (e.g. the site is not a battle, or its
   * content is unavailable). Must not mutate `journey`.
   */
  beginBattle(input: {
    journey: JourneyState;
    siteId: SiteId;
    seedOverride: number | null;
    seq: number;
    rng: (drawIndex: number) => number;
    timestamp: string;
  }): BattleStart | null;
}

/** A new journey battle: its journey init and the engine init of the same battle. */
export interface BattleStart {
  readonly init: JourneyBattleInit;
  readonly engineInit: EngineBattleInit;
}

/**
 * Loaded-content seam used by a journey victory to reveal the next Atlas
 * frontier. The reducer owns the complete transition and delegates only the
 * content-dependent Atlas generation step.
 */
export interface BattleCompletionProvider {
  advanceAtlas(input: {
    journey: JourneyState;
    battle: JourneyBattleFoldState;
    completionLevel: number;
    rng: (drawIndex: number) => number;
  }): DreamAtlas | null;
}

let battleInitProvider: BattleInitProvider | null = null;
let battleCompletionProvider: BattleCompletionProvider | null = null;

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
  const battle = startJourneyBattle(provider, {
    journey: state.journey,
    siteId: parseSiteId(siteId),
    seedOverride,
    seq: ctx.seq,
    rng: ctx.rng,
    timestamp: ctx.timestamp,
  });
  return battle === null ? null : { ...state, battle };
}

/**
 * The journey battle `BEGIN_BATTLE` folds: `provider`'s init with its engine
 * battle started from the engine init of the same battle. `null` when the
 * provider declines or the engine battle does not start. A QA scene that
 * opens on an active battle loads exactly this battle.
 */
export function startJourneyBattle(
  provider: BattleInitProvider,
  input: Parameters<BattleInitProvider["beginBattle"]>[0],
): JourneyBattleFoldState | null {
  const start = provider.beginBattle(input);
  if (start === null) {
    return null;
  }
  const engine = startEngineBattle(
    start.engineInit,
    provider.engine,
    input.seq,
  );
  return engine === null
    ? null
    : { mode: { kind: "journey" }, init: start.init, engine };
}

// ---------------------------------------------------------------------------
// END_BATTLE
// ---------------------------------------------------------------------------

/** The completion level at which a run finishes and routes to the end screen. */
const FINAL_COMPLETION_LEVEL = 7;

/**
 * `END_BATTLE {}`: derive the terminal result from the journey battle's
 * engine battle and commit the complete journey handoff. Returns `null`
 * while the engine battle has no result, for the tutorial battle, or when
 * the battle's durable identity no longer matches the journey state.
 */
export function endBattle(
  state: FoldState,
  _payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  const battle = journeyBattleOf(state.battle);
  if (battle === null) return null;
  const result = engineBattleResult(battle);
  if (result === null) return null;
  return result.kind === "victory" && result.winner === "player"
    ? applyVictory(state, battle, ctx)
    : applyEngineDefeat(state, battle, result);
}

/**
 * Victory bookkeeping: bump the completion level, route to the post-battle
 * screen, clear the current dreamscape, decrement each battle modifier and
 * drop those that reach zero — removing any temporary-Nightmare deck entries a
 * dropped modifier introduced. The battle slice is torn down.
 */
function applyVictory(
  state: FoldState,
  battle: JourneyBattleFoldState,
  ctx: EventContext,
): FoldState | null {
  const journey = state.journey;
  const init = battle.init;
  const nodeId = init.nodeId;
  if (
    nodeId === null ||
    journey.currentDreamscape !== nodeId ||
    journey.completionLevel !== init.completionLevelAtStart ||
    activeSiteIdOf(journey) !== init.siteId ||
    journey.atlas.nodes[nodeId] === undefined ||
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
 * Defeat or draw of the engine battle: the failure summary comes from the
 * engine's committed state. A draw by the turn limit reports the turn limit,
 * a draw by an unbreakable loop (the resolution cap or a mandatory loop)
 * reports the loop, and any other ending reports the score target.
 */
function applyEngineDefeat(
  state: FoldState,
  battle: JourneyBattleFoldState,
  result: EngineBattleResult,
): FoldState {
  const journey = state.journey;
  const committed = battle.engine.slice.committed;
  const siteId = activeSiteIdOf(journey) ?? battle.init.siteId;
  const reason: JourneyFailureReason =
    result.kind !== "draw"
      ? "score_target_reached"
      : result.reason === "turnLimit"
        ? "turn_limit_reached"
        : result.reason === "resolutionCap" || result.reason === "mandatoryLoop"
          ? "unbreakable_loop"
          : "score_target_reached";
  return {
    ...state,
    journey: {
      ...journey,
      failureSummary: {
        battleId: battle.init.battleId,
        result: result.kind === "draw" ? "draw" : "defeat",
        reason,
        siteId,
        siteLabel: siteId,
        nodeIdOrNone: journey.currentDreamscape,
        turnNumber: committed.turn.turnNumber,
        playerScore: committed.sides.player.score,
        enemyScore: committed.sides.enemy.score,
      },
      screen: { type: "journeyFailed" },
    },
    battle: null,
  };
}
