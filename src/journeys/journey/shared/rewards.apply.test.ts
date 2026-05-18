// Per-template `apply` tests for Resource rewards (Task 9).
//
// Mirrors `costs.apply.test.ts` for the Reward side of the catalog. Each test
// exercises one Resource reward template against the recording
// `JourneyMutations` double from `src/journeys/apply/testing/` and asserts the
// exact sequence of recorded mutation calls. Random-range rewards roll within
// the rolled bounds at apply time via `Math.random`, so the only correctness
// signal for that template is "the recorded arg lies inside [min,max]".
//
// Per-template apply behaviour for the other reward families (cards, dreamsigns,
// transfigurations, atlas/route, battle/shop, draft, meta-compound, visual)
// lives in later per-task suites alongside Tasks 10-18.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CardContent, ContentBundle, DreamsignContent } from "../../content/types";
import { createRecordingMutations } from "../../apply/testing/recordingMutations";
import type { ChooserPlanningContext, ChooserResolution } from "../../apply/chooserPlan";
import { getLogEntries, resetLog } from "../../../logging";
import type { JourneyContext, QuestStateProjection } from "../context";
import type { Dreamsign } from "../../../types/quest";

import { getReward } from "./rewards";
import { isCardEligibleForTransfiguration } from "./content";

beforeEach(() => {
  resetLog();
});

function buildContext(overrides: {
  essence?: number;
  maxEssence?: number;
  omens?: number;
  cards?: readonly CardContent[];
  deckEntries?: readonly {
    readonly cardId: string;
    readonly copies: number;
    readonly entryIds?: readonly string[];
    readonly entryTransfigurations?: readonly (string | null)[];
  }[];
  dreamsigns?: readonly DreamsignContent[];
  activeDreamsigns?: readonly { readonly dreamsignId: string }[];
  dreamsignPoolIds?: readonly string[];
} = {}): JourneyContext {
  const deckEntries = [...(overrides.deckEntries ?? [])];
  const totalCards = deckEntries.reduce((total, entry) => total + entry.copies, 0);
  const starterIds = new Set(
    (overrides.cards ?? []).filter((card) => card.rarity === "Starter").map((card) => card.id),
  );
  const quest: QuestStateProjection = {
    seed: "rewards-apply-test",
    resources: {
      essence: overrides.essence ?? 100,
      maxEssence: overrides.maxEssence ?? 200,
      omens: overrides.omens ?? 3,
      dreamscape: 0,
    },
    selectedTides: [],
    deck: {
      entries: deckEntries,
      summary: {
        totalCards,
        starterCards: deckEntries
          .filter((entry) => starterIds.has(entry.cardId))
          .reduce((total, entry) => total + entry.copies, 0),
        uniqueCards: deckEntries.length,
      },
    },
    draftPool: [],
    activeDreamsigns: overrides.activeDreamsigns ?? [],
    dreamsignPoolIds: overrides.dreamsignPoolIds ?? [],
    banes: [],
    dreamcaller: { id: "" },
  };
  const content: ContentBundle = {
    cards: [...(overrides.cards ?? [])],
    dreamcallers: [],
    dreamsigns: [...(overrides.dreamsigns ?? [])],
  };
  return { content, contentVersion: "test", state: { quest } };
}

function planningContext(
  resolutions: ReadonlyMap<string, ChooserResolution> = new Map(),
): ChooserPlanningContext {
  return {
    requestIdForSlot: (slot = 0) => `request:${String(slot)}`,
    resolutions,
  };
}

function cardFixture(): readonly CardContent[] {
  return [
    {
      id: "starter-alpha",
      name: "Starter Alpha",
      tides: [],
      rarity: "Starter",
      cardType: "Event",
      energyCost: 0,
      spark: "",
      cardNumber: 1,
      raw: {},
    },
    {
      id: "starter-beta",
      name: "Starter Beta",
      tides: [],
      rarity: "Starter",
      cardType: "Character",
      energyCost: 0,
      spark: "",
      cardNumber: 2,
      raw: {},
    },
    {
      id: "event-alpha",
      name: "Event Alpha",
      tides: [],
      rarity: "common",
      cardType: "Event",
      energyCost: 1,
      spark: 1,
      cardNumber: 3,
      raw: {},
    },
    {
      id: "event-beta",
      name: "Event Beta",
      tides: [],
      rarity: "common",
      cardType: "Event",
      energyCost: 2,
      spark: 2,
      cardNumber: 4,
      raw: {},
    },
  ];
}

function draftCardFixture(): readonly CardContent[] {
  return [
    {
      id: "event-alpha",
      name: "Event Alpha",
      tides: [],
      rarity: "common",
      cardType: "Event",
      energyCost: 1,
      spark: 1,
      cardNumber: 3,
      raw: {},
    },
    {
      id: "event-beta",
      name: "Event Beta",
      tides: [],
      rarity: "common",
      cardType: "Event",
      energyCost: 2,
      spark: 2,
      cardNumber: 4,
      raw: {},
    },
    {
      id: "event-gamma",
      name: "Event Gamma",
      tides: [],
      rarity: "common",
      cardType: "Event",
      energyCost: 3,
      spark: 3,
      cardNumber: 5,
      raw: {},
    },
    {
      id: "event-delta",
      name: "Event Delta",
      tides: [],
      rarity: "common",
      cardType: "Event",
      energyCost: 4,
      spark: 4,
      cardNumber: 6,
      raw: {},
    },
  ];
}

// Minimal dreamsign-content fixture mirroring `costs.apply.test.ts`. Tests
// assert the quest-shape `Dreamsign` recorded against `addDreamsign` carries
// the same `id`/`name`/`effectDescription` projected from these records.
function dreamsignFixture(): readonly DreamsignContent[] {
  return [
    {
      id: "ds-1",
      name: "Name A",
      kind: "neutral",
      renderedText: "Effect A",
      tides: [],
      raw: {
        id: "ds-1",
        name: "Name A",
        "effect-description": "Effect A",
        "image-name": "img-a",
        "image-alt": "alt-a",
      },
    },
    {
      id: "ds-2",
      name: "Name B",
      kind: "neutral",
      renderedText: "Effect B",
      tides: [],
      raw: { id: "ds-2", name: "Name B", "effect-description": "Effect B" },
    },
  ];
}

describe("Resource reward apply", () => {
  it("gain_essence calls changeEssence with +x and labeled source", () => {
    const t = getReward("gain_essence");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ x: 75 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeEssence", args: [75, "dream_journey:gain_essence"] },
    ]);
  });

  it("gain_omens calls changeOmens with +x", () => {
    const t = getReward("gain_omens");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ x: 2 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeOmens", args: [2, "dream_journey:gain_omens"] },
    ]);
  });

  it("set_essence_to_percent_of_max calls setEssence(floor(maxEssence * percent / 100), ...)", () => {
    // maxEssence=200, percent=75 → floor(200 * 75 / 100) = 150.
    const t = getReward("set_essence_to_percent_of_max");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 75 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "setEssence",
        args: [150, "dream_journey:set_essence_to_percent_of_max"],
      },
    ]);
  });

  it("set_essence_to_percent_of_max can exceed maxEssence (e.g. percent=125)", () => {
    // The mutation layer clamps; the template body must still emit the
    // un-clamped requested value so the clamp policy stays a property of the
    // mutation, not the template.
    const t = getReward("set_essence_to_percent_of_max");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 125 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "setEssence",
        args: [250, "dream_journey:set_essence_to_percent_of_max"],
      },
    ]);
  });

  it("gain_essence_random_range rolls within [min,max] and calls changeEssence with the positive roll", () => {
    // Wave 1 applies the range reward via `Math.random`; we cannot pin the
    // literal roll. The contract is: a single `changeEssence` call whose
    // first arg is in [min, max].
    const t = getReward("gain_essence_random_range");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ min: 30, max: 60 }, ctx, mut, undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("changeEssence");
    expect(calls[0].args[1]).toBe("dream_journey:gain_essence_random_range");
    const delta = calls[0].args[0] as number;
    expect(Number.isInteger(delta)).toBe(true);
    expect(delta).toBeGreaterThanOrEqual(30);
    expect(delta).toBeLessThanOrEqual(60);
  });

  it("gain_essence_to_max calls setEssence(maxEssence(ctx), ...)", () => {
    const t = getReward("gain_essence_to_max");
    const ctx = buildContext({ essence: 100, maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "setEssence", args: [200, "dream_journey:gain_essence_to_max"] },
    ]);
  });

  it("increase_max_essence calls changeMaxEssence with +p.amount", () => {
    const t = getReward("increase_max_essence");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ amount: 25 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeMaxEssence", args: [25, "dream_journey:increase_max_essence"] },
    ]);
  });
});

describe("Shop reward apply", () => {
  it("next_X_shop_rerolls_free records free shop rerolls", () => {
    const t = getReward("next_X_shop_rerolls_free");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ count: 2 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "grantFreeShopRerolls",
        args: [2, "dream_journey:next_X_shop_rerolls_free"],
      },
    ]);
  });

  it("shop_essence_discount records the essence discount percent", () => {
    const t = getReward("shop_essence_discount");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 30 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "applyShopEssenceDiscount",
        args: [30, "dream_journey:shop_essence_discount"],
      },
    ]);
  });

  it("shop_omen_discount records shop omen discounts", () => {
    const t = getReward("shop_omen_discount");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ count: 3 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "grantShopOmenDiscounts",
        args: [3, "dream_journey:shop_omen_discount"],
      },
    ]);
  });
});

describe("Bane reward apply", () => {
  it("purge_X_banes calls purgeRandomBaneCards(count, ...)", () => {
    const t = getReward("purge_X_banes");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ count: 3 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "purgeRandomBaneCards",
        args: [3, "dream_journey:purge_X_banes"],
      },
    ]);
  });

  it("purge_all_banes calls purgeAllBaneCards(...)", () => {
    const t = getReward("purge_all_banes");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "purgeAllBaneCards", args: ["dream_journey:purge_all_banes"] },
    ]);
  });
});

describe("Card reward apply (non-choice)", () => {
  it("purge_named_starter removes the first matching starter deck entry id", () => {
    const t = getReward("purge_named_starter");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ cardName: "Starter Alpha" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-starter-alpha", "dream_journey:purge_named_starter"],
      },
    ]);
  });

  it("purge_random_starter removes the deterministically rolled starter deck entry", () => {
    const t = getReward("purge_random_starter");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-starter-beta", "dream_journey:purge_random_starter"],
      },
    ]);
  });

  it("purge_random_starter_with_predicate_replacement removes a starter before adding a predicate match", () => {
    const t = getReward("purge_random_starter_with_predicate_replacement");
    const cards = cardFixture();
    const ctx = buildContext({
      cards,
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ predicateId: "events" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-starter-beta", "dream_journey:purge_random_starter_with_predicate_replacement"],
      },
      {
        method: "addCardById",
        args: ["event-alpha", "dream_journey:purge_random_starter_with_predicate_replacement"],
      },
    ]);
  });

  it("purge_all_starters removes every starter deck entry id", () => {
    const t = getReward("purge_all_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 2,
          entryIds: ["deck-starter-alpha-1", "deck-starter-alpha-2"],
        },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-starter-alpha-1", "dream_journey:purge_all_starters"],
      },
      {
        method: "removeDeckEntry",
        args: ["deck-starter-alpha-2", "dream_journey:purge_all_starters"],
      },
    ]);
  });

  it("gain_random_predicate_cards records count distinct catalog card additions matching the predicate", () => {
    const t = getReward("gain_random_predicate_cards");
    const cards = cardFixture();
    const ctx = buildContext({ cards });
    const { mut, calls } = createRecordingMutations();
    t.apply({ predicateId: "events", count: 2 }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "addCardById",
        args: ["starter-alpha", "dream_journey:gain_random_predicate_cards"],
      },
      { method: "addCardById", args: ["event-beta", "dream_journey:gain_random_predicate_cards"] },
    ]);
    const ids = calls.map((call) => call.args[0] as string);
    expect(new Set(ids).size).toBe(2);
    const eventIds = new Set(
      cards.filter((card) => card.cardType === "Event").map((card) => card.id),
    );
    expect(ids.every((id) => eventIds.has(id))).toBe(true);
  });

  it("gain_named_card resolves the literal card name to its catalog id", () => {
    const t = getReward("gain_named_card");
    const ctx = buildContext({ cards: cardFixture() });
    const { mut, calls } = createRecordingMutations();
    t.apply({ name: "Event Beta" }, ctx, mut, undefined);

    expect(calls).toEqual([
      { method: "addCardById", args: ["event-beta", "dream_journey:gain_named_card"] },
    ]);
  });

  it("apply_named_transfiguration_to_card_name warns and skips when the named deck entry is missing", () => {
    const t = getReward("apply_named_transfiguration_to_card_name");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ transfiguration: "Golden", cardName: "Event Alpha" }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("apply_named_transfiguration_to_card_name skips an already-transfigured copy", () => {
    const t = getReward("apply_named_transfiguration_to_card_name");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "event-alpha",
          copies: 2,
          entryIds: ["deck-event-alpha-1", "deck-event-alpha-2"],
          entryTransfigurations: ["Golden", null],
        },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ transfiguration: "Viridian", cardName: "Event Alpha" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-alpha-2",
          "Viridian",
          "dream_journey:apply_named_transfiguration_to_card_name",
        ],
      },
    ]);
  });

  it("change_card_to_become_type changes the first matching named deck entry type", () => {
    const t = getReward("change_card_to_become_type");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { cardName: "Event Alpha", cardTypePredicateId: "spirit_animals" },
      ctx,
      mut,
      undefined,
    );

    expect(calls).toEqual([
      {
        method: "changeDeckEntryType",
        args: [
          "deck-event-alpha",
          {
            predicateId: "spirit_animals",
            cardType: "Character",
            subtype: "Spirit Animal",
            label: "Spirit Animal",
          },
          "dream_journey:change_card_to_become_type",
        ],
      },
    ]);
  });

  it("modify_random_cards_to_types changes the promised number of deterministic deck entries", () => {
    const t = getReward("modify_random_cards_to_types");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const first = createRecordingMutations();
    const second = createRecordingMutations();

    t.apply(
      { count: 3, cardTypePredicateId: "spirit_animals" },
      ctx,
      first.mut,
      undefined,
    );
    t.apply(
      { count: 3, cardTypePredicateId: "spirit_animals" },
      ctx,
      second.mut,
      undefined,
    );

    expect(first.calls).toEqual(second.calls);
    expect(first.calls).toHaveLength(3);
    expect(new Set(first.calls.map((call) => call.args[0]))).toHaveLength(3);
    expect(first.calls).toEqual(
      first.calls.map((call) => ({
        method: "changeDeckEntryType",
        args: [
          call.args[0],
          {
            predicateId: "spirit_animals",
            cardType: "Character",
            subtype: "Spirit Animal",
            label: "Spirit Animal",
          },
          "dream_journey:modify_random_cards_to_types",
        ],
      })),
    );
  });

  it("make_random_cards_fast adds fast to the promised number of deterministic deck entries", () => {
    const t = getReward("make_random_cards_fast");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const first = createRecordingMutations();
    const second = createRecordingMutations();

    t.apply({ count: 2 }, ctx, first.mut, undefined);
    t.apply({ count: 2 }, ctx, second.mut, undefined);

    expect(first.calls).toEqual(second.calls);
    expect(first.calls).toHaveLength(2);
    expect(new Set(first.calls.map((call) => call.args[0]))).toHaveLength(2);
    expect(first.calls).toEqual(
      first.calls.map((call) => ({
        method: "changeDeckEntryKeywords",
        args: [
          call.args[0],
          { fast: true },
          "dream_journey:make_random_cards_fast",
        ],
      })),
    );
  });

  it("make_card_reclaim adds the promised Reclaim value to the named deck entry", () => {
    const t = getReward("make_card_reclaim");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply({ cardName: "Event Alpha", count: 2 }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "changeDeckEntryKeywords",
        args: [
          "deck-event-alpha",
          { reclaim: 2 },
          "dream_journey:make_card_reclaim",
        ],
      },
    ]);
  });

  it("make_random_cards_reclaim adds Reclaim to the promised number of deterministic deck entries", () => {
    const t = getReward("make_random_cards_reclaim");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const first = createRecordingMutations();
    const second = createRecordingMutations();

    t.apply({ count: 2, reclaim: 1 }, ctx, first.mut, undefined);
    t.apply({ count: 2, reclaim: 1 }, ctx, second.mut, undefined);

    expect(first.calls).toEqual(second.calls);
    expect(first.calls).toHaveLength(2);
    expect(new Set(first.calls.map((call) => call.args[0]))).toHaveLength(2);
    expect(first.calls).toEqual(
      first.calls.map((call) => ({
        method: "changeDeckEntryKeywords",
        args: [
          call.args[0],
          { reclaim: 1 },
          "dream_journey:make_random_cards_reclaim",
        ],
      })),
    );
  });

  it("apply_chosen_transfiguration_to_chosen_card first plans a transfiguration chooser", () => {
    const t = getReward("apply_chosen_transfiguration_to_chosen_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });

    expect(t.choosePlan?.({}, ctx, planningContext())).toEqual({
      kind: "transfiguration",
      requestId: "request:0",
      eligibleTransfigurations: [
        "Viridian",
        "Golden",
        "Scarlet",
        "Azure",
        "Bronze",
        "Prismatic",
      ],
      title: "Choose a transfiguration",
    });
  });

  it("apply_chosen_transfiguration_to_chosen_card then plans a card chooser for the selected transfiguration", () => {
    const t = getReward("apply_chosen_transfiguration_to_chosen_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const resolutions = new Map<string, ChooserResolution>([
      ["request:0", { kind: "transfiguration", type: "Bronze" }],
    ]);

    expect(t.choosePlan?.({}, ctx, planningContext(resolutions))).toEqual({
      kind: "card",
      requestId: "request:1",
      poolKind: "deck",
      deckFilter: { entryIds: ["deck-starter-alpha", "deck-event-alpha"] },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to transfigure",
    });
  });

  it("apply_chosen_transfiguration_to_chosen_card filters slot-1 cards to Viridian-eligible entries", () => {
    const t = getReward("apply_chosen_transfiguration_to_chosen_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const resolutions = new Map<string, ChooserResolution>([
      ["request:0", { kind: "transfiguration", type: "Viridian" }],
    ]);

    expect(t.choosePlan?.({}, ctx, planningContext(resolutions))).toEqual({
      kind: "card",
      requestId: "request:1",
      poolKind: "deck",
      deckFilter: { entryIds: ["deck-event-alpha", "deck-event-beta"] },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to transfigure",
    });
  });

  it("apply_chosen_transfiguration_to_chosen_card applies both chooser resolutions", () => {
    const t = getReward("apply_chosen_transfiguration_to_chosen_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    const resolutions = new Map<string, ChooserResolution>([
      ["request:0", { kind: "transfiguration", type: "Bronze" }],
      ["request:1", { kind: "card", entryIds: ["deck-event-alpha"], cardIds: ["event-alpha"] }],
    ]);

    t.apply(
      {},
      ctx,
      mut,
      { kind: "transfiguration", type: "Bronze" },
      planningContext(resolutions),
    );

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-alpha",
          "Bronze",
          "dream_journey:apply_chosen_transfiguration_to_chosen_card",
        ],
      },
    ]);
  });

  it.each([
    {
      name: "missing slot-0 resolution",
      slot0: undefined,
      resolutions: new Map<string, ChooserResolution>([
        ["request:1", { kind: "card", entryIds: ["deck-event-alpha"] }],
      ]),
    },
    {
      name: "wrong slot-0 kind",
      slot0: { kind: "card" as const, entryIds: ["deck-event-alpha"] },
      resolutions: new Map<string, ChooserResolution>([
        ["request:1", { kind: "card", entryIds: ["deck-event-alpha"] }],
      ]),
    },
    {
      name: "missing slot-1 resolution",
      slot0: { kind: "transfiguration" as const, type: "Bronze" as const },
      resolutions: new Map<string, ChooserResolution>([
        ["request:0", { kind: "transfiguration", type: "Bronze" }],
      ]),
    },
    {
      name: "wrong slot-1 kind",
      slot0: { kind: "transfiguration" as const, type: "Bronze" as const },
      resolutions: new Map<string, ChooserResolution>([
        ["request:1", { kind: "transfiguration", type: "Bronze" }],
      ]),
    },
    {
      name: "stale ineligible card",
      slot0: { kind: "transfiguration" as const, type: "Scarlet" as const },
      resolutions: new Map<string, ChooserResolution>([
        ["request:1", { kind: "card", entryIds: ["deck-event-alpha"] }],
      ]),
    },
    {
      name: "stale Viridian-ineligible card",
      slot0: { kind: "transfiguration" as const, type: "Viridian" as const },
      resolutions: new Map<string, ChooserResolution>([
        ["request:1", { kind: "card", entryIds: ["deck-starter-alpha"] }],
      ]),
    },
  ])("apply_chosen_transfiguration_to_chosen_card skips $name", ({ slot0, resolutions }) => {
    const t = getReward("apply_chosen_transfiguration_to_chosen_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({}, ctx, mut, slot0, planningContext(resolutions));
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("apply_named_transfiguration_to_chosen_predicate_cards plans an exact-count predicate chooser", () => {
    const t = getReward("apply_named_transfiguration_to_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });

    expect(
      t.choosePlan?.(
        { transfiguration: "Viridian", predicateId: "events", count: 2 },
        ctx,
        planningContext(),
      ),
    ).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: { predicateId: "events", entryIds: ["deck-event-alpha", "deck-event-beta"] },
      minPicks: 2,
      maxPicks: 2,
      title: "Choose cards to transfigure",
    });
  });

  it("apply_named_transfiguration_to_chosen_predicate_cards plans only untransfigured eligible predicate entries", () => {
    const t = getReward("apply_named_transfiguration_to_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        {
          cardId: "event-alpha",
          copies: 1,
          entryIds: ["deck-event-alpha"],
          entryTransfigurations: ["Golden"],
        },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });

    expect(
      t.choosePlan?.(
        { transfiguration: "Viridian", predicateId: "events", count: 1 },
        ctx,
        planningContext(),
      ),
    ).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: { predicateId: "events", entryIds: ["deck-event-beta"] },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to transfigure",
    });
  });

  it("apply_named_transfiguration_to_chosen_predicate_cards is not viable with too few untransfigured eligible predicate entries", () => {
    const t = getReward("apply_named_transfiguration_to_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        {
          cardId: "event-alpha",
          copies: 1,
          entryIds: ["deck-event-alpha"],
          entryTransfigurations: ["Golden"],
        },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });

    expect(
      t.viable({ transfiguration: "Viridian", predicateId: "events", count: 2 }, ctx),
    ).toBe(false);
    expect(
      t.viable({ transfiguration: "Viridian", predicateId: "events", count: 1 }, ctx),
    ).toBe(true);
  });

  it("apply_named_transfiguration_to_chosen_predicate_cards applies the named transfiguration to chosen entries", () => {
    const t = getReward("apply_named_transfiguration_to_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { transfiguration: "Viridian", predicateId: "events", count: 2 },
      ctx,
      mut,
      {
        kind: "card",
        entryIds: ["deck-event-alpha", "deck-event-beta"],
        cardIds: ["event-alpha", "event-beta"],
      },
    );

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-alpha",
          "Viridian",
          "dream_journey:apply_named_transfiguration_to_chosen_predicate_cards",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-beta",
          "Viridian",
          "dream_journey:apply_named_transfiguration_to_chosen_predicate_cards",
        ],
      },
    ]);
  });

  it.each([
    {
      name: "missing resolution",
      resolution: undefined,
    },
    {
      name: "wrong kind",
      resolution: { kind: "transfiguration" as const, type: "Viridian" as const },
    },
    {
      name: "wrong count",
      resolution: { kind: "card" as const, entryIds: ["deck-event-alpha"] },
    },
    {
      name: "nonmatching predicate entry",
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-event-alpha", "deck-starter-beta"],
      },
    },
    {
      name: "optional card ids mismatch",
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-event-alpha", "deck-event-beta"],
        cardIds: ["event-alpha", "starter-beta"],
      },
    },
    {
      name: "entry ineligible for transfiguration",
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-event-alpha", "deck-event-beta"],
      },
      transfiguration: "Scarlet",
    },
  ])("apply_named_transfiguration_to_chosen_predicate_cards skips $name", ({
    resolution,
    transfiguration = "Viridian",
  }) => {
    const t = getReward("apply_named_transfiguration_to_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(
        { transfiguration, predicateId: "events", count: 2 },
        ctx,
        mut,
        resolution,
      );
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("apply_named_transfiguration_to_chosen_predicate_cards skips an already-transfigured chosen entry", () => {
    const t = getReward("apply_named_transfiguration_to_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "event-alpha",
          copies: 1,
          entryIds: ["deck-event-alpha"],
          entryTransfigurations: ["Golden"],
        },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(
        { transfiguration: "Viridian", predicateId: "events", count: 2 },
        ctx,
        mut,
        { kind: "card", entryIds: ["deck-event-alpha", "deck-event-beta"] },
      );
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transfigure_chosen_starters plans an exact-count starter chooser", () => {
    const t = getReward("transfigure_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });

    expect(t.choosePlan?.({ count: 2 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: {
        starterOnly: true,
        entryIds: ["deck-starter-alpha", "deck-starter-beta"],
      },
      minPicks: 2,
      maxPicks: 2,
      title: "Choose starter cards to transfigure",
    });
  });

  it("transfigure_chosen_starters plans only untransfigured starter entries", () => {
    const t = getReward("transfigure_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 1,
          entryIds: ["deck-starter-alpha"],
          entryTransfigurations: ["Golden"],
        },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });

    expect(t.choosePlan?.({ count: 1 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: { starterOnly: true, entryIds: ["deck-starter-beta"] },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a starter card to transfigure",
    });
  });

  it("transfigure_chosen_starters applies deterministic random transfigurations to chosen starters", () => {
    const t = getReward("transfigure_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { count: 2 },
      ctx,
      mut,
      {
        kind: "card",
        entryIds: ["deck-starter-alpha", "deck-starter-beta"],
        cardIds: ["starter-alpha", "starter-beta"],
      },
    );

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["deck-starter-alpha", "Azure", "dream_journey:transfigure_chosen_starters"],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-starter-beta",
          "Golden",
          "dream_journey:transfigure_chosen_starters",
        ],
      },
    ]);
  });

  it.each([
    {
      name: "missing resolution",
      resolution: undefined,
    },
    {
      name: "wrong count",
      resolution: { kind: "card" as const, entryIds: ["deck-starter-alpha"] },
    },
    {
      name: "nonstarter",
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-starter-alpha", "deck-event-alpha"],
      },
    },
    {
      name: "optional card ids mismatch",
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-starter-alpha", "deck-starter-beta"],
        cardIds: ["starter-alpha", "event-alpha"],
      },
    },
  ])("transfigure_chosen_starters skips $name", ({ resolution }) => {
    const t = getReward("transfigure_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ count: 2 }, ctx, mut, resolution);
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transfigure_chosen_starters skips an already-transfigured chosen starter", () => {
    const t = getReward("transfigure_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 1,
          entryIds: ["deck-starter-alpha"],
          entryTransfigurations: ["Golden"],
        },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(
        { count: 2 },
        ctx,
        mut,
        { kind: "card", entryIds: ["deck-starter-alpha", "deck-starter-beta"] },
      );
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("apply_named_transfiguration_to_random_predicate_cards applies the named transfiguration to deterministic matching entries", () => {
    const t = getReward("apply_named_transfiguration_to_random_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ transfiguration: "Golden", predicateId: "events", count: 2 }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-beta",
          "Golden",
          "dream_journey:apply_named_transfiguration_to_random_predicate_cards",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-starter-alpha",
          "Golden",
          "dream_journey:apply_named_transfiguration_to_random_predicate_cards",
        ],
      },
    ]);
  });

  it("apply_named_transfiguration_to_random_predicate_cards excludes already-transfigured matches", () => {
    const t = getReward("apply_named_transfiguration_to_random_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 1,
          entryIds: ["deck-starter-alpha"],
          entryTransfigurations: ["Golden"],
        },
        {
          cardId: "event-alpha",
          copies: 1,
          entryIds: ["deck-event-alpha"],
          entryTransfigurations: [null],
        },
        {
          cardId: "event-beta",
          copies: 1,
          entryIds: ["deck-event-beta"],
          entryTransfigurations: ["Rose"],
        },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ transfiguration: "Golden", predicateId: "events", count: 2 }, ctx, mut, undefined);

      expect(calls).toEqual([
        {
          method: "transfigureDeckEntry",
          args: [
            "deck-event-alpha",
            "Golden",
            "dream_journey:apply_named_transfiguration_to_random_predicate_cards",
          ],
        },
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("only 1 deck entries matched predicate \"events\" for count=2"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("apply_named_transfiguration_to_random_predicate_cards skips ineligible concrete matches", () => {
    const t = getReward("apply_named_transfiguration_to_random_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ transfiguration: "Viridian", predicateId: "events", count: 2 }, ctx, mut, undefined);

    expect(calls.map((call) => call.args[0]).sort()).toEqual([
      "deck-event-alpha",
      "deck-event-beta",
    ]);
    expect(calls.every((call) => call.args[1] === "Viridian")).toBe(true);
  });

  it("apply_named_transfiguration_to_all_predicate_cards applies the same transfiguration to every matching deck entry", () => {
    const t = getReward("apply_named_transfiguration_to_all_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ transfiguration: "Golden", predicateId: "events" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-starter-alpha",
          "Golden",
          "dream_journey:apply_named_transfiguration_to_all_predicate_cards",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-alpha",
          "Golden",
          "dream_journey:apply_named_transfiguration_to_all_predicate_cards",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-beta",
          "Golden",
          "dream_journey:apply_named_transfiguration_to_all_predicate_cards",
        ],
      },
    ]);
  });

  it("apply_named_transfiguration_to_all_predicate_cards excludes already-transfigured matches", () => {
    const t = getReward("apply_named_transfiguration_to_all_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 1,
          entryIds: ["deck-starter-alpha"],
          entryTransfigurations: ["Golden"],
        },
        {
          cardId: "event-alpha",
          copies: 1,
          entryIds: ["deck-event-alpha"],
          entryTransfigurations: [null],
        },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ transfiguration: "Golden", predicateId: "events" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-alpha",
          "Golden",
          "dream_journey:apply_named_transfiguration_to_all_predicate_cards",
        ],
      },
    ]);
  });

  it("apply_named_transfiguration_to_all_predicate_cards skips ineligible concrete matches", () => {
    const t = getReward("apply_named_transfiguration_to_all_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ transfiguration: "Viridian", predicateId: "events" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-alpha",
          "Viridian",
          "dream_journey:apply_named_transfiguration_to_all_predicate_cards",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-beta",
          "Viridian",
          "dream_journey:apply_named_transfiguration_to_all_predicate_cards",
        ],
      },
    ]);
  });

  it("transfigure_random_starters applies deterministic random transfigurations to deterministic starter entries", () => {
    const t = getReward("transfigure_random_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ count: 2 }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["deck-starter-alpha", "Bronze", "dream_journey:transfigure_random_starters"],
      },
      {
        method: "transfigureDeckEntry",
        args: ["deck-starter-beta", "Prismatic", "dream_journey:transfigure_random_starters"],
      },
    ]);
  });

  it("transfigure_random_starters excludes already-transfigured starters", () => {
    const t = getReward("transfigure_random_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 1,
          entryIds: ["deck-starter-alpha"],
          entryTransfigurations: ["Golden"],
        },
        {
          cardId: "starter-beta",
          copies: 1,
          entryIds: ["deck-starter-beta"],
          entryTransfigurations: [null],
        },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ count: 2 }, ctx, mut, undefined);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("transfigureDeckEntry");
      expect(calls[0].args[0]).toBe("deck-starter-beta");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("only 1 starter deck entries available for count=2"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transfigure_all_starters applies deterministic random transfigurations to every starter entry", () => {
    const t = getReward("transfigure_all_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["deck-starter-alpha", "Golden", "dream_journey:transfigure_all_starters"],
      },
      {
        method: "transfigureDeckEntry",
        args: ["deck-starter-beta", "Prismatic", "dream_journey:transfigure_all_starters"],
      },
    ]);
  });

  it("transfigure_all_starters excludes already-transfigured starters", () => {
    const t = getReward("transfigure_all_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 1,
          entryIds: ["deck-starter-alpha"],
          entryTransfigurations: ["Golden"],
        },
        {
          cardId: "starter-beta",
          copies: 1,
          entryIds: ["deck-starter-beta"],
          entryTransfigurations: [null],
        },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("transfigureDeckEntry");
    expect(calls[0].args[0]).toBe("deck-starter-beta");
  });

  it("apply_random_transfigurations_to_random_cards pairs deterministic random entries and transfigurations", () => {
    const t = getReward("apply_random_transfigurations_to_random_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ count: 2 }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-starter-alpha",
          "Golden",
          "dream_journey:apply_random_transfigurations_to_random_cards",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-beta",
          "Prismatic",
          "dream_journey:apply_random_transfigurations_to_random_cards",
        ],
      },
    ]);
  });

  it("apply_random_transfigurations_to_random_cards excludes already-transfigured cards", () => {
    const t = getReward("apply_random_transfigurations_to_random_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 1,
          entryIds: ["deck-starter-alpha"],
          entryTransfigurations: ["Golden"],
        },
        {
          cardId: "event-alpha",
          copies: 1,
          entryIds: ["deck-event-alpha"],
          entryTransfigurations: [null],
        },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ count: 2 }, ctx, mut, undefined);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("transfigureDeckEntry");
      expect(calls[0].args[0]).toBe("deck-event-alpha");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("only 1 deck entries available for count=2"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("random transfiguration rewards choose transfigurations eligible for each selected card", () => {
    const cards = cardFixture();
    const ctx = buildContext({
      cards,
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const entryCardIds = new Map([
      ["deck-event-alpha", "event-alpha"],
      ["deck-starter-beta", "starter-beta"],
    ]);

    for (const rewardId of [
      "transfigure_random_starters",
      "transfigure_all_starters",
      "apply_random_transfigurations_to_random_cards",
    ]) {
      const t = getReward(rewardId);
      const { mut, calls } = createRecordingMutations();
      const params = rewardId === "transfigure_all_starters" ? {} : { count: 2 };
      t.apply(params, ctx, mut, undefined);

      for (const call of calls) {
        const [entryId, transfiguration] = call.args as [string, string, string];
        const cardId = entryCardIds.get(entryId);
        const card = cards.find((candidate) => candidate.id === cardId);
        expect(card).toBeDefined();
        expect(isCardEligibleForTransfiguration(transfiguration, card!)).toBe(true);
      }
    }
  });

  it("purge_chosen_predicate_cards plans a bounded predicate deck chooser", () => {
    const t = getReward("purge_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });

    expect(t.choosePlan?.({ predicateId: "events", count: 2 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: { predicateId: "events", entryIds: ["deck-event-alpha", "deck-event-beta"] },
      minPicks: 1,
      maxPicks: 2,
      title: "Choose cards to purge",
    });
  });

  it("purge_chosen_predicate_cards caps maxPicks when fewer eligible targets exist", () => {
    const t = getReward("purge_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });

    expect(t.viable({ predicateId: "events", count: 3 }, ctx)).toBe(true);
    expect(t.render({ predicateId: "events", count: 3 }, ctx)).toBe(
      "Purge up to 3 chosen Event cards",
    );
    expect(t.choosePlan?.({ predicateId: "events", count: 3 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: { predicateId: "events", entryIds: ["deck-event-alpha"] },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose cards to purge",
    });
  });

  it("purge_chosen_predicate_cards removes chosen predicate entries", () => {
    const t = getReward("purge_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { predicateId: "events", count: 2 },
      ctx,
      mut,
      { kind: "card", entryIds: ["deck-event-alpha", "deck-event-beta"] },
    );

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-alpha", "dream_journey:purge_chosen_predicate_cards"],
      },
      {
        method: "removeDeckEntry",
        args: ["deck-event-beta", "dream_journey:purge_chosen_predicate_cards"],
      },
    ]);
  });

  it("purge_chosen_predicate_cards accepts fewer than count and mutates only selected entries", () => {
    const t = getReward("purge_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { predicateId: "events", count: 3 },
      ctx,
      mut,
      { kind: "card", entryIds: ["deck-event-beta"] },
    );

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-beta", "dream_journey:purge_chosen_predicate_cards"],
      },
    ]);
  });

  it.each([
    {
      name: "missing resolution",
      resolution: undefined,
    },
    {
      name: "zero selections",
      resolution: { kind: "card" as const, entryIds: [] },
    },
    {
      name: "over-limit selections",
      resolution: { kind: "card" as const, entryIds: ["deck-event-alpha", "deck-event-beta"] },
      params: { predicateId: "events", count: 1 },
    },
    {
      name: "duplicate selections",
      resolution: { kind: "card" as const, entryIds: ["deck-event-alpha", "deck-event-alpha"] },
    },
    {
      name: "stale nonmatching entry",
      resolution: { kind: "card" as const, entryIds: ["deck-starter-beta", "deck-event-alpha"] },
    },
  ])("purge_chosen_predicate_cards skips $name without mutation", ({
    resolution,
    params = { predicateId: "events", count: 2 },
  }) => {
    const t = getReward("purge_chosen_predicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(params, ctx, mut, resolution);
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("purge_chosen_predicate_with_replacement plans a bounded predicate deck chooser", () => {
    const t = getReward("purge_chosen_predicate_with_replacement");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });

    expect(t.choosePlan?.({ predicateId: "events", count: 1 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: { predicateId: "events", entryIds: ["deck-event-alpha"] },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to transform",
    });
  });

  it("purge_chosen_predicate_with_replacement caps maxPicks by replacement availability", () => {
    const t = getReward("purge_chosen_predicate_with_replacement");
    const ctx = buildContext({
      cards: cardFixture().filter((card) =>
        card.id === "event-alpha" || card.id === "starter-beta",
      ),
      deckEntries: [
        {
          cardId: "event-alpha",
          copies: 2,
          entryIds: ["deck-event-alpha-1", "deck-event-alpha-2"],
        },
      ],
    });

    expect(t.viable({ predicateId: "events", count: 2 }, ctx)).toBe(true);
    expect(t.render({ predicateId: "events", count: 2 }, ctx)).toBe(
      "Transform up to 2 chosen Event cards into random Event cards",
    );
    expect(t.choosePlan?.({ predicateId: "events", count: 2 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: {
        predicateId: "events",
        entryIds: ["deck-event-alpha-1", "deck-event-alpha-2"],
      },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose cards to transform",
    });
  });

  it("purge_chosen_predicate_with_replacement removes the chosen entry and adds a matching replacement", () => {
    const t = getReward("purge_chosen_predicate_with_replacement");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { predicateId: "events", count: 1 },
      ctx,
      mut,
      { kind: "card", entryIds: ["deck-event-alpha"], cardIds: ["event-alpha"] },
    );

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-alpha", "dream_journey:purge_chosen_predicate_with_replacement"],
      },
      {
        method: "addCardById",
        args: ["event-alpha", "dream_journey:purge_chosen_predicate_with_replacement"],
      },
    ]);
  });

  it("purge_chosen_predicate_with_replacement rolls one replacement per selected entry", () => {
    const t = getReward("purge_chosen_predicate_with_replacement");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { predicateId: "events", count: 3 },
      ctx,
      mut,
      { kind: "card", entryIds: ["deck-event-alpha", "deck-event-beta"] },
    );

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-alpha", "dream_journey:purge_chosen_predicate_with_replacement"],
      },
      {
        method: "addCardById",
        args: ["event-alpha", "dream_journey:purge_chosen_predicate_with_replacement"],
      },
      {
        method: "removeDeckEntry",
        args: ["deck-event-beta", "dream_journey:purge_chosen_predicate_with_replacement"],
      },
      {
        method: "addCardById",
        args: ["starter-alpha", "dream_journey:purge_chosen_predicate_with_replacement"],
      },
    ]);
  });

  it.each([
    {
      name: "zero selections",
      cards: cardFixture(),
      resolution: { kind: "card" as const, entryIds: [] },
    },
    {
      name: "over-limit selections",
      cards: cardFixture(),
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-event-alpha", "deck-event-beta"],
      },
      params: { predicateId: "events", count: 1 },
    },
    {
      name: "duplicate selections",
      cards: cardFixture(),
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-event-alpha", "deck-event-alpha"],
      },
    },
    {
      name: "stale selected entry",
      cards: cardFixture(),
      resolution: { kind: "card" as const, entryIds: ["deck-starter-beta"] },
    },
    {
      name: "insufficient replacement pool",
      cards: cardFixture().filter((card) =>
        card.id === "event-alpha" || card.id === "starter-beta",
      ),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        {
          cardId: "event-alpha",
          copies: 2,
          entryIds: ["deck-event-alpha-1", "deck-event-alpha-2"],
        },
      ],
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-event-alpha-1", "deck-event-alpha-2"],
      },
    },
  ])("purge_chosen_predicate_with_replacement skips $name without partial mutation", ({
    cards,
    deckEntries = [
      { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
    ],
    resolution,
    params = { predicateId: "events", count: resolution.entryIds.length },
  }) => {
    const t = getReward("purge_chosen_predicate_with_replacement");
    const ctx = buildContext({
      cards,
      deckEntries,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(
        params,
        ctx,
        mut,
        resolution,
      );
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transform_chosen_predicate_into_named plans a predicate deck chooser", () => {
    const t = getReward("transform_chosen_predicate_into_named");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });

    expect(
      t.choosePlan?.(
        { predicateId: "events", newCardName: "Starter Beta" },
        ctx,
        planningContext(),
      ),
    ).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: { predicateId: "events", entryIds: ["deck-event-alpha"] },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to transform",
    });
  });

  it("transform_chosen_predicate_into_named does not plan when the named target is missing", () => {
    const t = getReward("transform_chosen_predicate_into_named");
    const ctx = buildContext({
      cards: cardFixture().filter((card) => card.name !== "Starter Beta"),
      deckEntries: [{ cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] }],
    });

    expect(
      t.choosePlan?.(
        { predicateId: "events", newCardName: "Starter Beta" },
        ctx,
        planningContext(),
      ),
    ).toBeUndefined();
  });

  it("transform_chosen_predicate_into_named removes the chosen entry and adds the named target", () => {
    const t = getReward("transform_chosen_predicate_into_named");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [{ cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] }],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { predicateId: "events", newCardName: "Starter Beta" },
      ctx,
      mut,
      { kind: "card", entryIds: ["deck-event-alpha"], cardIds: ["event-alpha"] },
    );

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-alpha", "dream_journey:transform_chosen_predicate_into_named"],
      },
      {
        method: "addCardById",
        args: ["starter-beta", "dream_journey:transform_chosen_predicate_into_named"],
      },
    ]);
  });

  it.each([
    {
      name: "target card missing",
      cards: cardFixture().filter((card) => card.name !== "Starter Beta"),
      resolution: { kind: "card" as const, entryIds: ["deck-event-alpha"] },
    },
    {
      name: "stale selected entry",
      cards: cardFixture(),
      resolution: { kind: "card" as const, entryIds: ["deck-starter-beta"] },
    },
  ])("transform_chosen_predicate_into_named skips $name without partial mutation", ({ cards, resolution }) => {
    const t = getReward("transform_chosen_predicate_into_named");
    const ctx = buildContext({
      cards,
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(
        { predicateId: "events", newCardName: "Starter Beta" },
        ctx,
        mut,
        resolution,
      );
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("duplicate_chosen_cards plans an exact-count deck chooser over concrete entries", () => {
    const t = getReward("duplicate_chosen_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });

    expect(t.choosePlan?.({ count: 2 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: { entryIds: ["deck-event-alpha", "deck-starter-alpha"] },
      minPicks: 2,
      maxPicks: 2,
      title: "Choose cards to duplicate",
    });
  });

  it("duplicate_chosen_cards duplicates each chosen entry", () => {
    const t = getReward("duplicate_chosen_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { count: 2 },
      ctx,
      mut,
      { kind: "card", entryIds: ["deck-event-alpha", "deck-starter-alpha"] },
    );

    expect(calls).toEqual([
      {
        method: "duplicateDeckEntry",
        args: ["deck-event-alpha", "dream_journey:duplicate_chosen_cards"],
      },
      {
        method: "duplicateDeckEntry",
        args: ["deck-starter-alpha", "dream_journey:duplicate_chosen_cards"],
      },
    ]);
  });

  it.each([
    {
      name: "missing resolution",
      resolution: undefined,
    },
    {
      name: "duplicate selected entry",
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-event-alpha", "deck-event-alpha"],
      },
    },
    {
      name: "stale selected entry",
      resolution: { kind: "card" as const, entryIds: ["deck-event-alpha", "missing-entry"] },
    },
  ])("duplicate_chosen_cards skips $name", ({ resolution }) => {
    const t = getReward("duplicate_chosen_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ count: 2 }, ctx, mut, resolution);
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("draw_X_and_duplicate_chosen plans a rolled deterministic subset of concrete deck entries", () => {
    const t = getReward("draw_X_and_duplicate_chosen");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });

    expect(t.choosePlan?.({ drawCount: 3 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "rolled",
      rolledCardIds: ["starter-alpha", "event-beta", "event-alpha"],
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a drawn card to duplicate",
    });
  });

  it("draw_X_and_duplicate_chosen duplicates a chosen rolled deck entry", () => {
    const t = getReward("draw_X_and_duplicate_chosen");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { drawCount: 2 },
      ctx,
      mut,
      { kind: "card", entryIds: ["rolled:event-beta:1"], cardIds: ["event-beta"] },
    );

    expect(calls).toEqual([
      {
        method: "duplicateDeckEntry",
        args: ["deck-event-beta", "dream_journey:draw_X_and_duplicate_chosen"],
      },
    ]);
  });

  it.each([
    {
      name: "missing resolution",
      resolution: undefined,
    },
    {
      name: "malformed rolled chooser id",
      resolution: {
        kind: "card" as const,
        entryIds: ["rolled:event-beta:1junk"],
        cardIds: ["event-beta"],
      },
    },
    {
      name: "mismatched rolled chooser card id",
      resolution: {
        kind: "card" as const,
        entryIds: ["rolled:event-alpha:1"],
        cardIds: ["event-alpha"],
      },
    },
  ])("draw_X_and_duplicate_chosen skips $name", ({ resolution }) => {
    const t = getReward("draw_X_and_duplicate_chosen");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ drawCount: 2 }, ctx, mut, resolution);
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transform_starter_into_named_card removes a starter deck entry before adding the target card", () => {
    const t = getReward("transform_starter_into_named_card");
    const cards = cardFixture();
    const ctx = buildContext({
      cards,
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ newCardName: "Event Beta" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-starter-alpha", "dream_journey:transform_starter_into_named_card"],
      },
      {
        method: "addCardById",
        args: ["event-beta", "dream_journey:transform_starter_into_named_card"],
      },
    ]);
  });

  it("transform_starter_into_named_card warns and skips when no starter deck entry exists", () => {
    const t = getReward("transform_starter_into_named_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ newCardName: "Event Beta" }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transform_starter_into_named_card warns and skips when the target card is missing", () => {
    const t = getReward("transform_starter_into_named_card");
    const ctx = buildContext({
      cards: cardFixture().filter((card) => card.name !== "Event Beta"),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ newCardName: "Event Beta" }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transform_card_in_deck_into_named removes the named deck entry before adding the target card", () => {
    const t = getReward("transform_card_in_deck_into_named");
    const cards = cardFixture();
    const ctx = buildContext({
      cards,
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ oldCardName: "Event Alpha", newCardName: "Event Beta" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-alpha", "dream_journey:transform_card_in_deck_into_named"],
      },
      {
        method: "addCardById",
        args: ["event-beta", "dream_journey:transform_card_in_deck_into_named"],
      },
    ]);
  });

  it("transform_card_in_deck_into_named warns and skips when the old deck entry is missing", () => {
    const t = getReward("transform_card_in_deck_into_named");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(
        { oldCardName: "Event Alpha", newCardName: "Event Beta" },
        ctx,
        mut,
        undefined,
      );
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transform_card_in_deck_into_named warns and skips when the target card is missing", () => {
    const t = getReward("transform_card_in_deck_into_named");
    const ctx = buildContext({
      cards: cardFixture().filter((card) => card.name !== "Event Beta"),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(
        { oldCardName: "Event Alpha", newCardName: "Event Beta" },
        ctx,
        mut,
        undefined,
      );
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("duplicate_named_card_X duplicates the first matching named deck entry once per copy", () => {
    const t = getReward("duplicate_named_card_X");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ name: "Event Alpha", copies: 2 }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "duplicateDeckEntry",
        args: ["deck-event-alpha", "dream_journey:duplicate_named_card_X"],
      },
      {
        method: "duplicateDeckEntry",
        args: ["deck-event-alpha", "dream_journey:duplicate_named_card_X"],
      },
    ]);
  });

  it("duplicate_named_card_X warns and skips when the named deck entry is missing", () => {
    const t = getReward("duplicate_named_card_X");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ name: "Event Alpha", copies: 2 }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("duplicate_random_predicate duplicates deterministic matching deck entry ids", () => {
    const t = getReward("duplicate_random_predicate");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ predicateId: "events", count: 2 }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "duplicateDeckEntry",
        args: ["deck-event-alpha", "dream_journey:duplicate_random_predicate"],
      },
      {
        method: "duplicateDeckEntry",
        args: ["deck-event-beta", "dream_journey:duplicate_random_predicate"],
      },
    ]);
  });

  it("duplicate_random_predicate warns and skips when no deck entries match", () => {
    const t = getReward("duplicate_random_predicate");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ predicateId: "events", count: 2 }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("purge_chosen_starters plans a bounded starter deck chooser", () => {
    const t = getReward("purge_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });

    expect(t.choosePlan?.({ count: 2 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: {
        starterOnly: true,
        entryIds: ["deck-starter-alpha", "deck-starter-beta"],
      },
      minPicks: 1,
      maxPicks: 2,
      title: "Choose starter cards to purge",
    });
  });

  it("purge_chosen_starters caps maxPicks when fewer eligible targets exist", () => {
    const t = getReward("purge_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });

    expect(t.viable({ count: 3 }, ctx)).toBe(true);
    expect(t.render({ count: 3 }, ctx)).toBe("Purge up to 3 chosen starter cards");
    expect(t.choosePlan?.({ count: 3 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: {
        starterOnly: true,
        entryIds: ["deck-starter-alpha"],
      },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose starter cards to purge",
    });
  });

  it("purge_chosen_starters removes each chosen starter entry", () => {
    const t = getReward("purge_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { count: 2 },
      ctx,
      mut,
      { kind: "card", entryIds: ["deck-starter-alpha", "deck-starter-beta"] },
    );

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-starter-alpha", "dream_journey:purge_chosen_starters"],
      },
      {
        method: "removeDeckEntry",
        args: ["deck-starter-beta", "dream_journey:purge_chosen_starters"],
      },
    ]);
  });

  it("purge_chosen_starters accepts fewer than count and mutates only selected entries", () => {
    const t = getReward("purge_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { count: 3 },
      ctx,
      mut,
      { kind: "card", entryIds: ["deck-starter-beta"] },
    );

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-starter-beta", "dream_journey:purge_chosen_starters"],
      },
    ]);
  });

  it.each([
    {
      name: "zero selections",
      resolution: { kind: "card" as const, entryIds: [] },
    },
    {
      name: "over-limit selections",
      resolution: { kind: "card" as const, entryIds: ["deck-starter-alpha", "deck-starter-beta"] },
      params: { count: 1 },
    },
    {
      name: "duplicate selections",
      resolution: { kind: "card" as const, entryIds: ["deck-starter-alpha", "deck-starter-alpha"] },
    },
    {
      name: "stale nonstarter entry",
      resolution: {
        kind: "card" as const,
        entryIds: ["deck-starter-alpha", "deck-event-alpha"],
      },
    },
  ])("purge_chosen_starters skips $name without mutation", ({
    resolution,
    params = { count: 2 },
  }) => {
    const t = getReward("purge_chosen_starters");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(params, ctx, mut, resolution);
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("replace_starter_via_draft plans only a rolled replacement chooser", () => {
    const t = getReward("replace_starter_via_draft");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });

    expect(t.render({}, ctx)).toBe("Replace a random starter card with 1 of 4 drafted cards");
    expect(t.choosePlan?.({}, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "rolled",
      rolledCardIds: ["starter-alpha", "starter-beta", "event-alpha", "event-beta"],
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a replacement card",
    });
  });

  it("replace_starter_via_draft removes the rolled starter and adds the chosen draft card", () => {
    const t = getReward("replace_starter_via_draft");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      {},
      ctx,
      mut,
      { kind: "card", entryIds: ["rolled:event-beta:3"], cardIds: ["event-beta"] },
    );

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-starter-alpha", "dream_journey:replace_starter_via_draft"],
      },
      {
        method: "addCardById",
        args: ["event-beta", "dream_journey:replace_starter_via_draft"],
      },
    ]);
  });

  it.each([
    {
      name: "wrong rolled candidate",
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
      resolution: {
        kind: "card" as const,
        entryIds: ["rolled:event-alpha:1"],
        cardIds: ["event-alpha"],
      },
    },
    {
      name: "missing starter",
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
      resolution: {
        kind: "card" as const,
        entryIds: ["rolled:event-beta:2"],
        cardIds: ["event-beta"],
      },
    },
  ])("replace_starter_via_draft skips $name without partial mutation", ({ deckEntries, resolution }) => {
    const t = getReward("replace_starter_via_draft");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({}, ctx, mut, resolution);
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("Draft and chosen dreamsign reward apply (Wave 2)", () => {
  it("draft_predicate_cards_from_4 plans rolled choices and adds the selected card", () => {
    const t = getReward("draft_predicate_cards_from_4");
    const ctx = buildContext({ cards: draftCardFixture() });

    expect(t.choosePlan?.({ predicateId: "events" }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "rolled",
      rolledCardIds: ["event-alpha", "event-beta", "event-delta", "event-gamma"],
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to draft",
    });

    const { mut, calls } = createRecordingMutations();
    t.apply(
      { predicateId: "events" },
      ctx,
      mut,
      { kind: "card", entryIds: ["rolled:event-delta:2"], cardIds: ["event-delta"] },
    );
    expect(calls).toEqual([
      {
        method: "addCardById",
        args: ["event-delta", "dream_journey:draft_predicate_cards_from_4"],
      },
    ]);
  });

  it("draft_2_predicate_cards_from_4 plans rolled choices and adds both selected cards", () => {
    const t = getReward("draft_2_predicate_cards_from_4");
    const ctx = buildContext({ cards: draftCardFixture() });

    expect(t.choosePlan?.({ predicateId: "events" }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "rolled",
      rolledCardIds: ["event-alpha", "event-delta", "event-beta", "event-gamma"],
      minPicks: 2,
      maxPicks: 2,
      title: "Choose cards to draft",
    });

    const { mut, calls } = createRecordingMutations();
    t.apply(
      { predicateId: "events" },
      ctx,
      mut,
      {
        kind: "card",
        entryIds: ["rolled:event-delta:1", "rolled:event-gamma:3"],
        cardIds: ["event-delta", "event-gamma"],
      },
    );
    expect(calls).toEqual([
      {
        method: "addCardById",
        args: ["event-delta", "dream_journey:draft_2_predicate_cards_from_4"],
      },
      {
        method: "addCardById",
        args: ["event-gamma", "dream_journey:draft_2_predicate_cards_from_4"],
      },
    ]);
  });

  it("take_any_from_predicate_choices plans optional rolled choices and adds selected cards only", () => {
    const t = getReward("take_any_from_predicate_choices");
    const ctx = buildContext({ cards: draftCardFixture() });

    expect(t.choosePlan?.({ predicateId: "events", choices: 4 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "rolled",
      rolledCardIds: ["event-alpha", "event-delta", "event-gamma", "event-beta"],
      minPicks: 0,
      maxPicks: 4,
      title: "Choose cards to take",
    });

    const { mut, calls } = createRecordingMutations();
    t.apply(
      { predicateId: "events", choices: 4 },
      ctx,
      mut,
      {
        kind: "card",
        entryIds: ["rolled:event-alpha:0", "rolled:event-gamma:2"],
        cardIds: ["event-alpha", "event-gamma"],
      },
    );
    expect(calls).toEqual([
      {
        method: "addCardById",
        args: ["event-alpha", "dream_journey:take_any_from_predicate_choices"],
      },
      {
        method: "addCardById",
        args: ["event-gamma", "dream_journey:take_any_from_predicate_choices"],
      },
    ]);
  });

  it("take_any_from_predicate_choices accepts an empty confirmed selection", () => {
    const t = getReward("take_any_from_predicate_choices");
    const ctx = buildContext({ cards: draftCardFixture() });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { predicateId: "events", choices: 4 },
      ctx,
      mut,
      { kind: "card", entryIds: [], cardIds: [] },
    );

    expect(calls).toEqual([]);
  });

  it.each([
    { name: "missing resolution", resolution: undefined },
    {
      name: "wrong rolled card id",
      resolution: { kind: "card" as const, entryIds: ["rolled:event-alpha:1"], cardIds: ["event-alpha"] },
    },
    {
      name: "duplicate rolled entry",
      resolution: {
        kind: "card" as const,
        entryIds: ["rolled:event-alpha:0", "rolled:event-alpha:0"],
        cardIds: ["event-alpha", "event-alpha"],
      },
    },
    {
      name: "malformed rolled entry",
      resolution: { kind: "card" as const, entryIds: ["rolled:event-alpha:0junk"], cardIds: ["event-alpha"] },
    },
  ])("take_any_from_predicate_choices skips $name without mutation", ({ resolution }) => {
    const t = getReward("take_any_from_predicate_choices");
    const ctx = buildContext({ cards: draftCardFixture() });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ predicateId: "events", choices: 4 }, ctx, mut, resolution);
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("draft_predicate_card_with_copies plans one rolled pick and adds the selected card for each copy", () => {
    const t = getReward("draft_predicate_card_with_copies");
    const ctx = buildContext({ cards: draftCardFixture() });

    expect(t.choosePlan?.({ predicateId: "events", copies: 3 }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "rolled",
      rolledCardIds: ["event-beta", "event-delta", "event-alpha", "event-gamma"],
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to draft",
    });

    const { mut, calls } = createRecordingMutations();
    t.apply(
      { predicateId: "events", copies: 3 },
      ctx,
      mut,
      { kind: "card", entryIds: ["rolled:event-beta:0"], cardIds: ["event-beta"] },
    );
    expect(calls).toEqual([
      {
        method: "addCardById",
        args: ["event-beta", "dream_journey:draft_predicate_card_with_copies"],
      },
      {
        method: "addCardById",
        args: ["event-beta", "dream_journey:draft_predicate_card_with_copies"],
      },
      {
        method: "addCardById",
        args: ["event-beta", "dream_journey:draft_predicate_card_with_copies"],
      },
    ]);
  });

  it("draft_predicate_card_with_transfiguration calls the composed transfigured add mutation", () => {
    const t = getReward("draft_predicate_card_with_transfiguration");
    const ctx = buildContext({ cards: draftCardFixture() });
    const params = { predicateId: "events", transfiguration: "Bronze" };

    expect(t.choosePlan?.(params, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "rolled",
      rolledCardIds: ["event-beta", "event-delta", "event-alpha", "event-gamma"],
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to draft",
    });

    const { mut, calls } = createRecordingMutations();
    t.apply(
      params,
      ctx,
      mut,
      { kind: "card", entryIds: ["rolled:event-delta:1"], cardIds: ["event-delta"] },
    );
    expect(calls).toEqual([
      {
        method: "addCardByIdWithTransfiguration",
        args: [
          "event-delta",
          "Bronze",
          "dream_journey:draft_predicate_card_with_transfiguration",
        ],
      },
    ]);
  });

  it("choose_1_of_X_dreamsigns plans rolled dreamsigns and adds the selected one", () => {
    const t = getReward("choose_1_of_X_dreamsigns");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      dreamsignPoolIds: ["ds-1", "ds-2"],
    });

    expect(t.choosePlan?.({ choices: 2 }, ctx, planningContext())).toEqual({
      kind: "dreamsign",
      requestId: "request:0",
      poolKind: "rolled",
      rolledDreamsignIds: ["ds-1", "ds-2"],
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to gain",
    });

    const { mut, calls } = createRecordingMutations();
    t.apply(
      { choices: 2 },
      ctx,
      mut,
      { kind: "dreamsign", indices: [1], dreamsignIds: ["ds-2"] },
    );
    expect(calls).toEqual([
      {
        method: "addDreamsign",
        args: [
          {
            id: "ds-2",
            name: "Name B",
            effectDescription: "Effect B",
            isBane: false,
          },
          "dream_journey:choose_1_of_X_dreamsigns",
          undefined,
        ],
      },
    ]);
  });

  it("gain_copy_of_chosen_dreamsign plans active dreamsigns and adds a copy of the chosen one", () => {
    const t = getReward("gain_copy_of_chosen_dreamsign");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
    });

    expect(t.choosePlan?.({}, ctx, planningContext())).toEqual({
      kind: "dreamsign",
      requestId: "request:0",
      poolKind: "active",
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to copy",
    });

    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, { kind: "dreamsign", indices: [0], dreamsignIds: ["ds-1"] });
    expect(calls).toEqual([
      {
        method: "addDreamsign",
        args: [
          {
            id: "ds-1",
            name: "Name A",
            effectDescription: "Effect A",
            isBane: false,
            imageName: "img-a",
            imageAlt: "alt-a",
          },
          "dream_journey:gain_copy_of_chosen_dreamsign",
          undefined,
        ],
      },
    ]);
  });

  it.each([
    { name: "missing resolution", resolution: undefined },
    {
      name: "stale active index",
      resolution: { kind: "dreamsign" as const, indices: [3], dreamsignIds: ["ds-2"] },
    },
    {
      name: "wrong active dreamsign id",
      resolution: { kind: "dreamsign" as const, indices: [1], dreamsignIds: ["ds-1"] },
    },
  ])("gain_copy_of_chosen_dreamsign skips $name without mutation", ({ resolution }) => {
    const t = getReward("gain_copy_of_chosen_dreamsign");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({}, ctx, mut, resolution);
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transform_dreamsign_to_named plans active dreamsigns and replaces the chosen one", () => {
    const t = getReward("transform_dreamsign_to_named");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }],
      dreamsignPoolIds: ["ds-1", "ds-2"],
    });

    expect(t.choosePlan?.({ name: "Name B" }, ctx, planningContext())).toEqual({
      kind: "dreamsign",
      requestId: "request:0",
      poolKind: "active",
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to transform",
    });

    const { mut, calls } = createRecordingMutations();
    t.apply(
      { name: "Name B" },
      ctx,
      mut,
      { kind: "dreamsign", indices: [0], dreamsignIds: ["ds-1"] },
    );
    expect(calls).toEqual([
      {
        method: "addDreamsign",
        args: [
          {
            id: "ds-2",
            name: "Name B",
            effectDescription: "Effect B",
            isBane: false,
          },
          "dream_journey:transform_dreamsign_to_named",
          0,
        ],
      },
    ]);
  });

  it("transform_dreamsign_to_named skips invalid target before removing the chosen dreamsign", () => {
    const t = getReward("transform_dreamsign_to_named");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }],
      dreamsignPoolIds: ["ds-1", "ds-2"],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(
        { name: "Missing Dreamsign" },
        ctx,
        mut,
        { kind: "dreamsign", indices: [0], dreamsignIds: ["ds-1"] },
      );
      expect(calls).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("Dreamsign reward apply (non-choice)", () => {
  it("gain_random_dreamsign records the deterministically rolled pool Dreamsign", () => {
    const t = getReward("gain_random_dreamsign");
    const dreamsigns = dreamsignFixture();
    const ctx = buildContext({
      dreamsigns,
      dreamsignPoolIds: ["ds-1", "ds-2"],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "addDreamsign",
        args: [
          {
            id: "ds-2",
            name: "Name B",
            effectDescription: "Effect B",
            isBane: false,
          },
          "dream_journey:gain_random_dreamsign",
          undefined,
        ],
      },
    ]);
  });

  it("gain_random_dreamsign warns and skips when the dreamsign pool is empty", () => {
    const t = getReward("gain_random_dreamsign");
    const ctx = buildContext({ dreamsigns: dreamsignFixture(), dreamsignPoolIds: [] });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({}, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("gain_named_dreamsign records addDreamsign with the named Dreamsign", () => {
    const t = getReward("gain_named_dreamsign");
    const dreamsigns = dreamsignFixture();
    const ctx = buildContext({ dreamsigns, dreamsignPoolIds: ["ds-1", "ds-2"] });
    const { mut, calls } = createRecordingMutations();
    t.apply({ name: "Name A" }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "addDreamsign",
        args: [
          {
            id: "ds-1",
            name: "Name A",
            effectDescription: "Effect A",
            isBane: false,
            imageName: "img-a",
            imageAlt: "alt-a",
          },
          "dream_journey:gain_named_dreamsign",
          undefined,
        ],
      },
    ]);
  });

  it("gain_named_dreamsign forwards optional image fields from the content raw payload", () => {
    // ds-1's raw carries image-name/image-alt; the conversion must surface
    // those so the prototype's Dreamsign-card renderer has them available.
    const t = getReward("gain_named_dreamsign");
    const dreamsigns = dreamsignFixture();
    const ctx = buildContext({ dreamsigns, dreamsignPoolIds: ["ds-1"] });
    const { mut, calls } = createRecordingMutations();
    t.apply({ name: "Name A" }, ctx, mut, undefined);
    const dreamsign = calls[0].args[0] as Dreamsign;
    expect(dreamsign.imageName).toBe("img-a");
    expect(dreamsign.imageAlt).toBe("alt-a");
  });

  it("gain_named_dreamsign warns and skips when no content dreamsign matches the name", () => {
    const t = getReward("gain_named_dreamsign");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      dreamsignPoolIds: ["ds-1", "ds-2"],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ name: "nope" }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("gain_copy_of_random_dreamsign records the deterministically rolled active-list dreamsign", () => {
    const t = getReward("gain_copy_of_random_dreamsign");
    const dreamsigns = dreamsignFixture();
    const ctx = buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-2" }, { dreamsignId: "ds-1" }],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "addDreamsign",
        args: [
          {
            id: "ds-2",
            name: "Name B",
            effectDescription: "Effect B",
            isBane: false,
          },
          "dream_journey:gain_copy_of_random_dreamsign",
          undefined,
        ],
      },
    ]);
  });

  it("gain_copy_of_random_dreamsign warns and skips when there are no active dreamsigns", () => {
    const t = getReward("gain_copy_of_random_dreamsign");
    const ctx = buildContext({ dreamsigns: dreamsignFixture(), activeDreamsigns: [] });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({}, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("gain_copy_of_random_dreamsign warns and skips when the active dreamsign's id is missing from content", () => {
    // Defensive: an active dreamsign whose id is not in the content bundle
    // cannot be projected into a quest-shape Dreamsign; apply should warn
    // and skip rather than emit a malformed record.
    const t = getReward("gain_copy_of_random_dreamsign");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-missing" }],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({}, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("add_site_to_dreamscape records the current-dreamscape route mutation", () => {
    const t = getReward("add_site_to_dreamscape");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ siteType: "Shop" }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "addSiteToDreamscape",
        args: ["current", "Shop", "dream_journey:add_site_to_dreamscape"],
      },
    ]);
  });

  it("add_site_to_dreamscape converts display site labels before recording", () => {
    const t = getReward("add_site_to_dreamscape");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ siteType: "Specialty Shop" }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "addSiteToDreamscape",
        args: ["current", "SpecialtyShop", "dream_journey:add_site_to_dreamscape"],
      },
    ]);
  });

  it("add_site_to_next_dreamscape records the next-dreamscape route mutation", () => {
    const t = getReward("add_site_to_next_dreamscape");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ siteType: "Essence" }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "addSiteToDreamscape",
        args: ["next", "Essence", "dream_journey:add_site_to_next_dreamscape"],
      },
    ]);
  });

  it("add_site_to_next_dreamscape converts display site labels before recording", () => {
    const t = getReward("add_site_to_next_dreamscape");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ siteType: "Dreamsign Offering" }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "addSiteToDreamscape",
        args: ["next", "DreamsignOffering", "dream_journey:add_site_to_next_dreamscape"],
      },
    ]);
  });

  it("replace_site_type records the route replacement mutation", () => {
    const t = getReward("replace_site_type");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ fromType: "Shop", toType: "Essence" }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "replaceSiteType",
        args: ["Shop", "Essence", "dream_journey:replace_site_type"],
      },
    ]);
  });

  it("replace_site_type converts display site labels before recording", () => {
    const t = getReward("replace_site_type");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply(
      { fromType: "Dreamsign Draft", toType: "Specialty Shop" },
      ctx,
      mut,
      undefined,
    );
    expect(calls).toEqual([
      {
        method: "replaceSiteType",
        args: ["DreamsignDraft", "SpecialtyShop", "dream_journey:replace_site_type"],
      },
    ]);
  });

  it("boost_site_appearance_chance records the route boost mutation", () => {
    const t = getReward("boost_site_appearance_chance");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ siteType: "Purge", percent: 20, dreamscapes: 2 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "boostSiteAppearance",
        args: ["Purge", 20, 2, "dream_journey:boost_site_appearance_chance"],
      },
    ]);
  });

  it("boost_site_appearance_chance converts display site labels before recording", () => {
    const t = getReward("boost_site_appearance_chance");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ siteType: "Dreamsign Draft", percent: 20, dreamscapes: 2 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "boostSiteAppearance",
        args: ["DreamsignDraft", 20, 2, "dream_journey:boost_site_appearance_chance"],
      },
    ]);
  });

  it("boost_site_appearance_chance defaults omitted dreamscapes to the spec duration", () => {
    const t = getReward("boost_site_appearance_chance");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ siteType: "Purge", percent: 30 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "boostSiteAppearance",
        args: ["Purge", 30, 3, "dream_journey:boost_site_appearance_chance"],
      },
    ]);
  });

  it("site label conversion warns and skips inherited property names", () => {
    const t = getReward("boost_site_appearance_chance");
    const ctx = buildContext();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ siteType: "toString", percent: 20, dreamscapes: 2 }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("toString"));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it.each([
    {
      id: "add_site_to_dreamscape",
      params: { siteType: "Unknown Site" },
    },
    {
      id: "add_site_to_next_dreamscape",
      params: { siteType: "Unknown Site" },
    },
    {
      id: "replace_site_type",
      params: { fromType: "Unknown Site", toType: "Shop" },
    },
    {
      id: "boost_site_appearance_chance",
      params: { siteType: "Unknown Site", percent: 20, dreamscapes: 2 },
    },
  ])("$id warns and skips unknown site labels", ({ id, params }) => {
    const t = getReward(id);
    const ctx = buildContext();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply(params, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown Site"));
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("Meta-compound reward apply", () => {
  it("meta_gain_2_rewards applies both sub-rewards in order", () => {
    const t = getReward("meta_gain_2_rewards");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      {
        subIds: ["gain_essence", "increase_max_essence"],
        subParams: [{ x: 30 }, { amount: 25 }],
      },
      ctx,
      mut,
      undefined,
    );

    expect(calls).toEqual([
      { method: "changeEssence", args: [30, "dream_journey:gain_essence"] },
      { method: "changeMaxEssence", args: [25, "dream_journey:increase_max_essence"] },
    ]);
  });
});

describe("Visual, battle-window-only, and dreamwell reward apply no-ops", () => {
  it.each([
    {
      id: "card_cost_reduction_for_X_battles",
      params: { predicateId: "event", amount: 1, battles: 3 },
      reason: "visual",
    },
    {
      id: "opening_hand_grant_for_X_battles",
      params: { cardName: "Event Alpha", battles: 3 },
      reason: "battle_window",
    },
    {
      id: "temporary_card_copy_for_X_battles",
      params: { cardName: "Event Alpha", battles: 3 },
      reason: "battle_window",
    },
    {
      id: "temporary_dreamsign_for_X_battles",
      params: { battles: 3 },
      reason: "battle_window",
    },
    {
      id: "set_starting_dreamwell_positive",
      params: { cardName: "Bright Well" },
      reason: "dreamwell",
    },
    {
      id: "shuffle_positive_dreamwell_cards",
      params: { cardName: "Bright Well", count: 2 },
      reason: "dreamwell",
    },
  ])("$id records one skipped-visual log and no mutation calls", ({ id, params, reason }) => {
    const t = getReward(id);
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();

    t.apply(params, ctx, mut, undefined);

    expect(calls).toEqual([]);
    const logs = getLogEntries();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: "dream_journey_skipped_visual",
      templateId: id,
      reason,
    });
  });
});
