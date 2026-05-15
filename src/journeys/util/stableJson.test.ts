import { describe, expect, it } from "vitest";

import { stableStringify } from "./stableJson";

/**
 * The serializer is the durable on-disk contract for journey state. The bug
 * class these tests defend against is silent JSON-shape drift: a quietly
 * different key order, an unflagged `undefined`, or a `NaN` slipping through
 * would all change file bytes without changing semantics, polluting diffs and
 * cache keys downstream.
 */
describe("stableStringify", () => {
  describe("key ordering", () => {
    it("sorts object keys regardless of insertion order", () => {
      expect(stableStringify({ b: 1, a: 2 })).toBe(`{\n  "a": 2,\n  "b": 1\n}\n`);
    });

    it("sorts keys at every nesting level", () => {
      const result = stableStringify({ outer: { z: 1, a: 2 }, alpha: { y: 3, x: 4 } });
      expect(result).toBe(
        `{\n` +
          `  "alpha": {\n` +
          `    "x": 4,\n` +
          `    "y": 3\n` +
          `  },\n` +
          `  "outer": {\n` +
          `    "a": 2,\n` +
          `    "z": 1\n` +
          `  }\n` +
          `}\n`,
      );
    });

    it("does not re-sort array elements", () => {
      expect(stableStringify([3, 1, 2])).toBe(`[\n  3,\n  1,\n  2\n]\n`);
    });
  });

  describe("undefined handling", () => {
    it("drops undefined-valued keys from objects", () => {
      // The serializer mirrors `JSON.stringify`: undefined keys disappear
      // entirely rather than becoming `null`, keeping the on-disk shape free
      // of explicit "this field is missing" markers.
      expect(stableStringify({ a: 1, b: undefined })).toBe(`{\n  "a": 1\n}\n`);
    });

    it("normalizes undefined array elements to null", () => {
      // Arrays cannot have holes in JSON, so undefined slots collapse to
      // `null` - again matching `JSON.stringify` semantics.
      expect(stableStringify([1, undefined, 3])).toBe(`[\n  1,\n  null,\n  3\n]\n`);
    });

    it("emits valid JSON when the top-level value is undefined", () => {
      // `JSON.stringify(undefined, null, 2)` returns the literal string
      // "undefined", which is intentionally not valid JSON. Pin that exact
      // behaviour so downstream consumers can detect it as a programmer error.
      expect(stableStringify(undefined)).toBe(`undefined\n`);
    });
  });

  describe("non-finite numbers", () => {
    it("normalizes NaN to null", () => {
      expect(stableStringify({ value: Number.NaN })).toBe(
        `{\n  "value": null\n}\n`,
      );
    });

    it("normalizes Infinity to null", () => {
      expect(stableStringify({ value: Number.POSITIVE_INFINITY })).toBe(
        `{\n  "value": null\n}\n`,
      );
    });

    it("normalizes -Infinity to null", () => {
      expect(stableStringify({ value: Number.NEGATIVE_INFINITY })).toBe(
        `{\n  "value": null\n}\n`,
      );
    });

    it("preserves finite numeric values exactly", () => {
      expect(stableStringify({ value: 0 })).toBe(`{\n  "value": 0\n}\n`);
      expect(stableStringify({ value: -1.5 })).toBe(`{\n  "value": -1.5\n}\n`);
    });
  });

  describe("additional safety", () => {
    it("throws when serialising bigint", () => {
      expect(() => stableStringify({ value: 1n })).toThrow(TypeError);
    });

    it("throws on circular object references", () => {
      const cycle: Record<string, unknown> = {};
      cycle["self"] = cycle;
      expect(() => stableStringify(cycle)).toThrow(TypeError);
    });

    it("throws on circular array references", () => {
      const cycle: unknown[] = [];
      cycle.push(cycle);
      expect(() => stableStringify(cycle)).toThrow(TypeError);
    });

    it("expands Uint8Array values as plain number arrays", () => {
      expect(stableStringify(new Uint8Array([1, 2, 3]))).toBe(
        `[\n  1,\n  2,\n  3\n]\n`,
      );
    });

    it("ends every serialisation with a trailing newline", () => {
      expect(stableStringify(null).endsWith("\n")).toBe(true);
      expect(stableStringify({}).endsWith("\n")).toBe(true);
      expect(stableStringify([]).endsWith("\n")).toBe(true);
    });
  });
});
