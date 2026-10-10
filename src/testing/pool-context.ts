import { parseCardName, type CardId } from "../types/card-identity";
import { buildPoolData } from "../draft/pool/pool-data";
import { buildIdIndex } from "../data/cards-v2-database";
import type { CardData } from "../types/cards";
import type { RunPoolContext } from "../data/journey-content";
import {
  testCardId,
  testCardSubtype,
  testDreamsignId,
  testTideId,
} from "../types/test-identities";

/**
 * A small synthetic corpus for tests that drive the journey-start build path
 * (`buildAvatarPackage`). It provides three decklists of twenty cards each,
 * generated as contiguous card-number ranges, so tides4 has a usable synthetic
 * artifact. Every corpus card carries a UUID {@link CardId} derived from its
 * card number; the tide decklists reference cards by that id, and `resolvePool`
 * maps the generated ids back onto card numbers through the id index.
 * Assertions over the resulting pool should be property-based (a non-empty
 * draft pool was produced) rather than checking exact numbers.
 */

/** Display-name prefix of each synthetic deck; used only for `CardData.name`. */
const CORPUS_DECK_LABELS = ["Alpha", "Beta", "Gamma"] as const;
const CORPUS_DECK_SIZE = 20;
const CORPUS_FIRST_CARD_NUMBER = 1000;

/** Synthetic starter numbers for tests; production resolves UUID roles from RON. */
export const TEST_STARTER_CARD_NUMBERS = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
] as const;

/** The card numbers of one synthetic deck: a contiguous range per deck. */
function deckCardNumbers(deckIndex: number): number[] {
  const first = CORPUS_FIRST_CARD_NUMBER + deckIndex * CORPUS_DECK_SIZE;
  return Array.from({ length: CORPUS_DECK_SIZE }, (_, offset) => first + offset);
}

/** The UUID card id of the corpus card with `cardNumber`. */
function corpusCardId(cardNumber: number): CardId {
  return testCardId(`corpus-${String(cardNumber)}`);
}

/** Returns minimal card records for every corpus card, in card-number order. */
export function buildTestCorpusCards(): CardData[] {
  return CORPUS_DECK_LABELS.flatMap((label, deckIndex) =>
    deckCardNumbers(deckIndex).map(
      (cardNumber, offset): CardData => ({
        name: parseCardName(`${label} Card ${String(offset + 1)}`),
        id: corpusCardId(cardNumber),
        cardNumber,
        cardType: "Character",
        subtype: testCardSubtype(""),
        isStarter: false,
        energyCost: 2,
        spark: 1,
        isFast: false,
        renderedText: "",
        imageNumber: cardNumber,
        artOwned: true,
      }),
    ),
  );
}

/**
 * Builds a {@link RunPoolContext} usable by `buildAvatarPackage`. The
 * generated pool is keyed by the corpus card ids, all of which resolve through
 * the id index built from the same card records, so `resolvePool` maps the
 * pool onto card numbers through the collision-free id path.
 */
export function makeTestPoolContext(
  allDreamsignPoolIdSeeds: string[] = ["dreamsign-a", "dreamsign-b"],
): RunPoolContext {
  const cards = buildTestCorpusCards();
  const cardDatabase = new Map<number, CardData>(
    cards.map((c) => [c.cardNumber, c]),
  );
  const poolData = buildPoolData(cards);
  poolData.tides4Decks = {
    version: 2,
    selection: { bandFraction: 0.25, bandMinimum: 5 },
    tides: CORPUS_DECK_LABELS.map((_, index) => ({
      id: testTideId(`test-tide-${String(index + 1)}`),
      displayName: `Test Tide ${String(index + 1)}`,
      auguryPackageReference: `Test Tide ${String(index + 1)} package`,
      displayDescription: `Test Tide ${String(index + 1)} description`,
      role: index === 0 ? "signature" : index === 1 ? "facet" : "neutral",
      resonance: index === 0 ? "shadow" : index === 1 ? "wild" : "vision",
      cards: deckCardNumbers(index).map((cardNumber) => ({
        id: corpusCardId(cardNumber),
        copies: 2,
      })),
    })),
    tidePoolByAvatar: {},
  };
  return {
    poolData,
    idIndex: buildIdIndex(cardDatabase),
    starterCardNumbers: TEST_STARTER_CARD_NUMBERS,
    allDreamsignPoolIds: allDreamsignPoolIdSeeds.map(testDreamsignId),
    poolVariant: "tides4",
    tides4Tuning: { dealSize: 60, copyCap: 2, maxFacets: 3 },
  };
}
