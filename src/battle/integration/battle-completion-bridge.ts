import { advanceAtlas } from "../../atlas/atlas-generator";
import type { AtlasBuildContext } from "../../atlas/atlas-generator";
import { logEvent } from "../../logging";
import type { JourneyMutations } from "../../state/journey-context";
import type { DreamAtlas, DreamscapeModifier } from "../../types/journey";

/**
 * Ownership note (spec K-5 / K-6, L-1):
 * Although this module lives under `src/battle/integration/`, the events it
 * emits (`essence_granted`, `site_completed`, `dreamscape_completed`) are
 * semantically journey-level. Spec K-6 says the battle module emits only
 * `battle_proto_*` events; this bridge is exempt because it is the sanctioned
 * adapter that translates a battle victory into persistent journey-state
 * mutations. The file's physical location reflects the caller (playable
 * battle screen) rather than the logical owner of the emitted events.
 */

interface PendingHandoffTimer {
  timerId: ReturnType<typeof setTimeout>;
  controller: AbortController;
}

const completedBattleIds = new Set<string>();
const pendingPostVictoryHandoffTimers = new Set<PendingHandoffTimer>();

export interface CompleteBattleSiteVictoryInput {
  battleId: string;
  siteId: string;
  dreamscapeId: string | null;
  completionLevelAtBattleStart: number;
  atlasSnapshot: DreamAtlas;
  essenceReward: number;
  isFinalBoss: boolean;
  dreamscapeModifiers?: readonly DreamscapeModifier[];
  /**
   * Dreamscape definitions, atlas tuning, and dreamsign pool the Atlas advance
   * needs to reveal and assign the dreamscapes two layers ahead.
   */
  atlasBuildContext: AtlasBuildContext;
  mutations: Pick<
    JourneyMutations,
    | "changeEssence"
    | "incrementCompletionLevel"
    | "markSiteVisited"
    | "setCurrentDreamscape"
    | "setScreen"
    | "updateAtlas"
  >;
  postVictoryHandoffDelayMs?: number;
  clearBattleStateForRoom?: () => void;
}

export function completeBattleSiteVictory(
  input: CompleteBattleSiteVictoryInput,
): void {
  const {
    battleId,
    siteId,
    dreamscapeId,
    completionLevelAtBattleStart,
    atlasSnapshot,
    essenceReward,
    isFinalBoss,
    dreamscapeModifiers = [],
    atlasBuildContext,
    mutations,
    postVictoryHandoffDelayMs,
    clearBattleStateForRoom,
  } = input;

  if (completedBattleIds.has(battleId)) {
    // Spec K-3: bridge execution is idempotent per battleId. Surface the
    // skipped re-entry for debugging so repeated dispatches (e.g. double
    // clicks, hot-reload) are visible in the log stream.
    logEvent("battle_proto_completion_skipped_duplicate", {
      battleId,
      siteId,
      dreamscapeId,
      reason: "already_applied",
    });
    return;
  }
  completedBattleIds.add(battleId);

  mutations.changeEssence(essenceReward, "battle_reward");
  logEvent("essence_granted", {
    amount: essenceReward,
    source: "battle_reward",
    battleId,
    siteId,
  });
  mutations.markSiteVisited(siteId);
  mutations.incrementCompletionLevel(essenceReward, null, null);
  logEvent("battle_proto_completion_applied", {
    battleId,
    completionLevelAtBattleStart,
    completionLevelAfterVictory: completionLevelAtBattleStart + 1,
    dreamscapeId,
    essenceReward,
    isFinalBoss,
    siteId,
  });

  logEvent("site_completed", {
    siteType: "Battle",
    outcome: `Victory - earned ${String(essenceReward)} essence`,
  });

  const completeJourneyHandoff = () => {
    if (!isFinalBoss) {
      mutations.setScreen({ type: "atlas" });
    }

    if (dreamscapeId !== null) {
      const dreamscapeNode = atlasSnapshot.nodes[dreamscapeId];
      // Completing this dreamscape's battle advances the Completion Level, so
      // the dreamscapes revealed by this advance belong to the new level.
      const updatedAtlas = advanceAtlas(
        atlasSnapshot,
        dreamscapeId,
        completionLevelAtBattleStart + 1,
        {
          ...(dreamscapeModifiers.length > 0 ? { dreamscapeModifiers } : {}),
        },
        atlasBuildContext,
      );

      mutations.updateAtlas(updatedAtlas);
      logEvent("dreamscape_completed", {
        dreamscapeId,
        sitesVisitedCount: dreamscapeNode?.sites.length ?? 0,
      });
      mutations.setCurrentDreamscape(null);
    }

    if (typeof clearBattleStateForRoom === "function") {
      clearBattleStateForRoom();
    }
  };

  if ((postVictoryHandoffDelayMs ?? 0) > 0) {
    const controller = new AbortController();
    const handle: PendingHandoffTimer = {
      timerId: 0 as unknown as ReturnType<typeof setTimeout>,
      controller,
    };
    handle.timerId = setTimeout(() => {
      pendingPostVictoryHandoffTimers.delete(handle);
      if (controller.signal.aborted) {
        return;
      }
      completeJourneyHandoff();
    }, postVictoryHandoffDelayMs);
    pendingPostVictoryHandoffTimers.add(handle);
    return;
  }

  completeJourneyHandoff();
}

function clearBridgeState(): void {
  for (const handle of pendingPostVictoryHandoffTimers) {
    handle.controller.abort();
    clearTimeout(handle.timerId);
  }
  pendingPostVictoryHandoffTimers.clear();
  completedBattleIds.clear();
}

/**
 * Production-facing reset hook. Called by `resetJourney()` so a brand-new run
 * starts with an empty idempotency set and no pending atlas-handoff timers.
 * Any timer scheduled by a prior session is marked aborted before being
 * cleared, so a callback that has already been pulled off the event loop
 * becomes a no-op when it fires. Tests use this same entry point; there is no
 * separate "for tests" wrapper (bug-028).
 */
export function resetBattleCompletionBridge(): void {
  clearBridgeState();
}
