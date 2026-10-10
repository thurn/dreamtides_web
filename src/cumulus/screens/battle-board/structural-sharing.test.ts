import { describe, expect, it } from "vitest";
import { shareEqualFields, shareEqualParts } from "./structural-sharing";

const side = (energy: number, cards: readonly string[]) => ({
  status: { energy },
  hand: cards.map((id) => ({ id })),
});

describe("shareEqualParts", () => {
  it("returns the previous value when the next one is deeply equal", () => {
    const previous = side(2, ["a", "b"]);
    expect(shareEqualParts(previous, side(2, ["a", "b"]))).toBe(previous);
  });

  it("keeps the unchanged parts of a changed value and the new changed parts", () => {
    const previous = side(2, ["a", "b"]);
    const next = side(3, ["a", "b"]);
    const shared = shareEqualParts(previous, next);
    expect(shared).not.toBe(previous);
    expect(shared).toEqual(next);
    expect(shared.hand).toBe(previous.hand);
    expect(shared.status).toBe(next.status);
  });

  it("shares equal array items but not an array whose length changed", () => {
    const previous = side(2, ["a", "b"]);
    const shared = shareEqualParts(previous, side(2, ["a", "b", "c"]));
    expect(shared.hand).not.toBe(previous.hand);
    expect(shared.hand.map((card) => card.id)).toEqual(["a", "b", "c"]);
    expect(shared.hand[0]).toBe(previous.hand[0]);
  });

  it("treats a key that appears or disappears as a change", () => {
    const previous: { readonly a: number; readonly b?: number } = { a: 1 };
    expect(shareEqualParts(previous, { a: 1, b: undefined })).not.toBe(previous);
    const wider = { a: 1, b: 2 };
    const shared = shareEqualParts(wider, previous);
    expect(shared).not.toBe(wider);
    expect(shared).toEqual({ a: 1 });
  });

  it("compares functions, maps, and class instances by identity", () => {
    const run = (): number => 1;
    const map = new Map([["a", 1]]);
    const previous = { run, map };
    expect(shareEqualParts(previous, { run, map })).toBe(previous);
    expect(shareEqualParts(previous, { run: (): number => 1, map }).run).not.toBe(run);
    expect(shareEqualParts(previous, { run, map: new Map([["a", 1]]) }).map).not.toBe(map);
  });
});

describe("shareEqualFields", () => {
  it("returns a new object that shares each unchanged field", () => {
    const previous = { near: side(2, ["a"]), far: side(1, ["b"]) };
    const next = { near: side(2, ["a"]), far: side(1, ["b"]) };
    const shared = shareEqualFields(previous, next);
    expect(shared).not.toBe(previous);
    expect(shared.near).toBe(previous.near);
    expect(shared.far).toBe(previous.far);
  });

  it("returns the next value when there is no previous one", () => {
    const next = { near: side(2, ["a"]) };
    expect(shareEqualFields(null, next)).toBe(next);
  });
});
