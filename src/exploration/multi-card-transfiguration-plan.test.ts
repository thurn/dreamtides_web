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
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type {
  DeckEntry,
  JourneyState,
  SiteState,
  TransfigurationType,
} from "../types/journey";
import {
  explorationMultiCardTransfigurationPreparationsEqual,
  prepareExplorationMultiCardTransfigurationPlan,
  type ExplorationMultiCardTransfigurationPlanInput,
} from "./multi-card-transfiguration-plan";
import { asSiteId } from "../types/identifiers";
import type { DeckEntryId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import { asDeckEntryId } from "../types/identifiers";
import type { ExplorationActionId } from "../types/identifiers";
import { asExplorationActionId } from "../types/identifiers";

const ENCOUNTER_CARD_ID = asCardId("b0000000-0000-4000-8000-000000000001");
const CHARACTER_CARD_ID = "b0000000-0000-4000-8000-000000000002";
const EVENT_CARD_ID = "b0000000-0000-4000-8000-000000000003";
const FAST_EVENT_CARD_ID = "b0000000-0000-4000-8000-000000000004";
const STARTER_CARD_ID = "b0000000-0000-4000-8000-000000000005";

function card(input: {
  id: string;
  cardNumber: number;
  cardType: CardData["cardType"];
  rarity?: CardData["rarity"];
  isFast?: boolean;
  isStarter?: boolean;
}): CardData {
  const isCharacter = input.cardType === "Character";
  return {
    id: asCardId(input.id),
    name: asCardName(
      `Multi transfiguration fixture ${String(input.cardNumber)}`,
    ),
    cardNumber: input.cardNumber,
    cardType: input.cardType,
    subtype: isCharacter ? "Warrior" : "",
    isStarter: input.isStarter ?? false,
    ...(input.rarity === undefined ? {} : { rarity: input.rarity }),
    ...(input.isStarter === true
      ? { roles: ["starter-deck" as const], rarity: "Starter" as const }
      : {}),
    energyCost: 4,
    spark: isCharacter ? 2 : null,
    isFast: input.isFast ?? false,
    renderedText: isCharacter ? "Deal 2 damage." : "Draw a card.",
    amplifiedText: isCharacter ? "Deal 4 damage." : "Draw two cards.",
    imageNumber: input.cardNumber,
    artOwned: true,
  };
}

function contentFixture(): JourneyContent {
  const cards = [
    card({
      id: ENCOUNTER_CARD_ID,
      cardNumber: 1,
      cardType: "Character",
    }),
    card({
      id: CHARACTER_CARD_ID,
      cardNumber: 2,
      cardType: "Character",
      rarity: "Legendary",
    }),
    card({ id: EVENT_CARD_ID, cardNumber: 3, cardType: "Event" }),
    card({
      id: FAST_EVENT_CARD_ID,
      cardNumber: 4,
      cardType: "Event",
      isFast: true,
    }),
    card({
      id: STARTER_CARD_ID,
      cardNumber: 5,
      cardType: "Character",
      isStarter: true,
    }),
  ];
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
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
  id: asSiteId("multi-transfiguration-site"),
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

function entry(
  entryId: DeckEntryId,
  cardNumber: number,
  input: {
    transfiguration?: TransfigurationType | null;
    isBane?: boolean;
  } = {},
): DeckEntry {
  return {
    entryId,
    cardNumber,
    transfiguration: input.transfiguration ?? null,
    isBane: input.isBane ?? false,
  };
}

function journey(deck: readonly DeckEntry[]): JourneyState {
  return {
    ...createDefaultState(),
    seed: "multi-card-transfiguration-plan-test",
    deck: [...deck],
  };
}

function prepare(
  input: Pick<
    ExplorationMultiCardTransfigurationPlanInput,
    "effectKind" | "predicate" | "count" | "transfiguration"
  > & {
    deck: readonly DeckEntry[];
    actionId?: ExplorationActionId;
    encounterCardId?: CardId;
    siteOverride?: SiteState;
  },
) {
  return prepareExplorationMultiCardTransfigurationPlan({
    effectKind: input.effectKind,
    predicate: input.predicate,
    count: input.count,
    transfiguration: input.transfiguration,
    actionId:
      input.actionId ?? asExplorationActionId("multi-transfiguration-action"),
    encounterCardId: input.encounterCardId ?? ENCOUNTER_CARD_ID,
    journey: journey(input.deck),
    site: input.siteOverride ?? site,
    content: contentFixture(),
  });
}

describe("Exploration multi-card transfiguration plan", () => {
  it("builds a stable chosen candidate ledger by concrete entry UUID", () => {
    const plan = prepare({
      effectKind: "transfigure-selected",
      predicate: "character",
      count: 2,
      deck: [
        entry(asDeckEntryId("z-copy"), 2),
        entry(asDeckEntryId("event"), 3),
        entry(asDeckEntryId("a-copy"), 2),
        entry(asDeckEntryId("already-changed"), 2, {
          transfiguration: "Empowered",
        }),
      ],
    });

    expect(plan).toMatchObject({
      mode: "chosen-flexible",
      targets: [],
      selectorSignatures: [],
      selectorTraces: [],
    });
    expect(plan.eligibleCards.map(({ entryId }) => entryId)).toEqual([
      "a-copy",
      "z-copy",
    ]);
    expect(plan.eligibleCards.map(({ cardId }) => cardId)).toEqual([
      CHARACTER_CARD_ID,
      CHARACTER_CARD_ID,
    ]);
    expect(
      plan.eligibleCards.every(({ transfigurations }) =>
        transfigurations.includes("Kindled"),
      ),
    ).toBe(true);
  });

  it("builds a fixed-form chosen ledger for an exact authored count without RNG", () => {
    const plan = prepare({
      effectKind: "transfigure-fixed-selected",
      predicate: "event",
      count: 2,
      transfiguration: "Hastened",
      deck: [
        entry(asDeckEntryId("z-event"), 3),
        entry(asDeckEntryId("already-fast"), 4),
        entry(asDeckEntryId("a-event"), 3),
        entry(asDeckEntryId("already-transfigured"), 3, {
          transfiguration: "Amplified",
        }),
      ],
    });

    expect(plan).toMatchObject({
      mode: "chosen-fixed",
      targets: [],
      selectorSignatures: [],
      selectorTraces: [],
    });
    expect(plan.eligibleCards).toEqual([
      {
        entryId: asDeckEntryId("a-event"),
        cardId: asCardId(EVENT_CARD_ID),
        transfigurations: ["Hastened"],
      },
      {
        entryId: asDeckEntryId("z-event"),
        cardId: asCardId(EVENT_CARD_ID),
        transfigurations: ["Hastened"],
      },
    ]);
    expect(plan.unavailableReason).toBeUndefined();
  });

  it("filters legendary transfiguration candidates by exact rarity", () => {
    const plan = prepare({
      effectKind: "transfigure-selected",
      predicate: "legendary",
      deck: [
        entry(asDeckEntryId("legendary"), 2),
        entry(asDeckEntryId("ordinary-event"), 3),
      ],
    });

    expect(plan.eligibleCards).toEqual([
      expect.objectContaining({
        entryId: asDeckEntryId("legendary"),
        cardId: asCardId(CHARACTER_CARD_ID),
      }),
    ]);
  });

  it("keeps count-one chosen planning compatible without requiring a predicate", () => {
    const flexible = prepare({
      effectKind: "transfigure-selected",
      deck: [entry(asDeckEntryId("entry"), 2)],
    });
    const fixed = prepare({
      effectKind: "transfigure-fixed-selected",
      transfiguration: "Kindled",
      deck: [entry(asDeckEntryId("entry"), 2)],
    });

    expect(flexible).toMatchObject({
      mode: "chosen-flexible",
      targets: [],
    });
    expect(fixed).toMatchObject({
      mode: "chosen-fixed",
      targets: [],
    });
    expect(flexible.unavailableReason).toBeUndefined();
    expect(fixed.unavailableReason).toBeUndefined();
  });

  it("selects entries uniformly before using independent uniform form streams", () => {
    const deck = [
      entry(asDeckEntryId("entry-1"), 2),
      entry(asDeckEntryId("entry-2"), 2, { isBane: true }),
      entry(asDeckEntryId("entry-3"), 2),
      entry(asDeckEntryId("entry-4"), 2),
      entry(asDeckEntryId("starter-entry"), 5),
    ];
    const first = prepare({
      effectKind: "transfigure-random-cards",
      predicate: "character",
      count: 3,
      deck,
    });
    const replay = prepare({
      effectKind: "transfigure-random-cards",
      predicate: "character",
      count: 3,
      deck,
    });

    expect(first).toEqual(replay);
    expect(
      explorationMultiCardTransfigurationPreparationsEqual(first, replay),
    ).toBe(true);
    expect(first.mode).toBe("random-flexible");
    expect(first.targets).toHaveLength(3);
    expect(new Set(first.targets.map(({ entryId }) => entryId))).toHaveProperty(
      "size",
      3,
    );
    expect(first.selectorTraces).toHaveLength(4);
    expect(first.selectorTraces[0]).toMatchObject({
      mechanicId: "purge-deck-entry",
      policyId: "uniform",
      selectionKey: "multi-transfiguration-action:targets",
      keyKind: "entryId",
      candidateCount: 5,
    });
    expect(first.eligibleCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: asDeckEntryId("entry-2") }),
        expect.objectContaining({
          entryId: asDeckEntryId("starter-entry"),
          cardId: asCardId(STARTER_CARD_ID),
        }),
      ]),
    );
    expect(
      first.selectorTraces.slice(1).map(({ selectionKey }) => selectionKey),
    ).toEqual(
      first.targets.map(
        ({ entryId }) => `multi-transfiguration-action:form:${entryId}`,
      ),
    );
    expect(
      first.selectorTraces
        .slice(1)
        .every(
          ({ mechanicId, policyId }) =>
            mechanicId === "transfigure-deck-entry" && policyId === "uniform",
        ),
    ).toBe(true);
  });

  it("filters fixed-form eligibility and attaches one authored form without form RNG", () => {
    const plan = prepare({
      effectKind: "transfigure-fixed-random-cards",
      predicate: "event",
      count: 1,
      transfiguration: "Hastened",
      deck: [
        entry(asDeckEntryId("ordinary-event"), 3),
        entry(asDeckEntryId("already-fast"), 4),
      ],
    });

    expect(plan.mode).toBe("random-fixed");
    expect(plan.eligibleCards).toEqual([
      {
        entryId: asDeckEntryId("ordinary-event"),
        cardId: asCardId(EVENT_CARD_ID),
        transfigurations: ["Hastened"],
      },
    ]);
    expect(plan.targets).toEqual([
      {
        entryId: asDeckEntryId("ordinary-event"),
        cardId: asCardId(EVENT_CARD_ID),
        transfiguration: "Hastened",
      },
    ]);
    expect(plan.selectorTraces).toHaveLength(1);
    expect(plan.selectorTraces[0]?.selectionKey).toBe(
      "multi-transfiguration-action:targets",
    );
  });

  it("returns signed unavailable plans when exact count cannot be satisfied", () => {
    const insufficient = prepare({
      effectKind: "transfigure-random-cards",
      predicate: "character",
      count: 2,
      deck: [
        entry(asDeckEntryId("only-one"), 2),
        entry(asDeckEntryId("event"), 3),
      ],
    });
    const fixedUnavailable = prepare({
      effectKind: "transfigure-fixed-random-cards",
      predicate: "event",
      count: 1,
      transfiguration: "Kindled",
      deck: [entry(asDeckEntryId("event"), 3)],
    });
    const chosenFixedInsufficient = prepare({
      effectKind: "transfigure-fixed-selected",
      predicate: "event",
      count: 2,
      transfiguration: "Hastened",
      deck: [
        entry(asDeckEntryId("only-one"), 3),
        entry(asDeckEntryId("already-fast"), 4),
      ],
    });

    for (const plan of [
      insufficient,
      fixedUnavailable,
      chosenFixedInsufficient,
    ]) {
      expect(plan).toMatchObject({
        unavailableReason: "insufficient-eligible-cards",
        targets: [],
        selectorSignatures: [],
        selectorTraces: [],
      });
      expect(plan.planSignature).not.toHaveLength(0);
    }
  });

  it("rejects invalid authored configurations before selecting anything", () => {
    const invalid = [
      prepare({
        effectKind: "transfigure-random-cards",
        predicate: "character",
        count: 0,
        deck: [entry(asDeckEntryId("entry"), 2)],
      }),
      prepare({
        effectKind: "transfigure-random-cards",
        count: 1,
        deck: [entry(asDeckEntryId("entry"), 2)],
      }),
      prepare({
        effectKind: "transfigure-selected",
        count: 2,
        deck: [
          entry(asDeckEntryId("entry-1"), 2),
          entry(asDeckEntryId("entry-2"), 2),
        ],
      }),
      prepare({
        effectKind: "transfigure-fixed-random-cards",
        predicate: "character",
        count: 1,
        deck: [entry(asDeckEntryId("entry"), 2)],
      }),
      prepare({
        effectKind: "transfigure-random-cards",
        predicate: "character",
        count: 1,
        transfiguration: "Kindled",
        deck: [entry(asDeckEntryId("entry"), 2)],
      }),
      prepare({
        effectKind: "transfigure-fixed-selected",
        count: 2,
        transfiguration: "Kindled",
        deck: [
          entry(asDeckEntryId("entry-1"), 2),
          entry(asDeckEntryId("entry-2"), 2),
        ],
      }),
      prepare({
        effectKind: "transfigure-fixed-selected",
        predicate: "character",
        count: 2,
        deck: [
          entry(asDeckEntryId("entry-1"), 2),
          entry(asDeckEntryId("entry-2"), 2),
        ],
      }),
    ];

    expect(
      invalid.every(
        ({ unavailableReason }) =>
          unavailableReason === "invalid-authored-configuration",
      ),
    ).toBe(true);
    expect(
      invalid.every(({ selectorTraces }) => selectorTraces.length === 0),
    ).toBe(true);
  });

  it("detects body tampering even when the plan signature is retained", () => {
    const plan = prepare({
      effectKind: "transfigure-random-cards",
      predicate: "character",
      count: 2,
      deck: [
        entry(asDeckEntryId("entry-1"), 2),
        entry(asDeckEntryId("entry-2"), 2),
      ],
    });
    const firstTarget = plan.targets[0];
    if (firstTarget === undefined) throw new Error("Expected prepared target");
    const tampered = {
      ...plan,
      targets: [
        { ...firstTarget, transfiguration: "Perfected" as const },
        ...plan.targets.slice(1),
      ],
    };

    expect(
      explorationMultiCardTransfigurationPreparationsEqual(tampered, plan),
    ).toBe(false);
  });

  it("detects tampering with a fixed chosen eligible binding", () => {
    const plan = prepare({
      effectKind: "transfigure-fixed-selected",
      predicate: "character",
      count: 2,
      transfiguration: "Kindled",
      deck: [
        entry(asDeckEntryId("entry-1"), 2),
        entry(asDeckEntryId("entry-2"), 2),
      ],
    });
    const firstBinding = plan.eligibleCards[0];
    if (firstBinding === undefined)
      throw new Error("Expected eligible binding");
    const tampered = {
      ...plan,
      eligibleCards: [
        { ...firstBinding, transfigurations: ["Perfected" as const] },
        ...plan.eligibleCards.slice(1),
      ],
    };

    expect(
      explorationMultiCardTransfigurationPreparationsEqual(tampered, plan),
    ).toBe(false);
  });

  it("binds the complete fixed chosen authored and encounter contract", () => {
    const deck = [
      entry(asDeckEntryId("entry-1"), 2),
      entry(asDeckEntryId("entry-2"), 2),
    ];
    const authored = {
      effectKind: "transfigure-fixed-selected" as const,
      predicate: "character" as const,
      count: 2,
      transfiguration: "Kindled" as const,
      deck,
    };
    const base = prepare(authored);
    const replay = prepare(authored);
    const variants = [
      prepare({ ...authored, predicate: "warrior" }),
      prepare({ ...authored, count: 1 }),
      prepare({ ...authored, transfiguration: "Empowered" }),
      prepare({
        ...authored,
        actionId: asExplorationActionId("different-action"),
      }),
      prepare({
        ...authored,
        encounterCardId: asCardId("b0000000-0000-4000-8000-000000000099"),
      }),
      prepare({
        ...authored,
        siteOverride: { ...site, id: asSiteId("different-site") },
      }),
    ];

    expect(base).toEqual(replay);
    expect(
      explorationMultiCardTransfigurationPreparationsEqual(base, replay),
    ).toBe(true);
    expect(
      variants.every(
        ({ planSignature }) => planSignature !== base.planSignature,
      ),
    ).toBe(true);
  });

  it("binds every authored field and encounter identity into the plan signature", () => {
    const deck = [
      entry(asDeckEntryId("entry-1"), 2),
      entry(asDeckEntryId("entry-2"), 2),
    ];
    const base = prepare({
      effectKind: "transfigure-fixed-random-cards",
      predicate: "character",
      count: 1,
      transfiguration: "Kindled",
      deck,
    });
    const variants = [
      prepare({
        effectKind: "transfigure-selected",
        predicate: "character",
        count: 1,
        transfiguration: "Kindled",
        deck,
      }),
      prepare({
        effectKind: "transfigure-fixed-random-cards",
        predicate: "warrior",
        count: 1,
        transfiguration: "Kindled",
        deck,
      }),
      prepare({
        effectKind: "transfigure-fixed-random-cards",
        predicate: "character",
        count: 2,
        transfiguration: "Kindled",
        deck,
      }),
      prepare({
        effectKind: "transfigure-fixed-random-cards",
        predicate: "character",
        count: 1,
        transfiguration: "Empowered",
        deck,
      }),
      prepare({
        effectKind: "transfigure-fixed-random-cards",
        predicate: "character",
        count: 1,
        transfiguration: "Kindled",
        deck,
        actionId: asExplorationActionId("different-action"),
      }),
      prepare({
        effectKind: "transfigure-fixed-random-cards",
        predicate: "character",
        count: 1,
        transfiguration: "Kindled",
        deck,
        encounterCardId: asCardId("b0000000-0000-4000-8000-000000000099"),
      }),
      prepare({
        effectKind: "transfigure-fixed-random-cards",
        predicate: "character",
        count: 1,
        transfiguration: "Kindled",
        deck,
        siteOverride: { ...site, id: asSiteId("different-site") },
      }),
    ];

    expect(
      variants.every(
        ({ planSignature }) => planSignature !== base.planSignature,
      ),
    ).toBe(true);
  });
});
