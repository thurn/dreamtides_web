import { describe, expect, it } from "vitest";
import type { ResonanceData } from "../../../types/resonance-data";
import { testContentHash } from "../../../types/test-identities";
import {
  tideAccessibilityName,
  tideResonanceLabel,
  tideVisual,
} from "./tide-spec";

const SYNTHETIC_DATA = {
  schemaVersion: 1,
  contentHash: testContentHash("a"),
  resonances: [
    {
      id: "ember",
      displayName: "Synthetic Name",
      glyph: "tideEmber",
      accentColor: "#123456",
      chipBackground: "#111111",
      chipBorder: "rgba(1, 2, 3, 0.5)",
      accessibilityName: "Synthetic accessibility name",
    },
  ],
} satisfies ResonanceData;

describe("tide-spec", () => {
  it("projects names, accessibility, glyphs, and colors from injected data", () => {
    expect(tideResonanceLabel("ember", SYNTHETIC_DATA)).toBe(
      SYNTHETIC_DATA.resonances[0].displayName,
    );
    expect(tideAccessibilityName("ember", SYNTHETIC_DATA)).toBe(
      SYNTHETIC_DATA.resonances[0].accessibilityName,
    );
    expect(tideVisual("ember", SYNTHETIC_DATA).fg).toBe(
      SYNTHETIC_DATA.resonances[0].accentColor,
    );
  });
});
