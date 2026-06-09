import { describe, expect, it } from "vitest";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  MERCHANT_REWARD_BUILDERS,
  buildMerchantRewardCatalog,
  buildMerchantRewardWithBuilder,
  buildMerchantRewardsForNeed,
  resolveMerchantChoice,
} from "./rewardCatalog";
import type { CardData } from "../../types/cards";
import type { DreamsignTemplate } from "../../types/content";
import type {
  MerchantApplyPayload,
  MerchantContext,
  MerchantNeed,
  MerchantSupportMeta,
} from "../types";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsign,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";

const UUIDS = {
  owned: "20000000-0000-4000-8000-000000000001",
  weak: "20000000-0000-4000-8000-000000000002",
  highCost: "20000000-0000-4000-8000-000000000003",
  supportA: "20000000-0000-4000-8000-000000000004",
  supportB: "20000000-0000-4000-8000-000000000005",
  supportC: "20000000-0000-4000-8000-000000000006",
  supportD: "20000000-0000-4000-8000-000000000007",
  supportE: "20000000-0000-4000-8000-000000000008",
  supportF: "20000000-0000-4000-8000-000000000009",
  starter: "20000000-0000-4000-8000-000000000010",
  special: "20000000-0000-4000-8000-000000000011",
} as const;

function card(
  id: string,
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return makeMerchantTestCard({
    id,
    cardNumber,
    name: `Catalog Fixture ${cardNumber}`,
    cardType: "Character",
    energyCost: 1,
    spark: 1,
    renderedText: "Draw a card.",
    ...overrides,
  });
}

function dreamsign(
  id: string,
  overrides: Partial<DreamsignTemplate> = {},
): DreamsignTemplate {
  return {
    ...makeMerchantTestDreamsignTemplate({
      id,
      name: `Catalog Sign ${id}`,
      effectDescription: "Draw a card at the start of each dreamscape.",
    }),
    ...overrides,
  };
}

function contextFor(options: {
  cards: readonly CardData[];
  deckCards?: readonly CardData[];
  dreamsignTemplates?: readonly DreamsignTemplate[];
  heldDreamsignIds?: readonly string[];
  supportMetaByUuid?: ReadonlyMap<string, MerchantSupportMeta>;
}): MerchantContext {
  const deckCards = options.deckCards ?? [options.cards[0]].filter(Boolean);
  const base = buildMerchantContext({
    questState: makeMerchantTestQuestState({
      deck: deckCards.map((deckCard, index) =>
        makeMerchantTestDeckEntry({
          entryId: `entry-${index + 1}`,
          cardNumber: deckCard.cardNumber,
        }),
      ),
      dreamsigns: (options.heldDreamsignIds ?? []).map((id) =>
        makeMerchantTestDreamsign({ id }),
      ),
    }),
    questContent: makeMerchantTestContent({
      cards: options.cards,
      dreamsignTemplates: options.dreamsignTemplates ?? [],
    }),
    site: makeMerchantTestSite(),
  });
  return {
    ...base,
    supportMetaByUuid: options.supportMetaByUuid ?? base.supportMetaByUuid,
  };
}

function missingRoleNeed(
  compatibleRewardBuilderIds: readonly string[] = ["grant_support_card"],
): MerchantNeed {
  return {
    needId: "need:missing-role:draw",
    needType: "theme",
    needKind: "missing_role",
    label: "Needs draw",
    score: 0.7,
    severity: 0.7,
    confidence: 1,
    observation: {
      summary: "The deck is short on draw.",
      roleLabel: "draw",
    },
    compatibleRewardBuilderIds,
    themeId: "draw",
    role: "draw",
    support: {
      theme: "draw",
      supportCount: 0,
      requiredCount: 2,
    },
  };
}

function dreamsignGapNeed(
  compatibleRewardBuilderIds: readonly string[] = ["grant_dreamsign"],
): MerchantNeed {
  return {
    needId: "need:dreamsign-gap:available-sign",
    needType: "theme",
    needKind: "dreamsign_gap",
    label: "Could use a Dreamsign",
    score: 0.4,
    severity: 0.4,
    confidence: 0.8,
    observation: { summary: "A Dreamsign could add passive support." },
    compatibleRewardBuilderIds,
    themeId: "dreamsign",
    dreamsignId: "sign-open-a",
  };
}

function weakCardNeed(): MerchantNeed {
  return {
    needId: "need:weak-card:entry-1",
    needType: "card",
    needKind: "weak_card",
    label: "Weak starter",
    score: 0.7,
    severity: 0.7,
    confidence: 0.9,
    observation: { summary: "Weak starter contributes less than the deck." },
    compatibleRewardBuilderIds: ["purge_weak_card", "replace_weak_with_fit"],
    cardUuid: UUIDS.weak,
    cardNumber: 2,
    entryId: "entry-1",
    references: [
      {
        cardUuid: UUIDS.weak,
        cardNumber: 2,
        entryId: "entry-1",
        displayName: "Weak Starter",
      },
    ],
  };
}

function underSupportedPayoffNeed(): MerchantNeed {
  return {
    needId: "need:under-supported-payoff:entry-1",
    needType: "card",
    needKind: "under_supported_payoff",
    label: "Owned Draw needs abandon support",
    score: 0.9,
    severity: 0.9,
    confidence: 0.95,
    observation: {
      summary: "Owned Draw is asking for more abandon support.",
      theme: "abandon",
    },
    compatibleRewardBuilderIds: ["grant_support_card", "duplicate_keystone"],
    cardUuid: UUIDS.owned,
    cardNumber: 1,
    entryId: "entry-1",
    references: [
      {
        cardUuid: UUIDS.owned,
        cardNumber: 1,
        entryId: "entry-1",
        displayName: "Owned Draw",
      },
    ],
    themeId: "abandon",
    support: {
      theme: "abandon",
      tier: 3,
      supportCount: 0,
      adequacy: 0,
    },
  };
}

function upgradeNeed(previewCard: CardData): MerchantNeed {
  return {
    needId: "need:upgrade-target:entry-1",
    needType: "card",
    needKind: "upgrade_target",
    label: "Viridian upgrade",
    score: 0.8,
    severity: 0.8,
    confidence: 1,
    observation: { summary: "Viridian improves the high-cost card." },
    compatibleRewardBuilderIds: ["transfigure_card"],
    cardUuid: UUIDS.highCost,
    cardNumber: 3,
    entryId: "entry-1",
    references: [
      {
        cardUuid: UUIDS.highCost,
        cardNumber: 3,
        entryId: "entry-1",
        displayName: "High Cost Event",
      },
    ],
    projection: {
      transfiguration: "Viridian",
      description: "Reduce this card's cost.",
      metric: { label: "cost", from: 5, to: 3 },
      previewCard,
    },
  };
}

function supportCards(): CardData[] {
  return [
    card(UUIDS.owned, 1, { name: "Owned Draw" }),
    card(UUIDS.weak, 2, {
      name: "Weak Starter",
      isStarter: true,
      rarity: "Starter",
      renderedText: "",
    }),
    card(UUIDS.highCost, 3, {
      name: "High Cost Event",
      cardType: "Event",
      energyCost: 5,
      spark: null,
    }),
    card(UUIDS.supportA, 4, { name: "Support A", rarity: "Legendary" }),
    card(UUIDS.supportB, 5, { name: "Support B" }),
    card(UUIDS.supportC, 6, { name: "Support C" }),
    card(UUIDS.supportD, 7, { name: "Support D" }),
    card(UUIDS.supportE, 8, { name: "Support E" }),
    card(UUIDS.supportF, 9, { name: "Support F" }),
    card(UUIDS.starter, 10, {
      name: "Starter Excluded",
      isStarter: true,
      rarity: "Starter",
    }),
    card(UUIDS.special, 11, {
      name: "Special Excluded",
      rarity: "Special",
    }),
  ];
}

function supportMeta(): ReadonlyMap<string, MerchantSupportMeta> {
  return new Map(
    [
      UUIDS.owned,
      UUIDS.supportA,
      UUIDS.supportB,
      UUIDS.supportC,
      UUIDS.supportD,
      UUIDS.supportE,
      UUIDS.supportF,
      UUIDS.starter,
      UUIDS.special,
    ].map((uuid) => [
      uuid,
      {
        supports: ["draw"],
        needs: [],
      },
    ]),
  );
}

function payloadsFrom(payload: MerchantApplyPayload): MerchantApplyPayload[] {
  if (payload.kind !== "composite") return [payload];
  return [payload, ...payload.children.flatMap(payloadsFrom)];
}

describe("rewardCatalog", () => {
  it("grant_support_card returns 3-5 chooser candidates when matching catalog cards exist", () => {
    const context = contextFor({
      cards: supportCards(),
      supportMetaByUuid: supportMeta(),
    });

    const reward = buildMerchantRewardWithBuilder(
      context,
      missingRoleNeed(),
      "grant_support_card",
    );

    expect(reward?.builderId).toBe("grant_support_card");
    expect(reward?.choiceRequest?.candidates.length).toBeGreaterThanOrEqual(3);
    expect(reward?.choiceRequest?.candidates.length).toBeLessThanOrEqual(5);
    expect(reward?.choiceRequest?.candidates.every((candidate) =>
      candidate.applyPayload.kind === "add_catalog_card",
    )).toBe(true);
  });

  it("grant_support_card excludes starter, special, and already-owned UUIDs by default", () => {
    const context = contextFor({
      cards: supportCards(),
      supportMetaByUuid: supportMeta(),
    });

    const reward = buildMerchantRewardWithBuilder(
      context,
      missingRoleNeed(),
      "grant_support_card",
    );
    const cardUuids =
      reward?.choiceRequest?.candidates.map((candidate) => candidate.cardUuid) ?? [];

    expect(cardUuids).not.toContain(UUIDS.owned);
    expect(cardUuids).not.toContain(UUIDS.weak);
    expect(cardUuids).not.toContain(UUIDS.starter);
    expect(cardUuids).not.toContain(UUIDS.special);
  });

  it("does not add resource rewards to a missing draw need by fallback", () => {
    const context = contextFor({
      cards: supportCards(),
      supportMetaByUuid: supportMeta(),
    });

    const rewards = buildMerchantRewardsForNeed(
      context,
      missingRoleNeed(["grant_support_card"]),
    );

    expect(rewards.map((reward) => reward.builderId)).toEqual([
      "grant_support_card",
    ]);
  });

  it("builds resource rewards when a need explicitly allows them", () => {
    const context = contextFor({
      cards: supportCards(),
      supportMetaByUuid: supportMeta(),
    });

    const rewards = buildMerchantRewardsForNeed(
      context,
      missingRoleNeed(["gain_essence", "raise_essence_cap"]),
    );

    expect(rewards.map((reward) => reward.builderId)).toEqual([
      "gain_essence",
      "raise_essence_cap",
    ]);
    expect(rewards.every((reward) => reward.applyPayload !== undefined)).toBe(true);
  });

  it("grant_exact_card returns the highest-ranked direct catalog card grant", () => {
    const context = contextFor({
      cards: supportCards(),
      supportMetaByUuid: supportMeta(),
    });

    const reward = buildMerchantRewardWithBuilder(
      context,
      missingRoleNeed(["grant_exact_card"]),
      "grant_exact_card",
    );

    expect(reward).toMatchObject({
      builderId: "grant_exact_card",
      answersNeedIds: ["need:missing-role:draw"],
      applyPayload: {
        kind: "add_catalog_card",
        cardUuid: UUIDS.supportA,
        cardNumber: 4,
      },
    });
    expect(reward?.choiceRequest).toBeUndefined();
    expect(reward?.gameObjects).toEqual([
      expect.objectContaining({
        objectType: "catalogCard",
        cardUuid: UUIDS.supportA,
      }),
    ]);
    expect(reward?.valueEssence).toBeGreaterThan(0);
  });

  it("grant_exact_card does not trigger for low-confidence broad needs", () => {
    const context = contextFor({
      cards: supportCards(),
      supportMetaByUuid: supportMeta(),
    });
    const lowConfidenceNeed = {
      ...missingRoleNeed(["grant_exact_card"]),
      confidence: 0.6,
    };

    expect(
      buildMerchantRewardWithBuilder(
        context,
        lowConfidenceNeed,
        "grant_exact_card",
      ),
    ).toBeNull();
  });

  it("grant_dreamsign returns 2-4 non-held candidates", () => {
    const context = contextFor({
      cards: supportCards(),
      dreamsignTemplates: [
        dreamsign("sign-held"),
        dreamsign("sign-open-a"),
        dreamsign("sign-open-b"),
        dreamsign("sign-open-c"),
        dreamsign("sign-open-d"),
      ],
      heldDreamsignIds: ["sign-held"],
    });

    const reward = buildMerchantRewardWithBuilder(
      context,
      dreamsignGapNeed(),
      "grant_dreamsign",
    );
    const dreamsignIds =
      reward?.choiceRequest?.candidates.map((candidate) => candidate.dreamsignId) ??
      [];

    expect(dreamsignIds.length).toBeGreaterThanOrEqual(2);
    expect(dreamsignIds.length).toBeLessThanOrEqual(4);
    expect(dreamsignIds).not.toContain("sign-held");
    expect(reward?.choiceRequest?.candidates.every((candidate) =>
      candidate.applyPayload.kind === "add_dreamsign",
    )).toBe(true);
  });

  it("transfigure_card renders a direct game object with preview metadata and payload", () => {
    const sourceCard = card(UUIDS.highCost, 3, {
      cardType: "Event",
      energyCost: 5,
      spark: null,
    });
    const previewCard = { ...sourceCard, energyCost: 3 };
    const context = contextFor({
      cards: [sourceCard],
      deckCards: [sourceCard],
    });

    const reward = buildMerchantRewardWithBuilder(
      context,
      upgradeNeed(previewCard),
      "transfigure_card",
    );

    expect(reward).toMatchObject({
      builderId: "transfigure_card",
      applyPayload: {
        kind: "transfigure_deck_entry",
        entryId: "entry-1",
        transfiguration: "Viridian",
      },
    });
    expect(reward?.gameObjects[0]).toMatchObject({
      objectType: "deckCard",
      entryId: "entry-1",
      badge: { label: "Viridian", detail: "5 -> 3" },
      previewCard: { energyCost: 3 },
    });
  });

  it("duplicate_keystone does not claim to answer upgrade targets", () => {
    const sourceCard = card(UUIDS.highCost, 3, {
      cardType: "Event",
      energyCost: 5,
      spark: null,
    });
    const previewCard = { ...sourceCard, energyCost: 3 };
    const context = contextFor({
      cards: [sourceCard],
      deckCards: [sourceCard],
    });

    expect(
      buildMerchantRewardWithBuilder(
        context,
        upgradeNeed(previewCard),
        "duplicate_keystone",
      ),
    ).toBeNull();
  });

  it("duplicate_keystone does not claim to solve missing support", () => {
    const context = contextFor({
      cards: supportCards(),
      supportMetaByUuid: supportMeta(),
    });

    expect(
      buildMerchantRewardWithBuilder(
        context,
        underSupportedPayoffNeed(),
        "duplicate_keystone",
      ),
    ).toBeNull();
  });

  it("purge_weak_card returns a deck-entry game object with a remove payload and badge", () => {
    const weakCard = card(UUIDS.weak, 2, {
      isStarter: true,
      rarity: "Starter",
    });
    const context = contextFor({
      cards: [weakCard],
      deckCards: [weakCard],
    });

    const reward = buildMerchantRewardWithBuilder(
      context,
      weakCardNeed(),
      "purge_weak_card",
    );

    expect(reward).toMatchObject({
      builderId: "purge_weak_card",
      applyPayload: {
        kind: "remove_deck_entry",
        entryId: "entry-1",
        cardUuid: UUIDS.weak,
      },
    });
    expect(reward?.gameObjects[0]).toMatchObject({
      objectType: "deckCard",
      entryId: "entry-1",
      badge: { label: "Remove" },
    });
  });

  it("every reward has need answers, positive value, and direct or chooser payload data", () => {
    const cards = supportCards();
    const previewCard = { ...cards[2], energyCost: 3 };
    const context = contextFor({
      cards,
      deckCards: [cards[1], cards[2]],
      dreamsignTemplates: [dreamsign("sign-open-a"), dreamsign("sign-open-b")],
      supportMetaByUuid: supportMeta(),
    });
    const rewards = buildMerchantRewardCatalog(context, [
      missingRoleNeed(["grant_support_card", "gain_essence", "raise_essence_cap"]),
      dreamsignGapNeed(),
      weakCardNeed(),
      upgradeNeed(previewCard),
    ]);

    expect(rewards.length).toBeGreaterThan(0);
    for (const reward of rewards) {
      expect(reward.answersNeedIds.length).toBeGreaterThan(0);
      expect(reward.valueEssence).toBeGreaterThan(0);
      expect(reward.gameObjects.length).toBeGreaterThan(0);
      expect(
        reward.applyPayload !== undefined ||
          (reward.choiceRequest?.candidates.length ?? 0) > 0,
      ).toBe(true);
    }
  });

  it("replace_weak_with_fit resolves to remove the weak entry and add the chosen card", () => {
    const cards = supportCards();
    const context = contextFor({
      cards,
      deckCards: [cards[1]],
      supportMetaByUuid: supportMeta(),
    });

    const reward = buildMerchantRewardWithBuilder(
      context,
      weakCardNeed(),
      "replace_weak_with_fit",
    );
    const choiceId = reward?.choiceRequest?.candidates[0]?.choiceId;
    if (reward === null || reward === undefined || choiceId === undefined) {
      throw new Error("expected replacement chooser reward");
    }

    const payload = resolveMerchantChoice(reward, choiceId);

    expect(payload).toMatchObject({
      kind: "composite",
      children: [
        { kind: "remove_deck_entry", entryId: "entry-1", cardUuid: UUIDS.weak },
        { kind: "add_catalog_card" },
      ],
    });
  });

  it("does not produce future-run modifier payloads", () => {
    const cards = supportCards();
    const previewCard = { ...cards[2], energyCost: 3 };
    const context = contextFor({
      cards,
      deckCards: [cards[1], cards[2]],
      dreamsignTemplates: [dreamsign("sign-open-a"), dreamsign("sign-open-b")],
      supportMetaByUuid: supportMeta(),
    });
    const needs = [
      missingRoleNeed(Object.keys(MERCHANT_REWARD_BUILDERS)),
      dreamsignGapNeed(Object.keys(MERCHANT_REWARD_BUILDERS)),
      weakCardNeed(),
      upgradeNeed(previewCard),
    ];
    const rewards = buildMerchantRewardCatalog(context, needs);
    const forbidden = new Set([
      "future_run_modifier",
      "battle_reward_modifier",
      "shop_discount",
      "reroll_token",
      "route_boost",
      "site_boost",
      "temporary_protection",
      "delayed_reward",
    ]);

    for (const reward of rewards) {
      const payloads = [
        ...(reward.applyPayload === undefined ? [] : payloadsFrom(reward.applyPayload)),
        ...(reward.choiceRequest?.candidates.flatMap((candidate) =>
          payloadsFrom(candidate.applyPayload),
        ) ?? []),
      ];
      for (const payload of payloads) {
        expect(forbidden.has(payload.kind)).toBe(false);
      }
    }
  });
});
