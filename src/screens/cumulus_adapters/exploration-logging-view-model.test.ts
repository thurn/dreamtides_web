import { describe, expect, it } from "vitest";
import { stableDigest } from "../../reward-selection/stable";
import type { ExplorationSiteView } from "../../cumulus/screens/ExplorationSiteScreen";
import type { ExplorationSiteRuntime } from "../../types/journey";
import {
  buildExplorationActionLog,
  buildExplorationCompletionLog,
  buildExplorationEntryLog,
  buildExplorationResolutionLog,
} from "./exploration-logging-view-model";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseSelectionKey } from "../../types/identifiers";
import { testCardId, testDreamsignId, testExplorationActionId } from "../../types/test-identities";
import { parseSelectionContentRevision } from "../../types/selection-content-revision";
import { parseSelectionRulesVersion } from "../../reward-selection/types";

describe("exploration logging view model", () => {
  it("records the complete signed plan and ordered result for a compound deck mutation", () => {
    const actionId = testExplorationActionId("compound-action");
    const preparation = {
      kind: "purge-transfigure-copy" as const,
      offerCount: 4,
      transfiguration: "Kindled" as const,
      eligibleCards: [
        { entryId: parseDeckEntryId("entry-a"), cardId: testCardId("card-a") },
        { entryId: parseDeckEntryId("entry-b"), cardId: testCardId("card-b") },
        { entryId: parseDeckEntryId("entry-c"), cardId: testCardId("card-c") },
        { entryId: parseDeckEntryId("entry-d"), cardId: testCardId("card-d") },
      ],
      targets: [
        {
          entryId: parseDeckEntryId("entry-a"),
          cardId: testCardId("card-a"),
          transfiguration: "Kindled" as const,
        },
        {
          entryId: parseDeckEntryId("entry-b"),
          cardId: testCardId("card-b"),
          transfiguration: "Kindled" as const,
        },
        {
          entryId: parseDeckEntryId("entry-c"),
          cardId: testCardId("card-c"),
          transfiguration: "Kindled" as const,
        },
        {
          entryId: parseDeckEntryId("entry-d"),
          cardId: testCardId("card-d"),
          transfiguration: "Kindled" as const,
        },
      ],
      selectionRulesVersion: parseSelectionRulesVersion("2"),
      selectionContentRevision: parseSelectionContentRevision("content-revision"),
      selectionKey: actionId,
      selectorSignatures: ["selector-signature"],
      selectorTraces: [{ selectedKeys: ["entry-a", "entry-b"] }],
      planSignature: stableDigest("compound-plan-signature"),
    };
    const cardTransfigurations = preparation.targets.slice(1).map((target) => ({
      ...target,
      beforeTransfiguration: null,
      afterTransfiguration: target.transfiguration,
    }));
    const cardCopies = preparation.targets.slice(1).map((target, index) => ({
      sourceEntryId: target.entryId,
      sourceCardId: target.cardId,
      mintedEntryId: parseDeckEntryId(`copy-${String(index)}`),
      mintedCardId: target.cardId,
    }));
    const selection = { entryIds: [parseDeckEntryId("entry-a")] };
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "purge-one-transfigure-and-copy-others",
          mechanics: {
            effectKind: "purge-one-transfigure-and-copy-others",
            offerCount: 4,
            transfiguration: "Kindled",
          },
        },
      ],
      outcomeKind: "compound-card-mutation",
    } as unknown as ExplorationSiteView;
    const runtime = {
      kind: "exploration" as const,
      encounterCardId: testCardId("encounter-card-uuid"),
      encounterSignature: stableDigest("encounter-signature"),
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "transfigure-deck-entry" as const,
          selectionPolicyId: "uniform" as const,
          selectionRulesVersion: preparation.selectionRulesVersion,
          selectionContentRevision: preparation.selectionContentRevision,
          selectionKey: preparation.selectionKey,
          selectionSignature: preparation.planSignature,
          selectionTraces: preparation.selectorTraces,
          compoundActionPreparation: preparation,
          offeredCardIds: [],
          offeredDeckEntryIds: preparation.targets.map(
            (target) => target.entryId,
          ),
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: Object.fromEntries(
            preparation.targets.map((target) => [
              target.entryId,
              target.transfiguration,
            ]),
          ),
        },
      ],
      resolution: {
        actionId,
        selectionRulesVersion: preparation.selectionRulesVersion,
        selectionContentRevision: preparation.selectionContentRevision,
        encounterSignature: stableDigest("encounter-signature"),
        selectionSignature: preparation.planSignature,
        selection,
        gainedCardIds: [
          testCardId("card-b"),
          testCardId("card-c"),
          testCardId("card-d"),
        ],
        gainedEntryIds: [
          parseDeckEntryId("copy-0"),
          parseDeckEntryId("copy-1"),
          parseDeckEntryId("copy-2"),
        ],
        gainedDreamsignIds: [],
        purgedCardIds: [testCardId("card-a")],
        purgedEntryIds: [parseDeckEntryId("entry-a")],
        purgedEntrySnapshots: [
          {
            entryId: parseDeckEntryId("entry-a"),
            cardNumber: 1,
            transfiguration: null,
            isBane: false,
          },
        ],
        affectedEntryIds: [
          parseDeckEntryId("entry-a"),
          parseDeckEntryId("entry-b"),
          parseDeckEntryId("entry-c"),
          parseDeckEntryId("entry-d"),
        ],
        essenceGained: 0,
        cardTransfigurations,
        cardCopies,
        cardKeywordChanges: [],
        nightmareGains: [],
      },
    } as unknown as ExplorationSiteRuntime;

    const entry = buildExplorationEntryLog(view, runtime);
    expect(entry.offers[0]).toMatchObject({
      compoundActionPreparation: preparation,
      selectorSignatures: preparation.selectorSignatures,
      selectionTraces: preparation.selectorTraces,
    });
    expect(
      buildExplorationActionLog(
        view,
        runtime,
        actionId,
        selection,
      ),
    ).toMatchObject({
      requestedSelection: selection,
      compoundActionPreparation: preparation,
      selectorSignatures: preparation.selectorSignatures,
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      validatedSelection: selection,
      compoundActionPreparation: preparation,
      cardTransfigurations,
      cardCopies,
      cardKeywordChanges: [],
      nightmareGains: [],
      outcomeKind: "compound-card-mutation",
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      validatedSelection: selection,
      compoundActionPreparation: preparation,
      cardTransfigurations,
      cardCopies,
      outcomeKind: "compound-card-mutation",
    });
  });

  it("records authored mechanics, minted UUID offers, selection, transition, and outcome", () => {
    const actionId = testExplorationActionId("copy-offered");
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
          id: testExplorationActionId("fallback"),
          effectKind: "gain-card",
          mechanics: { effectKind: "gain-card" },
        },
      ],
      outcomeKind: "card-copies",
    } as unknown as ExplorationSiteView;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
          offeredCardIds: [],
          offeredDeckEntryIds: [parseDeckEntryId(offeredEntryId)],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: actionId,
        selection: { entryIds: [parseDeckEntryId(offeredEntryId)] },
        gainedCardIds: [testCardId("copied-card-uuid")],
        gainedEntryIds: [parseDeckEntryId(gainedEntryId)],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [parseDeckEntryId(offeredEntryId)],
        essenceGained: 0,
      },
    };

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      presentedCardId: testCardId("encounter-card-uuid"),
      actions: [
        {
          actionId,
          effectKind: "copy-offered-deck-card",
          mechanics: { deckTarget: "offered", offerCount: 4 },
        },
        {
          actionId: testExplorationActionId("fallback"),
          effectKind: "gain-card",
          mechanics: { effectKind: "gain-card" },
        },
      ],
      offers: [
        { actionId, offeredDeckEntryIds: [parseDeckEntryId(offeredEntryId)] },
      ],
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      presentedCardId: testCardId("encounter-card-uuid"),
      actionId,
      effectKind: "copy-offered-deck-card",
      authoredMechanics: { deckTarget: "offered", offerCount: 4 },
      selection: { entryIds: [parseDeckEntryId(offeredEntryId)] },
      gainedEntryIds: [parseDeckEntryId(gainedEntryId)],
      affectedEntryIds: [parseDeckEntryId(offeredEntryId)],
      outcomeKind: "card-copies",
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      presentedCardId: testCardId("encounter-card-uuid"),
      actionId,
      selection: { entryIds: [parseDeckEntryId(offeredEntryId)] },
      gainedEntryIds: [parseDeckEntryId(gainedEntryId)],
      outcomeKind: "card-copies",
    });
  });

  it("records the exact one-use future-site modifier and presented outcome", () => {
    const actionId = testExplorationActionId("future-site");
    const modifier = {
      kind: "transfigure-next-draft-or-shop" as const,
      sourceSiteId: parseSiteId("exploration-site"),
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
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: actionId,
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

  it.each([
    {
      effectKind: "free-next-shop",
      mechanics: { effectKind: "free-next-shop" },
      shopModifier: {
        kind: "free-next-shop" as const,
        sourceSiteId: parseSiteId("exploration-site"),
        sourceActionId: testExplorationActionId("shop-modifier-action"),
      },
      essenceBefore: undefined,
      essenceSpent: undefined,
      essenceAfter: undefined,
    },
    {
      effectKind: "lose-half-essence-and-free-purchases",
      mechanics: {
        effectKind: "lose-half-essence-and-free-purchases",
        count: 3,
      },
      shopModifier: {
        kind: "free-purchases" as const,
        sourceSiteId: parseSiteId("exploration-site"),
        sourceActionId: testExplorationActionId("shop-modifier-action"),
        initialCount: 3,
        remainingCount: 3,
      },
      essenceBefore: 255,
      essenceSpent: 127,
      essenceAfter: 128,
    },
  ] as const)(
    "records reconstructable $effectKind state at every Exploration boundary",
    ({
      effectKind,
      mechanics,
      shopModifier,
      essenceBefore,
      essenceSpent,
      essenceAfter,
    }) => {
      const actionId = testExplorationActionId("shop-modifier-action");
      const view = {
        actions: [{ id: actionId, effectKind, mechanics }],
        outcomeKind: "shop-modifier",
      } as unknown as ExplorationSiteView;
      const runtime: ExplorationSiteRuntime = {
        kind: "exploration",
        encounterCardId: testCardId("encounter-card-uuid"),
        actionOffers: [
          {
            actionId: actionId,
            canonicalMechanicId: "shop-purchase-modifier",
            offeredCardIds: [],
            packCardIds: [],
            replacementCardIdByEntryId: {},
            transfigurationByEntryId: {},
          },
        ],
        resolution: {
          actionId: actionId,
          selection: {},
          gainedCardIds: [],
          gainedDreamsignIds: [],
          purgedCardIds: [],
          affectedEntryIds: [],
          essenceGained: 0,
          shopModifier,
          ...(essenceBefore === undefined ? {} : { essenceBefore }),
          ...(essenceSpent === undefined ? {} : { essenceSpent }),
          ...(essenceAfter === undefined ? {} : { essenceAfter }),
        },
      };

      expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
        actions: [{ actionId, effectKind, mechanics }],
        offers: [
          {
            actionId,
            canonicalMechanicId: "shop-purchase-modifier",
            authoredCount: "count" in mechanics ? mechanics.count : null,
          },
        ],
        terminalOutcome: {
          kind: "shop-modifier",
          shopModifier,
          essenceBefore: essenceBefore ?? null,
          essenceSpent: essenceSpent ?? 0,
          essenceAfter: essenceAfter ?? null,
        },
      });
      expect(
        buildExplorationActionLog(
          view,
          runtime,
          actionId,
          {},
        ),
      ).toMatchObject({
        actionId,
        effectKind,
        authoredMechanics: mechanics,
        terminalOutcome: { shopModifier },
      });
      expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
        actionId,
        effectKind,
        shopModifier,
        ...(essenceBefore === undefined ? {} : { essenceBefore }),
        ...(essenceSpent === undefined ? {} : { essenceSpent }),
        ...(essenceAfter === undefined ? {} : { essenceAfter }),
      });
      expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
        actionId,
        effectKind,
        shopModifier,
        essenceBefore: essenceBefore ?? null,
        essenceSpent: essenceSpent ?? 0,
        essenceAfter: essenceAfter ?? null,
      });
    },
  );

  it("records compound battle mechanics and exact pre-purge entry state", () => {
    const actionId = testExplorationActionId("purge-spark");
    const purgedEntry = {
      entryId: parseDeckEntryId("purged-entry"),
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
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: actionId,
        selection: { entryIds: [purgedEntry.entryId] },
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [testCardId("purged-card-uuid")],
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

  it("records prepared random Essence and the exact persisted balance transition", () => {
    const actionId = testExplorationActionId("random-essence");
    const essencePreparation = {
      minimumEssence: 50,
      maximumEssence: 150,
      purpose: "essence-amount" as const,
      saltParts: ["exploration", "site-uuid", "encounter-card-uuid", actionId],
      drawsConsumed: 1,
    };
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "gain-random-essence",
          mechanics: {
            effectKind: "gain-random-essence",
            minimumEssence: 50,
            maximumEssence: 150,
          },
        },
      ],
      outcomeKind: "direct-essence",
    } as unknown as ExplorationSiteView;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      selectionRulesVersion: parseSelectionRulesVersion("exploration-selection-v1"),
      selectionContentRevision: parseSelectionContentRevision("content-revision"),
      encounterSignature: stableDigest("encounter-signature"),
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
          canonicalMechanicId: "essence-mutation",
          selectionPolicyId: "uniform",
          selectionKey: parseSelectionKey("prepared-essence-key"),
          selectionSignature: stableDigest("prepared-essence-signature"),
          preparedEssenceAmount: 87,
          essencePreparation,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: actionId,
        selectionRulesVersion: parseSelectionRulesVersion("exploration-selection-v1"),
        selectionContentRevision: parseSelectionContentRevision("content-revision"),
        encounterSignature: stableDigest("encounter-signature"),
        selectionSignature: stableDigest("prepared-essence-signature"),
        selection: {},
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [],
        essenceBefore: 250,
        essenceGained: 87,
        essenceAfter: 337,
        essencePreparation,
      },
    };

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      presentedCardId: testCardId("encounter-card-uuid"),
      offers: [
        {
          actionId,
          canonicalMechanicId: "essence-mutation",
          selectionPolicyId: "uniform",
          preparedEssenceAmount: 87,
          essencePreparation,
        },
      ],
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      actionId,
      effectKind: "gain-random-essence",
      canonicalMechanicId: "essence-mutation",
      selectionPolicyId: "uniform",
      authoredMechanics: {
        minimumEssence: 50,
        maximumEssence: 150,
      },
      outcomeKind: "direct-essence",
      essenceBefore: 250,
      essenceGained: 87,
      essenceAfter: 337,
      terminalEssenceTotal: 337,
      essencePreparation,
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      actionId,
      effectKind: "gain-random-essence",
      canonicalMechanicId: "essence-mutation",
      selectionPolicyId: "uniform",
      outcomeKind: "direct-essence",
      essenceBefore: 250,
      essenceGained: 87,
      essenceAfter: 337,
      terminalEssenceTotal: 337,
      essencePreparation,
    });
  });

  it("records every selected entry and pre-purge snapshot for a bounded purge", () => {
    const actionId = testExplorationActionId("purge-up-to-two-warriors");
    const purgedEntries = ["warrior-a", "warrior-b"].map((entryId, index) => ({
      entryId: parseDeckEntryId(entryId),
      cardNumber: 20 + index,
      transfiguration: null,
      isBane: false,
    }));
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "purge-selected",
          mechanics: {
            effectKind: "purge-selected",
            predicate: "warrior",
            count: 2,
          },
        },
      ],
      outcomeKind: "card-purge",
    } as unknown as ExplorationSiteView;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
          canonicalMechanicId: "purge-deck-entry",
          selectionPolicyId: "purge-misfit",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: actionId,
        selection: {
          entryIds: purgedEntries
            .map((entry) => entry.entryId)
            .map(parseDeckEntryId),
        },
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [testCardId("warrior-card-a"), testCardId("warrior-card-b")],
        purgedEntryIds: purgedEntries
          .map((entry) => entry.entryId)
          .map(parseDeckEntryId),
        purgedEntrySnapshots: purgedEntries,
        affectedEntryIds: [],
        essenceGained: 0,
      },
    };

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      offers: [
        {
          actionId,
          canonicalMechanicId: "purge-deck-entry",
          selectionPolicyId: "purge-misfit",
        },
      ],
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      actionId,
      authoredMechanics: { predicate: "warrior", count: 2 },
      selection: {
        entryIds: [parseDeckEntryId("warrior-a"), parseDeckEntryId("warrior-b")],
      },
      purgedEntryIds: [parseDeckEntryId("warrior-a"), parseDeckEntryId("warrior-b")],
      purgedEntrySnapshots: purgedEntries,
      outcomeKind: "card-purge",
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      actionId,
      selection: {
        entryIds: [parseDeckEntryId("warrior-a"), parseDeckEntryId("warrior-b")],
      },
      purgedEntryIds: [parseDeckEntryId("warrior-a"), parseDeckEntryId("warrior-b")],
      purgedEntrySnapshots: purgedEntries,
      outcomeKind: "card-purge",
    });
  });

  it("records the deterministic subtype victim and every survivor spark transition", () => {
    const actionId = testExplorationActionId("blood-oath");
    const purgedEntry = {
      entryId: parseDeckEntryId("warrior-purged"),
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
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
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
        actionId: actionId,
        selection: { entryIds: [purgedEntry.entryId] },
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [testCardId("purged-warrior-uuid")],
        purgedEntryIds: [purgedEntry.entryId],
        purgedEntrySnapshots: [purgedEntry],
        affectedEntryIds: [
          parseDeckEntryId("warrior-a"),
          parseDeckEntryId("warrior-b"),
        ],
        sparkBeforeByEntryId: {
          [parseDeckEntryId("warrior-a")]: 2,
          [parseDeckEntryId("warrior-b")]: 4,
        },
        sparkAfterByEntryId: {
          [parseDeckEntryId("warrior-a")]: 3,
          [parseDeckEntryId("warrior-b")]: 5,
        },
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
    const actionId = testExplorationActionId("transfigure-all-events");
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
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
          canonicalMechanicId: "transfigure-deck-for-essence",
          selectionSignature: stableDigest("bulk-target-signature"),
          eligibleDeckEntryIds: affectedEntryIds.map(parseDeckEntryId),
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: actionId,
        selectionContentRevision: parseSelectionContentRevision("bulk-content-revision"),
        selectionSignature: stableDigest("bulk-target-signature"),
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: affectedEntryIds.map(parseDeckEntryId),
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
          selectionSignature: stableDigest("bulk-target-signature"),
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
      selectionContentRevision: parseSelectionContentRevision("bulk-content-revision"),
      outcomeKind: "transfiguration",
    });
  });

  it.each([
    ["gain-offered-dreamsign", "offered-gain"],
    ["replace-selected-dreamsign-with-offered", "offered-replacement"],
    ["replace-all-dreamsigns-random", "replace-all-random"],
    ["purge-selected-dreamsign-and-gain-random", "purge-and-gain-random"],
  ] as const)(
    "records reconstructable Dreamsign preparation and mutation for %s",
    (effectKind, preparationKind) => {
      const actionId = testExplorationActionId("b0000000-0000-4000-8000-000000000001");
      const heldIds = [
        "b0000000-0000-4000-8000-000000000002",
        "b0000000-0000-4000-8000-000000000003",
      ];
      const preparedIds = [
        "b0000000-0000-4000-8000-000000000004",
        "b0000000-0000-4000-8000-000000000005",
        "b0000000-0000-4000-8000-000000000006",
      ];
      const revealedOfferedIds =
        effectKind === "gain-offered-dreamsign" ||
        effectKind === "replace-selected-dreamsign-with-offered"
          ? preparedIds
          : [];
      const poolBeforeIds = [...preparedIds, heldIds[0]];
      const poolAfterIds = [heldIds[0]];
      const selection = {
        purgedDreamsignId: heldIds[0],
        overflowReplacementDreamsignIds: [heldIds[1]],
      };
      const dreamsignPreparation = {
        kind: preparationKind,
        requestedCount: 3,
        heldIdsAtPreparation: heldIds,
        maxDreamsignsAtPreparation: 3,
        poolBeforeIds,
        poolBasisIds: preparedIds,
        poolRegenerated: true,
        preparedDreamsignIds: preparedIds.map(testDreamsignId),
        requiredOverflowReplacementCount: 1,
        planSignature: stableDigest("dreamsign-plan-signature"),
      };
      const dreamsignMutation = {
        beforeIds: heldIds,
        afterIds: preparedIds,
        offeredIds: preparedIds,
        gainedIds: preparedIds,
        purgedIds: [heldIds[0]],
        replacements: [
          {
            removedDreamsignId: testDreamsignId(heldIds[1]),
            gainedDreamsignId: testDreamsignId(preparedIds[0]),
          },
        ],
        poolBeforeIds,
        poolAfterIds,
        poolRegenerated: true,
      };
      const selectionTrace = {
        selectionRulesVersion: parseSelectionRulesVersion("2"),
        selectionContentRevision: parseSelectionContentRevision("dreamsign-content-revision"),
        mechanicId: "gain-dreamsign",
        policyId: "uniform",
        selectionKey: "dreamsign-selection-key",
        keyKind: "dreamsignId",
        saltParts: ["exploration", "room-seed", actionId],
        purpose: "dreamsign-offer",
        drawsConsumed: 3,
        streams: [],
        constraints: {},
        candidateCount: 4,
        candidateDigest: "candidate-digest",
        band: {
          fraction: 1,
          minimum: 3,
          size: 4,
          cutoffScore: null,
          candidates: preparedIds.map((dreamsignId) => ({
            key: dreamsignId,
            dreamsignId: testDreamsignId(dreamsignId),
            score: 0,
            components: {},
            inBand: true,
            selected: true,
          })),
        },
        selectedKeys: preparedIds,
        fallback: [],
        tuning: {},
        effectiveDeck: [],
        effectiveDeckDigest: "deck-digest",
      } as const;
      const view = {
        actions: [
          {
            id: actionId,
            effectKind,
            mechanics: { effectKind, count: 3 },
          },
        ],
        outcomeKind: "dreamsign-mutation",
      } as unknown as ExplorationSiteView;
      const runtime = {
        kind: "exploration",
        encounterCardId: testCardId("b0000000-0000-4000-8000-000000000007"),
        selectionRulesVersion: parseSelectionRulesVersion("2"),
        selectionContentRevision: parseSelectionContentRevision("dreamsign-content-revision"),
        encounterSignature: stableDigest("encounter-signature"),
        actionOffers: [
          {
            actionId,
            canonicalMechanicId: "gain-dreamsign",
            selectionPolicyId: "uniform",
            selectionRulesVersion: parseSelectionRulesVersion("2"),
            selectionContentRevision: parseSelectionContentRevision("dreamsign-content-revision"),
            selectionKey: "dreamsign-selection-key",
            selectionSignature: stableDigest("selector-signature"),
            selectionTrace,
            dreamsignPreparation,
            offeredCardIds: [],
            offeredDreamsignIds: revealedOfferedIds.map(testDreamsignId),
            packCardIds: [],
            replacementCardIdByEntryId: {},
            transfigurationByEntryId: {},
          },
        ],
        resolution: {
          actionId,
          selectionRulesVersion: parseSelectionRulesVersion("2"),
          selectionContentRevision: parseSelectionContentRevision("dreamsign-content-revision"),
          encounterSignature: stableDigest("encounter-signature"),
          selectionSignature: stableDigest("selector-signature"),
          selection,
          gainedCardIds: [],
          gainedDreamsignIds: preparedIds.map(testDreamsignId),
          purgedCardIds: [],
          purgedDreamsignIds: [heldIds[0]],
          dreamsignMutation,
          affectedEntryIds: [],
          essenceGained: 0,
        },
      } as unknown as ExplorationSiteRuntime;

      expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
        selectionContentRevision: parseSelectionContentRevision("dreamsign-content-revision"),
        offers: [
          {
            selectionPolicyId: "uniform",
            selectionSignature: stableDigest("selector-signature"),
            selectionTrace,
            dreamsignPreparation,
            excludedDreamsignIds: heldIds,
            dreamsignUnavailableReason: null,
            offeredDreamsignIds: revealedOfferedIds.map(testDreamsignId),
          },
        ],
      });
      expect(
        buildExplorationActionLog(
          view,
          runtime,
          actionId,
          selection,
        ),
      ).toMatchObject({
        effectKind,
        requestedSelection: selection,
        selectionSignature: stableDigest("selector-signature"),
        dreamsignPreparation,
        excludedDreamsignIds: heldIds,
      });
      expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
        effectKind,
        selection,
        dreamsignPreparation,
        dreamsignMutation,
        outcomeKind: "dreamsign-mutation",
      });
      expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
        effectKind,
        selection,
        dreamsignPreparation,
        dreamsignMutation,
        gainedDreamsignIds: preparedIds.map(testDreamsignId),
        purgedDreamsignIds: [heldIds[0]],
        outcomeKind: "dreamsign-mutation",
      });
    },
  );

  it.each([
    {
      effectKind: "gain-nightmare-and-dreamsign",
      preparationKind: "fixed-gain",
      mechanics: {
        effectKind: "gain-nightmare-and-dreamsign",
        nightmareCount: 2,
        dreamsignId: testDreamsignId("fixed-dreamsign-id"),
      },
      selectionPolicyId: "fixed",
      selection: { replacedDreamsignId: testDreamsignId("held-dreamsign-id") },
      offeredDreamsignIds: ([] as string[]).map(testDreamsignId),
    },
    {
      effectKind: "gain-nightmare-and-offered-dreamsign",
      preparationKind: "offered-gain",
      mechanics: {
        effectKind: "gain-nightmare-and-offered-dreamsign",
        nightmareCount: 2,
        offerCount: 3,
      },
      selectionPolicyId: "dreamsign-match",
      selection: {
        offeredDreamsignId: testDreamsignId("gained-dreamsign-id"),
        replacedDreamsignId: testDreamsignId("held-dreamsign-id"),
      },
      offeredDreamsignIds: [
        testDreamsignId("gained-dreamsign-id"),
        testDreamsignId("unchosen-dreamsign-id-a"),
        testDreamsignId("unchosen-dreamsign-id-b"),
      ],
    },
  ] as const)(
    "records the complete compound Nightmare plan and terminal outcome for $effectKind",
    (fixture) => {
      const actionId = testExplorationActionId("compound-action-id");
      const nightmareCardId = "nightmare-card-id";
      const mintedEntryIds = ["nightmare-entry-a", "nightmare-entry-b"];
      const dreamsignPreparation = {
        kind: fixture.preparationKind,
        requestedCount: 1,
        heldIdsAtPreparation: [testDreamsignId("held-dreamsign-id")],
        maxDreamsignsAtPreparation: 1,
        poolBeforeIds: [...fixture.offeredDreamsignIds],
        poolBasisIds: [...fixture.offeredDreamsignIds],
        poolRegenerated: false,
        preparedDreamsignIds: (fixture.offeredDreamsignIds.length === 0
          ? [testDreamsignId("fixed-dreamsign-id")]
          : [...fixture.offeredDreamsignIds]
        ),
        requiredOverflowReplacementCount: 1,
        planSignature: stableDigest("compound-plan-signature"),
      };
      const dreamsignMutation = {
        beforeIds: [testDreamsignId("held-dreamsign-id")],
        afterIds: ["gained-dreamsign-id"],
        offeredIds: [...fixture.offeredDreamsignIds],
        gainedIds: ["gained-dreamsign-id"],
        purgedIds: [testDreamsignId("held-dreamsign-id")],
        replacements: [
          {
            removedDreamsignId: testDreamsignId("held-dreamsign-id"),
            gainedDreamsignId: testDreamsignId("gained-dreamsign-id"),
          },
        ],
        poolBeforeIds: [...fixture.offeredDreamsignIds],
        poolAfterIds: fixture.offeredDreamsignIds.slice(1),
        poolRegenerated: false,
      };
      const view = {
        actions: [
          {
            id: actionId,
            effectKind: fixture.effectKind,
            mechanics: fixture.mechanics,
          },
        ],
        outcomeKind: "nightmare-dreamsign-bundle",
      } as unknown as ExplorationSiteView;
      const runtime = {
        kind: "exploration",
        encounterCardId: testCardId("encounter-card-id"),
        actionOffers: [
          {
            actionId,
            canonicalMechanicId: "gain-dreamsign",
            selectionPolicyId: fixture.selectionPolicyId,
            selectionSignature: stableDigest("selector-signature"),
            selectionTrace: { selectedKeys: ["gained-dreamsign-id"] },
            dreamsignPreparation,
            offeredCardIds: [],
            offeredDreamsignIds: fixture.offeredDreamsignIds,
            packCardIds: [],
            replacementCardIdByEntryId: {},
            transfigurationByEntryId: {},
          },
        ],
        resolution: {
          actionId,
          selection: fixture.selection,
          gainedCardIds: [testCardId(nightmareCardId), testCardId(nightmareCardId)],
          gainedEntryIds: mintedEntryIds.map(parseDeckEntryId),
          gainedDreamsignIds: [testDreamsignId("gained-dreamsign-id")],
          purgedCardIds: [],
          purgedDreamsignIds: [testDreamsignId("held-dreamsign-id")],
          dreamsignMutation,
          affectedEntryIds: [],
          essenceGained: 0,
        },
      } as unknown as ExplorationSiteRuntime;

      const entry = buildExplorationEntryLog(view, runtime);
      expect(entry.actions[0]).toMatchObject({
        authoredNightmareCount: 2,
        authoredFixedDreamsignId:
          fixture.effectKind === "gain-nightmare-and-dreamsign"
            ? testDreamsignId("fixed-dreamsign-id")
            : null,
        authoredOfferCount:
          fixture.effectKind === "gain-nightmare-and-offered-dreamsign"
            ? 3
            : null,
      });
      expect(entry.offers[0]).toMatchObject({
        selectorPlan: dreamsignPreparation,
        selectionTrace: { selectedKeys: ["gained-dreamsign-id"] },
      });
      expect(
        buildExplorationActionLog(
          view,
          runtime,
          actionId,
          fixture.selection,
        ),
      ).toMatchObject({
        rawSelection: fixture.selection,
        selectorPlan: dreamsignPreparation,
      });
      expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
        rawSelection: fixture.selection,
        mintedEntryIds,
        mutation: dreamsignMutation,
        terminalOutcome: {
          kind: "nightmare-dreamsign-bundle",
          gainedCardIds: [testCardId(nightmareCardId), testCardId(nightmareCardId)],
          mintedEntryIds,
          dreamsignMutation,
        },
      });
      expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
        rawSelection: fixture.selection,
        mintedEntryIds,
        mutation: dreamsignMutation,
        outcomeKind: "nightmare-dreamsign-bundle",
      });
    },
  );

  it.each([
    { effectKind: "purge-starter-card", predicate: null, replacement: false },
    {
      effectKind: "purge-random-starter-card",
      predicate: null,
      replacement: false,
    },
    {
      effectKind: "purge-random-starter-and-gain-card",
      predicate: "character",
      replacement: true,
    },
    {
      effectKind: "replace-all-starter-cards",
      predicate: "character",
      replacement: true,
    },
  ] as const)(
    "records the signed starter plan and exact atomic outcome for $effectKind",
    (fixture) => {
      const actionId = testExplorationActionId("starter-action-id");
      const purgedEntry = {
        entryId: parseDeckEntryId("purged-starter-entry"),
        cardNumber: 32,
        transfiguration: null,
        isBane: false,
      } as const;
      const replacement = {
        purgedEntryId: purgedEntry.entryId,
        purgedCardId: testCardId("purged-starter-card-id"),
        gainedEntryId: parseDeckEntryId("gained-starter-entry"),
        gainedCardId: testCardId("gained-starter-card-id"),
      };
      const starterCardPreparation = {
        kind: fixture.effectKind,
        eligibleStarterCards: [
          {
            entryId: purgedEntry.entryId,
            cardId: replacement.purgedCardId,
          },
        ],
        purgedEntryIds: [purgedEntry.entryId],
        purgedCardIds: [replacement.purgedCardId],
        replacementCardIdByEntryId: fixture.replacement
          ? { [purgedEntry.entryId]: replacement.gainedCardId }
          : {},
        selectionRulesVersion: parseSelectionRulesVersion("starter-rules-v1"),
        selectionContentRevision: parseSelectionContentRevision("starter-content-v1"),
        selectionKey: "starter-selection-key",
        selectorSignatures: ["purge-signature", "gain-signature"],
        selectorTraces: [
          {
            mechanicId: "replace-deck-entry",
            policyId: "card-fit-quality",
            selectedKeys: [purgedEntry.entryId],
          },
        ],
        planSignature: stableDigest("starter-plan-signature"),
      };
      const view = {
        actions: [
          {
            id: actionId,
            effectKind: fixture.effectKind,
            mechanics: {
              effectKind: fixture.effectKind,
              ...(fixture.predicate === null
                ? {}
                : { predicate: fixture.predicate }),
            },
          },
        ],
        outcomeKind: "starter-card-mutation",
      } as unknown as ExplorationSiteView;
      const runtime = {
        kind: "exploration",
        encounterCardId: testCardId("encounter-card-id"),
        actionOffers: [
          {
            actionId,
            canonicalMechanicId: "replace-deck-entry",
            starterCardPreparation,
            offeredCardIds: [],
            packCardIds: [],
            replacementCardIdByEntryId: {},
            transfigurationByEntryId: {},
          },
        ],
        resolution: {
          actionId,
          selection: {},
          gainedCardIds: fixture.replacement ? [replacement.gainedCardId] : [],
          gainedEntryIds: fixture.replacement
            ? [replacement.gainedEntryId]
            : [],
          gainedDreamsignIds: [],
          purgedCardIds: [replacement.purgedCardId],
          purgedEntryIds: [replacement.purgedEntryId],
          purgedEntrySnapshots: [purgedEntry],
          starterCardReplacements: fixture.replacement ? [replacement] : [],
          affectedEntryIds: [],
          essenceGained: 0,
          ...(fixture.predicate === null
            ? {}
            : { resolvedPredicate: fixture.predicate }),
        },
      } as unknown as ExplorationSiteRuntime;

      expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
        actions: [
          {
            authoredPredicate: fixture.predicate,
          },
        ],
        offers: [
          {
            canonicalMechanicId: "replace-deck-entry",
            selectionPolicyId: null,
            starterCardPreparation,
          },
        ],
      });
      expect(
        buildExplorationActionLog(
          view,
          runtime,
          actionId,
          {},
        ),
      ).toMatchObject({
        authoredPredicate: fixture.predicate,
        requestedSelection: {},
        starterCardPreparation,
      });
      expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
        authoredPredicate: fixture.predicate,
        starterCardPreparation,
        starterCardReplacements: fixture.replacement ? [replacement] : [],
        resolvedPredicate: fixture.predicate,
        terminalOutcome: {
          kind: "starter-card-mutation",
          purgedCardIds: [replacement.purgedCardId],
          purgedEntryIds: [replacement.purgedEntryId],
          purgedEntrySnapshots: [purgedEntry],
          starterCardReplacements: fixture.replacement ? [replacement] : [],
          resolvedPredicate: fixture.predicate,
        },
      });
      expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
        authoredPredicate: fixture.predicate,
        starterCardPreparation,
        purgedCardIds: [replacement.purgedCardId],
        purgedEntryIds: [replacement.purgedEntryId],
        purgedEntrySnapshots: [purgedEntry],
        starterCardReplacements: fixture.replacement ? [replacement] : [],
        resolvedPredicate: fixture.predicate,
        outcomeKind: "starter-card-mutation",
      });
    },
  );

  it.each([
    {
      effectKind: "transfigure-random-starter-cards",
      preparationKind: "random-count",
      authoredCount: 2,
    },
    {
      effectKind: "transfigure-all-starter-cards",
      preparationKind: "all",
      authoredCount: null,
    },
  ] as const)(
    "records the signed starter transfiguration plan and exact mappings for $effectKind",
    ({ effectKind, preparationKind, authoredCount }) => {
      const actionId = testExplorationActionId(
        `starter-transfiguration-${effectKind}`,
      );
      const bindings = [
        {
          entryId: parseDeckEntryId("starter-entry-a"),
          cardId: testCardId("starter-card-a"),
        },
        {
          entryId: parseDeckEntryId("starter-entry-b"),
          cardId: testCardId("starter-card-b"),
        },
      ];
      const targets = [
        { ...bindings[0], transfiguration: "Empowered" as const },
        { ...bindings[1], transfiguration: "Kindled" as const },
      ];
      const preparation = {
        kind: preparationKind,
        starterCards: bindings,
        eligibleStarterCards: bindings,
        targets,
        selectionRulesVersion: parseSelectionRulesVersion("starter-transfiguration-rules-v1"),
        selectionContentRevision: parseSelectionContentRevision("starter-transfiguration-content-v1"),
        selectionKey: "starter-transfiguration-selection",
        selectorSignatures: [
          "starter-target-selection",
          "starter-form-selection",
        ],
        selectorTraces: [],
        planSignature: stableDigest("starter-transfiguration-plan-signature"),
      };
      const mappings = targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      }));
      const view = {
        actions: [
          {
            id: actionId,
            effectKind,
            mechanics: {
              effectKind,
              ...(authoredCount === null ? {} : { count: authoredCount }),
            },
          },
        ],
        outcomeKind: "starter-card-transfiguration",
      } as unknown as ExplorationSiteView;
      const runtime = {
        kind: "exploration",
        encounterCardId: testCardId("starter-transfiguration-encounter"),
        actionOffers: [
          {
            actionId,
            canonicalMechanicId: "transfigure-deck-entry",
            selectionPolicyId: "uniform",
            selectionRulesVersion: preparation.selectionRulesVersion,
            selectionContentRevision: preparation.selectionContentRevision,
            selectionKey: preparation.selectionKey,
            selectionSignature: preparation.planSignature,
            selectionTraces: preparation.selectorTraces,
            starterCardTransfigurationPreparation: preparation,
            offeredCardIds: [],
            packCardIds: [],
            replacementCardIdByEntryId: {},
            transfigurationByEntryId: Object.fromEntries(
              targets.map((target) => [target.entryId, target.transfiguration]),
            ),
          },
        ],
        resolution: {
          actionId,
          selection: {},
          gainedCardIds: [],
          gainedEntryIds: [],
          gainedDreamsignIds: [],
          purgedCardIds: [],
          purgedEntryIds: [],
          purgedEntrySnapshots: [],
          starterCardReplacements: [],
          starterCardTransfigurations: mappings,
          affectedEntryIds: bindings.map((binding) => binding.entryId),
          essenceGained: 0,
        },
      } as unknown as ExplorationSiteRuntime;

      expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
        actions: [{ authoredCount }],
        offers: [
          {
            canonicalMechanicId: "transfigure-deck-entry",
            selectionPolicyId: "uniform",
            starterCardTransfigurationPreparation: preparation,
          },
        ],
      });
      expect(
        buildExplorationActionLog(
          view,
          runtime,
          actionId,
          {},
        ),
      ).toMatchObject({
        authoredCount,
        requestedSelection: {},
        starterCardTransfigurationPreparation: preparation,
      });
      expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
        authoredCount,
        starterCardTransfigurationPreparation: preparation,
        starterCardTransfigurations: mappings,
        terminalOutcome: {
          kind: "starter-card-transfiguration",
          starterCardTransfigurations: mappings,
        },
      });
      expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
        authoredCount,
        starterCardTransfigurationPreparation: preparation,
        starterCardTransfigurations: mappings,
        affectedEntryIds: bindings.map((binding) => binding.entryId),
        outcomeKind: "starter-card-transfiguration",
      });
    },
  );

  it.each([
    {
      effectKind: "transfigure-selected",
      mode: "chosen-flexible",
      actionId: "e7cd94ef-d9c6-4f18-8120-dd568eba6e32",
      selectionPolicyId: "transfiguration-value",
      predicate: "character",
      fixedTransfiguration: null,
      requestedSelection: {
        entryIds: [
          parseDeckEntryId("11111111-1111-4111-8111-111111111111"),
          parseDeckEntryId("22222222-2222-4222-8222-222222222222"),
        ],
        transfigurations: ["Empowered", "Kindled"],
      },
      preparedTargets: [],
    },
    {
      effectKind: "transfigure-random-cards",
      mode: "random-flexible",
      actionId: "609937bd-e3e9-4494-8266-845344270518",
      selectionPolicyId: "uniform",
      predicate: "survivor",
      fixedTransfiguration: null,
      requestedSelection: {},
      preparedTargets: [
        {
          entryId: parseDeckEntryId("11111111-1111-4111-8111-111111111111"),
          cardId: testCardId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          transfiguration: "Empowered",
        },
        {
          entryId: parseDeckEntryId("22222222-2222-4222-8222-222222222222"),
          cardId: testCardId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          transfiguration: "Kindled",
        },
      ],
    },
    {
      effectKind: "transfigure-fixed-random-cards",
      mode: "random-fixed",
      actionId: "93eb9f16-366c-4f8e-8fae-c32c980b1a94",
      selectionPolicyId: "uniform",
      predicate: "character",
      fixedTransfiguration: "Kindled",
      requestedSelection: {},
      preparedTargets: [
        {
          entryId: parseDeckEntryId("11111111-1111-4111-8111-111111111111"),
          cardId: testCardId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          transfiguration: "Kindled",
        },
        {
          entryId: parseDeckEntryId("22222222-2222-4222-8222-222222222222"),
          cardId: testCardId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          transfiguration: "Kindled",
        },
      ],
    },
  ] as const)(
    "records complete reconstruction data for $effectKind",
    (fixture) => {
      const encounterCardId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const eligibleCards = [
        {
          entryId: parseDeckEntryId("11111111-1111-4111-8111-111111111111"),
          cardId: testCardId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          transfigurations: ["Empowered", "Kindled"],
        },
        {
          entryId: parseDeckEntryId("22222222-2222-4222-8222-222222222222"),
          cardId: testCardId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          transfigurations: ["Kindled", "Empowered"],
        },
      ];
      const resolvedTargets =
        fixture.preparedTargets.length === 0
          ? eligibleCards.map((binding, index) => ({
              entryId: binding.entryId,
              cardId: binding.cardId,
              transfiguration: ["Empowered", "Kindled"][index],
            }))
          : fixture.preparedTargets;
      const selectorTraces = [
        {
          mechanicId: "transfigure-deck-entry",
          policyId: "uniform",
          candidateKeys: eligibleCards.map((binding) => binding.entryId),
          selectedKeys: resolvedTargets.map((target) => target.entryId),
        },
      ];
      const preparation = {
        mode: fixture.mode,
        eligibleCards,
        targets: fixture.preparedTargets,
        selectionRulesVersion: parseSelectionRulesVersion("multi-card-transfiguration-rules-v1"),
        selectionContentRevision: parseSelectionContentRevision("multi-card-content-revision"),
        selectionKey: "multi-card-selection-key",
        selectorSignatures: ["target-signature", "form-signature"],
        selectorTraces,
        planSignature: stableDigest("multi-card-plan-signature"),
      };
      const cardTransfigurations = resolvedTargets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      }));
      const mechanics = {
        effectKind: fixture.effectKind,
        predicate: fixture.predicate,
        count: 2,
        ...(fixture.fixedTransfiguration === null
          ? {}
          : { transfiguration: fixture.fixedTransfiguration }),
      };
      const view = {
        actions: [
          {
            id: fixture.actionId,
            effectKind: fixture.effectKind,
            mechanics,
          },
        ],
        outcomeKind: "multi-card-transfiguration",
      } as unknown as ExplorationSiteView;
      const runtime = {
        kind: "exploration",
        encounterCardId: testCardId(encounterCardId),
        encounterSignature: stableDigest("encounter-signature"),
        actionOffers: [
          {
            actionId: fixture.actionId,
            canonicalMechanicId: "transfigure-deck-entry",
            selectionPolicyId: fixture.selectionPolicyId,
            selectionRulesVersion: preparation.selectionRulesVersion,
            selectionContentRevision: preparation.selectionContentRevision,
            selectionKey: preparation.selectionKey,
            selectionSignature: preparation.planSignature,
            selectionTraces: selectorTraces,
            multiCardTransfigurationPreparation: preparation,
            offeredCardIds: [],
            packCardIds: [],
            replacementCardIdByEntryId: {},
            transfigurationByEntryId: Object.fromEntries(
              resolvedTargets.map((target) => [
                target.entryId,
                target.transfiguration,
              ]),
            ),
          },
        ],
        resolution: {
          actionId: fixture.actionId,
          encounterSignature: stableDigest("encounter-signature"),
          selectionRulesVersion: preparation.selectionRulesVersion,
          selectionContentRevision: preparation.selectionContentRevision,
          selectionSignature: preparation.planSignature,
          selection: fixture.requestedSelection,
          gainedCardIds: [],
          gainedDreamsignIds: [],
          purgedCardIds: [],
          cardTransfigurations,
          affectedEntryIds: cardTransfigurations.map(
            (mapping) => mapping.entryId,
          ),
          essenceGained: 0,
        },
      } as unknown as ExplorationSiteRuntime;
      const terminalOutcome = {
        kind: "multi-card-transfiguration",
        cardTransfigurations,
        affectedEntryIds: cardTransfigurations.map(
          (mapping) => mapping.entryId,
        ),
      };

      expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
        presentedCardId: encounterCardId,
        actions: [
          {
            actionId: fixture.actionId,
            authoredPredicate: fixture.predicate,
            authoredCount: 2,
            authoredFixedTransfiguration: fixture.fixedTransfiguration,
          },
        ],
        offers: [
          {
            actionId: fixture.actionId,
            canonicalMechanicId: "transfigure-deck-entry",
            selectionPolicyId: fixture.selectionPolicyId,
            selectionSignature: preparation.planSignature,
            selectionTraces: selectorTraces,
            multiCardTransfigurationPreparation: preparation,
          },
        ],
        terminalOutcome,
      });

      const actionLog = buildExplorationActionLog(
        view,
        runtime,
        testExplorationActionId(fixture.actionId),
        fixture.requestedSelection,
      );
      expect(actionLog).toMatchObject({
        presentedCardId: encounterCardId,
        actionId: fixture.actionId,
        authoredPredicate: fixture.predicate,
        authoredCount: 2,
        authoredFixedTransfiguration: fixture.fixedTransfiguration,
        selectionContentRevision: preparation.selectionContentRevision,
        multiCardTransfigurationPreparation: preparation,
        terminalOutcome,
      });
      expect(actionLog.requestedSelection).toEqual(fixture.requestedSelection);
      expect(actionLog.rawSelection).toEqual(fixture.requestedSelection);

      expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
        presentedCardId: encounterCardId,
        actionId: fixture.actionId,
        authoredPredicate: fixture.predicate,
        authoredCount: 2,
        authoredFixedTransfiguration: fixture.fixedTransfiguration,
        selection: fixture.requestedSelection,
        rawSelection: fixture.requestedSelection,
        multiCardTransfigurationPreparation: preparation,
        cardTransfigurations,
        affectedEntryIds: cardTransfigurations.map(
          (mapping) => mapping.entryId,
        ),
        terminalOutcome,
      });

      expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
        presentedCardId: encounterCardId,
        actionId: fixture.actionId,
        authoredPredicate: fixture.predicate,
        authoredCount: 2,
        authoredFixedTransfiguration: fixture.fixedTransfiguration,
        selection: fixture.requestedSelection,
        rawSelection: fixture.requestedSelection,
        multiCardTransfigurationPreparation: preparation,
        cardTransfigurations,
        affectedEntryIds: cardTransfigurations.map(
          (mapping) => mapping.entryId,
        ),
        terminalOutcome,
      });
    },
  );

  it.each([
    {
      caseName: "partial",
      selectedEntryIds: ["11111111-1111-4111-8111-111111111111"],
    },
    {
      caseName: "maximum",
      selectedEntryIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
    },
  ] as const)(
    "records T8 $caseName chosen replacement reconstruction",
    ({ selectedEntryIds }) => {
      const actionId = testExplorationActionId("8eb89438-d367-4c52-be5b-abd76324cd80");
      const encounterCardId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const bindings = [
        {
          sourceEntryId: parseDeckEntryId("11111111-1111-4111-8111-111111111111"),
          sourceCardId: testCardId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
          replacementCardId: testCardId("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
        },
        {
          sourceEntryId: parseDeckEntryId("22222222-2222-4222-8222-222222222222"),
          sourceCardId: testCardId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          replacementCardId: testCardId("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
        },
      ];
      const selectorTraces = bindings.map((binding) => ({
        mechanicId: "gain-card",
        policyId: "card-fit-quality",
        selectionKey: `${actionId}:replacement:${binding.sourceEntryId}`,
        constraints: {
          predicate: "event",
          cardScope: "draft-pool",
          excludeOwned: true,
          excludedCardUuids: [encounterCardId, binding.sourceCardId],
        },
        selectedKeys: [binding.replacementCardId],
      }));
      const preparation = {
        kind: "chosen-replacement",
        predicate: "event",
        authoredMaximumCount: 2,
        bindings,
        selectionRulesVersion: parseSelectionRulesVersion("replacement-rules-v1"),
        selectionContentRevision: parseSelectionContentRevision("replacement-content-revision"),
        selectionKey: actionId,
        selectorSignatures: [
          "replacement-signature-a",
          "replacement-signature-b",
        ],
        selectorTraces,
        planSignature: stableDigest("replacement-plan-signature"),
      };
      const selectedEntryIdSet = new Set<string>(selectedEntryIds);
      const selectedBindings = bindings.filter((binding) =>
        selectedEntryIdSet.has(binding.sourceEntryId),
      );
      const cardReplacements = selectedBindings.map((binding, index) => ({
        sourceEntryId: binding.sourceEntryId,
        sourceCardId: binding.sourceCardId,
        replacementEntryId: parseDeckEntryId(
          [
            "44444444-4444-4444-8444-444444444444",
            "55555555-5555-4555-8555-555555555555",
          ][index],
        ),
        replacementCardId: binding.replacementCardId,
      }));
      const purgedEntrySnapshots = selectedBindings.map((binding, index) => ({
        entryId: binding.sourceEntryId,
        cardNumber: index + 1,
        transfiguration: null,
        typeChange: null,
        isBane: false,
      }));
      const selection = { entryIds: [...selectedEntryIds] };
      const view = {
        actions: [
          {
            id: actionId,
            effectKind: "replace-selected",
            mechanics: {
              effectKind: "replace-selected",
              predicate: "event",
              count: 2,
            },
          },
        ],
        outcomeKind: "card-replacements",
      } as unknown as ExplorationSiteView;
      const runtime = {
        kind: "exploration",
        encounterCardId: testCardId(encounterCardId),
        encounterSignature: stableDigest("replacement-encounter-signature"),
        actionOffers: [
          {
            actionId,
            canonicalMechanicId: "replace-deck-entry",
            selectionPolicyId: "card-fit-quality",
            selectionRulesVersion: preparation.selectionRulesVersion,
            selectionContentRevision: preparation.selectionContentRevision,
            selectionKey: preparation.selectionKey,
            selectionSignature: preparation.planSignature,
            selectionTraces: selectorTraces,
            multiCardReplacementPreparation: preparation,
            offeredCardIds: [],
            packCardIds: [],
            replacementCardIdByEntryId: {},
            transfigurationByEntryId: {},
          },
        ],
        resolution: {
          actionId,
          encounterSignature: stableDigest("replacement-encounter-signature"),
          selectionRulesVersion: preparation.selectionRulesVersion,
          selectionContentRevision: preparation.selectionContentRevision,
          selectionSignature: preparation.planSignature,
          selection,
          gainedCardIds: cardReplacements.map(
            (mapping) => mapping.replacementCardId,
          ),
          gainedEntryIds: cardReplacements
            .map((mapping) => mapping.replacementEntryId)
            .map(parseDeckEntryId),
          gainedDreamsignIds: [],
          purgedCardIds: cardReplacements.map(
            (mapping) => mapping.sourceCardId,
          ),
          purgedEntryIds: cardReplacements.map(
            (mapping) => mapping.sourceEntryId,
          ),
          purgedEntrySnapshots,
          cardReplacements,
          affectedEntryIds: cardReplacements.map(
            (mapping) => mapping.sourceEntryId,
          ),
          essenceGained: 0,
          resolvedPredicate: "event",
        },
      } as unknown as ExplorationSiteRuntime;

      const entryLog = buildExplorationEntryLog(view, runtime);
      expect(entryLog).toMatchObject({
        presentedCardId: encounterCardId,
        actions: [{ authoredPredicate: "event", authoredCount: 2 }],
        offers: [
          {
            canonicalMechanicId: "replace-deck-entry",
            selectionPolicyId: "card-fit-quality",
            selectionTraces: selectorTraces,
            selectorSignatures: preparation.selectorSignatures,
            multiCardReplacementPreparation: preparation,
          },
        ],
        validatedSelection: selection,
        terminalOutcome: {
          multiCardReplacementPreparation: preparation,
          cardReplacements,
          purgedEntrySnapshots,
          gainedCardIds: cardReplacements.map(
            (mapping) => mapping.replacementCardId,
          ),
          gainedEntryIds: cardReplacements
            .map((mapping) => mapping.replacementEntryId)
            .map(parseDeckEntryId),
        },
      });
      expect(
        buildExplorationActionLog(
          view,
          runtime,
          actionId,
          selection,
        ),
      ).toMatchObject({
        rawSelection: selection,
        validatedSelection: selection,
        selectorSignatures: preparation.selectorSignatures,
        multiCardReplacementPreparation: preparation,
        terminalOutcome: { cardReplacements },
      });
      expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
        rawSelection: selection,
        validatedSelection: selection,
        selectorSignatures: preparation.selectorSignatures,
        multiCardReplacementPreparation: preparation,
        cardReplacements,
        purgedEntrySnapshots,
        terminalOutcome: { cardReplacements },
      });
      expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
        rawSelection: selection,
        validatedSelection: selection,
        selectorSignatures: preparation.selectorSignatures,
        multiCardReplacementPreparation: preparation,
        cardReplacements,
        purgedEntrySnapshots,
        terminalOutcome: { cardReplacements },
      });
    },
  );

  it("records a rejected T8 zero-card intent without inventing a validated result", () => {
    const actionId = testExplorationActionId("8eb89438-d367-4c52-be5b-abd76324cd80");
    const selection = { entryIds: ([] as string[]).map(parseDeckEntryId) };
    const preparation = {
      kind: "chosen-replacement" as const,
      predicate: "event" as const,
      authoredMaximumCount: 2,
      bindings: [],
      selectionRulesVersion: parseSelectionRulesVersion("replacement-rules-v1"),
      selectionContentRevision: parseSelectionContentRevision("replacement-content-revision"),
      selectionKey: actionId,
      selectorSignatures: [],
      selectorTraces: [],
      unavailableReason: "requires-eligible-card" as const,
      planSignature: stableDigest("unavailable-replacement-plan-signature"),
    };
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "replace-selected",
          mechanics: {
            effectKind: "replace-selected",
            predicate: "event",
            count: 2,
          },
        },
      ],
      outcomeKind: null,
    } as unknown as ExplorationSiteView;
    const runtime = {
      kind: "exploration",
      encounterCardId: testCardId("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "replace-deck-entry",
          selectionPolicyId: "card-fit-quality",
          multiCardReplacementPreparation: preparation,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: null,
    } as unknown as ExplorationSiteRuntime;

    expect(
      buildExplorationActionLog(
        view,
        runtime,
        actionId,
        selection,
      ),
    ).toMatchObject({
      rawSelection: selection,
      requestedSelection: selection,
      validatedSelection: null,
      multiCardReplacementPreparation: preparation,
      terminalOutcome: null,
    });
  });

  it("records T21 exact fixed-form multi-card transfiguration reconstruction", () => {
    const actionId = testExplorationActionId("3ac54fa8-0634-4feb-8930-2caf30f6cfc8");
    const eligibleCards = [
      {
        entryId: parseDeckEntryId("11111111-1111-4111-8111-111111111111"),
        cardId: testCardId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        transfigurations: ["Kindled"],
      },
      {
        entryId: parseDeckEntryId("22222222-2222-4222-8222-222222222222"),
        cardId: testCardId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
        transfigurations: ["Kindled"],
      },
    ];
    const preparation = {
      mode: "chosen-fixed",
      eligibleCards,
      targets: [],
      selectionRulesVersion: parseSelectionRulesVersion("fixed-transfiguration-rules-v1"),
      selectionContentRevision: parseSelectionContentRevision("fixed-transfiguration-content-revision"),
      selectionKey: actionId,
      selectorSignatures: [],
      selectorTraces: [],
      planSignature: stableDigest("fixed-transfiguration-plan-signature"),
    };
    const selection = {
      entryIds: eligibleCards.map((binding) => binding.entryId),
    };
    const cardTransfigurations = eligibleCards.map((binding) => ({
      entryId: binding.entryId,
      cardId: binding.cardId,
      beforeTransfiguration: null,
      afterTransfiguration: "Kindled",
    }));
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "transfigure-fixed-selected",
          mechanics: {
            effectKind: "transfigure-fixed-selected",
            predicate: "warrior",
            count: 2,
            transfiguration: "Kindled",
            deckTarget: "chosen",
          },
        },
      ],
      outcomeKind: "multi-card-transfiguration",
    } as unknown as ExplorationSiteView;
    const runtime = {
      kind: "exploration",
      encounterCardId: testCardId("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "transfigure-deck-entry",
          selectionPolicyId: "transfiguration-value",
          selectionSignature: preparation.planSignature,
          multiCardTransfigurationPreparation: preparation,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId,
        selection,
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        cardTransfigurations,
        affectedEntryIds: selection.entryIds,
        essenceGained: 0,
      },
    } as unknown as ExplorationSiteRuntime;

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      actions: [
        {
          authoredPredicate: "warrior",
          authoredCount: 2,
          authoredFixedTransfiguration: "Kindled",
        },
      ],
      offers: [{ multiCardTransfigurationPreparation: preparation }],
      terminalOutcome: {
        multiCardTransfigurationPreparation: preparation,
        cardTransfigurations,
      },
    });
    expect(
      buildExplorationActionLog(
        view,
        runtime,
        actionId,
        selection,
      ),
    ).toMatchObject({
      rawSelection: selection,
      validatedSelection: selection,
      multiCardTransfigurationPreparation: preparation,
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      multiCardTransfigurationPreparation: preparation,
      cardTransfigurations,
      affectedEntryIds: selection.entryIds,
      terminalOutcome: { cardTransfigurations },
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      multiCardTransfigurationPreparation: preparation,
      cardTransfigurations,
      affectedEntryIds: selection.entryIds,
      terminalOutcome: { cardTransfigurations },
    });
  });

  it("records T52 automatic copy targeting and exact minted mappings", () => {
    const actionId = testExplorationActionId("979618b2-de06-40fa-9910-488dee6b3c24");
    const targets = [
      {
        entryId: parseDeckEntryId("11111111-1111-4111-8111-111111111111"),
        cardId: testCardId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      },
      {
        entryId: parseDeckEntryId("22222222-2222-4222-8222-222222222222"),
        cardId: testCardId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      },
    ];
    const selectorTrace = {
      mechanicId: "duplicate-deck-entry",
      policyId: "uniform",
      selectedKeys: targets.map((target) => target.entryId),
    };
    const preparation = {
      effectKind: "copy-random-cards",
      count: 2,
      predicate: "event",
      eligibleCards: targets,
      targets,
      selectionRulesVersion: parseSelectionRulesVersion("random-target-rules-v1"),
      selectionContentRevision: parseSelectionContentRevision("random-target-content-revision"),
      selectionKey: actionId,
      selectorSignature: stableDigest("random-copy-selector-signature"),
      selectorTrace,
      planSignature: stableDigest("random-copy-plan-signature"),
    };
    const cardCopies = targets.map((target, index) => ({
      sourceEntryId: target.entryId,
      sourceCardId: target.cardId,
      mintedEntryId: parseDeckEntryId(
        [
          "44444444-4444-4444-8444-444444444444",
          "55555555-5555-4555-8555-555555555555",
        ][index],
      ),
      mintedCardId: target.cardId,
    }));
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "copy-random-cards",
          mechanics: {
            effectKind: "copy-random-cards",
            predicate: "event",
            count: 2,
          },
        },
      ],
      outcomeKind: "card-copies-multiple",
    } as unknown as ExplorationSiteView;
    const runtime = {
      kind: "exploration",
      encounterCardId: testCardId("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "duplicate-deck-entry",
          selectionPolicyId: "uniform",
          selectionSignature: preparation.planSignature,
          selectionTrace: selectorTrace,
          randomDeckTargetPreparation: preparation,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId,
        selection: {},
        gainedCardIds: cardCopies.map((mapping) => mapping.mintedCardId),
        gainedEntryIds: cardCopies
          .map((mapping) => mapping.mintedEntryId)
          .map(parseDeckEntryId),
        gainedDreamsignIds: [],
        purgedCardIds: [],
        cardCopies,
        affectedEntryIds: cardCopies.map((mapping) => mapping.sourceEntryId),
        essenceGained: 0,
        resolvedPredicate: "event",
      },
    } as unknown as ExplorationSiteRuntime;

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      actions: [{ authoredPredicate: "event", authoredCount: 2 }],
      offers: [
        {
          canonicalMechanicId: "duplicate-deck-entry",
          selectionPolicyId: "uniform",
          selectionTrace: selectorTrace,
          selectorSignatures: [preparation.selectorSignature],
          randomDeckTargetPreparation: preparation,
        },
      ],
      terminalOutcome: {
        randomDeckTargetPreparation: preparation,
        cardCopies,
      },
    });
    expect(
      buildExplorationActionLog(
        view,
        runtime,
        actionId,
        {},
      ),
    ).toMatchObject({
      rawSelection: {},
      validatedSelection: {},
      randomDeckTargetPreparation: preparation,
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      randomDeckTargetPreparation: preparation,
      cardCopies,
      gainedCardIds: cardCopies.map((mapping) => mapping.mintedCardId),
      mintedEntryIds: cardCopies
        .map((mapping) => mapping.mintedEntryId)
        .map(parseDeckEntryId),
      terminalOutcome: { cardCopies },
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      randomDeckTargetPreparation: preparation,
      cardCopies,
      gainedCardIds: cardCopies.map((mapping) => mapping.mintedCardId),
      mintedEntryIds: cardCopies
        .map((mapping) => mapping.mintedEntryId)
        .map(parseDeckEntryId),
      terminalOutcome: { cardCopies },
    });
  });

  it("records T54 automatic targets and exact before/after type overrides", () => {
    const actionId = testExplorationActionId("f2a61678-17b0-4d50-b75c-f1de61fa0d5c");
    const targets = [
      {
        entryId: parseDeckEntryId("11111111-1111-4111-8111-111111111111"),
        cardId: testCardId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      },
      {
        entryId: parseDeckEntryId("22222222-2222-4222-8222-222222222222"),
        cardId: testCardId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      },
    ];
    const selectorTrace = {
      mechanicId: "change-entry-card-type",
      policyId: "uniform",
      selectedKeys: targets.map((target) => target.entryId),
    };
    const preparation = {
      effectKind: "change-random-card-type",
      count: 2,
      cardType: "Event",
      eligibleCards: targets,
      targets,
      selectionRulesVersion: parseSelectionRulesVersion("random-target-rules-v1"),
      selectionContentRevision: parseSelectionContentRevision("random-target-content-revision"),
      selectionKey: actionId,
      selectorSignature: stableDigest("random-type-selector-signature"),
      selectorTrace,
      planSignature: stableDigest("random-type-plan-signature"),
    };
    const afterTypeChange = {
      predicateId: "exploration:card-type:Event",
      cardType: "Event",
      subtype: "",
      label: "Event",
    };
    const cardTypeChanges = [
      {
        entryId: targets[0].entryId,
        cardId: targets[0].cardId,
        beforeCardType: "Character",
        afterCardType: "Event",
        beforeTypeChange: null,
        afterTypeChange,
      },
      {
        entryId: targets[1].entryId,
        cardId: targets[1].cardId,
        beforeCardType: "Character",
        afterCardType: "Event",
        beforeTypeChange: {
          predicateId: "exploration:card-type:Character",
          cardType: "Character",
          subtype: "Warrior",
          label: "Character",
        },
        afterTypeChange,
      },
    ];
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "change-random-card-type",
          mechanics: {
            effectKind: "change-random-card-type",
            count: 2,
            cardType: "Event",
          },
        },
      ],
      outcomeKind: "card-type-changes",
    } as unknown as ExplorationSiteView;
    const runtime = {
      kind: "exploration",
      encounterCardId: testCardId("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "change-entry-card-type",
          selectionPolicyId: "uniform",
          selectionSignature: preparation.planSignature,
          selectionTrace: selectorTrace,
          randomDeckTargetPreparation: preparation,
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
        cardTypeChanges,
        affectedEntryIds: targets.map((target) => target.entryId),
        essenceGained: 0,
        resolvedCardType: "Event",
      },
    } as unknown as ExplorationSiteRuntime;

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      actions: [{ authoredCount: 2, authoredCardType: "Event" }],
      offers: [
        {
          canonicalMechanicId: "change-entry-card-type",
          selectionPolicyId: "uniform",
          selectionTrace: selectorTrace,
          selectorSignatures: [preparation.selectorSignature],
          randomDeckTargetPreparation: preparation,
        },
      ],
      terminalOutcome: {
        randomDeckTargetPreparation: preparation,
        cardTypeChanges,
        resolvedCardType: "Event",
      },
    });
    expect(
      buildExplorationActionLog(
        view,
        runtime,
        actionId,
        {},
      ),
    ).toMatchObject({
      authoredCardType: "Event",
      rawSelection: {},
      validatedSelection: {},
      randomDeckTargetPreparation: preparation,
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      authoredCardType: "Event",
      randomDeckTargetPreparation: preparation,
      cardTypeChanges,
      resolvedCardType: "Event",
      terminalOutcome: { cardTypeChanges, resolvedCardType: "Event" },
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      authoredCardType: "Event",
      randomDeckTargetPreparation: preparation,
      cardTypeChanges,
      resolvedCardType: "Event",
      terminalOutcome: { cardTypeChanges, resolvedCardType: "Event" },
    });
  });

  it("records the T53 disclosed plan, selector, automatic intent, and exact type outcome at every boundary", () => {
    const actionId = testExplorationActionId("b59b7e6a-aa32-428a-9397-06766ebe9b7d");
    const target = {
      entryId: parseDeckEntryId("11111111-1111-4111-8111-111111111153"),
      cardId: testCardId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa53"),
    };
    const selectorTrace = {
      mechanicId: "change-entry-card-type",
      policyId: "deck-entry-centrality",
      selectedKeys: [target.entryId],
    };
    const preparation = {
      effectKind: "change-card-type-selected" as const,
      cardType: "Character" as const,
      eligibleCards: [target],
      target,
      selectionRulesVersion: parseSelectionRulesVersion("2"),
      selectionContentRevision: parseSelectionContentRevision("disclosed-content-revision"),
      selectionKey: `${actionId}:disclosed-deck-target`,
      selectorSignature: stableDigest("disclosed-selector-signature"),
      selectorTrace: selectorTrace as never,
      planSignature: stableDigest("disclosed-plan-signature"),
    };
    const afterTypeChange = {
      predicateId: "exploration:card-type:character",
      cardType: "Character" as const,
      subtype: "",
      label: "Character",
    };
    const cardTypeChanges = [
      {
        entryId: target.entryId,
        cardId: target.cardId,
        beforeCardType: "Event" as const,
        afterCardType: "Character" as const,
        beforeTypeChange: null,
        afterTypeChange,
      },
    ];
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "change-card-type-selected",
          mechanics: {
            effectKind: "change-card-type-selected",
            cardType: "Character",
            deckTarget: "offered",
          },
        },
      ],
      outcomeKind: "card-type-changes",
    } as unknown as ExplorationSiteView;
    const runtime = {
      kind: "exploration",
      encounterCardId: testCardId("cccccccc-cccc-4ccc-8ccc-cccccccccc53"),
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "change-entry-card-type",
          selectionPolicyId: "deck-entry-centrality",
          selectionRulesVersion: preparation.selectionRulesVersion,
          selectionContentRevision: preparation.selectionContentRevision,
          selectionKey: preparation.selectionKey,
          selectionSignature: preparation.planSignature,
          selectionTrace: preparation.selectorTrace,
          disclosedDeckTargetPreparation: preparation,
          offeredCardIds: [],
          offeredDeckEntryIds: [target.entryId],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId,
        selection: { entryIds: [target.entryId] },
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [target.entryId],
        cardTypeChanges,
        resolvedCardType: "Character",
        essenceGained: 0,
      },
    } as unknown as ExplorationSiteRuntime;

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      actions: [
        {
          authoredCardType: "Character",
          authoredDeckTarget: "offered",
        },
      ],
      offers: [
        {
          selectorSignatures: [preparation.selectorSignature],
          disclosedDeckTargetPreparation: preparation,
          offeredDeckEntryIds: [target.entryId],
        },
      ],
      terminalOutcome: {
        disclosedDeckTargetPreparation: preparation,
        cardTypeChanges,
      },
    });
    expect(
      buildExplorationActionLog(
        view,
        runtime,
        actionId,
        {
          entryIds: [target.entryId],
        },
      ),
    ).toMatchObject({
      disclosedDeckTargetPreparation: preparation,
      rawSelection: { entryIds: [target.entryId] },
      validatedSelection: { entryIds: [target.entryId] },
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      disclosedDeckTargetPreparation: preparation,
      cardTypeChanges,
      terminalOutcome: { cardTypeChanges },
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      disclosedDeckTargetPreparation: preparation,
      cardTypeChanges,
      terminalOutcome: { cardTypeChanges },
    });
  });

  it("records the complete fixed-site plan and persisted insertion at every log boundary", () => {
    const actionId = testExplorationActionId("41000000-0000-4000-8000-000000000041");
    const insertedSite = {
      id: parseSiteId("site-exploration-source-action"),
      type: "Duplication" as const,
      isEnhanced: false,
      isVisited: false,
    };
    const preparation = {
      sourceSiteId: parseSiteId("source-exploration-site"),
      sourceActionId: actionId,
      targetNodeId: parseAtlasNodeId("current-atlas-node"),
      insertionIndex: 3,
      siblingSiteIdsBefore: [
        parseSiteId("site-a"),
        parseSiteId("site-b"),
        parseSiteId("source-exploration-site"),
      ],
      insertedSite,
      planSignature: stableDigest("site-insertion-plan-signature"),
    };
    const insertion = {
      targetNodeId: preparation.targetNodeId,
      insertionIndex: preparation.insertionIndex,
      siblingSiteIdsBefore: preparation.siblingSiteIdsBefore,
      insertedSite,
    };
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "add-fixed-site",
          mechanics: {
            effectKind: "add-fixed-site",
            siteType: "Duplication",
          },
        },
      ],
      outcomeKind: "site-insertion",
    } as unknown as ExplorationSiteView;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
          canonicalMechanicId: "add-site",
          selectionPolicyId: "fixed",
          selectionRulesVersion: parseSelectionRulesVersion("selection-rules-v1"),
          selectionContentRevision: parseSelectionContentRevision("sites-fold-v1"),
          selectionKey: parseSelectionKey(actionId),
          selectionSignature: preparation.planSignature,
          siteInsertionPreparation: preparation,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: actionId,
        selectionRulesVersion: parseSelectionRulesVersion("selection-rules-v1"),
        selectionContentRevision: parseSelectionContentRevision("sites-fold-v1"),
        selectionSignature: preparation.planSignature,
        selection: {},
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [],
        essenceGained: 0,
        siteInsertion: insertion,
      },
    };

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      actions: [{ authoredSiteType: "Duplication" }],
      offers: [
        {
          authoredSiteType: "Duplication",
          selectionSignature: preparation.planSignature,
          siteInsertionPreparation: preparation,
          offeredSiteType: null,
        },
      ],
      terminalOutcome: {
        authoredSiteType: "Duplication",
        selectionSignature: preparation.planSignature,
        siteInsertionPreparation: preparation,
        siteInsertion: insertion,
      },
    });
    expect(
      buildExplorationActionLog(
        view,
        runtime,
        actionId,
        {},
      ),
    ).toMatchObject({
      authoredSiteType: "Duplication",
      requestedSelection: {},
      validatedSelection: {},
      selectionSignature: preparation.planSignature,
      siteInsertionPreparation: preparation,
      offeredSiteType: null,
      terminalOutcome: { siteInsertion: insertion },
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      authoredSiteType: "Duplication",
      rawSelection: {},
      selectionSignature: preparation.planSignature,
      siteInsertionPreparation: preparation,
      siteInsertion: insertion,
      terminalOutcome: { siteInsertion: insertion },
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      authoredSiteType: "Duplication",
      selection: {},
      selectionSignature: preparation.planSignature,
      siteInsertionPreparation: preparation,
      siteInsertion: insertion,
      terminalOutcome: { siteInsertion: insertion },
    });
  });

  it("records the signed site-type offer, exact choice, and insertion at every log boundary", () => {
    const actionId = testExplorationActionId("46000000-0000-4000-8000-000000000046");
    const preparedSiteId = "site-exploration-source-choice-action";
    const choices = ["Shop", "Purge", "Transfiguration"].map((siteType) => ({
      siteType,
      insertedSite: {
        id: parseSiteId(preparedSiteId),
        type: siteType,
        isEnhanced: false,
        isVisited: false,
      },
    }));
    const preparation = {
      sourceSiteId: parseSiteId("source-exploration-site"),
      sourceActionId: actionId,
      targetNodeId: parseAtlasNodeId("current-atlas-node"),
      insertionIndex: 3,
      siblingSiteIdsBefore: ["site-a", "site-b", "source-exploration-site"],
      choices,
      selectorSignature: stableDigest("site-type-selector-signature"),
      planSignature: stableDigest("site-type-choice-plan-signature"),
    };
    const selectionTrace = {
      mechanicId: "add-site",
      policyId: "site-uniform",
      selectionKey: actionId,
      selectedKeys: choices.map((choice) => choice.siteType),
    };
    const selection = { siteType: "Purge" };
    const insertion = {
      targetNodeId: preparation.targetNodeId,
      insertionIndex: preparation.insertionIndex,
      siblingSiteIdsBefore: preparation.siblingSiteIdsBefore,
      insertedSite: choices[1].insertedSite,
    };
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "choose-site-type",
          mechanics: {
            effectKind: "choose-site-type",
            offerCount: 3,
          },
        },
      ],
      outcomeKind: "site-insertion",
    } as unknown as ExplorationSiteView;
    const runtime = {
      kind: "exploration",
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "add-site",
          selectionPolicyId: "site-uniform",
          selectionRulesVersion: parseSelectionRulesVersion("selection-rules-v1"),
          selectionContentRevision: parseSelectionContentRevision("sites-fold-v1"),
          selectionKey: actionId,
          selectionSignature: preparation.planSignature,
          selectionTrace,
          siteTypeChoicePreparation: preparation,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId,
        selectionRulesVersion: parseSelectionRulesVersion("selection-rules-v1"),
        selectionContentRevision: parseSelectionContentRevision("sites-fold-v1"),
        selectionSignature: preparation.planSignature,
        selection,
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [],
        essenceGained: 0,
        siteInsertion: insertion,
      },
    } as unknown as ExplorationSiteRuntime;
    const preparedFields = {
      authoredOfferCount: 3,
      siteTypeChoicePreparation: preparation,
      offeredSiteTypes: ["Shop", "Purge", "Transfiguration"],
      selectorSignature: preparation.selectorSignature,
      planSignature: preparation.planSignature,
      sourceSiteId: preparation.sourceSiteId,
      preparedTargetNodeId: preparation.targetNodeId,
      preparedInsertionIndex: preparation.insertionIndex,
      preparedSiblingSiteIdsBefore: preparation.siblingSiteIdsBefore,
    };

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      actions: [{ authoredOfferCount: 3 }],
      offers: [
        {
          ...preparedFields,
          selectionTrace,
          selectorSignatures: [preparation.selectorSignature],
          offeredSiteType: null,
        },
      ],
      rawSelection: selection,
      validatedSelection: selection,
      terminalOutcome: {
        ...preparedFields,
        rawSelection: selection,
        validatedSelection: selection,
        chosenSiteType: "Purge",
        siteInsertion: insertion,
      },
    });
    expect(
      buildExplorationActionLog(
        view,
        runtime,
        actionId,
        selection,
      ),
    ).toMatchObject({
      ...preparedFields,
      requestedSelection: selection,
      rawSelection: selection,
      validatedSelection: selection,
      requestedSiteType: "Purge",
      validatedSiteType: "Purge",
      terminalOutcome: { chosenSiteType: "Purge", siteInsertion: insertion },
    });
    expect(buildExplorationResolutionLog(view, runtime)).toMatchObject({
      ...preparedFields,
      rawSelection: selection,
      validatedSelection: selection,
      chosenSiteType: "Purge",
      siteInsertion: insertion,
      terminalOutcome: { chosenSiteType: "Purge", siteInsertion: insertion },
    });
    expect(buildExplorationCompletionLog(view, runtime)).toMatchObject({
      ...preparedFields,
      selection,
      rawSelection: selection,
      validatedSelection: selection,
      chosenSiteType: "Purge",
      siteInsertion: insertion,
      terminalOutcome: { chosenSiteType: "Purge", siteInsertion: insertion },
    });
  });

  it("retains the disclosed-site random selection trace for template 84", () => {
    const actionId = testExplorationActionId("84000000-0000-4000-8000-000000000084");
    const selectionTrace = {
      mechanicId: "add-site" as const,
      policyId: "uniform" as const,
      selectedKeys: ["Shop"],
    };
    const view = {
      actions: [
        {
          id: actionId,
          effectKind: "add-site",
          mechanics: { effectKind: "add-site" },
        },
      ],
      outcomeKind: null,
    } as unknown as ExplorationSiteView;
    const runtime = {
      kind: "exploration",
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId,
          canonicalMechanicId: "add-site",
          selectionPolicyId: "uniform",
          selectionSignature: stableDigest("template-84-selection-signature"),
          selectionTrace,
          offeredSiteType: "Shop",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: null,
    } as unknown as ExplorationSiteRuntime;

    expect(buildExplorationEntryLog(view, runtime)).toMatchObject({
      offers: [
        {
          offeredSiteType: "Shop",
          selectionSignature: stableDigest("template-84-selection-signature"),
          selectionTrace,
          siteInsertionPreparation: null,
        },
      ],
    });
    expect(
      buildExplorationActionLog(
        view,
        runtime,
        actionId,
        {
          siteType: "Shop",
        },
      ),
    ).toMatchObject({
      offeredSiteType: "Shop",
      selectionSignature: stableDigest("template-84-selection-signature"),
      selectionTrace,
      siteInsertionPreparation: null,
    });
  });
});
