import type {
  GambleData,
  GambleGameDefinition,
  GambleRulesKind,
} from "../types/gamble-data";
import type { GambleGameId } from "../types/gamble";
import { parseContentHash, parseFoldHash } from "../types/content-hash";

const GAMBLE_DATA_JSON_PATH = "/gamble-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const GAME_RULE_KIND = {
  "gravok-three-gate-wager": "threeGate",
  "tidemark-ladder-climb": "ladderClimb",
  "starway-stairs": "starwayStairs",
  "four-suit-reprise": "fourSuitReprise",
  blackjack: "blackjack",
} as const satisfies Readonly<Record<GambleGameId, GambleRulesKind>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGambleGameId(value: unknown): value is GambleGameId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(GAME_RULE_KIND, value)
  );
}

function isGambleData(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !SHA256_HEX.test(String(value.contentHash)) ||
    !SHA256_HEX.test(String(value.foldHash)) ||
    !Array.isArray(value.games) ||
    value.games.length < 1 ||
    value.games.length > Object.keys(GAME_RULE_KIND).length
  ) {
    return false;
  }
  const ids = new Set<GambleGameId>();
  return (
    value.games.every((game) => {
      const gameId = isRecord(game) && isGambleGameId(game.id) ? game.id : null;
      const ruleKind = gameId === null ? undefined : GAME_RULE_KIND[gameId];
      if (
        !isRecord(game) ||
        gameId === null ||
        ruleKind === undefined ||
        ids.has(gameId) ||
        !isRecord(game.selection) ||
        typeof game.selection.weight !== "number" ||
        game.selection.weight <= 0 ||
        typeof game.selection.fallback !== "boolean" ||
        !isRecord(game.economy) ||
        !isRecord(game.rules) ||
        game.economy.kind !== ruleKind ||
        game.rules.kind !== ruleKind
      ) {
        return false;
      }
      ids.add(gameId);
      return true;
    }) &&
    value.games.filter(
      (game) =>
        isRecord(game) &&
        isRecord(game.selection) &&
        game.selection.fallback === true,
    ).length === 1
  );
}

/** Load the compiler-validated Gamble gameplay catalog. */
export async function loadGambleData(): Promise<GambleData> {
  const response = await fetch(GAMBLE_DATA_JSON_PATH);
  if (!response.ok) {
    throw new Error(
      `Failed to load Gamble data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const value: unknown = await response.json();
  if (!isGambleData(value)) {
    throw new Error("Failed to load Gamble data: malformed gamble-data.json");
  }
  const raw = value as Omit<GambleData, "contentHash" | "foldHash"> & {
    contentHash: unknown;
    foldHash: unknown;
  };
  return {
    ...raw,
    contentHash: parseContentHash(raw.contentHash),
    foldHash: parseFoldHash(raw.foldHash),
  };
}

export function gambleGame(
  data: GambleData,
  id: GambleGameId,
): GambleGameDefinition {
  const game = data.games.find((candidate) => candidate.id === id);
  if (game === undefined) throw new Error(`Missing Gamble game ${id}`);
  return game;
}

export function gambleGameByRulesKind<Kind extends GambleRulesKind>(
  data: GambleData,
  kind: Kind,
): Extract<GambleGameDefinition, { rules: { kind: Kind } }> {
  const game = data.games.find((candidate) => candidate.rules.kind === kind);
  if (game === undefined)
    throw new Error(`Missing Gamble rules variant ${kind}`);
  return game as Extract<GambleGameDefinition, { rules: { kind: Kind } }>;
}

export function gamblePresentationText(
  values: readonly { key: string; text: string }[],
  key: string,
): string {
  const value = values.find((candidate) => candidate.key === key)?.text;
  if (value === undefined)
    throw new Error(`Missing Gamble presentation key ${key}`);
  return value;
}
