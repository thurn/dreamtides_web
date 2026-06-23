import { describe, expect, it } from "vitest";

import type { KnownGoodDecklist } from "../../data/quest-content";
import type {
  AffiliationContent,
  DreamcallerContent,
} from "../../types/content";
import type { CardData } from "../../types/cards";

import { buildCorpusOpponentDeck } from "./corpus-opponent-deck";

// ---------------------------------------------------------------------------
// Synthetic fixtures
//
// Identity is ALWAYS the lowercased UUID. Card numbers are display-only. We
// deliberately give two distinct cards the SAME display name to prove the
// algorithm keys on the UUID, never on the name.
// ---------------------------------------------------------------------------

function makeCard(uuid: string, cardNumber: number, name: string): CardData {
  return {
    id: uuid,
    cardNumber,
    name,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
  } as CardData;
}

function makeDecklist(
  id: string,
  mainboardIds: string[],
  name = `deck ${id}`,
): KnownGoodDecklist {
  return {
    id,
    draftId: `draft-${id}`,
    seat: 0,
    name,
    mainboardIds,
  };
}

function makeDreamcaller(
  id: string,
  signatureCardIds: string[],
): DreamcallerContent {
  return {
    id,
    name: `dreamcaller ${id}`,
    title: "t",
    renderedText: "",
    imageNumber: "1",
    startingEssence: 200,
    signatureCardIds,
  };
}

function makeAffiliation(
  id: string,
  signatureCards: string[],
): AffiliationContent {
  return {
    id,
    name: `affiliation ${id}`,
    signatureCards,
    weightStrength: 1,
    opponentBiasStrength: 1,
  };
}

function cardDb(cards: CardData[]): ReadonlyMap<number, CardData> {
  return new Map(cards.map((c) => [c.cardNumber, c]));
}

// A pool of distinct cards, all distinct UUIDs and card numbers.
const C = {
  a: makeCard("aaaaaaaa-0000-0000-0000-000000000001", 1, "Alpha"),
  b: makeCard("bbbbbbbb-0000-0000-0000-000000000002", 2, "Beta"),
  c: makeCard("cccccccc-0000-0000-0000-000000000003", 3, "Gamma"),
  d: makeCard("dddddddd-0000-0000-0000-000000000004", 4, "Delta"),
  e: makeCard("eeeeeeee-0000-0000-0000-000000000005", 5, "Epsilon"),
  f: makeCard("ffffffff-0000-0000-0000-000000000006", 6, "Zeta"),
  g: makeCard("11111111-0000-0000-0000-000000000007", 7, "Eta"),
  h: makeCard("22222222-0000-0000-0000-000000000008", 8, "Theta"),
};

const ALL_CARDS = Object.values(C);

const baseArgs = {
  dreamsignSignatures: undefined,
  dreamsignTemplates: [],
  completionLevel: 0,
  layerCount: 0,
};

describe("buildCorpusOpponentDeck Stage A (selection)", () => {
  it("returns null when there are no known-good decklists", () => {
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamcaller: makeDreamcaller("dc", [C.a.id]),
      knownGoodDecklists: [],
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 1,
    });
    expect(result).toBeNull();
  });

  it("is deterministic and pure for identical args including poolSeed", () => {
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id, C.c.id]),
      makeDecklist("d2", [C.a.id, C.d.id, C.e.id]),
      makeDecklist("d3", [C.a.id, C.f.id, C.g.id]),
    ];
    const args = {
      ...baseArgs,
      opponentDreamcaller: makeDreamcaller("dc", [C.a.id]),
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 42,
    };
    const first = buildCorpusOpponentDeck(args);
    const second = buildCorpusOpponentDeck(args);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.source.id).toBe(second?.source.id);
    // Calling did not mutate the input arrays.
    expect(decks).toHaveLength(3);
  });

  it("produces selection variety across many seeds when ≥2 candidates exist", () => {
    // Three decks all sharing the signature card C.a (all candidates), but
    // with otherwise distinct contents so their fits differ only slightly.
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id, C.c.id]),
      makeDecklist("d2", [C.a.id, C.b.id, C.d.id]),
      makeDecklist("d3", [C.a.id, C.c.id, C.e.id]),
    ];
    const selected = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamcaller: makeDreamcaller("dc", [C.a.id]),
        knownGoodDecklists: decks,
        affiliation: null,
        cardDatabase: cardDb(ALL_CARDS),
        poolSeed: seed,
      });
      if (result) selected.add(result.source.id);
    }
    expect(selected.size).toBeGreaterThan(1);
  });

  it("gates candidates on shared signature cards (UUID overlap)", () => {
    // d1 + d2 share signature C.a; d3 shares no signature card.
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id, C.c.id]),
      makeDecklist("d2", [C.a.id, C.d.id, C.e.id]),
      makeDecklist("d3", [C.f.id, C.g.id, C.h.id]),
    ];
    const dreamcaller = makeDreamcaller("dc", [C.a.id]);
    const everSelected = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamcaller: dreamcaller,
        knownGoodDecklists: decks,
        affiliation: null,
        cardDatabase: cardDb(ALL_CARDS),
        poolSeed: seed,
      });
      expect(result).not.toBeNull();
      // Every member of topK must share ≥1 signature card.
      for (const member of result!.topK) {
        const deck = decks.find((d) => d.id === member.id)!;
        expect(deck.mainboardIds).toContain(C.a.id);
      }
      if (result) everSelected.add(result.source.id);
    }
    // The non-candidate deck is never selected.
    expect(everSelected.has("d3")).toBe(false);
    expect(everSelected.size).toBeGreaterThan(0);
  });

  it("treats signature fit as primary; a single high affiliationFit deck does not overtake a much-higher signatureFit deck (λ=0.25)", () => {
    // Build so the signatureFit gap between dHigh and dLow exceeds 0.25.
    // dHigh shares two rare signature cards; dLow shares one common one.
    // Affiliation probe targets dLow's contents to boost its affiliationFit.
    const sigHigh = [C.a.id, C.b.id];
    const decks = [
      // dHigh: contains BOTH signature cards (high signatureFit), nothing else.
      makeDecklist("dHigh", [C.a.id, C.b.id]),
      // dLow: contains only ONE signature card plus affiliation-aligned cards.
      makeDecklist("dLow", [C.a.id, C.d.id, C.e.id, C.f.id]),
      // Filler decks so idf has spread and dHigh's sig cards are rare.
      makeDecklist("f1", [C.d.id, C.e.id, C.f.id]),
      makeDecklist("f2", [C.d.id, C.e.id, C.g.id]),
      makeDecklist("f3", [C.f.id, C.g.id, C.h.id]),
    ];
    // Affiliation aligned with dLow's filler cards to inflate its affinity.
    const affiliation = makeAffiliation("aff", [C.d.id, C.e.id, C.f.id]);
    const everSelected = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamcaller: makeDreamcaller("dc", sigHigh),
        knownGoodDecklists: decks,
        affiliation,
        cardDatabase: cardDb(ALL_CARDS),
        poolSeed: seed,
      });
      expect(result).not.toBeNull();
      if (result) everSelected.add(result.source.id);
    }
    // dHigh's signatureFit lead exceeds the max affiliation contribution (0.25),
    // so dLow must never overtake it: dHigh is always the top-ranked candidate.
    // Across seeds we sample the window, but dHigh must be selectable and dLow
    // must not strictly dominate — verify dHigh's combined beats dLow's.
    const probe = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamcaller: makeDreamcaller("dc", sigHigh),
      knownGoodDecklists: decks,
      affiliation,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    })!;
    const high = probe.topK.find((t) => t.id === "dHigh");
    const low = probe.topK.find((t) => t.id === "dLow");
    expect(high).toBeDefined();
    expect(low).toBeDefined();
    expect(high!.combined).toBeGreaterThan(low!.combined);
    // Sanity: at least dHigh and dLow are candidates that get selected.
    expect(everSelected.has("dHigh")).toBe(true);
  });

  it("falls back to all decks ranked by affiliationFit when the Dreamcaller has no signature cards", () => {
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id]),
      makeDecklist("d2", [C.c.id, C.d.id]),
      makeDecklist("d3", [C.e.id, C.f.id]),
    ];
    // Affiliation strongly aligned with d1's cards.
    const affiliation = makeAffiliation("aff", [C.a.id, C.b.id]);
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamcaller: makeDreamcaller("dc", []),
      knownGoodDecklists: decks,
      affiliation,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    });
    expect(result).not.toBeNull();
    // Candidate set = all decks (signature-less fallback).
    expect(result!.candidateCount).toBe(3);
    // signatureFit must be 0 since there is no signature probe.
    expect(result!.signatureFit).toBe(0);
    // The highest-affiliationFit deck (d1) ranks first.
    expect(result!.topK[0]?.id).toBe("d1");
  });

  it("handles a null Dreamcaller as a signature-less build", () => {
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id]),
      makeDecklist("d2", [C.c.id, C.d.id]),
    ];
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamcaller: null,
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.candidateCount).toBe(2);
    expect(result!.signatureFit).toBe(0);
  });

  it("produces 0 affiliationFit and no NaN/Infinity when affiliation is null (neutral dreamscape)", () => {
    const decks = [
      makeDecklist("d1", [C.a.id, C.b.id, C.c.id]),
      makeDecklist("d2", [C.a.id, C.d.id, C.e.id]),
    ];
    for (let seed = 0; seed < 20; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamcaller: makeDreamcaller("dc", [C.a.id]),
        knownGoodDecklists: decks,
        affiliation: null,
        cardDatabase: cardDb(ALL_CARDS),
        poolSeed: seed,
      });
      expect(result).not.toBeNull();
      expect(result!.affiliationFit).toBe(0);
      expect(Number.isFinite(result!.signatureFit)).toBe(true);
      expect(Number.isFinite(result!.combined)).toBe(true);
      for (const member of result!.topK) {
        expect(Number.isFinite(member.combined)).toBe(true);
      }
    }
  });

  it("sets selection-only return invariants (finalCards = baseCards, empty mods, dreamsign null, abilityActive true)", () => {
    const decks = [makeDecklist("d1", [C.a.id, C.b.id, C.c.id])];
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamcaller: makeDreamcaller("dc", [C.a.id]),
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.finalCards).toEqual(result!.baseCards);
    expect(result!.modifications.legendariesRemoved).toEqual([]);
    expect(result!.modifications.legendaryReplacements).toEqual([]);
    expect(result!.modifications.cardsCut).toEqual([]);
    expect(result!.modifications.startersAdded).toEqual([]);
    expect(result!.dreamsign).toBeNull();
    expect(result!.abilityActive).toBe(true);
  });

  it("dedups baseCards by UUID and resolves cards via the database", () => {
    // A decklist that lists the same UUID twice (defensive dedup).
    const decks = [makeDecklist("d1", [C.a.id, C.a.id, C.b.id])];
    const result = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamcaller: makeDreamcaller("dc", [C.a.id]),
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: cardDb(ALL_CARDS),
      poolSeed: 0,
    });
    expect(result).not.toBeNull();
    const ids = result!.baseCards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // distinct
    expect(ids).toContain(C.a.id);
    expect(ids).toContain(C.b.id);
    expect(ids).toHaveLength(2);
  });

  it("keys candidacy, fit, and selection on the UUID even when two cards share a display name (load-bearing)", () => {
    // Two DISTINCT cards share the display name "Twin". One is the signature
    // card (sigTwin); the other (decoyTwin) is NOT a signature.
    const sigTwin = makeCard(
      "99999999-0000-0000-0000-00000000aaaa",
      101,
      "Twin",
    );
    const decoyTwin = makeCard(
      "88888888-0000-0000-0000-00000000bbbb",
      102,
      "Twin",
    );
    const filler1 = makeCard("77777777-0000-0000-0000-00000000cccc", 103, "F1");
    const filler2 = makeCard("66666666-0000-0000-0000-00000000dddd", 104, "F2");
    const filler3 = makeCard("55555555-0000-0000-0000-00000000eeee", 105, "F3");
    const db = cardDb([sigTwin, decoyTwin, filler1, filler2, filler3]);

    // sigDeck contains the SIGNATURE uuid; decoyDeck contains the SAME-NAMED
    // but distinct non-signature uuid.
    const decks = [
      makeDecklist("sigDeck", [sigTwin.id, filler1.id, filler2.id]),
      makeDecklist("decoyDeck", [decoyTwin.id, filler1.id, filler3.id]),
    ];
    const dreamcaller = makeDreamcaller("dc", [sigTwin.id]);

    const everSelected = new Set<string>();
    let observedTopK: { id: string; name: string; combined: number }[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const result = buildCorpusOpponentDeck({
        ...baseArgs,
        opponentDreamcaller: dreamcaller,
        knownGoodDecklists: decks,
        affiliation: null,
        cardDatabase: db,
        poolSeed: seed,
      });
      expect(result).not.toBeNull();
      observedTopK = result!.topK;
      // Only the deck holding the signature UUID is a candidate.
      expect(result!.candidateCount).toBe(1);
      if (result) everSelected.add(result.source.id);
    }
    // The decoy deck (same display name, different UUID) is never a candidate
    // nor selected.
    expect(everSelected.has("decoyDeck")).toBe(false);
    expect(everSelected).toEqual(new Set(["sigDeck"]));
    expect(observedTopK.map((t) => t.id)).toEqual(["sigDeck"]);
    // The selected deck has positive signatureFit (the signature UUID overlapped).
    const selected = buildCorpusOpponentDeck({
      ...baseArgs,
      opponentDreamcaller: dreamcaller,
      knownGoodDecklists: decks,
      affiliation: null,
      cardDatabase: db,
      poolSeed: 0,
    })!;
    expect(selected.signatureFit).toBeGreaterThan(0);
  });
});
