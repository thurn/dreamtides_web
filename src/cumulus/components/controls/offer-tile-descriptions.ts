import type { MessageFormatter } from "../../hooks/use-messages";
import { richText, type RichText } from "../card/rich-text";
import type { OfferTileModel } from "./OfferTile";

function cardName(model: { readonly displaySnapshot: { readonly name: string } }): string {
  return model.displaySnapshot.name;
}

/** Complete localized detail title for an Augury offer's semantic model. */
export function auguryOfferHeadline(
  model: OfferTileModel,
  t: MessageFormatter,
): string {
  switch (model.kind) {
    case "card-gift":
      return t("augury-offer-card-gift-title");
    case "card-draft":
      return t("augury-offer-card-draft-title");
    case "copies-draft":
      return t("augury-offer-copies-draft-title");
    case "category-draft":
      return t("augury-offer-category-draft-title");
    case "transfigured-draft":
      return t("augury-offer-transfigured-draft-title");
    case "card-bundle":
      return t("augury-offer-card-bundle-title", {
        count: model.cards.length,
      });
    case "transfigure-card":
      return t("augury-offer-transfigure-card-title");
    case "transfigure-starters":
      return t("augury-offer-transfigure-starters-title");
    case "keyword-modification":
      return t("augury-offer-reclaim-reduction-title");
    case "tribal-change":
      return t("augury-offer-subtype-change-title");
    case "purge-card":
      return t("augury-offer-purge-card-title");
    case "trade-card":
      return t("augury-offer-trade-card-title");
    case "duplicate-card":
      return t("augury-offer-duplicate-card-title", {
        candidateCount: model.cards.length,
      });
    case "dreamsign-gift":
      return t("augury-offer-dreamsign-gift-title");
    case "dreamsign-draft":
      return t("augury-offer-dreamsign-draft-title");
    case "add-site":
      return t("augury-offer-add-site-title");
  }
}

/** Complete localized description for an Augury offer's semantic model. */
export function offerTileDescription(
  model: OfferTileModel,
  t: MessageFormatter,
): string {
  switch (model.kind) {
    case "card-gift":
      return t("augury-offer-card-gift-description", {
        cardName: cardName(model.card),
      });
    case "card-draft":
      return t("augury-offer-card-draft-description");
    case "copies-draft":
      return t("augury-offer-copies-draft-description", {
        copyCount: model.copyCount,
      });
    case "category-draft":
      return t("augury-offer-category-draft-description", {
        categoryName: model.categoryName,
      });
    case "transfigured-draft":
      return t("augury-offer-transfigured-draft-description");
    case "card-bundle":
      return t("augury-offer-card-bundle-description", {
        count: model.cards.length,
      });
    case "transfigure-card":
      return t("augury-offer-transfigure-card-description", {
        cardName: cardName(model.card),
      });
    case "transfigure-starters":
      return model.cards.length === 1
        ? t("augury-offer-transfigure-one-starter-description", {
            cardName: cardName(model.cards[0]),
          })
        : t("augury-offer-transfigure-two-starters-description", {
            firstCardName: cardName(model.cards[0]),
            secondCardName: cardName(model.cards[1]),
          });
    case "keyword-modification":
      return t("augury-offer-reclaim-reduction-description", {
        cardName: cardName(model.card),
      });
    case "tribal-change":
      return t("augury-offer-subtype-change-description", {
        cardName: cardName(model.card),
        subtypeName: model.newCharacterSubtype,
      });
    case "purge-card":
      return t("augury-offer-purge-card-description", {
        cardName: cardName(model.card),
      });
    case "trade-card":
      return t("augury-offer-trade-card-description", {
        cardName: cardName(model.outgoing),
      });
    case "duplicate-card":
      return model.cards.length === 1
        ? t("augury-offer-duplicate-one-card-description", {
            cardName: cardName(model.cards[0]),
          })
        : t("augury-offer-duplicate-card-choice-description", {
            candidateCount: model.cards.length,
          });
    case "dreamsign-gift":
      return t("augury-offer-dreamsign-gift-description", {
        dreamsignName: model.dreamsign.name,
      });
    case "dreamsign-draft":
      return t("augury-offer-dreamsign-draft-description");
    case "add-site":
      return t("augury-offer-add-site-description", {
        siteName: model.site.name,
      });
  }
}

/** Localized InfoCard copy derived at the rendering boundary. */
export function offerTileRichDescription(
  model: OfferTileModel,
  t: MessageFormatter,
): RichText {
  return richText.plain(offerTileDescription(model, t));
}
