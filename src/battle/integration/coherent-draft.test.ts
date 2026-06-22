import { describe, expect, it } from "vitest";
import { buildFitModel } from "../../draft/replay/fit-model";
import { createSeededRng, simulateCoherentDraft } from "./coherent-draft";

// A two-cluster corpus plus mixed packs, so the draft has both factions to
// choose among and the fit signal (seeded toward alpha) should steer it.
function makeSetup(): {
  fitModel: ReturnType<typeof buildFitModel>;
  packs: number[][];
  alpha: number[];
  beta: number[];
} {
  const alphaNames = Array.from({ length: 24 }, (_, i) => `alpha-${String(i)}`);
  const betaNames = Array.from({ length: 24 }, (_, i) => `beta-${String(i)}`);
  const nameIndex = new Map<string, number>();
  [...alphaNames, ...betaNames].forEach((name, i) => nameIndex.set(name, i + 1));

  const decks: string[][] = [];
  for (let r = 0; r < 30; r += 1) {
    const start = r % 6;
    decks.push(alphaNames.slice(start, start + 18));
    decks.push(betaNames.slice(start, start + 18));
  }
  const fitModel = buildFitModel(decks, nameIndex);
  const num = (name: string): number => nameIndex.get(name) ?? -1;
  const alpha = alphaNames.map(num);
  const beta = betaNames.map(num);

  const packs: number[][] = [];
  for (let p = 0; p < 40; p += 1) {
    const pack: number[] = [];
    for (let k = 0; k < 5; k += 1) pack.push(alpha[(p * 3 + k) % alpha.length]);
    for (let k = 0; k < 5; k += 1) pack.push(beta[(p * 2 + k) % beta.length]);
    packs.push(pack);
  }
  return { fitModel, packs, alpha, beta };
}

describe("createSeededRng", () => {
  it("is deterministic for a seed and varies across seeds", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const c = createSeededRng(7);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    const seqC = [c(), c(), c()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("simulateCoherentDraft", () => {
  it("picks the requested number of distinct cards with a matching trace", () => {
    const { fitModel, packs, alpha } = makeSetup();
    const result = simulateCoherentDraft({
      fitModel,
      packs,
      signatureCardNumbers: alpha.slice(0, 6),
      pickBudget: 20,
      temperature: 0.2,
      rng: createSeededRng(1),
    });
    expect(result.pickedCardNumbers.length).toBe(20);
    expect(new Set(result.pickedCardNumbers).size).toBe(20);
    expect(result.trace.length).toBe(20);
    expect(result.trace[0].pickIndex).toBe(0);
  });

  it("greedy (temperature 0) drafts mostly alpha when seeded with alpha", () => {
    const { fitModel, packs, alpha } = makeSetup();
    const alphaSet = new Set(alpha);
    const result = simulateCoherentDraft({
      fitModel,
      packs,
      signatureCardNumbers: alpha.slice(0, 6),
      pickBudget: 18,
      temperature: 0,
      rng: createSeededRng(5),
    });
    const alphaCount = result.pickedCardNumbers.filter((n) =>
      alphaSet.has(n),
    ).length;
    expect(alphaCount).toBeGreaterThan(result.pickedCardNumbers.length / 2);
  });

  it("is deterministic given the same seed and differs across seeds", () => {
    const { fitModel, packs, alpha } = makeSetup();
    const run = (seed: number): number[] =>
      simulateCoherentDraft({
        fitModel,
        packs,
        signatureCardNumbers: alpha.slice(0, 6),
        pickBudget: 16,
        temperature: 0.3,
        rng: createSeededRng(seed),
      }).pickedCardNumbers;
    expect(run(11)).toEqual(run(11));
    expect(run(11)).not.toEqual(run(22));
  });

  it("returns no picks when there are no packs", () => {
    const { fitModel, alpha } = makeSetup();
    const result = simulateCoherentDraft({
      fitModel,
      packs: [],
      signatureCardNumbers: alpha.slice(0, 6),
      pickBudget: 10,
      temperature: 0.2,
      rng: createSeededRng(1),
    });
    expect(result.pickedCardNumbers).toHaveLength(0);
    expect(result.trace).toHaveLength(0);
  });
});
