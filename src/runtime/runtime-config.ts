import { normalizeGameId } from "../eventlog/game-id";
import type { ContentConfig, PinnedContentConfig } from "../eventlog/types";
import type { EconomyData } from "../types/economy-data";
import type { OpponentsData } from "../types/opponents-data";
import type { DraftData } from "../types/draft-data";
import { CARD_ROLE_DATA } from "../data/card-roles";
import type { RewardSelectionData } from "../types/reward-selection-data";
import type { AuguryData } from "../types/augury-data";
import type { GambleData } from "../types/gamble-data";
import type { TransfigurationData } from "../types/transfiguration-data";
import { parseCardId, isCardId, type CardId } from "../types/card-identity";
import type { GambleGameId } from "../types/gamble";
import { parseQaSceneId, type QaSceneId, type GameId } from "../types/identifiers";
import type { FoldHash } from "../types/content-hash";

export interface RuntimeConfig {
  seedOverride: number | null;
  aiMode: boolean;
  /**
   * Local playback multiplier for the standalone tutorial sequence, from
   * `?tutorialSpeed=`. A positive finite decimal; absent or invalid values use
   * normal speed (`1`). This is presentation-only and is not pinned into game
   * genesis.
   */
  tutorialPlaybackSpeed?: number;
  gameId: GameId | null;
  /**
   * Id of a developer QA scene to jump straight to on boot, from `?goto=`. When
   * set, the app replaces the freshly created game's empty journey state with one
   * parked on that screen (built from live journey content; see
   * `src/runtime/qa-scenes.ts`), so screens otherwise reachable only by playing
   * battles forward — such as the Dream Atlas boss preview — can be opened
   * directly for browser QA. Null when absent. `parseRuntimeConfig` always sets
   * it; it is optional only so test config literals can omit it.
   */
  gotoScene?: QaSceneId | null;
  /**
   * Exploration encounter source-card UUID from `?card=`. This is consumed by
   * the `exploration`, `exploration-enhanced`, and `exploration-duplicates` QA
   * scenes so browser QA can open one exact authored encounter. Null when absent
   * or malformed.
   */
  explorationCardId?: CardId | null;
  /** QA-only held Dreamsign count for forced Exploration scenes. */
  explorationDreamsignCount?: number | null;
  /** QA-only Dreamsign capacity for forced Exploration scenes. */
  explorationDreamsignCap?: number | null;
  /** QA-only authentic starter-card count for forced Exploration scenes. */
  explorationStarterCount?: number | null;
  /**
   * Optional Gamble game forced by `?gambleGame=`. Null lets OPEN_SITE choose
   * randomly; the resolved game is persisted in the game event log.
   */
  gambleGameId?: GambleGameId | null;
}

/**
 * Extracts the fold-relevant content slice a game pins into its genesis.
 * Presentation-only configuration such as `aiMode` is excluded so a change in
 * presentation never gates a stored game.
 */
export function contentConfigFromRuntime(
  atlasFoldHash: FoldHash,
  sitesFoldHash: FoldHash,
  draftData: DraftData,
  economyData: EconomyData,
  gambleData: GambleData,
  transfigurationData: TransfigurationData,
  opponentsData: OpponentsData,
  rewardSelectionData: RewardSelectionData,
  auguryData: AuguryData,
  explorationFoldHash: FoldHash,
  tutorialFoldHash: FoldHash,
): PinnedContentConfig {
  return {
    poolVariant: draftData.pool.defaultStrategy,
    atlasFoldHash,
    sitesFoldHash,
    draftFoldHash: draftData.foldHash,
    cardRolesFoldHash: CARD_ROLE_DATA.foldHash,
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

/** Field-wise equality of two content configs (used by the config gate). */
export function contentConfigsEqual(
  a: ContentConfig,
  b: ContentConfig,
): boolean {
  return (
    a.poolVariant === b.poolVariant &&
    a.atlasFoldHash === b.atlasFoldHash &&
    a.sitesFoldHash === b.sitesFoldHash &&
    a.draftFoldHash === b.draftFoldHash &&
    a.cardRolesFoldHash === b.cardRolesFoldHash &&
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

export function parseRuntimeConfig(search: string): RuntimeConfig {
  const params = new URLSearchParams(search);
  return {
    seedOverride: parseSeedOverride(params.get("seed")),
    aiMode: params.get("ai") === "1",
    tutorialPlaybackSpeed: parseTutorialPlaybackSpeed(
      params.get("tutorialSpeed"),
    ),
    gameId: normalizeGameId(params.get("game")),
    ...parseQaParams(params),
  };
}

type QaParams = Pick<
  RuntimeConfig,
  | "gotoScene"
  | "explorationCardId"
  | "explorationDreamsignCount"
  | "explorationDreamsignCap"
  | "explorationStarterCount"
  | "gambleGameId"
>;

/**
 * The QA scene parameters. They apply only in development builds (P7); a
 * production build ignores them.
 */
function parseQaParams(params: URLSearchParams): QaParams {
  if (!import.meta.env.DEV) {
    return {
      gotoScene: null,
      explorationCardId: null,
      explorationDreamsignCount: null,
      explorationDreamsignCap: null,
      explorationStarterCount: null,
      gambleGameId: null,
    };
  }
  return {
    gotoScene: parseGotoScene(params.get("goto")),
    explorationCardId: parseExplorationCardId(params.get("card")),
    explorationDreamsignCount: parseQaDreamsignInteger(
      params.get("dreamsignCount"),
    ),
    explorationDreamsignCap: parseQaDreamsignInteger(
      params.get("dreamsignCap"),
    ),
    explorationStarterCount: parseQaStarterInteger(params.get("starterCount")),
    gambleGameId: parseGambleGameId(params.get("gambleGame")),
  };
}

const MAX_QA_DREAMSIGN_INTEGER = 100;
const MAX_QA_STARTER_INTEGER = 100;

function parseQaDreamsignInteger(rawValue: string | null): number | null {
  if (rawValue === null || !/^\d+$/u.test(rawValue)) return null;
  const value = Number(rawValue);
  return Number.isSafeInteger(value) && value <= MAX_QA_DREAMSIGN_INTEGER
    ? value
    : null;
}

function parseQaStarterInteger(rawValue: string | null): number | null {
  if (rawValue === null || !/^\d+$/u.test(rawValue)) return null;
  const value = Number(rawValue);
  return Number.isSafeInteger(value) && value <= MAX_QA_STARTER_INTEGER
    ? value
    : null;
}

function parseExplorationCardId(rawValue: string | null): CardId | null {
  if (rawValue === null) return null;
  const normalized = rawValue.trim().toLowerCase();
  return isCardId(normalized) ? parseCardId(normalized) : null;
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

function parseGotoScene(rawScene: string | null): QaSceneId | null {
  if (rawScene === null) {
    return null;
  }
  const trimmed = rawScene.trim();
  return trimmed === "" ? null : parseQaSceneId(trimmed);
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
