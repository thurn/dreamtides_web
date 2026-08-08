import type { SiteType } from "../../types/journey";
import type {
  MerchantChoiceCandidate,
  MerchantDeckCard,
  MerchantGameObject,
  MerchantOffer,
} from "../types";

/** A card-shaped game object (a deck card or a catalog card). */
export type JourneyCardObject = Extract<
  MerchantGameObject,
  { objectType: "catalogCard" | "deckCard" }
>;

/** A dreamsign game object. */
export type JourneyDreamsignObject = Extract<
  MerchantGameObject,
  { objectType: "dreamsign" }
>;

/**
 * The visual treatment an offer renders with. Derived purely from the offer's
 * archetype and structure (a pre-targeted offer carries `applyPayload` + a
 * single object; a chooser carries `choiceRequest`). The renderer switches on
 * `kind`; every variant carries exactly the objects that treatment needs.
 */
export type OfferPresentation =
  /** Card Gift — one pre-targeted card. */
  | { kind: "heroCard"; card: JourneyCardObject }
  /** Card bundle — several pre-targeted cards granted together, shown in a row. */
  | { kind: "cardBundle"; cards: readonly JourneyCardObject[] }
  /**
   * Draft / themed package — pick 1 of N full cards in a grid. `transfigured`
   * shows each pick already transfigured; `doubled` renders the pick as two
   * copies (the `copies_draft` "keep two copies" treatment).
   */
  | {
      kind: "cardGrid";
      candidates: readonly MerchantChoiceCandidate[];
      transfigured: boolean;
      doubled: boolean;
    }
  /** Transfigure / keyword / tribal — a pre-targeted before → after pair. */
  | { kind: "beforeAfter"; object: MerchantDeckCard }
  /** Improve several starter cards — one before → after pair per card. */
  | { kind: "beforeAfterMulti"; objects: readonly MerchantDeckCard[] }
  /** Purge — one pre-targeted card under a red seal. */
  | { kind: "purge"; object: MerchantDeckCard }
  /** Duplicate (chooser) — pick one of up to three; the pick renders as two copies. */
  | { kind: "duplicateChoose"; candidates: readonly MerchantChoiceCandidate[] }
  /** Duplicate (single) — one pre-targeted card shown as two copies. */
  | { kind: "duplicateSingle"; object: MerchantDeckCard }
  /** Dreamsign Gift — a pre-targeted dreamsign icon with rules on hover. */
  | { kind: "dreamsign"; object: JourneyDreamsignObject }
  /** Add Site — a slice of the dreamscape map with the new node inserted. */
  | { kind: "addSite"; siteType: SiteType }
  /** Anything unrecognized renders its raw objects so nothing ever blanks out. */
  | { kind: "fallback"; objects: readonly MerchantGameObject[] };

function firstCardObject(
  objects: readonly MerchantGameObject[],
): JourneyCardObject | undefined {
  return objects.find(
    (object): object is JourneyCardObject =>
      object.objectType === "catalogCard" || object.objectType === "deckCard",
  );
}

function allCardObjects(
  objects: readonly MerchantGameObject[],
): readonly JourneyCardObject[] {
  return objects.filter(
    (object): object is JourneyCardObject =>
      object.objectType === "catalogCard" || object.objectType === "deckCard",
  );
}

function firstDeckCard(
  objects: readonly MerchantGameObject[],
): MerchantDeckCard | undefined {
  return objects.find(
    (object): object is MerchantDeckCard => object.objectType === "deckCard",
  );
}

function allDeckCards(
  objects: readonly MerchantGameObject[],
): readonly MerchantDeckCard[] {
  return objects.filter(
    (object): object is MerchantDeckCard => object.objectType === "deckCard",
  );
}

function firstDreamsign(
  objects: readonly MerchantGameObject[],
): JourneyDreamsignObject | undefined {
  return objects.find(
    (object): object is JourneyDreamsignObject => object.objectType === "dreamsign",
  );
}

/**
 * Resolve an offer to its visual treatment. The mapping keys off the archetype
 * id (an enum) and the offer's chooser/pre-targeted shape, never card names.
 * Falls back to a plain object list if an offer's data does not fit any
 * treatment, so an unexpected shape degrades to something visible rather than a
 * blank column.
 */
export function resolveOfferPresentation(offer: MerchantOffer): OfferPresentation {
  const candidates = offer.choiceRequest?.candidates;
  const isChooser = candidates !== undefined && candidates.length > 0;

  switch (offer.archetypeId) {
    case "add_site": {
      if (offer.applyPayload?.kind === "add_site") {
        return { kind: "addSite", siteType: offer.applyPayload.siteType };
      }
      return { kind: "fallback", objects: offer.gameObjects };
    }

    case "purge": {
      const object = firstDeckCard(offer.gameObjects);
      return object === undefined
        ? { kind: "fallback", objects: offer.gameObjects }
        : { kind: "purge", object };
    }

    case "duplicate": {
      if (isChooser) {
        return { kind: "duplicateChoose", candidates };
      }
      const object = firstDeckCard(offer.gameObjects);
      return object === undefined
        ? { kind: "fallback", objects: offer.gameObjects }
        : { kind: "duplicateSingle", object };
    }

    case "starter_transfigure": {
      const objects = allDeckCards(offer.gameObjects);
      return objects.length === 0
        ? { kind: "fallback", objects: offer.gameObjects }
        : { kind: "beforeAfterMulti", objects };
    }

    case "transfigure": {
      const object = firstDeckCard(offer.gameObjects);
      return object === undefined
        ? { kind: "fallback", objects: offer.gameObjects }
        : { kind: "beforeAfter", object };
    }

    case "dreamsign": {
      const object = firstDreamsign(offer.gameObjects);
      return object === undefined
        ? { kind: "fallback", objects: offer.gameObjects }
        : { kind: "dreamsign", object };
    }

    // Card bundle — several cards granted together; show every one, not just
    // the first.
    case "card_bundle": {
      const cards = allCardObjects(offer.gameObjects);
      return cards.length === 0
        ? { kind: "fallback", objects: offer.gameObjects }
        : { kind: "cardBundle", cards };
    }

    // Grant family.
    case "strong_card":
    case "fit_card_grant":
    case "fit_card_draft":
    case "copies_draft":
    case "category_draft_known":
    case "transfigured_draft": {
      if (isChooser) {
        return {
          kind: "cardGrid",
          candidates,
          transfigured: offer.archetypeId === "transfigured_draft",
          doubled: offer.archetypeId === "copies_draft",
        };
      }
      const card = firstCardObject(offer.gameObjects);
      return card === undefined
        ? { kind: "fallback", objects: offer.gameObjects }
        : { kind: "heroCard", card };
    }

    default: {
      // Exhaustiveness guard: a new archetype lands here until it is mapped.
      if (isChooser) {
        return { kind: "cardGrid", candidates, transfigured: false, doubled: false };
      }
      return { kind: "fallback", objects: offer.gameObjects };
    }
  }
}

/** Whether the player must select a candidate before the accept button works. */
export function presentationRequiresSelection(
  presentation: OfferPresentation,
): boolean {
  return (
    presentation.kind === "cardGrid" ||
    presentation.kind === "duplicateChoose"
  );
}

/** The candidate set a chooser presentation offers, or empty for pre-targeted. */
export function presentationCandidates(
  presentation: OfferPresentation,
): readonly MerchantChoiceCandidate[] {
  switch (presentation.kind) {
    case "cardGrid":
    case "duplicateChoose":
      return presentation.candidates;
    default:
      return [];
  }
}
