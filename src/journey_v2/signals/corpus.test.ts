import { describe, expect, it } from "vitest";
import type { MerchantCorpus } from "../../data/merchant-corpus";
import { qualityOf, multiplicityOf, clusterOf, clustersOf } from "./corpus";

// ---------------------------------------------------------------------------
// Fixture corpus
// ---------------------------------------------------------------------------

function makeCorpus(): MerchantCorpus {
  const cards = new Map([
    ["uuid-known", { quality: 0.8, multiplicity: 0.5, df: 10, cluster: 1 }],
    ["uuid-no-cluster", { quality: 0.3, multiplicity: 0.1, df: 5 }],
  ]);
  const clusters = [
    { id: 1, flagship: "uuid-known", members: ["uuid-known", "uuid-other"] },
  ];
  return { cards, clusters };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("qualityOf", () => {
  it("returns the quality for a known UUID", () => {
    const corpus = makeCorpus();
    expect(qualityOf(corpus, "uuid-known")).toBeCloseTo(0.8);
  });

  it("returns 0 for an unknown UUID (not NaN, not crash)", () => {
    const corpus = makeCorpus();
    const result = qualityOf(corpus, "uuid-missing");
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe("multiplicityOf", () => {
  it("returns the multiplicity for a known UUID", () => {
    const corpus = makeCorpus();
    expect(multiplicityOf(corpus, "uuid-known")).toBeCloseTo(0.5);
  });

  it("returns 0 for an unknown UUID (not NaN, not crash)", () => {
    const corpus = makeCorpus();
    const result = multiplicityOf(corpus, "uuid-missing");
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe("clusterOf", () => {
  it("returns the cluster id for a card with a cluster", () => {
    const corpus = makeCorpus();
    expect(clusterOf(corpus, "uuid-known")).toBe(1);
  });

  it("returns undefined for a card without a cluster", () => {
    const corpus = makeCorpus();
    expect(clusterOf(corpus, "uuid-no-cluster")).toBeUndefined();
  });

  it("returns undefined for an unknown UUID (not crash)", () => {
    const corpus = makeCorpus();
    expect(clusterOf(corpus, "uuid-missing")).toBeUndefined();
  });
});

describe("clustersOf", () => {
  it("returns the clusters array from the corpus", () => {
    const corpus = makeCorpus();
    const result = clustersOf(corpus);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].flagship).toBe("uuid-known");
  });

  it("returns an empty array when corpus has no clusters", () => {
    const corpus: MerchantCorpus = {
      cards: new Map(),
      clusters: [],
    };
    expect(clustersOf(corpus)).toHaveLength(0);
  });
});
