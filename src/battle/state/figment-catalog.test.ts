import { describe, expect, it } from "vitest";
import {
  FIGMENT_CATALOG,
  FIGMENT_CATALOG_ENTRIES,
  lookupFigmentCatalogEntry,
  normalizeFigmentCatalogKey,
} from "./figment-catalog";

describe("figment catalog", () => {
  it("contains exactly the 14 figment types", () => {
    expect(FIGMENT_CATALOG_ENTRIES).toHaveLength(14);
    expect(Object.keys(FIGMENT_CATALOG)).toHaveLength(14);
  });

  it("keys each entry by its own normalized subtype", () => {
    for (const entry of FIGMENT_CATALOG_ENTRIES) {
      expect(entry.key).toBe(normalizeFigmentCatalogKey(entry.subtype));
      expect(FIGMENT_CATALOG[entry.key]).toBe(entry);
    }
  });

  it("uses unique keys with no duplicate subtypes", () => {
    const keys = FIGMENT_CATALOG_ENTRIES.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every entry a non-negative integer base spark", () => {
    for (const entry of FIGMENT_CATALOG_ENTRIES) {
      expect(Number.isInteger(entry.baseSpark)).toBe(true);
      expect(entry.baseSpark).toBeGreaterThanOrEqual(0);
    }
  });

  it("assigns keywords to exactly the five types that carry one", () => {
    const keywordsByKey = new Map(
      FIGMENT_CATALOG_ENTRIES.filter((entry) => entry.keyword !== undefined).map(
        (entry) => [entry.key, entry.keyword],
      ),
    );

    expect(keywordsByKey).toEqual(
      new Map([
        ["ancient", "unstoppable"],
        ["synth", "support"],
        ["celestial", "preeminence"],
        ["wraith", "vengeful"],
        ["ember", "awakened"],
      ]),
    );
  });

  it("leaves the other nine types without a keyword", () => {
    const keywordless = FIGMENT_CATALOG_ENTRIES.filter(
      (entry) => entry.keyword === undefined,
    ).map((entry) => entry.key);

    expect(new Set(keywordless)).toEqual(
      new Set([
        "warrior",
        "enigma",
        "shadow",
        "spirit animal",
        "monstrosity",
        "survivor",
        "ethereal",
        "radiant",
        "outsider",
      ]),
    );
  });

  it("looks entries up case-insensitively with surrounding whitespace tolerated", () => {
    expect(lookupFigmentCatalogEntry("Warrior")?.baseSpark).toBe(
      FIGMENT_CATALOG.warrior.baseSpark,
    );
    expect(lookupFigmentCatalogEntry("  ANCIENT  ")?.keyword).toBe("unstoppable");
    expect(lookupFigmentCatalogEntry("Spirit Animal")).toBe(
      FIGMENT_CATALOG["spirit animal"],
    );
  });

  it("returns undefined for unknown subtypes", () => {
    expect(lookupFigmentCatalogEntry("dragon")).toBeUndefined();
    expect(lookupFigmentCatalogEntry("")).toBeUndefined();
  });

  it("matches the rules §Figments base-spark table", () => {
    const baseSparkByKey = Object.fromEntries(
      FIGMENT_CATALOG_ENTRIES.map((entry) => [entry.key, entry.baseSpark]),
    );

    expect(baseSparkByKey).toMatchInlineSnapshot(`
      {
        "ancient": 4,
        "celestial": 2,
        "ember": 1,
        "enigma": 0,
        "ethereal": 1,
        "monstrosity": 4,
        "outsider": 1,
        "radiant": 2,
        "shadow": 2,
        "spirit animal": 1,
        "survivor": 1,
        "synth": 0,
        "warrior": 1,
        "wraith": 0,
      }
    `);
  });
});
