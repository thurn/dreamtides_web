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
function cardName(model: {
  readonly displaySnapshot: { readonly name: string };
}): LocalizedString {
  return localizedSourceText(model.displaySnapshot.name);
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
      return {
        ...(model.category.kind === "subtype" ||
        model.category.kind === "package"
          ? { category_name: model.category.name }
          : {}),
      };
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
): LocalizedString {
  const variables = variablesFor(model);
  const selected = selectedTemplate(text, model);
  if (typeof selected !== "string") {
    return bindSourceTransport(selected, variables);
  }
  const names = [...selected.matchAll(/\{([a-z][a-zA-Z0-9_]*)\}/gu)]
    .map((match) => match[1] ?? "");
  const compatibleVariables = Object.fromEntries(names.map((name) => {
    const value = variables[name] ?? variables[canonicalPlaceholderName(name)];
    if (value === undefined) throw new Error(`missing value for {${name}}`);
    return [name, value];
  }));
  return bindSourceTransport(selected, compatibleVariables);
}

/** Complete authored detail title for an Augury offer's semantic model. */
export function auguryOfferHeadline(
  model: OfferTileModel,
  presentation: Presentation,
): LocalizedString {
  return localizedPresentationText(presentation.headline, model);
}

/** Complete authored description for an Augury offer's semantic model. */
export function offerTileDescription(
  model: OfferTileModel,
  presentation: Presentation,
): LocalizedString {
  return localizedPresentationText(presentation.subtitle, model);
}

/** InfoCard copy derived from the authored Augury presentation. */
export function offerTileRichDescription(
  model: OfferTileModel,
  presentation: Presentation,
): RichText {
  return richText.plain(offerTileDescription(model, presentation));
}
