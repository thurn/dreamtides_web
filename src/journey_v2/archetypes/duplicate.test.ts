import { describe, expect, it } from "vitest";
import { applyMerchantPayloadToState } from "../encounter/resolveMerchantOffer";
import { merchantRng } from "../signals/rng";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { CardData } from "../../types/cards";
import type { DeckEntry } from "../../types/quest";
import type { MerchantContext } from "../types";
import { duplicateBuilder } from "./duplicate";

function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

function makeContext(input: {
  cards: readonly CardData[];
  deckEntries: readonly DeckEntry[];
  corpusCards?: Record<
    string,
    { quality: number; multiplicity?: number; df?: number }
  >;
}): MerchantContext {
  const questContent = makeMerchantTestContent({
    cards: input.cards,
    merchantCorpus: makeMerchantTestCorpus({ cards: input.corpusCards ?? {} }),
  });
  const questState = makeMerchantTestQuestState({ deck: [...input.deckEntries] });
  return buildMerchantContext({
    questState,
    questContent,
    site: makeMerchantTestSite(),
  });
}

// ---------------------------------------------------------------------------
// Bug-class: duplicate chooser candidates are deck entries, not pool cards
// ---------------------------------------------------------------------------

describe("duplicate — candidates are deck entries not pool cards", () => {
  it("all chooser candidates reference entryIds from the deck", () => {
    // Three non-starter deck cards with multiplicity >= duplicateMultiplicityMin (0.1)
    const cards = [
      makeMerchantTestCard({ id: uuid(1), cardNumber: 1 }),
      makeMerchantTestCard({ id: uuid(2), cardNumber: 2 }),
      makeMerchantTestCard({ id: uuid(3), cardNumber: 3 }),
    ];
    const entries = [
      makeMerchantTestDeckEntry({ entryId: "e1", cardNumber: 1 }),
      makeMerchantTestDeckEntry({ entryId: "e2", cardNumber: 2 }),
      makeMerchantTestDeckEntry({ entryId: "e3", cardNumber: 3 }),
    ];

    // Corpus: all three have multiplicity >= 0.1
    const corpusCards: Record<string, { quality: number; multiplicity: number; df: number }> = {
      [uuid(1)]: { quality: 0.5, multiplicity: 0.3, df: 10 },
      [uuid(2)]: { quality: 0.5, multiplicity: 0.2, df: 10 },
      [uuid(3)]: { quality: 0.5, multiplicity: 0.15, df: 10 },
    };

    const context = makeContext({ cards, deckEntries: entries, corpusCards });
    expect(duplicateBuilder.eligible(context)).toBe(true);

    const rng = merchantRng("duplicate-entries-test", "0");
    const offer = duplicateBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    // The offer must be either a direct offer (applyPayload) or a chooser
    const knownEntryIds = new Set(["e1", "e2", "e3"]);

    if (offer.applyPayload !== undefined) {
      // Direct offer
      expect(offer.applyPayload.kind).toBe("duplicate_deck_entry");
      if (offer.applyPayload.kind === "duplicate_deck_entry") {
        expect(knownEntryIds.has(offer.applyPayload.entryId)).toBe(true);
      }
    } else if (offer.choiceRequest !== undefined) {
      // Chooser
      expect(offer.choiceRequest.candidates.length).toBeGreaterThanOrEqual(1);
      expect(offer.choiceRequest.candidates.length).toBeLessThanOrEqual(3);
      for (const candidate of offer.choiceRequest.candidates) {
        expect(candidate.applyPayload.kind).toBe("duplicate_deck_entry");
        if (candidate.applyPayload.kind === "duplicate_deck_entry") {
          expect(knownEntryIds.has(candidate.applyPayload.entryId)).toBe(true);
        }
      }
    }
  });

  it("game objects reference deck cards (objectType === deckCard)", () => {
    const cards = [
      makeMerchantTestCard({ id: uuid(10), cardNumber: 10 }),
      makeMerchantTestCard({ id: uuid(11), cardNumber: 11 }),
    ];
    const entries = [
      makeMerchantTestDeckEntry({ entryId: "de1", cardNumber: 10 }),
      makeMerchantTestDeckEntry({ entryId: "de2", cardNumber: 11 }),
    ];
    const corpusCards = {
      [uuid(10)]: { quality: 0.7, multiplicity: 0.3, df: 10 },
      [uuid(11)]: { quality: 0.6, multiplicity: 0.2, df: 10 },
    };

    const context = makeContext({ cards, deckEntries: entries, corpusCards });
    const rng = merchantRng("duplicate-gameobjects-test", "0");
    const offer = duplicateBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    // For direct offer, game objects should be deck cards
    if (offer.applyPayload !== undefined) {
      expect(offer.gameObjects.length).toBeGreaterThan(0);
      for (const obj of offer.gameObjects) {
        expect(obj.objectType).toBe("deckCard");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bug-class: applied state gains one entry with the same cardNumber
// ---------------------------------------------------------------------------

describe("duplicate — applied state gains one entry with the same cardNumber", () => {
  it("accepting a direct offer adds exactly one entry with the same cardNumber", () => {
    const card = makeMerchantTestCard({ id: uuid(20), cardNumber: 20 });
    const entry = makeMerchantTestDeckEntry({ entryId: "orig", cardNumber: 20 });

    const corpusCards = {
      [uuid(20)]: { quality: 0.5, multiplicity: 0.3, df: 10 },
    };

    const questContent = makeMerchantTestContent({
      cards: [card],
      merchantCorpus: makeMerchantTestCorpus({ cards: corpusCards }),
    });
    const questState = makeMerchantTestQuestState({ deck: [entry] });
    const context = buildMerchantContext({
      questState,
      questContent,
      site: makeMerchantTestSite(),
    });

    expect(duplicateBuilder.eligible(context)).toBe(true);

    // Find a seed that gives a direct offer (only 1 candidate so always direct)
    const rng = merchantRng("duplicate-apply-test", "0");
    const offer = duplicateBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    // Single candidate => must be direct offer
    const payload = offer.applyPayload;
    expect(payload).toBeDefined();
    if (payload === undefined) return;

    expect(payload.kind).toBe("duplicate_deck_entry");

    const resultState = applyMerchantPayloadToState({ state: questState, questContent, payload });
    expect(resultState).not.toBeNull();
    if (resultState === null) return;

    // Deck gained one entry
    expect(resultState.deck.length).toBe(questState.deck.length + 1);

    // The new entry has the same cardNumber
    const newEntry = resultState.deck.find(
      (e) => e.entryId !== "orig",
    );
    expect(newEntry).toBeDefined();
    if (newEntry !== undefined) {
      expect(newEntry.cardNumber).toBe(20);
    }
  });

  it("accepting a chooser offer adds exactly one entry with the matching cardNumber", () => {
    // Three candidates => chooser
    const cards = [
      makeMerchantTestCard({ id: uuid(30), cardNumber: 30 }),
      makeMerchantTestCard({ id: uuid(31), cardNumber: 31 }),
      makeMerchantTestCard({ id: uuid(32), cardNumber: 32 }),
    ];
    const entries = [
      makeMerchantTestDeckEntry({ entryId: "c1", cardNumber: 30 }),
      makeMerchantTestDeckEntry({ entryId: "c2", cardNumber: 31 }),
      makeMerchantTestDeckEntry({ entryId: "c3", cardNumber: 32 }),
    ];
    const corpusCards = {
      [uuid(30)]: { quality: 0.7, multiplicity: 0.3, df: 10 },
      [uuid(31)]: { quality: 0.5, multiplicity: 0.2, df: 10 },
      [uuid(32)]: { quality: 0.4, multiplicity: 0.15, df: 10 },
    };

    const questContent = makeMerchantTestContent({
      cards,
      merchantCorpus: makeMerchantTestCorpus({ cards: corpusCards }),
    });
    const questState = makeMerchantTestQuestState({ deck: [...entries] });
    const context = buildMerchantContext({
      questState,
      questContent,
      site: makeMerchantTestSite(),
    });

    const rng = merchantRng("duplicate-chooser-apply-test", "0");
    const offer = duplicateBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    // With 3 eligible candidates, we may get a chooser
    let payload = offer.applyPayload;
    if (payload === undefined && offer.choiceRequest !== undefined) {
      // Pick the first candidate
      payload = offer.choiceRequest.candidates[0]?.applyPayload;
    }
    expect(payload).toBeDefined();
    if (payload === undefined) return;

    expect(payload.kind).toBe("duplicate_deck_entry");
    if (payload.kind !== "duplicate_deck_entry") return;

    const chosenCardNumber = payload.cardNumber;

    const resultState = applyMerchantPayloadToState({ state: questState, questContent, payload });
    expect(resultState).not.toBeNull();
    if (resultState === null) return;

    expect(resultState.deck.length).toBe(questState.deck.length + 1);

    // The duplicate has the same cardNumber as the chosen entry
    const existingEntryIds = new Set(entries.map((e) => e.entryId));
    const newEntries = resultState.deck.filter((e) => !existingEntryIds.has(e.entryId));
    expect(newEntries).toHaveLength(1);
    expect(newEntries[0].cardNumber).toBe(chosenCardNumber);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: duplicate eligibility requires multiplicity >= duplicateMultiplicityMin
// ---------------------------------------------------------------------------

describe("duplicate — eligibility", () => {
  it("is ineligible when no non-starter has multiplicity >= 0.1", () => {
    const cards = [
      makeMerchantTestCard({ id: uuid(40), cardNumber: 40 }),
      makeMerchantTestCard({ id: uuid(41), cardNumber: 41 }),
    ];
    const entries = cards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `e${String(i)}`, cardNumber: c.cardNumber }),
    );
    // Corpus: low multiplicity (< 0.1)
    const corpusCards = {
      [uuid(40)]: { quality: 0.5, multiplicity: 0.05, df: 10 },
      [uuid(41)]: { quality: 0.5, multiplicity: 0.08, df: 10 },
    };
    const context = makeContext({ cards, deckEntries: entries, corpusCards });
    expect(duplicateBuilder.eligible(context)).toBe(false);
  });

  it("is ineligible when all candidates are starters", () => {
    const cards = [
      makeMerchantTestCard({ id: uuid(50), cardNumber: 50, isStarter: true }),
      makeMerchantTestCard({ id: uuid(51), cardNumber: 51, isStarter: true }),
    ];
    const entries = cards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `s${String(i)}`, cardNumber: c.cardNumber }),
    );
    const corpusCards = {
      [uuid(50)]: { quality: 0.5, multiplicity: 0.3, df: 10 },
      [uuid(51)]: { quality: 0.5, multiplicity: 0.3, df: 10 },
    };
    const context = makeContext({ cards, deckEntries: entries, corpusCards });
    expect(duplicateBuilder.eligible(context)).toBe(false);
  });

  it("is eligible when at least one non-starter has multiplicity >= 0.1", () => {
    const card = makeMerchantTestCard({ id: uuid(60), cardNumber: 60 });
    const entry = makeMerchantTestDeckEntry({ entryId: "e60", cardNumber: 60 });
    const corpusCards = {
      [uuid(60)]: { quality: 0.5, multiplicity: 0.1, df: 10 },
    };
    const context = makeContext({
      cards: [card],
      deckEntries: [entry],
      corpusCards,
    });
    expect(duplicateBuilder.eligible(context)).toBe(true);
  });

  it("starters are excluded even if they have high multiplicity", () => {
    const starterCard = makeMerchantTestCard({
      id: uuid(70),
      cardNumber: 70,
      isStarter: true,
    });
    const nonStarterCard = makeMerchantTestCard({
      id: uuid(71),
      cardNumber: 71,
      isStarter: false,
    });
    const entries = [
      makeMerchantTestDeckEntry({ entryId: "s70", cardNumber: 70 }),
      makeMerchantTestDeckEntry({ entryId: "n71", cardNumber: 71 }),
    ];
    const corpusCards = {
      [uuid(70)]: { quality: 0.9, multiplicity: 0.8, df: 10 }, // starter, high mult
      [uuid(71)]: { quality: 0.1, multiplicity: 0.05, df: 10 }, // non-starter, low mult
    };
    const context = makeContext({
      cards: [starterCard, nonStarterCard],
      deckEntries: entries,
      corpusCards,
    });
    // Ineligible because the only non-starter has mult < 0.1
    expect(duplicateBuilder.eligible(context)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: single candidate renders as a direct offer (not a chooser)
// ---------------------------------------------------------------------------

describe("duplicate — single candidate is direct offer", () => {
  it("renders as a direct offer (applyPayload) when only one candidate", () => {
    const card = makeMerchantTestCard({ id: uuid(80), cardNumber: 80 });
    const entry = makeMerchantTestDeckEntry({ entryId: "e80", cardNumber: 80 });
    const corpusCards = {
      [uuid(80)]: { quality: 0.5, multiplicity: 0.3, df: 10 },
    };
    const context = makeContext({
      cards: [card],
      deckEntries: [entry],
      corpusCards,
    });

    const rng = merchantRng("duplicate-single-test", "0");
    const offer = duplicateBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    // Single candidate → direct offer
    expect(offer.applyPayload).toBeDefined();
    expect(offer.choiceRequest).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bug-class: chooser has at most 3 candidates, all distinct
// ---------------------------------------------------------------------------

describe("duplicate — chooser size invariant", () => {
  it("chooser has <= 3 distinct candidates", () => {
    // 6 candidates all eligible
    const cards = Array.from({ length: 6 }, (_, i) =>
      makeMerchantTestCard({ id: uuid(90 + i), cardNumber: 90 + i }),
    );
    const entries = cards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `big${String(i)}`, cardNumber: c.cardNumber }),
    );
    const corpusCards: Record<string, { quality: number; multiplicity: number; df: number }> = {};
    cards.forEach((c) => {
      corpusCards[c.id] = { quality: 0.5, multiplicity: 0.3, df: 10 };
    });

    const context = makeContext({ cards, deckEntries: entries, corpusCards });
    expect(duplicateBuilder.eligible(context)).toBe(true);

    for (let seed = 0; seed < 10; seed += 1) {
      const rng = merchantRng("duplicate-chooser-size-test", String(seed));
      const offer = duplicateBuilder.build(context, rng);
      if (offer === null) continue;

      if (offer.choiceRequest !== undefined) {
        expect(offer.choiceRequest.candidates.length).toBeLessThanOrEqual(3);
        // All distinct choiceIds
        const ids = offer.choiceRequest.candidates.map((c) => c.choiceId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});
