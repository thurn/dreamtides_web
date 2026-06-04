// Predicate table tests.
//
// Three tests:
//   1. property test — for an 8-card fixture spanning the predicate axes,
//      every predicate either matches the fixture cards that cover it or
//      returns zero when no fixture card covers it. Bug class: silent
//      regression in predicate filter logic during the port.
//   2. negative-match spot check — for three representative predicates
//      (`warriors`, `low_cost`, `legendary`), assert that fixture cards
//      which clearly should NOT match are absent from the result. Bug
//      class: a predicate that broadens to also match the wrong cards
//      (e.g. `warriors` accidentally matching Survivors), which the
//      property test alone would miss because it only checks the
//      ≥1 match / =0 match boundary.
//   3. structural test — every predicate row has a non-empty plural
//      string and the table has no duplicate ids. Bug class: typo'd
//      or missing predicate metadata.

import { describe, expect, it } from "vitest";

import type { CardContent, ContentBundle } from "../../content/types";
import type { JourneyContext } from "../context";
import { cardMatches } from "./content";
import { getPredicate, PREDICATES } from "./predicates";

function card(overrides: Partial<CardContent> & { id: string }): CardContent {
  return {
    name: overrides.name ?? overrides.id,
    rarity: overrides.rarity ?? "common",
    cardType: overrides.cardType ?? "Event",
    energyCost: overrides.energyCost ?? 3,
    spark: overrides.spark ?? "",
    cardNumber: overrides.cardNumber ?? 0,
    raw: overrides.raw ?? {},
    ...overrides,
  };
}

// 8 cards covering: events, characters, warriors, survivors, spirit_animals,
// low_cost, high_cost, low_spark, high_spark, materialized, challenge, fast,
// starter, legendary, transfigured, discard_text, abandon.
// Intentionally NOT covered: event_copying, energy_generation, dissolve,
// reclaim — those predicates must return zero matches on this fixture.
const FIXTURE_CARDS: readonly CardContent[] = [
  // 1: Event, low cost, Materialized
  card({
    id: "event-mat",
    cardType: "Event",
    energyCost: 1,
    raw: { "rendered-text": "Materialized: draw a card." },
  }),
  // 2: Character Warrior, low spark
  card({
    id: "char-warrior",
    cardType: "Character",
    energyCost: 2,
    spark: 1,
    raw: { subtype: "Warrior" },
  }),
  // 3: Character Survivor, legendary
  card({
    id: "char-survivor",
    cardType: "Character",
    energyCost: 3,
    spark: 2,
    rarity: "legendary",
    raw: { subtype: "Survivor" },
  }),
  // 4: Character Spirit Animal, high cost, high spark
  card({
    id: "char-spirit",
    cardType: "Character",
    energyCost: 5,
    spark: 4,
    raw: { subtype: "Spirit Animal" },
  }),
  // 5: Event with Challenge + Fast
  card({
    id: "event-judg-fast",
    cardType: "Event",
    energyCost: 3,
    raw: { "rendered-text": "Challenge: discard a card.", "is-fast": true },
  }),
  // 6: Starter card (Character)
  card({
    id: "starter-card",
    cardType: "Character",
    energyCost: 2,
    spark: 2,
    rarity: "Starter",
  }),
  // 7: Event with discard text
  card({
    id: "event-discard",
    cardType: "Event",
    energyCost: 3,
    raw: { "rendered-text": "Choose a card to discard." },
  }),
  // 8: Character with Transfigured + Abandon
  card({
    id: "char-transfigured",
    cardType: "Character",
    energyCost: 3,
    spark: 2,
    raw: { "rendered-text": "Transfigured Abandon when defeated." },
  }),
];

// Predicate ids the fixture covers. Anything not in this set must return zero
// matches; anything in it must return at least one.
const COVERED: ReadonlySet<string> = new Set([
  "events",
  "characters",
  "warriors",
  "survivors",
  "spirit_animals",
  "low_cost",
  "high_cost",
  "low_spark",
  "high_spark",
  "materialized",
  "challenge",
  "fast",
  "starter",
  "legendary",
  "transfigured",
  "discard_text",
  "abandon",
]);

function fixtureContext(): JourneyContext {
  const content: ContentBundle = {
    cards: [...FIXTURE_CARDS],
    dreamcallers: [],
    dreamsigns: [],
  };
  return {
    content,
    contentVersion: "test",
    state: {
      quest: {
        seed: "test-seed",
        resources: { essence: 0, maxEssence: 10, omens: 0, dreamscape: 0 },
        deck: {
          entries: FIXTURE_CARDS.map((c) => ({ cardId: c.id, copies: 1 })),
          summary: { totalCards: FIXTURE_CARDS.length, starterCards: 1, uniqueCards: FIXTURE_CARDS.length },
        },
        draftPool: [],
        activeDreamsigns: [],
        dreamsignPoolIds: [],
        banes: [],
        dreamcaller: { id: "" },
      },
    },
  };
}

describe("predicate table — property test", () => {
  const ctx = fixtureContext();

  it("matches every covered predicate and returns zero for uncovered predicates", () => {
    for (const p of PREDICATES) {
      const matches = cardMatches(ctx, p.cardPredicate);

      if (COVERED.has(p.id)) {
        expect(
          matches.length,
          `predicate '${p.id}' should match at least one fixture card`,
        ).toBeGreaterThan(0);
      } else {
        expect(
          matches.length,
          `predicate '${p.id}' should not match any fixture card`,
        ).toBe(0);
      }
    }
  });
});

describe("predicate table — negative-match spot checks", () => {
  // The property test only checks the ≥1 / =0 boundary, so a regression that
  // broadens a predicate to match the wrong cards (e.g. `warriors` matching
  // Survivors) slips through. These spot checks pin specific non-matches for
  // three representative predicates spanning the kinds: card-type (warriors),
  // stat-bucket (low_cost), and card-type by rarity (legendary).
  const ctx = fixtureContext();

  it("warriors does not match Survivors, Spirit Animals, or Events", () => {
    const predicate = getPredicate("warriors");
    const matchedIds = cardMatches(ctx, predicate.cardPredicate).map((c) => c.id);
    expect(matchedIds).not.toContain("char-survivor");
    expect(matchedIds).not.toContain("char-spirit");
    expect(matchedIds).not.toContain("event-mat");
  });

  it("low_cost does not match cards with cost 3 or more", () => {
    const predicate = getPredicate("low_cost");
    const matchedIds = cardMatches(ctx, predicate.cardPredicate).map((c) => c.id);
    expect(matchedIds).not.toContain("char-survivor"); // cost 3
    expect(matchedIds).not.toContain("char-spirit"); // cost 5
  });

  it("legendary does not match common-rarity or Starter cards", () => {
    const predicate = getPredicate("legendary");
    const matchedIds = cardMatches(ctx, predicate.cardPredicate).map((c) => c.id);
    expect(matchedIds).not.toContain("char-warrior"); // common
    expect(matchedIds).not.toContain("starter-card"); // Starter
  });
});

describe("predicate table — structural invariants", () => {
  it("every entry has a non-empty plural string, defined cardPredicate, and unique id", () => {
    const seen = new Set<string>();
    for (const p of PREDICATES) {
      expect(p.text.plural.length, `predicate '${p.id}' plural is empty`).toBeGreaterThan(0);
      expect(p.cardPredicate, `predicate '${p.id}' is missing a cardPredicate`).toBeDefined();
      expect(seen.has(p.id), `duplicate predicate id '${p.id}'`).toBe(false);
      seen.add(p.id);
    }
  });
});
