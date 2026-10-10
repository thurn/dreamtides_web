/**
 * The policy worker's engine catalog. A catalog holds ability functions, so
 * it cannot cross into a worker; the worker builds its own from the content
 * modules plus a manifest of plain definitions for every entity a battle
 * names that the content modules may not define (a loaded entity plays
 * text-less, D36). Content-module definitions win, as they do in the
 * journey's catalog (`journeyContentEngine`); a development build adds the
 * prompt lab's synthetic definitions, as that catalog does.
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
    dreamwell: unique(init.dreamwell).map((id) => ({ ...catalog.dreamwellCard(id) })),
    avatars: avatarIds.map((id) => ({ id, status: catalog.avatar(id).status })),
    dreamsigns: dreamsignIds.map((id) => ({ id, status: catalog.dreamsign(id).status })),
  };
}

/** The worker's catalog: the content modules, then text-less definitions for what only the manifest names. */
export function manifestCatalog(manifest: CatalogManifest): EngineCatalog {
  const lab = developmentLabDefinitions();
  return createCatalog(
    [...manifest.cards.map((card) => ({ ...card, abilities: NO_ABILITIES })), ...contentCardDefinitions(), ...lab.cards],
    [...manifest.dreamwell, ...contentDreamwellDefinitions()],
    {
      avatars: [
        ...manifest.avatars.map((avatar) => ({ ...avatar, abilities: NO_ABILITIES })),
        ...contentAvatarDefinitions(),
        ...(lab.emblems.avatars ?? []),
      ],
      dreamsigns: [
        ...manifest.dreamsigns.map((dreamsign) => ({ ...dreamsign, abilities: NO_ABILITIES })),
        ...contentDreamsignDefinitions(),
        ...(lab.emblems.dreamsigns ?? []),
      ],
    },
    [...contentFigmentDefinitions(), ...lab.figments],
  );
}
