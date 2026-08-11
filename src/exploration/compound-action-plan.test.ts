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
import { JOURNEY_DATA_FIXTURE } from "../testing/journey-data-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type {
  CardTypeChange,
  DeckEntry,
  SiteState,
  TransfigurationType,
} from "../types/journey";
import {
  explorationCompoundActionPreparationsEqual,
  prepareExplorationCompoundActionPlan,
  type ExplorationCompoundActionPlanInput,
  type ExplorationCompoundActionPreparation,
} from "./compound-action-plan";

const ENCOUNTER_ID = "c0000000-0000-4000-8000-000000000001";

function card(input: {
  index: number;
  cardType: CardData["cardType"];
  isStarter?: boolean;
  isFast?: boolean;
  rarity?: CardData["rarity"];
}): CardData {
  const isCharacter = input.cardType === "Character";
  return {
    id: asCardId(
      `c0000000-0000-4000-8000-${String(input.index).padStart(12, "0")}`,
    ),
    name: asCardName(`Compound fixture ${String(input.index)}`),
    cardNumber: input.index,
    cardType: input.cardType,
    subtype: isCharacter ? "Warrior" : "",
    isStarter: input.isStarter ?? false,
    ...(input.isStarter === true
      ? { roles: ["starter-deck" as const], rarity: "Starter" as const }
      : input.rarity === undefined
        ? {}
        : { rarity: input.rarity }),
    energyCost: 4,
    spark: isCharacter ? 2 : null,
    isFast: input.isFast ?? false,
    renderedText: isCharacter ? "Deal 2 damage." : "Draw a card.",
    amplifiedText: isCharacter ? "Deal 4 damage." : "Draw two cards.",
    imageNumber: input.index,
    artOwned: true,
  };
}

function cardsFixture(): CardData[] {
  return [
    card({ index: 1, cardType: "Character" }),
    card({ index: 2, cardType: "Character" }),
    card({ index: 3, cardType: "Character", rarity: "Legendary" }),
    card({ index: 4, cardType: "Event" }),
    card({ index: 5, cardType: "Event", isFast: true }),
    card({ index: 6, cardType: "Event" }),
    card({ index: 7, cardType: "Event" }),
    card({ index: 8, cardType: "Event" }),
    card({ index: 9, cardType: "Event" }),
    card({ index: 10, cardType: "Event", isStarter: true }),
  ];
}

function contentFixture(cards = cardsFixture()): JourneyContent {
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

function entry(
  entryId: string,
  cardNumber: number,
  options: {
    transfiguration?: TransfigurationType | null;
    typeChange?: CardTypeChange | null;
  } = {},
): DeckEntry {
  return {
    entryId,
    cardNumber,
    transfiguration: options.transfiguration ?? null,
    typeChange: options.typeChange,
    isBane: false,
  };
}

function journey(deck: readonly DeckEntry[], seed = "compound-plan-seed") {
  return {
    ...createDefaultState(),
    seed,
    deck: [...deck],
  };
}

const site: SiteState = {
  id: "compound-plan-site",
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

type SpecificInput = ExplorationCompoundActionPlanInput extends infer Input
  ? Input extends { kind: string }
    ? Omit<
        Input,
        "actionId" | "encounterCardId" | "journey" | "site" | "content"
      >
    : never
  : never;

function prepare(
  specific: SpecificInput,
  options: {
    deck?: readonly DeckEntry[];
    seed?: string;
    siteOverride?: SiteState;
    actionId?: string;
    encounterCardId?: string;
    content?: JourneyContent;
  } = {},
): ExplorationCompoundActionPreparation {
  return prepareExplorationCompoundActionPlan({
    ...specific,
    actionId: options.actionId ?? "compound-action",
    encounterCardId: options.encounterCardId ?? ENCOUNTER_ID,
    journey: journey(options.deck ?? [], options.seed),
    site: options.siteOverride ?? site,
    content: options.content ?? contentFixture(),
  });
}

describe("Exploration compound action plan", () => {
  it("strictly prepares every nonempty untransfigured entry with an independent uniform positive form", () => {
    const plan = prepare(
      { kind: "all-card-transfiguration" },
      {
        deck: [
          entry("duplicate-z", 1),
          entry("event", 4),
          entry("duplicate-a", 1),
        ],
      },
    );

    expect(plan.kind).toBe("all-card-transfiguration");
    if (plan.kind !== "all-card-transfiguration") return;
    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.allCards.map(({ entryId }) => entryId)).toEqual([
      "duplicate-a",
      "duplicate-z",
      "event",
    ]);
    expect(plan.allCards[0]?.cardId).toBe(plan.allCards[1]?.cardId);
    expect(plan.targets.map(({ entryId }) => entryId)).toEqual([
      "duplicate-a",
      "duplicate-z",
      "event",
    ]);
    expect(plan.selectorSignatures).toHaveLength(3);
    expect(plan.selectorTraces).toHaveLength(3);
  });

  it("is stable under deck reordering while seed and site scope remain signed", () => {
    const deck = [entry("z", 1), entry("a", 2), entry("m", 4)];
    const first = prepare({ kind: "all-card-transfiguration" }, { deck });
    const reordered = prepare(
      { kind: "all-card-transfiguration" },
      { deck: [...deck].reverse() },
    );
    const reseeded = prepare(
      { kind: "all-card-transfiguration" },
      { deck, seed: "different-seed" },
    );
    const moved = prepare(
      { kind: "all-card-transfiguration" },
      { deck, siteOverride: { ...site, id: "different-site" } },
    );

    expect(reordered).toEqual(first);
    expect(reseeded.planSignature).not.toBe(first.planSignature);
    expect(moved.planSignature).not.toBe(first.planSignature);
  });

  it("distinguishes an empty deck from a deck that fails strict all-card eligibility", () => {
    const empty = prepare({ kind: "all-card-transfiguration" });
    const partial = prepare(
      { kind: "all-card-transfiguration" },
      {
        deck: [
          entry("eligible", 1),
          entry("already-transfigured", 4, { transfiguration: "Amplified" }),
        ],
      },
    );

    expect(empty.unavailableReason).toBe("empty-deck");
    expect(partial.unavailableReason).toBe("all-cards-not-transfigurable");
    if (partial.kind === "all-card-transfiguration") {
      expect(partial.targets).toEqual([]);
      expect(partial.allCards).toHaveLength(2);
    }
  });

  it("discloses a purge-misfit target by effective type and signs every fixed-form companion", () => {
    const deck = [
      entry("starter-event-now-character", 10, {
        typeChange: {
          predicateId: "wave8-effective-type-fixture",
          cardType: "Character",
          subtype: "Warrior",
          label: "Character",
        },
      }),
      entry("character-a", 1),
      entry("character-b", 2),
      entry("event-a", 4),
      entry("event-b", 6),
      entry("event-c", 7),
      entry("event-d", 8),
      entry("event-e", 9),
    ];
    const plan = prepare(
      {
        kind: "purge-disclosed-transfigure-same-type",
        transfiguration: "Kindled",
      },
      { deck },
    );

    expect(plan.kind).toBe("purge-disclosed-transfigure-same-type");
    if (plan.kind !== "purge-disclosed-transfigure-same-type") return;
    expect(
      plan.eligiblePurgeTargets.find(
        ({ entryId }) => entryId === "starter-event-now-character",
      ),
    ).toMatchObject({ effectiveCardType: "Character" });
    expect(plan.target).toMatchObject({
      entryId: "starter-event-now-character",
      effectiveCardType: "Character",
    });
    expect(plan.companionTargets.map(({ entryId }) => entryId)).toEqual([
      "character-a",
      "character-b",
    ]);
    expect(
      plan.companionTargets.every(
        ({ transfiguration }) => transfiguration === "Kindled",
      ),
    ).toBe(true);
  });

  it("reports no same-type companion without selecting an unrelated purge target", () => {
    const plan = prepare(
      {
        kind: "purge-disclosed-transfigure-same-type",
        transfiguration: "Kindled",
      },
      { deck: [entry("only-character", 1), entry("event", 4)] },
    );

    expect(plan.unavailableReason).toBe("no-same-type-companion");
    if (plan.kind === "purge-disclosed-transfigure-same-type") {
      expect(plan.target).toBeNull();
      expect(plan.companionTargets).toEqual([]);
    }
  });

  it("prepares sorted predicate targets including cards that are already fast without RNG", () => {
    const plan = prepare(
      {
        kind: "predicate-fast-nightmares",
        predicate: "event",
        nightmareCount: 2,
      },
      { deck: [entry("z-slow", 4), entry("a-fast", 5), entry("character", 1)] },
    );

    expect(plan).toMatchObject({
      kind: "predicate-fast-nightmares",
      nightmareCount: 2,
      selectorSignatures: [],
      selectorTraces: [],
    });
    if (plan.kind === "predicate-fast-nightmares") {
      expect(plan.targets.map(({ entryId }) => entryId)).toEqual([
        "a-fast",
        "z-slow",
      ]);
    }
  });

  it("prepares exactly four distinct catalog fixed-form offers for a later zero-to-four choice", () => {
    const plan = prepare({
      kind: "take-transfigured-nightmares",
      predicate: "event",
      offerCount: 4,
      transfiguration: "Amplified",
      nightmareCount: 2,
    });

    expect(plan.kind).toBe("take-transfigured-nightmares");
    if (plan.kind !== "take-transfigured-nightmares") return;
    expect(plan.unavailableReason).toBeUndefined();
    expect(plan.offeredCards).toHaveLength(4);
    expect(new Set(plan.offeredCards.map(({ cardId }) => cardId)).size).toBe(4);
    expect(
      plan.offeredCards.every(
        ({ transfiguration }) => transfiguration === "Amplified",
      ),
    ).toBe(true);
    expect(plan.selectorTraces[0]?.constraints).toMatchObject({
      cardScope: "catalog",
      fixedTransfiguration: "Amplified",
      allowPerfected: true,
    });
  });

  it("prepares four distinct concrete fixed-form deck entries for purge-transfigure-copy", () => {
    const plan = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      {
        deck: [
          entry("copy-1", 1),
          entry("copy-2", 1),
          entry("character-3", 2),
          entry("character-4", 3),
          entry("character-5", 2),
        ],
      },
    );

    expect(plan.kind).toBe("purge-transfigure-copy");
    if (plan.kind !== "purge-transfigure-copy") return;
    expect(plan.eligibleCards).toHaveLength(5);
    expect(plan.targets).toHaveLength(4);
    expect(new Set(plan.targets.map(({ entryId }) => entryId)).size).toBe(4);
    expect(
      plan.targets.some(({ entryId }) => entryId.startsWith("copy-")),
    ).toBe(true);
  });

  it("returns exact unavailable reasons for empty predicate and undersized fixed-form pools", () => {
    const noMatches = prepare(
      {
        kind: "predicate-fast-nightmares",
        predicate: "event",
        nightmareCount: 1,
      },
      { deck: [entry("character", 1)] },
    );
    const catalog = contentFixture([
      card({ index: 1, cardType: "Event" }),
      card({ index: 2, cardType: "Event" }),
      card({ index: 3, cardType: "Event" }),
    ]);
    const tooFewCatalog = prepare(
      {
        kind: "take-transfigured-nightmares",
        predicate: "event",
        offerCount: 4,
        transfiguration: "Amplified",
        nightmareCount: 1,
      },
      { content: catalog },
    );
    const tooFewDeck = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      { deck: [entry("one", 1), entry("two", 2), entry("three", 3)] },
    );

    expect(noMatches.unavailableReason).toBe("no-predicate-matches");
    expect(tooFewCatalog.unavailableReason).toBe(
      "insufficient-fixed-form-catalog-cards",
    );
    expect(tooFewDeck.unavailableReason).toBe(
      "insufficient-fixed-form-deck-entries",
    );
  });

  it("rejects malformed authored counts and retained-signature body tampering", () => {
    const invalid = prepare({
      kind: "take-transfigured-nightmares",
      predicate: "event",
      offerCount: 3,
      transfiguration: "Amplified",
      nightmareCount: 1,
    });
    const plan = prepare(
      {
        kind: "predicate-fast-nightmares",
        predicate: "character",
        nightmareCount: 2,
      },
      { deck: [entry("character", 1)] },
    );
    if (plan.kind !== "predicate-fast-nightmares") return;
    const tampered: ExplorationCompoundActionPreparation = {
      ...plan,
      targets: [
        {
          entryId: "forged-entry",
          cardId: plan.targets[0]?.cardId ?? "missing-card",
        },
      ],
    };

    expect(invalid.unavailableReason).toBe("invalid-authored-configuration");
    expect(explorationCompoundActionPreparationsEqual(plan, { ...plan })).toBe(
      true,
    );
    expect(explorationCompoundActionPreparationsEqual(tampered, plan)).toBe(
      false,
    );
  });

  it("binds action, encounter, authored fields, content revision, and selector traces", () => {
    const deck = [entry("a", 1), entry("b", 2), entry("c", 3), entry("d", 2)];
    const base = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      { deck },
    );
    const changedAction = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      { deck, actionId: "different-action" },
    );
    const changedEncounter = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      { deck, encounterCardId: "different-encounter" },
    );
    const changedForm = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Empowered",
      },
      { deck },
    );
    const revisedCards = cardsFixture().map((fixtureCard, index) =>
      index === 0
        ? {
            ...fixtureCard,
            renderedText: `${fixtureCard.renderedText} Revised.`,
          }
        : fixtureCard,
    );
    const revised = prepare(
      {
        kind: "purge-transfigure-copy",
        offerCount: 4,
        transfiguration: "Kindled",
      },
      { deck, content: contentFixture(revisedCards) },
    );

    expect(changedAction.planSignature).not.toBe(base.planSignature);
    expect(changedEncounter.planSignature).not.toBe(base.planSignature);
    expect(changedForm.planSignature).not.toBe(base.planSignature);
    expect(revised.selectionContentRevision).not.toBe(
      base.selectionContentRevision,
    );
    expect(revised.planSignature).not.toBe(base.planSignature);
  });
});
