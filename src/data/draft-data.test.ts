import { afterEach, describe, expect, it, vi } from "vitest";
import { draftDataFixture } from "../testing/draft-data-fixture";
import type { DraftData } from "../types/draft-data";
import { loadDraftData, parseDraftData } from "./draft-data";

const HASH = "a".repeat(64);

function fixture() {
  return draftDataFixture({ contentHash: HASH, foldHash: HASH });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseDraftData", () => {
  it("accepts the normalized compiler artifact", () => {
    expect(parseDraftData(fixture())).toEqual(fixture());
  });

  const invalidCases: Array<[string, (value: DraftData) => void]> = [
    ["unknown key", (value) => Object.assign(value.offers, { extra: 1 })],
    ["mismatched fold hash", (value) => { value.foldHash = "b".repeat(64); }],
    ["invalid numeric range", (value) => { value.pool.tides4.maxFacets = 0; }],
    ["duplicate rarity", (value) => { value.rarityCaps.push({ ...value.rarityCaps[0] }); }],
    ["cap relationship", (value) => { value.rarityCaps[0].poolCopyCap = 3; }],
    ["site capacity", (value) => { value.pool.tides4.dealSize = 38; }],
  ];

  it.each(invalidCases)("rejects %s", (_label, mutate) => {
    const value = fixture();
    mutate(value);
    expect(() => parseDraftData(value)).toThrow(/malformed draft-data/u);
  });
});

describe("loadDraftData", () => {
  it("loads the compiled artifact from the public path", async () => {
    const value = fixture();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(value),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadDraftData()).resolves.toEqual(value);
    expect(fetchMock).toHaveBeenCalledWith("/draft-data.json");
  });

  it("reports HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: "Missing" }),
    );
    await expect(loadDraftData()).rejects.toThrow(/404 Missing/u);
  });
});
