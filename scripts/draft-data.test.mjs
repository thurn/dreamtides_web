import { describe, expect, it } from "vitest";
import { compileDraftData } from "./draft-data.mjs";

function fixture() {
  return {
    "schema-version": 1,
    offers: { "cards-per-offer": 4, "picks-per-site": 5 },
    "rarity-caps": [
      {
        rarity: "Special",
        "pool-copy-cap": 2,
        "max-picks-per-run": 3,
      },
      {
        rarity: "Legendary",
        "pool-copy-cap": 1,
        "max-picks-per-run": 1,
      },
    ],
    pool: {
      "default-strategy": "tides4",
      tides4: { "deal-size": 150, "copy-cap": 2, "max-facets": 3 },
    },
  };
}

describe("compileDraftData", () => {
  it("normalizes deterministically and hashes every version-1 field", () => {
    const source = fixture();
    const first = compileDraftData(source);
    const reordered = {
      ...source,
      "rarity-caps": [...source["rarity-caps"]].reverse(),
    };
    const second = compileDraftData(
      Object.fromEntries(Object.entries(reordered).reverse()),
    );

    expect(second).toEqual(first);
    expect(first.rarityCaps.map((cap) => cap.rarity)).toEqual([
      "Legendary",
      "Special",
    ]);
    expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.foldHash).toBe(first.contentHash);

    source.pool.tides4["max-facets"] += 1;
    expect(compileDraftData(source).foldHash).not.toBe(first.foldHash);
  });

  it.each([
    ["unknown root key", (source) => { source.extra = true; }, /unknown key/u],
    ["unknown nested key", (source) => { source.offers.extra = 1; }, /unknown key/u],
    ["unsupported version", (source) => { source["schema-version"] = 2; }, /only schema version 1/u],
    ["unsupported strategy", (source) => { source.pool["default-strategy"] = "retired"; }, /only "tides4"/u],
    ["unknown rarity", (source) => { source["rarity-caps"][0].rarity = "Mythic"; }, /unknown rarity/u],
    ["duplicate rarity", (source) => { source["rarity-caps"][1].rarity = "Special"; }, /duplicate rarity/u],
    ["zero offer size", (source) => { source.offers["cards-per-offer"] = 0; }, /positive integer/u],
    ["fractional picks", (source) => { source.offers["picks-per-site"] = 1.5; }, /positive integer/u],
    ["rarity cap above strategy cap", (source) => { source["rarity-caps"][0]["pool-copy-cap"] = 3; }, /must not exceed/u],
    ["insufficient distinct cards", (source) => { source.pool.tides4["deal-size"] = 38; }, /one site can show 20/u],
  ])("rejects %s", (_label, mutate, pattern) => {
    const source = fixture();
    mutate(source);
    expect(() => compileDraftData(source)).toThrow(pattern);
  });
});
