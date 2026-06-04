// Shared test fixture for shape contract tests.
//
// Builds a populated `JourneyContext` (deck of ~10 cards spanning the
// predicates and transfigurations the shape fills consult, a couple active
// dreamsigns, modest essence/omens) plus a deterministic `DrawContext`.
//
// Each shape's contract test calls `buildFixtureContext()` and feeds the
// result into `plugin.fill(...)`, asserting structural validity. The fixture
// is deliberately broad so the same call works for every direct-menu shape:
// random_rewards, random_trades, one_operation_many_targets,
// one_target_many_operations, and same_cost_different_rewards.

import type { CardContent, DreamsignContent } from "../../../content/types";
import type { JourneyContext, QuestStateProjection } from "../../context";
import type { DrawContext } from "../../../util/rng";

function card(
  overrides: Partial<CardContent> & { id: string; name: string },
): CardContent {
  return {
    rarity: overrides.rarity ?? "Common",
    cardType: overrides.cardType ?? "Event",
    energyCost: overrides.energyCost ?? 2,
    spark: overrides.spark ?? 1,
    cardNumber: overrides.cardNumber ?? 0,
    raw: overrides.raw ?? { "rendered-text": "Draw a card." },
    ...overrides,
  };
}

function dreamsign(
  overrides: Partial<DreamsignContent> & { id: string; name: string },
): DreamsignContent {
  return {
    kind: overrides.kind ?? "neutral",
    renderedText: overrides.renderedText ?? "",
    raw: overrides.raw ?? {},
    ...overrides,
  };
}

// Ten cards spread across rarities and types so predicate filters (warriors,
// survivors, spirit_animals, events, characters, low_spark, high_spark) all
// land on at least one match.
const FIXTURE_CARDS: readonly CardContent[] = Object.freeze([
  card({
    id: "warrior-1",
    name: "Brave Warrior",
    cardType: "Character",
    rarity: "Common",
    energyCost: 2,
    spark: 2,
    raw: {
      "rendered-text": "Block 5.",
      "card-types": ["Warrior"],
    },
  }),
  card({
    id: "warrior-2",
    name: "Stalwart Warrior",
    cardType: "Character",
    rarity: "Uncommon",
    energyCost: 3,
    spark: 4,
    raw: {
      "rendered-text": "Materialized: Block 4.",
      "card-types": ["Warrior"],
    },
  }),
  card({
    id: "survivor-1",
    name: "Quick Survivor",
    cardType: "Character",
    rarity: "Common",
    energyCost: 1,
    spark: 1,
    raw: {
      "rendered-text": "Block 2.",
      "card-types": ["Survivor"],
    },
  }),
  card({
    id: "spirit-1",
    name: "Mystic Spirit",
    cardType: "Character",
    rarity: "Rare",
    energyCost: 4,
    spark: 5,
    raw: {
      "rendered-text": "Block 6.",
      "card-types": ["Spirit Animal"],
    },
  }),
  card({
    id: "event-1",
    name: "Quick Draw",
    cardType: "Event",
    rarity: "Common",
    energyCost: 1,
    spark: "",
    raw: { "rendered-text": "Draw 2 cards." },
  }),
  card({
    id: "event-2",
    name: "Big Reveal",
    cardType: "Event",
    rarity: "Uncommon",
    energyCost: 3,
    spark: "",
    raw: { "rendered-text": "Discard a card. Draw 3 cards." },
  }),
  card({
    id: "event-3",
    name: "Bronze Worthy",
    cardType: "Event",
    rarity: "Common",
    energyCost: 2,
    spark: "",
    raw: { "rendered-text": "Deal 3 damage." },
  }),
  card({
    id: "starter-1",
    name: "Starter Strike",
    cardType: "Event",
    rarity: "Starter",
    energyCost: 1,
    spark: "",
    raw: { "rendered-text": "Deal 1 damage." },
  }),
  card({
    id: "starter-2",
    name: "Starter Defend",
    cardType: "Event",
    rarity: "Starter",
    energyCost: 1,
    spark: "",
    raw: { "rendered-text": "Block 2." },
  }),
  card({
    id: "high-spark",
    name: "Towering Beast",
    cardType: "Character",
    rarity: "Legendary",
    energyCost: 5,
    spark: 8,
    raw: {
      "rendered-text": "Block 10.",
      "card-types": ["Spirit Animal"],
    },
  }),
]);

const FIXTURE_DREAMSIGNS: readonly DreamsignContent[] = Object.freeze([
  dreamsign({
    id: "ds-active-1",
    name: "Bright Star",
    kind: "neutral",
    renderedText: "Whenever you draw a card, gain 1 essence.",
  }),
  dreamsign({
    id: "ds-active-2",
    name: "Dim Moon",
    kind: "neutral",
    renderedText: "Whenever you block, gain 1 essence.",
  }),
  dreamsign({
    id: "ds-pool-1",
    name: "Cold Wind",
    kind: "neutral",
    renderedText: "Whenever you discard a card, draw a card.",
  }),
  dreamsign({
    id: "ds-pool-2",
    name: "Warm Sun",
    kind: "tidal",
    renderedText: "Whenever you play a Warrior, gain 1 spark.",
  }),
]);

export function buildFixtureContext(): JourneyContext {
  const deckEntries = [
    { cardId: "warrior-1", copies: 2 },
    { cardId: "warrior-2", copies: 1 },
    { cardId: "survivor-1", copies: 1 },
    { cardId: "spirit-1", copies: 1 },
    { cardId: "event-1", copies: 1 },
    { cardId: "event-2", copies: 1 },
    { cardId: "event-3", copies: 1 },
    { cardId: "starter-1", copies: 1 },
    { cardId: "starter-2", copies: 1 },
    { cardId: "high-spark", copies: 1 },
  ];

  const totalCards = deckEntries.reduce((sum, e) => sum + e.copies, 0);

  const quest: QuestStateProjection = {
    seed: "fixture-seed",
    resources: {
      essence: 80,
      maxEssence: 100,
      omens: 3,
      dreamscape: 1,
    },
    deck: {
      entries: deckEntries,
      summary: {
        totalCards,
        starterCards: 2,
        uniqueCards: deckEntries.length,
      },
    },
    draftPool: [],
    activeDreamsigns: [
      { dreamsignId: "ds-active-1" },
      { dreamsignId: "ds-active-2" },
    ],
    dreamsignPoolIds: ["ds-pool-1", "ds-pool-2"],
    banes: [{ baneName: "Doubt" }],
    dreamcaller: { id: "fixture-dreamcaller" },
  };

  return {
    content: {
      cards: [...FIXTURE_CARDS],
      dreamcallers: [],
      dreamsigns: [...FIXTURE_DREAMSIGNS],
    },
    contentVersion: "test",
    state: { quest },
  };
}

export const FIXTURE_DRAW_CONTEXT: DrawContext = Object.freeze({
  seed: "fixture-seed",
  contentVersion: "test",
  rootJourneyIndex: 0,
});
