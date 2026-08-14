import { describe, expect, it } from "vitest";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../journey_v2/testing/fixtures";
import { asCardId } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { JourneyContent } from "../data/journey-content";
import type { JourneyState } from "../types/journey";
import {
  explorationRandomDeckTargetPreparationsEqual,
  prepareExplorationRandomDeckTargetPlan,
  type ExplorationRandomDeckTargetPlanInput,
} from "./random-deck-target-plan";
import { asSiteId } from "../types/identifiers";
import { asDeckEntryId } from "../types/identifiers";
import { asExplorationActionId } from "../types/identifiers";
import { asCardTypeChangePredicateId } from "../types/identifiers";

const CARD_IDS = Array.from({ length: 5 }, (_, index) =>
  asCardId(`b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
);
const ENCOUNTER_CARD_ID = "b0000000-0000-4000-8000-000000000099";

function card(
  index: number,
  cardType: CardData["cardType"],
  subtype: string,
  isStarter = false,
): CardData {
  const id = CARD_IDS[index];
  if (id === undefined) throw new Error("Missing synthetic card UUID");
  return makeMerchantTestCard({
    id,
    cardNumber: index + 1,
    cardType,
    subtype,
    isStarter,
    ...(isStarter
      ? { rarity: "Starter" as const, roles: ["starter-deck" as const] }
      : {}),
  });
}

function contentFixture(reverse = false): JourneyContent {
  const cards = [
    card(0, "Character", "Warrior"),
    card(1, "Event", ""),
    card(2, "Character", "Warrior", true),
    card(3, "Event", ""),
    card(4, "Event", ""),
  ];
  return makeMerchantTestContent({ cards: reverse ? cards.reverse() : cards });
}

function journeyFixture(reverse = false): JourneyState {
  const deck = [
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-warrior-a"),
      cardNumber: 1,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-warrior-b"),
      cardNumber: 1,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-event"),
      cardNumber: 2,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-starter"),
      cardNumber: 3,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-nightmare"),
      cardNumber: 4,
      isBane: true,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-prior-override"),
      cardNumber: 5,
      typeChange: {
        predicateId: asCardTypeChangePredicateId("fixture:prior-character"),
        cardType: "Character",
        subtype: "Warrior",
        label: "Character",
      },
    }),
  ];
  return makeMerchantTestJourneyState({
    seed: "random-deck-target-plan-test",
    deck: reverse ? deck.reverse() : deck,
  });
}

const site = makeMerchantTestSite({
  id: asSiteId("random-deck-target-site"),
  type: "Exploration",
});

function prepare(
  overrides: Partial<ExplorationRandomDeckTargetPlanInput> = {},
) {
  return prepareExplorationRandomDeckTargetPlan({
    effectKind: "copy-random-cards",
    predicate: "warrior",
    count: 4,
    actionId: asExplorationActionId("random-deck-target-action"),
    encounterCardId: asCardId(ENCOUNTER_CARD_ID),
    journey: journeyFixture(),
    site,
    content: contentFixture(),
    ...overrides,
  });
}

function prepareReplacement(
  overrides: Partial<ExplorationRandomDeckTargetPlanInput> = {},
) {
  return prepareExplorationRandomDeckTargetPlan({
    effectKind: "replace-random-with-card",
    predicate: "warrior",
    replacementCardId: CARD_IDS[4],
    actionId: asExplorationActionId("replace-random-with-card-action"),
    encounterCardId: asCardId(ENCOUNTER_CARD_ID),
    journey: journeyFixture(),
    site,
    content: contentFixture(),
    ...overrides,
  });
}

describe("Exploration random deck target plan", () => {
  it("selects exact distinct concrete copy targets including duplicates and starters", () => {
    const plan = prepare();

    expect(plan.unavailableReason).toBeUndefined();
    expect(plan).toMatchObject({
      effectKind: "copy-random-cards",
      predicate: "warrior",
      count: 4,
    });
    expect(plan.eligibleCards.map(({ entryId }) => entryId)).toEqual([
      "entry-prior-override",
      "entry-starter",
      "entry-warrior-a",
      "entry-warrior-b",
    ]);
    expect(new Set(plan.targets.map(({ entryId }) => entryId)).size).toBe(4);
    expect(
      plan.targets.filter(({ cardId }) => cardId === CARD_IDS[0]),
    ).toHaveLength(2);
    expect(plan.targets.map(({ entryId }) => entryId)).toContain(
      "entry-starter",
    );
    expect(plan.selectorTrace).toMatchObject({
      mechanicId: "duplicate-deck-entry",
      policyId: "uniform",
      keyKind: "entryId",
      candidateCount: 4,
    });
    expect(plan.selectorTrace?.constraints).toMatchObject({
      allowStarters: true,
      allowNightmare: true,
      distinctDeckEntries: true,
      predicate: "warrior",
      excludedDeckEntryIds: ["entry-event", "entry-nightmare"],
    });
    expect(plan.selectorSignature).not.toHaveLength(0);
    expect(plan.planSignature).not.toHaveLength(0);
  });

  it("allows Nightmare entries when they satisfy the copy predicate", () => {
    const plan = prepare({ predicate: "event", count: 2 });

    expect(plan.unavailableReason).toBeUndefined();
    expect(new Set(plan.targets.map(({ entryId }) => entryId))).toEqual(
      new Set(["entry-event", "entry-nightmare"]),
    );
  });

  it("uses effective card type and excludes entries already at the authored target", () => {
    const plan = prepare({
      effectKind: "change-random-card-type",
      predicate: undefined,
      cardType: "Event",
      count: 4,
    });

    expect(plan.unavailableReason).toBeUndefined();
    expect(plan).toMatchObject({
      effectKind: "change-random-card-type",
      cardType: "Event",
      count: 4,
    });
    expect(plan.eligibleCards.map(({ entryId }) => entryId)).toEqual([
      "entry-prior-override",
      "entry-starter",
      "entry-warrior-a",
      "entry-warrior-b",
    ]);
    expect(plan.targets.map(({ entryId }) => entryId)).toEqual(
      expect.arrayContaining([
        "entry-prior-override",
        "entry-starter",
        "entry-warrior-a",
        "entry-warrior-b",
      ]),
    );
    expect(plan.selectorTrace).toMatchObject({
      mechanicId: "change-entry-card-type",
      policyId: "uniform",
      keyKind: "entryId",
      candidateCount: 4,
      constraints: {
        allowStarters: true,
        allowNightmare: true,
        distinctDeckEntries: true,
        excludedDeckEntryIds: ["entry-event", "entry-nightmare"],
      },
    });
  });

  it("uniformly selects one exact effective-deck entry for a fixed replacement", () => {
    const plan = prepareReplacement();
    const reordered = prepareReplacement({
      journey: journeyFixture(true),
      content: contentFixture(true),
    });

    expect(plan).toMatchObject({
      effectKind: "replace-random-with-card",
      predicate: "warrior",
      count: 1,
      replacementCardId: CARD_IDS[4],
    });
    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.eligibleCards.map(({ entryId }) => entryId)).toEqual([
      "entry-prior-override",
      "entry-starter",
      "entry-warrior-a",
      "entry-warrior-b",
    ]);
    expect(plan.targets).toEqual([
      { entryId: asDeckEntryId("entry-warrior-b"), cardId: CARD_IDS[0] },
    ]);
    expect(plan.selectorTrace).toMatchObject({
      mechanicId: "replace-deck-entry",
      policyId: "uniform",
      keyKind: "entryId",
      candidateCount: 4,
      constraints: {
        predicate: "warrior",
        allowStarters: true,
        allowNightmare: true,
        distinctDeckEntries: true,
        excludedDeckEntryIds: ["entry-event", "entry-nightmare"],
      },
    });
    expect(reordered).toEqual(plan);
  });

  it("matches replacement predicates against effective cards", () => {
    const plan = prepareReplacement({
      predicate: "event",
      replacementCardId: CARD_IDS[0],
    });

    expect(plan.eligibleCards).toEqual([
      { entryId: asDeckEntryId("entry-event"), cardId: CARD_IDS[1] },
      { entryId: asDeckEntryId("entry-nightmare"), cardId: CARD_IDS[3] },
    ]);
    expect(plan.targets).toHaveLength(1);
    expect(plan.eligibleCards).toContainEqual(plan.targets[0]);
  });

  it("keeps duplicate base-card UUID entries as distinct replacement targets", () => {
    const plan = prepareReplacement({
      journey: makeMerchantTestJourneyState({
        seed: "random-deck-target-plan-test",
        deck: [
          makeMerchantTestDeckEntry({
            entryId: asDeckEntryId("entry-warrior-a"),
            cardNumber: 1,
          }),
          makeMerchantTestDeckEntry({
            entryId: asDeckEntryId("entry-warrior-b"),
            cardNumber: 1,
          }),
        ],
      }),
    });

    expect(plan.eligibleCards).toEqual([
      { entryId: asDeckEntryId("entry-warrior-a"), cardId: CARD_IDS[0] },
      { entryId: asDeckEntryId("entry-warrior-b"), cardId: CARD_IDS[0] },
    ]);
    expect(plan.targets).toEqual([
      { entryId: asDeckEntryId("entry-warrior-b"), cardId: CARD_IDS[0] },
    ]);
  });

  it("allows the authored fixed replacement to duplicate an owned card", () => {
    const plan = prepareReplacement({ replacementCardId: CARD_IDS[0] });

    expect(journeyFixture().deck.some((entry) => entry.cardNumber === 1)).toBe(
      true,
    );
    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.replacementCardId).toBe(CARD_IDS[0]);
  });

  it("is deterministic across deck and catalog iteration order", () => {
    const first = prepare();
    const reordered = prepare({
      journey: journeyFixture(true),
      content: contentFixture(true),
    });

    expect(reordered).toEqual(first);
    expect(explorationRandomDeckTargetPreparationsEqual(first, reordered)).toBe(
      true,
    );
  });

  it("returns signed unavailable preparations for malformed or undersupplied actions", () => {
    const malformed = prepare({ predicate: undefined });
    const invalidCount = prepare({ count: 0 });
    const insufficient = prepare({ count: 5 });
    const invalidTypeChange = prepare({
      effectKind: "change-random-card-type",
      predicate: "warrior",
      cardType: "Event",
      count: 1,
    });

    expect(malformed).toMatchObject({
      unavailableReason: "invalid-authored-configuration",
      eligibleCards: [],
      targets: [],
    });
    expect(invalidCount.unavailableReason).toBe(
      "invalid-authored-configuration",
    );
    expect(invalidTypeChange.unavailableReason).toBe(
      "invalid-authored-configuration",
    );
    expect(insufficient).toMatchObject({
      unavailableReason: "insufficient-eligible-cards",
      targets: [],
    });
    expect(insufficient.eligibleCards).toHaveLength(4);
    expect(malformed.planSignature).not.toHaveLength(0);
  });

  it("rejects malformed and undersupplied fixed-replacement effects", () => {
    const missingReplacement = prepareReplacement({
      replacementCardId: undefined,
    });
    const unknownReplacement = prepareReplacement({
      replacementCardId: asCardId("b0000000-0000-4000-8000-000000000098"),
    });
    const explicitCount = prepareReplacement({ count: 1 });
    const unrelatedField = prepareReplacement({ cardType: "Event" });
    const replacementOnCopy = prepare({ replacementCardId: CARD_IDS[4] });
    const insufficient = prepareReplacement({ predicate: "spirit-animal" });

    for (const malformed of [
      missingReplacement,
      unknownReplacement,
      explicitCount,
      unrelatedField,
      replacementOnCopy,
    ]) {
      expect(malformed).toMatchObject({
        unavailableReason: "invalid-authored-configuration",
        eligibleCards: [],
        targets: [],
      });
    }
    expect(insufficient).toMatchObject({
      count: 1,
      replacementCardId: CARD_IDS[4],
      unavailableReason: "insufficient-eligible-cards",
      eligibleCards: [],
      targets: [],
    });
  });

  it("binds fixed replacement effect, identities, site, and content into its signature", () => {
    const original = prepareReplacement();
    const differentReplacement = prepareReplacement({
      replacementCardId: CARD_IDS[3],
    });
    const differentEffect = prepare({
      count: 1,
      actionId: asExplorationActionId("replace-random-with-card-action"),
    });
    const differentPredicate = prepareReplacement({ predicate: "event" });
    const differentAction = prepareReplacement({
      actionId: asExplorationActionId("other-action"),
    });
    const differentEncounter = prepareReplacement({
      encounterCardId: asCardId("b0000000-0000-4000-8000-000000000098"),
    });
    const differentSite = prepareReplacement({
      site: makeMerchantTestSite({
        id: asSiteId("other-random-deck-target-site"),
        type: "Exploration",
      }),
    });
    const revisedCards = [...contentFixture().cardDatabase.values()].map(
      (candidate) =>
        candidate.id === CARD_IDS[4]
          ? { ...candidate, renderedText: `${candidate.renderedText} revised` }
          : candidate,
    );
    const differentContent = prepareReplacement({
      content: makeMerchantTestContent({ cards: revisedCards }),
    });

    for (const changed of [
      differentReplacement,
      differentEffect,
      differentPredicate,
      differentAction,
      differentEncounter,
      differentSite,
      differentContent,
    ]) {
      expect(changed.planSignature).not.toBe(original.planSignature);
      expect(
        explorationRandomDeckTargetPreparationsEqual(changed, original),
      ).toBe(false);
    }
    expect(differentReplacement.targets).toEqual(original.targets);
    expect(differentContent.selectionContentRevision).not.toBe(
      original.selectionContentRevision,
    );
  });

  it("rejects retained-signature fixed replacement tampering", () => {
    const plan = prepareReplacement();
    const tamperedReplacement = {
      ...plan,
      replacementCardId: CARD_IDS[3],
    };
    const firstTarget = plan.targets[0];
    if (firstTarget === undefined)
      throw new Error("Expected a prepared target");
    const tamperedTarget = {
      ...plan,
      targets: [{ ...firstTarget, cardId: CARD_IDS[3] }],
    };

    expect(
      explorationRandomDeckTargetPreparationsEqual(tamperedReplacement, plan),
    ).toBe(false);
    expect(
      explorationRandomDeckTargetPreparationsEqual(tamperedTarget, plan),
    ).toBe(false);
  });

  it("binds authored identity and rejects retained-signature target mutations", () => {
    const plan = prepare();
    const differentEncounter = prepare({
      encounterCardId: asCardId("b0000000-0000-4000-8000-000000000098"),
    });
    const differentAction = prepare({
      actionId: asExplorationActionId("different-action"),
    });
    const firstTarget = plan.targets[0];
    if (firstTarget === undefined)
      throw new Error("Expected a prepared target");
    const tampered = {
      ...plan,
      targets: [
        { ...firstTarget, entryId: asDeckEntryId("foreign-entry") },
        ...plan.targets.slice(1),
      ],
    };

    expect(differentEncounter.targets).toEqual(plan.targets);
    expect(differentEncounter.planSignature).not.toBe(plan.planSignature);
    expect(differentAction.planSignature).not.toBe(plan.planSignature);
    expect(explorationRandomDeckTargetPreparationsEqual(tampered, plan)).toBe(
      false,
    );
  });
});
