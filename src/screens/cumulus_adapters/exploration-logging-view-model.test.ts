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
            templateId: 55,
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
          mechanics: { templateId: 55, offerCount: 4 },
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
      authoredMechanics: { templateId: 55, offerCount: 4 },
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
            templateId: 37,
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
      authoredMechanics: { templateId: 37 },
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
