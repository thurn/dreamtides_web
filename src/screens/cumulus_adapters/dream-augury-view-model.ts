import {
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../../atlas/atlas-generator";
import { buildCardSourceDebugState } from "../../debug/card-source-debug";
import { guideForSiteType } from "../../data/dreamscapes";
import type { QuestContent } from "../../data/quest-content";
import {
  buildMerchantContext,
  buildMerchantDeckSnapshot,
  generateMerchantEncounterWithDebug,
  resolveOfferPresentation,
} from "../../journey_v2";
import { buildCategoryUniverse } from "../../journey_v2/archetypes/categories";
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
import type { MerchantDeckSnapshot } from "../../journey_v2/trace/deckSnapshot";
import type { CardData } from "../../types/cards";
import { asCardId } from "../../types/card-identity";
import { resolveDeckEntryCard } from "../../card-type-change";
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
  OfferTileCard,
  OfferTileBundleCards,
  OfferTileCharacterSubtype,
  OfferTileDreamsignChoices,
  OfferTileDreamsign,
  OfferTileDuplicateCards,
  OfferTileFourCards,
  OfferTileModel,
  OfferTileStarterCards,
} from "../../cumulus/components/controls/OfferTile";
import { offerTileDescription } from "../../cumulus/components/controls/offer-tile-descriptions";
import type { DreamscapeSiteModel } from "../../cumulus/components/dreamscape/SiteNode";
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
const FALLBACK_GUIDE_LINE =
  "Two paths unfold before you. Choose one to shape your dream.";

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
  line: string | null,
): DreamAuguryGuideView {
  const id = guide?.id ?? FALLBACK_GUIDE_ID;
  return {
    id,
    name: guide?.name ?? FALLBACK_GUIDE_NAME,
    line: line ?? guide?.dialog[0] ?? FALLBACK_GUIDE_LINE,
    art: artRef.dreamGuide(id),
  };
}

function toCardView(
  object: CardObject,
  idSuffix = "",
  card: CardData = object.card,
  includeTransfiguration = true,
): DreamAuguryCardView {
  return {
    id: `${object.cardUuid}${idSuffix}`,
    model: {
      cardId: card.id,
      displaySnapshot: card,
      ...(!includeTransfiguration || object.transfiguration === undefined
        ? {}
        : { transfiguration: object.transfiguration }),
    },
  };
}

function titleCardinal(value: number): string {
  if (value === 1) return "One";
  if (value === 2) return "Two";
  if (value === 3) return "Three";
  if (value === 4) return "Four";
  return String(value);
}

function offerCardName(card: OfferTileCard): string {
  return card.displaySnapshot.name;
}

function indefiniteArticle(label: string): "a" | "an" {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

/** Player-facing detail title derived from the exact structured outcome. */
export function buildDreamAuguryOfferHeadline(model: OfferTileModel): string {
  switch (model.kind) {
    case "card-gift":
      return `Gain ${offerCardName(model.card)}`;
    case "card-draft":
    case "copies-draft":
    case "category-draft":
      return "Choose a Card";
    case "transfigured-draft":
      return "Choose a Transfigured Card";
    case "card-bundle":
      return `Gain ${titleCardinal(model.cards.length)} Cards`;
    case "transfigure-card":
      return `Transfigure ${offerCardName(model.card)}`;
    case "transfigure-starters":
      return model.cards.length === 1
        ? `Transfigure ${offerCardName(model.cards[0])}`
        : "Transfigure Your Starters";
    case "keyword-modification":
      return `Reduce Reclaim for ${offerCardName(model.card)}`;
    case "tribal-change":
      return `Make ${offerCardName(model.card)} ${indefiniteArticle(model.newCharacterSubtype)} ${model.newCharacterSubtype}`;
    case "purge-card":
      return `Purge ${offerCardName(model.card)}`;
    case "trade-card":
      return `Trade ${offerCardName(model.outgoing)}`;
    case "duplicate-card":
      return model.cards.length === 1
        ? `Duplicate ${offerCardName(model.cards[0])}`
        : "Choose a Card";
    case "dreamsign-gift":
      return `Gain ${model.dreamsign.name}`;
    case "dreamsign-draft":
      return "Choose a Dreamsign";
    case "add-site":
      return `Add ${indefiniteArticle(model.site.name)} ${model.site.name}`;
  }
}

function sitePreviewModel(siteType: SiteState["type"]): DreamscapeSiteModel {
  return {
    site: {
      id: `dream-augury-preview:${siteType}`,
      type: siteType,
      isEnhanced: false,
      isVisited: false,
    },
    pos: { x: 50, y: 50 },
    index: 0,
    isBattle: siteType === "Battle",
    isLocked: false,
    isInteractive: false,
    label: siteTypeName(siteType),
    blurb: siteTypeDescription(siteType),
    icon: glyph(siteTypeIcon(siteType)),
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

function unavailable(message: string): never {
  throw new Error(`Dream Augury offer unavailable: ${message}`);
}

function tileCard(
  object: CardObject,
  preview = false,
): OfferTileCard {
  const displaySnapshot =
    preview && object.objectType === "deckCard" && object.previewCard !== undefined
      ? object.previewCard
      : object.card;
  if (displaySnapshot.id !== object.cardUuid) {
    unavailable(`card UUID mismatch for ${object.cardUuid}`);
  }
  return { cardId: asCardId(object.cardUuid), displaySnapshot };
}

function requiredCard(
  objects: readonly MerchantGameObject[],
  label: string,
  preview = false,
): OfferTileCard {
  const object = firstCard(objects);
  if (object === undefined) unavailable(`${label} has no card`);
  return tileCard(object, preview);
}

function candidateCards(
  offer: MerchantOffer,
  allowedCounts: readonly number[],
  preview = false,
): readonly OfferTileCard[] {
  const candidates = offer.choiceRequest?.candidates;
  if (candidates === undefined || !allowedCounts.includes(candidates.length)) {
    unavailable(
      `${offer.archetypeId} requires ${allowedCounts.join(" or ")} candidates`,
    );
  }
  return candidates.map((candidate) =>
    requiredCard(candidate.gameObjects, `${offer.archetypeId} candidate`, preview),
  );
}

function fourCards(cards: readonly OfferTileCard[]): OfferTileFourCards {
  if (cards.length !== 4) unavailable("expected exactly 4 cards");
  return [cards[0], cards[1], cards[2], cards[3]];
}

function bundleCards(cards: readonly OfferTileCard[]): OfferTileBundleCards {
  if (cards.length === 2) return [cards[0], cards[1]];
  if (cards.length === 3) return [cards[0], cards[1], cards[2]];
  return unavailable("card_bundle requires 2 or 3 cards");
}

function starterCards(cards: readonly OfferTileCard[]): OfferTileStarterCards {
  if (cards.length === 1) return [cards[0]];
  if (cards.length === 2) return [cards[0], cards[1]];
  return unavailable("starter_transfigure requires 1 or 2 cards");
}

function duplicateCards(cards: readonly OfferTileCard[]): OfferTileDuplicateCards {
  if (cards.length === 1) return [cards[0]];
  if (cards.length === 2) return [cards[0], cards[1]];
  if (cards.length === 3) return [cards[0], cards[1], cards[2]];
  return unavailable("duplicate requires 1 to 3 cards");
}

function dreamsignTuple(
  dreamsigns: readonly OfferTileDreamsign[],
): OfferTileDreamsignChoices {
  if (dreamsigns.length === 2) return [dreamsigns[0], dreamsigns[1]];
  if (dreamsigns.length === 3) return [dreamsigns[0], dreamsigns[1], dreamsigns[2]];
  if (dreamsigns.length === 4) {
    return [dreamsigns[0], dreamsigns[1], dreamsigns[2], dreamsigns[3]];
  }
  return unavailable("dreamsign_draft requires 2 to 4 candidates");
}

function tileDreamsign(
  object: Extract<MerchantGameObject, { objectType: "dreamsign" }>,
): OfferTileDreamsign {
  const imageName = object.dreamsignTemplate.imageName ?? `${object.dreamsignId}.png`;
  return {
    id: object.dreamsignId,
    name: object.dreamsignTemplate.name,
    art: artRef.dreamsign(imageName),
  };
}

function requiredDreamsign(
  objects: readonly MerchantGameObject[],
  label: string,
): OfferTileDreamsign {
  const object = objects.find(
    (candidate): candidate is Extract<MerchantGameObject, { objectType: "dreamsign" }> =>
      candidate.objectType === "dreamsign",
  );
  if (object === undefined) unavailable(`${label} has no dreamsign`);
  return tileDreamsign(object);
}

function copyCount(offer: MerchantOffer): number {
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
  if (counts[0] === undefined || counts[0] < 1 || counts.some((count) => count !== counts[0])) {
    unavailable("copies_draft candidates grant inconsistent copy counts");
  }
  return counts[0];
}

function categoryName(offer: MerchantOffer, context: MerchantContext): string {
  const category = buildCategoryUniverse(context).find((candidate) =>
    offer.targetKey.startsWith(`${candidate.id}:`),
  );
  if (category === undefined) unavailable("category_draft_known has an unknown category id");
  return category.label;
}

export function buildDreamAuguryOfferTileModel(
  offer: MerchantOffer,
  context: MerchantContext,
): OfferTileModel {
  const id = `${offer.encounterSignature}:${offer.offerId}`;
  switch (offer.archetypeId) {
    case "fit_card_grant":
    case "strong_card":
      return { id, kind: "card-gift", card: requiredCard(offer.gameObjects, offer.archetypeId) };
    case "fit_card_draft":
      return { id, kind: "card-draft", cards: fourCards(candidateCards(offer, [4])) };
    case "transfigured_draft":
      return { id, kind: "transfigured-draft", cards: fourCards(candidateCards(offer, [4], true)) };
    case "category_draft_known":
      return {
        id,
        kind: "category-draft",
        cards: fourCards(candidateCards(offer, [4])),
        categoryName: categoryName(offer, context),
      };
    case "copies_draft":
      return {
        id,
        kind: "copies-draft",
        cards: fourCards(candidateCards(offer, [4])),
        copyCount: copyCount(offer),
      };
    case "card_bundle": {
      const cards = allCards(offer.gameObjects).map((card) => tileCard(card));
      return { id, kind: "card-bundle", cards: bundleCards(cards) };
    }
    case "transfigure": {
      const payload = offer.applyPayload;
      if (payload?.kind !== "transfigure_deck_entry") unavailable("transfigure has malformed payload");
      return {
        id,
        kind: "transfigure-card",
        card: requiredCard(offer.gameObjects, "transfigure", true),
        transfiguration: payload.transfiguration,
      };
    }
    case "starter_transfigure": {
      const cards = allCards(offer.gameObjects).map((card) => tileCard(card, true));
      return { id, kind: "transfigure-starters", cards: starterCards(cards) };
    }
    case "keyword_mod": {
      const payload = offer.applyPayload;
      if (payload?.kind !== "change_deck_entry_keywords" || payload.keywords.setReclaim === undefined) {
        unavailable("keyword_mod has malformed payload");
      }
      const deckCard = context.deckEntryById.get(payload.entryId);
      if (deckCard === undefined) unavailable("keyword_mod targets an unknown deck entry");
      const original = resolveDeckEntryCard(deckCard.card, deckCard.deckEntry).reclaimCost ?? 0;
      const reclaimReduction = original - payload.keywords.setReclaim;
      if (reclaimReduction < 1) unavailable("keyword_mod does not reduce Reclaim");
      return {
        id,
        kind: "keyword-modification",
        card: requiredCard(offer.gameObjects, "keyword_mod", true),
        reclaimReduction,
      };
    }
    case "tribal_change": {
      const payload = offer.applyPayload;
      if (payload?.kind !== "change_deck_entry_type") unavailable("tribal_change has malformed payload");
      const subtype = payload.typeChange.subtype as OfferTileCharacterSubtype;
      if (!["Warrior", "Spirit Animal", "Survivor", "Outsider"].includes(subtype)) {
        unavailable("tribal_change targets an unsupported subtype");
      }
      return {
        id,
        kind: "tribal-change",
        card: requiredCard(offer.gameObjects, "tribal_change", true),
        newCharacterSubtype: subtype,
      };
    }
    case "purge":
      return { id, kind: "purge-card", card: requiredCard(offer.gameObjects, "purge") };
    case "purge_replace":
      return {
        id,
        kind: "trade-card",
        outgoing: requiredCard(offer.gameObjects, "purge_replace"),
        incoming: fourCards(candidateCards(offer, [4])),
      };
    case "duplicate": {
      const cards = offer.choiceRequest === undefined
        ? [requiredCard(offer.gameObjects, "duplicate")]
        : candidateCards(offer, [1, 2, 3]);
      return { id, kind: "duplicate-card", cards: duplicateCards(cards) };
    }
    case "dreamsign":
      return { id, kind: "dreamsign-gift", dreamsign: requiredDreamsign(offer.gameObjects, "dreamsign") };
    case "dreamsign_draft": {
      const candidates = offer.choiceRequest?.candidates;
      if (candidates === undefined || candidates.length < 2 || candidates.length > 4) {
        unavailable("dreamsign_draft requires 2 to 4 candidates");
      }
      return {
        id,
        kind: "dreamsign-draft",
        dreamsigns: dreamsignTuple(candidates.map((candidate) =>
          requiredDreamsign(candidate.gameObjects, "dreamsign_draft candidate"),
        )),
      };
    }
    case "add_site": {
      const payload = offer.applyPayload;
      if (payload?.kind !== "add_site") unavailable("add_site has malformed payload");
      return {
        id,
        kind: "add-site",
        site: {
          id: payload.siteType,
          name: siteTypeName(payload.siteType),
          glyph: glyph(siteTypeIcon(payload.siteType)),
        },
      };
    }
  }
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
        model: sitePreviewModel(presentation.siteType),
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
  context: MerchantContext,
): DreamAuguryOfferView[] {
  if (encounter.offers.length !== 2) {
    unavailable("encounter requires exactly 2 offers");
  }
  return encounter.offers.map((offer) => {
    const tile = buildDreamAuguryOfferTileModel(offer, context);
    return {
      id: offer.offerId,
      headline: buildDreamAuguryOfferHeadline(tile),
      subtitle: offerTileDescription(tile),
      requiresSelection: (offer.choiceRequest?.candidates.length ?? 0) > 0,
      tile,
      visual: buildOfferVisual(offer, context),
    };
  });
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
  guideLine: string | null;
}): DreamAuguryBuildResult {
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  const baseView = {
    siteId: params.site.id,
    scene,
    guide: buildDreamAuguryGuideView(params.guide, params.guideLine),
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
        unavailableMessage: null,
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
      view: {
        ...baseView,
        encounterSignature: null,
        offers: [],
        unavailableMessage:
          "The visions are clouded. I cannot read these paths; walk on for now.",
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
