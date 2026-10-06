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
import {
  testCardId,
  testExplorationActionId,
} from "../../types/test-identities";
import { parseSelectionContentRevision } from "../../types/selection-content-revision";
import {
  parseSelectionRulesVersion,
  SELECTION_RULES_VERSION,
} from "../../reward-selection/types";

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
      selectionContentRevision:
        parseSelectionContentRevision("content-revision"),
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
          preparation: { kind: "compound-action", plan: preparation },
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
      buildExplorationActionLog(view, runtime, actionId, selection),
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
      selectionRulesVersion: SELECTION_RULES_VERSION,
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
          canonicalMechanicId: "duplicate-deck-entry",
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
      selectionRulesVersion: SELECTION_RULES_VERSION,
      encounterCardId: testCardId("encounter-card-uuid"),
      actionOffers: [
        {
          actionId: actionId,
          canonicalMechanicId: "next-site-transfiguration",
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
});
