import { normalizeRoomId } from "../eventlog/room";
import type { ContentConfig, PinnedContentConfig } from "../eventlog/types";
import type { EconomyData } from "../types/economy-data";
import type { OpponentsData } from "../types/opponents-data";
import type { DraftData } from "../types/draft-data";
import type { RewardSelectionData } from "../types/reward-selection-data";
import type { AuguryData } from "../types/augury-data";
import type { GambleData } from "../types/gamble-data";
import type { TransfigurationData } from "../types/transfiguration-data";
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
 * Extracts the fold-relevant content slice a room pins into its genesis.
 * Presentation-only configuration such as `aiMode` is excluded so two clients
 * differing purely in presentation still fold — and join — the same room.
 */
export function contentConfigFromRuntime(
  atlasFoldHash: string,
  sitesFoldHash: string,
  draftData: DraftData,
  economyData: EconomyData,
  gambleData: GambleData,
  transfigurationData: TransfigurationData,
  opponentsData: OpponentsData,
  rewardSelectionData: RewardSelectionData,
  auguryData: AuguryData,
  explorationFoldHash: string,
  tutorialFoldHash: string,
): PinnedContentConfig {
  return {
    poolVariant: draftData.pool.defaultStrategy,
    atlasFoldHash,
    sitesFoldHash,
    draftFoldHash: draftData.foldHash,
    economyFoldHash: economyData.foldHash,
    gambleFoldHash: gambleData.foldHash,
    transfigurationFoldHash: transfigurationData.foldHash,
    rewardSelectionFoldHash: rewardSelectionData.foldHash,
    auguryFoldHash: auguryData.foldHash,
    explorationFoldHash,
    tutorialFoldHash,
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
    a.atlasFoldHash === b.atlasFoldHash &&
    a.sitesFoldHash === b.sitesFoldHash &&
    a.draftFoldHash === b.draftFoldHash &&
    a.economyFoldHash === b.economyFoldHash &&
    a.gambleFoldHash === b.gambleFoldHash &&
    a.transfigurationFoldHash === b.transfigurationFoldHash &&
    a.rewardSelectionFoldHash === b.rewardSelectionFoldHash &&
    a.auguryFoldHash === b.auguryFoldHash &&
    a.explorationFoldHash === b.explorationFoldHash &&
    a.tutorialFoldHash === b.tutorialFoldHash &&
    a.opponentsFoldHash === b.opponentsFoldHash &&
    a.defaultStartingEssence === b.defaultStartingEssence &&
    a.dreamsignCap === b.dreamsignCap
  );
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
  return {
    seedOverride: parseSeedOverride(params.get("seed")),
    aiMode: params.get("ai") === "1",
    tutorialPlaybackSpeed: parseTutorialPlaybackSpeed(
      params.get("tutorialSpeed"),
    ),
    gameId: normalizeRoomId(params.get("game")),
    databaseMode: parseDatabaseMode(params.get("realtime")),
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
  if (rawGame === "blackjack") return "blackjack";
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
