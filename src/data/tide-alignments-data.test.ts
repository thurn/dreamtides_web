import { describe, expect, it } from "vitest";
import {
  parseTideAlignmentsData,
  tideAlignment,
  tideAlignmentForDeckColor,
} from "./tide-alignments-data";

function syntheticData(): unknown {
  return {
    schemaVersion: 1,
    contentHash: "a".repeat(64),
    alignments: [
      ["ember", "orange", "tideEmber"],
      ["valor", "yellow", "tideValor"],
      ["vision", "blue", "tideVision"],
      ["wild", "green", "tideWild"],
      ["shadow", "purple", "tideShadow"],
    ].map(([id, deckColor, glyph]) => ({
      id,
      deckColor,
      displayName: `Fixture ${id}`,
      glyph,
      accentColor: "#123456",
      chipBackground: "#111111",
      chipBorder: "rgba(1, 2, 3, 0.5)",
      accessibilityName: `Fixture ${id} alignment`,
    })),
  };
}

describe("tide alignments data", () => {
  it("resolves semantic identity and deck color from injected catalog data", () => {
    const data = parseTideAlignmentsData(syntheticData());
    expect(tideAlignment("ember", data).id).toBe("ember");
    expect(tideAlignmentForDeckColor("orange", data).id).toBe("ember");
  });

  it("accepts reordered entries and rejects missing or malformed presentation", () => {
    const reordered = structuredClone(syntheticData()) as {
      alignments: unknown[];
    };
    reordered.alignments.reverse();
    expect(parseTideAlignmentsData(reordered).alignments[0].id).toBe("shadow");

    const missing = structuredClone(syntheticData()) as {
      alignments: unknown[];
    };
    missing.alignments.pop();
    expect(() => parseTideAlignmentsData(missing)).toThrow(/malformed/u);

    const invalid = structuredClone(syntheticData()) as {
      alignments: Array<Record<string, unknown>>;
    };
    invalid.alignments[0].accentColor = "orange";
    expect(() => parseTideAlignmentsData(invalid)).toThrow(/malformed/u);
  });
});
