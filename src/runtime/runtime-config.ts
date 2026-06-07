import { resolvePoolVariant } from "../draft/pool";
import type { PoolVariant } from "../draft/pool";
import { normalizeRoomId } from "../multiplayer/room-id";

export interface RuntimeConfig {
  seedOverride: number | null;
  startInBattle: boolean;
  aiMode: boolean;
  gameId: string | null;
  databaseMode: DatabaseMode;
  /**
   * Draft-pool construction strategy from `?algo=`, resolved to a registered
   * `PoolVariant` (unknown or absent values fall back to `DEFAULT_POOL_VARIANT`).
   * Drives the quest prototype's draft and enemy pools. `parseRuntimeConfig`
   * always sets it; it is optional only so test config literals can omit it and
   * inherit the default.
   */
  poolVariant?: PoolVariant;
  /**
   * Selects the draft mode: `"replay"` activates the record-replay draft (from
   * `?algo=replay`); `"pool"` is the default pool-based draft. `poolVariant`
   * still resolves normally alongside this — for `?algo=replay` it falls back
   * to the default (idf3), which is what we want (replay still needs a pool
   * variant for the resolved package). `parseRuntimeConfig` always sets it;
   * it is optional only so test config literals can omit it and inherit the
   * pool default.
   */
  draftMode?: "pool" | "replay";
  debugJourneyShape?: string | null;
  debugJourneyReward?: string | null;
  debugJourneyCost?: string | null;
}

export type DatabaseMode = "emulator" | "realtime";

export function parseRuntimeConfig(search: string): RuntimeConfig {
  const params = new URLSearchParams(search);
  return {
    seedOverride: parseSeedOverride(params.get("seed")),
    startInBattle: params.get("startInBattle") === "1",
    aiMode: params.get("ai") !== "0",
    gameId: normalizeRoomId(params.get("game")),
    databaseMode: parseDatabaseMode(params.get("realtime")),
    poolVariant: resolvePoolVariant(params.get("algo")),
    draftMode: params.get("algo") === "replay" ? "replay" : "pool",
    debugJourneyShape: parseDebugJourneyId(params.get("debugJourneyShape")),
    debugJourneyReward: parseDebugJourneyId(params.get("debugJourneyReward")),
    debugJourneyCost: parseDebugJourneyId(params.get("debugJourneyCost")),
  };
}

function parseDatabaseMode(rawRealtime: string | null): DatabaseMode {
  return rawRealtime === "1" ? "realtime" : "emulator";
}

function parseDebugJourneyId(rawId: string | null): string | null {
  if (rawId === null || rawId.trim() === "") {
    return null;
  }

  return rawId;
}

function parseSeedOverride(rawSeed: string | null): number | null {
  if (rawSeed === null || rawSeed === "") {
    return null;
  }

  if (!/^\d+$/.test(rawSeed)) {
    return null;
  }

  const parsed = Number(rawSeed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}
