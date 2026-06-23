/**
 * Unit tests for `computeSignatureDecks` — structural/contract invariants only.
 *
 * Uses a synthetic QuestContent fixture built from distinct UUIDs so tests
 * never break when real card TOML data changes.
 */
import { describe, it, expect } from "vitest";
import {
  computeSignatureDecks,
  type SignatureDeck,
} from "./SignatureDecksApp.tsx";
import { buildIdfStats, signatureFit } from "../draft/idf-fit.ts";
import { idfCosine } from "../draft/pool/variant-idf.ts";
import type { QuestContent } from "../data/quest-content.ts";
import type { CardData } from "../types/cards.ts";
import type { DreamcallerContent } from "../types/content.ts";
import type { DraftRecord } from "../data/cards-v2-database.ts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Minimal CardData shape needed by computeSignatureDecks (name + id). */
function makeCard(id: string, name: string): CardData {
  return {
    name,
    id,
    cardNumber: 0,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "",
  } as unknown as CardData;
}

/** Minimal DraftRecord shape — only id, sourceFile, mainboardIds needed. */
function makeRecord(id: string, mainboardIds: string[]): DraftRecord {
  return {
    id,
    draftId: id,
    sourceFile: `${id}.json`,
    mainboard: [],
    mainboardIds,
    packs: [],
    picks: [],
    packIds: [],
    pickIds: [],
  };
}

/** Minimal DreamcallerContent shape — only id, name, signatureCardIds needed. */
function makeDreamcaller(
  id: string,
  signatureCardIds: string[],
): DreamcallerContent {
  return {
    id,
    name: id,
    title: "",
    renderedText: "",
    imageNumber: "1",
    startingEssence: 200,
    signatureCardIds,
  };
}

/**
 * Build a minimal QuestContent fixture. computeSignatureDecks reads:
 *   - content.cardDatabase (Map<number, CardData>) — for UUID → name lookup
 *   - content.draftRecords (DraftRecord[]) — the corpus
 *   - content.dreamcallers (DreamcallerContent[]) — the Dreamcallers
 */
function makeContent(
  cards: CardData[],
  dreamcallers: DreamcallerContent[],
  draftRecords: DraftRecord[],
): QuestContent {
  const cardDatabase = new Map<number, CardData>(
    cards.map((c, i) => [i, c]),
  );
  return {
    cardDatabase,
    dreamcallers,
    draftRecords,
    // Other QuestContent fields are not touched by computeSignatureDecks.
  } as unknown as QuestContent;
}

// ---------------------------------------------------------------------------
// Stable UUIDs for the fixture — chosen to be visually distinct.
// ---------------------------------------------------------------------------

const SIG_A = "aaaa0000-0000-0000-0000-000000000001";
const SIG_B = "bbbb0000-0000-0000-0000-000000000002";
const COMMON = "cccc0000-0000-0000-0000-000000000003";
const OTHER = "dddd0000-0000-0000-0000-000000000004";

// Deck 1: contains both signature cards (SIG_A + SIG_B) plus COMMON.
// Deck 2: contains only SIG_A plus COMMON and OTHER.
// Deck 3: no signature cards — should never be selected for our DC.
const DECK_1_IDS = [SIG_A, SIG_B, COMMON];
const DECK_2_IDS = [SIG_A, COMMON, OTHER];
const DECK_3_IDS = [COMMON, OTHER];

// A Dreamcaller whose signatures are SIG_A and SIG_B.
const DC_WITH_SIGS = makeDreamcaller("dc-test", [SIG_A, SIG_B]);

// A Dreamcaller with signatures that appear in NO deck.
const ABSENT_UUID = "eeee0000-0000-0000-0000-000000000005";
const DC_ABSENT = makeDreamcaller("dc-absent", [ABSENT_UUID]);

// A Dreamcaller with empty signature list — should produce no row.
const DC_NO_SIGS = makeDreamcaller("dc-no-sigs", []);

const RECORDS = [
  makeRecord("rec1", DECK_1_IDS),
  makeRecord("rec2", DECK_2_IDS),
  makeRecord("rec3", DECK_3_IDS),
];

const CARDS = [
  makeCard(SIG_A, "Card Alpha"),
  makeCard(SIG_B, "Card Beta"),
  makeCard(COMMON, "Card Common"),
  makeCard(OTHER, "Card Other"),
  makeCard(ABSENT_UUID, "Card Absent"),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeSignatureDecks — structural invariants", () => {
  it("selects the deck with the highest signatureFit among candidates (match mode)", () => {
    const content = makeContent(CARDS, [DC_WITH_SIGS], RECORDS);
    const result: SignatureDeck[] = computeSignatureDecks(content, "match");

    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.dreamcaller.id).toBe("dc-test");

    // Derive which deck the shared module predicts should win.
    const sets = RECORDS.map(
      (r) => new Set(r.mainboardIds.map((id) => id.toLowerCase())),
    );
    const corpus = buildIdfStats(sets);
    const sigSet = new Set([SIG_A, SIG_B].map((id) => id.toLowerCase()));
    const fits = sets.map((_, i) => signatureFit(sigSet, corpus.decks[i], corpus));

    // Build matched-id counts mirroring production's tie-break denominator.
    const sigIds = [SIG_A, SIG_B].map((id) => id.toLowerCase());
    const matchedSizes = sets.map(
      (s) => sigIds.filter((id) => s.has(id)).length,
    );

    // rec3 has no signature cards, so it should be gated out; among rec1/rec2
    // the one with the higher fit score should win; on equal fit prefer more
    // distinct matched signature cards (mirrors production tie-break).
    const candidateIdxs = [0, 1]; // rec1=0, rec2=1; rec3=2 has no sig cards
    const winnerIdx = candidateIdxs.reduce((best, i) => {
      if (fits[i] > fits[best]) return i;
      if (fits[i] === fits[best] && matchedSizes[i] > matchedSizes[best])
        return i;
      return best;
    });

    // The chosen sourceFile should match the predicted winner record.
    expect(row.sourceFile).toBe(RECORDS[winnerIdx].sourceFile);
  });

  it("only includes decks with at least one matched signature card", () => {
    const content = makeContent(CARDS, [DC_WITH_SIGS], RECORDS);
    const result = computeSignatureDecks(content, "match");
    expect(result).toHaveLength(1);
    // The chosen deck must contain at least one signature card.
    expect(result[0].matchedIds.size).toBeGreaterThan(0);
  });

  it("produces no row for a Dreamcaller whose signatures appear in no deck", () => {
    const content = makeContent(CARDS, [DC_ABSENT], RECORDS);
    const result = computeSignatureDecks(content, "match");
    expect(result).toHaveLength(0);
  });

  it("produces no row for a Dreamcaller with an empty signature list", () => {
    const content = makeContent(CARDS, [DC_NO_SIGS], RECORDS);
    const result = computeSignatureDecks(content, "match");
    expect(result).toHaveLength(0);
  });

  it("excludes decks larger than MAX_DECK_SIZE (28 cards)", () => {
    // Build an oversized deck that contains both signature cards — it should NOT
    // be eligible as a candidate even though it overlaps the signature.
    const oversizedIds = Array.from({ length: 29 }, (_, i) =>
      i < 2 ? [SIG_A, SIG_B][i] : `ffff0000-0000-0000-${String(i).padStart(4, "0")}-000000000099`,
    );
    const oversizedRecord = makeRecord("rec-oversized", oversizedIds);
    // Use only the oversized record so there's nothing else to fall back to.
    const content = makeContent(CARDS, [DC_WITH_SIGS], [oversizedRecord]);
    const result = computeSignatureDecks(content, "match");
    // Oversized deck is excluded → no candidates → no row produced.
    expect(result).toHaveLength(0);
  });

  it("typical mode selects the centrality winner, not always candidates[0]", () => {
    // Build a fixture where the centrality winner is determinable and differs
    // from candidates[0] to prove an implementation can't just return candidates[0].
    //
    // Signature: [SIG_A, SIG_B].
    // Three candidate decks (all contain at least one sig card):
    //   cDeck1 = {SIG_A, SIG_B, COMMON}   — contains both sigs
    //   cDeck2 = {SIG_A, SIG_B, COMMON}   — identical to cDeck1 (high mutual cosine)
    //   cDeck3 = {SIG_A, OTHER}            — contains only SIG_A, unrelated OTHER
    // One non-candidate deck (no sig cards):
    //   cDeck4 = {COMMON, OTHER}
    //
    // cDeck1 and cDeck2 are identical → they have the highest cosine to each other.
    // cDeck3 shares SIG_A with cDeck1/cDeck2 but no COMMON, so it's less central.
    // The centrality winner is whichever of cDeck1/cDeck2 is picked first by the
    // reduce — both score identically, so tie-break (higher raw fit) also ties.
    // The key invariant: the winner must be cDeck1 or cDeck2, NOT cDeck3.
    //
    // We put cDeck3 first in the records so candidates[0] is cDeck3; an
    // implementation that returns candidates[0] would fail.
    const C1 = "c1c10000-0000-0000-0000-000000000011";
    const C2 = "c2c20000-0000-0000-0000-000000000012";
    const C3 = "c3c30000-0000-0000-0000-000000000013";
    const C4 = "c4c40000-0000-0000-0000-000000000014";
    const typicalRecords = [
      makeRecord("tRec3", [SIG_A, OTHER]),           // candidates[0] — less central
      makeRecord("tRec1", [SIG_A, SIG_B, COMMON]),   // high-centrality
      makeRecord("tRec2", [SIG_A, SIG_B, COMMON]),   // high-centrality (identical to tRec1)
      makeRecord("tRec4", [C1, C2, C3, C4]),          // no sig cards — not a candidate
    ];
    const extraCards = [C1, C2, C3, C4].map((id) => makeCard(id, id));
    const typicalContent = makeContent(
      [...CARDS, ...extraCards],
      [DC_WITH_SIGS],
      typicalRecords,
    );
    const result = computeSignatureDecks(typicalContent, "typical");
    expect(result).toHaveLength(1);

    // Compute the centrality oracle using the same shared-module math:
    //   centrality(x) = Σ_y [ fit(y) * idfCosine(deck_x, deck_y) ]
    // highest centrality wins; ties → higher raw fit.
    const sets = typicalRecords.map(
      (r) => new Set(r.mainboardIds.map((id) => id.toLowerCase())),
    );
    const corpus = buildIdfStats(sets);
    const sigSet = new Set([SIG_A, SIG_B].map((id) => id.toLowerCase()));
    const idfOf = (id: string): number => corpus.idf.get(id) ?? 0;

    // Identify candidate indices (those containing ≥1 sig card).
    const candidateIdxs = sets
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => [SIG_A, SIG_B].some((id) => s.has(id.toLowerCase())))
      .map(({ i }) => i);
    const fits = sets.map((_, i) => signatureFit(sigSet, corpus.decks[i], corpus));

    // Compute centrality for each candidate.
    let bestCentrality = -Infinity;
    let bestFit = -Infinity;
    let expectedWinnerFile = "";
    for (const xi of candidateIdxs) {
      let centrality = 0;
      for (const yi of candidateIdxs) {
        centrality +=
          fits[yi] * idfCosine(corpus.decks[xi], corpus.decks[yi], idfOf);
      }
      if (
        centrality > bestCentrality ||
        (centrality === bestCentrality && fits[xi] > bestFit)
      ) {
        bestCentrality = centrality;
        bestFit = fits[xi];
        expectedWinnerFile = typicalRecords[xi].sourceFile;
      }
    }

    // The result must NOT be the less-central cDeck3 (candidates[0] = tRec3).
    expect(result[0].sourceFile).not.toBe(typicalRecords[0].sourceFile);
    // The winner must be one of the high-centrality identical decks (tRec1/tRec2).
    // Both score equally, so either is acceptable — but the oracle computed
    // expectedWinnerFile via the same reduce logic production uses, so assert that.
    // This ensures correctness beyond "just not candidates[0]".
    const highCentralityFiles = new Set([
      typicalRecords[1].sourceFile,
      typicalRecords[2].sourceFile,
    ]);
    expect(highCentralityFiles.has(result[0].sourceFile)).toBe(true);
    expect(result[0].sourceFile).toBe(expectedWinnerFile);
  });

  it("matchedIds contains only signature card UUIDs present in the chosen deck", () => {
    const content = makeContent(CARDS, [DC_WITH_SIGS], RECORDS);
    const result = computeSignatureDecks(content, "match");
    expect(result).toHaveLength(1);
    const { matchedIds } = result[0];
    // Every entry in matchedIds must be one of the Dreamcaller's signature ids.
    for (const id of matchedIds) {
      expect([SIG_A, SIG_B]).toContain(id);
    }
  });

  it("signatureCards array lists all signature ids regardless of match", () => {
    const content = makeContent(CARDS, [DC_WITH_SIGS], RECORDS);
    const result = computeSignatureDecks(content, "match");
    expect(result).toHaveLength(1);
    const sigIds = result[0].signatureCards.map((s) => s.id);
    expect(sigIds).toContain(SIG_A);
    expect(sigIds).toContain(SIG_B);
  });
});
