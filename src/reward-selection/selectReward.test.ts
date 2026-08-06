import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../types/card-identity";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestJourneyState,
  makeMerchantTestResolvedPackage,
  makeMerchantTestSite,
} from "../journey_v2/testing/fixtures";
import { buildRewardSelectionContext } from "./context";
import { selectReward } from "./selectReward";
import type { RewardSelectionContext, RewardSelectionRequest } from "./types";

const ids = Array.from({ length: 10 }, (_, index) =>
  asCardId(`a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
);

function context(reverse = false): RewardSelectionContext {
  const cards = ids.map((id, index) => makeMerchantTestCard({
    id,
    cardNumber: index + 1,
    name: asCardName(index < 2 ? "Shared display name" : `Card ${String(index)}`),
    cardType: index % 2 === 0 ? "Character" : "Event",
    subtype: index % 2 === 0 ? "Warrior" : "",
    energyCost: index % 2 === 0 ? 2 : 1,
  }));
  const ordered = reverse ? [...cards].reverse() : cards;
  const journey = makeMerchantTestJourneyState({
    seed: "selection-seed",
    deck: [
      makeMerchantTestDeckEntry({ entryId: "entry-a", cardNumber: 1 }),
      makeMerchantTestDeckEntry({ entryId: "entry-b", cardNumber: 1 }),
      makeMerchantTestDeckEntry({ entryId: "entry-c", cardNumber: 2 }),
    ],
    resolvedPackage: makeMerchantTestResolvedPackage({
      draftPoolCopiesByCard: Object.fromEntries(cards.map((card) => [card.id, 1])),
    }),
  });
  return buildRewardSelectionContext({
    journeyState: journey,
    journeyContent: makeMerchantTestContent({ cards: ordered }),
    site: makeMerchantTestSite({ id: "selection-site", type: "Exploration" }),
  });
}

function request(overrides: Partial<RewardSelectionRequest> = {}): RewardSelectionRequest {
  return {
    mechanicId: "catalog-card-chooser",
    policyId: "uniform",
    scope: {
      journeySeed: "selection-seed",
      siteUuid: "selection-site",
      selectionKey: "action-a",
    },
    count: 4,
    ...overrides,
  };
}

describe("shared reward selection", () => {
  it("is stable across catalog iteration order and keys identity by UUID", () => {
    const forward = selectReward(context(), request());
    const reversed = selectReward(context(true), request());
    expect(forward).toEqual(reversed);
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    expect(new Set(forward.bindings.cardUuids).size).toBe(4);
    expect(forward.trace.saltParts).toEqual([
      "1",
      "selection-seed",
      "selection-site",
      "action-a",
      "uniform",
      "candidate",
    ]);
  });

  it("applies authored predicates before sampling", () => {
    const result = selectReward(context(), request({
      count: 3,
      constraints: { predicate: "warrior" },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bindings.cardUuids.every((id) =>
      context().cardByUuid.get(id)?.subtype === "Warrior")).toBe(true);
  });

  it("rejects fixed-size undersupply and permits a nonempty up-to result", () => {
    const fixed = selectReward(context(), request({
      count: 6,
      constraints: { predicate: "warrior" },
    }));
    expect(fixed).toMatchObject({ ok: false, reason: "insufficient_candidates" });
    const partial = selectReward(context(), request({
      count: 6,
      upTo: true,
      constraints: { predicate: "warrior" },
    }));
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(partial.bindings.cardUuids).toHaveLength(5);
  });

  it("preserves fixed UUIDs", () => {
    const result = selectReward(context(), request({
      mechanicId: "gain-card",
      policyId: "fixed",
      count: 1,
      constraints: { fixedCardUuid: ids[1] },
    }));
    expect(result.ok && result.bindings.cardUuids).toEqual([ids[1]]);
  });

  it("samples duplicate targets by deck-entry UUID", () => {
    const result = selectReward(context(), request({
      mechanicId: "duplicate-deck-entry",
      policyId: "uniform",
      count: 3,
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.bindings.deckEntryIds)).toEqual(
      new Set(["entry-a", "entry-b", "entry-c"]),
    );
  });

  it("isolates selection keys and limits add-site rewards to the canonical pool", () => {
    const first = selectReward(context(), request({ count: 1 }));
    const other = selectReward(context(), request({
      count: 1,
      scope: { ...request().scope, selectionKey: "action-b" },
    }));
    expect(first.ok && first.trace.saltParts).not.toEqual(
      other.ok ? other.trace.saltParts : [],
    );

    const sites = selectReward(context(), request({
      mechanicId: "add-site",
      policyId: "site-uniform",
      count: 4,
    }));
    expect(sites.ok && new Set(sites.bindings.siteTypes)).toEqual(
      new Set(["Shop", "Purge", "Transfiguration", "Duplication"]),
    );
  });
});
