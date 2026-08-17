import { describe, expect, it } from "vitest";
import { testDreamwellCardName } from "../../types/test-identities";
import { buildDreamwellDeck as buildConfiguredDreamwellDeck } from "./create-battle-init";
import { createBattleRng } from "../random";
import type { DreamwellCard } from "../../data/dreamwell-database";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { testDreamwellCardId } from "../../types/test-identities";

const DREAMWELL_CONFIG = opponentsFixture().dreamwell;

function buildTestDreamwellDeck(
  cards: readonly DreamwellCard[],
  rng: Parameters<typeof buildConfiguredDreamwellDeck>[1],
  config = DREAMWELL_CONFIG,
) {
  return buildConfiguredDreamwellDeck(cards, rng, config);
}

/**
 * Synthetic Dreamwell catalog. The deck builder is deck-shape logic, not TOML
 * data, so these tests author their own cards and never assert against
 * `data/dreamwell.toml` (which is free to change).
 */
function makeCard(order: number, n: number): DreamwellCard {
  return {
    id: testDreamwellCardId(`dw-${String(order)}-${String(n)}`),
    name: testDreamwellCardName(`Order ${String(order)} #${String(n)}`),
    renderedText: "",
    order,
    energyAdded: 1,
    cardNumber: order * 100 + n,
    imageNumber: 0,
  };
}

function makeCatalog(): DreamwellCard[] {
  const cards: DreamwellCard[] = [];
  // 8/6/12/7 across orders 1-4 (all groups >= 5).
  for (let n = 0; n < 8; n += 1) cards.push(makeCard(1, n));
  for (let n = 0; n < 6; n += 1) cards.push(makeCard(2, n));
  for (let n = 0; n < 12; n += 1) cards.push(makeCard(3, n));
  for (let n = 0; n < 7; n += 1) cards.push(makeCard(4, n));
  return cards;
}

function ordersOf(deck: { order: number }[]): number[] {
  return deck.map((card) => card.order);
}

describe("buildDreamwellDeck", () => {
  it("takes five cards from each of orders 1-4 per cycle", () => {
    const deck = buildTestDreamwellDeck(
      makeCatalog(),
      createBattleRng(1234, "dreamwellDeck"),
    );

    expect(ordersOf(deck).slice(0, 20)).toEqual([
      1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4,
    ]);
  });

  it("contains only configured recurring orders", () => {
    const deck = buildTestDreamwellDeck(
      makeCatalog(),
      createBattleRng(1234, "dreamwellDeck"),
    );
    expect(new Set(ordersOf(deck))).toEqual(new Set([1, 2, 3, 4]));
    // The deck is long enough to outlast a full-length battle.
    expect(deck.length).toBeGreaterThanOrEqual(62);
  });

  it("uses configured orders, recurring counts, and minimum length", () => {
    const deck = buildTestDreamwellDeck(
      makeCatalog(),
      createBattleRng(4, "dreamwellDeck"),
      {
        recurringOrders: [1, 3],
        cardsPerRecurringOrder: 2,
        minimumConstructedLength: 11,
      },
    );

    expect(ordersOf(deck).slice(0, 8)).toEqual([1, 1, 3, 3, 1, 1, 3, 3]);
    expect(deck.length).toBeGreaterThanOrEqual(11);
    expect(deck.some((card) => card.order === 2 || card.order === 4)).toBe(false);
  });

  it("is deterministic for a given seed and varies across seeds", () => {
    const a = buildTestDreamwellDeck(
      makeCatalog(),
      createBattleRng(7, "dreamwellDeck"),
    );
    const b = buildTestDreamwellDeck(
      makeCatalog(),
      createBattleRng(7, "dreamwellDeck"),
    );
    const c = buildTestDreamwellDeck(
      makeCatalog(),
      createBattleRng(99, "dreamwellDeck"),
    );
    expect(a.map((card) => card.id)).toEqual(b.map((card) => card.id));
    expect(a.map((card) => card.id)).not.toEqual(c.map((card) => card.id));
  });

  it("tolerates an order group smaller than five by taking all of its cards", () => {
    const sparse: DreamwellCard[] = [
      makeCard(1, 0),
      makeCard(1, 1),
      makeCard(2, 0),
      makeCard(2, 1),
      makeCard(2, 2),
      makeCard(2, 3),
      makeCard(2, 4),
    ];
    const deck = buildTestDreamwellDeck(
      sparse,
      createBattleRng(3, "dreamwellDeck"),
    );
    // Order 1 has only two cards, so each cycle contributes both (never five).
    const orderOnePerCycle = deck.filter((card) => card.order === 1).length;
    expect(orderOnePerCycle).toBeGreaterThan(0);
    // It never invents cards: every drawn card came from the catalog.
    const catalogIds = new Set(sparse.map((card) => card.id));
    expect(deck.every((card) => catalogIds.has(card.id))).toBe(true);
  });

  it("returns an empty deck for an empty catalog without looping forever", () => {
    expect(
      buildTestDreamwellDeck([], createBattleRng(1, "dreamwellDeck")),
    ).toEqual([]);
  });
});
