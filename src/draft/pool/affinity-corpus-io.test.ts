import { describe, expect, it } from "vitest";
import type { AffinityCorpus } from "./affinity-grower.ts";
import {
  applyOverlay,
  deserializeCorpus,
  fitEmbedding,
} from "./affinity-corpus-io.ts";

// A tiny synthetic corpus for the overlay-blend math.
function tinyCorpus(): AffinityCorpus {
  return {
    cards: ["a", "b", "c"],
    affinity: new Map([
      ["a", new Map([["b", 0.4], ["c", 0.2]])],
      ["b", new Map([["a", 0.3]])],
    ]),
    prior: new Map([
      ["a", 0.5],
      ["b", 0.6],
      ["c", 0.7],
    ]),
  };
}

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

describe("applyOverlay — add", () => {
  it("places a new card at the neighbour-mean of its resembles row, column, and prior", () => {
    const next = applyOverlay(tinyCorpus(), {
      add: [{ id: "x", resembles: ["a", "b"] }],
    });

    expect(next.cards).toEqual(["a", "b", "c", "x"]);
    // prior[x] = mean(prior a, prior b) = (0.5 + 0.6) / 2.
    expect(near(next.prior.get("x")!, 0.55)).toBe(true);

    // Outgoing row: mean over {a,b} of each target, dropping zeros, excluding self.
    const rowX = next.affinity.get("x")!;
    expect(near(rowX.get("a")!, (0 + 0.3) / 2)).toBe(true); // 0.15
    expect(near(rowX.get("b")!, (0.4 + 0) / 2)).toBe(true); // 0.2
    expect(near(rowX.get("c")!, (0.2 + 0) / 2)).toBe(true); // 0.1
    expect(rowX.has("x")).toBe(false);

    // Incoming column: mean over {a,b} of each source's ties to a/b.
    expect(near(next.affinity.get("a")!.get("x")!, (0 + 0.4) / 2)).toBe(true); // 0.2
    expect(near(next.affinity.get("b")!.get("x")!, (0.3 + 0) / 2)).toBe(true); // 0.15
    // c has no outgoing ties to a or b, so it does not pull x.
    expect(next.affinity.get("c")).toBeUndefined();
  });

  it("applies priorScale to the blended prior", () => {
    const next = applyOverlay(tinyCorpus(), {
      add: [{ id: "x", resembles: ["a", "b"], priorScale: 2 }],
    });
    expect(near(next.prior.get("x")!, 0.55 * 2)).toBe(true);
  });

  it("lets a later add resemble an earlier overlay add", () => {
    const next = applyOverlay(tinyCorpus(), {
      add: [
        { id: "x", resembles: ["a"] },
        { id: "y", resembles: ["x"] },
      ],
    });
    expect(next.cards).toContain("y");
    // y inherits x's prior, which inherited a's prior.
    expect(near(next.prior.get("y")!, next.prior.get("x")!)).toBe(true);
  });

  it("rejects an add for a card that already exists", () => {
    expect(() => applyOverlay(tinyCorpus(), { add: [{ id: "a", resembles: ["b"] }] })).toThrow(
      /already present/,
    );
  });

  it("rejects a resembles target that is not a known card", () => {
    expect(() =>
      applyOverlay(tinyCorpus(), { add: [{ id: "x", resembles: ["nope"] }] }),
    ).toThrow(/not a known card/);
  });

  it("rejects an add with no resembles targets", () => {
    expect(() => applyOverlay(tinyCorpus(), { add: [{ id: "x", resembles: [] }] })).toThrow(
      /at least one card/,
    );
  });

  it("does not mutate the input corpus", () => {
    const corpus = tinyCorpus();
    applyOverlay(corpus, { add: [{ id: "x", resembles: ["a", "b"] }] });
    expect(corpus.cards).toEqual(["a", "b", "c"]);
    expect(corpus.prior.has("x")).toBe(false);
  });
});

describe("applyOverlay — edit", () => {
  it("rescales the prior in place when only priorScale is given", () => {
    const next = applyOverlay(tinyCorpus(), { edit: [{ id: "a", priorScale: 0.5 }] });
    expect(near(next.prior.get("a")!, 0.25)).toBe(true);
    // Row/column unchanged.
    expect(near(next.affinity.get("a")!.get("b")!, 0.4)).toBe(true);
  });

  it("re-points a card's row, column, and prior when resembles is given", () => {
    const next = applyOverlay(tinyCorpus(), { edit: [{ id: "c", resembles: ["b"] }] });
    // prior[c] = mean(prior b) = 0.6.
    expect(near(next.prior.get("c")!, 0.6)).toBe(true);
    // Row c becomes b's outgoing row: b -> {a: 0.3}.
    expect(near(next.affinity.get("c")!.get("a")!, 0.3)).toBe(true);
    // Column c: each source's tie to b. a -> b = 0.4, so a now pulls c.
    expect(near(next.affinity.get("a")!.get("c")!, 0.4)).toBe(true);
  });

  it("rejects an edit for a card that does not exist", () => {
    expect(() => applyOverlay(tinyCorpus(), { edit: [{ id: "z", priorScale: 2 }] })).toThrow(
      /not present/,
    );
  });
});

// A 6x6 matrix that is exactly rank 2 and strictly positive, so a rank-2 fit
// should reconstruct it closely.
function rank2Corpus(): AffinityCorpus {
  const u1 = [1, 2, 1, 0.5, 1.5, 1];
  const v1 = [0.5, 1, 0.2, 0.3, 0.4, 0.6];
  const u2 = [0.2, 0.1, 1, 1, 0.5, 0.3];
  const v2 = [1, 0.3, 0.5, 0.2, 0.6, 0.4];
  const cards = ["c0", "c1", "c2", "c3", "c4", "c5"];
  const affinity = new Map<string, Map<string, number>>();
  for (let i = 0; i < 6; i++) {
    const row = new Map<string, number>();
    for (let j = 0; j < 6; j++) {
      row.set(cards[j], u1[i] * v1[j] + u2[i] * v2[j]);
    }
    affinity.set(cards[i], row);
  }
  const prior = new Map(cards.map((c, i) => [c, 0.1 * (i + 1)]));
  return { cards, affinity, prior };
}

describe("fitEmbedding / deserializeCorpus", () => {
  it("reconstructs a rank-2 matrix closely at rank 2", () => {
    const corpus = rank2Corpus();
    const json = fitEmbedding(corpus, { rank: 2, oversample: 4 });
    expect(json.rank).toBe(2);
    expect(json.cards).toEqual(corpus.cards);
    const back = deserializeCorpus(json);
    for (const d of corpus.cards) {
      for (const c of corpus.cards) {
        const original = corpus.affinity.get(d)!.get(c)!;
        const recon = back.affinity.get(d)?.get(c) ?? 0;
        expect(Math.abs(recon - original)).toBeLessThan(0.01);
      }
    }
  });

  it("carries prior and cards across unchanged (within rounding)", () => {
    const corpus = rank2Corpus();
    const back = deserializeCorpus(fitEmbedding(corpus, { rank: 2 }));
    expect(back.cards).toEqual(corpus.cards);
    for (const c of corpus.cards) {
      expect(near(back.prior.get(c)!, corpus.prior.get(c)!, 1e-5)).toBe(true);
    }
  });

  it("clamps reconstructed negatives to zero (no negative affinity entries)", () => {
    const back = deserializeCorpus(fitEmbedding(rank2Corpus(), { rank: 2 }));
    for (const row of back.affinity.values()) {
      for (const v of row.values()) expect(v).toBeGreaterThan(0);
    }
  });

  it("is deterministic — same input yields byte-identical output", () => {
    const a = fitEmbedding(rank2Corpus(), { rank: 3 });
    const b = fitEmbedding(rank2Corpus(), { rank: 3 });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("rejects a malformed embedding", () => {
    expect(() =>
      deserializeCorpus({
        version: 1,
        kind: "embedding",
        rank: 2,
        cards: ["a", "b"],
        prior: [0.1],
        U: [[1, 0]],
        V: [[1, 0]],
      }),
    ).toThrow(/malformed/);
  });
});
