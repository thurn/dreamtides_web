import { describe, expect, it } from "vitest";
import { buildMerchantContext } from "../context/buildMerchantContext";
import { readMerchantDeck } from "./deckRead";
import type { CardData } from "../../types/cards";
import type {
  MerchantContext,
  MerchantNeed,
  MerchantSupportMeta,
} from "../types";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";

const UUIDS = {
  payoff: "10000000-0000-4000-8000-000000000001",
  abandonSupport: "10000000-0000-4000-8000-000000000002",
  weakStarter: "10000000-0000-4000-8000-000000000003",
  highCost: "10000000-0000-4000-8000-000000000004",
  fillerA: "10000000-0000-4000-8000-000000000005",
  fillerB: "10000000-0000-4000-8000-000000000006",
  fillerC: "10000000-0000-4000-8000-000000000007",
  fillerD: "10000000-0000-4000-8000-000000000008",
  draw: "10000000-0000-4000-8000-000000000009",
} as const;

function card(
  id: string,
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return makeMerchantTestCard({
    id,
    cardNumber,
    name: `Read Fixture ${cardNumber}`,
    cardType: "Character",
    energyCost: 2,
    spark: 1,
    renderedText: "",
    ...overrides,
  });
}

function contextFor(
  cards: readonly CardData[],
  supportMetaByUuid: ReadonlyMap<string, MerchantSupportMeta> = new Map(),
): MerchantContext {
  const questState = makeMerchantTestQuestState({
    deck: cards.map((testCard, index) =>
      makeMerchantTestDeckEntry({
        entryId: `entry-${String(index + 1).padStart(2, "0")}`,
        cardNumber: testCard.cardNumber,
      }),
    ),
  });
  const base = buildMerchantContext({
    questState,
    questContent: makeMerchantTestContent({
      cards,
      dreamsignTemplates: [
        makeMerchantTestDreamsignTemplate({ id: "dreamsign-fixture" }),
      ],
    }),
    site: makeMerchantTestSite(),
  });
  return {
    ...base,
    supportMetaByUuid,
  };
}

function expectNeedShape(need: MerchantNeed): void {
  expect(need.needId).toMatch(/^need:/);
  expect(need.severity).toBeGreaterThan(0);
  expect(need.severity).toBeLessThanOrEqual(1);
  expect(need.confidence).toBeGreaterThan(0);
  expect(need.confidence).toBeLessThanOrEqual(1);
  expect(need.observation.summary.length).toBeGreaterThan(0);
  expect(need.compatibleRewardBuilderIds.length).toBeGreaterThan(0);
}

describe("readMerchantDeck", () => {
  it("emits under_supported_payoff when a payoff lacks matching support", () => {
    const payoff = card(UUIDS.payoff, 1, {
      name: "Unsupported Payoff",
      renderedText: "Whenever you abandon a card, gain 1 spark.",
    });
    const context = contextFor(
      [
        payoff,
        card(UUIDS.fillerA, 2),
        card(UUIDS.fillerB, 3),
        card(UUIDS.fillerC, 4),
        card(UUIDS.fillerD, 5),
      ],
      new Map([
        [
          UUIDS.payoff,
          {
            needs: [{ theme: "abandon", tier: 3 }],
            supports: [],
          },
        ],
      ]),
    );

    const needs = readMerchantDeck(context);
    const payoffNeed = needs.find(
      (need) => need.needKind === "under_supported_payoff",
    );

    expect(payoffNeed).toMatchObject({
      cardUuid: UUIDS.payoff,
      entryId: "entry-01",
      themeId: "abandon",
      support: { supportCount: 0 },
    });
  });

  it("emits missing_role for a draw-light deck", () => {
    const context = contextFor([
      card(UUIDS.fillerA, 10),
      card(UUIDS.fillerB, 11),
      card(UUIDS.fillerC, 12),
      card(UUIDS.fillerD, 13),
      card(UUIDS.highCost, 14, { energyCost: 3 }),
      card(UUIDS.payoff, 15, { spark: 3 }),
    ]);

    const needs = readMerchantDeck(context);
    const drawNeed = needs.find(
      (need) => need.needKind === "missing_role" && need.role === "draw",
    );

    expect(drawNeed?.compatibleRewardBuilderIds).toContain("grant_draw_card");
  });

  it("emits curve_problem for a top-heavy deck", () => {
    const context = contextFor([
      card(UUIDS.fillerA, 20, { energyCost: 4 }),
      card(UUIDS.fillerB, 21, { energyCost: 5 }),
      card(UUIDS.fillerC, 22, { energyCost: 4 }),
      card(UUIDS.fillerD, 23, { energyCost: 5 }),
      card(UUIDS.highCost, 24, { energyCost: 6 }),
    ]);

    const needs = readMerchantDeck(context);

    expect(needs).toContainEqual(
      expect.objectContaining({
        needKind: "curve_problem",
        role: "cheap_early_play",
      }),
    );
  });

  it("emits Viridian projection metadata for an eligible high-cost card", () => {
    const highCost = card(UUIDS.highCost, 30, {
      name: "Expensive Event",
      cardType: "Event",
      energyCost: 5,
      spark: null,
      renderedText: "Fast.",
    });
    const context = contextFor([
      highCost,
      card(UUIDS.draw, 31, { renderedText: "Draw a card." }),
      card(UUIDS.fillerA, 32),
      card(UUIDS.fillerB, 33),
    ]);

    const needs = readMerchantDeck(context);
    const upgrade = needs.find(
      (need) =>
        need.needKind === "upgrade_target" &&
        need.cardUuid === UUIDS.highCost &&
        need.projection?.transfiguration === "Viridian",
    );

    expect(upgrade?.entryId).toBe("entry-01");
    expect(upgrade?.projection).toMatchObject({
      transfiguration: "Viridian",
      metric: {
        label: "cost",
        from: 5,
        to: 3,
      },
    });
    expect(upgrade?.compatibleRewardBuilderIds).toContain("transfigure_upgrade");
  });

  it("does not emit weak_card for the sole support of a detected payoff theme", () => {
    const weakSupport = card(UUIDS.weakStarter, 40, {
      name: "Sole Starter Support",
      isStarter: true,
      rarity: "Starter",
      energyCost: 1,
      renderedText: "",
    });
    const context = contextFor(
      [
        card(UUIDS.payoff, 41, {
          name: "Abandon Payoff",
          renderedText: "Whenever you abandon a card, gain 1 spark.",
        }),
        weakSupport,
        card(UUIDS.fillerA, 42),
        card(UUIDS.fillerB, 43),
        card(UUIDS.fillerC, 44),
      ],
      new Map([
        [
          UUIDS.payoff,
          {
            needs: [{ theme: "abandon", tier: 3 }],
            supports: [],
          },
        ],
        [
          UUIDS.weakStarter,
          {
            needs: [],
            supports: ["abandon"],
          },
        ],
      ]),
    );

    const needs = readMerchantDeck(context);

    expect(needs).not.toContainEqual(
      expect.objectContaining({
        needKind: "weak_card",
        cardUuid: UUIDS.weakStarter,
      }),
    );
  });

  it("emits weak_card for a weak starter that is not sole support", () => {
    const context = contextFor([
      card(UUIDS.weakStarter, 50, {
        name: "Weak Starter",
        isStarter: true,
        rarity: "Starter",
        energyCost: 2,
      }),
      card(UUIDS.draw, 51, { renderedText: "Draw a card." }),
      card(UUIDS.fillerA, 52, { spark: 3 }),
      card(UUIDS.fillerB, 53, { cardType: "Event" }),
      card(UUIDS.fillerC, 54),
    ]);

    const needs = readMerchantDeck(context);

    expect(needs).toContainEqual(
      expect.objectContaining({
        needKind: "weak_card",
        cardUuid: UUIDS.weakStarter,
        entryId: "entry-01",
      }),
    );
  });

  it("gives every emitted need stable actionable fields", () => {
    const context = contextFor([
      card(UUIDS.highCost, 60, { cardType: "Event", energyCost: 5 }),
      card(UUIDS.fillerA, 61, { energyCost: 4 }),
      card(UUIDS.fillerB, 62),
      card(UUIDS.weakStarter, 63, {
        isStarter: true,
        rarity: "Starter",
      }),
    ]);

    const needs = readMerchantDeck(context);

    expect(needs.length).toBeGreaterThanOrEqual(2);
    for (const need of needs) {
      expectNeedShape(need);
      if (need.needType === "card") {
        expect(need.cardUuid).toBeTruthy();
        expect(need.entryId).toBeTruthy();
      }
    }
  });

  it("orders needs deterministically for unchanged context", () => {
    const context = contextFor([
      card(UUIDS.highCost, 70, { cardType: "Event", energyCost: 5 }),
      card(UUIDS.fillerA, 71, { energyCost: 4 }),
      card(UUIDS.fillerB, 72),
      card(UUIDS.weakStarter, 73, {
        isStarter: true,
        rarity: "Starter",
      }),
    ]);

    const first = readMerchantDeck(context).map((need) => need.needId);
    const second = readMerchantDeck(context).map((need) => need.needId);

    expect(second).toEqual(first);
  });
});
