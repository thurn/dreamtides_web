import { resolvePoolVariant } from "../draft/pool";
import type { PoolVariant } from "../draft/pool";
import { normalizeRoomId } from "../eventlog/room";
import type { ContentConfig, PinnedContentConfig } from "../eventlog/types";
import type { EconomyData } from "../types/economy-data";
import type { OpponentsData } from "../types/opponents-data";
import type { DraftData } from "../types/draft-data";
import type { RewardSelectionData } from "../types/reward-selection-data";
import type { AuguryData } from "../types/augury-data";
import { asCardId, isCardId, type CardId } from "../types/card-identity";
import type { GambleGameId } from "../types/gamble";

export interface RuntimeConfig {
  seedOverride: number | null;
  aiMode: boolean;
  /**
   * Local playback multiplier for the standalone tutorial sequence, from
   * `?tutorialSpeed=`. A positive finite decimal; absent or invalid values use
   * normal speed (`1`). This is presentation-only and is not pinned into room
   * genesis.
   */
  tutorialPlaybackSpeed?: number;
  gameId: string | null;
  databaseMode: DatabaseMode;
  /**
   * Draft-pool construction strategy from `?algo=`, resolved to a registered
   * `PoolVariant`. An absent value stays undefined until the compiled draft
   * data supplies the production default; an explicit unrecognized value is an
   * error. Drives the journey prototype's draft and enemy pools.
   */
  poolVariant?: PoolVariant;
  /**
   * Selects the draft mode: `"replay"` activates the record-replay draft (from
   * `?algo=replay`); `"fresh20"` activates the fresh-random-pack draft (from
   * `?algo=fresh20`); `"pool"` is the default pool-based draft. `poolVariant`
   * remains undefined for replay/fresh20 until the compiled draft data supplies
   * the production pool default.
   */
  draftMode?: "pool" | "replay" | "fresh20";
  /**
   * Cards per freshly generated pack in `?algo=fresh20`, from `?packsize=`.
   * A positive integer; absent or invalid values leave it unset and the
   * fresh20 draft uses its default pack size.
   */
  fresh20PackSize?: number;
  /**
   * Name of a saved journey to load on boot, from `?loadJourney=`. When set, the
   * app fetches the matching snapshot from the dev server's `/api/saved-journeys`
   * endpoint and replaces the room's journey state with it before showing the
   * game (see `scripts/saved-journeys-api.mjs`). Null when absent.
   * `parseRuntimeConfig` always sets it; it is optional only so test config
   * literals can omit it. Only works while the Vite dev server is running,
   * since that serves the endpoint.
   */
  loadJourneyName?: string | null;
  /**
   * Id of a developer QA scene to jump straight to on boot, from `?goto=`. When
   * set, the app replaces the freshly created room's empty journey state with one
   * parked on that screen (built from live journey content; see
   * `src/runtime/qa-scenes.ts`), so screens otherwise reachable only by playing
   * battles forward — such as the Dream Atlas boss preview — can be opened
   * directly for browser QA. Null when absent. `parseRuntimeConfig` always sets
   * it; it is optional only so test config literals can omit it.
   */
  gotoScene?: string | null;
  /**
   * Exploration encounter source-card UUID from `?card=`. This is consumed by
   * the `exploration`, `exploration-enhanced`, and `exploration-duplicates` QA
   * scenes so browser QA can open one exact authored encounter. Null when absent
   * or malformed.
   */
  explorationCardId?: CardId | null;
  /**
   * Room id whose persisted journey log should be displayed, from
   * `?viewLogs=<roomId>`. When set, the app renders the read-only log viewer
   * (reading `rooms/<roomId>/logs` from Realtime Database) instead of joining a
   * game, so a production run's log can be inspected after the playing tab has
   * closed. Normalized like `?game=`; null when absent or malformed.
   * `parseRuntimeConfig` always sets it; it is optional only so test config
   * literals can omit it.
   */
  viewLogs?: string | null;
  /**
   * Optional Gamble game forced by `?gambleGame=`. Null lets OPEN_SITE choose
   * randomly; the resolved game is persisted in the room event log.
   */
  gambleGameId?: GambleGameId | null;
}

export type DatabaseMode = "emulator" | "realtime";

/**
 * Extracts the fold-relevant content slice a room pins into its genesis. Only
 * parameters that change how the log folds belong here (draft pool/mode and
 * pack size); presentation-only configuration such as `aiMode` is excluded so
 * two clients differing purely in presentation still
 * fold — and join — the same room. Absent optional fields fall back to the
 * same defaults `parseRuntimeConfig` applies.
 */
export function contentConfigFromRuntime(
  config: RuntimeConfig,
  atlasFoldHash: string,
  draftData: DraftData,
  economyData: EconomyData,
  opponentsData: OpponentsData,
  rewardSelectionData: RewardSelectionData,
  auguryData: AuguryData,
  explorationFoldHash: string,
): PinnedContentConfig {
  return {
    poolVariant: config.poolVariant ?? draftData.pool.defaultStrategy,
    draftMode: config.draftMode ?? "pool",
    fresh20PackSize: config.fresh20PackSize ?? null,
    atlasFoldHash,
    draftFoldHash: draftData.foldHash,
    economyFoldHash: economyData.foldHash,
    rewardSelectionFoldHash: rewardSelectionData.foldHash,
    auguryFoldHash: auguryData.foldHash,
    explorationFoldHash,
    opponentsFoldHash: opponentsData.foldHash,
    defaultStartingEssence: economyData.journey.defaultStartingEssence,
    dreamsignCap: economyData.journey.dreamsignCap,
  };
}

/** Field-wise equality of two content configs (used by RoomGate's config gate). */
export function contentConfigsEqual(
  a: ContentConfig,
  b: ContentConfig,
): boolean {
  return (
    a.poolVariant === b.poolVariant &&
    a.draftMode === b.draftMode &&
    a.fresh20PackSize === b.fresh20PackSize &&
    a.atlasFoldHash === b.atlasFoldHash &&
    a.draftFoldHash === b.draftFoldHash &&
    a.economyFoldHash === b.economyFoldHash &&
    a.rewardSelectionFoldHash === b.rewardSelectionFoldHash &&
    a.auguryFoldHash === b.auguryFoldHash &&
    a.explorationFoldHash === b.explorationFoldHash &&
    a.opponentsFoldHash === b.opponentsFoldHash &&
    a.defaultStartingEssence === b.defaultStartingEssence &&
    a.dreamsignCap === b.dreamsignCap
  );
}

/**
 * Overlays a content config onto an existing query string, producing the search
 * the config gate reloads to so this client adopts a room's pinned params. The
 * content-bearing params (`algo`, `packsize`) are rewritten to match
 * `config`; every other param — notably `game` (keep us in the room) and `ui` —
 * is preserved. It is the inverse of the content slice of `parseRuntimeConfig`:
 * feeding the result back through `parseRuntimeConfig` yields a config whose
 * content slice equals `config`.
 */
export function applyContentConfigToSearch(
  currentSearch: string,
  config: ContentConfig,
): string {
  const params = new URLSearchParams(currentSearch);
  if (config.draftMode === "replay") {
    params.set("algo", "replay");
    params.delete("packsize");
  } else if (config.draftMode === "fresh20") {
    params.set("algo", "fresh20");
    if (config.fresh20PackSize === null) {
      params.delete("packsize");
    } else {
      params.set("packsize", String(config.fresh20PackSize));
    }
  } else {
    params.set("algo", config.poolVariant);
    params.delete("packsize");
  }
  params.delete("journey");
  params.delete("debugJourneyShape");
  params.delete("debugJourneyReward");
  params.delete("debugJourneyCost");
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

/** Returns a canonical gameplay query string with the obsolete UI key removed. */
export function removeUiParamFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("ui");
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export function parseRuntimeConfig(search: string): RuntimeConfig {
  const params = new URLSearchParams(search);
  const rawAlgo = params.get("algo");
  const draftMode = parseDraftMode(rawAlgo);
  // Draft modes and an absent `?algo=` defer pool strategy resolution until the
  // compiled draft data has loaded. Explicit developer variants resolve here.
  const poolVariant =
    draftMode === "pool" && rawAlgo !== null && rawAlgo !== ""
      ? resolvePoolVariant(rawAlgo)
      : undefined;
  return {
    seedOverride: parseSeedOverride(params.get("seed")),
    aiMode: params.get("ai") === "1",
    tutorialPlaybackSpeed: parseTutorialPlaybackSpeed(
      params.get("tutorialSpeed"),
    ),
    gameId: normalizeRoomId(params.get("game")),
    databaseMode: parseDatabaseMode(params.get("realtime")),
    poolVariant,
    draftMode,
    fresh20PackSize: parsePackSize(params.get("packsize")),
    loadJourneyName: parseLoadJourneyName(params.get("loadJourney")),
    gotoScene: parseGotoScene(params.get("goto")),
    explorationCardId: parseExplorationCardId(params.get("card")),
    viewLogs: normalizeRoomId(params.get("viewLogs")),
    gambleGameId: parseGambleGameId(params.get("gambleGame")),
  };
}

function parseExplorationCardId(rawCardId: string | null): CardId | null {
  if (rawCardId === null) return null;
  const normalized = rawCardId.trim().toLowerCase();
  return isCardId(normalized) ? asCardId(normalized) : null;
}

function parseGambleGameId(rawGame: string | null): GambleGameId | null {
  if (rawGame === "three-gate") return "gravok-three-gate-wager";
  if (rawGame === "ladder-climb") return "tidemark-ladder-climb";
  if (rawGame === "starway-stairs") return "starway-stairs";
  if (rawGame === "four-suit-reprise") return "four-suit-reprise";
  return null;
}

function parseTutorialPlaybackSpeed(rawSpeed: string | null): number {
  if (rawSpeed === null || !/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(rawSpeed)) {
    return 1;
  }
  const parsed = Number(rawSpeed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseGotoScene(rawScene: string | null): string | null {
  if (rawScene === null) {
    return null;
  }
  const trimmed = rawScene.trim();
  return trimmed === "" ? null : trimmed;
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

function parseLoadJourneyName(rawName: string | null): string | null {
  if (rawName === null) {
    return null;
  }
  const trimmed = rawName.trim();
  return trimmed === "" ? null : trimmed;
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
