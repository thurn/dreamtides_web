import { describe, expect, it } from "vitest";
import { draftDataFixture } from "../testing/draft-data-fixture";
import type { DraftData } from "../types/draft-data";
import { parseDraftData } from "./draft-data";
import { testContentHash, testFoldHash } from "../types/test-identities";

const CONTENT_HASH = testContentHash("a");
const FOLD_HASH = testFoldHash("a");

function fixture() {
  return draftDataFixture({ contentHash: CONTENT_HASH, foldHash: FOLD_HASH });
}

describe("parseDraftData", () => {
  it("accepts the normalized compiler artifact", () => {
    expect(parseDraftData(fixture())).toEqual(fixture());
  });

  const invalidCases: Array<[string, (value: DraftData) => void]> = [
    ["unknown key", (value) => Object.assign(value.offers, { extra: 1 })],
    [
      "invalid fold hash",
      (value) => {
        Object.defineProperty(value, "foldHash", { value: "invalid" });
      },
    ],
    [
      "invalid numeric range",
      (value) => {
        value.pool.tides4.maxFacets = 0;
      },
    ],
    [
      "duplicate rarity",
      (value) => {
        value.rarityCaps.push({ ...value.rarityCaps[0] });
      },
    ],
    [
      "cap relationship",
      (value) => {
        value.rarityCaps[0].poolCopyCap = 3;
      },
    ],
    [
      "site capacity",
      (value) => {
        value.pool.tides4.dealSize = 38;
      },
    ],
  ];

  it.each(invalidCases)("rejects %s", (_label, mutate) => {
    const value = fixture();
    mutate(value);
    expect(() => parseDraftData(value)).toThrow(/malformed draft document/u);
  });
});
