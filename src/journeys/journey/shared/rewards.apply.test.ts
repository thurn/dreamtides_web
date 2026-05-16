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

import { describe, expect, it, vi } from "vitest";

import type { CardContent, ContentBundle, DreamsignContent } from "../../content/types";
import { createRecordingMutations } from "../../apply/testing/recordingMutations";
import type { JourneyContext, QuestStateProjection } from "../context";
import type { Dreamsign } from "../../../types/quest";

import { getReward } from "./rewards";

function buildContext(overrides: {
  essence?: number;
  maxEssence?: number;
  omens?: number;
  cards?: readonly CardContent[];
  deckEntries?: readonly {
    readonly cardId: string;
    readonly copies: number;
    readonly entryIds?: readonly string[];
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
});
