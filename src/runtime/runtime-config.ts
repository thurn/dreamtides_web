import { DEFAULT_POOL_VARIANT, resolvePoolVariant } from "../draft/pool";
import type { PoolVariant } from "../draft/pool";
import { normalizeRoomId } from "../multiplayer/room-id";

export interface RuntimeConfig {
  seedOverride: number | null;
  startInBattle: boolean;
  aiMode: boolean;
  /**
   * Gates Basic Automation (the bookend-phase auto-advance and the Dawn/Ending
   * automated effects). Mirrors `aiMode`: enabled unless `?automation=0`.
   */
  basicAutomation: boolean;
  gameId: string | null;
  databaseMode: DatabaseMode;
  journeyVariant: JourneyVariant;
  /**
   * Draft-pool construction strategy from `?algo=`, resolved to a registered
   * `PoolVariant`. An absent `?algo=` uses `DEFAULT_POOL_VARIANT`; a draft-mode
   * value (`replay`/`fresh20`) also uses the default; any other value must name
   * a registered strategy or `parseRuntimeConfig` throws. Drives the quest
   * prototype's draft and enemy pools. `parseRuntimeConfig` always sets it; it is
   * optional only so test config literals can omit it and inherit the default.
   */
  poolVariant?: PoolVariant;
  /**
   * Selects the draft mode: `"replay"` activates the record-replay draft (from
   * `?algo=replay`); `"fresh20"` activates the fresh-random-pack draft (from
   * `?algo=fresh20`); `"pool"` is the default pool-based draft. `poolVariant`
   * still resolves normally alongside this — for `?algo=replay`/`fresh20` it
   * falls back to the default (idf3), which is what we want (both still need a
   * pool variant for the resolved package). `parseRuntimeConfig` always sets it;
   * it is optional only so test config literals can omit it and inherit the
   * pool default.
   */
  draftMode?: "pool" | "replay" | "fresh20";
  /**
   * Cards per freshly generated pack in `?algo=fresh20`, from `?packsize=`.
   * A positive integer; absent or invalid values leave it unset and the
   * fresh20 draft uses its default pack size.
   */
  fresh20PackSize?: number;
  debugJourneyShape?: string | null;
  debugJourneyReward?: string | null;
  debugJourneyCost?: string | null;
  /**
   * Name of a saved quest to load on boot, from `?loadQuest=`. When set, the
   * app fetches the matching snapshot from the dev server's `/api/saved-quests`
   * endpoint and replaces the room's quest state with it before showing the
   * game (see `scripts/saved-quests-api.mjs`). Null when absent.
   * `parseRuntimeConfig` always sets it; it is optional only so test config
   * literals can omit it. Only works while the Vite dev server is running,
   * since that serves the endpoint.
   */
  loadQuestName?: string | null;
  /**
   * Id of a developer QA scene to jump straight to on boot, from `?goto=`. When
   * set, the app replaces the freshly created room's empty quest state with one
   * parked on that screen (built from live quest content; see
   * `src/runtime/qa-scenes.ts`), so screens otherwise reachable only by playing
   * battles forward — such as the Dream Atlas boss preview — can be opened
   * directly for browser QA. Null when absent. `parseRuntimeConfig` always sets
   * it; it is optional only so test config literals can omit it.
   */
  gotoScene?: string | null;
}

export type DatabaseMode = "emulator" | "realtime";
export type JourneyVariant = "classic" | "v2";

export function parseRuntimeConfig(search: string): RuntimeConfig {
  const params = new URLSearchParams(search);
  const rawAlgo = params.get("algo");
  const draftMode = parseDraftMode(rawAlgo);
  // `?algo=replay`/`fresh20` select a draft mode, not a pool variant, but both
  // still need a pool variant for the resolved package, so they use the default.
  // Only in pool mode is the raw value resolved as a pool variant — where an
  // unrecognised value throws rather than silently using the default.
  const poolVariant =
    draftMode === "pool" ? resolvePoolVariant(rawAlgo) : DEFAULT_POOL_VARIANT;
  return {
    seedOverride: parseSeedOverride(params.get("seed")),
    startInBattle: params.get("startInBattle") === "1",
    aiMode: params.get("ai") !== "0",
    basicAutomation: params.get("automation") !== "0",
    gameId: normalizeRoomId(params.get("game")),
    databaseMode: parseDatabaseMode(params.get("realtime")),
    journeyVariant: parseJourneyVariant(params.get("journey")),
    poolVariant,
    draftMode,
    fresh20PackSize: parsePackSize(params.get("packsize")),
    debugJourneyShape: parseDebugJourneyId(params.get("debugJourneyShape")),
    debugJourneyReward: parseDebugJourneyId(params.get("debugJourneyReward")),
    debugJourneyCost: parseDebugJourneyId(params.get("debugJourneyCost")),
    loadQuestName: parseLoadQuestName(params.get("loadQuest")),
    gotoScene: parseGotoScene(params.get("goto")),
  };
}

function parseGotoScene(rawScene: string | null): string | null {
  if (rawScene === null) {
    return null;
  }
  const trimmed = rawScene.trim();
  return trimmed === "" ? null : trimmed;
}

function parseJourneyVariant(rawJourney: string | null): JourneyVariant {
  return rawJourney === "classic" ? "classic" : "v2";
}

function parseDraftMode(rawAlgo: string | null): "pool" | "replay" | "fresh20" {
  if (rawAlgo === "replay") return "replay";
  if (rawAlgo === "fresh20") return "fresh20";
  return "pool";
}

function parsePackSize(rawPackSize: string | null): number | undefined {
  if (rawPackSize === null || !/^\d+$/.test(rawPackSize)) {
    return undefined;
  }
  const parsed = Number(rawPackSize);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function parseDatabaseMode(rawRealtime: string | null): DatabaseMode {
  // `?realtime=1` forces the production realtime database; `?realtime=0` forces
  // the local emulator (useful for testing a production build against a local
  // emulator). With the param absent or unrecognised, default by build mode:
  // production builds (the deployed `web.app` host) talk to the realtime
  // database, dev builds talk to the local emulator. Defaulting deployed builds
  // to the emulator made them try to reach `http://127.0.0.1:9000`, which a
  // remote browser blocks as insecure content, hanging the join flow forever.
  if (rawRealtime === "1") {
    return "realtime";
  }
  if (rawRealtime === "0") {
    return "emulator";
  }
  return import.meta.env.PROD ? "realtime" : "emulator";
}

function parseLoadQuestName(rawName: string | null): string | null {
  if (rawName === null) {
    return null;
  }
  const trimmed = rawName.trim();
  return trimmed === "" ? null : trimmed;
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
