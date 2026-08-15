import { testJourneySeed } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../__test-helpers__/atlas-fixtures";
import type { JourneyContent } from "../data/journey-content";
import { createDefaultState } from "../state/journey-context";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { parseCardName } from "../types/card-identity";
import { parseCardTypeChangePredicateId } from "../types/identifiers";
import type { CardData } from "../types/cards";
import type { JourneyState, SiteState } from "../types/journey";
import {
  multiCardReplacementPreparationsEqual,
  prepareMultiCardReplacementPlan,
  type MultiCardReplacementPlanInput,
} from "./multi-card-replacement-plan";
import { parseSiteId } from "../types/identifiers";
import { parseDeckEntryId } from "../types/identifiers";
import {
  testCardId,
  testCardSubtype,
  testAvatarId,
  testExplorationActionId,
} from "../types/test-identities";

const ENCOUNTER_CARD_ID = "b0000000-0000-4000-8000-000000000001";
const DUPLICATED_SOURCE_CARD_ID = "b0000000-0000-4000-8000-000000000002";
const OWNED_SOURCE_CARD_ID = "b0000000-0000-4000-8000-000000000003";
const EVENT_SOURCE_CARD_ID = "b0000000-0000-4000-8000-000000000004";
const REPLACEMENT_ONE_ID = "b0000000-0000-4000-8000-000000000010";
const REPLACEMENT_TWO_ID = "b0000000-0000-4000-8000-000000000011";

function card(
  idSeed: string,
  cardNumber: number,
  cardType: CardData["cardType"],
  subtype: string,
): CardData {
  return {
    id: testCardId(idSeed),
    name: parseCardName(`Multi replacement fixture ${String(cardNumber)}`),
    cardNumber,
    cardType,
    subtype: testCardSubtype(subtype),
    isStarter: false,
    energyCost: 2,
    spark: cardType === "Character" ? 2 : null,
    isFast: false,
    renderedText: "Synthetic replacement rules.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function contentFixture(): JourneyContent {
  const cards = [
    card(ENCOUNTER_CARD_ID, 1, "Character", "Warrior"),
    card(DUPLICATED_SOURCE_CARD_ID, 2, "Character", "Warrior"),
    card(OWNED_SOURCE_CARD_ID, 3, "Character", "Warrior"),
    card(EVENT_SOURCE_CARD_ID, 4, "Event", ""),
    card(REPLACEMENT_ONE_ID, 10, "Character", "Warrior"),
    card(REPLACEMENT_TWO_ID, 11, "Character", "Warrior"),
  ];
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: new Map(cards.map((entry) => [entry.cardNumber, entry])),
    avatars: [
      {
        id: testAvatarId("multi-replacement-avatar"),
        name: "Synthetic Avatar",
        title: "Synthetic",
        renderedText: "Synthetic.",
        imageNumber: "1",
        startingEssence: 100,
        signatureCards: [],
      },
    ],
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: [],
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
}

const site: SiteState = {
  id: parseSiteId("multi-card-replacement-site"),
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

function journeyFixture(
  content: JourneyContent,
  draftPoolCardNumbers: readonly number[] = [1, 2, 3, 10, 11],
): JourneyState {
  const avatar = content.avatars[0];
  if (avatar === undefined)
    throw new Error("Expected Avatar fixture");
  return {
    ...createDefaultState(),
    seed: testJourneySeed("multi-card-replacement-plan-test"),
    deck: [
      {
        entryId: parseDeckEntryId("duplicate-source-b"),
        cardNumber: 2,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: parseDeckEntryId("owned-source"),
        cardNumber: 3,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: parseDeckEntryId("duplicate-source-a"),
        cardNumber: 2,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: parseDeckEntryId("event-source"),
        cardNumber: 4,
        transfiguration: null,
        isBane: false,
      },
    ],
    resolvedPackage: {
      avatar,
      draftPoolCopiesByCard: Object.fromEntries(
        draftPoolCardNumbers.map((cardNumber) => [String(cardNumber), 1]),
      ),
      dreamsignPoolIds: [],
      mandatoryOnlyPoolSize: 0,
      draftPoolSize: draftPoolCardNumbers.length,
      doubledCardCount: 0,
      legalSubsetCount: 1,
      preferredSubsetCount: 1,
    },
  };
}

function inputFixture(
  options: Partial<MultiCardReplacementPlanInput> = {},
): MultiCardReplacementPlanInput {
  const content = options.content ?? contentFixture();
  return {
    actionId: testExplorationActionId("multi-card-replacement-action"),
    encounterCardId: testCardId(ENCOUNTER_CARD_ID),
    predicate: "warrior",
    count: 2,
    journey: journeyFixture(content),
    site,
    content,
    ...options,
  };
}

describe("multi-card replacement plan", () => {
  it("prepares stable entry-specific bindings for duplicate base cards", () => {
    const input = inputFixture();
    const first = prepareMultiCardReplacementPlan(input);
    const replay = prepareMultiCardReplacementPlan(input);

    expect(first.unavailableReason).toBeUndefined();
    expect(first.kind).toBe("chosen-replacement");
    expect(first.authoredMaximumCount).toBe(2);
    expect(first.bindings.map(({ sourceEntryId }) => sourceEntryId)).toEqual([
      "duplicate-source-a",
      "duplicate-source-b",
      "owned-source",
    ]);
    expect(
      first.bindings.slice(0, 2).map(({ sourceCardId }) => sourceCardId),
    ).toEqual([DUPLICATED_SOURCE_CARD_ID, DUPLICATED_SOURCE_CARD_ID]);
    expect(first).toEqual(replay);
    expect(multiCardReplacementPreparationsEqual(first, replay)).toBe(true);
  });

  it("uses one deterministic selector per source and excludes source, owned, and encounter cards", () => {
    const input = inputFixture();
    const plan = prepareMultiCardReplacementPlan(input);
    const ownedIds = new Set([
      DUPLICATED_SOURCE_CARD_ID,
      OWNED_SOURCE_CARD_ID,
      EVENT_SOURCE_CARD_ID,
    ]);

    expect(plan.selectorSignatures).toHaveLength(plan.bindings.length);
    expect(plan.selectorTraces).toHaveLength(plan.bindings.length);
    plan.bindings.forEach((binding, index) => {
      expect([REPLACEMENT_ONE_ID, REPLACEMENT_TWO_ID]).toContain(
        binding.replacementCardId,
      );
      expect(binding.replacementCardId).not.toBe(binding.sourceCardId);
      expect(binding.replacementCardId).not.toBe(ENCOUNTER_CARD_ID);
      expect(ownedIds.has(binding.replacementCardId)).toBe(false);
      expect(plan.selectorTraces[index]).toMatchObject({
        mechanicId: "gain-card",
        policyId: "card-fit-quality",
        selectionKey: `${input.actionId}:replacement:${binding.sourceEntryId}`,
        constraints: {
          predicate: "warrior",
          cardScope: "draft-pool",
          excludeOwned: true,
          excludedCardUuids: [ENCOUNTER_CARD_ID, binding.sourceCardId],
        },
      });
    });
  });

  it("matches the current effective predicate while persisting base-card identity", () => {
    const input = inputFixture();
    input.journey = {
      ...input.journey,
      deck: input.journey.deck.map((entry) =>
        entry.entryId === "event-source"
          ? {
              ...entry,
              typeChange: {
                predicateId: parseCardTypeChangePredicateId("fixture:warrior"),
                cardType: "Character" as const,
                subtype: "Warrior",
                label: "Warrior",
              },
            }
          : entry,
      ),
    };
    const plan = prepareMultiCardReplacementPlan(input);
    const eventBinding = plan.bindings.find(
      ({ sourceEntryId }) => sourceEntryId === "event-source",
    );

    expect(eventBinding).toMatchObject({
      sourceEntryId: parseDeckEntryId("event-source"),
      sourceCardId: testCardId(EVENT_SOURCE_CARD_ID),
    });
    expect(eventBinding?.replacementCardId).toMatch(/^b0000000-/u);
  });

  it("matches legendary sources and replacements only by exact rarity", () => {
    const baseContent = contentFixture();
    const duplicatedSource = baseContent.cardDatabase.get(2);
    const eventSource = baseContent.cardDatabase.get(4);
    const replacement = baseContent.cardDatabase.get(10);
    if (
      duplicatedSource === undefined ||
      eventSource === undefined ||
      replacement === undefined
    ) {
      throw new Error("Expected Legendary predicate fixtures");
    }
    const content: JourneyContent = {
      ...baseContent,
      cardDatabase: new Map(baseContent.cardDatabase)
        .set(2, { ...duplicatedSource, rarity: "Legendary" })
        .set(4, { ...eventSource, name: parseCardName("Legendary") })
        .set(10, { ...replacement, rarity: "Legendary" }),
    };
    const input = inputFixture({
      content,
      predicate: "legendary",
      journey: journeyFixture(content),
    });
    const plan = prepareMultiCardReplacementPlan(input);

    expect(plan.bindings.map(({ sourceEntryId }) => sourceEntryId)).toEqual([
      "duplicate-source-a",
      "duplicate-source-b",
    ]);
    expect(
      plan.bindings.every(
        ({ replacementCardId }) => replacementCardId === REPLACEMENT_ONE_ID,
      ),
    ).toBe(true);
    expect(
      plan.bindings.some(
        ({ sourceEntryId }) => sourceEntryId === "event-source",
      ),
    ).toBe(false);
  });

  it("omits entries without a candidate and signs the unavailable empty plan", () => {
    const content = contentFixture();
    const input = inputFixture({
      content,
      journey: journeyFixture(content, [1, 2, 3]),
    });
    const plan = prepareMultiCardReplacementPlan(input);

    expect(plan).toMatchObject({
      bindings: [],
      selectorSignatures: [],
      selectorTraces: [],
      unavailableReason: "requires-eligible-card",
    });
    expect(plan.planSignature).not.toHaveLength(0);
  });

  it("rejects tampered bindings and binds count, predicate, action, encounter, and site", () => {
    const input = inputFixture();
    const plan = prepareMultiCardReplacementPlan(input);
    const firstBinding = plan.bindings[0];
    if (firstBinding === undefined) throw new Error("Expected a binding");
    const tampered = {
      ...plan,
      bindings: [
        { ...firstBinding, replacementCardId: testCardId(OWNED_SOURCE_CARD_ID) },
        ...plan.bindings.slice(1),
      ],
    };

    expect(multiCardReplacementPreparationsEqual(tampered, plan)).toBe(false);
    expect(
      prepareMultiCardReplacementPlan({ ...input, count: 3 }).planSignature,
    ).not.toBe(plan.planSignature);
    expect(
      prepareMultiCardReplacementPlan({
        ...input,
        predicate: "character",
      }).planSignature,
    ).not.toBe(plan.planSignature);
    expect(
      prepareMultiCardReplacementPlan({
        ...input,
        actionId: testExplorationActionId("different-action"),
      }).planSignature,
    ).not.toBe(plan.planSignature);
    expect(
      prepareMultiCardReplacementPlan({
        ...input,
        encounterCardId: testCardId(REPLACEMENT_TWO_ID),
      }).planSignature,
    ).not.toBe(plan.planSignature);
    expect(
      prepareMultiCardReplacementPlan({
        ...input,
        site: { ...site, id: parseSiteId("different-site") },
      }).planSignature,
    ).not.toBe(plan.planSignature);
  });

  it("changes the content revision and signature when selection content changes", () => {
    const input = inputFixture();
    const original = prepareMultiCardReplacementPlan(input);
    const replacement = input.content.cardDatabase.get(10);
    if (replacement === undefined) throw new Error("Expected replacement card");
    const revisedContent: JourneyContent = {
      ...input.content,
      cardDatabase: new Map(input.content.cardDatabase).set(10, {
        ...replacement,
        renderedText: "Revised synthetic replacement rules.",
      }),
    };
    const revised = prepareMultiCardReplacementPlan({
      ...input,
      content: revisedContent,
    });

    expect(revised.selectionContentRevision).not.toBe(
      original.selectionContentRevision,
    );
    expect(revised.planSignature).not.toBe(original.planSignature);
  });

  it("rejects counts outside the multi-card authoring contract", () => {
    expect(() =>
      prepareMultiCardReplacementPlan(inputFixture({ count: 1 })),
    ).toThrow();
    expect(() =>
      prepareMultiCardReplacementPlan(inputFixture({ count: 0 })),
    ).toThrow();
  });
});
