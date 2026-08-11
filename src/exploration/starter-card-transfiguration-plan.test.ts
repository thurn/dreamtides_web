import { describe, expect, it } from "vitest";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../__test-helpers__/atlas-fixtures";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { JourneyState, SiteState } from "../types/journey";
import { createDefaultState } from "../state/journey-context";
import type { JourneyContent } from "../data/journey-content";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { JOURNEY_DATA_FIXTURE } from "../testing/journey-data-fixture";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import {
  explorationStarterCardTransfigurationPreparationsEqual,
  prepareExplorationStarterCardTransfigurationPlan,
} from "./starter-card-transfiguration-plan";

const ENCOUNTER_CARD_ID = "a0000000-0000-4000-8000-000000000001";

function card(
  id: string,
  cardNumber: number,
  cardType: CardData["cardType"],
  isStarter: boolean,
): CardData {
  return {
    id: asCardId(id),
    name: asCardName(`Starter transfiguration fixture ${String(cardNumber)}`),
    cardNumber,
    cardType,
    subtype: cardType === "Character" ? "Warrior" : "",
    isStarter,
    ...(isStarter ? { roles: ["starter-deck" as const] } : {}),
    ...(isStarter ? { rarity: "Starter" as const } : {}),
    energyCost: 2,
    spark: cardType === "Character" ? 2 : null,
    isFast: false,
    renderedText:
      cardType === "Character"
        ? "When you play a card, gain 1 spark."
        : "Draw a card.",
    amplifiedText:
      cardType === "Character"
        ? "When you play a card, gain 2 spark."
        : "Draw two cards.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function contentFixture(): JourneyContent {
  const cards = [
    card(ENCOUNTER_CARD_ID, 1, "Character", false),
    card("a0000000-0000-4000-8000-000000000002", 2, "Character", true),
    card("a0000000-0000-4000-8000-000000000003", 3, "Event", true),
  ];
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    journeyData: JOURNEY_DATA_FIXTURE,
    cardDatabase: new Map(cards.map((entry) => [entry.cardNumber, entry])),
    dreamAvatars: [],
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
  id: "starter-transfiguration-site",
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

function journeyFixture(
  starterCount: number,
  transfiguredEntryId?: string,
): JourneyState {
  return {
    ...createDefaultState(),
    seed: "starter-transfiguration-plan-test",
    deck: Array.from({ length: starterCount }, (_, index) => {
      const entryId = `starter-${String(index + 1)}`;
      return {
        entryId,
        cardNumber: index % 2 === 0 ? 2 : 3,
        transfiguration:
          entryId === transfiguredEntryId ? ("Empowered" as const) : null,
        isBane: false,
      };
    }),
  };
}

function prepare(
  effectKind:
    "transfigure-random-starter-cards" | "transfigure-all-starter-cards",
  journey: JourneyState,
  count?: number,
) {
  return prepareExplorationStarterCardTransfigurationPlan({
    effectKind,
    count,
    actionId: "starter-transfiguration-action",
    encounterCardId: ENCOUNTER_CARD_ID,
    journey,
    site,
    content: contentFixture(),
  });
}

describe("Exploration starter-card transfiguration plan", () => {
  it("samples entries before independently sampling a positive form for each target", () => {
    const journey = journeyFixture(4);
    const first = prepare("transfigure-random-starter-cards", journey, 2);
    const replay = prepare("transfigure-random-starter-cards", journey, 2);

    expect(first.unavailableReason).toBeUndefined();
    expect(first.kind).toBe("random-count");
    expect(first.starterCards).toHaveLength(4);
    expect(first.eligibleStarterCards).toHaveLength(4);
    expect(first.targets).toHaveLength(2);
    expect(new Set(first.targets.map(({ entryId }) => entryId))).toHaveProperty(
      "size",
      2,
    );
    expect(first.selectorTraces[0]).toMatchObject({
      mechanicId: "purge-deck-entry",
      policyId: "uniform",
      keyKind: "entryId",
      candidateCount: 4,
    });
    expect(first.selectorTraces.slice(1)).toHaveLength(2);
    expect(
      first.selectorTraces
        .slice(1)
        .every(
          (trace) =>
            trace.mechanicId === "transfigure-deck-entry" &&
            trace.policyId === "uniform" &&
            trace.candidateCount > 0,
        ),
    ).toBe(true);
    expect(first).toEqual(replay);
    expect(
      explorationStarterCardTransfigurationPreparationsEqual(first, replay),
    ).toBe(true);
  });

  it("targets every starter in stable entry order when every starter is eligible", () => {
    const plan = prepare("transfigure-all-starter-cards", journeyFixture(3));

    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.kind).toBe("all");
    expect(plan.targets.map(({ entryId }) => entryId)).toEqual([
      "starter-1",
      "starter-2",
      "starter-3",
    ]);
    expect(plan.selectorTraces).toHaveLength(3);
    expect(
      plan.selectorTraces.every(
        (trace) =>
          trace.mechanicId === "transfigure-deck-entry" &&
          trace.policyId === "uniform",
      ),
    ).toBe(true);
  });

  it("makes all-starter behavior unavailable when even one starter cannot be transfigured", () => {
    const plan = prepare(
      "transfigure-all-starter-cards",
      journeyFixture(3, "starter-2"),
    );

    expect(plan).toMatchObject({
      unavailableReason: "all-starter-cards-must-be-transfigurable",
      targets: [],
      selectorSignatures: [],
      selectorTraces: [],
    });
    expect(plan.starterCards).toHaveLength(3);
    expect(plan.eligibleStarterCards).toHaveLength(2);
    expect(plan.planSignature).not.toHaveLength(0);
  });

  it("returns signed unavailable plans for absent or insufficient starters", () => {
    const absent = prepare(
      "transfigure-random-starter-cards",
      journeyFixture(0),
      1,
    );
    const insufficient = prepare(
      "transfigure-random-starter-cards",
      journeyFixture(2),
      3,
    );

    expect(absent).toMatchObject({
      unavailableReason: "requires-starter-card",
      starterCards: [],
      targets: [],
    });
    expect(insufficient).toMatchObject({
      unavailableReason: "insufficient-transfigurable-starter-cards",
      targets: [],
    });
    expect(absent.planSignature).not.toHaveLength(0);
    expect(insufficient.planSignature).not.toHaveLength(0);
  });

  it("rejects a target mutation even when the stale plan signature is retained", () => {
    const plan = prepare(
      "transfigure-random-starter-cards",
      journeyFixture(3),
      2,
    );
    const firstTarget = plan.targets[0];
    if (firstTarget === undefined)
      throw new Error("Expected a prepared target");
    const tampered = {
      ...plan,
      targets: [
        { ...firstTarget, transfiguration: "Perfected" as const },
        ...plan.targets.slice(1),
      ],
    };

    expect(
      explorationStarterCardTransfigurationPreparationsEqual(tampered, plan),
    ).toBe(false);
  });

  it("uses the canonical starter role even when a fixture omits the convenience flag", () => {
    const content = contentFixture();
    const roleOnly = content.cardDatabase.get(2);
    if (roleOnly === undefined) throw new Error("Expected starter fixture");
    content.cardDatabase.set(2, { ...roleOnly, isStarter: false });
    const plan = prepareExplorationStarterCardTransfigurationPlan({
      effectKind: "transfigure-random-starter-cards",
      count: 1,
      actionId: "role-only-starter-action",
      encounterCardId: ENCOUNTER_CARD_ID,
      journey: journeyFixture(1),
      site,
      content,
    });

    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]?.cardId).toBe(roleOnly.id);
  });

  it("binds authored count and encounter identity even when the prepared targets are unchanged", () => {
    const content = contentFixture();
    const journey = journeyFixture(2);
    const baseInput = {
      effectKind: "transfigure-all-starter-cards" as const,
      actionId: "bound-starter-action",
      encounterCardId: ENCOUNTER_CARD_ID,
      journey,
      site,
      content,
    };
    const original =
      prepareExplorationStarterCardTransfigurationPlan(baseInput);
    const authoredCountChanged =
      prepareExplorationStarterCardTransfigurationPlan({
        ...baseInput,
        count: 1,
      });
    const encounterChanged = prepareExplorationStarterCardTransfigurationPlan({
      ...baseInput,
      encounterCardId: "a0000000-0000-4000-8000-000000000099",
    });

    expect(authoredCountChanged.targets).toEqual(original.targets);
    expect(encounterChanged.targets).toEqual(original.targets);
    expect(authoredCountChanged.planSignature).not.toBe(original.planSignature);
    expect(encounterChanged.planSignature).not.toBe(original.planSignature);
  });
});
