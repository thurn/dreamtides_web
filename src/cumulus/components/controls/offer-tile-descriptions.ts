import type {
  AuguryArchetypeData,
  AuguryPresentationText,
} from "../../../types/augury-data";
import { richText, type RichText } from "../card/rich-text";
import type { OfferTileModel } from "./OfferTile";
import { fillTemplate } from "../../../runtime/text";

type Presentation = AuguryArchetypeData["presentation"];
type HeadlinePresentation = Pick<Presentation, "headline">;
type SubtitlePresentation = Pick<Presentation, "subtitle">;
function cardName(model: { readonly name: string }): string {
  return model.name;
}

function countFor(model: OfferTileModel): number | null {
  switch (model.kind) {
    case "copies-draft":
      return model.copyCount;
    case "card-bundle":
    case "transfigure-starters":
    case "duplicate-card":
      return model.cards.length;
    default:
      return null;
  }
}

function variablesFor(
  model: OfferTileModel,
): Readonly<Record<string, string | number>> {
  switch (model.kind) {
    case "card-gift":
    case "transfigure-card":
    case "purge-card":
      return { card_name: cardName(model.card) };
    case "category-draft":
      switch (model.category.kind) {
        case "subtype":
          return { subtype_name: model.category.name };
        case "package":
          return { package_reference: model.category.name };
        default:
          return {};
      }
    case "copies-draft":
      return { count: model.copyCount };
    case "card-bundle":
      return { count: model.cards.length };
    case "transfigure-starters":
      return model.cards.length === 1
        ? { count: 1, card_name: cardName(model.cards[0]) }
        : {
            count: 2,
            first_card_name: cardName(model.cards[0]),
            second_card_name: cardName(model.cards[1]),
          };
    case "duplicate-card":
      return { count: model.cards.length, card_name: cardName(model.cards[0]) };
    case "dreamsign-gift":
      return { dreamsign_name: model.dreamsign.name };
    case "add-site":
      return { site_name: model.site.name };
    case "card-draft":
    case "transfigured-draft":
      return {};
  }
}

function categoryTemplate(
  text: Extract<AuguryPresentationText, { kind: "category" }>,
  model: OfferTileModel,
): string {
  if (model.kind !== "category-draft") {
    throw new Error(
      "Augury category presentation requires a category-draft offer",
    );
  }
  switch (model.category.kind) {
    case "character":
      return text.character;
    case "event":
      return text.event;
    case "cheap":
      return text.cheap;
    case "mid-cost":
      return text.midCost;
    case "expensive":
      return text.expensive;
    case "fast":
      return text.fast;
    case "subtype":
      return text.subtype;
    case "package":
      return text.package;
  }
}

function selectedTemplate(
  text: AuguryPresentationText,
  model: OfferTileModel,
): string {
  if (text.kind === "text") return text.text;
  if (text.kind === "category") return categoryTemplate(text, model);
  const count = countFor(model);
  if (count === null) {
    throw new Error("Augury count presentation requires a counted offer");
  }
  return count === 1 ? text.one : text.other;
}

function presentationText(
  text: AuguryPresentationText,
  model: OfferTileModel,
  variables: Readonly<Record<string, string | number>>,
): string {
  return fillTemplate(selectedTemplate(text, model), variables);
}

/** Complete authored detail title for an Augury offer's semantic model. */
export function auguryOfferHeadline(
  model: OfferTileModel,
  presentation: HeadlinePresentation,
): string {
  const count = countFor(model);
  return presentationText(
    presentation.headline,
    model,
    count === null ? {} : { count },
  );
}

/** Complete authored description for an Augury offer's semantic model. */
export function offerTileDescription(
  model: OfferTileModel,
  presentation: SubtitlePresentation,
): string {
  return presentationText(
    presentation.subtitle,
    model,
    variablesFor(model),
  );
}

/** Generic InfoCard copy that cannot interpolate surfaced object identities. */
export function offerTileRichDescription(
  model: OfferTileModel,
  presentation: HeadlinePresentation,
): RichText {
  return richText.plain(auguryOfferHeadline(model, presentation));
}
