/**
 * Synthetic card definitions: test fixtures that exercise engine rules, not
 * catalog content. Their UUIDs use the reserved `5e5e5e5e-` prefix.
 */
import { createCatalog, type EmblemDefinitions, type EngineCardDefinition, type EngineCatalog } from "../catalog";
import {
  contentAvatarDefinitions,
  contentCardDefinitions,
  contentDreamsignDefinitions,
  contentDreamwellDefinitions,
} from "../content-catalog";
import { parseCardId } from "../../types/card-identity";
import { energy } from "../dsl/builders";
import type { CardId } from "../state/ids";

export function syntheticId(index: number): CardId {
  return parseCardId(`5e5e5e5e-0000-4000-8000-${index.toString(16).padStart(12, "0")}`);
}

function character(
  index: number,
  cost: number,
  spark: number,
  options: Partial<Pick<EngineCardDefinition, "speed" | "keywords" | "subtype">> = {},
): EngineCardDefinition {
  return {
    id: syntheticId(index),
    cardType: "character",
    costs: [energy(cost)],
    spark,
    subtype: options.subtype ?? "Warrior",
    speed: options.speed ?? "standard",
    keywords: options.keywords ?? [],
    status: "vanilla",
    abilities: () => [],
  };
}

function event(index: number, cost: number, speed: EngineCardDefinition["speed"]): EngineCardDefinition {
  return {
    id: syntheticId(index),
    cardType: "event",
    costs: [energy(cost)],
    spark: null,
    subtype: "",
    speed,
    keywords: [],
    status: "vanilla",
    abilities: () => [],
  };
}

/** Synthetic definitions by role. */
export const SYNTHETIC = {
  vanilla0: character(1, 0, 0),
  vanilla1: character(2, 1, 1),
  vanilla2: character(3, 2, 2),
  vanilla3: character(4, 3, 3),
  vanilla5: character(5, 5, 5),
  vanilla8: character(6, 6, 8),
  fastCharacter: character(7, 2, 2, { speed: "fast" }),
  interruptCharacter: character(8, 2, 1, { speed: "interrupt" }),
  vengeful1: character(9, 1, 1, { keywords: ["vengeful"] }),
  awakened2: character(10, 2, 2, { keywords: ["awakened"] }),
  event0: event(11, 0, "standard"),
  event1: event(12, 1, "standard"),
  fastEvent: event(13, 1, "fast"),
  interruptEvent: event(14, 1, "interrupt"),
} as const;

export const SYNTHETIC_CARDS: readonly EngineCardDefinition[] = Object.values(SYNTHETIC);

/**
 * A catalog of the given synthetic cards and emblems plus every catalog
 * card, Dreamwell card, avatar, and dreamsign.
 */
export function testCatalog(
  extra: readonly EngineCardDefinition[] = [],
  emblems: EmblemDefinitions = {},
): EngineCatalog {
  return createCatalog(
    [...SYNTHETIC_CARDS, ...extra, ...contentCardDefinitions()],
    contentDreamwellDefinitions(),
    {
      avatars: [...(emblems.avatars ?? []), ...contentAvatarDefinitions()],
      dreamsigns: [...(emblems.dreamsigns ?? []), ...contentDreamsignDefinitions()],
    },
  );
}
