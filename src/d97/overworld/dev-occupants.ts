// Occupants for the development dream: the development recipes at its
// character anchors, with a badge of every common kind and an
// incarnation-scale guardian, so the character runtime can be seen without
// authored content.

import { DEV_KNIGHT, DEV_VILLAGER, DEV_WOLF } from "../../content/d97/characters/development";
import type { CompiledDreamMap } from "../map/compiled";
import type { BadgeKind } from "./characters/badges";
import type { OverworldOccupant, OverworldOccupants } from "./occupants";

const FRIENDLY_BADGES: readonly (BadgeKind | null)[] = ["questOffer", "sage", "enhancedGuide"];

export function devOccupants(map: CompiledDreamMap): OverworldOccupants {
  const occupants = new Map<CompiledDreamMap["anchors"][number]["id"], OverworldOccupant>();
  let friendly = 0;
  let challenger = 0;
  for (const anchor of map.anchors) {
    switch (anchor.kind) {
      case "challenger":
        occupants.set(anchor.id, {
          character: challenger % 2 === 0 ? DEV_KNIGHT.id : DEV_VILLAGER.id,
          badge: challenger === 3 ? "prizeDuel" : "challenger",
          scale: "standard",
        });
        challenger += 1;
        break;
      case "guardian":
        occupants.set(anchor.id, { character: DEV_WOLF.id, badge: "boss", scale: "incarnation" });
        break;
      case "shop":
        occupants.set(anchor.id, { character: DEV_VILLAGER.id, badge: "shop", scale: "standard" });
        break;
      case "friendly":
        occupants.set(anchor.id, {
          character: friendly % 2 === 0 ? DEV_VILLAGER.id : DEV_KNIGHT.id,
          badge: FRIENDLY_BADGES[friendly % FRIENDLY_BADGES.length] ?? null,
          scale: "standard",
        });
        friendly += 1;
        break;
      case "townsfolk":
        occupants.set(anchor.id, { character: DEV_VILLAGER.id, badge: null, scale: "standard" });
        break;
      default:
        break;
    }
  }
  return occupants;
}
