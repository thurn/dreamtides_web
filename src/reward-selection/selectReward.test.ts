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
import { asSiteId } from "../types/identifiers";
import { asDeckEntryId } from "../types/identifiers";
import { asDreamAvatarId } from "../types/identifiers";
import { asDreamsignId } from "../types/identifiers";
import { asSelectionKey } from "../types/identifiers";

const ids = Array.from({ length: 10 }, (_, index) =>
  asCardId(`a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
);

function context(reverse = false): RewardSelectionContext {
  const cards = ids.map((id, index) =>
    makeMerchantTestCard({
      id,
      cardNumber: index + 1,
      name: asCardName(
        index < 2 ? "Shared display name" : `Card ${String(index)}`,
      ),
      cardType: index % 2 === 0 ? "Character" : "Event",
      subtype: index % 2 === 0 ? "Warrior" : "",
      energyCost: index % 2 === 0 ? 2 : 1,
    }),
  );
  const ordered = reverse ? [...cards].reverse() : cards;
  const journey = makeMerchantTestJourneyState({
    seed: "selection-seed",
    deck: [
      makeMerchantTestDeckEntry({
        entryId: asDeckEntryId("entry-a"),
        cardNumber: 1,
      }),
      makeMerchantTestDeckEntry({
        entryId: asDeckEntryId("entry-b"),
        cardNumber: 1,
      }),
      makeMerchantTestDeckEntry({
        entryId: asDeckEntryId("entry-c"),
        cardNumber: 2,
      }),
    ],
    resolvedPackage: makeMerchantTestResolvedPackage({
      draftPoolCopiesByCard: Object.fromEntries(
        cards.map((card) => [String(card.cardNumber), 1]),
      ),
    }),
  });
  return buildRewardSelectionContext({
    journeyState: journey,
    journeyContent: makeMerchantTestContent({ cards: ordered }),
    site: makeMerchantTestSite({
      id: asSiteId("selection-site"),
      type: "Exploration",
    }),
  });
}

function legendaryContext(reverse = false): RewardSelectionContext {
  const cards = ids.slice(0, 6).map((id, index) =>
    makeMerchantTestCard({
      id,
      cardNumber: index + 1,
      name: asCardName(
        index === 1 ? "Legendary" : `Synthetic card ${String(index)}`,
      ),
      ...(index === 1 ? {} : { rarity: "Legendary" as const }),
    }),
  );
  const journey = makeMerchantTestJourneyState({
    seed: "selection-seed",
    deck: [
      makeMerchantTestDeckEntry({
        entryId: asDeckEntryId("owned-entry"),
        cardNumber: 6,
      }),
    ],
    resolvedPackage: makeMerchantTestResolvedPackage({
      draftPoolCopiesByCard: Object.fromEntries(
        cards
          .filter((_, index) => index !== 3)
          .map((card) => [String(card.cardNumber), 1]),
      ),
    }),
  });
  return buildRewardSelectionContext({
    journeyState: journey,
    journeyContent: makeMerchantTestContent({
      cards: reverse ? [...cards].reverse() : cards,
    }),
    site: makeMerchantTestSite({
      id: asSiteId("selection-site"),
      type: "Exploration",
    }),
  });
}

function request(
  overrides: Partial<RewardSelectionRequest> = {},
): RewardSelectionRequest {
  return {
    mechanicId: "catalog-card-chooser",
    policyId: "uniform",
    scope: {
      journeySeed: "selection-seed",
      siteUuid: asSiteId("selection-site"),
      selectionKey: asSelectionKey("action-a"),
    },
    count: 4,
    ...overrides,
  };
}

describe("shared reward selection", () => {
  it("rejects unknown and incompatible runtime contracts without throwing", () => {
    const unknownMechanic = selectReward(context(), {
      ...request(),
      mechanicId: "typo-mechanic",
    } as unknown as RewardSelectionRequest);
    expect(unknownMechanic).toMatchObject({
      ok: false,
      reason: "invalid_request",
    });

    const incompatible = selectReward(context(), {
      ...request(),
      policyId: "purge-misfit",
    });
    expect(incompatible).toMatchObject({
      ok: false,
      reason: "invalid_request",
    });
  });

  it("is stable across catalog iteration order and keys identity by UUID", () => {
    const forward = selectReward(context(), request());
    const reversed = selectReward(context(true), request());
    expect(forward).toEqual(reversed);
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    expect(new Set(forward.bindings.cardUuids).size).toBe(4);
    expect(forward.trace.saltParts).toEqual([
      "2",
      "selection-seed",
      "selection-site",
      "action-a",
      "uniform",
      "candidate",
    ]);
  });

  it("applies authored predicates before sampling", () => {
    const result = selectReward(
      context(),
      request({
        count: 3,
        constraints: { predicate: "warrior" },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.bindings.cardUuids.every(
        (id) => context().cardByUuid.get(id)?.subtype === "Warrior",
      ),
    ).toBe(true);
  });

  it("rejects fixed-size undersupply and permits a nonempty up-to result", () => {
    const fixed = selectReward(
      context(),
      request({
        count: 6,
        constraints: { predicate: "warrior" },
      }),
    );
    expect(fixed).toMatchObject({
      ok: false,
      reason: "insufficient_candidates",
    });
    const partial = selectReward(
      context(),
      request({
        count: 6,
        upTo: true,
        constraints: { predicate: "warrior" },
      }),
    );
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(partial.bindings.cardUuids).toHaveLength(5);
  });

  it("preserves fixed UUIDs", () => {
    const result = selectReward(
      context(),
      request({
        mechanicId: "gain-card",
        policyId: "fixed",
        count: 1,
        constraints: { fixedCardUuid: ids[1] },
      }),
    );
    expect(result.ok && result.bindings.cardUuids).toEqual([ids[1]]);
  });

  it("resolves a fixed custom Dreamsign by UUID", () => {
    const base = context();
    const customDreamsignId = "custom-selection-dreamsign";
    const content = {
      ...base.content,
      exploration: {
        customCards: [],
        customDreamsigns: [
          {
            id: asDreamsignId(customDreamsignId),
            name: "Custom Selection Dreamsign",
            effectDescription: "A synthetic custom effect.",
          },
        ],
        encounters: [],
      },
    };
    const customContext = buildRewardSelectionContext({
      journeyState: makeMerchantTestJourneyState({ seed: "selection-seed" }),
      journeyContent: content,
      site: makeMerchantTestSite({
        id: asSiteId("selection-site"),
        type: "Exploration",
      }),
    });
    const result = selectReward(
      customContext,
      request({
        mechanicId: "gain-dreamsign",
        policyId: "fixed",
        count: 1,
        constraints: { fixedDreamsignId: asDreamsignId(customDreamsignId) },
      }),
    );

    expect(result.ok && result.bindings.dreamsignIds).toEqual([
      customDreamsignId,
    ]);
  });

  it("includes authored affinity inputs in the content revision", () => {
    const base = context();
    const cards = [...base.content.cardDatabase.values()];
    const journey = makeMerchantTestJourneyState({ seed: "selection-seed" });
    const site = makeMerchantTestSite({
      id: asSiteId("selection-site"),
      type: "Exploration",
    });
    const withAvatar = buildRewardSelectionContext({
      journeyState: journey,
      journeyContent: {
        ...makeMerchantTestContent({ cards }),
        dreamAvatars: [
          {
            id: asDreamAvatarId("selection-avatar"),
            name: "Selection Avatar",
            title: "Synthetic",
            renderedText: "A synthetic ability.",
            imageNumber: "1",
            startingEssence: 250,
            signatureCards: [],
          },
        ],
      },
      site,
    });

    expect(withAvatar.selectionContentRevision).not.toBe(
      base.selectionContentRevision,
    );
  });

  it("uses purpose-isolated streams for pack selection and bundle growth", () => {
    const packs = selectReward(
      context(),
      request({
        mechanicId: "pack-chooser",
        policyId: "card-bundle",
        count: 2,
        packSize: 2,
      }),
    );
    const bundle = selectReward(
      context(),
      request({
        mechanicId: "gain-card",
        policyId: "card-bundle",
        count: 3,
      }),
    );

    expect(
      packs.ok && packs.trace.streams.map((stream) => stream.purpose),
    ).toEqual(["pack", "bundle-growth"]);
    expect(
      bundle.ok && bundle.trace.streams.map((stream) => stream.purpose),
    ).toEqual(["candidate", "bundle-growth"]);
  });

  it("bundles legendary gain-card rewards within draft-pool and UUID exclusions", () => {
    const legendaryRequest = request({
      mechanicId: "gain-card",
      policyId: "card-bundle",
      count: 2,
      constraints: {
        predicate: "legendary",
        excludeOwned: true,
        excludedCardUuids: [ids[4]],
      },
    });
    const forward = selectReward(legendaryContext(), legendaryRequest);
    const replay = selectReward(legendaryContext(true), legendaryRequest);

    expect(forward).toEqual(replay);
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    expect(new Set(forward.bindings.cardUuids)).toEqual(
      new Set([ids[0], ids[2]]),
    );
    expect(forward.trace.candidateCount).toBe(2);
    expect(forward.trace.constraints).toMatchObject({
      predicate: "legendary",
      excludeOwned: true,
      excludedCardUuids: [ids[4]],
    });
  });

  it("samples duplicate targets by deck-entry UUID", () => {
    const result = selectReward(
      context(),
      request({
        mechanicId: "duplicate-deck-entry",
        policyId: "uniform",
        count: 3,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.bindings.deckEntryIds)).toEqual(
      new Set(["entry-a", "entry-b", "entry-c"]),
    );
  });

  it("routes card-type changes through deterministic uniform entry selection", () => {
    const typeChangeRequest = request({
      mechanicId: "change-entry-card-type",
      policyId: "uniform",
      count: 2,
      constraints: {
        allowStarters: true,
        allowNightmare: true,
        distinctDeckEntries: true,
        excludedDeckEntryIds: [asDeckEntryId("entry-c")],
      },
    });
    const forward = selectReward(context(), typeChangeRequest);
    const replay = selectReward(context(true), typeChangeRequest);

    expect(forward).toEqual(replay);
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    expect(forward.bindings.deckEntryIds).toHaveLength(2);
    expect(new Set(forward.bindings.deckEntryIds).size).toBe(2);
    expect(forward.bindings.deckEntryIds).not.toContain("entry-c");
    expect(forward.trace).toMatchObject({
      mechanicId: "change-entry-card-type",
      policyId: "uniform",
      keyKind: "entryId",
      candidateCount: 2,
      selectedKeys: forward.bindings.deckEntryIds,
    });

    const incompatible = selectReward(context(), {
      ...typeChangeRequest,
      policyId: "fixed",
    });
    expect(incompatible).toMatchObject({
      ok: false,
      reason: "invalid_request",
    });
  });

  it("routes card-type changes through centrality after effective-type exclusions", () => {
    const typeChangeRequest = request({
      mechanicId: "change-entry-card-type",
      policyId: "deck-entry-centrality",
      count: 1,
      constraints: {
        allowStarters: true,
        allowNightmare: true,
        distinctDeckEntries: true,
        excludedDeckEntryIds: [
          asDeckEntryId("entry-a"),
          asDeckEntryId("entry-b"),
        ],
      },
    });
    const forward = selectReward(context(), typeChangeRequest);
    const replay = selectReward(context(true), typeChangeRequest);

    expect(forward).toEqual(replay);
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    expect(forward.bindings.deckEntryIds).toEqual(["entry-c"]);
    expect(forward.trace).toMatchObject({
      mechanicId: "change-entry-card-type",
      policyId: "deck-entry-centrality",
      keyKind: "entryId",
      candidateCount: 1,
      selectedKeys: ["entry-c"],
    });
  });

  it("isolates selection keys and limits add-site rewards to the canonical pool", () => {
    const first = selectReward(context(), request({ count: 1 }));
    const other = selectReward(
      context(),
      request({
        count: 1,
        scope: { ...request().scope, selectionKey: asSelectionKey("action-b") },
      }),
    );
    expect(first.ok && first.trace.saltParts).not.toEqual(
      other.ok ? other.trace.saltParts : [],
    );

    const sites = selectReward(
      context(),
      request({
        mechanicId: "add-site",
        policyId: "site-uniform",
        count: 4,
      }),
    );
    expect(sites.ok && new Set(sites.bindings.siteTypes)).toEqual(
      new Set(["Shop", "Purge", "Transfiguration", "Duplication"]),
    );
  });
});
