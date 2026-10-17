// Occupants for the development dream: the development recipes at its
// character anchors, with role badges, an incarnation-scale guardian and the
// fixture dialogue (./dev-dialogue.ts), so the character and dialogue
// runtimes can be seen without authored content. Friendlies that speak
// fixture dialogue carry no role badge; their quest icons are derived.

import { DEV_KNIGHT, DEV_VILLAGER, DEV_WOLF } from "../../content/d97/characters/development";
import type { CompiledDreamMap } from "../map/compiled";
import type { BadgeKind } from "./characters/badges";
import { DEV_DIALOGUE_BY_ANCHOR } from "./dev-dialogue";
import type { OverworldOccupant, OverworldOccupants } from "./occupants";

/** Role badges for friendlies without fixture dialogue. */
const FRIENDLY_BADGES: readonly (BadgeKind | null)[] = ["sage", "enhancedGuide"];

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
          dialogue: null,
        });
        challenger += 1;
        break;
      case "guardian":
        occupants.set(anchor.id, { character: DEV_WOLF.id, badge: "boss", scale: "incarnation", dialogue: null });
        break;
      case "shop":
        occupants.set(anchor.id, { character: DEV_VILLAGER.id, badge: "shop", scale: "standard", dialogue: null });
        break;
      case "friendly": {
        const dialogue = DEV_DIALOGUE_BY_ANCHOR.get(anchor.id) ?? null;
        occupants.set(anchor.id, {
          character: friendly % 2 === 0 ? DEV_VILLAGER.id : DEV_KNIGHT.id,
          badge: dialogue === null ? (FRIENDLY_BADGES[friendly % FRIENDLY_BADGES.length] ?? null) : null,
          scale: "standard",
          dialogue,
        });
        friendly += 1;
        break;
      }
      case "townsfolk":
        occupants.set(anchor.id, {
          character: DEV_VILLAGER.id,
          badge: null,
          scale: "standard",
          dialogue: DEV_DIALOGUE_BY_ANCHOR.get(anchor.id) ?? null,
        });
        break;
      default:
        break;
    }
  }
  return occupants;
}
