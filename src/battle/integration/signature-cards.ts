import type { CardData } from "../../types/cards";
import type { Rarity } from "../../types/cards";
import { tokenizeRulesText, type TextSegment } from "../../cumulus/components/card/card-text";

/**
 * A card chosen to represent an opponent Dreamcaller's ability before battle.
 * Carried on {@link BattleEnemyDescriptor} so the Battle Start screen can show
 * the three cards that best embody what the opponent is trying to do.
 *
 * Identity is the stable cards_v2 UUID (`cardId`); `cardNumber` is kept as the
 * card-database key so the screen can resolve the full {@link CardData} for
 * rendering without re-deriving it. `name` is a convenience for logs and labels
 * — never use it as a key, card names are not unique.
 */
export interface SignatureCardSelection {
  cardId: string;
  cardNumber: number;
  name: string;
  /**
   * The glossary keywords this card shares with the Dreamcaller's ability text,
   * in canonical form (e.g. `"Abandon"`, `"Reclaim"`). Empty when the card was
   * chosen purely on the rarity / cost tie-breakers (no shared mechanic). Kept
   * for the reconstruction log so a production pick can be explained.
   */
  matchedTerms: readonly string[];
  /** Total representativeness score (sum of shared-keyword idf weights). */
  score: number;
}

/**
 * Walks a parsed rules-text segment tree and collects the canonical glossary
 * term of every `term` segment, descending into `nobreak` groups (where the
 * tokenizer nests trigger / fast keyword runs). Returns the distinct set of
 * terms the text references, which is how a card or ability is reduced to the
 * controlled mechanical vocabulary it speaks.
 */
function collectGlossaryTerms(segments: readonly TextSegment[], into: Set<string>): void {
  for (const segment of segments) {
    if (segment.kind === "term") {
      into.add(segment.entry.term);
    } else if (segment.kind === "nobreak") {
      collectGlossaryTerms(segment.segments, into);
    }
  }
}

/**
 * The distinct set of glossary keywords referenced by a run of rules text,
 * resolved through the same tokenizer the card UI uses so the matching stays in
 * lock-step with what a player actually sees emphasized on a card.
 */
export function glossaryTermsIn(text: string): Set<string> {
  const terms = new Set<string>();
  collectGlossaryTerms(tokenizeRulesText(text), terms);
  return terms;
}

/** Higher is splashier; used only as a tie-breaker after the keyword score. */
function rarityRank(rarity: Rarity | undefined): number {
  switch (rarity) {
    case "Special":
      return 1;
    default:
      return 0;
  }
}

/**
 * Character-over-event preference, used as a tie-breaker after the keyword
 * score. When two cards are equally (or un-)representative of the ability, the
 * character is surfaced ahead of the event, so the zero-score fallback shows a
 * threat the opponent fields rather than a stray removal spell.
 */
function cardTypeRank(cardType: CardData["cardType"]): number {
  return cardType === "Character" ? 1 : 0;
}

/**
 * Selects the cards from an opponent's deck that are most representative of its
 * Dreamcaller's ability — a small, deterministic "signature card" algorithm.
 *
 * The intent: an opponent's ability names a mechanic (abandon, reclaim,
 * materialize, …), and the cards that best embody the opponent are the ones
 * that lean into that same mechanic. We measure this through the shared
 * controlled vocabulary (the {@link GLOSSARY}):
 *
 *   1. Reduce the Dreamcaller's ability text to its set of glossary keywords.
 *   2. Reduce each candidate card's rules text to its glossary keywords.
 *   3. Weight each keyword by its inverse document frequency across the deck, so
 *      a keyword that defines the deck (held by few cards) counts for more than
 *      one every card carries. A card's score is the summed idf of the keywords
 *      it shares with the ability.
 *
 * Cards are then ranked by score, breaking ties toward a character over an
 * event (so the fallback is a threat rather than a stray removal spell), then
 * toward the deck's marquee cards (rarity, then energy cost, then spark), and
 * finally by `cardId` for a stable, reproducible result. When an ability
 * references no glossary keyword (or shares none with the deck) every score is
 * zero and the tie-breakers alone surface the deck's biggest threats — a
 * reasonable "here is what they bring" fallback.
 *
 * Legendary cards are never eligible — the signature set is the deck's
 * representative cards, not its bombs. Non-starter cards are preferred; starters
 * are eligible only to fill the set when there are too few non-starter cards
 * (an opponent whose battle deck is the AI's all-starter deck still gets a
 * signature set rather than an empty one).
 */
export function selectSignatureCards(args: {
  /** The opponent Dreamcaller's ability text (`renderedText`). */
  abilityText: string;
  /** The opponent's deck cards. Deduplicated and filtered internally. */
  candidates: readonly CardData[];
  /** How many signature cards to return (default 3). */
  count?: number;
}): SignatureCardSelection[] {
  const { abilityText, candidates, count = 3 } = args;

  // Distinct candidates keyed by stable UUID (a deck can hold the same card more
  // than once; the signature set should not), partitioned so non-starter cards
  // can be preferred. Legendary cards are excluded outright.
  const distinctNonStarter: CardData[] = [];
  const distinctStarter: CardData[] = [];
  const seen = new Set<string>();
  for (const card of candidates) {
    if (card.rarity === "Legendary") continue;
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    if (card.isStarter) {
      distinctStarter.push(card);
    } else {
      distinctNonStarter.push(card);
    }
  }
  // Prefer non-starter cards; dip into starters only to reach `count`.
  const distinct =
    distinctNonStarter.length >= count
      ? distinctNonStarter
      : [...distinctNonStarter, ...distinctStarter];

  const abilityTerms = glossaryTermsIn(abilityText);

  // Per-card glossary terms, plus the document frequency of each term across the
  // candidate deck for the idf weighting.
  const cardTermSets = new Map<string, Set<string>>();
  const documentFrequency = new Map<string, number>();
  for (const card of distinct) {
    const terms = glossaryTermsIn(card.renderedText);
    cardTermSets.set(card.id, terms);
    for (const term of terms) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const deckSize = distinct.length;
  const idf = (term: string): number => {
    const df = documentFrequency.get(term) ?? 0;
    // Smoothed idf, always positive: a term in every card still contributes a
    // little, a term in one card contributes the most.
    return Math.log((deckSize + 1) / (df + 1)) + 1;
  };

  const scored = distinct.map((card) => {
    const cardTerms = cardTermSets.get(card.id) ?? new Set<string>();
    const matchedTerms: string[] = [];
    let score = 0;
    for (const term of abilityTerms) {
      if (cardTerms.has(term)) {
        matchedTerms.push(term);
        score += idf(term);
      }
    }
    return { card, matchedTerms, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const cardType = cardTypeRank(b.card.cardType) - cardTypeRank(a.card.cardType);
    if (cardType !== 0) return cardType;
    const rarity = rarityRank(b.card.rarity) - rarityRank(a.card.rarity);
    if (rarity !== 0) return rarity;
    const energy = (b.card.energyCost ?? 0) - (a.card.energyCost ?? 0);
    if (energy !== 0) return energy;
    const spark = (b.card.spark ?? 0) - (a.card.spark ?? 0);
    if (spark !== 0) return spark;
    // Final deterministic tie-break so the same deck always yields the same set.
    return a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0;
  });

  return scored.slice(0, count).map((entry) => ({
    cardId: entry.card.id,
    cardNumber: entry.card.cardNumber,
    name: entry.card.name,
    matchedTerms: entry.matchedTerms,
    score: entry.score,
  }));
}
