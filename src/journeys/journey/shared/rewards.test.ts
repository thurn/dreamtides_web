// Reward template tests.
//
// Four suites pin the reward contract:
//
//   1. A property test asserting every entry in REWARDS has a `viable`
//      function, and that on an "empty" context (no deck, no dreamsign pool,
//      no active dreamsigns, no banes, zero resources) it returns false —
//      unless the template id is on the always-viable allowlist (resource
//      gains, route/shop modifiers, the always-viable `card_cost_reduction`).
//      Bug class this catches: a deck-content reward that ships
//      `viable: () => true` (or a catalog-scope leak) and would surface a
//      no-op option to the player.
//
//   2. A discard-ability paired test: deck-scoped predicate rewards keyed on
//      the `discard_text` predicate decline when the deck holds no card whose
//      rendered text contains "discard" and admit when it does. Bug class:
//      a regression that drops the substring search would let a discard-keyed
//      reward fire against any non-empty deck.
//
//   3. A transfiguration-eligibility tabular test: for each of the eight
//      transfigurations (Empowered, Amplified, Kindled, Inspired, Enduring, Resonant,
//      Attuned, Perfected), `apply_named_transfiguration_to_card_name` declines
//      on a deck whose cards all fail the specific transfiguration's
//      eligibility filter and admits when at least one deck card passes. Bug
//      class: transfiguration rewards offered for unreachable cards.
//
//   4. A paired deck-scope test for `purge_chosen_predicate_cards`: the
//      catalog has a Warrior, the deck does not — viable is false; deck
//      contains a Warrior — viable is true. Pins the deck-source-scope
//      correctness so a regression that reverts the helper to the CLI's
//      catalog-leaking `cardMatches(ctx, predicate.cardPredicate)` form is
//      caught.

import { describe, expect, it } from "vitest";

import type { CardContent, ContentBundle, DreamsignContent } from "../../content/types";
import type { DrawContext } from "../../util/rng";
import type { JourneyContext, QuestStateProjection } from "../context";

import { REWARDS, getReward } from "./rewards";

function card(overrides: Partial<CardContent> & { id: string; name: string }): CardContent {
  return {
    rarity: overrides.rarity ?? "common",
    cardType: overrides.cardType ?? "Event",
    energyCost: overrides.energyCost ?? 3,
    spark: overrides.spark ?? "",
    cardNumber: overrides.cardNumber ?? 0,
    raw: overrides.raw ?? {},
    ...overrides,
  };
}

function dreamsign(overrides: Partial<DreamsignContent> & { id: string; name: string }): DreamsignContent {
  return {
    kind: overrides.kind ?? "neutral",
    renderedText: overrides.renderedText ?? "",
    raw: overrides.raw ?? {},
    ...overrides,
  };
}

const draw: DrawContext = {
  seed: "rewards-test",
  contentVersion: "v1",
  rootJourneyIndex: 0,
};

function buildContext(overrides: {
  essence?: number;
  maxEssence?: number;
  omens?: number;
  deckEntries?: readonly {
    cardId: string;
    copies: number;
    entryIds?: readonly string[];
    entryTransfigurations?: readonly (string | null)[];
  }[];
  starterCards?: number;
  activeDreamsigns?: readonly { dreamsignId: string }[];
  dreamsignPoolIds?: readonly string[];
  banes?: readonly { baneName: string }[];
  cards?: readonly CardContent[];
  dreamsigns?: readonly DreamsignContent[];
} = {}): JourneyContext {
  const deckEntries = overrides.deckEntries ?? [];
  const totalCards = deckEntries.reduce((sum, e) => sum + e.copies, 0);
  const quest: QuestStateProjection = {
    seed: "rewards-test",
    resources: {
      essence: overrides.essence ?? 0,
      maxEssence: overrides.maxEssence ?? 0,
      omens: overrides.omens ?? 0,
      dreamscape: 0,
    },
    deck: {
      entries: deckEntries.map((e) => ({
        cardId: e.cardId,
        copies: e.copies,
        entryIds: e.entryIds
          ?? Array.from({ length: e.copies }, (_, index) => `${e.cardId}-${index + 1}`),
        entryTransfigurations: e.entryTransfigurations,
      })),
      summary: {
        totalCards,
        starterCards: overrides.starterCards ?? 0,
        uniqueCards: deckEntries.length,
      },
    },
    draftPool: [],
    activeDreamsigns: overrides.activeDreamsigns ?? [],
    dreamsignPoolIds: [...(overrides.dreamsignPoolIds ?? [])],
    banes: overrides.banes ?? [],
    dreamcaller: { id: "" },
  };
  const content: ContentBundle = {
    cards: [...(overrides.cards ?? [])],
    dreamcallers: [],
    dreamsigns: [...(overrides.dreamsigns ?? [])],
  };
  return { content, contentVersion: "test", state: { quest } };
}

// Reward ids that remain viable on the empty fixture. Resource gains never
// consult deck/pool state; route/shop modifiers (add_site_*, replace_site_type,
// shop_essence_discount, shop_omen_discount, next_X_shop_rerolls_free,
// boost_site_appearance_chance, increase_max_essence) likewise read only the
// quest scaffolding. `card_cost_reduction_for_X_battles` is "always viable in
// kind" — the player accepts a temporary discount even with an empty deck.
// `meta_gain_2_rewards` ANDs its sub-template viabilities and is exercised
// directly in the compound suite below with hand-picked sub-template ids; the
// property test skips it for that reason.
const ALWAYS_VIABLE_ON_EMPTY: ReadonlySet<string> = new Set([
  "gain_essence",
  "gain_omens",
  "set_essence_to_percent_of_max",
  "gain_essence_random_range",
  "gain_essence_to_max",
  "increase_max_essence",
  "add_site_to_dreamscape",
  "add_site_to_next_dreamscape",
  "next_X_shop_rerolls_free",
  "boost_site_appearance_chance",
  "replace_site_type",
  "shop_essence_discount",
  "shop_omen_discount",
  "card_cost_reduction_for_X_battles",
]);

describe("REWARDS viability invariant", () => {
  it("every template has a viable function", () => {
    for (const t of REWARDS) {
      expect(typeof t.viable, t.id).toBe("function");
    }
  });

  it("every template either declines an empty context or is on the always-viable allowlist", () => {
    const ctx = buildContext();
    for (const t of REWARDS) {
      // meta_gain_2_rewards is RNG-dependent (its rollParams picks two
      // arbitrary non-meta sub-rewards and ANDs their viabilities). The
      // compound suite below pins its empty-decline behaviour with hand-
      // picked sub-reward ids.
      if (t.id === "meta_gain_2_rewards") continue;
      const params = t.rollParams(ctx, draw);
      const viable = t.viable(params, ctx);
      const allowed = ALWAYS_VIABLE_ON_EMPTY.has(t.id);
      expect(!viable || allowed, `${t.id}: viable=${viable}, allowed=${allowed}`).toBe(true);
    }
  });

  it("every always-viable template actually reports viable on an empty context", () => {
    const ctx = buildContext();
    for (const id of ALWAYS_VIABLE_ON_EMPTY) {
      const t = getReward(id);
      const params = t.rollParams(ctx, draw);
      expect(t.viable(params, ctx), id).toBe(true);
    }
  });
});

describe("discard-ability deck-scope audit", () => {
  // Paired fixture: catalog has the same shape in both, but only one deck
  // actually contains a card whose rendered text mentions "discard". The
  // deck-scoped predicate-keyed rewards must consult the deck (via
  // `deckContainsPredicate`'s `source: "deck"` pin), not the catalog.
  const DISCARD_CARD = card({
    id: "discard-1",
    name: "Discard Event",
    cardType: "Event",
    raw: { "rendered-text": "Discard a card from your hand." },
  });
  const PLAIN_CARD = card({
    id: "plain-1",
    name: "Plain Event",
    cardType: "Event",
    raw: { "rendered-text": "Draw a card." },
  });

  it("purge_chosen_predicate_cards keyed on discard_text declines when the deck has no discard card", () => {
    const t = getReward("purge_chosen_predicate_cards");
    const ctx = buildContext({
      cards: [DISCARD_CARD, PLAIN_CARD],
      deckEntries: [{ cardId: PLAIN_CARD.id, copies: 1 }],
    });
    expect(t.viable({ predicateId: "discard_text", count: 1 }, ctx)).toBe(false);
  });

  it("purge_chosen_predicate_cards keyed on discard_text admits when the deck has a discard card", () => {
    const t = getReward("purge_chosen_predicate_cards");
    const ctx = buildContext({
      cards: [DISCARD_CARD, PLAIN_CARD],
      deckEntries: [{ cardId: DISCARD_CARD.id, copies: 1 }],
    });
    expect(t.viable({ predicateId: "discard_text", count: 1 }, ctx)).toBe(true);
  });
});

describe("transfiguration eligibility audit", () => {
  // For each transfiguration, build one card that satisfies the eligibility
  // filter and one that does not. `apply_named_transfiguration_to_card_name`
  // routes through `transfigurationHasEligibleTarget`, which walks the deck
  // and asks the eligibility filter per entry. The negative case asserts a
  // deck of only ineligible cards declines; the positive case asserts a
  // single eligible card admits the option.
  //
  // The filters (per `isCardEligibleForTransfiguration` in `effects.ts`):
  // - Empowered: energyCost > 0
  // - Amplified: unrestricted at generation time
  // - Kindled: cardType === "Character"
  // - Inspired: cardType === "Event"
  // - Enduring: cardType === "Event"
  // - Resonant: rendered text matches /materialized|challenge|once per turn/i
  // - Attuned: rendered text matches /\d●[^:\n]*:/ (energy-cost activated)
  // - Perfected: unrestricted at generation time
  const COST_ZERO_EVENT = card({
    id: "cost0-event",
    name: "Cost Zero Event",
    cardType: "Event",
    energyCost: 0,
    raw: { "rendered-text": "Draw a card." },
  });
  const COST_TWO_EVENT = card({
    id: "cost2-event",
    name: "Cost Two Event",
    cardType: "Event",
    energyCost: 2,
    raw: { "rendered-text": "Draw a card." },
  });
  const COST_TWO_CHARACTER = card({
    id: "cost2-char",
    name: "Cost Two Character",
    cardType: "Character",
    energyCost: 2,
    raw: { "rendered-text": "Block." },
  });
  const MAGENTA_TRIGGER_CHARACTER = card({
    id: "mag-char",
    name: "Resonant Trigger Character",
    cardType: "Character",
    energyCost: 2,
    raw: { "rendered-text": "Materialized: Draw a card." },
  });
  const ROSE_ACTIVATED_CHARACTER = card({
    id: "rose-char",
    name: "Attuned Activated Character",
    cardType: "Character",
    energyCost: 2,
    raw: { "rendered-text": "2●: Draw a card." },
  });

  const cases: ReadonlyArray<{
    transfiguration: string;
    eligible: CardContent;
    ineligible: CardContent;
  }> = [
    // Empowered needs cost > 0. Cost-0 event fails; cost-2 event passes.
    { transfiguration: "Empowered", eligible: COST_TWO_EVENT, ineligible: COST_ZERO_EVENT },
    // Kindled needs Character. Event fails; character passes.
    { transfiguration: "Kindled", eligible: COST_TWO_CHARACTER, ineligible: COST_TWO_EVENT },
    // Inspired needs Event. Character fails; event passes.
    { transfiguration: "Inspired", eligible: COST_TWO_EVENT, ineligible: COST_TWO_CHARACTER },
    // Enduring needs Event. Same as Inspired.
    { transfiguration: "Enduring", eligible: COST_TWO_EVENT, ineligible: COST_TWO_CHARACTER },
    // Resonant needs a materialized/challenge/once-per-turn trigger.
    { transfiguration: "Resonant", eligible: MAGENTA_TRIGGER_CHARACTER, ineligible: COST_TWO_CHARACTER },
    // Attuned needs an N●...: activated ability.
    { transfiguration: "Attuned", eligible: ROSE_ACTIVATED_CHARACTER, ineligible: COST_TWO_CHARACTER },
  ];

  it.each(cases)(
    "apply_named_transfiguration_to_card_name correctly gates on $transfiguration eligibility",
    ({ transfiguration, eligible, ineligible }) => {
      const t = getReward("apply_named_transfiguration_to_card_name");
      const noMatch = buildContext({
        cards: [eligible, ineligible],
        deckEntries: [{ cardId: ineligible.id, copies: 1 }],
      });
      const hasMatch = buildContext({
        cards: [eligible, ineligible],
        deckEntries: [{ cardId: eligible.id, copies: 1 }],
      });
      expect(
        t.viable({ transfiguration, cardName: eligible.name }, noMatch),
        `${transfiguration} should decline when no deck card is eligible`,
      ).toBe(false);
      expect(
        t.viable({ transfiguration, cardName: eligible.name }, hasMatch),
        `${transfiguration} should admit when at least one deck card is eligible`,
      ).toBe(true);
    },
  );

  // Amplified and Perfected are unrestricted at generation time, so they admit
  // any non-empty deck and decline only when the deck is empty.
  it("Amplified and Perfected admit any non-empty deck and decline an empty deck", () => {
    const t = getReward("apply_named_transfiguration_to_card_name");
    const empty = buildContext({ cards: [COST_TWO_EVENT], deckEntries: [] });
    const nonEmpty = buildContext({
      cards: [COST_TWO_EVENT],
      deckEntries: [{ cardId: COST_TWO_EVENT.id, copies: 1 }],
    });
    for (const transfiguration of ["Amplified", "Perfected"]) {
      expect(
        t.viable({ transfiguration, cardName: COST_TWO_EVENT.name }, empty),
        transfiguration,
      ).toBe(false);
      expect(
        t.viable({ transfiguration, cardName: COST_TWO_EVENT.name }, nonEmpty),
        transfiguration,
      ).toBe(true);
    }
  });
});

describe("deck-scope predicate audit", () => {
  // Predicate-keyed deck-mutation rewards must consult the deck, not the
  // catalog. A regression that reverted the helper to the CLI's leaky
  // `cardMatches(ctx, predicate.cardPredicate)` would silently resolve over
  // the content catalog, making this paired test essential: both fixtures
  // share the same catalog, but only the second deck contains the matching
  // card.
  const WARRIOR_CARD = card({
    id: "warrior-1",
    name: "Test Warrior",
    cardType: "Character",
    raw: { subtype: "Warrior" },
  });

  it("purge_chosen_predicate_cards declines when the catalog has a match but the deck does not", () => {
    const t = getReward("purge_chosen_predicate_cards");
    const ctx = buildContext({ cards: [WARRIOR_CARD], deckEntries: [] });
    expect(t.viable({ predicateId: "warriors", count: 1 }, ctx)).toBe(false);
  });

  it("purge_chosen_predicate_cards admits when the deck contains a matching card", () => {
    const t = getReward("purge_chosen_predicate_cards");
    const ctx = buildContext({
      cards: [WARRIOR_CARD],
      deckEntries: [{ cardId: WARRIOR_CARD.id, copies: 1 }],
    });
    expect(t.viable({ predicateId: "warriors", count: 1 }, ctx)).toBe(true);
  });

  it("duplicate_random_predicate declines when the deck does not contain matches", () => {
    const t = getReward("duplicate_random_predicate");
    const ctx = buildContext({ cards: [WARRIOR_CARD], deckEntries: [] });
    expect(t.viable({ predicateId: "warriors", count: 1 }, ctx)).toBe(false);
  });

  it("duplicate_random_predicate admits when the deck contains enough matches", () => {
    const t = getReward("duplicate_random_predicate");
    const ctx = buildContext({
      cards: [WARRIOR_CARD],
      deckEntries: [{ cardId: WARRIOR_CARD.id, copies: 2 }],
    });
    expect(t.viable({ predicateId: "warriors", count: 1 }, ctx)).toBe(true);
  });

  // The three transfiguration-applying predicate variants share the same
  // deck-scope leak fix as `purge_chosen_predicate_cards` /
  // `duplicate_random_predicate`. `Amplified` is unrestricted at generation time,
  // so the per-transfiguration eligibility check passes for any deck card and
  // does not interfere with the deck-scope assertion.
  const TRANSFIG_PREDICATE_VARIANTS = [
    "apply_named_transfiguration_to_chosen_predicate_cards",
    "apply_named_transfiguration_to_random_predicate_cards",
    "apply_named_transfiguration_to_all_predicate_cards",
  ] as const;

  it.each(TRANSFIG_PREDICATE_VARIANTS)(
    "%s declines when the catalog has a Warrior but the deck does not",
    (id) => {
      const t = getReward(id);
      const ctx = buildContext({ cards: [WARRIOR_CARD], deckEntries: [] });
      expect(
        t.viable({ predicateId: "warriors", transfiguration: "Amplified", count: 1 }, ctx),
      ).toBe(false);
    },
  );

  it.each(TRANSFIG_PREDICATE_VARIANTS)(
    "%s admits when the deck contains a matching Warrior",
    (id) => {
      const t = getReward(id);
      const ctx = buildContext({
        cards: [WARRIOR_CARD],
        deckEntries: [{ cardId: WARRIOR_CARD.id, copies: 1 }],
      });
      expect(
        t.viable({ predicateId: "warriors", transfiguration: "Amplified", count: 1 }, ctx),
      ).toBe(true);
    },
  );
});

describe("transfiguration-state viability", () => {
  const EVENT_CARD = card({
    id: "event-card",
    name: "Steady Burn",
    cardType: "Event",
    energyCost: 2,
  });
  const COST_ZERO_EVENT = card({
    id: "cost-zero-event",
    name: "Still Spark",
    cardType: "Event",
    energyCost: 0,
  });
  const WARRIOR_CARD = card({
    id: "warrior-1",
    name: "Test Warrior",
    cardType: "Character",
    raw: { subtype: "Warrior" },
  });
  const STARTER_CARD = card({
    id: "starter-1",
    name: "Starter One",
    cardType: "Event",
    rarity: "Starter",
    energyCost: 1,
  });

  it("apply_named_transfiguration_to_card_name requires an untransfigured named eligible entry", () => {
    const t = getReward("apply_named_transfiguration_to_card_name");
    const fullyTransfigured = buildContext({
      cards: [EVENT_CARD],
      deckEntries: [
        {
          cardId: EVENT_CARD.id,
          copies: 1,
          entryTransfigurations: ["Empowered"],
        },
      ],
    });
    const partiallyTransfigured = buildContext({
      cards: [EVENT_CARD],
      deckEntries: [
        {
          cardId: EVENT_CARD.id,
          copies: 2,
          entryTransfigurations: ["Empowered", null],
        },
      ],
    });
    expect(
      t.viable({ transfiguration: "Empowered", cardName: EVENT_CARD.name }, fullyTransfigured),
    ).toBe(false);
    expect(
      t.viable({ transfiguration: "Empowered", cardName: EVENT_CARD.name }, partiallyTransfigured),
    ).toBe(true);
  });

  it("predicate transfiguration rewards count untransfigured matching entries", () => {
    const random = getReward("apply_named_transfiguration_to_random_predicate_cards");
    const all = getReward("apply_named_transfiguration_to_all_predicate_cards");
    const partial = buildContext({
      cards: [WARRIOR_CARD],
      deckEntries: [
        {
          cardId: WARRIOR_CARD.id,
          copies: 2,
          entryTransfigurations: ["Amplified", null],
        },
      ],
    });
    const fullyTransfigured = buildContext({
      cards: [WARRIOR_CARD],
      deckEntries: [
        {
          cardId: WARRIOR_CARD.id,
          copies: 1,
          entryTransfigurations: ["Amplified"],
        },
      ],
    });
    expect(
      random.viable({ predicateId: "warriors", transfiguration: "Amplified", count: 2 }, partial),
    ).toBe(false);
    expect(
      random.viable({ predicateId: "warriors", transfiguration: "Amplified", count: 1 }, partial),
    ).toBe(true);
    expect(
      all.viable({ predicateId: "warriors", transfiguration: "Amplified" }, fullyTransfigured),
    ).toBe(false);
    expect(
      all.viable({ predicateId: "warriors", transfiguration: "Amplified" }, partial),
    ).toBe(true);
  });

  it("predicate transfiguration rewards require eligible untransfigured entries", () => {
    const random = getReward("apply_named_transfiguration_to_random_predicate_cards");
    const all = getReward("apply_named_transfiguration_to_all_predicate_cards");
    const zeroCostEvent = card({
      id: "zero-cost-event",
      name: "Zero Cost Event",
      cardType: "Event",
      energyCost: 0,
    });
    const ctx = buildContext({
      cards: [zeroCostEvent],
      deckEntries: [{ cardId: zeroCostEvent.id, copies: 1 }],
    });

    expect(
      random.viable({ predicateId: "events", transfiguration: "Empowered", count: 1 }, ctx),
    ).toBe(false);
    expect(
      all.viable({ predicateId: "events", transfiguration: "Empowered" }, ctx),
    ).toBe(false);
  });

  it("predicate transfiguration apply rewards admit eligible concrete deck entries when the catalog has ineligible matches", () => {
    const random = getReward("apply_named_transfiguration_to_random_predicate_cards");
    const all = getReward("apply_named_transfiguration_to_all_predicate_cards");
    const ctx = buildContext({
      cards: [EVENT_CARD, COST_ZERO_EVENT],
      deckEntries: [{ cardId: EVENT_CARD.id, copies: 2 }],
    });

    expect(
      random.viable({ predicateId: "events", transfiguration: "Empowered", count: 2 }, ctx),
    ).toBe(true);
    expect(
      all.viable({ predicateId: "events", transfiguration: "Empowered" }, ctx),
    ).toBe(true);
  });

  it("starter transfiguration rewards count untransfigured starter entries", () => {
    const random = getReward("transfigure_random_starters");
    const all = getReward("transfigure_all_starters");
    const partial = buildContext({
      cards: [STARTER_CARD],
      starterCards: 2,
      deckEntries: [
        {
          cardId: STARTER_CARD.id,
          copies: 2,
          entryTransfigurations: ["Amplified", null],
        },
      ],
    });
    const fullyTransfigured = buildContext({
      cards: [STARTER_CARD],
      starterCards: 1,
      deckEntries: [
        {
          cardId: STARTER_CARD.id,
          copies: 1,
          entryTransfigurations: ["Amplified"],
        },
      ],
    });
    expect(random.viable({ count: 2 }, partial)).toBe(false);
    expect(random.viable({ count: 1 }, partial)).toBe(true);
    expect(all.viable({}, fullyTransfigured)).toBe(false);
    expect(all.viable({}, partial)).toBe(true);
  });

  it("apply_random_transfigurations_to_random_cards counts untransfigured deck entries", () => {
    const t = getReward("apply_random_transfigurations_to_random_cards");
    const ctx = buildContext({
      cards: [EVENT_CARD, STARTER_CARD],
      deckEntries: [
        {
          cardId: EVENT_CARD.id,
          copies: 1,
          entryTransfigurations: ["Empowered"],
        },
        {
          cardId: STARTER_CARD.id,
          copies: 1,
          entryTransfigurations: [null],
        },
      ],
    });
    expect(t.viable({ count: 2 }, ctx)).toBe(false);
    expect(t.viable({ count: 1 }, ctx)).toBe(true);
  });
});

describe("named-card deck-scope audit", () => {
  // Templates whose params name a specific card route through
  // `deckContainsCardByName`. A regression that reverts to a deck-non-empty
  // check would surface a no-op option whenever the deck holds different
  // cards.
  const STEADY_BURN = card({ id: "steady-burn", name: "Steady Burn" });
  const OTHER_CARD = card({ id: "other", name: "Other Card" });

  // Each entry pairs a template id with its params shape (referencing
  // "Steady Burn" as the named card). `apply_named_transfiguration_to_
  // card_name` is covered in the transfiguration-state suite because it also
  // depends on per-entry transfiguration state and per-card eligibility.
  const NAMED_CARD_CASES = [
    { id: "duplicate_named_card_X", params: { cardName: "Steady Burn", count: 1 } },
    {
      id: "transform_card_in_deck_into_named",
      params: { oldCardName: "Steady Burn", newCardName: "Steady Burn" },
    },
    { id: "make_card_reclaim", params: { cardName: "Steady Burn", count: 1 } },
    {
      id: "opening_hand_grant_for_X_battles",
      params: { cardName: "Steady Burn", battles: 3 },
    },
    {
      id: "temporary_card_copy_for_X_battles",
      params: { cardName: "Steady Burn", battles: 3 },
    },
    {
      id: "change_card_to_become_type",
      params: { cardName: "Steady Burn", cardTypePredicateId: "warriors" },
    },
  ] as const;

  it("named-card templates decline when the deck lacks the named card", () => {
    const ctx = buildContext({
      cards: [STEADY_BURN, OTHER_CARD],
      deckEntries: [{ cardId: OTHER_CARD.id, copies: 1 }],
    });
    for (const { id, params } of NAMED_CARD_CASES) {
      const t = getReward(id);
      expect(t.viable(params, ctx), id).toBe(false);
    }
  });

  it("named-card templates admit when the deck contains the named card", () => {
    const ctx = buildContext({
      cards: [STEADY_BURN],
      deckEntries: [{ cardId: STEADY_BURN.id, copies: 1 }],
    });
    for (const { id, params } of NAMED_CARD_CASES) {
      const t = getReward(id);
      expect(t.viable(params, ctx), id).toBe(true);
    }
  });

  it("purge_named_starter declines when the deck lacks the named starter", () => {
    const STARTER_A = card({
      id: "starter-a",
      name: "Starter A",
      rarity: "Starter",
    });
    const ctx = buildContext({
      cards: [STARTER_A],
      deckEntries: [],
      starterCards: 0,
    });
    expect(
      getReward("purge_named_starter").viable({ cardName: "Starter A" }, ctx),
    ).toBe(false);
  });

  it("purge_named_starter admits when the deck contains the named starter", () => {
    const STARTER_A = card({
      id: "starter-a",
      name: "Starter A",
      rarity: "Starter",
    });
    const ctx = buildContext({
      cards: [STARTER_A],
      deckEntries: [{ cardId: STARTER_A.id, copies: 1 }],
      starterCards: 1,
    });
    expect(
      getReward("purge_named_starter").viable({ cardName: "Starter A" }, ctx),
    ).toBe(true);
  });
});

describe("purge_random_starter_with_predicate_replacement viability", () => {
  // The replacement card is rolled from the catalog via the chosen predicate.
  // Both a starter to consume AND a catalog match for the predicate are
  // required, otherwise the reward is non-fulfillable. A deck with a starter
  // but no catalog Warrior must decline; a deck with both must admit.
  const STARTER_A = card({
    id: "starter-a",
    name: "Starter A",
    rarity: "Starter",
  });
  const WARRIOR_CARD = card({
    id: "warrior-1",
    name: "Catalog Warrior",
    cardType: "Character",
    raw: { subtype: "Warrior" },
  });

  it("declines when the deck has a starter but the catalog has no replacement match", () => {
    const t = getReward("purge_random_starter_with_predicate_replacement");
    const ctx = buildContext({
      cards: [STARTER_A],
      deckEntries: [{ cardId: STARTER_A.id, copies: 1 }],
      starterCards: 1,
    });
    expect(t.viable({ predicateId: "warriors" }, ctx)).toBe(false);
  });

  it("admits when the deck has a starter and the catalog has a replacement match", () => {
    const t = getReward("purge_random_starter_with_predicate_replacement");
    const ctx = buildContext({
      cards: [STARTER_A, WARRIOR_CARD],
      deckEntries: [{ cardId: STARTER_A.id, copies: 1 }],
      starterCards: 1,
    });
    expect(t.viable({ predicateId: "warriors" }, ctx)).toBe(true);
  });
});

describe("dreamsign pool audit", () => {
  // Dreamsign-gain rewards (gain_random_dreamsign etc.) must check the
  // dreamsign POOL, not the content catalog. CLI's
  // `dreamsignMatches(ctx).length >= N` returns the full catalog when no
  // predicate is supplied; a deck-fresh quest with an empty pool would
  // therefore surface a "Gain a random Dreamsign" option that cannot pick a
  // dreamsign.
  const DREAMSIGN_DAWN = dreamsign({ id: "dawn", name: "Dawn" });

  it("gain_random_dreamsign declines when the dreamsign pool is empty", () => {
    const t = getReward("gain_random_dreamsign");
    const ctx = buildContext({ dreamsigns: [DREAMSIGN_DAWN], dreamsignPoolIds: [] });
    expect(t.viable({}, ctx)).toBe(false);
  });

  it("gain_random_dreamsign admits when the dreamsign pool has any entry", () => {
    const t = getReward("gain_random_dreamsign");
    const ctx = buildContext({
      dreamsigns: [DREAMSIGN_DAWN],
      dreamsignPoolIds: [DREAMSIGN_DAWN.id],
    });
    expect(t.viable({}, ctx)).toBe(true);
  });

  it("temporary_dreamsign_for_X_battles declines when the pool is empty", () => {
    const t = getReward("temporary_dreamsign_for_X_battles");
    const ctx = buildContext({ dreamsigns: [DREAMSIGN_DAWN], dreamsignPoolIds: [] });
    expect(t.viable({ battles: 3 }, ctx)).toBe(false);
  });

  it("choose_1_of_X_dreamsigns declines when the pool has fewer than choices", () => {
    const t = getReward("choose_1_of_X_dreamsigns");
    const ctx = buildContext({
      dreamsigns: [DREAMSIGN_DAWN],
      dreamsignPoolIds: [DREAMSIGN_DAWN.id],
    });
    expect(t.viable({ choices: 3 }, ctx)).toBe(false);
  });
});

describe("dreamwell-keyed rewards self-hide until content lands", () => {
  // Mirrors the Task 8 pattern for `set_starting_dreamwell_negative` and
  // `shuffle_negative_dreamwell_cards`. With the positive list still empty
  // (Task 17 lands content), these templates must decline so they do not
  // surface a "Placeholder Dreamwell Card" option.
  it("set_starting_dreamwell_positive declines on the empty fixture", () => {
    const t = getReward("set_starting_dreamwell_positive");
    const ctx = buildContext();
    const params = t.rollParams(ctx, draw);
    expect(t.viable(params, ctx)).toBe(false);
  });

  it("shuffle_positive_dreamwell_cards declines on the empty fixture", () => {
    const t = getReward("shuffle_positive_dreamwell_cards");
    const ctx = buildContext();
    const params = t.rollParams(ctx, draw);
    expect(t.viable(params, ctx)).toBe(false);
  });
});

describe("meta_gain_2_rewards (compound) viability", () => {
  const STARTER_CARD = card({
    id: "starter-meta",
    name: "Starter Meta",
    rarity: "Starter",
    energyCost: 1,
  });

  it("declines an empty context when both sub-rewards decline", () => {
    // Hand-pick two sub-rewards that are guaranteed to decline on an empty
    // fixture. `purge_X_banes` needs banes; `purge_all_banes` likewise. This
    // pins the AND-of-sub-viabilities contract without depending on what
    // rollParams happens to pick.
    const t = getReward("meta_gain_2_rewards");
    const ctx = buildContext();
    const params = {
      subIds: ["purge_X_banes", "purge_all_banes"] as readonly [string, string],
      subParams: [
        { count: 1 },
        {},
      ] as readonly [Record<string, unknown>, Record<string, unknown>],
    };
    expect(t.viable(params, ctx)).toBe(false);
  });

  it("admits when both sub-rewards admit", () => {
    // Two always-viable resource-gain rewards.
    const t = getReward("meta_gain_2_rewards");
    const ctx = buildContext();
    const params = {
      subIds: ["gain_essence", "gain_omens"] as readonly [string, string],
      subParams: [
        { x: 100 },
        { x: 2 },
      ] as readonly [Record<string, unknown>, Record<string, unknown>],
    };
    expect(t.viable(params, ctx)).toBe(true);
  });

  it("declines mutually invalidating starter rewards in either order", () => {
    const t = getReward("meta_gain_2_rewards");
    const ctx = buildContext({
      cards: [STARTER_CARD],
      deckEntries: [{ cardId: STARTER_CARD.id, copies: 1 }],
      starterCards: 1,
    });
    expect(getReward("purge_all_starters").viable({}, ctx)).toBe(true);
    expect(getReward("transfigure_all_starters").viable({}, ctx)).toBe(true);
    for (const subIds of [
      ["purge_all_starters", "transfigure_all_starters"],
      ["transfigure_all_starters", "purge_all_starters"],
    ] as const) {
      expect(t.viable({
        subIds,
        subParams: [{}, {}] as const,
      }, ctx), subIds.join(" + ")).toBe(false);
    }
  });

  it("declines mutually invalidating bane purge rewards in either order", () => {
    const t = getReward("meta_gain_2_rewards");
    const ctx = buildContext({ banes: [{ baneName: "Doubt" }, { baneName: "Dread" }] });
    expect(getReward("purge_X_banes").viable({ count: 1 }, ctx)).toBe(true);
    expect(getReward("purge_all_banes").viable({}, ctx)).toBe(true);
    for (const { subIds, subParams } of [
      {
        subIds: ["purge_all_banes", "purge_X_banes"] as const,
        subParams: [{}, { count: 1 }] as const,
      },
      {
        subIds: ["purge_X_banes", "purge_all_banes"] as const,
        subParams: [{ count: 1 }, {}] as const,
      },
    ] as const) {
      expect(t.viable({
        subIds,
        subParams,
      }, ctx), subIds.join(" + ")).toBe(false);
    }
  });

  it("declines random starter purge paired with named Reclaim on a starter", () => {
    const t = getReward("meta_gain_2_rewards");
    const ctx = buildContext({
      cards: [STARTER_CARD],
      deckEntries: [{ cardId: STARTER_CARD.id, copies: 1 }],
      starterCards: 1,
    });
    expect(getReward("purge_random_starter").viable({}, ctx)).toBe(true);
    expect(getReward("make_card_reclaim").viable({
      cardName: STARTER_CARD.name,
      count: 2,
    }, ctx)).toBe(true);

    for (const subIds of [
      ["purge_random_starter", "make_card_reclaim"],
      ["make_card_reclaim", "purge_random_starter"],
    ] as const) {
      expect(t.viable({
        subIds,
        subParams: [
          subIds[0] === "make_card_reclaim"
            ? { cardName: STARTER_CARD.name, count: 2 }
            : {},
          subIds[1] === "make_card_reclaim"
            ? { cardName: STARTER_CARD.name, count: 2 }
            : {},
        ] as const,
      }, ctx), subIds.join(" + ")).toBe(false);
    }
  });

  it("declines random starter purge paired with named deck transform targeting a starter", () => {
    const t = getReward("meta_gain_2_rewards");
    const ctx = buildContext({
      cards: [STARTER_CARD],
      deckEntries: [{ cardId: STARTER_CARD.id, copies: 1 }],
      starterCards: 1,
    });
    const transformParams = {
      oldCardName: STARTER_CARD.name,
      newCardName: STARTER_CARD.name,
    };
    expect(getReward("purge_random_starter").viable({}, ctx)).toBe(true);
    expect(getReward("transform_card_in_deck_into_named").viable(transformParams, ctx)).toBe(true);

    for (const subIds of [
      ["purge_random_starter", "transform_card_in_deck_into_named"],
      ["transform_card_in_deck_into_named", "purge_random_starter"],
    ] as const) {
      expect(t.viable({
        subIds,
        subParams: [
          subIds[0] === "transform_card_in_deck_into_named" ? transformParams : {},
          subIds[1] === "transform_card_in_deck_into_named" ? transformParams : {},
        ] as const,
      }, ctx), subIds.join(" + ")).toBe(false);
    }
  });

  it("rollParams filters explicitly incompatible reward pairs", () => {
    const t = getReward("meta_gain_2_rewards");
    const ctx = buildContext({
      cards: [STARTER_CARD],
      deckEntries: [{ cardId: STARTER_CARD.id, copies: 1 }],
      starterCards: 1,
      banes: [{ baneName: "Doubt" }, { baneName: "Dread" }],
    });
    const incompatiblePairs = new Set([
      "purge_all_starters+transfigure_all_starters",
      "transfigure_all_starters+purge_all_starters",
      "purge_all_banes+purge_X_banes",
      "purge_X_banes+purge_all_banes",
      "purge_random_starter+make_card_reclaim",
      "make_card_reclaim+purge_random_starter",
    ]);

    for (let selectionAttempt = 0; selectionAttempt < 500; selectionAttempt += 1) {
      const params = t.rollParams(ctx, { ...draw, selectionAttempt });
      const subIds = (params as { subIds: readonly string[] }).subIds;
      expect(incompatiblePairs.has(subIds.join("+"))).toBe(false);
    }
  });
});
