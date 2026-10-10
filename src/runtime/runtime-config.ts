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
import { AI } from "../content/ai";
import { POLICY_IDS, type PolicyId } from "../engine/policy/types";

/**
 * The scene id that opens the deck-viewer overlay. The overlay is App-local
 * state (not a `Screen`), so parking on it takes two steps: the scene builds
 * the underlying dreamscape state (giving the run a full deck to show), and
 * `JourneyApp` opens the overlay when it sees this scene id. App and the
 * scene registry (`qa-scenes.ts`) name it from here.
 */
export const DECK_VIEWER_SCENE_ID = parseQaSceneId("deckviewer");

/** App-local Pool Viewer overlay scene, parked over a populated dreamscape. */
export const POOL_VIEWER_SCENE_ID = parseQaSceneId("poolviewer");

export interface RuntimeConfig {
  seedOverride: number | null;
  /**
   * The policy the AI host runs for the enemy of every journey battle's
   * engine battle, from `?ai=random|greedy`; any other value runs the
   * journey default. Presentation-only: the
   * AI's choices reach the log as intents. `parseRuntimeConfig` always sets
   * it; it is optional only so test config literals can omit it.
   */
  enemyPolicy?: PolicyId;
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
 * Presentation-only configuration such as `enemyPolicy` is excluded so a change in
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
    enemyPolicy: parseEnemyPolicy(params.get("ai")),
    tutorialPlaybackSpeed: parseTutorialPlaybackSpeed(
      params.get("tutorialSpeed"),
    ),
    gameId: normalizeGameId(params.get("game")),
    ...parseQaParams(params),
  };
}

/** The engine enemy policy `?ai=` names, else the journey default. */
export function parseEnemyPolicy(raw: string | null): PolicyId {
  return POLICY_IDS.find((id) => id === raw) ?? AI.enginePolicy.journeyDefault;
}

/**
 * The enemy policy of the URL the page loaded with, read once when the
 * runtime config module loads at page load: the battle screen runs it.
 */
export const PAGE_ENEMY_POLICY: PolicyId = parseEnemyPolicy(
  typeof location === "undefined" ? null : new URLSearchParams(location.search).get("ai"),
);

/**
 * Whether the URL the page loaded with asks for the engine battle screen's
 * debug panel (`?debug=1`, D4), which only a development build shows (P7).
 */
export const PAGE_DEBUG_PANEL: boolean =
  import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "1";

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
    gotoScene: parseGotoScene(params),
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

/**
 * The `?goto=` scene. `goto=card-lab` folds the lab's `card`, `variant`
 * (default `base`), and `as` (default `player`) into the scene id
 * `card-lab:<card>:<variant>:<as>`, which the scene registry resolves.
 */
function parseGotoScene(params: URLSearchParams): QaSceneId | null {
  const trimmed = (params.get("goto") ?? "").trim();
  if (trimmed === "") return null;
  if (trimmed.toLowerCase() !== "card-lab") return parseQaSceneId(trimmed);
  const token = (name: string, fallback: string) => (params.get(name) ?? fallback).trim().toLowerCase().replace(/:/gu, "");
  return parseQaSceneId(`card-lab:${token("card", "")}:${token("variant", "base")}:${token("as", "player")}`);
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
