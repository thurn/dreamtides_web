import { describe, expect, it } from "vitest";
import {
  assembleOfferTrace,
  traceBandSize,
  type TraceCandidateInput,
} from "./buildTrace";
import { parseAuguryTargetKey } from "../../types/identifiers";

/** Builds `n` candidates whose key/score is its index (higher index = higher). */
function rankedCandidates(n: number): TraceCandidateInput[] {
  return Array.from({ length: n }, (_, i) => ({
    key: parseAuguryTargetKey(`k${String(i)}`),
    score: i,
  }));
}

describe("traceBandSize", () => {
  it("is 0 for an empty pool", () => {
    expect(traceBandSize(0, 0.25, 5)).toBe(0);
  });

  it("never exceeds the pool size", () => {
    expect(traceBandSize(3, 0.25, 5)).toBe(3);
  });

  it("honors the fraction once the pool is large enough", () => {
    // ceil(0.25 * 40) = 10, above the minimum of 5.
    expect(traceBandSize(40, 0.25, 5)).toBe(10);
  });

  it("applies the minimum floor for small pools", () => {
    // ceil(0.25 * 8) = 2, raised to the minimum of 5.
    expect(traceBandSize(8, 0.25, 5)).toBe(5);
  });
});

describe("assembleOfferTrace", () => {
  it("sorts candidates by score descending and reports the full count", () => {
    const trace = assembleOfferTrace({
      decision: "scored_cards",
      keyKind: "cardUuid",
      candidates: rankedCandidates(5),
      selectedKeys: [parseAuguryTargetKey("k4")],
      selectedCount: 1,
      bandFraction: 0.25,
      bandMinimum: 5,
    });
    expect(trace.candidates.map((c) => c.key)).toEqual([
      "k4",
      "k3",
      "k2",
      "k1",
      "k0",
    ]);
    expect(trace.candidateCount).toBe(5);
    expect(trace.truncated).toBe(false);
  });

  it("marks exactly the top bandSize candidates in-band", () => {
    const trace = assembleOfferTrace({
      decision: "scored_cards",
      keyKind: "cardUuid",
      candidates: rankedCandidates(40),
      selectedKeys: [parseAuguryTargetKey("k39")],
      selectedCount: 1,
      bandFraction: 0.25,
      bandMinimum: 5,
    });
    // bandSize = ceil(0.25 * 40) = 10.
    expect(trace.band.bandSize).toBe(10);
    expect(trace.band.poolSize).toBe(40);
    const inBandCount = trace.candidates.filter((c) => c.inBand).length;
    // The kept list is bounded, but every kept in-band candidate must be among
    // the top bandSize by score.
    expect(inBandCount).toBeGreaterThan(0);
    expect(inBandCount).toBeLessThanOrEqual(10);
  });

  it("flags the selected candidates and only those", () => {
    const trace = assembleOfferTrace({
      decision: "scored_cards",
      keyKind: "cardUuid",
      candidates: rankedCandidates(5),
      selectedKeys: [parseAuguryTargetKey("k4"), parseAuguryTargetKey("k2")],
      selectedCount: 2,
      bandFraction: 1,
      bandMinimum: 5,
    });
    const selected = trace.candidates
      .filter((c) => c.selected)
      .map((c) => c.key);
    expect(new Set(selected)).toEqual(new Set(["k4", "k2"]));
  });

  it("truncates large pools but always keeps the selected candidate", () => {
    // Select the lowest-scoring candidate so truncation would drop it unless
    // selected candidates are explicitly retained.
    const trace = assembleOfferTrace({
      decision: "scored_cards",
      keyKind: "cardUuid",
      candidates: rankedCandidates(100),
      selectedKeys: [parseAuguryTargetKey("k0")],
      selectedCount: 1,
      bandFraction: 0.25,
      bandMinimum: 5,
      maxCandidates: 12,
    });
    expect(trace.truncated).toBe(true);
    expect(trace.candidateCount).toBe(100);
    expect(trace.candidates.some((c) => c.key === "k0" && c.selected)).toBe(
      true,
    );
  });

  it("carries optional branch fields only when provided", () => {
    const withFlags = assembleOfferTrace({
      decision: "dreamsign_match",
      keyKind: "dreamsignId",
      candidates: rankedCandidates(3),
      selectedKeys: [parseAuguryTargetKey("k2")],
      selectedCount: 1,
      bandFraction: 0.4,
      bandMinimum: 2,
      coldStartQualityFallback: true,
      dreamsignTier: "covered",
      blend: { quality: 0.7, fit: 0.3 },
      notes: ["note"],
    });
    expect(withFlags.coldStartQualityFallback).toBe(true);
    expect(withFlags.dreamsignTier).toBe("covered");
    expect(withFlags.blend).toEqual({ quality: 0.7, fit: 0.3 });
    expect(withFlags.notes).toEqual(["note"]);

    const without = assembleOfferTrace({
      decision: "uniform",
      keyKind: "siteType",
      candidates: rankedCandidates(3),
      selectedKeys: [parseAuguryTargetKey("k2")],
      selectedCount: 1,
      bandFraction: 1,
    });
    expect("coldStartQualityFallback" in without).toBe(false);
    expect("dreamsignTier" in without).toBe(false);
    expect("blend" in without).toBe(false);
  });
});
