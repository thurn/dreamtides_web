import { describe, expect, it } from "vitest";
import { buildDreamwellDeck as buildConfiguredDreamwellDeck } from "./create-battle-init";
import { createBattleRng } from "../random";
import type { DreamwellCard } from "../../data/dreamwell-database";
import { opponentsFixture } from "../../testing/opponents-fixture";

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
    id: `dw-${String(order)}-${String(n)}`,
    name: `Order ${String(order)} #${String(n)}`,
    renderedText: "",
    order,
    energyAdded: order === 0 ? 2 : 1,
    cardNumber: order * 100 + n,
    imageNumber: 0,
  };
}

function makeCatalog(): DreamwellCard[] {
  const cards: DreamwellCard[] = [];
  // 2 order-0, then 8/6/12/7 across orders 1-4 (all groups >= 5).
  for (let n = 0; n < 2; n += 1) cards.push(makeCard(0, n));
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
  it("leads the first cycle with all order-0 cards, then five from each of orders 1-4", () => {
    const deck = buildTestDreamwellDeck(
      makeCatalog(),
      createBattleRng(1234, "dreamwellDeck"),
    );

    // First two cards are the order-0 starting cards.
    expect(ordersOf(deck).slice(0, 2)).toEqual([0, 0]);
    // Then five of order 1, five of order 2, five of order 3, five of order 4.
    expect(ordersOf(deck).slice(2, 22)).toEqual([
      1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4,
    ]);
  });

  it("drops the order-0 cards from every cycle after the first", () => {
    const deck = buildTestDreamwellDeck(
      makeCatalog(),
      createBattleRng(1234, "dreamwellDeck"),
    );
    // The first cycle is the only one carrying order-0 cards (2 of them here).
    expect(deck.filter((card) => card.order === 0)).toHaveLength(2);
    // The deck is long enough to outlast a full-length battle.
    expect(deck.length).toBeGreaterThanOrEqual(62);
  });

  it("uses configured orders, recurring counts, and minimum length", () => {
    const deck = buildTestDreamwellDeck(
      makeCatalog(),
      createBattleRng(4, "dreamwellDeck"),
      {
        openingOrders: [2],
        recurringOrders: [1, 3],
        cardsPerRecurringOrder: 2,
        minimumConstructedLength: 11,
      },
    );

    expect(ordersOf(deck).slice(0, 10)).toEqual([2, 2, 2, 2, 2, 2, 1, 1, 3, 3]);
    expect(deck.length).toBeGreaterThanOrEqual(11);
    expect(deck.some((card) => card.order === 0 || card.order === 4)).toBe(
      false,
    );
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
      makeCard(0, 0),
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
    expect(buildTestDreamwellDeck([], createBattleRng(1, "dreamwellDeck"))).toEqual(
      [],
    );
  });
});
