import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { buildCardMaps, buildDraftRecords } from "./setup-assets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_TUNING = {
  alpha: 1,
  beta: 0.9,
  gamma: 0.25,
  K: 50,
  idfPower: 1,
  minDf: 2,
  maxDfFrac: 0.6,
  minDeckSize: 16,
  maxDeckSize: 34,
};

/** Build the UUID-based fit model shared by corpus-backed offline tools. */
export function buildFitModel(corpusDecks, tuning = DEFAULT_TUNING) {
  const filtered = [];
  for (const deck of corpusDecks) {
    const distinct = new Set(deck);
    if (
      distinct.size >= tuning.minDeckSize &&
      distinct.size <= tuning.maxDeckSize
    ) {
      filtered.push(distinct);
    }
  }

  const deckCount = filtered.length;
  const documentFrequency = new Map();
  for (const deck of filtered) {
    for (const cardId of deck) {
      documentFrequency.set(
        cardId,
        (documentFrequency.get(cardId) ?? 0) + 1,
      );
    }
  }

  const idf = new Map();
  const maxDocumentFrequency = tuning.maxDfFrac * deckCount;
  for (const [cardId, frequency] of documentFrequency) {
    const weight =
      frequency < tuning.minDf || frequency > maxDocumentFrequency
        ? 0
        : Math.log((deckCount + 1) / frequency) ** tuning.idfPower;
    idf.set(cardId, weight);
  }
  const idfOf = (cardId) => idf.get(cardId) ?? 0;

  const decks = filtered.map((cards) => {
    let squaredWeight = 0;
    for (const cardId of cards) squaredWeight += idfOf(cardId) ** 2;
    return { cards, norm: Math.sqrt(squaredWeight) || 1 };
  });

  const prior = new Map();
  if (deckCount > 0) {
    for (const [cardId, frequency] of documentFrequency) {
      prior.set(cardId, frequency / deckCount);
    }
  }

  const cooccurrence = new Map();
  const addCooccurrence = (source, target, weight) => {
    const row = cooccurrence.get(source) ?? new Map();
    row.set(target, (row.get(target) ?? 0) + weight);
    cooccurrence.set(source, row);
  };
  for (const deck of filtered) {
    const cards = [...deck];
    for (let left = 0; left < cards.length; left += 1) {
      for (let right = left + 1; right < cards.length; right += 1) {
        const weight = idfOf(cards[left]) * idfOf(cards[right]);
        if (weight === 0) continue;
        addCooccurrence(cards[left], cards[right], weight);
        addCooccurrence(cards[right], cards[left], weight);
      }
    }
  }

  const coocNorm = new Map();
  for (const [source, row] of cooccurrence) {
    const frequency = documentFrequency.get(source) ?? 0;
    if (frequency === 0) continue;
    coocNorm.set(
      source,
      new Map([...row].map(([target, weight]) => [target, weight / frequency])),
    );
  }

  return { decks, idf, prior, coocNorm };
}

/** Load adapted draft records through the same compiler used for browser data. */
export function loadCorpus() {
  const cards = parse(readFileSync(resolve(ROOT, "data/cards.toml"), "utf8"))
    .cards;
  if (!Array.isArray(cards)) throw new Error("Expected [[cards]] array in cards.toml");

  const originalLog = console.log;
  console.log = () => {};
  let records;
  try {
    records = buildDraftRecords(
      resolve(ROOT, "docs/draft_records_adapted"),
      buildCardMaps(cards),
    );
  } finally {
    console.log = originalLog;
  }

  const numberOf = new Map();
  for (const card of cards) {
    if (typeof card["card-number"] === "number" && typeof card.id === "string") {
      numberOf.set(card.id.toLowerCase(), card["card-number"]);
    }
  }
  return { records, numberOf };
}
