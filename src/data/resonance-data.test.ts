import { describe, expect, it } from "vitest";
import { isResonance, parseResonanceData, resonance } from "./resonance-data";

function syntheticData(): unknown {
  return {
    schemaVersion: 1,
    contentHash: "a".repeat(64),
    resonances: [
      ["ember", "tideEmber"],
      ["valor", "tideValor"],
      ["vision", "tideVision"],
      ["wild", "tideWild"],
      ["shadow", "tideShadow"],
    ].map(([id, glyph]) => ({
      id,
      displayName: `Fixture ${id}`,
      glyph,
      accentColor: "#123456",
      chipBackground: "#111111",
      chipBorder: "rgba(1, 2, 3, 0.5)",
      accessibilityName: `Fixture ${id} resonance`,
    })),
  };
}

describe("resonance data", () => {
  it("recognizes only catalog resonance identities", () => {
    expect(isResonance("valor")).toBe(true);
    expect(isResonance("purple")).toBe(false);
  });

  it("resolves semantic identity from injected catalog data", () => {
    const data = parseResonanceData(syntheticData());
    expect(resonance("ember", data).id).toBe("ember");
  });

  it("accepts reordered entries and rejects missing or malformed presentation", () => {
    const reordered = structuredClone(syntheticData()) as {
      resonances: unknown[];
    };
    reordered.resonances.reverse();
    expect(parseResonanceData(reordered).resonances[0].id).toBe("shadow");

    const missing = structuredClone(syntheticData()) as {
      resonances: unknown[];
    };
    missing.resonances.pop();
    expect(() => parseResonanceData(missing)).toThrow(/malformed/u);

    const invalid = structuredClone(syntheticData()) as {
      resonances: Array<Record<string, unknown>>;
    };
    invalid.resonances[0].accentColor = "orange";
    expect(() => parseResonanceData(invalid)).toThrow(/malformed/u);
  });
});
