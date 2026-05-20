import { normalizeRoomId } from "../multiplayer/room-id";

export interface RuntimeConfig {
  seedOverride: number | null;
  startInBattle: boolean;
  gameId: string | null;
  debugJourneyShape?: string | null;
  debugJourneyReward?: string | null;
  debugJourneyCost?: string | null;
}

export function parseRuntimeConfig(search: string): RuntimeConfig {
  const params = new URLSearchParams(search);
  return {
    seedOverride: parseSeedOverride(params.get("seed")),
    startInBattle: params.get("startInBattle") === "1",
    gameId: normalizeRoomId(params.get("game")),
    debugJourneyShape: parseDebugJourneyId(params.get("debugJourneyShape")),
    debugJourneyReward: parseDebugJourneyId(params.get("debugJourneyReward")),
    debugJourneyCost: parseDebugJourneyId(params.get("debugJourneyCost")),
  };
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
