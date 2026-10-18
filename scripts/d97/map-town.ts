// Resolves a map's town (decision P33) for the map inspector and validator
// from the dream that plays it: its town door and cluster, the anchors that
// stand in town (the shop and every quest giver, or the building door to the
// room that holds one) and its exit door.

import type { D97QuestDefinition } from "../../src/content/d97/dialogue/schema.ts";
import type { D97DreamDefinition } from "../../src/content/d97/dreams/schema.ts";
import type { DreamMapDefinition } from "../../src/d97/map/definition.ts";
import type { DreamMapTown } from "../../src/d97/map/layout.ts";
import type { DreamAnchorId, DreamMapId } from "../../src/types/identifiers.ts";

export interface TownCatalog {
  readonly dreams: readonly D97DreamDefinition[];
  readonly maps: readonly DreamMapDefinition[];
  readonly quests: readonly D97QuestDefinition[];
}

/**
 * The town of the dream whose map is `mapId`: null when that dream names no
 * town, undefined when no dream plays the map (a room or an example map).
 */
export function catalogMapTown(mapId: DreamMapId, catalog: TownCatalog): DreamMapTown | null | undefined {
  const dream = catalog.dreams.find((candidate) => candidate.mapId === mapId);
  if (dream === undefined) return undefined;
  if (dream.town === undefined) return null;
  const anchorsOf = (id: DreamMapId) =>
    new Set(catalog.maps.find((map) => map.id === id)?.anchors.map((anchor) => anchor.id) ?? []);
  const onMap = anchorsOf(mapId);
  const rooms = dream.rooms.map((room) => ({ room, anchors: anchorsOf(room.mapId) }));
  /** The anchor itself on the dream's map, or the building door into the room that holds it. */
  const onDreamMap = (anchorId: DreamAnchorId): DreamAnchorId | null =>
    onMap.has(anchorId) ? anchorId : (rooms.find(({ anchors }) => anchors.has(anchorId))?.room.buildingDoorAnchorId ?? null);
  const givers = catalog.quests.map((quest) => quest.giverAnchorId);
  const townAnchorIds = [dream.topology.shopAnchorId, ...givers].flatMap((anchorId) => {
    const resolved = onDreamMap(anchorId);
    return resolved === null ? [] : [resolved];
  });
  return {
    doorAnchorId: dream.town.doorAnchorId,
    cluster: dream.town.cluster,
    townAnchorIds: [...new Set(townAnchorIds)],
    exitDoorAnchorId: onMap.has(dream.topology.exitDoorAnchorId) ? dream.topology.exitDoorAnchorId : null,
  };
}
