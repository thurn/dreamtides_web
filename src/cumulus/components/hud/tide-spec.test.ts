import { describe, expect, it } from "vitest";
import type { TideAlignmentsData } from "../../../types/tide-alignments-data";
import {
  tideAccessibilityName,
  tideAlignmentLabel,
  tideVisual,
} from "./tide-spec";

const SYNTHETIC_DATA = {
  schemaVersion: 1,
  contentHash: "a".repeat(64),
  alignments: [
    {
      id: "ember",
      deckColor: "orange",
      displayName: "Synthetic Name",
      glyph: "tideEmber",
      accentColor: "#123456",
      chipBackground: "#111111",
      chipBorder: "rgba(1, 2, 3, 0.5)",
      accessibilityName: "Synthetic accessibility name",
    },
  ],
} as TideAlignmentsData;

describe("tide-spec", () => {
  it("projects names, accessibility, glyphs, and colors from injected data", () => {
    expect(tideAlignmentLabel("ember", SYNTHETIC_DATA)).toBe(
      SYNTHETIC_DATA.alignments[0].displayName,
    );
    expect(tideAccessibilityName("ember", SYNTHETIC_DATA)).toBe(
      SYNTHETIC_DATA.alignments[0].accessibilityName,
    );
    expect(tideVisual("ember", SYNTHETIC_DATA).fg).toBe(
      SYNTHETIC_DATA.alignments[0].accentColor,
    );
  });
});
