// Viability helper tabular test.
//
// One tabular test exercises each of the eight viability helpers with a paired
// positive and negative fixture context. Bug class: a helper returning the
// wrong polarity (true when nothing matches, false when something matches).
// Keeping the suite tabular catches a polarity swap on any helper without
// scaling to eight separate tests.

import { describe, expect, it } from "vitest";

import type { CardContent, ContentBundle, DreamsignContent } from "../../content/types";
import type { JourneyContext, QuestStateProjection } from "../context";
import {
  canAffordEssence,
  canAffordOmens,
  deckContainsCard,
  deckContainsDiscardAbility,
  deckContainsPredicate,
  deckHasMinSize,
  poolHasDreamsignWithTide,
  transfigurationHasEligibleTarget,
} from "./viability";

function card(overrides: Partial<CardContent> & { id: string }): CardContent {
  return {
    name: overrides.name ?? overrides.id,
    tides: overrides.tides ?? [],
    rarity: overrides.rarity ?? "common",
    cardType: overrides.cardType ?? "Event",
    energyCost: overrides.energyCost ?? 3,
    spark: overrides.spark ?? "",
    cardNumber: overrides.cardNumber ?? 0,
    raw: overrides.raw ?? {},
    ...overrides,
  };
}

function dreamsign(overrides: Partial<DreamsignContent> & { id: string }): DreamsignContent {
  return {
    name: overrides.name ?? overrides.id,
    kind: overrides.kind ?? "neutral",
    renderedText: overrides.renderedText ?? "",
    tides: overrides.tides ?? [],
    raw: overrides.raw ?? {},
    ...overrides,
  };
}

function buildContext(args: {
  cards?: readonly CardContent[];
  dreamsigns?: readonly DreamsignContent[];
  deckEntries?: readonly { cardId: string; copies: number }[];
  dreamsignPoolIds?: readonly string[];
  essence?: number;
  omens?: number;
}): JourneyContext {
  const cards = args.cards ?? [];
  const dreamsigns = args.dreamsigns ?? [];
  const deckEntries = args.deckEntries ?? [];
  const content: ContentBundle = {
    cards: [...cards],
    dreamcallers: [],
    dreamsigns: [...dreamsigns],
  };
  const totalCards = deckEntries.reduce((sum, entry) => sum + entry.copies, 0);
  const quest: QuestStateProjection = {
    seed: "test-seed",
    resources: {
      essence: args.essence ?? 0,
      maxEssence: 10,
      omens: args.omens ?? 0,
      dreamscape: 0,
    },
    deck: {
      entries: deckEntries.map((entry) => ({ cardId: entry.cardId, copies: entry.copies })),
      summary: {
        totalCards,
        starterCards: 0,
        uniqueCards: deckEntries.length,
      },
    },
    draftPool: [],
    activeDreamsigns: [],
    dreamsignPoolIds: [...(args.dreamsignPoolIds ?? [])],
    banes: [],
    dreamcaller: { id: "" },
  };
  return { content, contentVersion: "test", state: { quest } };
}

type Case = {
  name: string;
  positive: JourneyContext;
  negative: JourneyContext;
  run: (ctx: JourneyContext) => boolean;
};

// Card fixtures reused across cases.
const EVENT_CARD = card({ id: "event-1", cardType: "Event", energyCost: 2 });
const CHARACTER_CARD = card({ id: "char-1", cardType: "Character", energyCost: 2, spark: 2 });
const DISCARD_CARD = card({
  id: "discard-card",
  cardType: "Event",
  energyCost: 2,
  raw: { "rendered-text": "Choose a card to Discard." },
});
const NON_DISCARD_CARD = card({
  id: "no-discard-card",
  cardType: "Event",
  energyCost: 2,
  raw: { "rendered-text": "Draw a card." },
});
const COST_ZERO_CARD = card({ id: "cost-zero", cardType: "Event", energyCost: 0 });

const DREAMSIGN_DAWN = dreamsign({ id: "ds-dawn", tides: ["dawn"] });
const DREAMSIGN_DUSK = dreamsign({ id: "ds-dusk", tides: ["dusk"] });

const CASES: readonly Case[] = [
  {
    name: "deckContainsCard",
    positive: buildContext({
      cards: [EVENT_CARD],
      deckEntries: [{ cardId: EVENT_CARD.id, copies: 1 }],
    }),
    negative: buildContext({
      cards: [EVENT_CARD],
      deckEntries: [{ cardId: CHARACTER_CARD.id, copies: 1 }],
    }),
    run: (ctx) => deckContainsCard(ctx, EVENT_CARD.id),
  },
  {
    name: "deckContainsPredicate",
    positive: buildContext({
      cards: [EVENT_CARD, CHARACTER_CARD],
      deckEntries: [
        { cardId: EVENT_CARD.id, copies: 1 },
        { cardId: CHARACTER_CARD.id, copies: 1 },
      ],
    }),
    // The catalog includes the matching event, but the deck does not. The
    // helper must scope to the deck — a regression that drops the
    // `source: "deck"` merge would silently resolve over `content.cards`
    // and incorrectly return true here.
    negative: buildContext({
      cards: [EVENT_CARD, CHARACTER_CARD],
      deckEntries: [{ cardId: CHARACTER_CARD.id, copies: 1 }],
    }),
    run: (ctx) => deckContainsPredicate(ctx, "events"),
  },
  {
    name: "deckHasMinSize",
    positive: buildContext({
      cards: [EVENT_CARD],
      deckEntries: [{ cardId: EVENT_CARD.id, copies: 3 }],
    }),
    negative: buildContext({
      cards: [EVENT_CARD],
      deckEntries: [{ cardId: EVENT_CARD.id, copies: 1 }],
    }),
    run: (ctx) => deckHasMinSize(ctx, 3),
  },
  {
    name: "poolHasDreamsignWithTide",
    positive: buildContext({
      dreamsigns: [DREAMSIGN_DAWN],
      dreamsignPoolIds: [DREAMSIGN_DAWN.id],
    }),
    negative: buildContext({
      dreamsigns: [DREAMSIGN_DUSK],
      dreamsignPoolIds: [DREAMSIGN_DUSK.id],
    }),
    run: (ctx) => poolHasDreamsignWithTide(ctx, "dawn"),
  },
  {
    name: "transfigurationHasEligibleTarget",
    // Viridian requires energyCost > 0.
    positive: buildContext({
      cards: [EVENT_CARD],
      deckEntries: [{ cardId: EVENT_CARD.id, copies: 1 }],
    }),
    negative: buildContext({
      cards: [COST_ZERO_CARD],
      deckEntries: [{ cardId: COST_ZERO_CARD.id, copies: 1 }],
    }),
    run: (ctx) => transfigurationHasEligibleTarget(ctx, "Viridian"),
  },
  {
    name: "canAffordEssence",
    positive: buildContext({ essence: 5 }),
    negative: buildContext({ essence: 1 }),
    run: (ctx) => canAffordEssence(ctx, 3),
  },
  {
    name: "canAffordOmens",
    positive: buildContext({ omens: 5 }),
    negative: buildContext({ omens: 1 }),
    run: (ctx) => canAffordOmens(ctx, 3),
  },
  {
    name: "deckContainsDiscardAbility",
    positive: buildContext({
      cards: [DISCARD_CARD],
      deckEntries: [{ cardId: DISCARD_CARD.id, copies: 1 }],
    }),
    negative: buildContext({
      cards: [NON_DISCARD_CARD],
      deckEntries: [{ cardId: NON_DISCARD_CARD.id, copies: 1 }],
    }),
    run: (ctx) => deckContainsDiscardAbility(ctx),
  },
];

describe("viability helpers", () => {
  it("each helper returns true on positive fixtures and false on negative", () => {
    for (const { name, positive, negative, run } of CASES) {
      expect(run(positive), `${name} positive`).toBe(true);
      expect(run(negative), `${name} negative`).toBe(false);
    }
  });
});
