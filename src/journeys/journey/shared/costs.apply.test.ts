// Per-template `apply` tests for Resource costs (Task 9).
//
// Each test exercises one Resource cost template against the recording
// `JourneyMutations` double from `src/journeys/apply/testing/` and asserts the
// exact sequence of recorded mutation calls. Together the tests catch wiring
// errors that the (broader) costs.test.ts viability/lock suites cannot, such
// as a template calling `changeEssence(+x)` instead of `changeEssence(-x)`,
// or passing a wrong source label.
//
// Per-template-family one literal-value assertion is justified per the plan:
// random-range templates roll within the rolled bounds at apply time, so the
// only correctness signal is "the recorded arg lies inside [min,max]". Every
// other template's recorded args derive trivially from the params, so the
// test asserts the literal value (e.g. `-50` for `pay_essence` with `x=50`).
//
// The non-random-range tests double as smoke coverage for the `Cost.apply`
// signature (`(params, ctx, mut, chooserResolution?) => void`) by passing
// `undefined` for the chooser resolution.
//
// Per-template apply behaviour for the other cost families (banes, dreamsigns,
// cards, atlas/route, battle/shop, meta-compound, visual) lives in later
// per-task suites alongside Tasks 10-18.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CardContent, ContentBundle, DreamsignContent } from "../../content/types";
import { createRecordingMutations } from "../../apply/testing/recordingMutations";
import type { ChooserPlanningContext, ChooserResolution } from "../../apply/chooserPlan";
import { getLogEntries, resetLog } from "../../../logging";
import type { JourneyContext, QuestStateProjection } from "../context";

import { BANE_NAMES } from "./content";
import { getCost } from "./costs";

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
    seed: "costs-apply-test",
    resources: {
      essence: overrides.essence ?? 100,
      maxEssence: overrides.maxEssence ?? 200,
      omens: overrides.omens ?? 3,
      dreamscape: 0,
    },
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
      rarity: "common",
      cardType: "Event",
      energyCost: 2,
      spark: 2,
      cardNumber: 4,
      raw: {},
    },
  ];
}

// Minimal dreamsign-content fixture: two journey-internal `DreamsignContent`
// records. Tests use these for both the named-lookup paths (matching `name`)
// and active-list index resolution (matching `id`).
function dreamsignFixture(): readonly DreamsignContent[] {
  return [
    {
      id: "ds-1",
      name: "Name A",
      kind: "neutral",
      renderedText: "Effect A",
      raw: { id: "ds-1", name: "Name A", "effect-description": "Effect A" },
    },
    {
      id: "ds-2",
      name: "Name B",
      kind: "neutral",
      renderedText: "Effect B",
      raw: { id: "ds-2", name: "Name B", "effect-description": "Effect B" },
    },
    {
      id: "ds-3",
      name: "Name C",
      kind: "neutral",
      renderedText: "Effect C",
      raw: {
        id: "ds-3",
        name: "Name C",
        "effect-description": "Effect C",
        "image-name": "name-c.png",
        "image-alt": "Name C art",
      },
    },
  ];
}

// Smallest possible bane content fixture: one card per BANE_NAMES entry. The
// `id` is a synthetic UUID-shaped string so the apply tests can assert the
// cardId routed through `addBaneCardById` corresponds to the named bane.
function baneCardFixture(): readonly CardContent[] {
  return BANE_NAMES.map((name, i) => ({
    id: `bane-card-${name.toLowerCase()}-${String(i)}`,
    name,
    rarity: "common",
    cardType: "Event",
    energyCost: 0,
    spark: "",
    cardNumber: 9000 + i,
    raw: {},
  }));
}

describe("Resource cost apply", () => {
  it("pay_essence calls changeEssence with negative x and labeled source", () => {
    const t = getCost("pay_essence");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ x: 50 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeEssence", args: [-50, "dream_journey:pay_essence"] },
    ]);
  });

  it("pay_omens calls changeOmens with negative x", () => {
    const t = getCost("pay_omens");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ x: 2 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeOmens", args: [-2, "dream_journey:pay_omens"] },
    ]);
  });

  it("pay_max_essence calls changeMaxEssence with -maxEssence(ctx)", () => {
    // Per spec table: `mut.changeMaxEssence(-maxEssence(ctx), "...")`. With a
    // max-essence of 200, the template zeros the cap by subtracting the full
    // current value.
    const t = getCost("pay_max_essence");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeMaxEssence", args: [-200, "dream_journey:pay_max_essence"] },
    ]);
  });

  it("pay_essence_random_range rolls within [min,max] and calls changeEssence with the negated roll", () => {
    // Wave 1 applies the range cost via `Math.random`; we cannot pin the
    // literal roll. The contract is: a single `changeEssence` call whose
    // first arg is in [-max, -min] and whose source is the labeled string.
    const t = getCost("pay_essence_random_range");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ min: 30, max: 60 }, ctx, mut, undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("changeEssence");
    expect(calls[0].args[1]).toBe("dream_journey:pay_essence_random_range");
    const delta = calls[0].args[0] as number;
    expect(Number.isInteger(delta)).toBe(true);
    expect(delta).toBeGreaterThanOrEqual(-60);
    expect(delta).toBeLessThanOrEqual(-30);
  });

  it("pay_percent_essence floors essence * percent / 100 and negates", () => {
    // essence=100, percent=50 → floor(100 * 50 / 100) = 50, negated = -50.
    const t = getCost("pay_percent_essence");
    const ctx = buildContext({ essence: 100 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 50 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeEssence", args: [-50, "dream_journey:pay_percent_essence"] },
    ]);
  });

  it("pay_percent_essence floors (i.e. truncates) the partial-essence case", () => {
    // essence=33, percent=50 → floor(33 * 50 / 100) = floor(16.5) = 16.
    const t = getCost("pay_percent_essence");
    const ctx = buildContext({ essence: 33 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 50 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeEssence", args: [-16, "dream_journey:pay_percent_essence"] },
    ]);
  });

  it("pay_all_remaining_essence calls setEssence(0, ...)", () => {
    const t = getCost("pay_all_remaining_essence");
    const ctx = buildContext({ essence: 100 });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "setEssence", args: [0, "dream_journey:pay_all_remaining_essence"] },
    ]);
  });

  it("lose_max_essence calls changeMaxEssence with -p.amount", () => {
    const t = getCost("lose_max_essence");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ amount: 50 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeMaxEssence", args: [-50, "dream_journey:lose_max_essence"] },
    ]);
  });
});

describe("Battle-window cost apply", () => {
  it("battle_reward_reduction_flat records a flat battle reward modifier", () => {
    const t = getCost("battle_reward_reduction_flat");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ amount: 30, battles: 2 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "pushBattleRewardModifier",
        args: ["flat", 30, 2, "dream_journey:battle_reward_reduction_flat"],
      },
    ]);
  });

  it("battle_reward_reduction_percent records a percent battle reward modifier", () => {
    const t = getCost("battle_reward_reduction_percent");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 40, battles: 3 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "pushBattleRewardModifier",
        args: ["percent", 40, 3, "dream_journey:battle_reward_reduction_percent"],
      },
    ]);
  });
});

describe("Bane cost apply", () => {
  it("gain_random_banes makes exactly `count` addBaneCardById calls with bane-card ids", () => {
    // Random selection from BANE_NAMES uses Math.random in Wave 1; the test
    // contract is "made `count` calls, each cardId resolves to a CardContent
    // whose name is in BANE_NAMES" rather than pinning a deterministic name.
    const t = getCost("gain_random_banes");
    const cards = baneCardFixture();
    const ctx = buildContext({ cards });
    const { mut, calls } = createRecordingMutations();
    t.apply({ count: 2 }, ctx, mut, undefined);

    expect(calls).toHaveLength(2);
    const baneNameSet = new Set<string>(BANE_NAMES);
    const byId = new Map(cards.map((c) => [c.id, c]));
    for (const call of calls) {
      expect(call.method).toBe("addBaneCardById");
      expect(call.args[1]).toBe("dream_journey:gain_random_banes");
      const cardId = call.args[0] as string;
      const card = byId.get(cardId);
      expect(card).toBeDefined();
      expect(baneNameSet.has(card!.name)).toBe(true);
    }
  });

  it("gain_named_banes makes one addBaneCardById call with the named bane's cardId", () => {
    const t = getCost("gain_named_banes");
    const cards = baneCardFixture();
    const ctx = buildContext({ cards });
    const despair = cards.find((c) => c.name === "Despair");
    expect(despair).toBeDefined();

    const { mut, calls } = createRecordingMutations();
    t.apply({ baneName: "Despair", count: 1 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "addBaneCardById",
        args: [despair!.id, "dream_journey:gain_named_banes"],
      },
    ]);
  });

  it("gain_named_banes with count=3 makes three addBaneCardById calls for the named bane", () => {
    const t = getCost("gain_named_banes");
    const cards = baneCardFixture();
    const ctx = buildContext({ cards });
    const oblivion = cards.find((c) => c.name === "Oblivion");
    expect(oblivion).toBeDefined();

    const { mut, calls } = createRecordingMutations();
    t.apply({ baneName: "Oblivion", count: 3 }, ctx, mut, undefined);
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call).toEqual({
        method: "addBaneCardById",
        args: [oblivion!.id, "dream_journey:gain_named_banes"],
      });
    }
  });

  it("gain_named_banes warns and skips when the bane name is missing from content", () => {
    // Missing-content path: bane card not present in the bundle, so each
    // iteration should log a warn and skip the add call. The test asserts no
    // calls were recorded.
    const t = getCost("gain_named_banes");
    const ctx = buildContext({ cards: [] });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ baneName: "Despair", count: 2 }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("gain_named_banes_for_X_battles makes exactly one pushTemporaryBaneGrant call", () => {
    // The temporary-bane template is the only bane cost that does NOT add
    // bane cards at the apply layer; the underlying mutation handles the
    // card-addition AND modifier-recording in a single reducer.
    const t = getCost("gain_named_banes_for_X_battles");
    const ctx = buildContext({ cards: baneCardFixture() });
    const { mut, calls } = createRecordingMutations();
    t.apply({ baneName: "Despair", count: 1, battles: 3 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "pushTemporaryBaneGrant",
        args: ["Despair", 1, 3, "dream_journey:gain_named_banes_for_X_battles"],
      },
    ]);
  });

  // Regression: backlog/008. The runtime card catalog ships only `Nightmare`
  // as a bane card; the other 10 names in `BANE_NAMES` are documented but not
  // yet present as cards. The fix gates bane-rolling on `availableBaneNames`
  // so every bane-cost roll lands on a name whose card the apply step can
  // actually add. Without the fix, the random-roll path lands on a missing
  // name ~91% of the time and silently no-ops.
  describe("backlog/008: production-like catalog with only Nightmare as bane card", () => {
    function nightmareOnlyCards(): readonly CardContent[] {
      return [
        {
          id: "nightmare-card",
          name: "Nightmare",
          rarity: "Special",
          cardType: "Event",
          energyCost: 2,
          spark: "",
          cardNumber: 222,
          raw: {},
        },
      ];
    }

    it("gain_random_banes: every iteration adds the Nightmare bane card (no skipped rolls)", () => {
      const t = getCost("gain_random_banes");
      const ctx = buildContext({ cards: nightmareOnlyCards() });
      const { mut, calls } = createRecordingMutations();
      t.apply({ count: 5 }, ctx, mut, undefined);

      expect(calls).toHaveLength(5);
      for (const call of calls) {
        expect(call).toEqual({
          method: "addBaneCardById",
          args: ["nightmare-card", "dream_journey:gain_random_banes"],
        });
      }
    });

    it("gain_named_banes rollParams picks Nightmare when it is the only bane in the catalog", () => {
      const t = getCost("gain_named_banes");
      const ctx = buildContext({ cards: nightmareOnlyCards() });
      const draw = {
        seed: "regression-008",
        contentVersion: "test",
        rootJourneyIndex: 0,
      };
      const params = t.rollParams(ctx, draw) as {
        baneName: string;
        count: number;
      };
      expect(params.baneName).toBe("Nightmare");

      const { mut, calls } = createRecordingMutations();
      t.apply(params, ctx, mut, undefined);
      expect(calls.length).toBe(params.count);
      for (const call of calls) {
        expect(call).toEqual({
          method: "addBaneCardById",
          args: ["nightmare-card", "dream_journey:gain_named_banes"],
        });
      }
    });

    it("gain_named_banes_for_X_battles rollParams picks Nightmare, apply forwards to pushTemporaryBaneGrant", () => {
      const t = getCost("gain_named_banes_for_X_battles");
      const ctx = buildContext({ cards: nightmareOnlyCards() });
      const draw = {
        seed: "regression-008",
        contentVersion: "test",
        rootJourneyIndex: 0,
      };
      const params = t.rollParams(ctx, draw) as {
        baneName: string;
        count: number;
        battles: number;
      };
      expect(params.baneName).toBe("Nightmare");

      const { mut, calls } = createRecordingMutations();
      t.apply(params, ctx, mut, undefined);
      expect(calls).toEqual([
        {
          method: "pushTemporaryBaneGrant",
          args: [
            "Nightmare",
            params.count,
            params.battles,
            "dream_journey:gain_named_banes_for_X_battles",
          ],
        },
      ]);
    });

    it("bane gain costs decline when the catalog has zero bane cards", () => {
      const ctx = buildContext({ cards: [] });
      for (const id of [
        "gain_random_banes",
        "gain_named_banes",
        "gain_named_banes_for_X_battles",
      ] as const) {
        const t = getCost(id);
        const draw = { seed: id, contentVersion: "test", rootJourneyIndex: 0 };
        const params = t.rollParams(ctx, draw);
        expect(t.viable(params, ctx), id).toBe(false);
      }
    });
  });
});

describe("Card cost apply (non-choice)", () => {
  it("purge_named_card removes the first matching deck entry id", () => {
    const t = getCost("purge_named_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ cardName: "Event Alpha" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-alpha", "dream_journey:purge_named_card"],
      },
    ]);
  });

  it("purge_random_predicate_card removes the deterministically rolled matching deck entry", () => {
    const t = getCost("purge_random_predicate_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ predicateId: "events" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-beta", "dream_journey:purge_random_predicate_card"],
      },
    ]);
  });

  it("purge_all_duplicate_cards removes all but one entry id from each duplicate stack", () => {
    const t = getCost("purge_all_duplicate_cards");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "event-alpha",
          copies: 3,
          entryIds: ["deck-event-alpha-1", "deck-event-alpha-2", "deck-event-alpha-3"],
        },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-alpha-2", "dream_journey:purge_all_duplicate_cards"],
      },
      {
        method: "removeDeckEntry",
        args: ["deck-event-alpha-3", "dream_journey:purge_all_duplicate_cards"],
      },
    ]);
  });

  it("gain_random_cards_from_pool records exactly count catalog card additions", () => {
    const t = getCost("gain_random_cards_from_pool");
    const cards = cardFixture();
    const ctx = buildContext({ cards });
    const { mut, calls } = createRecordingMutations();
    t.apply({ count: 2 }, ctx, mut, undefined);

    expect(calls).toEqual([
      { method: "addCardById", args: ["event-alpha", "dream_journey:gain_random_cards_from_pool"] },
      { method: "addCardById", args: ["event-beta", "dream_journey:gain_random_cards_from_pool"] },
    ]);
    const catalogIds = new Set(cards.map((card) => card.id));
    expect(calls.every((call) => catalogIds.has(call.args[0] as string))).toBe(true);
  });

  it("transform_card_to_random_pool removes the named deck entry before adding a rolled catalog card", () => {
    const t = getCost("transform_card_to_random_pool");
    const cards = cardFixture();
    const ctx = buildContext({
      cards,
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ cardName: "Event Alpha" }, ctx, mut, undefined);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      method: "removeDeckEntry",
      args: ["deck-event-alpha", "dream_journey:transform_card_to_random_pool"],
    });
    expect(calls[1]).toEqual({
      method: "addCardById",
      args: ["starter-beta", "dream_journey:transform_card_to_random_pool"],
    });
    expect(new Set(cards.map((card) => card.id)).has(calls[1].args[0] as string)).toBe(true);
  });

  it("remove_transfiguration_from_card clears the first matching deck entry", () => {
    const t = getCost("remove_transfiguration_from_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "event-alpha",
          copies: 1,
          entryIds: ["deck-event-alpha"],
          entryTransfigurations: ["Empowered"],
        },
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ cardName: "Event Alpha" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["deck-event-alpha", null, "dream_journey:remove_transfiguration_from_card"],
      },
    ]);
  });

  it("remove_transfiguration_from_card clears a later transfigured copy when the first copy is untransfigured", () => {
    const t = getCost("remove_transfiguration_from_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "event-alpha",
          copies: 2,
          entryIds: ["deck-event-alpha-1", "deck-event-alpha-2"],
          entryTransfigurations: [null, "Empowered"],
        },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ cardName: "Event Alpha" }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["deck-event-alpha-2", null, "dream_journey:remove_transfiguration_from_card"],
      },
    ]);
  });

  it("remove_transfiguration_from_card warns and skips when the matching deck entry has null transfiguration", () => {
    const t = getCost("remove_transfiguration_from_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
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
      t.apply({ cardName: "Event Alpha" }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("no named deck entries for card name \"Event Alpha\" have a transfiguration"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("remove_transfiguration_from_card warns and skips when transfiguration state is absent", () => {
    const t = getCost("remove_transfiguration_from_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "event-alpha",
          copies: 1,
          entryIds: ["deck-event-alpha"],
        },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ cardName: "Event Alpha" }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("no named deck entries for card name \"Event Alpha\" have a transfiguration"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("remove_transfigurations_from_random_predicate clears deterministic matching deck entries", () => {
    const t = getCost("remove_transfigurations_from_random_predicate");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 1,
          entryIds: ["deck-starter-alpha"],
          entryTransfigurations: ["Amplified"],
        },
        {
          cardId: "event-alpha",
          copies: 1,
          entryIds: ["deck-event-alpha"],
          entryTransfigurations: ["Empowered"],
        },
        {
          cardId: "event-beta",
          copies: 1,
          entryIds: ["deck-event-beta"],
          entryTransfigurations: ["Attuned"],
        },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ predicateId: "events", count: 2 }, ctx, mut, undefined);

    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-starter-alpha",
          null,
          "dream_journey:remove_transfigurations_from_random_predicate",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-event-alpha",
          null,
          "dream_journey:remove_transfigurations_from_random_predicate",
        ],
      },
    ]);
  });

  it("remove_transfigurations_from_random_predicate resolves transfigured from entry state", () => {
    const t = getCost("remove_transfigurations_from_random_predicate");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        {
          cardId: "starter-alpha",
          copies: 1,
          entryIds: ["deck-starter-alpha"],
          entryTransfigurations: ["Amplified"],
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
          entryTransfigurations: ["Attuned"],
        },
      ],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ predicateId: "transfigured", count: 2 }, ctx, mut, undefined);

    expect(calls.map((call) => call.args[0]).sort()).toEqual([
      "deck-event-beta",
      "deck-starter-alpha",
    ]);
    expect(calls.every((call) => call.args[1] === null)).toBe(true);
  });

  it("gain_additional_starters records one starter catalog card addition", () => {
    const t = getCost("gain_additional_starters");
    const cards = cardFixture();
    const ctx = buildContext({ cards });
    const { mut, calls } = createRecordingMutations();
    t.apply({ count: 1 }, ctx, mut, undefined);

    expect(calls).toEqual([
      { method: "addCardById", args: ["starter-beta", "dream_journey:gain_additional_starters"] },
    ]);
    const starterIds = new Set(
      cards.filter((card) => card.rarity === "Starter").map((card) => card.id),
    );
    expect(starterIds.has(calls[0].args[0] as string)).toBe(true);
  });
});

describe("Chosen card cost planning and apply", () => {
  it("purge_chosen_predicate_card plans a single deck-card chooser filtered by predicate", () => {
    const t = getCost("purge_chosen_predicate_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });

    expect(t.choosePlan?.({ predicateId: "events" }, ctx, planningContext())).toEqual({
      kind: "card",
      requestId: "request:0",
      poolKind: "deck",
      deckFilter: { predicateId: "events" },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to purge",
    });
  });

  it("purge_chosen_predicate_card removes the chosen deck entry", () => {
    const t = getCost("purge_chosen_predicate_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply({ predicateId: "events" }, ctx, mut, {
      kind: "card",
      entryIds: ["deck-event-alpha"],
    });

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-alpha", "dream_journey:purge_chosen_predicate_card"],
      },
    ]);
  });

  it("purge_chosen_predicate_card skips when chooser resolution is missing", () => {
    const t = getCost("purge_chosen_predicate_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [{ cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] }],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply({ predicateId: "events" }, ctx, mut, undefined, planningContext());

    expect(calls).toEqual([]);
  });

  it("purge_chosen_predicate_card skips when the chosen deck entry does not match the predicate", () => {
    const t = getCost("purge_chosen_predicate_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();

      t.apply({ predicateId: "events" }, ctx, mut, {
        kind: "card",
        entryIds: ["deck-starter-beta"],
      });

      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("purge_chosen_predicate_card skips when chooser card id does not match the chosen entry", () => {
    const t = getCost("purge_chosen_predicate_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();

      t.apply({ predicateId: "events" }, ctx, mut, {
        kind: "card",
        entryIds: ["deck-event-alpha"],
        cardIds: ["starter-alpha"],
      });

      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("purge_chosen_predicate_card skips when a single-pick chooser returns multiple entries", () => {
    const t = getCost("purge_chosen_predicate_card");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();

      t.apply({ predicateId: "events" }, ctx, mut, {
        kind: "card",
        entryIds: ["deck-event-alpha", "deck-event-beta"],
        cardIds: ["event-alpha", "event-beta"],
      });

      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("draw_X_purge_chosen plans a rolled deterministic subset of concrete deck entries", () => {
    const t = getCost("draw_X_purge_chosen");
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
      rolledCardIds: ["event-beta", "starter-beta", "starter-alpha"],
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a drawn card to purge",
    });
  });

  it("draw_X_purge_chosen removes the chosen drawn deck entry", () => {
    const t = getCost("draw_X_purge_chosen");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply({ drawCount: 2 }, ctx, mut, { kind: "card", entryIds: ["deck-event-beta"] });

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-event-beta", "dream_journey:draw_X_purge_chosen"],
      },
    ]);
  });

  it("draw_X_purge_chosen maps a rolled chooser selection back to the drawn deck entry", () => {
    const t = getCost("draw_X_purge_chosen");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      { drawCount: 3 },
      ctx,
      mut,
      { kind: "card", entryIds: ["rolled:starter-beta:1"], cardIds: ["starter-beta"] },
    );

    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["deck-starter-beta", "dream_journey:draw_X_purge_chosen"],
      },
    ]);
  });

  it("draw_X_purge_chosen skips when the chosen concrete entry is outside the rolled subset", () => {
    const t = getCost("draw_X_purge_chosen");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();

      t.apply(
        { drawCount: 3 },
        ctx,
        mut,
        { kind: "card", entryIds: ["deck-event-alpha"], cardIds: ["event-alpha"] },
      );

      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it.each([
    {
      name: "malformed rolled chooser id",
      resolution: { kind: "card" as const, entryIds: ["rolled:starter-beta:1junk"], cardIds: ["starter-beta"] },
    },
    {
      name: "rolled chooser id with mismatched encoded card id",
      resolution: { kind: "card" as const, entryIds: ["rolled:event-alpha:1"], cardIds: ["starter-beta"] },
    },
  ])("draw_X_purge_chosen skips $name", ({ resolution }) => {
    const t = getCost("draw_X_purge_chosen");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [
        { cardId: "starter-alpha", copies: 1, entryIds: ["deck-starter-alpha"] },
        { cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] },
        { cardId: "event-beta", copies: 1, entryIds: ["deck-event-beta"] },
        { cardId: "starter-beta", copies: 1, entryIds: ["deck-starter-beta"] },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();

      t.apply({ drawCount: 3 }, ctx, mut, resolution);

      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("draw_X_purge_chosen skips when chooser resolution is missing", () => {
    const t = getCost("draw_X_purge_chosen");
    const ctx = buildContext({
      cards: cardFixture(),
      deckEntries: [{ cardId: "event-alpha", copies: 1, entryIds: ["deck-event-alpha"] }],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply({ drawCount: 1 }, ctx, mut, undefined, planningContext());

    expect(calls).toEqual([]);
  });
});

describe("Dreamsign cost apply (non-choice)", () => {
  it("purge_named_dreamsign removes the matching active dreamsign by index", () => {
    // active=[ds-1, ds-2] with ds-1.name = "Name A"; the named lookup must
    // resolve to active-list index 0.
    const t = getCost("purge_named_dreamsign");
    const dreamsigns = dreamsignFixture();
    const ctx = buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ name: "Name A" }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "removeDreamsign", args: [0, "dream_journey:purge_named_dreamsign"] },
    ]);
  });

  it("purge_named_dreamsign resolves index against active list ordering", () => {
    // The named dreamsign sits at active-list position 1; the recorded index
    // must reflect that ordering rather than the content-bundle ordering.
    const t = getCost("purge_named_dreamsign");
    const dreamsigns = dreamsignFixture();
    const ctx = buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-2" }, { dreamsignId: "ds-1" }],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({ name: "Name A" }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "removeDreamsign", args: [1, "dream_journey:purge_named_dreamsign"] },
    ]);
  });

  it("purge_named_dreamsign warns and skips when no active dreamsign matches", () => {
    const t = getCost("purge_named_dreamsign");
    const dreamsigns = dreamsignFixture();
    const ctx = buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-2" }],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();
      t.apply({ name: "Name A" }, ctx, mut, undefined);
      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("purge_random_dreamsign removes the deterministically rolled active dreamsign", () => {
    const t = getCost("purge_random_dreamsign");
    const dreamsigns = dreamsignFixture();
    const ctx = buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
    });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "removeDreamsign", args: [1, "dream_journey:purge_random_dreamsign"] },
    ]);
  });

  it("purge_random_dreamsign warns and skips when there are no active dreamsigns", () => {
    const t = getCost("purge_random_dreamsign");
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

  it("remove_shop_sites_from_next_dreamscapes records the route mutation", () => {
    const t = getCost("remove_shop_sites_from_next_dreamscapes");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ dreamscapes: 2 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "removeSiteTypeFromNextDreamscapes",
        args: ["Shop", 2, "dream_journey:remove_shop_sites_from_next_dreamscapes"],
      },
    ]);
  });

  it("remove_dreamsign_sites_from_next_dreamscapes records the route mutation", () => {
    const t = getCost("remove_dreamsign_sites_from_next_dreamscapes");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ dreamscapes: 3 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "removeSiteTypeFromNextDreamscapes",
        args: [
          "DreamsignOffering",
          3,
          "dream_journey:remove_dreamsign_sites_from_next_dreamscapes",
        ],
      },
    ]);
  });
});

describe("Chosen dreamsign cost planning and apply", () => {
  it("purge_chosen_dreamsign plans a single active-dreamsign chooser", () => {
    const t = getCost("purge_chosen_dreamsign");
    const dreamsigns = dreamsignFixture();
    const ctx = buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
    });

    expect(t.choosePlan?.({}, ctx, planningContext())).toEqual({
      kind: "dreamsign",
      requestId: "request:0",
      poolKind: "active",
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to purge",
    });
  });

  it("purge_chosen_dreamsign removes the chosen active dreamsign index", () => {
    const t = getCost("purge_chosen_dreamsign");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply({}, ctx, mut, { kind: "dreamsign", indices: [1], dreamsignIds: ["ds-2"] });

    expect(calls).toEqual([
      { method: "removeDreamsign", args: [1, "dream_journey:purge_chosen_dreamsign"] },
    ]);
  });

  it("purge_chosen_dreamsign skips when chooser resolution is missing", () => {
    const t = getCost("purge_chosen_dreamsign");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply({}, ctx, mut, undefined, planningContext());

    expect(calls).toEqual([]);
  });

  it("purge_chosen_dreamsign skips when chooser id does not match the chosen index", () => {
    const t = getCost("purge_chosen_dreamsign");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();

      t.apply({}, ctx, mut, { kind: "dreamsign", indices: [1], dreamsignIds: ["ds-1"] });

      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("purge_chosen_dreamsign skips when a single-pick chooser returns multiple indices", () => {
    const t = getCost("purge_chosen_dreamsign");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();

      t.apply({}, ctx, mut, {
        kind: "dreamsign",
        indices: [0, 1],
        dreamsignIds: ["ds-1", "ds-2"],
      });

      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transform_dreamsign_to_random plans a single active-dreamsign chooser", () => {
    const t = getCost("transform_dreamsign_to_random");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
      dreamsignPoolIds: ["ds-3"],
    });

    expect(t.choosePlan?.({}, ctx, planningContext())).toEqual({
      kind: "dreamsign",
      requestId: "request:0",
      poolKind: "active",
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to transform",
    });
  });

  it("transform_dreamsign_to_random replaces the chosen dreamsign with a rolled pool dreamsign", () => {
    const t = getCost("transform_dreamsign_to_random");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
      dreamsignPoolIds: ["ds-3"],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply({}, ctx, mut, { kind: "dreamsign", indices: [0], dreamsignIds: ["ds-1"] });

    expect(calls).toEqual([
      {
        method: "addDreamsign",
        args: [
          {
            id: "ds-3",
            name: "Name C",
            effectDescription: "Effect C",
            imageName: "name-c.png",
            imageAlt: "Name C art",
            isBane: false,
          },
          "dream_journey:transform_dreamsign_to_random",
          0,
        ],
      },
    ]);
  });

  it("transform_dreamsign_to_random is not viable without a valid replacement pool entry", () => {
    const t = getCost("transform_dreamsign_to_random");
    const dreamsigns = dreamsignFixture();

    expect(t.viable({}, buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-1" }],
      dreamsignPoolIds: [],
    }))).toBe(false);
    expect(t.viable({}, buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-1" }],
      dreamsignPoolIds: ["missing-ds"],
    }))).toBe(false);
    expect(t.viable({}, buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-1" }],
      dreamsignPoolIds: ["ds-3"],
    }))).toBe(true);
    expect(t.choosePlan?.({}, buildContext({
      dreamsigns,
      activeDreamsigns: [{ dreamsignId: "ds-1" }],
      dreamsignPoolIds: [],
    }), planningContext())).toBeUndefined();
  });

  it("transform_dreamsign_to_random skips without partial mutation when chooser id does not match the chosen index", () => {
    const t = getCost("transform_dreamsign_to_random");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }, { dreamsignId: "ds-2" }],
      dreamsignPoolIds: ["ds-3"],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mut, calls } = createRecordingMutations();

      t.apply({}, ctx, mut, { kind: "dreamsign", indices: [0], dreamsignIds: ["ds-2"] });

      expect(calls).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("transform_dreamsign_to_random skips when chooser resolution is missing", () => {
    const t = getCost("transform_dreamsign_to_random");
    const ctx = buildContext({
      dreamsigns: dreamsignFixture(),
      activeDreamsigns: [{ dreamsignId: "ds-1" }],
      dreamsignPoolIds: ["ds-2"],
    });
    const { mut, calls } = createRecordingMutations();

    t.apply({}, ctx, mut, undefined, planningContext());

    expect(calls).toEqual([]);
  });
});

describe("Meta-compound cost apply", () => {
  it("meta_pay_2_costs applies both sub-costs in order", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = buildContext({ essence: 100, omens: 3 });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      {
        subIds: ["pay_essence", "pay_omens"],
        subParams: [{ x: 20 }, { x: 2 }],
      },
      ctx,
      mut,
      undefined,
    );

    expect(calls).toEqual([
      { method: "changeEssence", args: [-20, "dream_journey:pay_essence"] },
      { method: "changeOmens", args: [-2, "dream_journey:pay_omens"] },
    ]);
  });

  it("meta_pay_2_costs applies percent essence costs to essence remaining after finite costs", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = buildContext({ essence: 100 });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      {
        subIds: ["pay_essence", "pay_percent_essence"],
        subParams: [{ x: 60 }, { percent: 75 }],
      },
      ctx,
      mut,
      undefined,
    );

    expect(calls).toEqual([
      { method: "changeEssence", args: [-60, "dream_journey:pay_essence"] },
      { method: "changeEssence", args: [-30, "dream_journey:pay_percent_essence"] },
    ]);
  });

  it("meta_pay_2_costs applies percent essence costs to zero after all-remaining costs", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = buildContext({ essence: 100 });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      {
        subIds: ["pay_all_remaining_essence", "pay_percent_essence"],
        subParams: [{}, { percent: 75 }],
      },
      ctx,
      mut,
      undefined,
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      method: "setEssence",
      args: [0, "dream_journey:pay_all_remaining_essence"],
    });
    expect(calls[1].method).toBe("changeEssence");
    expect(Object.is(calls[1].args[0], -0)).toBe(true);
    expect(calls[1].args[1]).toBe("dream_journey:pay_percent_essence");
  });

  it("meta_pay_2_costs applies pay_max_essence to max essence remaining after max loss", () => {
    const t = getCost("meta_pay_2_costs");
    const ctx = buildContext({ maxEssence: 100 });
    const { mut, calls } = createRecordingMutations();

    t.apply(
      {
        subIds: ["lose_max_essence", "pay_max_essence"],
        subParams: [{ amount: 25 }, {}],
      },
      ctx,
      mut,
      undefined,
    );

    expect(calls).toEqual([
      { method: "changeMaxEssence", args: [-25, "dream_journey:lose_max_essence"] },
      { method: "changeMaxEssence", args: [-75, "dream_journey:pay_max_essence"] },
    ]);
  });
});

describe("Visual and dreamwell cost apply no-ops", () => {
  it.each([
    {
      id: "set_starting_dreamwell_negative",
      params: { cardName: "Shadow Well", battles: 2 },
      reason: "dreamwell",
    },
    {
      id: "shuffle_negative_dreamwell_cards",
      params: { cardName: "Shadow Well", count: 2, battles: 2 },
      reason: "dreamwell",
    },
  ])("$id records one skipped-visual log and no mutation calls", ({ id, params, reason }) => {
    const t = getCost(id);
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
