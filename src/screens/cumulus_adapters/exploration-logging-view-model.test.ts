import { describe, expect, it } from "vitest";
import type { ExplorationSiteView } from "../../cumulus/screens/ExplorationSiteScreen";
import type { ExplorationSiteRuntime } from "../../types/journey";
import {
  buildExplorationCompletionLog,
  buildExplorationEntryLog,
  buildExplorationResolutionLog,
} from "./exploration-logging-view-model";

describe("exploration logging view model", () => {
  it("records authored mechanics, minted UUID offers, selection, transition, and outcome", () => {
    const actionId = "copy-offered";
    const offeredEntryId = "entry-offered";
    const gainedEntryId = "entry-gained";
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "copy-offered-deck-card",
          mechanics: {
            effectKind: "copy-offered-deck-card",
            deckTarget: "offered",
            offerCount: 4,
          },
        },
        {
          id: "fallback",
          effectKind: "gain-card",
          mechanics: { effectKind: "gain-card" },
        },
      ],
      outcomeKind: "card-copies",
    } as unknown as ExplorationSiteView;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: "encounter-card-uuid",
      actionOffers: [
        {
          actionId,
          offeredCardIds: [],
          offeredDeckEntryIds: [offeredEntryId],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId,
        selection: { entryIds: [offeredEntryId] },
        gainedCardIds: ["copied-card-uuid"],
        gainedEntryIds: [gainedEntryId],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [offeredEntryId],
        essenceGained: 0,
      },
    };

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      presentedCardId: "encounter-card-uuid",
      actions: [
        {
          actionId,
          effectKind: "copy-offered-deck-card",
          mechanics: { deckTarget: "offered", offerCount: 4 },
        },
        {
          actionId: "fallback",
          effectKind: "gain-card",
          mechanics: { effectKind: "gain-card" },
        },
      ],
      offers: [{ actionId, offeredDeckEntryIds: [offeredEntryId] }],
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      presentedCardId: "encounter-card-uuid",
      actionId,
      effectKind: "copy-offered-deck-card",
      authoredMechanics: { deckTarget: "offered", offerCount: 4 },
      selection: { entryIds: [offeredEntryId] },
      gainedEntryIds: [gainedEntryId],
      affectedEntryIds: [offeredEntryId],
      outcomeKind: "card-copies",
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      presentedCardId: "encounter-card-uuid",
      actionId,
      selection: { entryIds: [offeredEntryId] },
      gainedEntryIds: [gainedEntryId],
      outcomeKind: "card-copies",
    });
  });

  it("records the exact one-use future-site modifier and presented outcome", () => {
    const actionId = "future-site";
    const modifier = {
      kind: "transfigure-next-draft-or-shop" as const,
      sourceSiteId: "exploration-site",
      sourceActionId: actionId,
    };
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "transfigure-next-draft-or-shop",
          mechanics: {
            effectKind: "transfigure-next-draft-or-shop",
          },
        },
      ],
      outcomeKind: "site-offer-modifier",
    } as unknown as ExplorationSiteView;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: "encounter-card-uuid",
      actionOffers: [
        {
          actionId,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId,
        selection: {},
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [],
        essenceGained: 0,
        siteOfferModifier: modifier,
      },
    };

    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      effectKind: "transfigure-next-draft-or-shop",
      authoredMechanics: { effectKind: "transfigure-next-draft-or-shop" },
      outcomeKind: "site-offer-modifier",
      siteOfferModifier: modifier,
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      actionId,
      outcomeKind: "site-offer-modifier",
      siteOfferModifier: modifier,
    });
  });

  it("records compound battle mechanics and exact pre-purge entry state", () => {
    const actionId = "purge-spark";
    const purgedEntry = {
      entryId: "purged-entry",
      cardNumber: 17,
      transfiguration: null,
      sparkBonus: 3,
      isBane: false,
    } as const;
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "purge-for-essence",
          mechanics: {
            effectKind: "purge-for-essence",
            essencePerSpark: 20,
          },
        },
      ],
      outcomeKind: "purged-card-essence",
    } as unknown as ExplorationSiteView;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: "encounter-card-uuid",
      actionOffers: [
        {
          actionId,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId,
        selection: { entryIds: [purgedEntry.entryId] },
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: ["purged-card-uuid"],
        purgedEntryIds: [purgedEntry.entryId],
        purgedEntrySnapshots: [purgedEntry],
        affectedEntryIds: [],
        essenceGained: 100,
      },
    };

    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      authoredMechanics: { essencePerSpark: 20 },
      selection: { entryIds: [purgedEntry.entryId] },
      purgedEntrySnapshots: [purgedEntry],
      essenceGained: 100,
      outcomeKind: "purged-card-essence",
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      purgedEntrySnapshots: [purgedEntry],
      essenceGained: 100,
      outcomeKind: "purged-card-essence",
    });
  });

  it("records the deterministic subtype victim and every survivor spark transition", () => {
    const actionId = "blood-oath";
    const purgedEntry = {
      entryId: "warrior-purged",
      cardNumber: 17,
      transfiguration: null,
      sparkBonus: 2,
      isBane: false,
    } as const;
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "purge-random-subtype-and-increase-spark",
          mechanics: {
            effectKind: "purge-random-subtype-and-increase-spark",
            subtype: "Warrior",
            sparkBonus: 1,
          },
        },
      ],
      outcomeKind: "spark",
    } as unknown as ExplorationSiteView;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: "encounter-card-uuid",
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "purge-deck-entry",
          selectionPolicyId: "uniform",
          offeredCardIds: [],
          offeredDeckEntryIds: [purgedEntry.entryId],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId,
        selection: { entryIds: [purgedEntry.entryId] },
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: ["purged-warrior-uuid"],
        purgedEntryIds: [purgedEntry.entryId],
        purgedEntrySnapshots: [purgedEntry],
        affectedEntryIds: ["warrior-a", "warrior-b"],
        sparkBeforeByEntryId: { "warrior-a": 2, "warrior-b": 4 },
        sparkAfterByEntryId: { "warrior-a": 3, "warrior-b": 5 },
        essenceGained: 0,
      },
    };

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      offers: [
        {
          actionId,
          canonicalMechanicId: "purge-deck-entry",
          selectionPolicyId: "uniform",
          offeredDeckEntryIds: [purgedEntry.entryId],
        },
      ],
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      authoredMechanics: { subtype: "Warrior", sparkBonus: 1 },
      purgedEntrySnapshots: [purgedEntry],
      sparkBeforeByEntryId: { "warrior-a": 2, "warrior-b": 4 },
      sparkAfterByEntryId: { "warrior-a": 3, "warrior-b": 5 },
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      sparkBeforeByEntryId: { "warrior-a": 2, "warrior-b": 4 },
      sparkAfterByEntryId: { "warrior-a": 3, "warrior-b": 5 },
    });
  });

  it("records frozen bulk transfiguration targets, form, and essence cost", () => {
    const actionId = "transfigure-all-events";
    const affectedEntryIds = ["event-a", "event-b"];
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "transfigure-all-for-essence",
          mechanics: {
            effectKind: "transfigure-all-for-essence",
            essence: 100,
            predicate: "event",
            transfiguration: "Inspired",
          },
        },
      ],
      outcomeKind: "transfiguration",
    } as unknown as ExplorationSiteView;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: "encounter-card-uuid",
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "transfigure-deck-for-essence",
          selectionSignature: "bulk-target-signature",
          eligibleDeckEntryIds: affectedEntryIds,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId,
        selectionContentRevision: "bulk-content-revision",
        selectionSignature: "bulk-target-signature",
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds,
        essenceGained: 0,
        essenceSpent: 100,
        chosenTransfiguration: "Inspired",
        resolvedPredicate: "event",
      },
    };

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      offers: [
        {
          canonicalMechanicId: "transfigure-deck-for-essence",
          selectionSignature: "bulk-target-signature",
          eligibleDeckEntryIds: affectedEntryIds,
        },
      ],
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      affectedEntryIds,
      essenceGained: 0,
      essenceSpent: 100,
      chosenTransfiguration: "Inspired",
      resolvedPredicate: "event",
      selectionContentRevision: "bulk-content-revision",
      outcomeKind: "transfiguration",
    });
  });
});
