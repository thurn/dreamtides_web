import type {
  AuguryArchetypeData,
  AuguryPresentationText,
} from "../../../types/augury-data";
import type { LocalizedString } from "@trox/runtime";
import {
  bindSourceTransport,
  canonicalPlaceholderName,
  localizedSourceText,
} from "../../../runtime/localization/runtime";
import type { SourceTransport } from "../../../runtime/localization/runtime";
import { richText, type RichText } from "../card/rich-text";
import type { OfferTileModel } from "./OfferTile";

type Presentation = AuguryArchetypeData["presentation"];
type HeadlinePresentation = Pick<Presentation, "headline">;
type SubtitlePresentation = Pick<Presentation, "subtitle">;
function cardName(model: { readonly name: string }): LocalizedString {
  return localizedSourceText(model.name);
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
): Readonly<Record<string, LocalizedString | number>> {
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
): SourceTransport {
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
): SourceTransport {
  if (text.kind === "text") return text.text;
  if (text.kind === "category") return categoryTemplate(text, model);
  const count = countFor(model);
  if (count === null) {
    throw new Error("Augury count presentation requires a counted offer");
  }
  return count === 1 ? text.one : text.other;
}

function localizedPresentationText(
  text: AuguryPresentationText,
  model: OfferTileModel,
  variables: Readonly<Record<string, LocalizedString | number>>,
): LocalizedString {
  const selected = selectedTemplate(text, model);
  if (typeof selected !== "string") {
    return bindSourceTransport(selected, variables);
  }
  const names = [...selected.matchAll(/\{([a-z][a-zA-Z0-9_]*)\}/gu)].map(
    (match) => match[1] ?? "",
  );
  const compatibleVariables = Object.fromEntries(
    names.map((name) => {
      const value =
        variables[name] ?? variables[canonicalPlaceholderName(name)];
      if (value === undefined) throw new Error(`missing value for {${name}}`);
      return [name, value];
    }),
  );
  return bindSourceTransport(selected, compatibleVariables);
}

/** Complete authored detail title for an Augury offer's semantic model. */
export function auguryOfferHeadline(
  model: OfferTileModel,
  presentation: HeadlinePresentation,
): LocalizedString {
  const count = countFor(model);
  return localizedPresentationText(
    presentation.headline,
    model,
    count === null ? {} : { count },
  );
}

/** Complete authored description for an Augury offer's semantic model. */
export function offerTileDescription(
  model: OfferTileModel,
  presentation: SubtitlePresentation,
): LocalizedString {
  return localizedPresentationText(
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
