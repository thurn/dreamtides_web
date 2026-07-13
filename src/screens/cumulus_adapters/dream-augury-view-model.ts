import { siteTypeIcon, siteTypeName } from "../../atlas/atlas-generator";
import { buildCardSourceDebugState } from "../../debug/card-source-debug";
import { guideForSiteType } from "../../data/dreamscapes";
import type { QuestContent } from "../../data/quest-content";
import {
  buildMerchantContext,
  buildMerchantDeckSnapshot,
  generateMerchantEncounterWithDebug,
  resolveOfferPresentation,
} from "../../journey_v2";
import type {
  MerchantAcceptRequest,
  MerchantCatalogCard,
  MerchantContext,
  MerchantDeclineRequest,
  MerchantDeckCard,
  MerchantEncounter,
  MerchantEncounterGenerationDebug,
  MerchantGameObject,
  MerchantOffer,
  MerchantOfferActionResult,
} from "../../journey_v2";
import type { MerchantArchetypeId } from "../../journey_v2/archetypes/types";
import type { MerchantDeckSnapshot } from "../../journey_v2/trace/deckSnapshot";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type {
  CardSourceDebugState,
  DreamscapeNode,
  Dreamsign,
  QuestState,
  SiteState,
} from "../../types/quest";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import { glyph } from "../../cumulus/primitives/glyph";
import type {
  DreamAuguryCardChoiceView,
  DreamAuguryCardView,
  DreamAuguryDreamsignChoiceView,
  DreamAuguryGuideView,
  DreamAuguryOfferView,
  DreamAuguryOfferVisualView,
  DreamAugurySiteView,
} from "../../cumulus/screens/DreamAugurySiteScreen";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

const FALLBACK_GUIDE_ID = "aldric_the_seer";
const FALLBACK_GUIDE_NAME = "Aldric, the Seer";

const OFFER_HEADLINES: Readonly<Record<MerchantArchetypeId, string>> = {
  fit_card_grant: "A New Card",
  fit_card_draft: "Choose a Card",
  copies_draft: "Choose Two Copies",
  strong_card: "A New Card",
  category_draft_known: "Choose a Card",
  card_bundle: "A Card Set",
  transfigured_draft: "Choose a New Form",
  transfigure: "A New Form",
  starter_transfigure: "Refine Your Starters",
  keyword_mod: "A New Gift",
  tribal_change: "A New Kin",
  purge: "Purge a Card",
  purge_replace: "Trade a Card",
  duplicate: "Duplicate a Card",
  dreamsign: "A Dreamsign",
  dreamsign_draft: "Choose a Dreamsign",
  add_site: "A New Path",
};

type CardObject = MerchantCatalogCard | MerchantDeckCard;

export interface DreamAuguryBuildResult {
  view: DreamAugurySiteView;
  context: MerchantContext | null;
  encounter: MerchantEncounter | null;
  debug: MerchantEncounterGenerationDebug | null;
  deckSnapshot: MerchantDeckSnapshot | null;
  cardSourceDebug: CardSourceDebugState | null;
  errorMessage: string | null;
}

export interface DreamAuguryLogEntry {
  key: string;
  event: string;
  payload: Record<string, unknown>;
}

export function resolveDreamAuguryGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "DreamAugury");
}

export function buildDreamAuguryGuideView(
  guide: DreamGuideContent | null,
): DreamAuguryGuideView {
  const id = guide?.id ?? FALLBACK_GUIDE_ID;
  return {
    id,
    name: guide?.name ?? FALLBACK_GUIDE_NAME,
    art: artRef.dreamGuide(id),
  };
}

function toCardView(
  object: CardObject,
  idSuffix = "",
  card: CardData = object.card,
): DreamAuguryCardView {
  return {
    id: `${object.cardUuid}${idSuffix}`,
    model: {
      cardId: card.id,
      displaySnapshot: card,
      ...(object.transfiguration === undefined
        ? {}
        : { transfiguration: object.transfiguration }),
    },
  };
}

function firstCard(
  objects: readonly MerchantGameObject[],
): CardObject | undefined {
  return objects.find(
    (object): object is CardObject =>
      object.objectType === "catalogCard" || object.objectType === "deckCard",
  );
}

function allCards(objects: readonly MerchantGameObject[]): CardObject[] {
  return objects.filter(
    (object): object is CardObject =>
      object.objectType === "catalogCard" || object.objectType === "deckCard",
  );
}

function toDreamsign(
  object: Extract<MerchantGameObject, { objectType: "dreamsign" }>,
): Dreamsign {
  return {
    id: object.dreamsignId,
    name: object.dreamsignTemplate.name,
    effectDescription: object.dreamsignTemplate.effectDescription,
    imageName: object.dreamsignTemplate.imageName,
    imageAlt: object.dreamsignTemplate.imageAlt,
    isBane: false,
  };
}

function cardChoices(
  candidates: NonNullable<MerchantOffer["choiceRequest"]>["candidates"],
  preview: boolean,
): DreamAuguryCardChoiceView[] {
  const choices: DreamAuguryCardChoiceView[] = [];
  for (const candidate of candidates) {
    const object = firstCard(candidate.gameObjects);
    if (object === undefined) continue;
    const card =
      preview && object.objectType === "deckCard" && object.previewCard !== undefined
        ? object.previewCard
        : object.card;
    choices.push({
      id: candidate.choiceId,
      card: toCardView(object, `:${candidate.choiceId}`, card),
    });
  }
  return choices;
}

function dreamsignChoices(
  candidates: NonNullable<MerchantOffer["choiceRequest"]>["candidates"],
): DreamAuguryDreamsignChoiceView[] {
  const choices: DreamAuguryDreamsignChoiceView[] = [];
  for (const candidate of candidates) {
    const object = candidate.gameObjects.find(
      (
        value,
      ): value is Extract<MerchantGameObject, { objectType: "dreamsign" }> =>
        value.objectType === "dreamsign",
    );
    if (object !== undefined) {
      choices.push({ id: candidate.choiceId, dreamsign: toDreamsign(object) });
    }
  }
  return choices;
}

function buildOfferVisual(
  offer: MerchantOffer,
  context: Pick<MerchantContext, "deckEntryById">,
): DreamAuguryOfferVisualView {
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
        choices: cardChoices(presentation.candidates, presentation.transfigured),
        doubled: presentation.doubled,
      };
    case "beforeAfter":
    case "beforeAfterMulti": {
      const objects =
        presentation.kind === "beforeAfter"
          ? [presentation.object]
          : presentation.objects;
      return {
        kind: "beforeAfter",
        pairs: objects.map((object) => ({
          id: object.entryId,
          before: toCardView(
            object,
            ":before",
            context.deckEntryById.get(object.entryId)?.card ?? object.card,
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
    case "purgeReplace":
      return {
        kind: "purgeReplace",
        removed: toCardView(presentation.removed, ":removed"),
        choices: cardChoices(presentation.candidates, false),
      };
    case "duplicateSingle":
      return { kind: "duplicate", card: toCardView(presentation.object) };
    case "duplicateChoose":
      return {
        kind: "duplicateChoices",
        choices: cardChoices(presentation.candidates, false),
      };
    case "dreamsign":
      return { kind: "dreamsigns", dreamsigns: [toDreamsign(presentation.object)] };
    case "dreamsignGrid":
      return {
        kind: "dreamsignChoices",
        choices: dreamsignChoices(presentation.candidates),
      };
    case "addSite":
      return {
        kind: "site",
        siteName: siteTypeName(presentation.siteType),
        glyph: glyph(siteTypeIcon(presentation.siteType)),
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
            ): object is Extract<MerchantGameObject, { objectType: "dreamsign" }> =>
              object.objectType === "dreamsign",
          )
          .map(toDreamsign),
      };
  }
}

export function buildDreamAuguryOfferViews(
  encounter: MerchantEncounter,
  context: Pick<MerchantContext, "deckEntryById">,
): DreamAuguryOfferView[] {
  return encounter.offers.slice(0, 2).map((offer, index) => ({
    id: offer.offerId,
    ordinal: index === 0 ? "I" : "II",
    headline: OFFER_HEADLINES[offer.archetypeId],
    requiresSelection: (offer.choiceRequest?.candidates.length ?? 0) > 0,
    visual: buildOfferVisual(offer, context),
  }));
}

function collectVisibleGrantCards(encounter: MerchantEncounter): CardData[] {
  const byUuid = new Map<string, CardData>();
  const collect = (objects: readonly MerchantGameObject[]) => {
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

export function buildDreamAugurySiteModel(params: {
  state: QuestState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  questContent: QuestContent;
  guide: DreamGuideContent | null;
}): DreamAuguryBuildResult {
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  const baseView = {
    siteId: params.site.id,
    scene,
    guide: buildDreamAuguryGuideView(params.guide),
  };
  try {
    const context = buildMerchantContext({
      questState: params.state,
      questContent: params.questContent,
      site: params.site,
    });
    const { encounter, debug } = generateMerchantEncounterWithDebug(context);
    return {
      view: {
        ...baseView,
        encounterSignature: encounter.encounterSignature,
        offers: buildDreamAuguryOfferViews(encounter, context),
      },
      context,
      encounter,
      debug,
      deckSnapshot: buildMerchantDeckSnapshot(context),
      cardSourceDebug: buildCardSourceDebugState(
        "Dream Merchant Offers",
        "Reward",
        collectVisibleGrantCards(encounter),
        params.state.resolvedPackage,
      ),
      errorMessage: null,
    };
  } catch (error) {
    return {
      view: { ...baseView, encounterSignature: null, offers: [] },
      context: null,
      encounter: null,
      debug: null,
      deckSnapshot: null,
      cardSourceDebug: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildDreamAuguryAcceptRequest(
  encounter: MerchantEncounter,
  offerId: string,
  choiceId: string | null,
): MerchantAcceptRequest | null {
  const offer = encounter.offers.find((candidate) => candidate.offerId === offerId);
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
    ...(candidates.length === 0 ? {} : { choice: { choiceId: choiceId! } }),
  };
}

export function buildDreamAuguryDeclineRequest(
  encounter: MerchantEncounter,
): MerchantDeclineRequest | null {
  const offer = encounter.offers[0];
  return offer === undefined
    ? null
    : {
        encounterSignature: encounter.encounterSignature,
        offerId: offer.offerId,
      };
}

export function buildDreamAuguryLogEntries(
  result: DreamAuguryBuildResult,
  site: SiteState,
  guideId: string | null,
): DreamAuguryLogEntry[] {
  const entries: DreamAuguryLogEntry[] = [
    {
      key: `augury:${site.id}:site-entered`,
      event: "site_entered",
      payload: { siteType: site.type, isEnhanced: site.isEnhanced, ui: "cumulus" },
    },
  ];
  if (guideId !== null) {
    entries.push({
      key: `augury:${site.id}:guide:${guideId}`,
      event: "dream_guide_presented",
      payload: { guideId, siteType: site.type, isEnhanced: site.isEnhanced, ui: "cumulus" },
    });
  }
  if (result.context?.fitModel === undefined) {
    entries.push({
      key: `augury:${site.id}:fit-model-missing`,
      event: "merchant_fit_model_missing",
      payload: { siteId: site.id, ui: "cumulus" },
    });
  }
  if (result.encounter === null) {
    if (result.errorMessage !== null) {
      entries.push({
        key: `augury:${site.id}:unavailable`,
        event: "merchant_offer_validation_failed",
        payload: {
          siteId: site.id,
          reason: "encounter_unavailable",
          message: result.errorMessage,
          ui: "cumulus",
        },
      });
    }
    return entries;
  }
  const { encounter, debug, deckSnapshot } = result;
  entries.push({
    key: `augury:${encounter.encounterSignature}:generated`,
    event: "merchant_encounter_generated",
    payload: {
      siteId: encounter.siteId,
      encounterSignature: encounter.encounterSignature,
      offerCount: encounter.offers.length,
      deck: deckSnapshot,
      debug,
      ui: "cumulus",
    },
  });
  for (const offer of encounter.offers) {
    entries.push({
      key: `augury:${encounter.encounterSignature}:offer:${offer.offerId}`,
      event: "merchant_offer_built",
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
        ui: "cumulus",
      },
    });
  }
  return entries;
}

export function dreamAuguryChoiceResult(
  result: MerchantOfferActionResult | void,
): { ok: true } | { ok: false; message: string } {
  if (result?.ok !== false) return { ok: true };
  if (
    result.reason === "stale_encounter" ||
    result.reason === "archetype_mismatch" ||
    result.reason === "offer_not_found"
  ) {
    return { ok: false, message: "The visions shifted. Choose again." };
  }
  return { ok: false, message: "That path is closed. Choose again." };
}
