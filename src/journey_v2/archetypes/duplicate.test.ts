import { describe, expect, it } from "vitest";
import type { FitModel } from "../../draft/replay/fit-model";
import { applyMerchantPayloadToState } from "../encounter/resolveMerchantOffer";
import { merchantRng } from "../signals/rng";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestFitModel,
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

/**
 * A fit model in which every named card co-occurs with every other named card
 * at a single uniform strength, so leave-one-out fit is flat across the deck
 * and the duplicate signal is driven by corpus quality. Specific tests override
 * the coocNorm rows to make one entry the most synergistic.
 */
function makeFlatFitModel(cards: readonly CardData[], cooc = 0.5): FitModel {
  const model = makeMerchantTestFitModel();
  const numberToId = new Map<number, string>();
  const idIndex = new Map<string, number>();
  const idf = new Map<string, number>();
  const coocNorm = new Map<string, Map<string, number>>();
  // The fit model keys on an opaque card token; these synthetic tests use the
  // card name as that token, kept consistent across every model map.
  for (const card of cards) {
    numberToId.set(card.cardNumber, card.name);
    idIndex.set(card.name, card.cardNumber);
    idf.set(card.name, 1);
  }
  for (const a of cards) {
    const row = new Map<string, number>();
    for (const b of cards) {
      if (a.name === b.name) continue;
      row.set(b.name, cooc);
    }
    coocNorm.set(a.name, row);
  }
  return { ...model, numberToId, idIndex, idf, coocNorm };
}

function makeContext(input: {
  cards: readonly CardData[];
  deckEntries: readonly DeckEntry[];
  corpusCards?: Record<string, { quality: number; df?: number }>;
  fitModel?: FitModel;
}): MerchantContext {
  const questContent = makeMerchantTestContent({
    cards: input.cards,
    fitModel: input.fitModel,
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
    const corpusCards = {
      [uuid(1)]: { quality: 0.5, df: 10 },
      [uuid(2)]: { quality: 0.5, df: 10 },
      [uuid(3)]: { quality: 0.5, df: 10 },
    };

    const context = makeContext({
      cards,
      deckEntries: entries,
      corpusCards,
      fitModel: makeFlatFitModel(cards),
    });
    expect(duplicateBuilder.eligible(context)).toBe(true);

    const rng = merchantRng("duplicate-entries-test", "0");
    const offer = duplicateBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    const knownEntryIds = new Set(["e1", "e2", "e3"]);

    if (offer.applyPayload !== undefined) {
      expect(offer.applyPayload.kind).toBe("duplicate_deck_entry");
      if (offer.applyPayload.kind === "duplicate_deck_entry") {
        expect(knownEntryIds.has(offer.applyPayload.entryId)).toBe(true);
      }
    } else if (offer.choiceRequest !== undefined) {
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
      [uuid(10)]: { quality: 0.7, df: 10 },
      [uuid(11)]: { quality: 0.6, df: 10 },
    };

    const context = makeContext({
      cards,
      deckEntries: entries,
      corpusCards,
      fitModel: makeFlatFitModel(cards),
    });
    const rng = merchantRng("duplicate-gameobjects-test", "0");
    const offer = duplicateBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    if (offer.applyPayload !== undefined) {
      expect(offer.gameObjects.length).toBeGreaterThan(0);
      for (const obj of offer.gameObjects) {
        expect(obj.objectType).toBe("deckCard");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bug-class: signal surfaces the strongest, most synergistic deck card
// ---------------------------------------------------------------------------

describe("duplicate — signal favors the strongest, most synergistic card", () => {
  it("the highest-quality, best-fitting entry enters the offer band far more than a weak one", () => {
    // 16 non-starter deck cards so the band (top 25%, min 5) genuinely filters.
    // Card 1 (entry e1) is both the highest quality AND the most synergistic
    // (every other card co-occurs strongly with it). Card 16 (entry e16) is the
    // weakest on both axes. e1 should appear in the offered set across seeds far
    // more often than the weak e16, which the band should usually exclude.
    const cards = Array.from({ length: 16 }, (_, i) =>
      makeMerchantTestCard({ id: uuid(i + 1), cardNumber: i + 1 }),
    );
    const entries = cards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `e${String(i + 1)}`, cardNumber: c.cardNumber }),
    );

    // Quality: card 1 best, monotonically decreasing to card 16 worst.
    const corpusCards: Record<string, { quality: number; df: number }> = {};
    cards.forEach((c, i) => {
      corpusCards[c.id] = { quality: (cards.length - i) / cards.length, df: 10 };
    });

    // Fit: every other card co-occurs strongly with card 1, weakly with each
    // other, so card 1's leave-one-out fit is the highest in the deck.
    const model = makeFlatFitModel(cards, 0.1);
    const card1Name = cards[0].name;
    for (const c of cards) {
      const row = model.coocNorm.get(c.name);
      if (row === undefined || c.name === card1Name) continue;
      row.set(card1Name, 0.9);
    }

    const context = makeContext({
      cards,
      deckEntries: entries,
      corpusCards,
      fitModel: model,
    });

    const appearances = new Map<string, number>();
    for (let seed = 0; seed < 120; seed += 1) {
      const offer = duplicateBuilder.build(
        context,
        merchantRng("dup-signal", String(seed)),
      );
      if (offer === null) continue;
      const ids: string[] = [];
      if (offer.applyPayload?.kind === "duplicate_deck_entry") {
        ids.push(offer.applyPayload.entryId);
      }
      for (const c of offer.choiceRequest?.candidates ?? []) {
        if (c.applyPayload.kind === "duplicate_deck_entry") ids.push(c.applyPayload.entryId);
      }
      for (const id of ids) appearances.set(id, (appearances.get(id) ?? 0) + 1);
    }

    const e1 = appearances.get("e1") ?? 0;
    const e16 = appearances.get("e16") ?? 0;
    expect(e1).toBeGreaterThan(e16);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: applied state gains one entry with the same cardNumber
// ---------------------------------------------------------------------------

describe("duplicate — applied state gains one entry with the same cardNumber", () => {
  it("accepting a direct offer adds exactly one entry with the same cardNumber", () => {
    const card = makeMerchantTestCard({ id: uuid(20), cardNumber: 20 });
    const entry = makeMerchantTestDeckEntry({ entryId: "orig", cardNumber: 20 });
    const corpusCards = { [uuid(20)]: { quality: 0.5, df: 10 } };

    const questContent = makeMerchantTestContent({
      cards: [card],
      fitModel: makeFlatFitModel([card]),
      merchantCorpus: makeMerchantTestCorpus({ cards: corpusCards }),
    });
    const questState = makeMerchantTestQuestState({ deck: [entry] });
    const context = buildMerchantContext({
      questState,
      questContent,
      site: makeMerchantTestSite(),
    });

    expect(duplicateBuilder.eligible(context)).toBe(true);

    const rng = merchantRng("duplicate-apply-test", "0");
    const offer = duplicateBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    const payload = offer.applyPayload;
    expect(payload).toBeDefined();
    if (payload === undefined) return;
    expect(payload.kind).toBe("duplicate_deck_entry");

    const resultState = applyMerchantPayloadToState({ state: questState, questContent, payload });
    expect(resultState).not.toBeNull();
    if (resultState === null) return;

    expect(resultState.deck.length).toBe(questState.deck.length + 1);
    const newEntry = resultState.deck.find((e) => e.entryId !== "orig");
    expect(newEntry).toBeDefined();
    if (newEntry !== undefined) {
      expect(newEntry.cardNumber).toBe(20);
    }
  });

  it("accepting a chooser offer adds exactly one entry with the matching cardNumber", () => {
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
      [uuid(30)]: { quality: 0.7, df: 10 },
      [uuid(31)]: { quality: 0.5, df: 10 },
      [uuid(32)]: { quality: 0.4, df: 10 },
    };

    const questContent = makeMerchantTestContent({
      cards,
      fitModel: makeFlatFitModel(cards),
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

    let payload = offer.applyPayload;
    if (payload === undefined && offer.choiceRequest !== undefined) {
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
    const existingEntryIds = new Set(entries.map((e) => e.entryId));
    const newEntries = resultState.deck.filter((e) => !existingEntryIds.has(e.entryId));
    expect(newEntries).toHaveLength(1);
    expect(newEntries[0].cardNumber).toBe(chosenCardNumber);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: eligible whenever the deck has a non-starter entry (no multiplicity gate)
// ---------------------------------------------------------------------------

describe("duplicate — eligibility", () => {
  it("is eligible for a normal deck of non-starter cards with no multiplicity data", () => {
    // The singleton corpus carries no multiplicity signal; duplicate must still
    // be live for an ordinary deck.
    const cards = [
      makeMerchantTestCard({ id: uuid(40), cardNumber: 40 }),
      makeMerchantTestCard({ id: uuid(41), cardNumber: 41 }),
    ];
    const entries = cards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `e${String(i)}`, cardNumber: c.cardNumber }),
    );
    const corpusCards = {
      [uuid(40)]: { quality: 0.5, df: 10 },
      [uuid(41)]: { quality: 0.5, df: 10 },
    };
    const context = makeContext({
      cards,
      deckEntries: entries,
      corpusCards,
      fitModel: makeFlatFitModel(cards),
    });
    expect(duplicateBuilder.eligible(context)).toBe(true);
  });

  it("is ineligible when the deck holds no non-starter entries", () => {
    const cards = [
      makeMerchantTestCard({ id: uuid(50), cardNumber: 50, isStarter: true }),
      makeMerchantTestCard({ id: uuid(51), cardNumber: 51, isStarter: true }),
    ];
    const entries = cards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `s${String(i)}`, cardNumber: c.cardNumber }),
    );
    const corpusCards = {
      [uuid(50)]: { quality: 0.5, df: 10 },
      [uuid(51)]: { quality: 0.5, df: 10 },
    };
    const context = makeContext({
      cards,
      deckEntries: entries,
      corpusCards,
      fitModel: makeFlatFitModel(cards),
    });
    expect(duplicateBuilder.eligible(context)).toBe(false);
  });

  it("starters are excluded from candidates", () => {
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
      [uuid(70)]: { quality: 0.9, df: 10 },
      [uuid(71)]: { quality: 0.1, df: 10 },
    };
    const context = makeContext({
      cards: [starterCard, nonStarterCard],
      deckEntries: entries,
      corpusCards,
      fitModel: makeFlatFitModel([starterCard, nonStarterCard]),
    });
    // Eligible (the one non-starter is a candidate); offers only ever target it.
    expect(duplicateBuilder.eligible(context)).toBe(true);
    for (let seed = 0; seed < 10; seed += 1) {
      const offer = duplicateBuilder.build(context, merchantRng("starter-excl", String(seed)));
      if (offer === null) continue;
      if (offer.applyPayload?.kind === "duplicate_deck_entry") {
        expect(offer.applyPayload.entryId).toBe("n71");
      }
      for (const c of offer.choiceRequest?.candidates ?? []) {
        if (c.applyPayload.kind === "duplicate_deck_entry") {
          expect(c.applyPayload.entryId).toBe("n71");
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bug-class: single candidate renders as a direct offer (not a chooser)
// ---------------------------------------------------------------------------

describe("duplicate — single candidate is direct offer", () => {
  it("renders as a direct offer (applyPayload) when only one candidate", () => {
    const card = makeMerchantTestCard({ id: uuid(80), cardNumber: 80 });
    const entry = makeMerchantTestDeckEntry({ entryId: "e80", cardNumber: 80 });
    const corpusCards = { [uuid(80)]: { quality: 0.5, df: 10 } };
    const context = makeContext({
      cards: [card],
      deckEntries: [entry],
      corpusCards,
      fitModel: makeFlatFitModel([card]),
    });

    const rng = merchantRng("duplicate-single-test", "0");
    const offer = duplicateBuilder.build(context, rng);
    expect(offer).not.toBeNull();
    if (offer === null) return;

    expect(offer.applyPayload).toBeDefined();
    expect(offer.choiceRequest).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bug-class: chooser has at most 3 candidates, all distinct
// ---------------------------------------------------------------------------

describe("duplicate — chooser size invariant", () => {
  it("chooser has <= 3 distinct candidates", () => {
    const cards = Array.from({ length: 6 }, (_, i) =>
      makeMerchantTestCard({ id: uuid(90 + i), cardNumber: 90 + i }),
    );
    const entries = cards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `big${String(i)}`, cardNumber: c.cardNumber }),
    );
    const corpusCards: Record<string, { quality: number; df: number }> = {};
    cards.forEach((c) => {
      corpusCards[c.id] = { quality: 0.5, df: 10 };
    });

    const context = makeContext({
      cards,
      deckEntries: entries,
      corpusCards,
      fitModel: makeFlatFitModel(cards),
    });
    expect(duplicateBuilder.eligible(context)).toBe(true);

    for (let seed = 0; seed < 10; seed += 1) {
      const rng = merchantRng("duplicate-chooser-size-test", String(seed));
      const offer = duplicateBuilder.build(context, rng);
      if (offer === null) continue;

      if (offer.choiceRequest !== undefined) {
        expect(offer.choiceRequest.candidates.length).toBeLessThanOrEqual(3);
        const ids = offer.choiceRequest.candidates.map((c) => c.choiceId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});
