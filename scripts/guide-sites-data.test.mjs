import { describe, expect, it } from "vitest";
import { SITE_TYPES } from "../src/types/site-type.ts";
import {
  compileDreamGuidesData,
  compileSitesData,
  deriveDreamscapesData,
} from "./guide-sites-data.mjs";

const GUIDE_SITE_TYPES = SITE_TYPES.filter(
  (siteType) => !["Battle", "Draft", "Essence", "Reward"].includes(siteType),
);

function dreamscapesFixture() {
  return [
    {
      id: "fixture-starter",
      name: "Fixture Starter",
      "signature-site": "Draft",
      "is-starter": true,
      "fixed-sites": ["Draft", "Battle"],
    },
    ...GUIDE_SITE_TYPES.map((siteType, index) => ({
      id: `fixture-home-${String(index)}`,
      name: `Fixture Home ${String(index)}`,
      "affiliation-id": `fixture-affiliation-${String(index)}`,
    })),
  ];
}

function guidesFixture() {
  return {
    "schema-version": 1,
    guides: GUIDE_SITE_TYPES.map((siteType, index) => ({
      id: `fixture-guide-${String(index)}`,
      name: `Fixture Guide ${String(index)}`,
      "portrait-source": `fixture-guide-${String(index)}.png`,
      "home-dreamscape-id": `fixture-home-${String(index)}`,
      "site-type": siteType,
      "home-specialty": `Fixture specialty ${String(index)}.`,
      dialogue: {
        site: [`Fixture site line ${String(index)}.`],
        ...(siteType === "RandomSite"
          ? { "random-site": ["Fixture roads."] }
          : {}),
        ...(siteType === "Gamble"
          ? {
              "gamble-three-gate": ["Fixture gates."],
              "gamble-ladder-climb": ["Win {win-essence} Fixture Essence."],
              "gamble-starway-stairs": ["Fixture stairs."],
              "gamble-four-suit-reprise": ["Fixture suits."],
              "gamble-blackjack": ["Fixture blackjack."],
            }
          : {}),
      },
    })),
  };
}

function sitesFixture() {
  const presentation = (type) => {
    if (type === "Battle")
      return {
        kind: "battle",
        label: "Battle",
        "final-boss-label": "Final Boss",
        "locked-guidance": "Locked.",
      };
    if (type === "Draft") return { kind: "draft", label: "Draft {pickCount}x" };
    if (type === "Shop")
      return {
        kind: "shop",
        title: "Shop",
        restocked: "Restocked",
        "restock-offers-action": "Restock Offers",
        "restock-action": "Restock",
        "free-price": "Free",
      };
    if (type === "Purge")
      return {
        kind: "purge",
        title: "Purge",
        instruction: "Choose.",
        "purge-action": "Purge {count}",
      };
    if (type === "DreamsignBazaar")
      return {
        kind: "dreamsign-bazaar",
        title: "Bazaar",
        restocked: "Restocked",
        "restock-offers-action": "Restock Offers",
        "restock-action": "Restock",
        "free-price": "Free",
        "replacement-title": "Replace",
      };
    if (type === "DreamsignRevelation")
      return {
        kind: "dreamsign-revelation",
        loading: "Loading",
        exhausted: "Exhausted",
      };
    if (type === "RandomSite") return { kind: "random-site", title: "Choose" };
    return undefined;
  };
  return {
    "schema-version": 1,
    selection: {
      "min-deck-for-purge": 8,
      "placeable-types": ["Shop", "Purge", "Transfiguration", "Duplication"],
    },
    "site-types": SITE_TYPES.map((type) => ({
      type,
      icon: `fixture-icon-${type}`,
      "glossary-id": `fixture-glossary-${type}`,
      ...(presentation(type) === undefined
        ? {}
        : { presentation: presentation(type) }),
      ...(type === "Duplication"
        ? {
            rules: {
              kind: "duplication",
              "card-choices": {
                "standard-limit": 3,
                "enhanced-limit": "all",
              },
            },
          }
        : {}),
    })),
    "random-site": {
      destinations: ["Shop", "Purge", "Augury", "Gamble"],
      "home-choice-count": 3,
      "insufficient-destinations": "fail",
    },
  };
}

function compileFixture() {
  const sourceDreamscapes = dreamscapesFixture();
  const portraitSources = new Set(
    guidesFixture().guides.map((guide) => guide["portrait-source"]),
  );
  const guides = compileDreamGuidesData(guidesFixture(), {
    dreamscapes: sourceDreamscapes,
    portraitSources,
  });
  const dreamscapes = deriveDreamscapesData(sourceDreamscapes, guides);
  const sites = compileSitesData(sitesFixture(), {
    guides,
    dreamscapes,
    glossaryIds: SITE_TYPES.map((type) => `fixture-glossary-${type}`),
  });
  return { guides, dreamscapes, sites };
}

describe("canonical Dream Guide and Sites compilers", () => {
  it("normalizes complete synthetic catalogs with stable hashes and derived assignments", () => {
    const first = compileFixture();
    const second = compileFixture();
    expect(second).toEqual(first);
    expect(first.guides.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.sites.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.sites.foldHash).toMatch(/^[0-9a-f]{64}$/u);
    for (const guide of first.guides.guides) {
      const home = first.dreamscapes.find(
        (dreamscape) => dreamscape.id === guide.homeDreamscapeId,
      );
      expect(home).toMatchObject({
        guideId: guide.id,
        signatureSite: guide.siteType,
      });
    }
  });

  it("partitions presentation and dialogue from fold-relevant assignments", () => {
    const baseline = compileFixture();
    const presentation = sitesFixture();
    presentation["site-types"][0].icon = "changed-icon";
    const changedPresentation = compileSitesData(presentation, {
      guides: baseline.guides,
      glossaryIds: SITE_TYPES.map((type) => `fixture-glossary-${type}`),
    });
    expect(changedPresentation.contentHash).not.toBe(
      baseline.sites.contentHash,
    );
    expect(changedPresentation.foldHash).toBe(baseline.sites.foldHash);

    const changedRules = sitesFixture();
    changedRules["site-types"].find(
      (metadata) => metadata.type === "Duplication",
    ).rules["card-choices"]["standard-limit"] = 4;
    const compiledRules = compileSitesData(changedRules, {
      guides: baseline.guides,
      glossaryIds: SITE_TYPES.map((type) => `fixture-glossary-${type}`),
    });
    expect(compiledRules.foldHash).not.toBe(baseline.sites.foldHash);

    const guideSource = guidesFixture();
    guideSource.guides[0].dialogue.site = ["Changed dialogue."];
    const changedGuides = compileDreamGuidesData(guideSource, {
      dreamscapes: dreamscapesFixture(),
    });
    expect(changedGuides.contentHash).not.toBe(baseline.guides.contentHash);

    const reassigned = guidesFixture();
    const firstHome = reassigned.guides[0]["home-dreamscape-id"];
    reassigned.guides[0]["home-dreamscape-id"] =
      reassigned.guides[1]["home-dreamscape-id"];
    reassigned.guides[1]["home-dreamscape-id"] = firstHome;
    const reassignedGuides = compileDreamGuidesData(reassigned, {
      dreamscapes: dreamscapesFixture(),
    });
    const reassignedSites = compileSitesData(sitesFixture(), {
      guides: reassignedGuides,
      glossaryIds: SITE_TYPES.map((type) => `fixture-glossary-${type}`),
    });
    expect(reassignedSites.foldHash).not.toBe(baseline.sites.foldHash);
  });

  it("rejects missing relationships, dialogue contexts, template slots, and portraits", () => {
    const missingHome = guidesFixture();
    missingHome.guides[1]["home-dreamscape-id"] =
      missingHome.guides[0]["home-dreamscape-id"];
    expect(() => compileDreamGuidesData(missingHome)).toThrow(
      /values must be unique/u,
    );

    const missingRandomDialogue = guidesFixture();
    delete missingRandomDialogue.guides.find(
      (guide) => guide["site-type"] === "RandomSite",
    ).dialogue["random-site"];
    expect(() => compileDreamGuidesData(missingRandomDialogue)).toThrow(
      /requires random-site context/u,
    );

    const missingSlot = guidesFixture();
    missingSlot.guides.find(
      (guide) => guide["site-type"] === "Gamble",
    ).dialogue["gamble-ladder-climb"] = ["Missing slot."];
    expect(() => compileDreamGuidesData(missingSlot)).toThrow(/win-essence/u);

    const portraitSources = new Set(
      guidesFixture()
        .guides.slice(1)
        .map((guide) => guide["portrait-source"]),
    );
    expect(() =>
      compileDreamGuidesData(guidesFixture(), { portraitSources }),
    ).toThrow(/unresolved portrait source/u);
  });

  it("rejects incomplete metadata, glossary links, Random Site rules, and obsolete Gamble data", () => {
    const compiledGuides = compileDreamGuidesData(guidesFixture());
    const catalogs = {
      guides: compiledGuides,
      glossaryIds: SITE_TYPES.map((type) => `fixture-glossary-${type}`),
    };
    const missingMetadata = sitesFixture();
    missingMetadata["site-types"].pop();
    expect(() => compileSitesData(missingMetadata, catalogs)).toThrow(
      /missing metadata/u,
    );

    const missingDuplicationRules = sitesFixture();
    delete missingDuplicationRules["site-types"].find(
      (metadata) => metadata.type === "Duplication",
    ).rules;
    expect(() => compileSitesData(missingDuplicationRules, catalogs)).toThrow(
      /site-types\[6\]\.rules/u,
    );

    const misplacedDuplicationRules = sitesFixture();
    misplacedDuplicationRules["site-types"].find(
      (metadata) => metadata.type === "Shop",
    ).rules = {
      kind: "duplication",
      "card-choices": { "standard-limit": 3, "enhanced-limit": "all" },
    };
    expect(() => compileSitesData(misplacedDuplicationRules, catalogs)).toThrow(
      /Shop does not define rules/u,
    );

    expect(() =>
      compileSitesData(sitesFixture(), {
        ...catalogs,
        glossaryIds: catalogs.glossaryIds.slice(1),
      }),
    ).toThrow(/unresolved glossary id/u);

    const badRandom = sitesFixture();
    badRandom["random-site"].destinations[0] = "Battle";
    expect(() => compileSitesData(badRandom, catalogs)).toThrow(
      /cannot be materialized/u,
    );

    const twoHomeChoices = sitesFixture();
    twoHomeChoices["random-site"]["home-choice-count"] = 2;
    expect(
      compileSitesData(twoHomeChoices, catalogs).randomSite.homeChoiceCount,
    ).toBe(2);

    const oneHomeChoice = sitesFixture();
    oneHomeChoice["random-site"]["home-choice-count"] = 1;
    expect(() => compileSitesData(oneHomeChoice, catalogs)).toThrow(
      /between 2 and 3/u,
    );

    const tooManyHomeChoices = sitesFixture();
    tooManyHomeChoices["random-site"]["home-choice-count"] = 4;
    expect(() => compileSitesData(tooManyHomeChoices, catalogs)).toThrow(
      /between 2 and 3/u,
    );

    const obsoleteGamble = { ...sitesFixture(), gamble: {} };
    expect(() => compileSitesData(obsoleteGamble, catalogs)).toThrow(
      /root.gamble: unknown key/u,
    );
  });
});
