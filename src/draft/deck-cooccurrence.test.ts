import { describe, expect, it } from "vitest";

import { buildCooccurrence, synergyAscending } from "./deck-cooccurrence.js";

// Opaque UUIDs — we never parse or split these; they're just unique strings.
const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";

describe("buildCooccurrence", () => {
  it("co-occurrence of always-together cards exceeds co-occurrence with isolated card", () => {
    // A and B always appear together; C appears alone.
    const decks: ReadonlyArray<ReadonlySet<string>> = [
      new Set([A, B]),
      new Set([A, B]),
      new Set([A, B]),
      new Set([C]),
    ];
    const cooc = buildCooccurrence(decks);

    // A and B always appear together → cooc(A,B) should be 1.0 (B present in
    // every deck that contains A).
    const coocAB = cooc.get(A)?.get(B) ?? 0;
    // C never appears with A → cooc(A,C) should be 0.
    const coocAC = cooc.get(A)?.get(C) ?? 0;

    expect(coocAB).toBeGreaterThan(coocAC);
  });

  it("returns the conditional probability normalization (cooc(a,b) = decks_with_both / decks_with_a)", () => {
    // A appears in 4 decks; B appears in 2 of those.
    const decks: ReadonlyArray<ReadonlySet<string>> = [
      new Set([A, B]),
      new Set([A, B]),
      new Set([A]),
      new Set([A]),
    ];
    const cooc = buildCooccurrence(decks);
    const coocAB = cooc.get(A)?.get(B) ?? 0;
    expect(coocAB).toBeCloseTo(0.5, 5);
  });

  it("handles an empty corpus gracefully", () => {
    const cooc = buildCooccurrence([]);
    expect(cooc.size).toBe(0);
  });

  it("handles single-card decks (no pairs)", () => {
    const decks: ReadonlyArray<ReadonlySet<string>> = [new Set([A]), new Set([B])];
    const cooc = buildCooccurrence(decks);
    // No card ever appears with another → all values should be 0 or absent.
    expect((cooc.get(A)?.get(B) ?? 0)).toBe(0);
    expect((cooc.get(B)?.get(A) ?? 0)).toBe(0);
  });
});

describe("synergyAscending", () => {
  it("places the isolated card C first (lowest mean co-occurrence)", () => {
    // A and B always co-occur; C is isolated.
    const decks: ReadonlyArray<ReadonlySet<string>> = [
      new Set([A, B]),
      new Set([A, B]),
      new Set([A, B]),
      new Set([C]),
    ];
    const cooc = buildCooccurrence(decks);
    const deck = [A, B, C];
    const ordered = synergyAscending(deck, cooc);

    expect(ordered[0]).toBe(C);
    // A and B should follow in some order (both high synergy with each other)
    expect(ordered.slice(1)).toContain(A);
    expect(ordered.slice(1)).toContain(B);
  });

  it("returns all distinct deck cards", () => {
    const decks: ReadonlyArray<ReadonlySet<string>> = [
      new Set([A, B]),
      new Set([A, C]),
    ];
    const cooc = buildCooccurrence(decks);
    const deck = [A, B, C];
    const ordered = synergyAscending(deck, cooc);
    expect(ordered).toHaveLength(3);
    expect(new Set(ordered)).toEqual(new Set(deck));
  });

  it("tie-break is deterministic: higher UUID string sorts first among tied cards", () => {
    // All cards unknown to cooc → mean co-occurrence = 0 for all; ties across the
    // board.  The tie-break should order by descending UUID string (higher first).
    const X = "ffffffff-0000-0000-0000-000000000003";
    const Y = "ffffffff-0000-0000-0000-000000000002";
    const Z = "ffffffff-0000-0000-0000-000000000001";

    const cooc = buildCooccurrence([]);
    const deck = [Z, Y, X];
    const ordered = synergyAscending(deck, cooc);

    // All have score 0; tie-break descending by string → X > Y > Z.
    expect(ordered).toEqual([X, Y, Z]);
  });

  it("handles an empty deck", () => {
    const cooc = buildCooccurrence([]);
    expect(synergyAscending([], cooc)).toEqual([]);
  });

  it("handles a singleton deck (no rest → mean 0)", () => {
    const decks: ReadonlyArray<ReadonlySet<string>> = [new Set([A, B])];
    const cooc = buildCooccurrence(decks);
    expect(synergyAscending([A], cooc)).toEqual([A]);
  });

  it("is stable/deterministic across multiple calls", () => {
    const decks: ReadonlyArray<ReadonlySet<string>> = [
      new Set([A, B]),
      new Set([A, C]),
    ];
    const cooc = buildCooccurrence(decks);
    const deck = [A, B, C];
    const first = synergyAscending(deck, cooc);
    const second = synergyAscending(deck, cooc);
    expect(first).toEqual(second);
  });
});
