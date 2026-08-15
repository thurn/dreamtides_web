// The `tides4` variant builds a pool by joining a DreamAvatar's starter tide,
// drawing a random subset of its facet tides, topping up with the remaining
// facets and broad tides, and dealing to the configured size. These tests pin the
// structural contract (determinism per seed, the deal size and copy cap, the
// always-joined starter, the varying facet subset, and the failure modes)
// against synthetic artifacts rather than mutable production data.

import { describe, expect, it } from "vitest";

import { makeRng } from "./rng.ts";
import type { Tides4DecksJson } from "./tides4-io.ts";
import type { PoolData } from "./types.ts";
import { DEFAULT_TIDES4_TUNING, generateTides4 } from "./variant-tides4.ts";
import type { CardId } from "../../types/card-identity";
import type { TideId } from "../../types/identifiers";
import {
  testDreamAvatarId,
  testCardId,
  testTideId,
} from "../../types/test-identities";

const AVATAR_A_ID = testDreamAvatarId("dc-a");
const AVATAR_B_ID = testDreamAvatarId("dc-b");
const AVATAR_C_ID = testDreamAvatarId("dc-c");
const SIGNATURE_TIDE_ID = testTideId("tide-sig-1");

// A synthetic artifact: one starter tide, `facetCount` facet tides, and
// `neutralCount` neutral tides, each with `cardsPerTide` disjoint cards (so
// dealable copies sum across tides). "dc-a" is a signatured DreamAvatar (its
// starter plus all facets and neutrals); "dc-b" is a signatureless DreamAvatar
// (null starter, drawing its subset from every facet). Card UUIDs are minted
// deterministically from tide-specific test seeds; copies default to 2.
function makeTides4(
  facetCount: number,
  cardsPerTide: number,
  neutralCount = 2,
  copies = 2,
): Tides4DecksJson {
  const mkCards = (tideIdSeed: string) =>
    Array.from({ length: cardsPerTide }, (_, i) => ({
      id: testCardId(`${tideIdSeed}-card-${String(i)}`),
      copies,
    }));
  const tides: Tides4DecksJson["tides"] = [
    {
      id: SIGNATURE_TIDE_ID,
      displayName: "Sig 1",
      displayDescription: "Signature description",
      role: "signature",
      resonance: "shadow",
      cards: mkCards("tide-sig-1"),
    },
    ...Array.from({ length: facetCount }, (_, f) => ({
      id: testTideId(`tide-fac-${String(f + 1)}`),
      displayName: `Facet ${String(f + 1)}`,
      displayDescription: `Facet ${String(f + 1)} description`,
      role: "facet" as const,
      resonance: "wild" as const,
      cards: mkCards(`tide-fac-${String(f + 1)}`),
    })),
    ...Array.from({ length: neutralCount }, (_, n) => ({
      id: testTideId(`tide-neu-${String(n + 1)}`),
      displayName: `Neutral ${String(n + 1)}`,
      displayDescription: `Neutral ${String(n + 1)} description`,
      role: "neutral" as const,
      resonance: "vision" as const,
      cards: mkCards(`tide-neu-${String(n + 1)}`),
    })),
  ];
  const facetIds = tides.filter((t) => t.role === "facet").map((t) => t.id);
  const neutralIds = tides.filter((t) => t.role === "neutral").map((t) => t.id);
  return {
    version: 2,
    selection: { bandFraction: 0.25, bandMinimum: 5 },
    tides,
    tidePoolByDreamAvatar: {
      [AVATAR_A_ID]: {
        starter: SIGNATURE_TIDE_ID,
        facets: facetIds,
        neutral: neutralIds,
      },
      [AVATAR_B_ID]: { starter: null, facets: facetIds, neutral: neutralIds },
    },
  };
}

function makePoolData(tides4Decks: Tides4DecksJson): PoolData {
  return {
    tides4Decks,
  };
}

function poolSize(counts: ReadonlyMap<CardId, number>): number {
  let s = 0;
  for (const v of counts.values()) s += v;
  return s;
}

describe("generateTides4", () => {
  it("is deterministic per seed", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const a = generateTides4(makeRng(7), poolData, AVATAR_A_ID);
    const b = generateTides4(makeRng(7), poolData, AVATAR_A_ID);
    expect([...a.counts.entries()]).toEqual([...b.counts.entries()]);
    expect(a.selected).toEqual(b.selected);
  });

  it("deals exactly the deal size with at most the copy cap per card", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const result = generateTides4(
      makeRng(3),
      poolData,
      AVATAR_A_ID,
    );
    expect(poolSize(result.counts)).toBe(DEFAULT_TIDES4_TUNING.dealSize);
    for (const count of result.counts.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(DEFAULT_TIDES4_TUNING.copyCap);
    }
  });

  it("injects deal size, copy cap, and maximum facets deterministically", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const tuning = { dealSize: 40, copyCap: 1, maxFacets: 1 };
    const first = generateTides4(
      makeRng(19),
      poolData,
      AVATAR_A_ID,
      tuning,
    );
    const second = generateTides4(
      makeRng(19),
      poolData,
      AVATAR_A_ID,
      tuning,
    );

    expect([...second.counts.entries()]).toEqual([...first.counts.entries()]);
    expect(poolSize(first.counts)).toBe(40);
    expect(Math.max(...first.counts.values())).toBe(1);
    expect(first.tides4Provenance).toMatchObject({
      dealSize: 40,
      cap: 1,
      maxFacets: 1,
      facetDrawnCount: 1,
    });
  });

  it("deals the whole bag when it is smaller than the deal size", () => {
    // 1 starter + 1 facet + 1 neutral, 3 disjoint cards each x 2 copies = 18
    // dealable copies, far below the deal size.
    const poolData = makePoolData(makeTides4(1, 3, 1));
    const result = generateTides4(
      makeRng(1),
      poolData,
      AVATAR_A_ID,
    );
    expect(poolSize(result.counts)).toBe(18);
  });

  it("guarantees every signature card a slot in the dealt pool", () => {
    // A signature tide of 120 distinct cards plus six facet tides; the bag
    // overflows the deal size many times over, so a single shuffled deal would
    // drop a slice of the signature tide. Every signature card UUID must still
    // appear (at least one copy) in every run.
    const poolData = makePoolData(makeTides4(6, 120));
    const signatureCardIds = poolData.tides4Decks?.tides
      .find((tide) => tide.id === SIGNATURE_TIDE_ID)
      ?.cards.map((card) => card.id);
    expect(signatureCardIds).toBeDefined();
    if (signatureCardIds === undefined) return;
    for (let seed = 0; seed < 30; seed += 1) {
      const result = generateTides4(
        makeRng(seed),
        poolData,
        AVATAR_A_ID,
      );
      expect(poolSize(result.counts)).toBe(DEFAULT_TIDES4_TUNING.dealSize);
      for (const id of signatureCardIds) {
        expect(result.counts.has(id)).toBe(true);
      }
    }
  });

  it("always joins a signatured DreamAvatar's starter first", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    for (let seed = 0; seed < 20; seed += 1) {
      const result = generateTides4(
        makeRng(seed),
        poolData,
        AVATAR_A_ID,
      );
      expect(result.selected[0]).toBe("tides4");
      // The starter joins before any facet.
      expect(result.selected[1]).toBe(SIGNATURE_TIDE_ID);
      // The next joined tide is always a facet (the random subset draw).
      const firstRandomTide = poolData.tides4Decks?.tides.find(
        (tide) => tide.id === result.selected[2],
      );
      expect(firstRandomTide?.role).toBe("facet");
    }
  });

  it("draws a varying facet subset across runs (the variety engine)", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const firstFacetSeen = new Set<TideId>();
    for (let seed = 0; seed < 40; seed += 1) {
      const result = generateTides4(
        makeRng(seed),
        poolData,
        AVATAR_A_ID,
      );
      // selected = ["tides4", starter, facet, facet?, ...]; the first facet is the
      // lead of the random subset and must vary run to run.
      firstFacetSeen.add(result.selected[2]);
    }
    expect(firstFacetSeen.size).toBeGreaterThan(1);
  });

  it("leans a signatureless DreamAvatar on a varying coherent archetype core", () => {
    // Two signatured archetypes (each its own signature core) plus a signatureless
    // DreamAvatar "dc-b" with a null starter. The neutral pool borrows a signatured
    // archetype each run, leading with a signature tide (a coherent archetype, not a
    // bare facet), and across runs draws more than one archetype.
    const data = makeTides4(4, 30);
    data.tides.push({
      id: testTideId("tide-sig-2"),
      displayName: "Sig 2",
      displayDescription: "Second signature description",
      role: "signature",
      resonance: "valor",
      cards: Array.from({ length: 30 }, (_, i) => ({
        id: testCardId(`tide-sig-2-card-${String(i)}`),
        copies: 2,
      })),
    });
    const facetIds = data.tides
      .filter((t) => t.role === "facet")
      .map((t) => t.id);
    data.tidePoolByDreamAvatar[AVATAR_C_ID] = {
      starter: testTideId("tide-sig-2"),
      facets: facetIds,
      neutral: data.tides.filter((t) => t.role === "neutral").map((t) => t.id),
    };
    const poolData = makePoolData(data);
    const starterIds = new Set<TideId>([
      SIGNATURE_TIDE_ID,
      testTideId("tide-sig-2"),
    ]);
    const leadsSeen = new Set<TideId>();
    for (let seed = 0; seed < 40; seed += 1) {
      const result = generateTides4(
        makeRng(seed),
        poolData,
        AVATAR_B_ID,
      );
      const lead = result.selected[1];
      // The lead is a signature core (a coherent archetype), not a bare facet.
      expect(starterIds.has(lead)).toBe(true);
      leadsSeen.add(lead);
    }
    expect(leadsSeen.size).toBe(2);
  });

  it("selects signatureless archetypes by authored pool order, independent of tide UUID order", () => {
    const data = makeTides4(1, 3, 1);
    const second = {
      id: testTideId("tide-sig-0"),
      displayName: "Lexicographically First",
      displayDescription: "Second authored archetype",
      role: "signature" as const,
      resonance: "valor" as const,
      cards: [{ id: testCardId("second-signature-card"), copies: 2 }],
    };
    data.tides.push(second);
    const authoredFirstAvatarId = testDreamAvatarId("avatar-authored-first");
    const authoredSecondAvatarId = testDreamAvatarId("avatar-authored-second");
    const signaturelessAvatarId = testDreamAvatarId("avatar-signatureless");
    const basePool = data.tidePoolByDreamAvatar[AVATAR_A_ID];
    data.tidePoolByDreamAvatar = {
      [authoredFirstAvatarId]: basePool,
      [authoredSecondAvatarId]: {
        starter: second.id,
        facets: basePool.facets,
        neutral: basePool.neutral,
      },
      [signaturelessAvatarId]: {
        starter: null,
        facets: basePool.facets,
        neutral: basePool.neutral,
      },
    };

    const result = generateTides4(
      () => 0,
      makePoolData(data),
      signaturelessAvatarId,
      { dealSize: 4, copyCap: 2, maxFacets: 1 },
    );

    expect(result.tides4Provenance.borrowedArchetypeName).toBe("Sig 1");
  });

  it("shuffles all tides together without a dreamAvatar id or pool entry", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const noId = generateTides4(makeRng(11), poolData, undefined);
    const unknownId = generateTides4(
      makeRng(11),
      poolData,
      testDreamAvatarId("dc-unknown"),
    );
    expect(noId.selected).toEqual(unknownId.selected);
    expect(poolSize(noId.counts)).toBe(DEFAULT_TIDES4_TUNING.dealSize);
  });

  it("keys the pool by card UUID and skips UUIDs absent from the catalog", () => {
    const data = makeTides4(1, 4, 1);
    const poolData = makePoolData(data);
    // Only two of the starter's UUIDs are in the catalog (the index is the
    // source of truth for membership); every other tide's UUIDs are skipped.
    poolData.cardNameById = new Map([
      [testCardId("tide-sig-1-card-0"), "Renamed Zero"],
      [testCardId("tide-sig-1-card-1"), "Renamed One"],
    ]);
    const result = generateTides4(
      makeRng(2),
      poolData,
      AVATAR_A_ID,
    );
    expect([...result.counts.keys()].sort()).toEqual(
      [testCardId("tide-sig-1-card-0"), testCardId("tide-sig-1-card-1")].sort(),
    );
  });

  it("throws when no tide decks are bundled", () => {
    const poolData = makePoolData(makeTides4(2, 2));
    delete poolData.tides4Decks;
    expect(() =>
      generateTides4(makeRng(0), poolData, AVATAR_A_ID),
    ).toThrow(/tides4/);
  });
});

describe("generateTides4 provenance", () => {
  it("records the joined tides in selection order, tagged by why", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const provenance = generateTides4(
      makeRng(7),
      poolData,
      AVATAR_A_ID,
    ).tides4Provenance;
    expect(provenance).toBeDefined();
    if (provenance === undefined) return;

    expect(provenance.dreamAvatarId).toBe(AVATAR_A_ID);
    expect(provenance.signatureless).toBe(false);
    expect(provenance.borrowedArchetypeName).toBeNull();
    expect(provenance.cap).toBe(DEFAULT_TIDES4_TUNING.copyCap);
    expect(provenance.dealSize).toBe(DEFAULT_TIDES4_TUNING.dealSize);
    expect(provenance.maxFacets).toBe(DEFAULT_TIDES4_TUNING.maxFacets);
    expect(provenance.facetAvailableCount).toBe(6);
    expect(provenance.facetDrawnCount).toBeGreaterThanOrEqual(1);
    expect(provenance.facetDrawnCount).toBeLessThanOrEqual(
      DEFAULT_TIDES4_TUNING.maxFacets,
    );

    // The starter is the first tide and is always joined.
    expect(provenance.tides[0].selection).toBe("starter");
    expect(provenance.tides[0].id).toBe(SIGNATURE_TIDE_ID);
    expect(provenance.tides[0].joined).toBe(true);

    // Exactly facetDrawnCount tides are tagged as the random draw.
    const drawn = provenance.tides.filter((t) => t.selection === "facet-drawn");
    expect(drawn.length).toBe(provenance.facetDrawnCount);

    // Every tide carries its full decklist as card ids (30 disjoint cards each).
    for (const tide of provenance.tides) {
      expect(tide.cardIds.length).toBe(30);
    }
  });

  it("attributes every pooled card to a joined source tide", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const result = generateTides4(
      makeRng(3),
      poolData,
      AVATAR_A_ID,
    );
    const provenance = result.tides4Provenance;
    expect(provenance).toBeDefined();
    if (provenance === undefined) return;

    const joinedIds = new Set(
      provenance.tides.filter((t) => t.joined).map((t) => t.id),
    );
    // One provenance entry per distinct pooled card, copies matching the deal.
    expect(Object.keys(provenance.cardProvenanceById).length).toBe(
      result.counts.size,
    );
    for (const [id, copies] of result.counts) {
      const card = provenance.cardProvenanceById[id];
      expect(card.copies).toBe(copies);
      expect(card.tideIds.length).toBeGreaterThanOrEqual(1);
      expect(joinedIds.has(card.primaryTideId)).toBe(true);
      // Disjoint synthetic decks: each card belongs to exactly one tide.
      expect(card.tideIds).toEqual([card.primaryTideId]);
    }

    // Each tide's contribution sums to the distinct pooled-card count.
    const totalContribution = provenance.tides.reduce(
      (sum, tide) => sum + tide.contributedCardCount,
      0,
    );
    expect(totalContribution).toBe(result.counts.size);
  });

  it("marks a signatureless DreamAvatar and names the borrowed archetype", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const provenance = generateTides4(
      makeRng(5),
      poolData,
      AVATAR_B_ID,
    ).tides4Provenance;
    expect(provenance).toBeDefined();
    if (provenance === undefined) return;

    expect(provenance.signatureless).toBe(true);
    // dc-b borrows the only signatured archetype, whose signature tide is "Sig 1".
    expect(provenance.borrowedArchetypeName).toBe("Sig 1");
    expect(provenance.tides[0].selection).toBe("starter");
  });
});
