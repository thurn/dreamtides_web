import { afterEach, describe, expect, it, vi } from "vitest";
import { MINIMAL_SITES_DATA } from "../__test-helpers__/atlas-fixtures";
import { loadDreamGuides } from "./dreamscapes";
import { loadSitesData } from "./sites-data";

function response(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(value),
  } as Response;
}

const GUIDE_CATALOG = {
  schemaVersion: 1,
  contentHash: "a".repeat(64),
  guides: [
    {
      id: "fixture-guide",
      name: "Fixture Guide",
      portraitSource: "fixture-guide.png",
      homeDreamscapeId: "fixture-home",
      siteType: "Shop",
      homeSpecialty: "Fixture specialty.",
      dialogue: { site: ["Fixture line."] },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compiled guide and site artifact loaders", () => {
  it("accepts structurally complete versioned artifacts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          response(
            url.includes("sites-data") ? MINIMAL_SITES_DATA : GUIDE_CATALOG,
          ),
        ),
      ),
    );
    await expect(loadDreamGuides()).resolves.toHaveLength(1);
    await expect(loadSitesData()).resolves.toEqual(MINIMAL_SITES_DATA);
  });

  it("rejects malformed guide dialogue and incomplete site rule tables", async () => {
    const guides = structuredClone(GUIDE_CATALOG);
    guides.guides[0].dialogue.site = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(guides))),
    );
    await expect(loadDreamGuides()).rejects.toThrow(
      /malformed dream-guides-data/u,
    );

    const sites = structuredClone(MINIMAL_SITES_DATA);
    sites.gamble.ladderClimb.attempts =
      sites.gamble.ladderClimb.attempts.slice(1);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(sites))),
    );
    await expect(loadSitesData()).rejects.toThrow(/malformed sites-data/u);
  });
});
