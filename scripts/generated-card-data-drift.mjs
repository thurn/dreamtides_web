import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "smol-toml";
import { NIGHTMARE_CARD_ID, transformCard } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function formatValue(record, key) {
  if (!hasOwn(record, key)) {
    return "<omitted>";
  }
  return JSON.stringify(record[key]);
}

function displayCard(card, index) {
  const cardNumber = typeof card.cardNumber === "number"
    ? `card ${String(card.cardNumber)}`
    : `index ${String(index)}`;
  const cardName = typeof card.name === "string" ? ` ${card.name}` : "";
  return `${cardNumber}${cardName}`;
}

function firstCardDifference(expected, actual) {
  if (expected.length !== actual.length) {
    return `card count differs: TOML produces ${String(expected.length)}, public/card-data.json has ${String(actual.length)}`;
  }

  for (let index = 0; index < expected.length; index++) {
    const expectedCard = expected[index];
    const actualCard = actual[index];

    if (
      expectedCard.cardNumber !== actualCard.cardNumber ||
      expectedCard.id !== actualCard.id
    ) {
      return `card order differs at index ${String(index)}: TOML has ${displayCard(expectedCard, index)}, public/card-data.json has ${displayCard(actualCard, index)}`;
    }

    const expectedJson = JSON.stringify(expectedCard);
    const actualJson = JSON.stringify(actualCard);
    if (expectedJson === actualJson) {
      continue;
    }

    const keys = new Set([
      ...Object.keys(expectedCard),
      ...Object.keys(actualCard),
    ]);
    for (const key of keys) {
      if (
        !hasOwn(expectedCard, key) ||
        !hasOwn(actualCard, key) ||
        JSON.stringify(expectedCard[key]) !== JSON.stringify(actualCard[key])
      ) {
        return `${displayCard(expectedCard, index)} differs at ${key}: TOML produces ${formatValue(expectedCard, key)}, public/card-data.json has ${formatValue(actualCard, key)}`;
      }
    }

    return `${displayCard(expectedCard, index)} differs from public/card-data.json`;
  }

  return null;
}

export function expectedCardDataFromToml({ rootDir = ROOT } = {}) {
  const cardTomlPath = join(rootDir, "data", "tabula", "cards.toml");
  const parsedCards = parse(readFileSync(cardTomlPath, "utf8"));
  const allCards = parsedCards.cards;

  if (!Array.isArray(allCards)) {
    throw new Error("Expected [[cards]] array in cards.toml");
  }

  // Mirror the runtime filter in setup-assets.mjs: Special-rarity cards are
  // excluded from the runtime pool, except Nightmare.
  return allCards
    .filter((card) => card.rarity !== "Special" || card.id === NIGHTMARE_CARD_ID)
    .map(transformCard);
}

export function checkGeneratedCardData({ rootDir = ROOT } = {}) {
  const startedAt = performance.now();

  try {
    const cardJsonPath = join(rootDir, "public", "card-data.json");
    const expectedCards = expectedCardDataFromToml({ rootDir });
    const actualCards = JSON.parse(readFileSync(cardJsonPath, "utf8"));

    if (!Array.isArray(actualCards)) {
      throw new Error("Expected public/card-data.json to contain an array");
    }

    const difference = firstCardDifference(expectedCards, actualCards);
    const durationMs = performance.now() - startedAt;
    if (difference !== null) {
      return {
        ok: false,
        durationMs,
        message: `Generated card data is out of date: ${difference}. Run npm run setup-assets.`,
      };
    }

    return {
      ok: true,
      durationMs,
      message: `Generated card data matches cards.toml in ${durationMs.toFixed(1)} ms.`,
    };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    return {
      ok: false,
      durationMs,
      message: `Generated card data check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = checkGeneratedCardData();
  const write = result.ok ? console.log : console.error;
  write(result.message);
  process.exitCode = result.ok ? 0 : 1;
}
