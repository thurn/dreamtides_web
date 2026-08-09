import { describe, expect, it } from "vitest";
import { buildFitModel } from "../../draft/fit-model";
import { scoreDeckCoherence as scoreConfiguredDeckCoherence } from "./coherence";
import { opponentsFixture } from "../../testing/opponents-fixture";

const AUTHORED_COHERENCE = opponentsFixture().coherentDraft.coherence;
const COHERENCE_TUNING = {
  knn: AUTHORED_COHERENCE.nearestNeighbors,
  wNeighbor: AUTHORED_COHERENCE.neighborWeight,
  wCooccur: AUTHORED_COHERENCE.cooccurrenceWeight,
  wSelf: AUTHORED_COHERENCE.selfConsistencyWeight,
  selfDistractors: AUTHORED_COHERENCE.selfDistractors,
  selfRecallK: AUTHORED_COHERENCE.selfRecallK,
};

function scoreDeckCoherence(
  deck: readonly number[],
  fitModel: Parameters<typeof scoreConfiguredDeckCoherence>[1],
) {
  return scoreConfiguredDeckCoherence(deck, fitModel, COHERENCE_TUNING);
}

// A synthetic two-cluster corpus: alpha cards co-occur in alpha decks, beta cards
// in beta decks. The fit model learns the clusters; a deck drawn purely from one
// cluster should read as far more coherent than a deck mixing both.
function makeClusteredModel(): {
  fitModel: ReturnType<typeof buildFitModel>;
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
  return {
    fitModel,
    alpha: alphaNames.map(num),
    beta: betaNames.map(num),
  };
}

describe("scoreDeckCoherence", () => {
  it("scores a pure-cluster deck more coherent than a cross-cluster grab bag", () => {
    const { fitModel, alpha, beta } = makeClusteredModel();
    const coherent = alpha.slice(0, 16);
    const grabBag = [...alpha.slice(0, 8), ...beta.slice(0, 8)];

    const coherentScore = scoreDeckCoherence(coherent, fitModel);
    const grabBagScore = scoreDeckCoherence(grabBag, fitModel);

    expect(coherentScore.score).toBeGreaterThan(grabBagScore.score);
    expect(coherentScore.nearestNeighbor).toBeGreaterThan(
      grabBagScore.nearestNeighbor,
    );
  });

  it("is deterministic and yields finite, non-negative components", () => {
    const { fitModel, alpha } = makeClusteredModel();
    const deck = alpha.slice(0, 16);
    const a = scoreDeckCoherence(deck, fitModel);
    const b = scoreDeckCoherence(deck, fitModel);
    expect(a).toEqual(b);
    for (const value of [
      a.score,
      a.nearestNeighbor,
      a.meanPairwiseCooccur,
      a.selfConsistency,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    // Self-consistency is a fraction in [0,1]; a pure-cluster deck re-picks most
    // of its own cards.
    expect(a.selfConsistency).toBeLessThanOrEqual(1);
    expect(a.selfConsistency).toBeGreaterThan(0.5);
  });

  it("returns an all-zero score for an empty deck", () => {
    const { fitModel } = makeClusteredModel();
    const score = scoreDeckCoherence([], fitModel);
    expect(score.score).toBe(0);
    expect(score.nearestNeighbor).toBe(0);
    expect(score.meanPairwiseCooccur).toBe(0);
    expect(score.selfConsistency).toBe(0);
  });
});
