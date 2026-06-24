// Cost template tests.
//
// Three suites pin the cost contract:
//
//   1. A property test asserting every entry in COSTS has a `viable` function
//      and that on an "empty" context (no deck, zero resources, no pool, no
//      banes, no active dreamsigns) it returns false — unless the template is
//      on the always-viable allowlist (pure resource costs that lock instead
//      of vanish, plus battle/shop/route modifiers and bane gains). Bug class
//      this catches: a template that needs deck content but ships
//      `viable: () => true`, which would let assembly surface an option the
//      player can never fulfil.
//
//   2. A locked-propagation test: a template that the player cannot pay (e.g.
//      a 50-essence cost against a 10-essence purse) renders with the
//      `[LOCKED]` prefix AND reports `locked(params, ctx) === true`. Bug
//      class: text prefix and structural flag falling out of sync.
//
//   3. A compound-cost locking test: building a compound cost from one locked
//      and one unlocked sub-cost yields a locked compound with exactly one
//      `[LOCKED]` prefix at the start. Bug class: double-prefixing or missing
//      propagation.

import { describe, expect, it } from "vitest";

import type { CardContent, ContentBundle } from "../../content/types";
import type { DrawContext } from "../../util/rng";
import type { JourneyContext, QuestStateProjection } from "../context";
import { asCardId, asCardName } from "../../../types/card-identity";

import { COSTS, getCost } from "./costs";

function card(
  overrides: Omit<Partial<CardContent>, "id" | "name"> & { id: string; name: string },
): CardContent {
  return {
    rarity: overrides.rarity ?? "common",
    cardType: overrides.cardType ?? "Event",
    energyCost: overrides.energyCost ?? 3,
    spark: overrides.spark ?? "",
    cardNumber: overrides.cardNumber ?? 0,
    raw: overrides.raw ?? {},
    ...overrides,
    id: asCardId(overrides.id),
    name: asCardName(overrides.name),
  };
}

const draw: DrawContext = {
  seed: "costs-test",
  contentVersion: "v1",
  rootJourneyIndex: 0,
};

function emptyContext(overrides: {
  essence?: number;
  maxEssence?: number;
  omens?: number;
  deckEntries?: readonly {
    cardId: string;
    copies: number;
    entryIds?: readonly string[];
    entryTransfigurations?: readonly (string | null)[];
  }[];
  activeDreamsigns?: readonly { dreamsignId: string }[];
  banes?: readonly { baneName: string }[];
  cards?: ContentBundle["cards"];
} = {}): JourneyContext {
  const deckEntries = overrides.deckEntries ?? [];
  const totalCards = deckEntries.reduce((sum, e) => sum + e.copies, 0);
  const quest: QuestStateProjection = {
    seed: "costs-test",
    resources: {
      essence: overrides.essence ?? 0,
      maxEssence: overrides.maxEssence ?? overrides.essence ?? 0,
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
        starterCards: 0,
        uniqueCards: deckEntries.length,
      },
    },
    draftPool: [],
    activeDreamsigns: overrides.activeDreamsigns ?? [],
    dreamsignPoolIds: [],
    banes: overrides.banes ?? [],
    dreamcaller: { id: "" },
  };
  const content: ContentBundle = {
    cards: [...(overrides.cards ?? [])],
    dreamcallers: [],
    dreamsigns: [],
  };
  return { content, contentVersion: "test", state: { quest } };
}

// Cost ids that remain viable on the empty fixture. Zero-cost percentage and
// all-remaining essence costs are payable from an empty purse. Battle/shop/
// route modifiers do not consume from state, so they never vanish. Card-pool
// gains (e.g. `gain_random_cards_from_pool`) read from the content catalog
// rather than quest state, so the empty quest leaves them available.
// `meta_pay_2_costs` ANDs its sub-cost viability and is exercised directly in
// the compound suite below with hand-picked sub-cost ids; the general property
// test below skips it for that reason.
//
// Bane-gain templates (gain_random_banes, gain_named_banes,
// gain_named_banes_for_X_battles) gate on `availableBaneNames(ctx)` so they
// decline when the content bundle has no bane cards. They are tested in
// costs.banes.viability.test.ts with a fixture that loads at least one bane
// card.
const ALWAYS_VIABLE_ON_EMPTY: ReadonlySet<string> = new Set([
  "pay_max_essence",
  "pay_percent_essence",
  "pay_all_remaining_essence",
  "battle_reward_reduction_flat",
  "battle_reward_reduction_percent",
  "gain_random_cards_from_pool",
  "gain_additional_starters",
  "remove_shop_sites_from_next_dreamscapes",
]);

// Sub-cost ids known to decline on an empty context. The compound suite uses
// these directly to assert meta_pay_2_costs declines when both sub-costs
// decline, removing the RNG dependency that previously gated the test.
const NON_VIABLE_ON_EMPTY_SUB_IDS = [
  "purge_named_card",
  "draw_X_purge_chosen",
] as const;

describe("COSTS viability invariant", () => {
  it("every template has a viable function", () => {
    for (const t of COSTS) {
      expect(typeof t.viable, t.id).toBe("function");
    }
  });

  it("every template has a locked function", () => {
    for (const t of COSTS) {
      expect(typeof t.locked, t.id).toBe("function");
    }
  });

  it("every template either declines an empty context or is on the always-viable allowlist", () => {
    const ctx = emptyContext();
    for (const t of COSTS) {
      // meta_pay_2_costs is RNG-dependent on this fixture (its rollParams
      // picks two arbitrary non-meta sub-costs, and viability ANDs them).
      // The compound suite below exercises its empty-decline behaviour
      // directly with hand-picked sub-cost ids.
      if (t.id === "meta_pay_2_costs") continue;
      const params = t.rollParams(ctx, draw);
      const viable = t.viable(params, ctx);
      const allowed = ALWAYS_VIABLE_ON_EMPTY.has(t.id);
      // A template fails the audit when it is viable on an empty context
      // but is NOT on the allowlist — that is the deck-consuming template
      // that ships `viable: () => true`, which the audit is supposed to
      // upgrade. Templates correctly gated on deck/dreamsign/dreamwell
      // content satisfy `viable === false` here; templates correctly
      // categorised as resource/route/bane gain land on the allowlist.
      expect(!viable || allowed, `${t.id}: viable=${viable}, allowed=${allowed}`).toBe(true);
    }
  });

  it("every always-viable template actually reports viable on an empty context", () => {
    const ctx = emptyContext();
    for (const id of ALWAYS_VIABLE_ON_EMPTY) {
      const t = getCost(id);
      const params = t.rollParams(ctx, draw);
      expect(t.viable(params, ctx), id).toBe(true);
    }
  });
});

describe("locked propagation", () => {
  it("pay_essence emits [LOCKED] and reports locked=true when X > essence", () => {
    const t = getCost("pay_essence");
    const ctx = emptyContext({ essence: 10 });
    const params = { x: 50 };
    const rendered = t.render(params, ctx);
    expect(rendered.startsWith("[LOCKED] ")).toBe(true);
    expect(t.locked(params, ctx)).toBe(true);
  });

  it("pay_essence does not emit [LOCKED] and reports locked=false when X <= essence", () => {
    const t = getCost("pay_essence");
    const ctx = emptyContext({ essence: 100 });
    const params = { x: 50 };
    const rendered = t.render(params, ctx);
    expect(rendered.startsWith("[LOCKED]")).toBe(false);
    expect(t.locked(params, ctx)).toBe(false);
  });

  it("pay_omens locks when X > omens", () => {
    const t = getCost("pay_omens");
    const ctx = emptyContext({ omens: 0 });
    const params = { x: 1 };
    expect(t.render(params, ctx).startsWith("[LOCKED] ")).toBe(true);
    expect(t.locked(params, ctx)).toBe(true);
  });

  it("pay_essence_random_range emits [LOCKED] and reports locked=true when min > essence", () => {
    // Regression: the template's `render` previously omitted
    // `withLockedPrefix`, so the text and structural flag fell out of sync
    // when the minimum roll exceeded the purse.
    const t = getCost("pay_essence_random_range");
    const ctx = emptyContext({ essence: 0 });
    const params = { min: 30, max: 60 };
    expect(t.render(params, ctx).startsWith("[LOCKED] ")).toBe(true);
    expect(t.locked(params, ctx)).toBe(true);
  });

  it("pay_essence_random_range does not lock when min <= essence", () => {
    const t = getCost("pay_essence_random_range");
    const ctx = emptyContext({ essence: 100 });
    const params = { min: 30, max: 60 };
    expect(t.render(params, ctx).startsWith("[LOCKED]")).toBe(false);
    expect(t.locked(params, ctx)).toBe(false);
  });

  it("battle reward reductions never lock", () => {
    for (const id of ["battle_reward_reduction_flat", "battle_reward_reduction_percent"]) {
      const t = getCost(id);
      const ctx = emptyContext();
      const params = t.rollParams(ctx, draw);
      expect(t.locked(params, ctx), id).toBe(false);
      expect(t.render(params, ctx).startsWith("[LOCKED]"), id).toBe(false);
    }
  });

  it("lose_max_essence locks when amount >= max essence", () => {
    const t = getCost("lose_max_essence");
    const ctx = emptyContext({ maxEssence: 25 });
    const params = { amount: 25 };
    expect(t.locked(params, ctx)).toBe(true);
    expect(t.render(params, ctx).startsWith("[LOCKED] ")).toBe(true);
  });
});

describe("deck-scope viability audits", () => {
  // Predicate-keyed templates (e.g. purge_random_predicate_card) walk the
  // deck through `deckContainsPredicate`, which pins `source: "deck"`. A
  // regression that reverted the helper to the CLI's leaky
  // `cardMatches(ctx, predicate.cardPredicate)` form would silently resolve
  // over the content catalog, making this paired test essential. The empty-
  // fixture property test cannot distinguish the two forms because both
  // return zero matches on an empty catalog.
  const WARRIOR_CARD = card({
    id: "warrior-1",
    name: "Test Warrior",
    cardType: "Character",
    raw: { subtype: "Warrior" },
  });

  it("purge_random_predicate_card declines when the catalog has a match but the deck does not", () => {
    const t = getCost("purge_random_predicate_card");
    const ctx = emptyContext({ cards: [WARRIOR_CARD], deckEntries: [] });
    expect(t.viable({ predicateId: "warriors" }, ctx)).toBe(false);
  });

  it("purge_random_predicate_card admits when the deck contains a matching card", () => {
    const t = getCost("purge_random_predicate_card");
    const ctx = emptyContext({
      cards: [WARRIOR_CARD],
      deckEntries: [{ cardId: WARRIOR_CARD.id, copies: 1 }],
    });
    expect(t.viable({ predicateId: "warriors" }, ctx)).toBe(true);
  });

  it("purge_all_duplicate_cards declines when the deck has unique cards only", () => {
    const t = getCost("purge_all_duplicate_cards");
    const ctx = emptyContext({
      deckEntries: [
        { cardId: "a", copies: 1 },
        { cardId: "b", copies: 1 },
      ],
    });
    expect(t.viable({}, ctx)).toBe(false);
  });

  it("purge_all_duplicate_cards admits when the deck has a duplicate stack", () => {
    const t = getCost("purge_all_duplicate_cards");
    const ctx = emptyContext({ deckEntries: [{ cardId: "a", copies: 2 }] });
    expect(t.viable({}, ctx)).toBe(true);
  });

  // Named-card templates resolve their params against the deck by name. A
  // regression that reverted these to `deckHasMinSize(ctx, 1)` would surface
  // a no-op option whenever the deck holds different cards.
  it("named-card templates decline when the deck lacks the named card", () => {
    const STEADY_BURN = card({ id: "steady-burn", name: "Steady Burn" });
    const OTHER_CARD = card({ id: "other", name: "Other Card" });
    const ctx = emptyContext({
      cards: [STEADY_BURN, OTHER_CARD],
      deckEntries: [{ cardId: OTHER_CARD.id, copies: 1 }],
    });
    for (const id of [
      "purge_named_card",
      "transform_card_to_random_pool",
      "remove_transfiguration_from_card",
    ]) {
      const t = getCost(id);
      expect(t.viable({ cardId: "steady-burn", cardName: "Steady Burn" }, ctx), id).toBe(false);
    }
  });

  it("named-card templates admit when the deck contains the named card", () => {
    const STEADY_BURN = card({ id: "steady-burn", name: "Steady Burn" });
    const ctx = emptyContext({
      cards: [STEADY_BURN],
      deckEntries: [{ cardId: STEADY_BURN.id, copies: 1 }],
    });
    for (const id of [
      "purge_named_card",
      "transform_card_to_random_pool",
    ]) {
      const t = getCost(id);
      expect(t.viable({ cardId: "steady-burn", cardName: "Steady Burn" }, ctx), id).toBe(true);
    }
  });

  it("remove_transfiguration_from_card requires a transfigured named entry", () => {
    const STEADY_BURN = card({ id: "steady-burn", name: "Steady Burn" });
    const t = getCost("remove_transfiguration_from_card");
    const untransfigured = emptyContext({
      cards: [STEADY_BURN],
      deckEntries: [
        {
          cardId: STEADY_BURN.id,
          copies: 1,
          entryTransfigurations: [null],
        },
      ],
    });
    const partiallyTransfigured = emptyContext({
      cards: [STEADY_BURN],
      deckEntries: [
        {
          cardId: STEADY_BURN.id,
          copies: 2,
          entryTransfigurations: [null, "Empowered"],
        },
      ],
    });
    expect(t.viable({ cardId: "steady-burn", cardName: "Steady Burn" }, untransfigured)).toBe(false);
    expect(t.viable({ cardId: "steady-burn", cardName: "Steady Burn" }, partiallyTransfigured)).toBe(true);
  });

  it("remove_transfiguration_from_card rolls only transfigured named entries", () => {
    const STEADY_BURN = card({ id: "steady-burn", name: "Steady Burn" });
    const RINGWATCHER = card({ id: "ringwatcher", name: "Ringwatcher" });
    const t = getCost("remove_transfiguration_from_card");
    const ctx = emptyContext({
      cards: [STEADY_BURN, RINGWATCHER],
      deckEntries: [
        {
          cardId: STEADY_BURN.id,
          copies: 1,
          entryTransfigurations: ["Empowered"],
        },
        {
          cardId: RINGWATCHER.id,
          copies: 1,
          entryTransfigurations: [null],
        },
      ],
    });

    expect(t.rollParams(ctx, { ...draw, selectionAttempt: 1 })).toEqual({
      cardId: "steady-burn",
      cardName: "Steady Burn",
    });
  });

  it("remove_transfigurations_from_random_predicate requires enough transfigured entries", () => {
    const t = getCost("remove_transfigurations_from_random_predicate");
    const ctx = emptyContext({
      cards: [WARRIOR_CARD],
      deckEntries: [
        {
          cardId: WARRIOR_CARD.id,
          copies: 3,
          entryTransfigurations: ["Amplified", null, "Empowered"],
        },
      ],
    });
    expect(t.viable({ predicateId: "warriors", count: 3 }, ctx)).toBe(false);
    expect(t.viable({ predicateId: "warriors", count: 2 }, ctx)).toBe(true);
  });

  it("remove_transfigurations_from_random_predicate resolves the transfigured predicate from entry state", () => {
    const t = getCost("remove_transfigurations_from_random_predicate");
    const ctx = emptyContext({
      cards: [WARRIOR_CARD],
      deckEntries: [
        {
          cardId: WARRIOR_CARD.id,
          copies: 2,
          entryTransfigurations: ["Amplified", null],
        },
      ],
    });

    expect(t.viable({ predicateId: "transfigured", count: 2 }, ctx)).toBe(false);
    expect(t.viable({ predicateId: "transfigured", count: 1 }, ctx)).toBe(true);
  });

  it("pay_omens requires enough current omens for the rolled cost", () => {
    const t = getCost("pay_omens");

    expect(t.viable({ x: 1 }, emptyContext({ omens: 0 }))).toBe(false);
    expect(t.viable({ x: 1 }, emptyContext({ omens: 1 }))).toBe(true);
  });
});

describe("meta_pay_2_costs (compound) locking", () => {
  it("locks when either sub-cost is locked and renders exactly one [LOCKED] prefix", () => {
    const t = getCost("meta_pay_2_costs");
    // Force one sub-cost to lock (50 essence vs. 10 owned), the other to
    // remain unlockable (battle reward reduction never locks).
    const ctx = emptyContext({ essence: 10 });
    const params = {
      subIds: ["pay_essence", "battle_reward_reduction_flat"] as const,
      subParams: [
        { x: 50 },
        { amount: 10, battles: 1 },
      ] as const,
    };
    const rendered = t.render(params, ctx);
    expect(rendered.startsWith("[LOCKED] ")).toBe(true);
    // Exactly one prefix at the start, none anywhere else in the body.
    expect(rendered.match(/\[LOCKED\]/g)?.length ?? 0).toBe(1);
    expect(t.locked(params, ctx)).toBe(true);
  });

  it("is unlocked when both sub-costs are unlocked", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100 });
    const params = {
      subIds: ["pay_essence", "battle_reward_reduction_flat"] as const,
      subParams: [
        { x: 50 },
        { amount: 10, battles: 1 },
      ] as const,
    };
    const rendered = t.render(params, ctx);
    expect(rendered.startsWith("[LOCKED]")).toBe(false);
    expect(t.locked(params, ctx)).toBe(false);
  });

  it("locks when same-resource essence costs are individually affordable but unaffordable together", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100 });
    const params = {
      subIds: ["pay_essence", "pay_essence"] as const,
      subParams: [
        { x: 60 },
        { x: 50 },
      ] as const,
    };
    const rendered = t.render(params, ctx);
    expect(rendered.match(/\[LOCKED\]/g)?.length ?? 0).toBe(1);
    expect(t.locked(params, ctx)).toBe(true);
  });

  it("locks essence range compounds by guaranteed minimum spend", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100 });
    const params = {
      subIds: ["pay_essence", "pay_essence_random_range"] as const,
      subParams: [
        { x: 80 },
        { min: 30, max: 80 },
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(true);
    expect(t.render(params, ctx).match(/\[LOCKED\]/g)?.length ?? 0).toBe(1);
  });

  it("does not lock essence range compounds when the guaranteed minimum is affordable", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100 });
    const params = {
      subIds: ["pay_essence", "pay_essence_random_range"] as const,
      subParams: [
        { x: 70 },
        { min: 30, max: 80 },
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(false);
    expect(t.render(params, ctx).startsWith("[LOCKED]")).toBe(false);
  });

  it("locks when same-resource omen costs are individually affordable but unaffordable together", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ omens: 1 });
    const params = {
      subIds: ["pay_omens", "pay_omens"] as const,
      subParams: [
        { x: 1 },
        { x: 1 },
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(true);
    expect(t.render(params, ctx).match(/\[LOCKED\]/g)?.length ?? 0).toBe(1);
  });

  it("aggregates percentage and all-remaining essence costs", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100 });
    expect(t.locked({
      subIds: ["pay_percent_essence", "pay_essence"] as const,
      subParams: [
        { percent: 75 },
        { x: 30 },
      ] as const,
    }, ctx)).toBe(true);
    expect(t.locked({
      subIds: ["pay_all_remaining_essence", "pay_essence"] as const,
      subParams: [
        {},
        { x: 1 },
      ] as const,
    }, ctx)).toBe(true);
  });

  it("keeps finite-then-percent essence compounds unlocked when the ordered percent is affordable", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100 });
    const params = {
      subIds: ["pay_essence", "pay_percent_essence"] as const,
      subParams: [
        { x: 60 },
        { percent: 75 },
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(false);
    expect(t.render(params, ctx).startsWith("[LOCKED]")).toBe(false);
  });

  it("keeps all-remaining-then-percent essence compounds unlocked because percent applies to zero", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100 });
    const params = {
      subIds: ["pay_all_remaining_essence", "pay_percent_essence"] as const,
      subParams: [
        {},
        { percent: 75 },
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(false);
    expect(t.render(params, ctx).startsWith("[LOCKED]")).toBe(false);
  });

  it("keeps finite-then-all-remaining essence compounds unlocked when the finite cost is affordable", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100 });
    const params = {
      subIds: ["pay_essence", "pay_all_remaining_essence"] as const,
      subParams: [
        { x: 50 },
        {},
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(false);
    expect(t.render(params, ctx).startsWith("[LOCKED]")).toBe(false);
  });

  it("locks all-remaining-then-finite essence compounds when the finite cost cannot be paid after exhaust", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100 });
    const params = {
      subIds: ["pay_all_remaining_essence", "pay_essence"] as const,
      subParams: [
        {},
        { x: 50 },
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(true);
    expect(t.render(params, ctx).match(/\[LOCKED\]/g)?.length ?? 0).toBe(1);
  });

  it("aggregates max-essence costs using the max-essence lock threshold", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ maxEssence: 100 });
    const params = {
      subIds: ["lose_max_essence", "lose_max_essence"] as const,
      subParams: [
        { amount: 50 },
        { amount: 50 },
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(true);
  });

  it("keeps lose-max-then-pay-max compounds unlocked because pay max exhausts the remainder", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ maxEssence: 100 });
    const params = {
      subIds: ["lose_max_essence", "pay_max_essence"] as const,
      subParams: [
        { amount: 25 },
        {},
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(false);
    expect(t.render(params, ctx).startsWith("[LOCKED]")).toBe(false);
  });

  it("locks pay-max-then-lose-max compounds because pay max exhausts first", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ maxEssence: 100 });
    const params = {
      subIds: ["pay_max_essence", "lose_max_essence"] as const,
      subParams: [
        {},
        { amount: 25 },
      ] as const,
    };
    expect(t.locked(params, ctx)).toBe(true);
    expect(t.render(params, ctx).match(/\[LOCKED\]/g)?.length ?? 0).toBe(1);
  });

  it("locks pay_max_essence compounds with later finite essence cost", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100, maxEssence: 100 });
    const params = {
      subIds: ["pay_max_essence", "pay_essence"] as const,
      subParams: [
        {},
        { x: 50 },
      ] as const,
    };
    expect(getCost("pay_max_essence").locked(params.subParams[0], ctx)).toBe(false);
    expect(getCost("pay_essence").locked(params.subParams[1], ctx)).toBe(false);
    expect(t.locked(params, ctx)).toBe(true);
    expect(t.render(params, ctx).match(/\[LOCKED\]/g)?.length ?? 0).toBe(1);
  });

  it("locks max-essence loss compounds when clamped essence cannot pay a later finite cost", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ essence: 100, maxEssence: 100 });
    const params = {
      subIds: ["lose_max_essence", "pay_essence"] as const,
      subParams: [
        { amount: 25 },
        { x: 80 },
      ] as const,
    };
    expect(getCost("lose_max_essence").locked(params.subParams[0], ctx)).toBe(false);
    expect(getCost("pay_essence").locked(params.subParams[1], ctx)).toBe(false);
    expect(t.locked(params, ctx)).toBe(true);
    expect(t.render(params, ctx).match(/\[LOCKED\]/g)?.length ?? 0).toBe(1);
  });

  it("locks pay_max_essence compounds with additional max-essence loss", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext({ maxEssence: 100 });
    const params = {
      subIds: ["pay_max_essence", "lose_max_essence"] as const,
      subParams: [
        {},
        { amount: 25 },
      ] as const,
    };
    expect(getCost("pay_max_essence").locked(params.subParams[0], ctx)).toBe(false);
    expect(getCost("lose_max_essence").locked(params.subParams[1], ctx)).toBe(false);
    expect(t.locked(params, ctx)).toBe(true);
    expect(t.render(params, ctx).match(/\[LOCKED\]/g)?.length ?? 0).toBe(1);
  });

  it("declines an empty context when both sub-costs decline", () => {
    // Hand-picked sub-cost ids that are guaranteed to decline on an empty
    // fixture (purge_named_card needs a deck; draw_X_purge_chosen needs
    // drawCount cards in the deck). This pins the AND-of-sub-viabilities
    // contract without depending on what rollParams happens to pick.
    const t = getCost("meta_pay_2_costs");
    const ctx = emptyContext();
    const [firstId, secondId] = NON_VIABLE_ON_EMPTY_SUB_IDS;
    const params = {
      subIds: [firstId, secondId] as const,
      subParams: [
        { cardId: "nonexistent-id", cardName: "Whatever" },
        { drawCount: 2 },
      ] as const,
    };
    expect(t.viable(params, ctx)).toBe(false);
  });
});
