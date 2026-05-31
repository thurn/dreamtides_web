import { describe, expect, it } from "vitest";
import { detectMissingFonts, REQUIRED_FONTS } from "./verify-fonts";

describe("detectMissingFonts", () => {
  it("returns no fonts when every required family is available", () => {
    const missing = detectMissingFonts(() => true);
    expect(missing).toEqual([]);
  });

  it("returns every required font when none are available", () => {
    const missing = detectMissingFonts(() => false);
    expect(missing).toEqual(REQUIRED_FONTS);
  });

  it("returns only the families the predicate reports as missing", () => {
    const missing = detectMissingFonts(
      (family) => family !== "Anton",
    );
    expect(missing.map((font) => font.family)).toEqual(["Anton"]);
  });

  it("describes the usage of each required font", () => {
    expect(REQUIRED_FONTS.map((font) => font.family)).toEqual([
      "EB Garamond",
      "Fira Sans Condensed",
      "Anton",
    ]);
    for (const font of REQUIRED_FONTS) {
      expect(font.usage).toBeTruthy();
    }
  });
});
