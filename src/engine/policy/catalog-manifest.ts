/**
 * The policy worker's engine catalog. A catalog holds ability functions, so
 * it cannot cross into a worker; the worker builds its own from the content
 * modules plus a manifest of plain definitions for every entity a battle
 * names that the content modules may not define (a loaded entity plays
 * text-less, D36). The catalog holds one definition per UUID: the content
 * module's, or in a development build the prompt lab's synthetic one,
 * composed as the journey's catalog (`journeyContentEngine`) composes them,
 * and the manifest's text-less one only for a UUID neither defines.
 */
import {
  createCatalog,
  type ContentState,
  type EngineCardDefinition,
  type EngineCatalog,
  type EngineDreamwellDefinition,
} from "../catalog";
import {
  contentAvatarDefinitions,
  contentCardDefinitions,
  contentDreamsignDefinitions,
  contentDreamwellDefinitions,
  contentFigmentDefinitions,
} from "../content-catalog";
import type { AbilityList } from "../dsl/types";
import { developmentLabDefinitions } from "../development";
import type { AvatarId, CardId, DreamsignId } from "../state/ids";
import { SIDES } from "../state/ids";
import type { BattleInit } from "../state/types";

/** A card definition without its abilities: what a text-less card is. */
export type ManifestCard = Omit<EngineCardDefinition, "abilities" | "synthetic">;

export interface ManifestEmblem<Id> {
  readonly id: Id;
  readonly status: ContentState;
}

/** Plain data for every card, Dreamwell card, avatar, and dreamsign a battle names. */
export interface CatalogManifest {
  /** The entire source catalog's public cost ceiling, including cards absent from this battle. */
  readonly maximumFixedCost: number;
  readonly cards: readonly ManifestCard[];
  readonly dreamwell: readonly EngineDreamwellDefinition[];
  readonly avatars: readonly ManifestEmblem<AvatarId>[];
  readonly dreamsigns: readonly ManifestEmblem<DreamsignId>[];
}

const NO_ABILITIES: AbilityList = () => [];

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** The manifest of the entities `init` names, from the main thread's catalog. */
export function catalogManifest(catalog: EngineCatalog, init: BattleInit): CatalogManifest {
  const cardIds = unique<CardId>(SIDES.flatMap((side) => init.decks[side].map((entry) => entry.cardId)));
  const avatarIds = unique(SIDES.flatMap((side) => {
    const avatar = init.avatars?.[side];
    return avatar === undefined ? [] : [avatar];
  }));
  const dreamsignIds = unique(SIDES.flatMap((side) => init.dreamsigns?.[side] ?? []));
  return {
    cards: cardIds.map((id) => {
      const { abilities: _abilities, synthetic: _synthetic, ...plain } = catalog.card(id);
      return structuredClone(plain);
    }),
    maximumFixedCost: catalog.maximumFixedCost,
    dreamwell: unique(init.dreamwell).map((id) => ({ ...catalog.dreamwellCard(id) })),
    avatars: avatarIds.map((id) => ({ id, status: catalog.avatar(id).status })),
    dreamsigns: dreamsignIds.map((id) => ({ id, status: catalog.dreamsign(id).status })),
  };
}

/** The given definitions, then a text-less one for each manifest entity they lack: one per UUID. */
function withManifest<Id, Definition extends { readonly id: Id }, Named extends { readonly id: Id }>(
  definitions: readonly Definition[],
  named: readonly Named[],
  textless: (entity: Named) => Definition,
): Definition[] {
  const known = new Set(definitions.map((definition) => definition.id));
  return [...definitions, ...named.filter((entity) => !known.has(entity.id)).map(textless)];
}

function textlessEmblem<Id>(emblem: ManifestEmblem<Id>): { id: Id; status: ContentState; abilities: AbilityList } {
  return { ...emblem, abilities: NO_ABILITIES };
}

/** The worker's catalog: the content and lab definitions, then text-less ones for what only the manifest names. */
export function manifestCatalog(manifest: CatalogManifest): EngineCatalog {
  const lab = developmentLabDefinitions();
  return createCatalog(
    withManifest([...contentCardDefinitions(), ...lab.cards], manifest.cards, (card) => ({ ...card, abilities: NO_ABILITIES })),
    withManifest(contentDreamwellDefinitions(), manifest.dreamwell, (card) => card),
    {
      avatars: withManifest([...contentAvatarDefinitions(), ...(lab.emblems.avatars ?? [])], manifest.avatars, textlessEmblem),
      dreamsigns: withManifest([...contentDreamsignDefinitions(), ...(lab.emblems.dreamsigns ?? [])], manifest.dreamsigns, textlessEmblem),
    },
    [...contentFigmentDefinitions(), ...lab.figments],
    manifest.maximumFixedCost,
  );
}
