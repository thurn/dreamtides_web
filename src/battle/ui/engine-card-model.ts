// The card model the battle screen renders for one engine instance: the
// printed card's display data (name, text, art, transfiguration) with the
// engine's effective characteristics (cost, spark, type) applied.
//
// Display data comes, in order, from the battle's dealt card definitions
// (which carry each deck entry's transfigured and modified text and art), the
// card catalog (cards an effect creates), and the figment catalog. Identity is
// always the card UUID. Copies of one card whose deck entries differ show
// each its own definition: a definition is matched by the instance's display
// variant, and a card in a variant no deck entry dealt shows the catalog card.

import { remapGameCardModelTypes } from "../../runtime/card-type-remap";
import type { GameCardModel } from "../../cumulus/components/card/CardView";
import type { InstanceView } from "../../engine";
import type { DeckMods } from "../../engine/dsl/types";
import { figmentCardDisplayName } from "../../data/figment-card-display";
import { parseCardId, parseCardName, type CardId, type CardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { TransfigurationType } from "../../types/journey";
import { deckModsOf } from "../integration/engine-battle-init";
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

/** An event-authorized physical printing and its immutable display variant. */
export type EngineCardIdentity = {
  readonly printing: Extract<InstanceView["printing"], { readonly kind: "card" }>;
  readonly variant: InstanceView["variant"];
};

/** Builds card models for one battle, reusing the model of an unchanged instance. */
export interface EngineCardModels {
  (instance: InstanceView): GameCardModel;
  /** Resolves the name of an event-authorized physical identity without fabricating a full view. */
  nameOf(identity: EngineCardIdentity): CardName;
}

/**
 * Dealt card definitions by card UUID: the first of each display variant,
 * and the first of each transfiguration for a transfigured instance whose
 * display variant no definition has.
 */
type DefinitionIndex = ReadonlyMap<CardId, CardDefinitions>;

interface CardDefinitions {
  readonly byVariant: Map<string, BattleDeckCardDefinition>;
  readonly byTransfiguration: Map<TransfigurationType, BattleDeckCardDefinition>;
}

/**
 * The part of a variant the dealt display data depends on: the
 * transfiguration and the Fast, Reclaim, and type changes of the deck entry.
 * The spark bonus and cost reduction change only spark and cost, which the
 * model takes from the engine's characteristics, a multi-cost card's orb
 * labels included (`engineOrbLabels`).
 */
function serializedDisplayVariant(transfiguration: TransfigurationType | null, mods: DeckMods | null | undefined): string {
  return JSON.stringify([
    transfiguration,
    mods?.fast ?? false,
    mods?.reclaim ?? null,
    mods?.typeChange?.cardType ?? null,
    mods?.typeChange?.subtype ?? null,
  ]);
}

function instanceDisplayVariant(instance: Pick<InstanceView, "variant">): string {
  return serializedDisplayVariant(instance.variant.transfigurations?.[0] ?? null, instance.variant.deckMods);
}

/**
 * A card-model builder over `sources`. Models are cached by everything they
 * show, so an instance whose display did not change keeps the same object
 * across renders.
 */
export function createEngineCardModels(sources: EngineCardSources): EngineCardModels {
  const definitions = new Map<CardId, CardDefinitions>();
  for (const definition of sources.definitions) {
    const indexed = definitions.get(definition.cardId) ?? { byVariant: new Map(), byTransfiguration: new Map() };
    const variant = serializedDisplayVariant(definition.transfiguration, deckModsOf(definition));
    if (!indexed.byVariant.has(variant)) indexed.byVariant.set(variant, definition);
    if (definition.transfiguration !== null && !indexed.byTransfiguration.has(definition.transfiguration)) {
      indexed.byTransfiguration.set(definition.transfiguration, definition);
    }
    definitions.set(definition.cardId, indexed);
  }
  const cache = new Map<string, GameCardModel>();
  return Object.assign((instance: InstanceView) => {
    const { characteristics } = instance;
    const key = [
      instance.id,
      JSON.stringify(instance.printing),
      characteristics.cardType,
      characteristics.subtype,
      characteristics.cost,
      characteristics.spark ?? "",
      instanceDisplayVariant(instance),
      instance.variant.typeRemap ?? "",
    ].join("|");
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const model = remapGameCardModelTypes(buildModel(sources, definitions, instance), instance.variant.typeRemap);
    cache.set(key, model);
    return model;
  }, { nameOf: (identity: EngineCardIdentity) => cardName(sources, definitions, identity.printing.cardId, identity.variant) });
}

/** The dealt display definition selected by the immutable UUID and variant. */
function displayDefinition(definitions: DefinitionIndex, cardId: CardId, variant: InstanceView["variant"]): BattleDeckCardDefinition | undefined {
  const transfiguration = variant.transfigurations?.[0] ?? null;
  const indexed = definitions.get(cardId);
  return indexed?.byVariant.get(instanceDisplayVariant({ variant })) ??
    (transfiguration === null ? undefined : indexed?.byTransfiguration.get(transfiguration));
}

function cardName(sources: EngineCardSources, definitions: DefinitionIndex, cardId: CardId, variant: InstanceView["variant"]): CardName {
  return displayDefinition(definitions, cardId, variant)?.name ?? sources.cards.get(cardId)?.name ?? parseCardName("Card");
}

/**
 * A multi-cost card's orb labels at its engine cost: the printing's X orbs
 * stay, and its fixed orbs become one orb, in the first fixed orb's place,
 * showing `cost`, the fixed energy after deck-entry and in-battle cost
 * changes. A printing with only X orbs gains a leading fixed orb when its
 * cost rises above 0.
 */
function engineOrbLabels(printed: readonly string[], cost: number): string[] {
  const labels: string[] = printed.filter((label) => label === "X");
  const fixedAt = printed.findIndex((label) => label !== "X");
  if (fixedAt >= 0 || cost > 0) labels.splice(Math.max(fixedAt, 0), 0, String(cost));
  return labels;
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
  const definition = displayDefinition(definitions, cardId, instance.variant);
  const card = sources.cards.get(cardId);
  const name = cardName(sources, definitions, cardId, instance.variant);
  const imageNumber = definition?.imageNumber ?? card?.imageNumber ?? 0;
  const art = definition?.art ?? card?.art;
  const printedOrbs = definition?.energyCosts ?? card?.energyCosts;
  const energyCosts = printedOrbs === undefined ? undefined : engineOrbLabels(printedOrbs, characteristics.cost);
  const printedEnergyCost = definition === undefined ? card?.energyCost : definition.printedEnergyCost;
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
      energyCost: printedEnergyCost === null ? null : characteristics.cost,
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
