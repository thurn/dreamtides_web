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
const GAME_IDS = [
  "gravok-three-gate-wager",
  "tidemark-ladder-climb",
  "starway-stairs",
  "four-suit-reprise",
  "blackjack",
];

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
  return {
    "schema-version": 1,
    "site-types": SITE_TYPES.map((type) => ({
      type,
      icon: `fixture-icon-${type}`,
      "glossary-id": `fixture-glossary-${type}`,
    })),
    "fallback-site-type": {
      icon: "fixture-fallback-icon",
      name: "Fixture Unknown Site",
      description: "A synthetic unknown site.",
    },
    "random-site": {
      destinations: ["Shop", "Purge", "Augury", "Gamble"],
      "home-choice-count": 3,
      "away-choice-count": 1,
      "insufficient-destinations": "fail",
    },
    "card-choices": {
      transfiguration: { "standard-limit": 3, "enhanced-limit": "all" },
      duplication: { "standard-limit": 3, "enhanced-limit": "all" },
    },
    gamble: {
      selection: {
        "fallback-game": GAME_IDS[0],
        games: GAME_IDS.map((id) => ({ id, weight: 1 })),
      },
      "three-gate": {
        "max-retries": 2,
        gates: [
          {
            id: "six",
            name: "Six",
            threshold: "6",
            "odds-numerator": 36,
            "odds-denominator": 52,
            "awards-dreamsign": false,
          },
          {
            id: "nine",
            name: "Nine",
            threshold: "9",
            "odds-numerator": 24,
            "odds-denominator": 52,
            "awards-dreamsign": false,
          },
          {
            id: "jack",
            name: "Jack",
            threshold: "J",
            "odds-numerator": 16,
            "odds-denominator": 52,
            "awards-dreamsign": true,
          },
        ],
      },
      "ladder-climb": {
        "strong-pool-limit": 20,
        attempts: ["Q", "10", "8", "6"].map((threshold, index) => ({
          attempt: index + 1,
          threshold,
          "odds-numerator": 12 + index * 8,
          "odds-denominator": 52,
        })),
      },
      "starway-stairs": {
        "max-retries": 2,
        tiers: ["2", "4", "7"].map((rank, index) => ({
          tier: index + 1,
          "highest-bust-rank": rank,
          "bust-odds-numerator": 4 + index * 8,
          "odds-denominator": 52,
        })),
      },
      "four-suit-reprise": {
        "max-rounds": 3,
        "odds-numerator": 13,
        "odds-denominator": 52,
        outcomes: [
          { suit: "spades", outcome: "transfiguration", label: "Transfigure" },
          { suit: "diamonds", outcome: "essence", label: "Essence" },
          { suit: "hearts", outcome: "duplication", label: "Duplicate" },
          { suit: "clubs", outcome: "purge", label: "Purge" },
        ],
      },
    },
  };
}

function economyFixture() {
  return {
    gamble: {
      ladderClimb: {
        attempts: Array.from({ length: 4 }, (_, index) => ({
          attempt: index + 1,
        })),
      },
      starwayStairs: {
        tiers: Array.from({ length: 3 }, (_, index) => ({ tier: index + 1 })),
      },
      fourSuitReprise: {
        standardDrawPrice: 25,
        enhancedDrawPrice: 15,
        essenceReward: 100,
      },
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
    economy: economyFixture(),
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

  it("partitions presentation and dialogue from fold-relevant assignments and rules", () => {
    const baseline = compileFixture();
    const presentation = sitesFixture();
    presentation["site-types"][0].icon = "changed-icon";
    presentation.gamble["four-suit-reprise"].outcomes[0].label =
      "Changed label";
    const changedPresentation = compileSitesData(presentation, {
      guides: baseline.guides,
      economy: economyFixture(),
      glossaryIds: SITE_TYPES.map((type) => `fixture-glossary-${type}`),
    });
    expect(changedPresentation.contentHash).not.toBe(
      baseline.sites.contentHash,
    );
    expect(changedPresentation.foldHash).toBe(baseline.sites.foldHash);

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
      economy: economyFixture(),
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

  it("rejects incomplete metadata, glossary links, Random Site rules, Gamble coverage, and economy drift", () => {
    const compiledGuides = compileDreamGuidesData(guidesFixture());
    const catalogs = {
      guides: compiledGuides,
      economy: economyFixture(),
      glossaryIds: SITE_TYPES.map((type) => `fixture-glossary-${type}`),
    };
    const missingMetadata = sitesFixture();
    missingMetadata["site-types"].pop();
    expect(() => compileSitesData(missingMetadata, catalogs)).toThrow(
      /missing metadata/u,
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

    const tooManyHomeChoices = sitesFixture();
    tooManyHomeChoices["random-site"]["home-choice-count"] = 4;
    expect(() => compileSitesData(tooManyHomeChoices, catalogs)).toThrow(
      /requires exactly 3/u,
    );

    const tooManyFourSuitRounds = sitesFixture();
    tooManyFourSuitRounds.gamble["four-suit-reprise"]["max-rounds"] = 4;
    expect(() => compileSitesData(tooManyFourSuitRounds, catalogs)).toThrow(
      /between 1 and 3/u,
    );
    expect(
      compileSitesData(sitesFixture(), catalogs).gamble.fourSuitReprise,
    ).toMatchObject({ maxRounds: 3 });

    const missingGame = sitesFixture();
    missingGame.gamble.selection.games.pop();
    expect(() => compileSitesData(missingGame, catalogs)).toThrow(
      /every game id in structural order/u,
    );

    expect(() =>
      compileSitesData(sitesFixture(), {
        ...catalogs,
        economy: {
          ...catalogs.economy,
          gamble: {
            ...catalogs.economy.gamble,
            ladderClimb: {
              attempts: catalogs.economy.gamble.ladderClimb.attempts.slice(1),
            },
          },
        },
      }),
    ).toThrow(/align with economy schedule/u);
  });
});
