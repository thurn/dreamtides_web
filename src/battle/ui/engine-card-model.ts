// The card model the battle screen renders for one engine instance: the
// printed card's display data (name, text, art, transfiguration) with the
// engine's effective characteristics (cost, spark, type) applied.
//
// Display data comes, in order, from the battle's dealt card definitions
// (which carry each deck entry's transfigured text and art), the card
// catalog (cards an effect creates), and the figment catalog. Identity is
// always the card UUID.

import type { GameCardModel } from "../../cumulus/components/card/CardView";
import type { InstanceView } from "../../engine";
import { figmentCardDisplayName } from "../../data/figment-card-display";
import { parseCardId, parseCardName, type CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { TransfigurationType } from "../../types/journey";
import type { FigmentCatalogEntry } from "../state/figment-catalog";
import type { BattleDeckCardDefinition } from "../types";

export interface EngineCardSources {
  /** Every card definition the battle dealt, both decks. */
  readonly definitions: readonly BattleDeckCardDefinition[];
  /** The card catalog, by card UUID. */
  readonly cards: ReadonlyMap<CardId, CardData>;
  /** The figment catalog entry of a figment UUID. */
  readonly figment: (id: CardId) => FigmentCatalogEntry | undefined;
}

/** Builds card models for one battle, reusing the model of an unchanged instance. */
export type EngineCardModels = (instance: InstanceView) => GameCardModel;

/** Dealt card definitions by card UUID, then by transfiguration. */
type DefinitionIndex = ReadonlyMap<CardId, ReadonlyMap<TransfigurationType | null, BattleDeckCardDefinition>>;

/**
 * A card-model builder over `sources`. Models are cached by everything they
 * show, so an instance whose display did not change keeps the same object
 * across renders.
 */
export function createEngineCardModels(sources: EngineCardSources): EngineCardModels {
  const definitions = new Map<CardId, Map<TransfigurationType | null, BattleDeckCardDefinition>>();
  for (const definition of sources.definitions) {
    const byVariant =
      definitions.get(definition.cardId) ?? new Map<TransfigurationType | null, BattleDeckCardDefinition>();
    if (!byVariant.has(definition.transfiguration)) byVariant.set(definition.transfiguration, definition);
    definitions.set(definition.cardId, byVariant);
  }
  const cache = new Map<string, GameCardModel>();
  return (instance) => {
    const { characteristics } = instance;
    const key = [
      instance.id,
      JSON.stringify(instance.printing),
      characteristics.cardType,
      characteristics.subtype,
      characteristics.cost,
      characteristics.spark ?? "",
      instance.variant.transfigurations?.[0] ?? "",
    ].join("|");
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const model = buildModel(sources, definitions, instance);
    cache.set(key, model);
    return model;
  };
}

function buildModel(
  sources: EngineCardSources,
  definitions: DefinitionIndex,
  instance: InstanceView,
): GameCardModel {
  const { characteristics, printing } = instance;
  const cardType = characteristics.cardType === "character" ? "Character" : "Event";
  if (printing.kind === "figment") {
    const figmentId = parseCardId(printing.figment);
    const entry = sources.figment(figmentId);
    const imageNumber = entry?.imageNumber ?? 0;
    return {
      cardId: figmentId,
      displaySnapshot: {
        id: figmentId,
        name: figmentCardDisplayName(entry?.name ?? parseCardName("Figment"), characteristics.subtype),
        cardNumber: 0,
        cardType,
        subtype: characteristics.subtype,
        isStarter: false,
        energyCost: characteristics.cost,
        spark: characteristics.spark,
        isFast: false,
        renderedText: entry?.renderedText ?? "",
        imageNumber,
        artOwned: entry?.artOwned ?? imageNumber > 0,
        ...(entry?.art === undefined ? {} : { art: entry.art }),
      },
    };
  }
  const cardId = printing.cardId;
  const transfiguration = instance.variant.transfigurations?.[0] ?? null;
  const byVariant = definitions.get(cardId);
  const definition = byVariant?.get(transfiguration) ?? byVariant?.get(null);
  const card = sources.cards.get(cardId);
  const name = definition?.name ?? card?.name ?? parseCardName("Card");
  const imageNumber = definition?.imageNumber ?? card?.imageNumber ?? 0;
  const art = definition?.art ?? card?.art;
  const energyCosts = definition?.energyCosts ?? card?.energyCosts;
  return {
    cardId,
    ...(definition?.transfigurationDisplay === undefined
      ? {}
      : { transfiguration: definition.transfigurationDisplay }),
    displaySnapshot: {
      id: cardId,
      name: printing.kind === "figmentCopy" ? figmentCardDisplayName(name, characteristics.subtype) : name,
      cardNumber: definition?.cardNumber ?? card?.cardNumber ?? 0,
      cardType,
      subtype: characteristics.subtype,
      isStarter: card?.isStarter ?? false,
      energyCost: characteristics.cost,
      ...(energyCosts === undefined ? {} : { energyCosts }),
      spark: characteristics.spark,
      isFast: definition?.isFast ?? card?.isFast ?? false,
      isInterrupt: definition === undefined ? card?.isInterrupt === true : definition.timing === "interrupt",
      reclaimCost: definition?.reclaimCost ?? card?.reclaimCost ?? null,
      renderedText: definition?.renderedText ?? card?.renderedText ?? "",
      imageNumber,
      artOwned: imageNumber > 0,
      ...(art === undefined ? {} : { art }),
    },
  };
}
