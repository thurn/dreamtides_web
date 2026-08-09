import { afterEach, describe, expect, it, vi } from "vitest";
import { MINIMAL_SITES_DATA } from "../__test-helpers__/atlas-fixtures";
import type { SitesData } from "../types/sites-data";
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

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;
type MutableSitesData = Mutable<SitesData>;

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

  it("rejects malformed guide dialogue and obsolete Gamble site data", async () => {
    const guides = structuredClone(GUIDE_CATALOG);
    guides.guides[0].dialogue.site = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(guides))),
    );
    await expect(loadDreamGuides()).rejects.toThrow(
      /malformed dream-guides-data/u,
    );

    const sites = {
      ...structuredClone(MINIMAL_SITES_DATA),
      gamble: { obsolete: true },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(sites))),
    );
    await expect(loadSitesData()).rejects.toThrow(/malformed sites-data/u);
  });

  it("rejects malformed site rules that affect deterministic folding", async () => {
    const mutations: Array<(sites: MutableSitesData) => void> = [
      (sites) => {
        sites.randomSite.destinations = ["Battle" as never];
      },
      (sites) => {
        sites.randomSite.homeChoiceCount = 4;
      },
      (sites) => {
        sites.siteTypes.Shop.glossaryId = "missing-fixture-glossary";
      },
      (sites) => {
        sites.cardChoices.duplication.standardLimit = Number.NaN;
      },
      (sites) => {
        sites.guideAssignments.RandomSite = {
          guideId: "wrong-guide",
          homeDreamscapeId: "fixture-home",
        };
      },
    ];

    for (const mutate of mutations) {
      const sites = structuredClone(MINIMAL_SITES_DATA) as MutableSitesData;
      mutate(sites);
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(response(sites))),
      );
      await expect(loadSitesData()).rejects.toThrow(/malformed sites-data/u);
    }
  });

  it("enforces site-specific guide contexts and template slots at runtime", async () => {
    const randomGuide = structuredClone(GUIDE_CATALOG);
    randomGuide.guides[0].siteType = "RandomSite";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(randomGuide))),
    );
    await expect(loadDreamGuides()).rejects.toThrow(
      /malformed dream-guides-data/u,
    );

    const gambleGuide = structuredClone(GUIDE_CATALOG);
    gambleGuide.guides[0].siteType = "Gamble";
    const gambleDialogue: Record<string, string[]> & { site: string[] } = {
      site: ["Fixture line."],
      "gamble-three-gate": ["Fixture gates."],
      "gamble-ladder-climb": ["Fixture ladder without its slot."],
      "gamble-starway-stairs": ["Fixture stairs."],
      "gamble-four-suit-reprise": ["Fixture suits."],
      "gamble-blackjack": ["Fixture blackjack."],
    };
    gambleGuide.guides[0].dialogue = gambleDialogue;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(gambleGuide))),
    );
    await expect(loadDreamGuides()).rejects.toThrow(
      /malformed dream-guides-data/u,
    );

    gambleDialogue["gamble-ladder-climb"] = ["Win {unexpected-slot} Essence."];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response(gambleGuide))),
    );
    await expect(loadDreamGuides()).rejects.toThrow(
      /malformed dream-guides-data/u,
    );
  });
});
