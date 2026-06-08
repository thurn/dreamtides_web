import { describe, expect, it } from "vitest";
import type { AffinityCorpus } from "./affinity-grower.ts";
import {
  applyOverlay,
  deserializeCorpus,
  serializeCorpus,
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

describe("serializeCorpus / deserializeCorpus", () => {
  it("round-trips a corpus exactly at the default precision", () => {
    const corpus = tinyCorpus();
    const back = deserializeCorpus(serializeCorpus(corpus));
    expect(back.cards).toEqual(corpus.cards);
    for (const c of corpus.cards) {
      expect(near(back.prior.get(c)!, corpus.prior.get(c)!)).toBe(true);
    }
    for (const [d, row] of corpus.affinity) {
      for (const [c, v] of row) {
        expect(near(back.affinity.get(d)!.get(c)!, v)).toBe(true);
      }
    }
  });

  it("emits an index-keyed sparse matrix sorted by target index", () => {
    const json = serializeCorpus(tinyCorpus());
    expect(json.kind).toBe("matrix");
    expect(json.cards).toEqual(["a", "b", "c"]);
    // Row for "a" (index 0): targets b(1)=0.4, c(2)=0.2, sorted by index.
    const rowA = json.affinity.find(([d]) => d === 0);
    expect(rowA).toBeDefined();
    expect(rowA![1]).toEqual([
      [1, 0.4],
      [2, 0.2],
    ]);
    // No row is emitted for "c" (index 2), which has no outgoing affinity.
    expect(json.affinity.some(([d]) => d === 2)).toBe(false);
  });

  it("rounds to the requested decimals and drops entries that round to zero", () => {
    const corpus: AffinityCorpus = {
      cards: ["a", "b", "c"],
      affinity: new Map([["a", new Map([["b", 0.123456789], ["c", 0.0000001]])]]),
      prior: new Map([["a", 0], ["b", 0], ["c", 0]]),
    };
    const json = serializeCorpus(corpus, { decimals: 3 });
    const rowA = json.affinity.find(([d]) => d === 0)![1];
    expect(rowA).toEqual([[1, 0.123]]); // c rounds to 0 and is dropped
  });

  it("is deterministic — same input yields byte-identical output", () => {
    const a = serializeCorpus(tinyCorpus());
    const b = serializeCorpus(tinyCorpus());
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("does not mutate the input corpus", () => {
    const corpus = tinyCorpus();
    serializeCorpus(corpus);
    expect(corpus.cards).toEqual(["a", "b", "c"]);
    expect(corpus.affinity.get("a")!.get("b")).toBe(0.4);
  });

  it("rejects a wrong kind", () => {
    expect(() =>
      deserializeCorpus({
        version: 2,
        // @ts-expect-error testing a malformed artifact at runtime
        kind: "embedding",
        cards: ["a"],
        prior: [0.1],
        affinity: [],
      }),
    ).toThrow(/kind/);
  });

  it("rejects a prior length that does not match cards", () => {
    expect(() =>
      deserializeCorpus({
        version: 2,
        kind: "matrix",
        cards: ["a", "b"],
        prior: [0.1],
        affinity: [],
      }),
    ).toThrow(/malformed/);
  });
});
