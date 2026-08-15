import {
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../../data/sites-data";
import { buildCardSourceDebugState } from "../../debug/card-source-debug";
import { auguryArchetype } from "../../data/augury-data";
import { requireGuideForSiteType } from "../../data/dreamscapes";
import type { JourneyContent } from "../../data/journey-content";
import {
  buildAuguryContext,
  buildAuguryDeckSnapshot,
  generateAuguryEncounterWithDebug,
  resolveOfferPresentation,
} from "../../journey_v2";
import {
  buildCategoryUniverse,
  type AuguryCategory,
} from "../../journey_v2/archetypes/categories";
import type {
  AuguryAcceptRequest,
  AuguryCatalogCard,
  AuguryContext,
  AuguryDeclineRequest,
  AuguryDeckCard,
  AuguryEncounter,
  AuguryEncounterGenerationDebug,
  AuguryGameObject,
  AuguryOffer,
  AuguryOfferActionResult,
} from "../../journey_v2";
import type { AuguryDeckSnapshot } from "../../journey_v2/trace/deckSnapshot";
import {
  parseAuguryCardViewId,
  parseOfferTileId,
} from "../../types/identifiers";
import type { CardData } from "../../types/cards";
import type { CardId } from "../../types/card-identity";
import type { LocalizedString } from "@trox/runtime";
import { localizedDreamsign } from "../../cumulus/components/hud/localized-dreamsign";
import type { DreamGuideContent } from "../../types/content";
import type { SitesData } from "../../types/sites-data";
import type {
  CardSourceDebugState,
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import { glyph } from "../../cumulus/primitives/glyph";
import type {
  OfferTileBundleCards,
  OfferTileCardChoices,
  OfferTileCategory,
  OfferTileDreamsign,
  OfferTileDuplicateCards,
  OfferTileModel,
  OfferTileStarterCards,
} from "../../cumulus/components/controls/OfferTile";
import type { DreamscapeSiteModel } from "../../cumulus/components/dreamscape/SiteNode";
import { localizedSourceText } from "../../runtime/localization/runtime";
import type {
  AuguryCardChoiceView,
  AuguryCardView,
  AuguryGuideView,
  AuguryOfferView,
  AuguryOfferVisualView,
  AugurySiteView,
} from "../../cumulus/screens/AugurySiteScreen";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { projectGuideView } from "./guide-view-model";
import { tx } from "@trox/runtime";
import type { GuideId } from "../../types/identifiers";
import type { OfferId } from "../../types/identifiers";
import type { ChoiceId } from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";

type CardObject = AuguryCatalogCard | AuguryDeckCard;

export interface AuguryBuildResult {
  view: AugurySiteView;
  context: AuguryContext | null;
  encounter: AuguryEncounter | null;
  debug: AuguryEncounterGenerationDebug | null;
  deckSnapshot: AuguryDeckSnapshot | null;
  cardSourceDebug: CardSourceDebugState | null;
  errorMessage: string | null;
}

export interface AuguryLogEntry {
  key: string;
  event: string;
  payload: Record<string, unknown>;
}

export function resolveAuguryGuide(
  guides: readonly DreamGuideContent[],
  presentingGuideId?: GuideId,
): DreamGuideContent {
  return requireGuideForSiteType(guides, "Augury", presentingGuideId);
}

export function buildAuguryGuideView(
  guide: DreamGuideContent,
  line: LocalizedString,
): AuguryGuideView {
  return projectGuideView(guide, line);
}

function toCardView(
  object: CardObject,
  idSuffix = "",
  card: CardData = object.card,
  includeTransfiguration = true,
): AuguryCardView {
  return {
    id: parseAuguryCardViewId(`${object.cardUuid}${idSuffix}`),
    model: {
      cardId: card.id,
      displaySnapshot: card,
      ...(!includeTransfiguration || object.transfiguration === undefined
        ? {}
        : { transfiguration: object.transfiguration }),
    },
  };
}

function sitePreviewModel(
  siteType: SiteState["type"],
  sitesData: SitesData,
): DreamscapeSiteModel {
  return {
    id: parseSiteId(`augury-preview:${siteType}`),
    type: siteType,
    isVisited: false,
    pos: { x: 50, y: 50 },
    index: 0,
    isBattle: siteType === "Battle",
    isLocked: false,
    isInteractive: false,
    label: localizedSourceText(siteTypeName(sitesData, siteType)),
    blurb: localizedSourceText(siteTypeDescription(sitesData, siteType)),
    icon: glyph(siteTypeIcon(sitesData, siteType)),
  };
}

function firstCard(
  objects: readonly AuguryGameObject[],
): CardObject | undefined {
  return objects.find(
    (object): object is CardObject =>
      object.objectType === "catalogCard" || object.objectType === "deckCard",
  );
}

function allCards(objects: readonly AuguryGameObject[]): CardObject[] {
  return objects.filter(
    (object): object is CardObject =>
      object.objectType === "catalogCard" || object.objectType === "deckCard",
  );
}

function toDreamsign(
  object: Extract<AuguryGameObject, { objectType: "dreamsign" }>,
): ReturnType<typeof localizedDreamsign> {
  return localizedDreamsign(
    {
      id: object.dreamsignId,
      name: object.dreamsignTemplate.name,
      effectDescription: object.dreamsignTemplate.effectDescription,
      imageName: object.dreamsignTemplate.imageName,
      imageAlt: object.dreamsignTemplate.imageAlt,
    },
    "Augury offer",
  );
}

function unavailable(message: string): never {
  throw new Error(`Augury offer unavailable: ${message}`);
}

function tileCard(object: CardObject, preview = false): Readonly<CardData> {
  const displaySnapshot =
    preview &&
    object.objectType === "deckCard" &&
    object.previewCard !== undefined
      ? object.previewCard
      : object.card;
  if (displaySnapshot.id !== object.cardUuid) {
    unavailable(`card UUID mismatch for ${object.cardUuid}`);
  }
  return displaySnapshot;
}

function requiredCard(
  objects: readonly AuguryGameObject[],
  label: string,
  preview = false,
): Readonly<CardData> {
  const object = firstCard(objects);
  if (object === undefined) unavailable(`${label} has no card`);
  return tileCard(object, preview);
}

function candidateCards(
  offer: AuguryOffer,
  allowedCounts: readonly number[],
  preview = false,
): readonly Readonly<CardData>[] {
  const candidates = offer.choiceRequest?.candidates;
  if (candidates === undefined || !allowedCounts.includes(candidates.length)) {
    unavailable(
      `${offer.archetypeId} requires ${allowedCounts.join(" or ")} candidates`,
    );
  }
  return candidates.map((candidate) =>
    requiredCard(
      candidate.gameObjects,
      `${offer.archetypeId} candidate`,
      preview,
    ),
  );
}

function fourCards(cards: readonly Readonly<CardData>[]): OfferTileCardChoices {
  if (cards.length === 2) return [cards[0], cards[1]];
  if (cards.length === 3) return [cards[0], cards[1], cards[2]];
  if (cards.length === 4) return [cards[0], cards[1], cards[2], cards[3]];
  return unavailable("expected 2 to 4 cards");
}

function bundleCards(
  cards: readonly Readonly<CardData>[],
): OfferTileBundleCards {
  if (cards.length === 2) return [cards[0], cards[1]];
  if (cards.length === 3) return [cards[0], cards[1], cards[2]];
  return unavailable("card_bundle requires 2 or 3 cards");
}

function starterCards(
  cards: readonly Readonly<CardData>[],
): OfferTileStarterCards {
  if (cards.length === 1) return [cards[0]];
  if (cards.length === 2) return [cards[0], cards[1]];
  return unavailable("starter_transfigure requires 1 or 2 cards");
}

function duplicateCards(
  cards: readonly Readonly<CardData>[],
): OfferTileDuplicateCards {
  if (cards.length === 1) return [cards[0]];
  if (cards.length === 2) return [cards[0], cards[1]];
  if (cards.length === 3) return [cards[0], cards[1], cards[2]];
  return unavailable("duplicate requires 1 to 3 cards");
}

function tileDreamsign(
  object: Extract<AuguryGameObject, { objectType: "dreamsign" }>,
): OfferTileDreamsign {
  const imageName =
    object.dreamsignTemplate.imageName ?? `${object.dreamsignId}.png`;
  return {
    id: object.dreamsignId,
    name: localizedSourceText(object.dreamsignTemplate.name),
    art: artRef.dreamsign(imageName),
  };
}

function requiredDreamsign(
  objects: readonly AuguryGameObject[],
  label: string,
): OfferTileDreamsign {
  const object = objects.find(
    (
      candidate,
    ): candidate is Extract<AuguryGameObject, { objectType: "dreamsign" }> =>
      candidate.objectType === "dreamsign",
  );
  if (object === undefined) unavailable(`${label} has no dreamsign`);
  return tileDreamsign(object);
}

function copyCount(offer: AuguryOffer): number {
  const candidates = offer.choiceRequest?.candidates;
  if (candidates === undefined || candidates.length !== 4) {
    unavailable("copies_draft requires 4 candidates");
  }
  const counts = candidates.map((candidate) => {
    const card = firstCard(candidate.gameObjects);
    if (card === undefined) unavailable("copies_draft candidate has no card");
    const countAdds = (payload: typeof candidate.applyPayload): number =>
      payload.kind === "add_catalog_card"
        ? Number(payload.cardUuid === card.cardUuid)
        : payload.kind === "composite"
          ? payload.children.reduce((sum, child) => sum + countAdds(child), 0)
          : 0;
    return countAdds(candidate.applyPayload);
  });
  if (
    counts[0] === undefined ||
    counts[0] < 1 ||
    counts.some((count) => count !== counts[0])
  ) {
    unavailable("copies_draft candidates grant inconsistent copy counts");
  }
  return counts[0];
}

export function projectOfferTileCategory(
  category: AuguryCategory,
): OfferTileCategory {
  switch (category.id) {
    case "type:Character":
      return { kind: "character" };
    case "type:Event":
      return { kind: "event" };
    case "cost:cheap":
      return { kind: "cheap" };
    case "cost:mid":
      return { kind: "mid-cost" };
    case "cost:big":
      return { kind: "expensive" };
    case "fast":
      return { kind: "fast" };
    default:
      if (category.id.startsWith("subtype:")) {
        return { kind: "subtype", name: localizedSourceText(category.label) };
      }
      if (category.id.startsWith("tide:")) {
        return { kind: "package", name: localizedSourceText(category.label) };
      }
      return unavailable("category_draft_known has an unsupported category id");
  }
}

function offerTileCategory(
  offer: AuguryOffer,
  context: AuguryContext,
): OfferTileCategory {
  const category = buildCategoryUniverse(context).find((candidate) =>
    offer.targetKey.startsWith(`${candidate.id}:`),
  );
  if (category === undefined)
    unavailable("category_draft_known has an unknown category id");
  return projectOfferTileCategory(category);
}

export function buildAuguryOfferTileModel(
  offer: AuguryOffer,
  context: AuguryContext,
): OfferTileModel {
  const id = parseOfferTileId(`${offer.encounterSignature}:${offer.offerId}`);
  switch (offer.archetypeId) {
    case "fit_card_grant":
    case "strong_card":
      return {
        id,
        kind: "card-gift",
        card: requiredCard(offer.gameObjects, offer.archetypeId),
      };
    case "fit_card_draft":
      return {
        id,
        kind: "card-draft",
        cards: fourCards(candidateCards(offer, [2, 3, 4])),
      };
    case "transfigured_draft":
      return {
        id,
        kind: "transfigured-draft",
        cards: fourCards(candidateCards(offer, [2, 3, 4], true)),
      };
    case "category_draft_known":
      return {
        id,
        kind: "category-draft",
        cards: fourCards(candidateCards(offer, [2, 3, 4])),
        category: offerTileCategory(offer, context),
      };
    case "copies_draft":
      return {
        id,
        kind: "copies-draft",
        cards: fourCards(candidateCards(offer, [2, 3, 4])),
        copyCount: copyCount(offer),
      };
    case "card_bundle": {
      const cards = allCards(offer.gameObjects).map((card) => tileCard(card));
      return { id, kind: "card-bundle", cards: bundleCards(cards) };
    }
    case "transfigure": {
      const payload = offer.applyPayload;
      if (payload?.kind !== "transfigure_deck_entry")
        unavailable("transfigure has malformed payload");
      return {
        id,
        kind: "transfigure-card",
        card: requiredCard(offer.gameObjects, "transfigure", true),
      };
    }
    case "starter_transfigure": {
      const cards = allCards(offer.gameObjects).map((card) =>
        tileCard(card, true),
      );
      return { id, kind: "transfigure-starters", cards: starterCards(cards) };
    }
    case "purge":
      return {
        id,
        kind: "purge-card",
        card: requiredCard(offer.gameObjects, "purge"),
      };
    case "duplicate": {
      const cards =
        offer.choiceRequest === undefined
          ? [requiredCard(offer.gameObjects, "duplicate")]
          : candidateCards(offer, [1, 2, 3]);
      return { id, kind: "duplicate-card", cards: duplicateCards(cards) };
    }
    case "dreamsign":
      return {
        id,
        kind: "dreamsign-gift",
        dreamsign: requiredDreamsign(offer.gameObjects, "dreamsign"),
      };
    case "add_site": {
      const payload = offer.applyPayload;
      if (payload?.kind !== "add_site")
        unavailable("add_site has malformed payload");
      return {
        id,
        kind: "add-site",
        site: {
          id: payload.siteType,
          name: localizedSourceText(
            siteTypeName(context.sitesData, payload.siteType),
          ),
          glyph: glyph(siteTypeIcon(context.sitesData, payload.siteType)),
        },
      };
    }
  }
}

function cardChoices(
  candidates: NonNullable<AuguryOffer["choiceRequest"]>["candidates"],
  preview: boolean,
): AuguryCardChoiceView[] {
  const choices: AuguryCardChoiceView[] = [];
  for (const candidate of candidates) {
    const object = firstCard(candidate.gameObjects);
    if (object === undefined) continue;
    const card =
      preview &&
      object.objectType === "deckCard" &&
      object.previewCard !== undefined
        ? object.previewCard
        : object.card;
    choices.push({
      id: candidate.choiceId,
      card: toCardView(object, `:${candidate.choiceId}`, card),
    });
  }
  return choices;
}

function buildOfferVisual(
  offer: AuguryOffer,
  context: Pick<AuguryContext, "deckEntryById">,
  sitesData: SitesData,
): AuguryOfferVisualView {
  const presentation = resolveOfferPresentation(offer);
  switch (presentation.kind) {
    case "heroCard":
      return { kind: "cards", cards: [toCardView(presentation.card)] };
    case "cardBundle":
      return {
        kind: "cards",
        cards: presentation.cards.map((card, index) =>
          toCardView(card, `:${String(index)}`),
        ),
      };
    case "cardGrid":
      return {
        kind: "cardChoices",
        choices: cardChoices(
          presentation.candidates,
          presentation.transfigured,
        ),
        doubled: presentation.doubled,
      };
    case "beforeAfter":
    case "beforeAfterMulti": {
      const objects =
        presentation.kind === "beforeAfter"
          ? [presentation.object]
          : presentation.objects;
      if (presentation.kind === "beforeAfterMulti") {
        return {
          kind: "cards",
          cards: objects.map((object) =>
            toCardView(object, ":after", object.previewCard ?? object.card),
          ),
        };
      }
      return {
        kind: "beforeAfter",
        pairs: objects.map((object) => ({
          id: object.entryId,
          before: toCardView(
            object,
            ":before",
            context.deckEntryById.get(object.entryId)?.card ?? object.card,
            false,
          ),
          after: toCardView(
            object,
            ":after",
            object.previewCard ?? object.card,
          ),
        })),
      };
    }
    case "purge":
      return { kind: "purge", card: toCardView(presentation.object) };
    case "duplicateSingle":
      return { kind: "duplicate", card: toCardView(presentation.object) };
    case "duplicateChoose":
      return {
        kind: "duplicateChoices",
        choices: cardChoices(presentation.candidates, false),
      };
    case "dreamsign":
      return {
        kind: "dreamsigns",
        dreamsigns: [toDreamsign(presentation.object)],
      };
    case "addSite":
      return {
        kind: "site",
        model: sitePreviewModel(presentation.siteType, sitesData),
      };
    case "fallback":
      return {
        kind: "mixed",
        cards: allCards(presentation.objects).map((card, index) =>
          toCardView(card, `:${String(index)}`),
        ),
        dreamsigns: presentation.objects
          .filter(
            (
              object,
            ): object is Extract<
              AuguryGameObject,
              { objectType: "dreamsign" }
            > => object.objectType === "dreamsign",
          )
          .map(toDreamsign),
      };
  }
}

export function buildAuguryOfferViews(
  encounter: AuguryEncounter,
  context: AuguryContext,
): AuguryOfferView[] {
  if (encounter.offers.length !== 2) {
    unavailable("encounter requires exactly 2 offers");
  }
  return encounter.offers.map((offer) => {
    const tile = buildAuguryOfferTileModel(offer, context);
    return {
      id: offer.offerId,
      requiresSelection: (offer.choiceRequest?.candidates.length ?? 0) > 0,
      tile,
      presentation: auguryArchetype(
        context.rewardSelection.content.auguryData,
        offer.archetypeId,
      ).presentation,
      visual: buildOfferVisual(offer, context, context.sitesData),
    };
  });
}

function collectVisibleGrantCards(encounter: AuguryEncounter): CardData[] {
  const byUuid = new Map<CardId, CardData>();
  const collect = (objects: readonly AuguryGameObject[]) => {
    for (const object of objects) {
      if (object.objectType === "catalogCard") {
        byUuid.set(object.cardUuid, object.card);
      }
    }
  };
  for (const offer of encounter.offers) {
    collect(offer.gameObjects);
    for (const candidate of offer.choiceRequest?.candidates ?? []) {
      collect(candidate.gameObjects);
    }
  }
  return [...byUuid.values()];
}

export function buildAugurySiteModel(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  journeyContent: JourneyContent;
  guide: DreamGuideContent;
  guideLine: LocalizedString;
}): AuguryBuildResult {
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  const baseView = {
    siteId: params.site.id,
    scene,
    guide: buildAuguryGuideView(params.guide, params.guideLine),
    allowDecline: params.journeyContent.auguryData.encounter.allowDecline,
  };
  try {
    const context = buildAuguryContext({
      journeyState: params.state,
      journeyContent: params.journeyContent,
      site: params.site,
    });
    const runtime = params.state.siteRuntime[params.site.id];
    const persistedEncounter =
      runtime?.kind === "augury" ? runtime.encounter : undefined;
    const generated =
      persistedEncounter === undefined
        ? generateAuguryEncounterWithDebug(context)
        : null;
    const encounter = persistedEncounter ?? generated?.encounter;
    if (encounter === undefined)
      throw new Error("Augury encounter is unavailable");
    const debug = generated?.debug ?? null;
    return {
      view: {
        ...baseView,
        encounterSignature: encounter.encounterSignature,
        offers: buildAuguryOfferViews(encounter, context),
        unavailableMessage: null,
      },
      context,
      encounter,
      debug,
      deckSnapshot: buildAuguryDeckSnapshot(context),
      cardSourceDebug: buildCardSourceDebugState(
        "Augury Offers",
        "Reward",
        collectVisibleGrantCards(encounter),
        params.state.resolvedPackage,
      ),
      errorMessage: null,
    };
  } catch (error) {
    return {
      view: {
        ...baseView,
        encounterSignature: null,
        offers: [],
        unavailableMessage: tx(
          "The visions are clouded. I cannot read these paths; walk on for now.",
          "[augury] Augury unavailable guidance after its offer model cannot be constructed.",
        ),
      },
      context: null,
      encounter: null,
      debug: null,
      deckSnapshot: null,
      cardSourceDebug: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildAuguryAcceptRequest(
  encounter: AuguryEncounter,
  offerId: OfferId,
  choiceId: ChoiceId | null,
): AuguryAcceptRequest | null {
  const offer = encounter.offers.find(
    (candidate) => candidate.offerId === offerId,
  );
  if (offer === undefined) return null;
  const candidates = offer.choiceRequest?.candidates ?? [];
  if (candidates.length > 0) {
    if (
      choiceId === null ||
      !candidates.some((candidate) => candidate.choiceId === choiceId)
    ) {
      return null;
    }
  }
  return {
    encounterSignature: encounter.encounterSignature,
    offerId,
    archetypeId: offer.archetypeId,
    ...(encounter.selectionRulesVersion === undefined
      ? {}
      : { selectionRulesVersion: encounter.selectionRulesVersion }),
    ...(candidates.length === 0 ? {} : { choice: { choiceId: choiceId! } }),
  };
}

export function buildAuguryDeclineRequest(
  encounter: AuguryEncounter,
): AuguryDeclineRequest | null {
  const offer = encounter.offers[0];
  return offer === undefined
    ? null
    : {
        encounterSignature: encounter.encounterSignature,
        offerId: offer.offerId,
        ...(encounter.selectionRulesVersion === undefined
          ? {}
          : { selectionRulesVersion: encounter.selectionRulesVersion }),
      };
}

export function buildAuguryLogEntries(
  result: AuguryBuildResult,
  site: SiteState,
  guideId: GuideId | null,
): AuguryLogEntry[] {
  const entries: AuguryLogEntry[] = [
    {
      key: `augury:${site.id}:site-entered`,
      event: "site_entered",
      payload: {
        siteType: site.type,
        isEnhanced: site.isEnhanced,
      },
    },
  ];
  if (guideId !== null) {
    entries.push({
      key: `augury:${site.id}:guide:${guideId}`,
      event: "dream_guide_presented",
      payload: {
        guideId,
        siteType: site.type,
        isEnhanced: site.isEnhanced,
      },
    });
  }
  if (result.encounter === null) {
    if (result.errorMessage !== null) {
      entries.push({
        key: `augury:${site.id}:unavailable`,
        event: "augury_offer_validation_failed",
        payload: {
          siteId: site.id,
          reason: "encounter_unavailable",
          message: result.errorMessage,
        },
      });
    }
    return entries;
  }
  const { encounter, debug, deckSnapshot } = result;
  entries.push({
    key: `augury:${encounter.encounterSignature}:generated`,
    event: "augury_encounter_generated",
    payload: {
      siteId: encounter.siteId,
      encounterSignature: encounter.encounterSignature,
      offerCount: encounter.offers.length,
      deck: deckSnapshot,
      debug,
    },
  });
  for (const offer of encounter.offers) {
    entries.push({
      key: `augury:${encounter.encounterSignature}:offer:${offer.offerId}`,
      event: "augury_offer_built",
      payload: {
        siteId: encounter.siteId,
        encounterSignature: offer.encounterSignature,
        offerId: offer.offerId,
        archetypeId: offer.archetypeId,
        family: offer.family,
        targetKey: offer.targetKey,
        isChooser: offer.choiceRequest !== undefined,
        deckSize: deckSnapshot?.size,
        deckHash: deckSnapshot?.hash,
        trace: offer.trace ?? null,
        mechanicId: offer.mechanicId ?? null,
        policyId: offer.policyId ?? null,
        selectionKey: offer.selectionKey ?? null,
        selectionRulesVersion: offer.selectionRulesVersion ?? null,
        selectionContentRevision: offer.selectionContentRevision ?? null,
        selectionTrace: offer.selectionTrace ?? null,
      },
    });
  }
  return entries;
}

export function auguryChoiceResult(
  result: AuguryOfferActionResult | void,
): { ok: true } | { ok: false; message: LocalizedString } {
  if (result?.ok !== false) return { ok: true };
  if (
    result.reason === "stale_encounter" ||
    result.reason === "archetype_mismatch" ||
    result.reason === "offer_not_found"
  ) {
    return {
      ok: false,
      message: tx(
        "The visions shifted. Choose again.",
        "[augury] Error visions shifted.",
      ),
    };
  }
  return {
    ok: false,
    message: tx(
      "That path is closed. Choose again.",
      "[augury] Error path closed.",
    ),
  };
}

export function chooseAuguryOffer(
  site: SiteState | null,
  result: AuguryBuildResult | null,
  acceptOffer: (
    siteId: SiteId,
    request: AuguryAcceptRequest,
  ) => AuguryOfferActionResult | void,
  offerId: OfferId,
  choiceId: ChoiceId | null,
): { ok: true } | { ok: false; message: LocalizedString } {
  if (
    site === null ||
    result?.encounter === null ||
    result?.encounter === undefined
  ) {
    return {
      ok: false,
      message: tx("The augury is clouded.", "[augury] Error clouded."),
    };
  }
  const request = buildAuguryAcceptRequest(result.encounter, offerId, choiceId);
  if (request === null) {
    return {
      ok: false,
      message: tx("Choose a vision first.", "[augury] Error choose vision."),
    };
  }
  return auguryChoiceResult(acceptOffer(site.id, request));
}
