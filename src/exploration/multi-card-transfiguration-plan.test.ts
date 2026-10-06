import { testJourneySeed } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../testing/atlas-fixtures";
import type { JourneyContent } from "../data/journey-content";
import { testJourneyState } from "../testing/journey-genesis";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { parseCardName } from "../types/card-identity";
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
  type ExplorationMultiCardTransfigurationPreparation as Preparation,
} from "./multi-card-transfiguration-plan";
import { parseSiteId } from "../types/identifiers";
import type { DeckEntryId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import { parseDeckEntryId } from "../types/identifiers";
import type { ExplorationActionId } from "../types/identifiers";
import { testExplorationActionId, testCardId } from "../types/test-identities";

const ENCOUNTER_CARD_ID = testCardId("b0000000-0000-4000-8000-000000000001");
const CHARACTER_CARD_ID = testCardId("b0000000-0000-4000-8000-000000000002");
const EVENT_CARD_ID = testCardId("b0000000-0000-4000-8000-000000000003");
const FAST_EVENT_CARD_ID = testCardId("b0000000-0000-4000-8000-000000000004");
const STARTER_CARD_ID = testCardId("b0000000-0000-4000-8000-000000000005");
const DEFAULT_ACTION_ID = testExplorationActionId(
  "multi-transfiguration-action",
);

function card(input: {
  id: CardId;
  cardNumber: number;
  cardType: CardData["cardType"];
  rarity?: CardData["rarity"];
  isFast?: boolean;
  isStarter?: boolean;
}): CardData {
  const isCharacter = input.cardType === "Character";
  return {
    id: input.id,
    name: parseCardName(
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
    avatars: [],
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
  id: parseSiteId("multi-transfiguration-site"),
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
    ...testJourneyState(),
    seed: testJourneySeed("multi-card-transfiguration-plan-test"),
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
    actionId: input.actionId ?? DEFAULT_ACTION_ID,
    encounterCardId: input.encounterCardId ?? ENCOUNTER_CARD_ID,
    journey: journey(input.deck),
    site: input.siteOverride ?? site,
    content: contentFixture(),
  });
}

const id = parseDeckEntryId;

describe("Exploration multi-card transfiguration plan", () => {
  it.each([
    {
      name: "flexible chosen ledger sorted by entry UUID",
      effectKind: "transfigure-selected" as const,
      predicate: "character" as const,
      count: 2,
      deck: [
        entry(id("z-copy"), 2),
        entry(id("event"), 3),
        entry(id("a-copy"), 2),
        entry(id("already-changed"), 2, { transfiguration: "Empowered" }),
      ],
      mode: "chosen-flexible",
      eligible: [
        [id("a-copy"), CHARACTER_CARD_ID],
        [id("z-copy"), CHARACTER_CARD_ID],
      ],
      fixedForm: undefined,
    },
    {
      name: "fixed chosen ledger excluding cards the form cannot change",
      effectKind: "transfigure-fixed-selected" as const,
      predicate: "event" as const,
      count: 2,
      transfiguration: "Hastened" as const,
      deck: [
        entry(id("z-event"), 3),
        entry(id("already-fast"), 4),
        entry(id("a-event"), 3),
        entry(id("already-transfigured"), 3, { transfiguration: "Amplified" }),
      ],
      mode: "chosen-fixed",
      eligible: [
        [id("a-event"), EVENT_CARD_ID],
        [id("z-event"), EVENT_CARD_ID],
      ],
      fixedForm: "Hastened",
    },
    {
      name: "legendary predicate by exact rarity",
      effectKind: "transfigure-selected" as const,
      predicate: "legendary" as const,
      count: undefined,
      deck: [entry(id("legendary"), 2), entry(id("ordinary-event"), 3)],
      mode: "chosen-flexible",
      eligible: [[id("legendary"), CHARACTER_CARD_ID]],
      fixedForm: undefined,
    },
    {
      name: "count-one flexible chosen plan without a predicate",
      effectKind: "transfigure-selected" as const,
      predicate: undefined,
      count: undefined,
      deck: [entry(id("entry"), 2)],
      mode: "chosen-flexible",
      eligible: [[id("entry"), CHARACTER_CARD_ID]],
      fixedForm: undefined,
    },
    {
      name: "count-one fixed chosen plan without a predicate",
      effectKind: "transfigure-fixed-selected" as const,
      predicate: undefined,
      count: undefined,
      transfiguration: "Kindled" as const,
      deck: [entry(id("entry"), 2)],
      mode: "chosen-fixed",
      eligible: [[id("entry"), CHARACTER_CARD_ID]],
      fixedForm: "Kindled",
    },
  ])("builds a $name", ({ mode, eligible, fixedForm, ...input }) => {
    const plan = prepare(input);

    expect(plan).toMatchObject({
      mode,
      targets: [],
      selectorSignatures: [],
      selectorTraces: [],
    });
    expect(plan.unavailableReason).toBeUndefined();
    expect(
      plan.eligibleCards.map(({ entryId, cardId }) => [entryId, cardId]),
    ).toEqual(eligible);
    for (const { transfigurations } of plan.eligibleCards) {
      if (fixedForm === undefined) {
        expect(transfigurations.length).toBeGreaterThan(0);
      } else {
        expect(transfigurations).toEqual([fixedForm]);
      }
    }
  });

  it("selects distinct random targets deterministically, including Banes and starters", () => {
    const authored = {
      effectKind: "transfigure-random-cards" as const,
      predicate: "character" as const,
      count: 3,
      deck: [
        entry(id("entry-1"), 2),
        entry(id("entry-2"), 2, { isBane: true }),
        entry(id("entry-3"), 2),
        entry(id("entry-4"), 2),
        entry(id("starter-entry"), 5),
        entry(id("event"), 3),
      ],
    };
    const first = prepare(authored);
    const replay = prepare(authored);

    expect(first).toEqual(replay);
    expect(
      explorationMultiCardTransfigurationPreparationsEqual(first, replay),
    ).toBe(true);
    expect(first.mode).toBe("random-flexible");
    expect(first.eligibleCards.map(({ entryId }) => entryId).sort()).toEqual(
      ["entry-1", "entry-2", "entry-3", "entry-4", "starter-entry"].map(id),
    );
    expect(new Set(first.targets.map(({ entryId }) => entryId)).size).toBe(3);
    for (const target of first.targets) {
      const binding = first.eligibleCards.find(
        ({ entryId }) => entryId === target.entryId,
      );
      expect(binding?.transfigurations).toContain(target.transfiguration);
    }
  });

  it("attaches the one authored form to fixed random targets", () => {
    const plan = prepare({
      effectKind: "transfigure-fixed-random-cards",
      predicate: "event",
      count: 1,
      transfiguration: "Hastened",
      deck: [entry(id("ordinary-event"), 3), entry(id("already-fast"), 4)],
    });

    expect(plan.mode).toBe("random-fixed");
    expect(plan.targets).toEqual([
      {
        entryId: id("ordinary-event"),
        cardId: EVENT_CARD_ID,
        transfiguration: "Hastened",
      },
    ]);
  });

  it.each([
    {
      effectKind: "transfigure-random-cards" as const,
      predicate: "character" as const,
      count: 2,
      deck: [entry(id("only-one"), 2), entry(id("event"), 3)],
    },
    {
      effectKind: "transfigure-fixed-random-cards" as const,
      predicate: "event" as const,
      count: 1,
      transfiguration: "Kindled" as const,
      deck: [entry(id("event"), 3)],
    },
    {
      effectKind: "transfigure-fixed-selected" as const,
      predicate: "event" as const,
      count: 2,
      transfiguration: "Hastened" as const,
      deck: [entry(id("only-one"), 3), entry(id("already-fast"), 4)],
    },
  ])(
    "returns a signed unavailable $effectKind plan when the exact count cannot be met",
    (input) => {
      const plan = prepare(input);

      expect(plan).toMatchObject({
        unavailableReason: "insufficient-eligible-cards",
        targets: [],
        selectorSignatures: [],
        selectorTraces: [],
      });
      expect(plan.planSignature).not.toHaveLength(0);
    },
  );

  const two = [entry(id("entry-1"), 2), entry(id("entry-2"), 2)];
  const one = [entry(id("entry"), 2)];
  it.each([
    {
      effectKind: "transfigure-random-cards" as const,
      predicate: "character" as const,
      count: 0,
      deck: one,
    },
    { effectKind: "transfigure-random-cards" as const, count: 1, deck: one },
    { effectKind: "transfigure-selected" as const, count: 2, deck: two },
    {
      effectKind: "transfigure-fixed-random-cards" as const,
      predicate: "character" as const,
      count: 1,
      deck: one,
    },
    {
      effectKind: "transfigure-random-cards" as const,
      predicate: "character" as const,
      count: 1,
      transfiguration: "Kindled" as const,
      deck: one,
    },
    {
      effectKind: "transfigure-fixed-selected" as const,
      count: 2,
      transfiguration: "Kindled" as const,
      deck: two,
    },
    {
      effectKind: "transfigure-fixed-selected" as const,
      predicate: "character" as const,
      count: 2,
      deck: two,
    },
  ])(
    "rejects invalid authored configuration %# before selecting anything",
    (input) => {
      const plan = prepare(input);

      expect(plan.unavailableReason).toBe("invalid-authored-configuration");
      expect(plan.selectorTraces).toEqual([]);
    },
  );

  it.each([
    {
      field: "target form",
      effectKind: "transfigure-random-cards" as const,
      transfiguration: undefined,
      tamper: (plan: Preparation): Preparation => ({
        ...plan,
        targets: plan.targets.map((target, index) =>
          index === 0 ? { ...target, transfiguration: "Perfected" } : target,
        ),
      }),
    },
    {
      field: "fixed chosen binding",
      effectKind: "transfigure-fixed-selected" as const,
      transfiguration: "Kindled" as const,
      tamper: (plan: Preparation): Preparation => ({
        ...plan,
        eligibleCards: plan.eligibleCards.map((binding, index) =>
          index === 0
            ? { ...binding, transfigurations: ["Perfected"] }
            : binding,
        ),
      }),
    },
  ])(
    "detects a tampered $field even when the plan signature is retained",
    ({ effectKind, transfiguration, tamper }) => {
      const plan = prepare({
        effectKind,
        predicate: "character",
        count: 2,
        transfiguration,
        deck: two,
      });

      expect(
        explorationMultiCardTransfigurationPreparationsEqual(
          tamper(plan),
          plan,
        ),
      ).toBe(false);
    },
  );

  it.each([
    "transfigure-fixed-selected" as const,
    "transfigure-fixed-random-cards" as const,
  ])(
    "binds every authored field and encounter identity into the %s plan signature",
    (effectKind) => {
      const authored = {
        effectKind,
        predicate: "character" as const,
        count: 1,
        transfiguration: "Kindled" as const,
        deck: two,
      };
      const base = prepare(authored);
      const variants = [
        prepare({
          ...authored,
          effectKind:
            effectKind === "transfigure-fixed-selected"
              ? "transfigure-fixed-random-cards"
              : "transfigure-fixed-selected",
        }),
        prepare({ ...authored, predicate: "warrior" }),
        prepare({ ...authored, count: 2 }),
        prepare({ ...authored, transfiguration: "Empowered" }),
        prepare({
          ...authored,
          actionId: testExplorationActionId("different-action"),
        }),
        prepare({
          ...authored,
          encounterCardId: testCardId("b0000000-0000-4000-8000-000000000099"),
        }),
        prepare({
          ...authored,
          siteOverride: { ...site, id: parseSiteId("different-site") },
        }),
      ];

      expect(prepare(authored)).toEqual(base);
      for (const variant of variants) {
        expect(variant.planSignature).not.toBe(base.planSignature);
      }
    },
  );
});
