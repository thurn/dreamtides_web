import type { InstanceView } from "../engine";
import type { DeckMods, TransfigurationApplication } from "../engine/dsl/types";
import type { CardId } from "../types/card-identity";
import type { TransfigurationType } from "../types/journey";
import type { BattleDeckCardDefinition } from "./types";
import { deckModsOf } from "./deck-mods";

interface CardDefinitions {
  readonly byVariant: Map<string, BattleDeckCardDefinition>;
  readonly byTransfiguration: Map<string, BattleDeckCardDefinition>;
}

export interface BattleCardDisplayResolver {
  definition(cardId: CardId, variant: InstanceView["variant"]): BattleDeckCardDefinition | undefined;
  serializeVariant(variant: InstanceView["variant"]): string;
}

/** Display depends on ordered applications, Fast, Reclaim and type changes. */
function serializedDisplayVariant(transfiguration: TransfigurationType | null, mods: DeckMods | null | undefined, applications?: readonly TransfigurationApplication[]): string {
  return JSON.stringify([
    applications === undefined ? transfiguration : applications,
    mods?.fast ?? false,
    mods?.reclaim ?? null,
    mods?.typeChange?.cardType ?? null,
    mods?.typeChange?.subtype ?? null,
  ]);
}

function instanceDisplayVariant(instance: Pick<InstanceView, "variant">): string {
  return serializedDisplayVariant(instance.variant.transfigurations?.[0] ?? null, instance.variant.deckMods, instance.variant.transfigurationApplications);
}

/** First definition per exact variant, then the authored transfiguration fallback. */
export function createBattleCardDisplayResolver(entries: readonly BattleDeckCardDefinition[]): BattleCardDisplayResolver {
  const definitions = new Map<CardId, CardDefinitions>();
  for (const definition of entries) {
    const indexed = definitions.get(definition.cardId) ?? { byVariant: new Map(), byTransfiguration: new Map() };
    const variant = serializedDisplayVariant(definition.transfiguration, deckModsOf(definition), definition.transfigurationDisplay?.applications?.map(step => step.application));
    if (!indexed.byVariant.has(variant)) indexed.byVariant.set(variant, definition);
    const history = JSON.stringify(definition.transfigurationDisplay?.applications?.map(step => step.application) ?? definition.transfiguration);
    if (definition.transfiguration !== null && !indexed.byTransfiguration.has(history)) indexed.byTransfiguration.set(history, definition);
    definitions.set(definition.cardId, indexed);
  }
  return {
    definition(cardId, variant) {
      const transfiguration = variant.transfigurations?.[0] ?? null;
      const history = variant.transfigurationApplications;
      const indexed = definitions.get(cardId);
      return indexed?.byVariant.get(instanceDisplayVariant({ variant })) ??
        (history === undefined && transfiguration === null ? undefined : indexed?.byTransfiguration.get(JSON.stringify(history ?? transfiguration)));
    },
    serializeVariant: variant => instanceDisplayVariant({ variant }),
  };
}
