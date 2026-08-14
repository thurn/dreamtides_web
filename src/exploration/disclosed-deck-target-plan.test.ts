import { describe, expect, it } from "vitest";
import type { JourneyContent } from "../data/journey-content";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../journey_v2/testing/fixtures";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData, CardType } from "../types/cards";
import type { JourneyState } from "../types/journey";
import {
  explorationDisclosedDeckTargetPreparationsEqual,
  prepareExplorationDisclosedDeckTargetPlan,
  type ExplorationDisclosedDeckTargetPlanInput,
} from "./disclosed-deck-target-plan";
import { asSiteId } from "../types/identifiers";
import { asDeckEntryId } from "../types/identifiers";
import { asExplorationActionId } from "../types/identifiers";
import { asCardTypeChangePredicateId } from "../types/identifiers";

const CARD_IDS = Array.from({ length: 7 }, (_, index) =>
  asCardId(`c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
);
const ACTION_ID = "c0000000-0000-4000-8000-000000000090";
const ENCOUNTER_CARD_ID = CARD_IDS[1];

function card(
  index: number,
  cardType: CardType,
  options: { isStarter?: boolean; name?: string } = {},
): CardData {
  const id = CARD_IDS[index];
  if (id === undefined) throw new Error("Missing synthetic card UUID");
  return makeMerchantTestCard({
    id,
    cardNumber: index + 1,
    name: asCardName(options.name ?? `Synthetic ${String(index + 1)}`),
    cardType,
    subtype: cardType === "Character" ? "Warrior" : "",
    isStarter: options.isStarter ?? false,
    ...(options.isStarter
      ? { rarity: "Starter" as const, roles: ["starter-deck" as const] }
      : {}),
  });
}

function contentFixture(reverse = false): JourneyContent {
  const cards = [
    card(0, "Character", { name: "Shared Face" }),
    card(1, "Character", { name: "Shared Face" }),
    card(2, "Event"),
    card(3, "Character", { isStarter: true }),
    card(4, "Character", { name: "Shared Face" }),
    card(5, "Event"),
    card(6, "Character"),
  ];
  return makeMerchantTestContent({ cards: reverse ? cards.reverse() : cards });
}

function journeyFixture(reverse = false): JourneyState {
  const deck = [
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-copy-a"),
      cardNumber: 1,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-copy-b"),
      cardNumber: 1,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-encounter"),
      cardNumber: 2,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-event"),
      cardNumber: 3,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-starter"),
      cardNumber: 4,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-nightmare"),
      cardNumber: 5,
      isBane: true,
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-effective-character"),
      cardNumber: 6,
      typeChange: {
        predicateId: asCardTypeChangePredicateId("fixture:effective-character"),
        cardType: "Character",
        subtype: "Warrior",
        label: "Character",
      },
    }),
    makeMerchantTestDeckEntry({
      entryId: asDeckEntryId("entry-effective-event"),
      cardNumber: 7,
      typeChange: {
        predicateId: asCardTypeChangePredicateId("fixture:effective-event"),
        cardType: "Event",
        subtype: "",
        label: "Event",
      },
    }),
  ];
  return makeMerchantTestJourneyState({
    seed: "disclosed-deck-target-plan-test",
    deck: reverse ? deck.reverse() : deck,
  });
}

const site = makeMerchantTestSite({
  id: asSiteId("disclosed-deck-target-site"),
  type: "Exploration",
});

function prepare(
  overrides: Partial<ExplorationDisclosedDeckTargetPlanInput> = {},
) {
  return prepareExplorationDisclosedDeckTargetPlan({
    effectKind: "change-card-type-selected",
    cardType: "Event",
    actionId: asExplorationActionId(ACTION_ID),
    encounterCardId: ENCOUNTER_CARD_ID,
    journey: journeyFixture(),
    site,
    content: contentFixture(),
    ...overrides,
  });
}

describe("Exploration disclosed deck target plan", () => {
  it("offers one centrality-selected opposite-type entry by UUID identity", () => {
    const plan = prepare();

    expect(plan).toMatchObject({
      effectKind: "change-card-type-selected",
      cardType: "Event",
      selectionKey: `${ACTION_ID}:disclosed-deck-target`,
    });
    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.eligibleCards).toEqual([
      { entryId: asDeckEntryId("entry-copy-a"), cardId: CARD_IDS[0] },
      { entryId: asDeckEntryId("entry-copy-b"), cardId: CARD_IDS[0] },
      {
        entryId: asDeckEntryId("entry-effective-character"),
        cardId: CARD_IDS[5],
      },
      { entryId: asDeckEntryId("entry-nightmare"), cardId: CARD_IDS[4] },
      { entryId: asDeckEntryId("entry-starter"), cardId: CARD_IDS[3] },
    ]);
    expect(plan.eligibleCards).not.toContainEqual({
      entryId: asDeckEntryId("entry-encounter"),
      cardId: ENCOUNTER_CARD_ID,
    });
    expect(plan.target).not.toBeNull();
    expect(plan.eligibleCards).toContainEqual(plan.target);
    expect(plan.selectorTrace).toMatchObject({
      mechanicId: "change-entry-card-type",
      policyId: "deck-entry-centrality",
      keyKind: "entryId",
      candidateCount: 5,
      constraints: {
        allowStarters: true,
        allowNightmare: true,
        distinctDeckEntries: true,
        excludedCardUuids: [ENCOUNTER_CARD_ID],
        excludedDeckEntryIds: [
          "entry-effective-event",
          "entry-encounter",
          "entry-event",
        ],
      },
    });
    expect(plan.selectorSignature).toMatch(/^[0-9a-f]+$/u);
    expect(plan.planSignature).toMatch(/^[0-9a-f]+$/u);
  });

  it("uses effective type and preserves separate entries for one base card", () => {
    const toEvent = prepare();
    const toCharacter = prepare({ cardType: "Character" });

    expect(toEvent.eligibleCards.map(({ entryId }) => entryId)).toContain(
      "entry-effective-character",
    );
    expect(toEvent.eligibleCards.map(({ entryId }) => entryId)).not.toContain(
      "entry-effective-event",
    );
    expect(toCharacter.eligibleCards.map(({ entryId }) => entryId)).toEqual([
      "entry-effective-event",
      "entry-event",
    ]);
    expect(
      toEvent.eligibleCards.filter(({ cardId }) => cardId === CARD_IDS[0]),
    ).toHaveLength(2);
    expect(toCharacter.planSignature).not.toBe(toEvent.planSignature);
  });

  it("is deterministic across deck and catalog iteration order", () => {
    const first = prepare();
    const reordered = prepare({
      journey: journeyFixture(true),
      content: contentFixture(true),
    });

    expect(reordered).toEqual(first);
    expect(
      explorationDisclosedDeckTargetPreparationsEqual(first, reordered),
    ).toBe(true);
  });

  it("binds action, encounter, site, and authored type into the plan signature", () => {
    const original = prepare();
    const differentAction = prepare({
      actionId: asExplorationActionId("c0000000-0000-4000-8000-000000000091"),
    });
    const differentEncounter = prepare({
      encounterCardId: CARD_IDS[2],
    });
    const differentSite = prepare({
      site: { ...site, id: asSiteId("different-exploration-site") },
    });
    const differentType = prepare({ cardType: "Character" });

    expect(differentAction.planSignature).not.toBe(original.planSignature);
    expect(differentEncounter.planSignature).not.toBe(original.planSignature);
    expect(differentSite.planSignature).not.toBe(original.planSignature);
    expect(differentType.planSignature).not.toBe(original.planSignature);
  });

  it("rejects retained-signature mutations to target and signed metadata", () => {
    const plan = prepare();
    if (plan.target === null) throw new Error("Expected disclosed target");
    const tamperedTarget = {
      ...plan,
      target: { ...plan.target, entryId: asDeckEntryId("foreign-entry") },
    };
    const tamperedSelector = {
      ...plan,
      selectorSignature: "forged-selector-signature",
    };
    const tamperedRevision = {
      ...plan,
      selectionContentRevision: "forged-content-revision",
    };
    const tamperedPlanSignature = {
      ...plan,
      planSignature: "forged-plan-signature",
    };

    expect(
      explorationDisclosedDeckTargetPreparationsEqual(tamperedTarget, plan),
    ).toBe(false);
    expect(
      explorationDisclosedDeckTargetPreparationsEqual(tamperedSelector, plan),
    ).toBe(false);
    expect(
      explorationDisclosedDeckTargetPreparationsEqual(tamperedRevision, plan),
    ).toBe(false);
    expect(
      explorationDisclosedDeckTargetPreparationsEqual(
        tamperedPlanSignature,
        plan,
      ),
    ).toBe(false);
  });

  it("returns signed unavailable plans for malformed authorship or no eligible card", () => {
    const invalid = prepare({
      effectKind: "copy-selected-card" as "change-card-type-selected",
    });
    const noEligible = prepare({
      journey: makeMerchantTestJourneyState({
        seed: "disclosed-deck-target-plan-test",
        deck: [
          makeMerchantTestDeckEntry({
            entryId: asDeckEntryId("only-event"),
            cardNumber: 3,
          }),
        ],
      }),
    });

    expect(invalid).toMatchObject({
      effectKind: "change-card-type-selected",
      cardType: "Event",
      eligibleCards: [],
      target: null,
      unavailableReason: "invalid-authored-configuration",
    });
    expect(noEligible).toMatchObject({
      eligibleCards: [],
      target: null,
      unavailableReason: "no-eligible-cards",
    });
    expect(invalid.selectorSignature).toBeUndefined();
    expect(noEligible.selectorTrace).toBeUndefined();
    expect(invalid.planSignature).toMatch(/^[0-9a-f]+$/u);
    expect(noEligible.planSignature).toMatch(/^[0-9a-f]+$/u);
  });
});
