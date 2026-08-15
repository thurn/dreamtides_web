import { describe, expect, it } from "vitest";
import {
  FIGMENT_CATALOG,
  FIGMENT_CATALOG_ENTRIES,
  lookupFigmentCatalogEntry,
  normalizeFigmentCatalogKey,
} from "./figment-catalog";

describe("figment catalog", () => {
  it("contains exactly the 10 authored figment types", () => {
    expect(FIGMENT_CATALOG_ENTRIES).toHaveLength(10);
    expect(Object.keys(FIGMENT_CATALOG)).toHaveLength(10);
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

  it("assigns keywords to exactly the two types that carry one", () => {
    const keywordsByKey = new Map(
      FIGMENT_CATALOG_ENTRIES.filter((entry) => entry.keyword !== undefined).map(
        (entry) => [entry.key, entry.keyword],
      ),
    );

    expect(keywordsByKey).toEqual(
      new Map([
        ["wraith", "vengeful"],
        ["ember", "awakened"],
      ]),
    );
  });

  it("leaves the other eight types without a keyword", () => {
    const keywordless = FIGMENT_CATALOG_ENTRIES.filter(
      (entry) => entry.keyword === undefined,
    ).map((entry) => entry.key);

    expect(new Set(keywordless)).toEqual(
      new Set([
        "warrior",
        "shadow",
        "spirit animal",
        "monstrosity",
        "survivor",
        "ethereal",
        "outsider",
        "legion",
      ]),
    );
  });

  it("looks entries up case-insensitively with surrounding whitespace tolerated", () => {
    expect(lookupFigmentCatalogEntry("Warrior")?.baseSpark).toBe(
      FIGMENT_CATALOG[normalizeFigmentCatalogKey("Warrior")].baseSpark,
    );
    expect(lookupFigmentCatalogEntry("  WRAITH  ")?.keyword).toBe("vengeful");
    expect(lookupFigmentCatalogEntry("Spirit Animal")).toBe(
      FIGMENT_CATALOG[normalizeFigmentCatalogKey("Spirit Animal")],
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
        "ember": 1,
        "ethereal": 1,
        "legion": 1,
        "monstrosity": 4,
        "outsider": 1,
        "shadow": 2,
        "spirit animal": 1,
        "survivor": 1,
        "warrior": 1,
        "wraith": 0,
      }
    `);
  });
});
