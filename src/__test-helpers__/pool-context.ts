import { asCardId, asCardName } from "../types/card-identity";
import { buildPoolData } from "../draft/pool/pool-data";
import { buildIdIndex } from "../data/cards-v2-database";
import type { CardData } from "../types/cards";
import type { RunPoolContext } from "../data/quest-content";

/**
 * A small hand-authored corpus for tests that drive the quest-start build path
 * (`buildDreamAvatarPackage`). It provides three real-ish decklists of twenty
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
 * The synthetic card id assigned to a corpus card name by
 * {@link buildTestCorpusCards} (`corpus-<cardNumber>`). The id-keyed decklist
 * corpus and the id index both key on these, so a generated pool resolves
 * through the collision-free id path exactly as production does.
 */
function idForName(name: string): string {
  const cardNumber = buildTestNameIndex().get(name);
  if (cardNumber === undefined) {
    throw new Error(`unknown test corpus card name: ${name}`);
  }
  return `corpus-${String(cardNumber)}`;
}

/**
 * Builds a {@link RunPoolContext} usable by `buildDreamAvatarPackage`. The
 * generated pool is keyed by the corpus card ids (`corpus-<cardNumber>`), all of
 * which resolve through the id index built from the same card records, so
 * `resolvePool` maps the pool onto card numbers through the collision-free id
 * path without merging same-name cards.
 */
export function makeTestPoolContext(
  allDreamsignPoolIds: string[] = ["dreamsign-a", "dreamsign-b"],
): RunPoolContext {
  const cards = buildTestCorpusCards();
  const cardDatabase = new Map<number, CardData>(
    cards.map((c) => [c.cardNumber, c]),
  );
  const decklistIds = TEST_DECKLISTS.map((deck) => deck.map(idForName));
  return {
    poolData: buildPoolData(cards, TEST_DECKLISTS, undefined, decklistIds),
    idIndex: buildIdIndex(cardDatabase),
    allDreamsignPoolIds,
    // This corpus has decklists but no draft records, so pin idf3 (which builds
    // from the decklist corpus) rather than inheriting the records-driven
    // default, which would throw on the empty record corpus.
    poolVariant: "idf3",
  };
}
