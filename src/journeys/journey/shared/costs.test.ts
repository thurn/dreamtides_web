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

import type { ContentBundle } from "../../content/types";
import type { DrawContext } from "../../util/rng";
import type { JourneyContext, QuestStateProjection } from "../context";

import { COSTS, getCost } from "./costs";

const draw: DrawContext = {
  seed: "costs-test",
  contentVersion: "v1",
  rootJourneyIndex: 0,
};

function emptyContext(overrides: {
  essence?: number;
  maxEssence?: number;
  omens?: number;
  deckEntries?: readonly { cardId: string; copies: number }[];
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
      maxEssence: overrides.maxEssence ?? 0,
      omens: overrides.omens ?? 0,
      dreamscape: 0,
    },
    selectedTides: [],
    deck: {
      entries: deckEntries.map((e) => ({ cardId: e.cardId, copies: e.copies })),
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

// Cost ids that remain viable on the empty fixture. Resource costs (essence/
// omens/max essence) always offer the option and lock when unaffordable; the
// `[LOCKED]` prefix is how the player learns they cannot pay. Battle/shop/
// route modifiers and bane gains do not consume from state, so they never
// vanish. Card-pool gains (e.g. `gain_random_cards_from_pool`) read from the
// content catalog rather than quest state, so the empty quest leaves them
// available. `meta_pay_2_costs` ANDs its sub-cost viability and is exercised
// directly in the compound suite below.
const ALWAYS_VIABLE_ON_EMPTY: ReadonlySet<string> = new Set([
  "pay_essence",
  "pay_omens",
  "pay_max_essence",
  "pay_essence_random_range",
  "pay_percent_essence",
  "pay_all_remaining_essence",
  "lose_max_essence",
  "battle_reward_reduction_flat",
  "battle_reward_reduction_percent",
  "gain_random_banes",
  "gain_named_banes",
  "gain_named_banes_for_X_battles",
  "gain_random_cards_from_pool",
  "gain_additional_starters",
  "remove_shop_sites_from_next_dreamscapes",
  "remove_dreamsign_sites_from_next_dreamscapes",
]);

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
});
