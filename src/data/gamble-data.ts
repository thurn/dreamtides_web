import type {
  GambleData,
  GambleGameDefinition,
  GambleRulesKind,
} from "../types/gamble-data";
import type { GambleGameId } from "../types/gamble";

const GAMBLE_DATA_JSON_PATH = "/gamble-data.json";
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const RULE_KINDS: readonly GambleRulesKind[] = [
  "threeGate",
  "ladderClimb",
  "starwayStairs",
  "fourSuitReprise",
  "blackjack",
];

function isGameIdAtIndex(value: unknown, index: number): value is GambleGameId {
  switch (index) {
    case 0:
      return value === "gravok-three-gate-wager";
    case 1:
      return value === "tidemark-ladder-climb";
    case 2:
      return value === "starway-stairs";
    case 3:
      return value === "four-suit-reprise";
    case 4:
      return value === "blackjack";
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isGambleData(value: unknown): value is GambleData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !SHA256_HEX.test(String(value.contentHash)) ||
    !SHA256_HEX.test(String(value.foldHash)) ||
    !Array.isArray(value.games) ||
    value.games.length !== RULE_KINDS.length
  ) {
    return false;
  }
  return (
    value.games.every((game, index) => {
      if (
        !isRecord(game) ||
        !isGameIdAtIndex(game.id, index) ||
        !isNonBlank(game.rulesVersion) ||
        !isRecord(game.selection) ||
        typeof game.selection.weight !== "number" ||
        game.selection.weight <= 0 ||
        typeof game.selection.fallback !== "boolean" ||
        !isRecord(game.economy) ||
        !isRecord(game.rules) ||
        game.economy.kind !== RULE_KINDS[index] ||
        game.rules.kind !== RULE_KINDS[index] ||
        !isRecord(game.presentation) ||
        !isNonBlank(game.presentation.title) ||
        !isNonBlank(game.presentation.rulesDisclosure) ||
        !isNonBlank(game.presentation.accessibilityDescription) ||
        !Array.isArray(game.presentation.actionLabels) ||
        !Array.isArray(game.presentation.outcomeLabels)
      ) {
        return false;
      }
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

/** Load the compiler-validated Gamble gameplay and presentation catalog. */
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
  return value;
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
