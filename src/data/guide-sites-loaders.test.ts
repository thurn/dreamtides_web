import { describe, expect, it } from "vitest";
import { MINIMAL_SITES_DATA } from "../testing/atlas-fixtures";
import type { SiteType } from "../types/site-type";
import type { SitesData } from "../types/sites-data";
import { parseDreamGuides } from "./dreamscapes";
import { parseSitesData, siteTypeIcon } from "./sites-data";
import { testDreamscapeId, testGlossaryEntryId, testGuideId } from "../types/test-identities";

const GUIDE_CATALOG = {
  schemaVersion: 1,
  contentHash: "a".repeat(64),
  guides: [
    {
      id: "fixture-guide",
      name: "Fixture Guide",
      portraitSource: "fixture-guide.png",
      homeDreamscapeId: testDreamscapeId("fixture-home"),
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

describe("compiled guide and site artifact loaders", () => {
  it("accepts structurally complete versioned artifacts", () => {
    expect(parseDreamGuides(GUIDE_CATALOG)).toHaveLength(1);
    expect(parseSitesData(MINIMAL_SITES_DATA)).toEqual(MINIMAL_SITES_DATA);
  });

  it("rejects malformed guide dialogue and obsolete Gamble site data", () => {
    const guides = structuredClone(GUIDE_CATALOG);
    guides.guides[0].dialogue.site = [];
    expect(() => parseDreamGuides(guides)).toThrow();

    const sites = {
      ...structuredClone(MINIMAL_SITES_DATA),
      gamble: { obsolete: true },
    };
    expect(() => parseSitesData(sites)).toThrow();
  });

  it("rejects malformed site rules that affect deterministic folding", () => {
    const mutations: Array<(sites: MutableSitesData) => void> = [
      (sites) => {
        sites.randomSite.destinations = ["Battle" as never];
      },
      (sites) => {
        sites.randomSite.homeChoiceCount = 4;
      },
      (sites) => {
        sites.siteTypes.Shop.glossaryId = testGlossaryEntryId(
          "missing-fixture-glossary",
        );
      },
      (sites) => {
        const rules = sites.siteTypes.Duplication.rules;
        if (rules?.kind === "duplication") {
          rules.cardChoices.standardLimit = Number.NaN;
        }
      },
      (sites) => {
        sites.guideAssignments.RandomSite = {
          guideId: testGuideId("wrong-guide"),
          homeDreamscapeId: testDreamscapeId("fixture-home"),
        };
      },
    ];

    for (const mutate of mutations) {
      const sites = structuredClone(
        MINIMAL_SITES_DATA,
      ) as unknown as MutableSitesData;
      mutate(sites);
      expect(() => parseSitesData(sites)).toThrow();
    }
  });

  it("throws when requested site metadata is absent", () => {
    expect(() =>
      siteTypeIcon(MINIMAL_SITES_DATA, "UnknownSite" as SiteType),
    ).toThrow(/Missing Sites metadata for UnknownSite/u);
  });

  it("enforces site-specific guide contexts and template slots at runtime", () => {
    const randomGuide = structuredClone(GUIDE_CATALOG);
    randomGuide.guides[0].siteType = "RandomSite";
    expect(() => parseDreamGuides(randomGuide)).toThrow();

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
    expect(() => parseDreamGuides(gambleGuide)).toThrow();

    gambleDialogue["gamble-ladder-climb"] = ["Win {unexpected-slot} Essence."];
    expect(() => parseDreamGuides(gambleGuide)).toThrow();
  });
});
