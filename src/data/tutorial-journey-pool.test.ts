import { describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import type { DreamAvatarContent } from "../types/content";
import { parseCardName } from "../types/card-identity";
import type { RunPoolContext } from "./journey-content";
import { buildTutorialJourneyPackage } from "./tutorial-journey-package";
import { validateTutorialJourneyPool } from "./tutorial-journey-pool";
import { GLOSSARY, glossaryRulesTextForms } from "./glossary";
import { testCardId, testDreamAvatarId, testDreamsignId } from "../types/test-identities";

const CARD_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
  "00000000-0000-4000-8000-000000000007",
  "00000000-0000-4000-8000-000000000008",
] as const;
const OPENING_DREAMSIGN_ID = "00000000-0000-4000-8000-000000000020";

function syntheticSource(): Record<string, unknown> {
  return {
    "dream-avatar-id": "00000000-0000-4000-8000-000000000010",
    "pool-size": 8,
    "opening-dreamsigns": [OPENING_DREAMSIGN_ID],
    "opening-offers": [CARD_IDS.slice(0, 4), CARD_IDS.slice(4, 8)],
    tides: [
      {
        id: "first-tide",
        name: "First Tide",
        description: "First description.",
        type: "valor",
        cards: CARD_IDS.slice(0, 3).map((id) => ({ id, copies: 1 })),
      },
      {
        id: "second-tide",
        name: "Second Tide",
        description: "Second description.",
        type: "valor",
        cards: CARD_IDS.slice(3, 6).map((id) => ({ id, copies: 1 })),
      },
      {
        id: "third-tide",
        name: "Third Tide",
        description: "Third description.",
        type: "valor",
        cards: CARD_IDS.slice(6, 8).map((id) => ({ id, copies: 1 })),
      },
    ],
  };
}

function dreamAvatar(idSeed: string): DreamAvatarContent {
  return {
    id: testDreamAvatarId(idSeed),
    name: "Tutorial Avatar",
    title: "Keeper of the Example",
    renderedText: "The first warrior costs less.",
    imageNumber: "1",
    portraitFocus: { x: 0.5, y: 0.5 },
    startingEssence: 100,
  };
}

function buildCardDatabase(
  firstCardOverrides: Partial<CardData> = {},
): Map<number, CardData> {
  return new Map(
    CARD_IDS.map((id, index) => {
      const cardNumber = index + 101;
      return [
        cardNumber,
        {
          id: testCardId(id),
          name: parseCardName(`Tutorial card ${String(index + 1)}`),
          cardNumber,
          cardType: "Character",
          subtype: "Warrior",
          isStarter: false,
          energyCost: 1,
          spark: 1,
          isFast: false,
          isInterrupt: false,
          renderedText: "",
          imageNumber: cardNumber,
          artOwned: false,
          ...(index === 0 ? firstCardOverrides : {}),
        },
      ];
    }),
  );
}

describe("validateTutorialJourneyPool", () => {
  it("accepts three distinct valor tides whose UUID copies fill the pool", () => {
    const pool = validateTutorialJourneyPool(syntheticSource(), 8);

    expect(pool.tides.map((tide) => tide.type)).toEqual([
      "valor",
      "valor",
      "valor",
    ]);
    expect(pool.tides.flatMap((tide) => tide.cards)).toEqual([
      ...CARD_IDS.map((id) => ({ id, copies: 1 })),
    ]);
    expect(pool.openingOffers).toEqual([
      CARD_IDS.slice(0, 4),
      CARD_IDS.slice(4, 8),
    ]);
    expect(pool.openingDreamsignIds).toEqual([OPENING_DREAMSIGN_ID]);
  });

  it("accepts a single tide and variably sized opening offers", () => {
    const source = syntheticSource();
    source.tides = [
      {
        id: "one-tide",
        name: "One Tide",
        description: "One complete synthetic tide.",
        type: "valor",
        cards: CARD_IDS.map((id) => ({ id, copies: 1 })),
      },
    ];
    source["opening-offers"] = [[CARD_IDS[0]], CARD_IDS.slice(1, 4)];

    const pool = validateTutorialJourneyPool(source, 8);
    expect(pool.tides).toHaveLength(1);
    expect(pool.openingOffers.map((offer) => offer.length)).toEqual([1, 3]);
  });

  it("rejects pool-wide duplicate card UUIDs", () => {
    const source = syntheticSource();
    const tides = source.tides as Array<Record<string, unknown>>;
    tides[1].cards = [{ id: CARD_IDS[0], copies: 1 }];

    expect(() => validateTutorialJourneyPool(source, 8)).toThrow(
      /duplicates.*00000000-0000-4000-8000-000000000001/u,
    );
  });

  it("rejects a pool that does not match the normal journey size", () => {
    expect(() => validateTutorialJourneyPool(syntheticSource(), 150)).toThrow(
      /normal journey pool size \(150\)/u,
    );
  });
});

describe("buildTutorialJourneyPackage", () => {
  it("resolves UUIDs to a normal draft multiset and logs its tide provenance", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const pool = validateTutorialJourneyPool(syntheticSource(), 8);
    const context = {
      idIndex: new Map(
        CARD_IDS.map((id, index) => [testCardId(id), index + 101]),
      ),
      starterCardNumbers: [],
      allDreamsignPoolIds: [testDreamsignId(OPENING_DREAMSIGN_ID)],
      poolData: {},
    } satisfies RunPoolContext;

    const pkg = buildTutorialJourneyPackage(
      dreamAvatar(pool.dreamAvatarId),
      context,
      pool,
      buildCardDatabase(),
    );

    expect(pkg.draftPoolCopiesByCard).toEqual({
      "101": 1,
      "102": 1,
      "103": 1,
      "104": 1,
      "105": 1,
      "106": 1,
      "107": 1,
      "108": 1,
    });
    expect(pkg.openingDraftOffers).toEqual({
      "1": [101, 102, 103, 104],
      "2": [105, 106, 107, 108],
    });
    expect(pkg.draftPoolSize).toBe(8);
    expect(pkg.doubledCardCount).toBe(0);
    expect(pkg.dreamsignPoolIds).toEqual([OPENING_DREAMSIGN_ID]);
    expect(pkg.openingDreamsignOfferIds).toEqual([OPENING_DREAMSIGN_ID]);
    expect(console.log).toHaveBeenCalledOnce();
    expect(
      JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string),
    ).toMatchObject({
      event: "draft_pool_constructed",
      source: "authored_tutorial",
      poolSize: 8,
      distinctCardCount: 8,
      tideIds: ["first-tide", "second-tide", "third-tide"],
      openingDreamsignIds: [OPENING_DREAMSIGN_ID],
    });
  });

  it("rejects an unknown authored card UUID", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const pool = validateTutorialJourneyPool(syntheticSource(), 8);
    const context = {
      idIndex: new Map([[testCardId(CARD_IDS[0]), 101]]),
      starterCardNumbers: [],
      allDreamsignPoolIds: [testDreamsignId(OPENING_DREAMSIGN_ID)],
      poolData: {},
    } satisfies RunPoolContext;

    expect(() =>
      buildTutorialJourneyPackage(
        dreamAvatar(pool.dreamAvatarId),
        context,
        pool,
        new Map(),
      ),
    ).toThrow(/unknown card UUIDs/u);
  });

  it("rejects an opening Dreamsign outside the journey pool", () => {
    const pool = validateTutorialJourneyPool(syntheticSource(), 8);
    const context = {
      idIndex: new Map(
        CARD_IDS.map((id, index) => [testCardId(id), index + 101]),
      ),
      starterCardNumbers: [],
      allDreamsignPoolIds: [],
      poolData: {},
    } satisfies RunPoolContext;

    expect(() =>
      buildTutorialJourneyPackage(
        dreamAvatar(pool.dreamAvatarId),
        context,
        pool,
        buildCardDatabase(),
      ),
    ).toThrow(/opening Dreamsign offer references unknown UUIDs/u);
  });

  const glossaryEntry = GLOSSARY.find(
    (entry) => glossaryRulesTextForms(entry).length > 0,
  );
  if (glossaryEntry === undefined) {
    throw new Error("Test requires one rules-text glossary entry.");
  }

  it.each([
    {
      label: "fast timing",
      overrides: { isFast: true },
      message: /must not be fast or interrupt/u,
    },
    {
      label: "rules symbols",
      overrides: { renderedText: "Gain 1●." },
      message: /must not use rules symbols/u,
    },
    {
      label: "glossary terms",
      overrides: {
        renderedText: glossaryRulesTextForms(glossaryEntry)[0],
      },
      message: /must not reference glossary terms/u,
    },
  ])("rejects opening cards with $label", ({ overrides, message }) => {
    const pool = validateTutorialJourneyPool(syntheticSource(), 8);
    const context = {
      idIndex: new Map(
        CARD_IDS.map((id, index) => [testCardId(id), index + 101]),
      ),
      starterCardNumbers: [],
      allDreamsignPoolIds: [testDreamsignId(OPENING_DREAMSIGN_ID)],
      poolData: {},
    } satisfies RunPoolContext;

    expect(() =>
      buildTutorialJourneyPackage(
        dreamAvatar(pool.dreamAvatarId),
        context,
        pool,
        buildCardDatabase(overrides),
      ),
    ).toThrow(message);
  });
});
