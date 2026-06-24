import { asCardId, asCardName } from "../types/card-identity";
import { buildPoolData } from "../draft/pool/pool-data";
import { buildIdIndex } from "../data/cards-v2-database";
import type { CardData } from "../types/cards";
import type { RunPoolContext } from "../data/quest-content";

/**
 * A small hand-authored corpus for tests that drive the quest-start build path
 * (`buildDreamcallerPackage`). It provides three real-ish decklists of twenty
 * card names each and a name index covering every name, so the idf3 generator
 * has a usable corpus and `resolvePool` can map the generated names back onto
 * card numbers. Assertions over the resulting pool should be property-based
 * (a non-empty draft pool was produced) rather than checking exact numbers.
 */

function deckNames(prefix: string): string[] {
  const names: string[] = [];
  for (let index = 1; index <= 20; index += 1) {
    names.push(`${prefix} Card ${String(index)}`);
  }
  return names;
}

export const TEST_DECKLISTS: string[][] = [
  deckNames("Alpha"),
  deckNames("Beta"),
  deckNames("Gamma"),
];

/** Returns a card-name -> card-number index covering every name in the corpus. */
export function buildTestNameIndex(): Map<string, number> {
  const index = new Map<string, number>();
  let cardNumber = 1000;
  for (const deck of TEST_DECKLISTS) {
    for (const name of deck) {
      if (!index.has(name)) {
        index.set(name, cardNumber);
        cardNumber += 1;
      }
    }
  }
  return index;
}

/** Returns minimal card records (one per corpus name) keyed by card number. */
export function buildTestCorpusCards(): CardData[] {
  const cards: CardData[] = [];
  for (const [name, cardNumber] of buildTestNameIndex()) {
    cards.push({
      name: asCardName(name),
      id: asCardId(`corpus-${String(cardNumber)}`),
      cardNumber,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 2,
      spark: 1,
      isFast: false,
      renderedText: "",
      imageNumber: cardNumber,
      artOwned: true,
    });
  }
  return cards;
}

/**
 * Builds a {@link RunPoolContext} usable by `buildDreamcallerPackage`. The
 * generated pool draws names from {@link TEST_DECKLISTS}, all of which resolve
 * through the returned name index. The context also carries an id index built
 * from the same card records so `resolvePool` can handle UUID-keyed pool counts
 * (e.g. from the `idf3` variant) without merging same-name cards.
 */
export function makeTestPoolContext(
  allDreamsignPoolIds: string[] = ["dreamsign-a", "dreamsign-b"],
): RunPoolContext {
  const cards = buildTestCorpusCards();
  const cardDatabase = new Map<number, CardData>(
    cards.map((c) => [c.cardNumber, c]),
  );
  return {
    poolData: buildPoolData(cards, TEST_DECKLISTS),
    nameIndex: buildTestNameIndex(),
    idIndex: buildIdIndex(cardDatabase),
    allDreamsignPoolIds,
    // This corpus has decklists but no draft records, so pin idf3 (which builds
    // from the decklist corpus) rather than inheriting the records-driven
    // default, which would throw on the empty record corpus.
    poolVariant: "idf3",
  };
}
